-- Add @helyo.com.br to allowed workspace domains.

create or replace function public.is_allowed_workspace_domain()
returns boolean
language sql
stable
as $$
  select auth.role() = 'authenticated'
    and public.auth_email_domain() in ('artprinter.com.br', 'artestampa.com.br', 'helyo.com.br');
$$;
