alter table public.contacts
add column if not exists whatsapp text;

alter table public.contacts
add column if not exists birth_date date;
