-- Remove etapa STAND-BY do pipeline comercial.
-- Qualquer oportunidade antiga nessa etapa passa para FOLLOW-UP.

update public.opportunities
set stage = 'follow_up'
where stage = 'stand_by';

update public.opportunity_stage_history
set from_stage = 'follow_up'
where from_stage = 'stand_by';

update public.opportunity_stage_history
set to_stage = 'follow_up'
where to_stage = 'stand_by';

alter table public.opportunities
drop constraint if exists opportunities_stage_check;

alter table public.opportunities
add constraint opportunities_stage_check
check (stage in ('lead', 'qualificacao', 'proposta', 'follow_up', 'ganho', 'perdido'));
