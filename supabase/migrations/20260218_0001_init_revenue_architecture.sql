create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text not null,
  cnpj text not null unique,
  segmento text,
  email text,
  phone text,
  address_full text,
  city text,
  state text,
  country text default 'Brasil',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address_full text,
  city text,
  state text,
  country text default 'Brasil',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_unit_id uuid references public.company_units(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role_title text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  stage text not null check (stage in ('lead','qualification','proposal','negotiation','closed_won','closed_lost')),
  status text not null default 'open' check (status in ('open','won','lost','on_hold')),
  expected_close_date date,
  estimated_value numeric(14,2) not null default 0,
  close_probability smallint check (close_probability between 0 and 100),
  owner_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_at timestamptz not null default now(),
  changed_by_user_id uuid
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text not null check (category in ('equipment','supplies','service')),
  is_recurring boolean not null default false,
  default_price numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  source_opportunity_id uuid references public.opportunities(id) on delete set null,
  order_number text not null unique,
  order_type text not null check (order_type in ('equipment','supplies','service')),
  status text not null default 'pending' check (status in ('pending','approved','fulfilled','cancelled')),
  order_date date not null default current_date,
  total_amount numeric(14,2) not null default 0,
  recurrence_type text check (recurrence_type in ('none','monthly','quarterly','yearly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  item_description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  total_line_amount numeric(14,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_sales_order_item_id uuid references public.sales_order_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  serial_number text unique,
  install_date date,
  warranty_end_date date,
  location_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_code text not null unique,
  contract_type text not null check (contract_type in ('monthly','one_off')),
  status text not null default 'active' check (status in ('draft','active','paused','cancelled','expired')),
  start_date date not null,
  end_date date,
  billing_frequency text check (billing_frequency in ('monthly','quarterly','yearly','one_off')),
  mrr_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_lines (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.service_contracts(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_schedules (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.service_contracts(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  amount numeric(14,2) not null,
  status text not null default 'pending' check (status in ('pending','paid','overdue','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sla_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  priority text not null check (priority in ('low','medium','high','critical')),
  response_minutes integer not null,
  resolution_minutes integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name, priority)
);

create table if not exists public.service_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_unit_id uuid references public.company_units(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  contract_id uuid references public.service_contracts(id) on delete set null,
  ticket_type text not null check (ticket_type in ('corrective','preventive')),
  priority text not null check (priority in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_customer','closed','cancelled')),
  description text,
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  closed_at timestamptz,
  sla_policy_id uuid references public.sla_policies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_visits (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.service_tickets(id) on delete cascade,
  technician_name text not null,
  checkin_at timestamptz,
  checkout_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.preventive_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  frequency_days integer not null,
  next_due_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.replenishment_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  average_consumption_per_month numeric(12,2),
  reorder_days_before integer default 7,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, product_id)
);

create table if not exists public.event_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  event_name text not null,
  payload jsonb,
  happened_at timestamptz not null default now(),
  actor_user_id uuid
);

create table if not exists public.integration_links (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('omie')),
  local_entity_type text not null,
  local_entity_id uuid not null,
  external_id text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, local_entity_type, local_entity_id),
  unique(provider, local_entity_type, external_id)
);

create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('omie')),
  resource text not null,
  status text not null check (status in ('pending','running','success','error')),
  payload jsonb,
  result jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_company_id on public.contacts(company_id);
create index if not exists idx_opportunities_company_id on public.opportunities(company_id);
create index if not exists idx_opportunities_stage on public.opportunities(stage);
create index if not exists idx_sales_orders_company_id on public.sales_orders(company_id);
create index if not exists idx_service_tickets_company_id on public.service_tickets(company_id);
create index if not exists idx_service_tickets_status on public.service_tickets(status);
create index if not exists idx_service_tickets_due_at on public.service_tickets(due_at);
create index if not exists idx_assets_company_id on public.assets(company_id);
create index if not exists idx_contracts_company_id on public.service_contracts(company_id);
create index if not exists idx_event_log_entity on public.event_log(entity_type, entity_id);

create or replace view public.vw_pipeline_summary as
select
  stage,
  count(*)::integer as total_opportunities,
  sum(estimated_value)::numeric(14,2) as total_estimated_value
from public.opportunities
where status in ('open','won')
group by stage;

create or replace view public.vw_service_sla_summary as
select
  count(*) filter (where status <> 'closed')::integer as open_tickets,
  count(*) filter (where status <> 'closed' and due_at is not null and due_at < now())::integer as overdue_tickets,
  count(*) filter (where status = 'closed' and due_at is not null and closed_at is not null and closed_at <= due_at)::integer as closed_within_sla,
  count(*) filter (where status = 'closed')::integer as total_closed
from public.service_tickets;

create or replace view public.vw_revenue_mix as
select
  order_type,
  count(*)::integer as total_orders,
  sum(total_amount)::numeric(14,2) as total_revenue
from public.sales_orders
group by order_type;

create or replace view public.vw_recurring_revenue as
select
  date_trunc('month', period_start)::date as month,
  sum(amount)::numeric(14,2) as billed_amount,
  count(*)::integer as invoices
from public.billing_schedules
where status in ('pending','paid','overdue')
group by 1;

-- updated_at triggers

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies','company_units','contacts','opportunities','products','sales_orders','sales_order_items','assets',
    'service_contracts','contract_lines','billing_schedules','sla_policies','service_tickets','service_visits',
    'preventive_plans','replenishment_rules','integration_links','sync_jobs'
  ]
  loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%s', t, t);
    execute format('create trigger trg_%s_updated_at before update on public.%s for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;
