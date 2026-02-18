create table if not exists public.company_interactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  interaction_type text not null check (interaction_type in ('whatsapp', 'call', 'note')),
  direction text check (direction in ('inbound', 'outbound')),
  subject text,
  content text not null,
  whatsapp_number text,
  phone_number text,
  occurred_at timestamptz not null default now(),
  provider text,
  provider_conversation_id text,
  provider_call_id text,
  recording_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_interactions_contact_by_type check (
    (
      interaction_type = 'whatsapp'
      and coalesce(nullif(btrim(whatsapp_number), ''), nullif(btrim(phone_number), '')) is not null
    )
    or (
      interaction_type = 'call'
      and coalesce(nullif(btrim(phone_number), ''), nullif(btrim(whatsapp_number), '')) is not null
    )
    or interaction_type = 'note'
  )
);

create index if not exists idx_company_interactions_company_id on public.company_interactions(company_id);
create index if not exists idx_company_interactions_contact_id on public.company_interactions(contact_id);
create index if not exists idx_company_interactions_type on public.company_interactions(interaction_type);
create index if not exists idx_company_interactions_occurred_at on public.company_interactions(occurred_at desc);

drop trigger if exists trg_company_interactions_set_updated_at on public.company_interactions;
create trigger trg_company_interactions_set_updated_at
before update on public.company_interactions
for each row
execute function public.set_updated_at();

alter table public.company_interactions enable row level security;

drop policy if exists p_company_interactions_authenticated_all on public.company_interactions;
create policy p_company_interactions_authenticated_all
on public.company_interactions
for all
to authenticated
using (true)
with check (true);

drop policy if exists p_company_interactions_public_all on public.company_interactions;
create policy p_company_interactions_public_all
on public.company_interactions
for all
to public
using (true)
with check (true);
