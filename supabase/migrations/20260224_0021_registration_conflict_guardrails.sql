-- Stabilize registry writes for companies, contacts and pipeline.
-- Goals:
-- 1) Canonical CNPJ storage and uniqueness by normalized digits.
-- 2) Avoid duplicated contacts in the same company by WhatsApp.
-- 3) Avoid duplicated open opportunities for same owner/company/title/stage.

create or replace function public.format_br_cnpj(raw_value text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(coalesce(raw_value, ''), '[^0-9]', '', 'g') as digits
  )
  select
    case
      when digits ~ '^[0-9]{14}$'
        then format(
          '%s.%s.%s/%s-%s',
          substring(digits from 1 for 2),
          substring(digits from 3 for 3),
          substring(digits from 6 for 3),
          substring(digits from 9 for 4),
          substring(digits from 13 for 2)
        )
      else null
    end
  from cleaned;
$$;

create or replace function public.normalize_cnpj_for_storage(raw_value text)
returns text
language sql
immutable
as $$
  select
    case
      when raw_value is null or btrim(raw_value) = '' then null
      when public.format_br_cnpj(raw_value) is not null then public.format_br_cnpj(raw_value)
      else btrim(raw_value)
    end;
$$;

create or replace function public.trg_normalize_company_identity_fields()
returns trigger
language plpgsql
as $$
begin
  new.cnpj := public.normalize_cnpj_for_storage(new.cnpj);

  if new.legal_name is not null then
    new.legal_name := nullif(regexp_replace(btrim(new.legal_name), '\s+', ' ', 'g'), '');
  end if;

  if new.trade_name is not null then
    new.trade_name := nullif(regexp_replace(btrim(new.trade_name), '\s+', ' ', 'g'), '');
  end if;

  if new.city is not null then
    new.city := nullif(upper(regexp_replace(btrim(new.city), '\s+', ' ', 'g')), '');
  end if;

  if new.state is not null then
    new.state := nullif(upper(btrim(new.state)), '');
  end if;

  if new.address_full is not null then
    new.address_full := nullif(regexp_replace(btrim(new.address_full), '\s+', ' ', 'g'), '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_companies_normalize_identity_fields on public.companies;
create trigger trg_companies_normalize_identity_fields
before insert or update on public.companies
for each row execute function public.trg_normalize_company_identity_fields();

update public.companies
set
  cnpj = public.normalize_cnpj_for_storage(cnpj),
  legal_name = nullif(regexp_replace(btrim(coalesce(legal_name, '')), '\s+', ' ', 'g'), ''),
  trade_name = nullif(regexp_replace(btrim(coalesce(trade_name, '')), '\s+', ' ', 'g'), ''),
  city = nullif(upper(regexp_replace(btrim(coalesce(city, '')), '\s+', ' ', 'g')), ''),
  state = nullif(upper(btrim(coalesce(state, ''))), ''),
  address_full = nullif(regexp_replace(btrim(coalesce(address_full, '')), '\s+', ' ', 'g'), '');

update public.contacts
set
  full_name = regexp_replace(btrim(coalesce(full_name, '')), '\s+', ' ', 'g'),
  email = nullif(lower(btrim(coalesce(email, ''))), '');

update public.opportunities
set title = regexp_replace(btrim(coalesce(title, '')), '\s+', ' ', 'g');

create unique index if not exists companies_cnpj_digits_14_unique_idx
on public.companies ((regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g')))
where regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g') ~ '^[0-9]{14}$';

create unique index if not exists contacts_company_whatsapp_digits_unique_idx
on public.contacts (
  coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
  (regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g'))
)
where regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g') <> '';

create unique index if not exists opportunities_open_owner_company_title_stage_unique_idx
on public.opportunities (
  coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  company_id,
  lower(btrim(coalesce(title, ''))),
  stage
)
where status = 'open' and btrim(coalesce(title, '')) <> '';
