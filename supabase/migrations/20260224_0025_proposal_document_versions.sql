create table if not exists public.proposal_document_versions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  version_number integer not null,
  event_type text not null,
  output_format text not null,
  file_name text,
  proposal_number text,
  template_id uuid references public.proposal_templates(id) on delete set null,
  template_name text,
  created_by_user_id uuid,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proposal_document_versions
  drop constraint if exists proposal_document_versions_version_number_check;
alter table public.proposal_document_versions
  add constraint proposal_document_versions_version_number_check
  check (version_number > 0);

alter table public.proposal_document_versions
  drop constraint if exists proposal_document_versions_event_type_check;
alter table public.proposal_document_versions
  add constraint proposal_document_versions_event_type_check
  check (event_type in ('manual_save', 'export_docx', 'export_pdf', 'send_email', 'send_whatsapp'));

alter table public.proposal_document_versions
  drop constraint if exists proposal_document_versions_output_format_check;
alter table public.proposal_document_versions
  add constraint proposal_document_versions_output_format_check
  check (output_format in ('snapshot', 'docx', 'pdf', 'email', 'whatsapp'));

alter table public.proposal_document_versions
  drop constraint if exists proposal_document_versions_snapshot_object_check;
alter table public.proposal_document_versions
  add constraint proposal_document_versions_snapshot_object_check
  check (jsonb_typeof(snapshot) = 'object');

create unique index if not exists proposal_document_versions_unique_per_opportunity_version
  on public.proposal_document_versions (opportunity_id, version_number);

create index if not exists proposal_document_versions_opportunity_created_at_idx
  on public.proposal_document_versions (opportunity_id, created_at desc);

create index if not exists proposal_document_versions_company_created_at_idx
  on public.proposal_document_versions (company_id, created_at desc);

create index if not exists proposal_document_versions_event_created_at_idx
  on public.proposal_document_versions (event_type, created_at desc);

alter table public.proposal_document_versions enable row level security;

drop policy if exists p_proposal_document_versions_authenticated_all on public.proposal_document_versions;
create policy p_proposal_document_versions_authenticated_all
on public.proposal_document_versions
for all to authenticated
using (true)
with check (true);

drop policy if exists p_proposal_document_versions_public_all on public.proposal_document_versions;
create policy p_proposal_document_versions_public_all
on public.proposal_document_versions
for all to public
using (true)
with check (true);

drop trigger if exists trg_proposal_document_versions_updated_at on public.proposal_document_versions;
create trigger trg_proposal_document_versions_updated_at
before update on public.proposal_document_versions
for each row execute function public.set_updated_at();
