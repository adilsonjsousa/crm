# CRM Comercial e Técnica

CRM web para gestão comercial e suporte técnico, com calendário de atividades, SLA e integração Omie por proxy.

## Funcionalidades
- Cadastro de clientes
- Pipeline comercial (lead até fechado)
- Chamados técnicos com prioridade, status e monitor de SLA
- Calendário de atividades comerciais (agenda por data/hora)
- Check-in de vendedor por geolocalização na chegada ao cliente
- Alertas de SLA em tela e notificação do navegador
- Integração com ERP Omie (sincronização via endpoint backend/proxy)
- Persistência local no navegador (`localStorage`)
- Exportação dos dados em JSON

## Como usar
1. Abra `/Users/adilsonsousa/Documents/New project/index.html` no navegador.
2. Cadastre clientes, oportunidades, chamados e atividades.
3. Para check-in geográfico, preencha `latitude`, `longitude` e `raio` no cadastro do cliente.
4. No painel de check-in, selecione cliente e vendedor para registrar chegada validada por distância.
5. Ajuste as metas de SLA em horas por prioridade.
6. Configure integração Omie com `App Key`, `App Secret` e URL do proxy.
7. Use os botões de sincronização para importar dados do Omie.

## Contrato esperado do proxy Omie
Este frontend chama os endpoints abaixo com `POST` e body JSON:

- `/api/omie/clientes`
- `/api/omie/oportunidades`
- `/api/omie/chamados`

Body enviado:
```json
{
  "appKey": "SUA_APP_KEY",
  "appSecret": "SEU_APP_SECRET"
}
```

Resposta esperada (todos):
```json
{
  "items": []
}
```

Exemplos de campos aceitos no `items`:
- Clientes: `nome`, `empresa`, `email`, `telefone`, `segmento`, `latitude`, `longitude`, `raioMetros`
- Oportunidades: `empresa`/`email`, `titulo`, `valor`, `etapa`, `proximoContato`
- Chamados: `empresa`/`email`, `titulo`, `descricao`, `prioridade`, `status`, `responsavel`, `criadoEm`

## Estrutura
- `/Users/adilsonsousa/Documents/New project/index.html` interface
- `/Users/adilsonsousa/Documents/New project/styles.css` estilos
- `/Users/adilsonsousa/Documents/New project/app.js` lógica, SLA, calendário, check-in e integração Omie
