# Plano de Implementação (React + Supabase)

## Objetivo
Implementar um CRM integrado para:
- Vendas de equipamentos
- Recompra de suprimentos
- Serviços avulsos e contratos recorrentes
- Assistência técnica corretiva e preventiva

## Fase 1 - Fundação (Sprint 1-2)
- Subir schema base no Supabase
- Configurar RLS inicial
- Integrar frontend React com tabelas principais
- Entregar módulos:
  - Empresas
  - Pipeline
  - Pedidos
  - Assistência
  - Dashboard básico

## Fase 2 - Revenue Operations (Sprint 3-4)
- Contratos recorrentes e agenda de cobrança
- Base instalada (assets)
- SLA por prioridade + alertas
- Histórico de mudança de estágio no funil

## Fase 3 - Eficiência Operacional (Sprint 5-6)
- Preventiva automática (planos + geração de tickets)
- Regras de recompra de suprimentos
- Sugestão automática de reposição
- Métricas de conversão, ciclo de venda e SLA

## Fase 4 - Governança e Escala (Sprint 7+)
- Permissões por papel (RLS refinada)
- Multi-unidade e multi-equipe
- Integração robusta com Omie (idempotência, retries, reconciliação)
- Data marts de KPI e painéis executivos

## KPIs essenciais
- Comercial: win rate, ciclo médio, cobertura de pipeline
- Receita: mix por linha (equipamento, suprimentos, serviços), margem
- Técnico: SLA on-time, backlog, first-time-fix
- Recorrência: MRR ativo, renovação, churn
- Suprimentos: recompra, intervalo médio entre pedidos

## Entrega técnica recomendada
- Supabase migrations versionadas
- Seeds por ambiente
- CI de build no GitHub
- Deploy contínuo no Vercel (frontend)

## Design System (UX/UI)
- Base visual premium orientada a produto: clareza, performance e robustez.
- Tokens centralizados de cor, tipografia, radius, sombra e motion.
- Biblioteca de padrões para: header, tabs, cards KPI, forms, tabelas e estados de erro.
- Regra de evolução: novas telas só entram seguindo os tokens e padrões de composição.
