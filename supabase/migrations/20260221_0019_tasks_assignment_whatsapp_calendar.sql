alter table public.app_users
  add column if not exists whatsapp text;

update public.app_users
set whatsapp = public.normalize_br_phone_for_storage(whatsapp);

alter table public.app_users
  drop constraint if exists app_users_whatsapp_br_format_check;
alter table public.app_users
  add constraint app_users_whatsapp_br_format_check
  check (whatsapp is null or whatsapp ~ '^\(\d{2}\)\s\d{4,5}-\d{4}$');

create or replace function public.normalize_app_user_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(new.email));
  new.whatsapp := public.normalize_br_phone_for_storage(new.whatsapp);
  return new;
end;
$$;

alter table public.tasks
  add column if not exists assignee_user_id uuid,
  add column if not exists created_by_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_assignee_user_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_assignee_user_id_fkey
      foreign key (assignee_user_id)
      references public.app_users(user_id)
      on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_created_by_user_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_created_by_user_id_fkey
      foreign key (created_by_user_id)
      references public.app_users(user_id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_tasks_assignee_user_id on public.tasks(assignee_user_id);
create index if not exists idx_tasks_created_by_user_id on public.tasks(created_by_user_id);
create index if not exists idx_tasks_assignee_schedule on public.tasks(assignee_user_id, scheduled_start_at);
