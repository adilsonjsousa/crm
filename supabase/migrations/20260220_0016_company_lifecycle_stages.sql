create table if not exists public.company_lifecycle_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_lifecycle_stages
  drop constraint if exists company_lifecycle_stages_stage_order_check;
alter table public.company_lifecycle_stages
  add constraint company_lifecycle_stages_stage_order_check
  check (stage_order > 0);

create unique index if not exists idx_company_lifecycle_stages_name_unique
  on public.company_lifecycle_stages (lower(name));
create index if not exists idx_company_lifecycle_stages_order
  on public.company_lifecycle_stages (stage_order);

alter table public.companies
  add column if not exists lifecycle_stage_id uuid
  references public.company_lifecycle_stages(id) on delete set null;

create index if not exists idx_companies_lifecycle_stage_id
  on public.companies(lifecycle_stage_id);

insert into public.company_lifecycle_stages (name, stage_order, is_active)
select seed.name, seed.stage_order, seed.is_active
from (
  values
    ('Lead', 1, true),
    ('Oportunidade', 2, true),
    ('Cliente', 3, true)
) as seed(name, stage_order, is_active)
where not exists (select 1 from public.company_lifecycle_stages);

update public.companies
set lifecycle_stage_id = (
  select id
  from public.company_lifecycle_stages
  where is_active = true
  order by stage_order asc, created_at asc
  limit 1
)
where lifecycle_stage_id is null
  and exists (
    select 1
    from public.company_lifecycle_stages
    where is_active = true
  );

create or replace function public.trg_set_default_company_lifecycle_stage()
returns trigger
language plpgsql
as $$
begin
  if new.lifecycle_stage_id is null then
    select id
      into new.lifecycle_stage_id
    from public.company_lifecycle_stages
    where is_active = true
    order by stage_order asc, created_at asc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_companies_set_default_lifecycle_stage on public.companies;
create trigger trg_companies_set_default_lifecycle_stage
before insert on public.companies
for each row execute function public.trg_set_default_company_lifecycle_stage();

alter table public.company_lifecycle_stages enable row level security;

drop policy if exists p_company_lifecycle_stages_authenticated_all on public.company_lifecycle_stages;
create policy p_company_lifecycle_stages_authenticated_all
on public.company_lifecycle_stages
for all to authenticated
using (true)
with check (true);

drop policy if exists p_company_lifecycle_stages_public_all on public.company_lifecycle_stages;
create policy p_company_lifecycle_stages_public_all
on public.company_lifecycle_stages
for all to public
using (true)
with check (true);

drop trigger if exists trg_company_lifecycle_stages_updated_at on public.company_lifecycle_stages;
create trigger trg_company_lifecycle_stages_updated_at
before update on public.company_lifecycle_stages
for each row execute function public.set_updated_at();
