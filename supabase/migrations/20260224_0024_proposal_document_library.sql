create table if not exists public.proposal_product_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  proposal_type text,
  product_code text,
  product_name text not null,
  headline text,
  intro_text text,
  technical_text text,
  video_url text,
  included_accessories text,
  optional_accessories text,
  base_price numeric(14,2) not null default 0,
  notes text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proposal_product_profiles
  drop constraint if exists proposal_product_profiles_proposal_type_check;
alter table public.proposal_product_profiles
  add constraint proposal_product_profiles_proposal_type_check
  check (proposal_type is null or proposal_type in ('equipment', 'supplies', 'service'));

alter table public.proposal_product_profiles
  drop constraint if exists proposal_product_profiles_sort_order_check;
alter table public.proposal_product_profiles
  add constraint proposal_product_profiles_sort_order_check
  check (sort_order > 0);

alter table public.proposal_product_profiles
  drop constraint if exists proposal_product_profiles_product_name_not_empty;
alter table public.proposal_product_profiles
  add constraint proposal_product_profiles_product_name_not_empty
  check (btrim(coalesce(product_name, '')) <> '');

create unique index if not exists proposal_product_profiles_name_unique_idx
  on public.proposal_product_profiles (lower(name));

create index if not exists proposal_product_profiles_active_idx
  on public.proposal_product_profiles (is_active, proposal_type, sort_order);

