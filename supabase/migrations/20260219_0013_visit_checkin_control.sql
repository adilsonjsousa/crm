alter table public.companies
  add column if not exists checkin_validation_mode text not null default 'geo',
  add column if not exists checkin_radius_meters integer not null default 150,
  add column if not exists checkin_latitude double precision,
  add column if not exists checkin_longitude double precision,
  add column if not exists checkin_pin text;

alter table public.companies
  drop constraint if exists companies_checkin_validation_mode_check;

alter table public.companies
  add constraint companies_checkin_validation_mode_check
  check (checkin_validation_mode in ('geo', 'geo_pin'));

alter table public.companies
  drop constraint if exists companies_checkin_radius_meters_check;

alter table public.companies
  add constraint companies_checkin_radius_meters_check
  check (checkin_radius_meters between 30 and 5000);

alter table public.companies
  drop constraint if exists companies_checkin_coordinates_check;

alter table public.companies
  add constraint companies_checkin_coordinates_check
  check (
    (checkin_latitude is null and checkin_longitude is null)
    or (
      checkin_latitude between -90 and 90
      and checkin_longitude between -180 and 180
    )
  );

alter table public.tasks
  add column if not exists visit_checkin_at timestamptz,
  add column if not exists visit_checkin_latitude double precision,
  add column if not exists visit_checkin_longitude double precision,
  add column if not exists visit_checkin_accuracy_meters numeric(8,2),
  add column if not exists visit_checkin_distance_meters numeric(10,2),
  add column if not exists visit_checkin_method text,
  add column if not exists visit_checkin_note text,
  add column if not exists visit_checkout_at timestamptz,
  add column if not exists visit_checkout_note text;

alter table public.tasks
  drop constraint if exists tasks_visit_checkin_method_check;

alter table public.tasks
  add constraint tasks_visit_checkin_method_check
  check (
    visit_checkin_method is null
    or visit_checkin_method in ('geo', 'geo_pin')
  );

alter table public.tasks
  drop constraint if exists tasks_visit_checkin_checkout_check;

alter table public.tasks
  add constraint tasks_visit_checkin_checkout_check
  check (
    visit_checkin_at is null
    or visit_checkout_at is null
    or visit_checkout_at >= visit_checkin_at
  );

create index if not exists idx_tasks_visit_checkin_at on public.tasks(visit_checkin_at);
create index if not exists idx_tasks_visit_checkout_at on public.tasks(visit_checkout_at);
