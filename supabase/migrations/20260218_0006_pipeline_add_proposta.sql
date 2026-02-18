alter table public.opportunities
drop constraint if exists opportunities_stage_check;

alter table public.opportunities
add constraint opportunities_stage_check
check (stage in ('lead', 'qualificacao', 'follow_up', 'proposta', 'stand_by', 'ganho', 'perdido'));
