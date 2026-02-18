# Supabase

## MCP (Codex)
Configuração aplicada no Codex para migrations via MCP:
- URL: `https://mcp.supabase.com/mcp?project_ref=shqsaclzbuzeuynpxdsq`
- Auth via variável de ambiente: `SUPABASE_ACCESS_TOKEN`

Após definir a variável de ambiente, reinicie o app Codex para o servidor MCP ficar disponível nesta sessão.

## Migrações
Ordem de aplicação:
1. `migrations/20260218_0001_init_revenue_architecture.sql`
2. `migrations/20260218_0002_rls_initial.sql`
3. `migrations/20260218_0003_seed_defaults.sql`

## Com CLI (opcional)
```bash
supabase db push
```

Ou execute os SQLs manualmente no SQL Editor do Supabase.

## Próximo passo recomendado
Refinar políticas RLS por perfil e por tenant (empresa).
