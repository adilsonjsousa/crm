create table if not exists public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  proposal_type text,
  product_hint text,
  template_body text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proposal_templates
  drop constraint if exists proposal_templates_proposal_type_check;
alter table public.proposal_templates
  add constraint proposal_templates_proposal_type_check
  check (proposal_type is null or proposal_type in ('equipment', 'supplies', 'service'));

alter table public.proposal_templates
  drop constraint if exists proposal_templates_sort_order_check;
alter table public.proposal_templates
  add constraint proposal_templates_sort_order_check
  check (sort_order > 0);

alter table public.proposal_templates
  drop constraint if exists proposal_templates_template_body_not_empty;
alter table public.proposal_templates
  add constraint proposal_templates_template_body_not_empty
  check (btrim(coalesce(template_body, '')) <> '');

create unique index if not exists proposal_templates_name_unique_idx
  on public.proposal_templates (lower(name));

create index if not exists proposal_templates_sort_order_idx
  on public.proposal_templates (sort_order, name);

create index if not exists proposal_templates_active_idx
  on public.proposal_templates (is_active, proposal_type);

insert into public.proposal_templates (name, proposal_type, product_hint, template_body, is_active, sort_order)
select seed.name, seed.proposal_type, seed.product_hint, seed.template_body, seed.is_active, seed.sort_order
from (
  values
    (
      'Template Comercial Padrão',
      null,
      null,
      'PROPOSTA COMERCIAL {{numero_proposta}}\n\nEmpresa: {{empresa_nome}}\nContato: {{cliente_nome}}\nData de emissao: {{data_emissao}}\nValidade: {{validade_dias}} dias\n\nItens da oportunidade:\n{{itens_oportunidade}}\n\nValor total: {{valor_total}}\n\nCondicoes de pagamento:\n{{condicoes_pagamento}}\n\nPrazo de entrega:\n{{prazo_entrega}}\n\nGarantia:\n{{garantia}}\n\nObservacoes:\n{{observacoes}}\n',
      true,
      100
    ),
    (
      'Canon imagePRESS V700',
      'equipment',
      'imagePRESS V700',
      'PROPOSTA COMERCIAL {{numero_proposta}}\n\nEmpresa: {{empresa_nome}}\nContato: {{cliente_nome}}\nData de emissao: {{data_emissao}}\nValidade: {{validade_dias}} dias\n\nA QUALIDADE CANON\nLider mundial em sistemas de impressao, a Canon entrega robustez, estabilidade de cor e produtividade para operacoes graficas.\n\nSUPORTE PREMIUM ARTPRINTER\nAtendimento tecnico especializado para implantacao, treinamento e suporte do cliente.\n\nSOLUCAO RECOMENDADA\n- Produto principal: {{produto}}\n- Categoria: {{categoria}}\n- Itens da oportunidade:\n{{itens_oportunidade}}\n\nINVESTIMENTO\n- Valor total da proposta: {{valor_total}}\n\nCONDICOES COMERCIAIS\n- Condicoes de pagamento: {{condicoes_pagamento}}\n- Prazo de entrega: {{prazo_entrega}}\n- Garantia e suporte: {{garantia}}\n\nObservacoes:\n{{observacoes}}\n',
      true,
      120
    )
) as seed(name, proposal_type, product_hint, template_body, is_active, sort_order)
where not exists (
  select 1 from public.proposal_templates
);

alter table public.proposal_templates enable row level security;

drop policy if exists p_proposal_templates_authenticated_all on public.proposal_templates;
create policy p_proposal_templates_authenticated_all
on public.proposal_templates
for all to authenticated
using (true)
with check (true);

drop policy if exists p_proposal_templates_public_all on public.proposal_templates;
create policy p_proposal_templates_public_all
on public.proposal_templates
for all to public
using (true)
with check (true);

drop trigger if exists trg_proposal_templates_updated_at on public.proposal_templates;
create trigger trg_proposal_templates_updated_at
before update on public.proposal_templates
for each row execute function public.set_updated_at();
