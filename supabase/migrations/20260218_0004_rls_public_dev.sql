-- DEV ONLY: libera acesso para role anon/public enquanto o fluxo de auth nao esta pronto.
-- Quando autenticação e permissionamento estiverem ativos, substituir por políticas por tenant/perfil.

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies','company_units','contacts','opportunities','opportunity_stage_history','products',
    'sales_orders','sales_order_items','assets','service_contracts','contract_lines','billing_schedules',
    'sla_policies','service_tickets','service_visits','preventive_plans','replenishment_rules',
    'event_log','integration_links','sync_jobs'
  ]
  loop
    execute format('alter table public.%s enable row level security', t);
    execute format('drop policy if exists p_%s_authenticated_all on public.%s', t, t);
    execute format('drop policy if exists p_%s_public_all on public.%s', t, t);
    execute format(
      'create policy p_%s_public_all on public.%s for all to public using (true) with check (true)',
      t,
      t
    );
  end loop;
end $$;
