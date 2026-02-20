create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'sales' check (role in ('admin','manager','sales','backoffice')),
  status text not null default 'active' check (status in ('active','inactive')),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  invited_at timestamptz,
  last_invite_sent_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_app_users_email_unique
  on public.app_users (lower(email));

create index if not exists idx_app_users_role
  on public.app_users (role);

create index if not exists idx_app_users_status
  on public.app_users (status);

create or replace function public.normalize_app_user_email()
returns trigger
language plpgsql
as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists t_app_users_normalize_email on public.app_users;
create trigger t_app_users_normalize_email
before insert or update on public.app_users
for each row
execute function public.normalize_app_user_email();

drop trigger if exists t_app_users_set_updated_at on public.app_users;
create trigger t_app_users_set_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

alter table public.app_users enable row level security;

drop policy if exists p_app_users_public_all on public.app_users;
drop policy if exists p_app_users_authenticated_all on public.app_users;
