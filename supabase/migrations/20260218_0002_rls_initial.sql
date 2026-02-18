-- Política inicial: usuários autenticados com acesso completo.
-- Em produção, substituir por políticas por perfil/tenant.

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
    execute format(
      'create policy p_%s_authenticated_all on public.%s for all to authenticated using (true) with check (true)',
      t,
      t
    );
  end loop;
end $$;
