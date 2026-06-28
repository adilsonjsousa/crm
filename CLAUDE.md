# CRM ArtPrinter - Base de Conhecimento

## Estrutura do Projeto

Este repositório contém **duas versões independentes** do CRM:

### Versão antiga (raiz)
- **Arquivos**: `app.js`, `index.html`, `styles.css` na raiz do repositório
- **Deploy**: `frontend-silk-three-82.vercel.app`
- **Stack**: Vanilla JS, single-file application
- **REGRA ABSOLUTA: NUNCA modificar estes arquivos**. O cliente depende desta versão como fallback.

### Versão nova (`frontend/`)
- **Arquivos**: tudo dentro de `frontend/src/`
- **Deploy**: `crm-kappa-peach.vercel.app`
- **Stack**: React + Vite
- **Build**: `cd frontend && npm run build`
- **Config Vercel**: `frontend/vercel.json`

## Arquitetura Técnica

- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **PDF**: jsPDF + jspdf-autotable (`frontend/src/lib/proposalDocumentExport.js`)
- **DOCX**: biblioteca docx (`frontend/src/lib/proposalDocumentExport.js`)
- **UI**: CSS custom (sem framework CSS), modais com `.modal-overlay` + `.modal-box`
- **Estado**: React useState/useEffect, sem Redux ou state manager externo

## Módulos Principais

| Módulo | Arquivo | Função |
|--------|---------|--------|
| Pipeline/Funil | `PipelineModule.jsx` | Kanban de oportunidades, propostas, condições de fechamento |
| Agenda/Tarefas | `TasksModule.jsx` | Gestão de tarefas, relatório de visitas, exportação Excel |
| Histórico Cliente | `CustomerHistoryModal.jsx` | Propostas, versões PDF/DOCX, histórico por empresa |
| API | `revenueApi.js` | Comunicação com Supabase |
| Exportação | `proposalDocumentExport.js` | Geração de PDF e DOCX de propostas comerciais |

## Padrões de UX Definidos

Estes padrões foram alinhados com o cliente e devem ser mantidos:

1. **Formulário "Nova Oportunidade"** abre como **modal/popup** (não inline)
2. **Cards do pipeline** têm 4 botões: PDF direto, Condições, Editar, Excluir
3. **Botão "Gerar Proposta (PDF)"** gera o PDF **diretamente** sem abrir editor
4. **Popup "Condições de Fechamento"** inclui:
   - Prazo de Pagamento
   - Checkbox "Contrato ALL IN" (expande: taxa fixa, COR, MONO)
   - Checkbox "Dados para Contrato" (expande: resp. financeiro, operador, e-mail DANFE)
   - Botão de gerar PDF integrado
5. **PDF de proposta** deve conter: texto institucional ArtPrinter, descrição dos itens, observações completas, nome do vendedor, número formatado

## Texto Institucional ArtPrinter (para PDFs)

A ArtPrinter é revenda oficial Canon e oferece soluções gráficas digitais. O texto institucional padrão deve aparecer no PDF quando não houver texto personalizado no template.

## Observações Padrão de Proposta

Modelo padrão de observações para propostas:
- Instalação, treinamento e Suporte Premium ArtPrinter por 90 dias
- Garantia de 12 meses balcão
- Kits iniciais de toner não inclusos
- Frete incluso para Grande SP (consultar outras regiões)
- Equipamento bivolt com transformador quando necessário

## Proprietário

- **Empresa**: ArtPrinter
- **Contato**: adilson@artprinter.com.br
- **Repositório**: github.com/adilsonjsousa/crm
