create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  title text not null,
  task_type text not null check (task_type in ('commercial', 'technical')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  due_date date,
  description text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_due_date on public.tasks(due_date);
create index if not exists idx_tasks_company_id on public.tasks(company_id);
create index if not exists idx_tasks_task_type on public.tasks(task_type);

drop trigger if exists trg_tasks_set_updated_at on public.tasks;
create trigger trg_tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

alter table public.tasks enable row level security;

drop policy if exists p_tasks_authenticated_all on public.tasks;
create policy p_tasks_authenticated_all
on public.tasks
for all
to authenticated
using (true)
with check (true);

drop policy if exists p_tasks_public_all on public.tasks;
create policy p_tasks_public_all
on public.tasks
for all
to public
using (true)
with check (true);
