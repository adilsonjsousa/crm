alter table public.tasks
  add column if not exists meeting_provider text,
  add column if not exists meeting_external_id text,
  add column if not exists meeting_join_url text,
  add column if not exists meeting_start_at timestamptz,
  add column if not exists meeting_end_at timestamptz,
  add column if not exists meeting_attendees jsonb not null default '[]'::jsonb,
  add column if not exists meeting_status text,
  add column if not exists meeting_last_sent_at timestamptz;

alter table public.tasks
  drop constraint if exists tasks_meeting_provider_check;

alter table public.tasks
  add constraint tasks_meeting_provider_check
  check (
    meeting_provider is null
    or meeting_provider in ('google_meet', 'microsoft_teams')
  );

alter table public.tasks
  drop constraint if exists tasks_meeting_status_check;

alter table public.tasks
  add constraint tasks_meeting_status_check
  check (
    meeting_status is null
    or meeting_status in ('scheduled', 'cancelled')
  );

alter table public.tasks
  drop constraint if exists tasks_meeting_schedule_range_check;

alter table public.tasks
  add constraint tasks_meeting_schedule_range_check
  check (
    meeting_start_at is null
    or meeting_end_at is null
    or meeting_end_at >= meeting_start_at
  );

alter table public.tasks
  drop constraint if exists tasks_meeting_attendees_array_check;

alter table public.tasks
  add constraint tasks_meeting_attendees_array_check
  check (jsonb_typeof(meeting_attendees) = 'array');

create index if not exists idx_tasks_meeting_start_at on public.tasks(meeting_start_at);
create index if not exists idx_tasks_meeting_status on public.tasks(meeting_status);
