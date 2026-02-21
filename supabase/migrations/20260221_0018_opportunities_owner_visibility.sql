create index if not exists idx_opportunities_owner_user_id
  on public.opportunities(owner_user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'opportunities_owner_user_id_fkey'
      and conrelid = 'public.opportunities'::regclass
  ) then
    alter table public.opportunities
      add constraint opportunities_owner_user_id_fkey
      foreign key (owner_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end $$;
