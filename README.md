# CRM Revenue Architecture

Projeto migrado para:
- Frontend: React + Vite (`/frontend`)
- Backend de dados/autenticação: Supabase (`/supabase/migrations`)
- Repositório: GitHub
- Deploy do frontend: Vercel

## Estrutura
- `/Users/adilsonsousa/Documents/New project/frontend` app React
- `/Users/adilsonsousa/Documents/New project/supabase/migrations` schema e políticas SQL
- `/Users/adilsonsousa/Documents/New project/.github/workflows` CI e deploy
- `/Users/adilsonsousa/Documents/New project/frontend/vercel.json` configuração de build para Vercel
- `/Users/adilsonsousa/Documents/New project/docs/implementation-plan.md` plano ponta a ponta
- `/Users/adilsonsousa/Documents/New project/docs/design-system.md` guia de UX/UI e design tokens

## Setup local
1. Entre em `frontend`.
2. Copie `.env.example` para `.env` e preencha:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Instale dependências e rode:

```bash
cd frontend
npm install
npm run dev
```

## Supabase
Aplique as migrações no projeto Supabase nesta ordem:
1. `20260218_0001_init_revenue_architecture.sql`
2. `20260218_0002_rls_initial.sql`
3. `20260218_0003_seed_defaults.sql`

## Vercel
Deploy configurado para publicar o app React do diretório `frontend`.

Configuração recomendada no Vercel (quando conectar o repositório):
- Root Directory: `frontend`
- Framework Preset: `Vite`

Comandos esperados:
- Build: `cd frontend && npm install && npm run build`
- Output: `frontend/dist`

## GitHub Actions
- CI: `.github/workflows/frontend-ci.yml`
- Deploy Vercel: `.github/workflows/deploy-vercel.yml`

Secrets necessários para deploy:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## MCP Supabase (Codex)
Servidor MCP configurado para o projeto `shqsaclzbuzeuynpxdsq`.

Pré-requisito:
- Variável de ambiente `SUPABASE_ACCESS_TOKEN` disponível para o app do Codex.

## Observação
Os arquivos legados (`index.html`, `app.js`, `styles.css`) permanecem no repositório apenas como referência histórica e não fazem parte do novo frontend React.
