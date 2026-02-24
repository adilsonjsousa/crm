alter table public.proposal_product_profiles
  add column if not exists product_subcategory text;

alter table public.proposal_product_profiles
  drop constraint if exists proposal_product_profiles_product_subcategory_not_empty;
alter table public.proposal_product_profiles
  add constraint proposal_product_profiles_product_subcategory_not_empty
  check (product_subcategory is null or btrim(product_subcategory) <> '');

create index if not exists proposal_product_profiles_subcategory_idx
  on public.proposal_product_profiles (proposal_type, product_subcategory);
