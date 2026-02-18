insert into public.sla_policies (name, priority, response_minutes, resolution_minutes)
values
  ('Padrao', 'low', 240, 2880),
  ('Padrao', 'medium', 120, 1440),
  ('Padrao', 'high', 60, 480),
  ('Padrao', 'critical', 30, 240)
on conflict (name, priority) do update
set
  response_minutes = excluded.response_minutes,
  resolution_minutes = excluded.resolution_minutes;
