-- Normaliza etapas antigas para o novo pipeline comercial.
update public.opportunities
set stage = case stage
  when 'qualification' then 'qualificacao'
  when 'proposal' then 'follow_up'
  when 'negotiation' then 'stand_by'
  when 'closed_won' then 'ganho'
  when 'closed_lost' then 'perdido'
  else stage
end;

update public.opportunity_stage_history
set
  from_stage = case from_stage
    when 'qualification' then 'qualificacao'
    when 'proposal' then 'follow_up'
    when 'negotiation' then 'stand_by'
    when 'closed_won' then 'ganho'
    when 'closed_lost' then 'perdido'
    else from_stage
  end,
  to_stage = case to_stage
    when 'qualification' then 'qualificacao'
    when 'proposal' then 'follow_up'
    when 'negotiation' then 'stand_by'
    when 'closed_won' then 'ganho'
    when 'closed_lost' then 'perdido'
    else to_stage
  end;

alter table public.opportunities
drop constraint if exists opportunities_stage_check;

alter table public.opportunities
add constraint opportunities_stage_check
check (stage in ('lead', 'qualificacao', 'follow_up', 'stand_by', 'ganho', 'perdido'));

update public.opportunities
set status = case
  when stage = 'ganho' then 'won'
  when stage = 'perdido' then 'lost'
  when status in ('won', 'lost') then 'open'
  else status
end;
