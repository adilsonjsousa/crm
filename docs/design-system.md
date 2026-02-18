# Design System - Nova Interface CRM

## Direção visual
- Referências de linguagem: clareza Apple, performance Tesla, robustez Starlink.
- Princípios: foco em conteúdo, superfícies de alta legibilidade, contraste forte, baixa fricção operacional.

## Tokens
- Cores base:
  - `--bg-canvas`, `--bg-canvas-2`, `--bg-canvas-3`
  - `--text-primary`, `--text-secondary`, `--text-muted`
  - `--brand-1`, `--brand-2`, `--brand-3`
- Superfície:
  - `--surface-1`, `--surface-2`, `--surface-3`
  - `--border-soft`, `--border-strong`
- Forma e profundidade:
  - `--radius-xl`, `--radius-lg`, `--radius-md`
  - `--shadow-1`, `--shadow-2`

## Componentes visuais
- Hero header com chips de contexto.
- Tabs estilo segmented control.
- Cards de KPI com destaque radial e tipografia numérica forte.
- Painéis com glass layer e borda translúcida.
- Tabelas com cabeçalho fixo visual e hover orientado à leitura.
- Inputs com foco de alta visibilidade e botão primário gradiente.

## Motion
- Animações curtas (`fadeSlide`, `rise`) para entrada de blocos.
- Interações de botão com hover lift suave.
- Respeito a acessibilidade com `prefers-reduced-motion`.

## Responsividade
- Breakpoint principal em `980px`.
- Layout em duas colunas para desktop e coluna única no mobile.
- Hero quebra para vertical em telas menores.

## Regras de uso
- Sempre reutilizar tokens CSS antes de criar nova cor/sombra.
- Evitar estilos inline, exceto para dados dinâmicos inevitáveis.
- Novos módulos devem seguir `module > panel > form-grid/table-wrap`.
