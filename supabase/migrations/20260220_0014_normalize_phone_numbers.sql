-- Normalize existing phone fields to Brazilian mask:
-- fixed:  (DD) 1234-1234
-- mobile: (DD) 12345-1234

create or replace function public._tmp_format_br_phone(raw_value text)
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
        when digits ~ '^55[0-9]{10,11}$' then substring(digits from 3)
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

-- Convert empty strings to NULL first.
update public.companies
set phone = null
where phone is not null
  and btrim(phone) = '';

update public.contacts
set phone = null
where phone is not null
  and btrim(phone) = '';

update public.contacts
set whatsapp = null
where whatsapp is not null
  and btrim(whatsapp) = '';

update public.company_interactions
set phone_number = null
where phone_number is not null
  and btrim(phone_number) = '';

update public.company_interactions
set whatsapp_number = null
where whatsapp_number is not null
  and btrim(whatsapp_number) = '';

-- Apply BR formatting where convertible.
update public.companies as c
set phone = public._tmp_format_br_phone(c.phone)
where c.phone is not null
  and public._tmp_format_br_phone(c.phone) is not null
  and c.phone is distinct from public._tmp_format_br_phone(c.phone);

update public.contacts as c
set phone = public._tmp_format_br_phone(c.phone)
where c.phone is not null
  and public._tmp_format_br_phone(c.phone) is not null
  and c.phone is distinct from public._tmp_format_br_phone(c.phone);

update public.contacts as c
set whatsapp = public._tmp_format_br_phone(c.whatsapp)
where c.whatsapp is not null
  and public._tmp_format_br_phone(c.whatsapp) is not null
  and c.whatsapp is distinct from public._tmp_format_br_phone(c.whatsapp);

update public.company_interactions as i
set phone_number = public._tmp_format_br_phone(i.phone_number)
where i.phone_number is not null
  and public._tmp_format_br_phone(i.phone_number) is not null
  and i.phone_number is distinct from public._tmp_format_br_phone(i.phone_number);

update public.company_interactions as i
set whatsapp_number = public._tmp_format_br_phone(i.whatsapp_number)
where i.whatsapp_number is not null
  and public._tmp_format_br_phone(i.whatsapp_number) is not null
  and i.whatsapp_number is distinct from public._tmp_format_br_phone(i.whatsapp_number);

drop function if exists public._tmp_format_br_phone(text);
