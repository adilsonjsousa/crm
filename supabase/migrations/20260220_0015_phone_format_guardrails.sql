-- Guardrails to keep all phone fields in Brazilian mask:
-- fixed:  (DD) 1234-1234
-- mobile: (DD) 12345-1234

create or replace function public.format_br_phone(raw_value text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select regexp_replace(coalesce(raw_value, ''), '[^0-9]', '', 'g') as digits
  ),
  local_digits as (
    select
      case
        when digits = '' then null
        when digits ~ '^0055[0-9]{10,11}$' then substring(digits from 5)
        when digits ~ '^055[0-9]{10,11}$' then substring(digits from 4)
        when digits ~ '^55[0-9]{10,11}$' then substring(digits from 3)
        when digits ~ '^0[0-9]{2}[0-9]{10,11}$' then substring(digits from 4)
        when digits ~ '^0[0-9]{10,11}$' then substring(digits from 2)
        when digits ~ '^[0-9]{10,11}$' then digits
        else null
      end as value
    from cleaned
  )
  select
    case
      when value ~ '^[0-9]{10}$'
        then format(
          '(%s) %s-%s',
          substring(value from 1 for 2),
          substring(value from 3 for 4),
          substring(value from 7 for 4)
        )
      when value ~ '^[0-9]{11}$'
        then format(
          '(%s) %s-%s',
          substring(value from 1 for 2),
          substring(value from 3 for 5),
          substring(value from 8 for 4)
        )
      else null
    end
  from local_digits;
$$;

create or replace function public.normalize_br_phone_for_storage(raw_value text)
returns text
language sql
immutable
as $$
  select
    case
      when raw_value is null or btrim(raw_value) = '' then null
      when public.format_br_phone(raw_value) is not null then public.format_br_phone(raw_value)
      else btrim(raw_value)
    end;
$$;

create or replace function public.trg_normalize_phone_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'companies' then
    new.phone := public.normalize_br_phone_for_storage(new.phone);
  elsif tg_table_name = 'contacts' then
    new.phone := public.normalize_br_phone_for_storage(new.phone);
    new.whatsapp := public.normalize_br_phone_for_storage(new.whatsapp);
  elsif tg_table_name = 'company_interactions' then
    new.phone_number := public.normalize_br_phone_for_storage(new.phone_number);
    new.whatsapp_number := public.normalize_br_phone_for_storage(new.whatsapp_number);
  end if;

  return new;
end;
$$;

-- Normalize existing rows (including recently inserted records).
update public.companies
set phone = public.normalize_br_phone_for_storage(phone);

update public.contacts
set
  phone = public.normalize_br_phone_for_storage(phone),
  whatsapp = public.normalize_br_phone_for_storage(whatsapp);

update public.company_interactions
set
  phone_number = public.normalize_br_phone_for_storage(phone_number),
  whatsapp_number = public.normalize_br_phone_for_storage(whatsapp_number);

-- Enforce format.
alter table public.companies
  drop constraint if exists companies_phone_br_format_check;
alter table public.companies
  add constraint companies_phone_br_format_check
  check (phone is null or phone ~ '^\(\d{2}\)\s\d{4,5}-\d{4}$');

alter table public.contacts
  drop constraint if exists contacts_phone_br_format_check;
alter table public.contacts
  add constraint contacts_phone_br_format_check
  check (phone is null or phone ~ '^\(\d{2}\)\s\d{4,5}-\d{4}$');

alter table public.contacts
  drop constraint if exists contacts_whatsapp_br_format_check;
alter table public.contacts
  add constraint contacts_whatsapp_br_format_check
  check (whatsapp is null or whatsapp ~ '^\(\d{2}\)\s\d{4,5}-\d{4}$');

alter table public.company_interactions
  drop constraint if exists company_interactions_phone_number_br_format_check;
alter table public.company_interactions
  add constraint company_interactions_phone_number_br_format_check
  check (phone_number is null or phone_number ~ '^\(\d{2}\)\s\d{4,5}-\d{4}$');

alter table public.company_interactions
  drop constraint if exists company_interactions_whatsapp_number_br_format_check;
alter table public.company_interactions
  add constraint company_interactions_whatsapp_number_br_format_check
  check (whatsapp_number is null or whatsapp_number ~ '^\(\d{2}\)\s\d{4,5}-\d{4}$');

-- Automatic normalization on insert/update.
drop trigger if exists trg_companies_normalize_phone_fields on public.companies;
create trigger trg_companies_normalize_phone_fields
before insert or update on public.companies
for each row execute function public.trg_normalize_phone_fields();

drop trigger if exists trg_contacts_normalize_phone_fields on public.contacts;
create trigger trg_contacts_normalize_phone_fields
before insert or update on public.contacts
for each row execute function public.trg_normalize_phone_fields();

drop trigger if exists trg_company_interactions_normalize_phone_fields on public.company_interactions;
create trigger trg_company_interactions_normalize_phone_fields
before insert or update on public.company_interactions
for each row execute function public.trg_normalize_phone_fields();
