-- Enforce Google Workspace domain access at database policy level.
-- Allowed domains: @artprinter.com.br and @artestampa.com.br

create or replace function public.auth_email_domain()
returns text
language sql
stable
as $$
  select lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2));
$$;

create or replace function public.is_allowed_workspace_domain()
returns boolean
language sql
stable
as $$
  select auth.role() = 'authenticated'
    and public.auth_email_domain() in ('artprinter.com.br', 'artestampa.com.br');
$$;

do $$
declare
  t record;
  policy_public text;
  policy_auth text;
  policy_domain text;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    policy_public := 'p_' || t.tablename || '_public_all';
    policy_auth := 'p_' || t.tablename || '_authenticated_all';
    policy_domain := 'p_' || t.tablename || '_domain_authenticated_all';

    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('drop policy if exists %I on public.%I', policy_public, t.tablename);
    execute format('drop policy if exists %I on public.%I', policy_auth, t.tablename);
    execute format('drop policy if exists %I on public.%I', policy_domain, t.tablename);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_allowed_workspace_domain()) with check (public.is_allowed_workspace_domain())',
      policy_domain,
      t.tablename
    );
  end loop;
end $$;

-- Restrict customer equipment photos bucket to authenticated users in allowed domains.
drop policy if exists p_customer_equipment_photos_public_read on storage.objects;
create policy p_customer_equipment_photos_public_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-equipment-photos'
  and public.is_allowed_workspace_domain()
);

drop policy if exists p_customer_equipment_photos_public_insert on storage.objects;
create policy p_customer_equipment_photos_public_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'customer-equipment-photos'
  and public.is_allowed_workspace_domain()
);

drop policy if exists p_customer_equipment_photos_public_update on storage.objects;
create policy p_customer_equipment_photos_public_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'customer-equipment-photos'
  and public.is_allowed_workspace_domain()
)
with check (
  bucket_id = 'customer-equipment-photos'
  and public.is_allowed_workspace_domain()
);

drop policy if exists p_customer_equipment_photos_public_delete on storage.objects;
create policy p_customer_equipment_photos_public_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-equipment-photos'
  and public.is_allowed_workspace_domain()
);
