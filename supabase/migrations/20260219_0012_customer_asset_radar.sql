alter table if exists public.assets
  add column if not exists model_name text,
  add column if not exists contract_cost numeric(14,2),
  add column if not exists acquisition_date date,
  add column if not exists notes text;

create table if not exists public.asset_photos (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  photo_url text not null,
  storage_path text,
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists idx_assets_company_created_at on public.assets(company_id, created_at desc);
create index if not exists idx_asset_photos_asset_id on public.asset_photos(asset_id);

alter table public.asset_photos enable row level security;

drop policy if exists p_asset_photos_authenticated_all on public.asset_photos;
create policy p_asset_photos_authenticated_all
on public.asset_photos
for all
to authenticated
using (true)
with check (true);

drop policy if exists p_asset_photos_public_all on public.asset_photos;
create policy p_asset_photos_public_all
on public.asset_photos
for all
to public
using (true)
with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-equipment-photos',
  'customer-equipment-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists p_customer_equipment_photos_public_read on storage.objects;
create policy p_customer_equipment_photos_public_read
on storage.objects
for select
to public
using (bucket_id = 'customer-equipment-photos');

drop policy if exists p_customer_equipment_photos_public_insert on storage.objects;
create policy p_customer_equipment_photos_public_insert
on storage.objects
for insert
to public
with check (bucket_id = 'customer-equipment-photos');

drop policy if exists p_customer_equipment_photos_public_update on storage.objects;
create policy p_customer_equipment_photos_public_update
on storage.objects
for update
to public
using (bucket_id = 'customer-equipment-photos')
with check (bucket_id = 'customer-equipment-photos');

drop policy if exists p_customer_equipment_photos_public_delete on storage.objects;
create policy p_customer_equipment_photos_public_delete
on storage.objects
for delete
to public
using (bucket_id = 'customer-equipment-photos');
