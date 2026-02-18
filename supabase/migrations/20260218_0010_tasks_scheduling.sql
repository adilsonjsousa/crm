alter table public.tasks
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz;

create index if not exists idx_tasks_scheduled_start_at on public.tasks(scheduled_start_at);

alter table public.tasks
  drop constraint if exists tasks_schedule_range_check;

alter table public.tasks
  add constraint tasks_schedule_range_check
  check (
    scheduled_start_at is null
    or scheduled_end_at is null
    or scheduled_end_at >= scheduled_start_at
  );