create table if not exists public.proposal_cpp_rows (
  id uuid primary key default gen_random_uuid(),
  product_profile_id uuid not null references public.proposal_product_profiles(id) on delete cascade,
  section text not null,
  item_name text not null,
  manufacturer_durability text,
  graphic_durability text,
  item_value numeric(14,2),
  cpp_cost numeric(14,5),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proposal_cpp_rows
  drop constraint if exists proposal_cpp_rows_section_check;
alter table public.proposal_cpp_rows
  add constraint proposal_cpp_rows_section_check
  check (section in ('toner', 'components'));

alter table public.proposal_cpp_rows
  drop constraint if exists proposal_cpp_rows_sort_order_check;
alter table public.proposal_cpp_rows
  add constraint proposal_cpp_rows_sort_order_check
  check (sort_order > 0);

alter table public.proposal_cpp_rows
  drop constraint if exists proposal_cpp_rows_item_name_not_empty;
alter table public.proposal_cpp_rows
  add constraint proposal_cpp_rows_item_name_not_empty
  check (btrim(coalesce(item_name, '')) <> '');

create index if not exists proposal_cpp_rows_profile_idx
  on public.proposal_cpp_rows (product_profile_id, section, sort_order, created_at);

create table if not exists public.proposal_commercial_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payment_terms text,
  included_offer text,
  excluded_offer text,
  financing_terms text,
  closing_text text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proposal_commercial_terms
  drop constraint if exists proposal_commercial_terms_sort_order_check;
alter table public.proposal_commercial_terms
  add constraint proposal_commercial_terms_sort_order_check
  check (sort_order > 0);

create unique index if not exists proposal_commercial_terms_name_unique_idx
  on public.proposal_commercial_terms (lower(name));

create unique index if not exists proposal_commercial_terms_single_default_idx
  on public.proposal_commercial_terms (is_default)
  where is_default;

create index if not exists proposal_commercial_terms_active_idx
  on public.proposal_commercial_terms (is_active, sort_order, created_at);

insert into public.proposal_product_profiles (
  name,
  proposal_type,
  product_code,
  product_name,
  headline,
  intro_text,
  technical_text,
  video_url,
  included_accessories,
  optional_accessories,
  base_price,
  notes,
  is_active,
  sort_order
)
select
  'Canon imagePRESS V700 PS + POD Deck',
  'equipment',
  'V700-PS-POD',
  'Canon imagePRESS V700 + Servidor Canon PS + POD Deck Lite C1',
  'Eleve a qualidade e produtividade da sua gráfica a outro patamar',
  'Líder mundial em sistemas de impressão, a Canon entrega robustez, estabilidade de cor e produtividade para operações gráficas exigentes. A ArtPrinter oferece suporte premium com implantação e treinamento operacional.',
  'Plataforma color de alta produtividade, até 70 ppm, formatos até 330x487 mm e banner 330x1300 mm, gramatura de 52 a 350 g/m2, espectrofotômetro em linha e calibração automática de cor.',
  'https://www.youtube.com/watch?v=F1HIW4ppwsA&t=2s',
  'Servidor de Impressão Canon PS\nPOD Deck Lite C1 + 3.500 folhas\nAlimentador Lateral ByPASS C1 Tray',
  'Fretes e içamentos\nKits iniciais de toner\nTransformadores e estabilizadores (quando necessários)',
  164506.76,
  'Perfil técnico inicial para propostas de linha imagePRESS V700 com PS + POD Deck.',
  true,
  120
where not exists (
  select 1 from public.proposal_product_profiles
);

insert into public.proposal_cpp_rows (
  product_profile_id,
  section,
  item_name,
  manufacturer_durability,
  graphic_durability,
  item_value,
  cpp_cost,
  sort_order,
  is_active
)
select
  profile.id,
  seed.section,
  seed.item_name,
  seed.manufacturer_durability,
  seed.graphic_durability,
  seed.item_value,
  seed.cpp_cost,
  seed.sort_order,
  true
from public.proposal_product_profiles profile
join (
  values
    ('toner','Toner T01 Preto','39.500 páginas','39.500 páginas',1293.07,0.04075,10),
    ('toner','Toner T01 Amarelo','39.500 páginas','22.383 páginas',1008.76,0.04507,20),
    ('toner','Toner T01 Cyan','39.500 páginas','22.383 páginas',1008.76,0.04507,30),
    ('toner','Toner T01 Magenta','31.733 páginas','22.383 páginas',1008.76,0.04507,40),
    ('components','Cilindro D01 Preto','918.000 pgs','600.000 páginas',6003.75,0.01000,110),
    ('components','Cilindro D01 Amarelo','404.000 pgs','350.000 páginas',4056.08,0.01159,120),
    ('components','Cilindro D01 Cyan','404.000 pgs','350.000 páginas',4056.08,0.01159,130),
    ('components','Cilindro D01 Magenta','404.000 pgs','350.000 páginas',4056.08,0.01159,140),
    ('components','Belt ITB','500.000 pgs','350.000 páginas',6233.25,0.01781,150),
    ('components','Unidade Fixação Inferior','350.000 pgs','250.000 páginas',9222.53,0.03689,160),
    ('components','Unidade Pressão Superior','350.000 pgs','250.000 páginas',5266.09,0.02106,170)
) as seed(section, item_name, manufacturer_durability, graphic_durability, item_value, cpp_cost, sort_order)
  on true
where lower(profile.name) = lower('Canon imagePRESS V700 PS + POD Deck')
  and not exists (
    select 1 from public.proposal_cpp_rows existing
    where existing.product_profile_id = profile.id
  );

insert into public.proposal_commercial_terms (
  name,
  payment_terms,
  included_offer,
  excluded_offer,
  financing_terms,
  closing_text,
  is_default,
  is_active,
  sort_order
)
select
  'Condições Padrão ArtPrinter',
  'À vista\nConvênios financeiros disponíveis sujeitos a aprovação de crédito\nConsulte condições de financiamentos.',
  'Instalação\nTreinamento aos operadores\nSuporte Premium ArtPrinter por 90 dias',
  'Fretes e içamentos\nKits iniciais de toner\nTransformadores e estabilizadores (quando necessários)',
  'Simulação de financiamento e leasing sob consulta, conforme perfil de crédito.',
  'Entendemos que negócios duradouros se sustentam no tripé da Confiança, Compromisso e Proximidade. Nossa fortaleza está em selecionar os melhores equipamentos e oferecer suporte técnico com agilidade e excelência.',
  true,
  true,
  100
where not exists (
  select 1 from public.proposal_commercial_terms
);

alter table public.proposal_product_profiles enable row level security;
alter table public.proposal_cpp_rows enable row level security;
alter table public.proposal_commercial_terms enable row level security;

drop policy if exists p_proposal_product_profiles_authenticated_all on public.proposal_product_profiles;
create policy p_proposal_product_profiles_authenticated_all
on public.proposal_product_profiles
for all to authenticated
using (true)
with check (true);

drop policy if exists p_proposal_product_profiles_public_all on public.proposal_product_profiles;
create policy p_proposal_product_profiles_public_all
on public.proposal_product_profiles
for all to public
using (true)
with check (true);

drop policy if exists p_proposal_cpp_rows_authenticated_all on public.proposal_cpp_rows;
create policy p_proposal_cpp_rows_authenticated_all
on public.proposal_cpp_rows
for all to authenticated
using (true)
with check (true);

drop policy if exists p_proposal_cpp_rows_public_all on public.proposal_cpp_rows;
create policy p_proposal_cpp_rows_public_all
on public.proposal_cpp_rows
for all to public
using (true)
with check (true);

drop policy if exists p_proposal_commercial_terms_authenticated_all on public.proposal_commercial_terms;
create policy p_proposal_commercial_terms_authenticated_all
on public.proposal_commercial_terms
for all to authenticated
using (true)
with check (true);

drop policy if exists p_proposal_commercial_terms_public_all on public.proposal_commercial_terms;
create policy p_proposal_commercial_terms_public_all
on public.proposal_commercial_terms
for all to public
using (true)
with check (true);

drop trigger if exists trg_proposal_product_profiles_updated_at on public.proposal_product_profiles;
create trigger trg_proposal_product_profiles_updated_at
before update on public.proposal_product_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_proposal_cpp_rows_updated_at on public.proposal_cpp_rows;
create trigger trg_proposal_cpp_rows_updated_at
before update on public.proposal_cpp_rows
for each row execute function public.set_updated_at();

drop trigger if exists trg_proposal_commercial_terms_updated_at on public.proposal_commercial_terms;
create trigger trg_proposal_commercial_terms_updated_at
before update on public.proposal_commercial_terms
for each row execute function public.set_updated_at();
