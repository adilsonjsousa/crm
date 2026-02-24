alter table public.opportunities
  add column if not exists line_items jsonb not null default '[]'::jsonb;

alter table public.opportunities
  drop constraint if exists opportunities_line_items_is_array;

alter table public.opportunities
  add constraint opportunities_line_items_is_array
  check (jsonb_typeof(line_items) = 'array');
