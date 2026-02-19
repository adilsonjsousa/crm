import { useEffect, useMemo, useState } from "react";
import {
  createAutomatedProposalFromOpportunity,
  createCompanyInteraction,
  createOpportunity,
  listCompanyContacts,
  listCompanyOptions,
  listLatestOrdersByOpportunity,
  listOpportunities,
  updateOpportunity,
  updateOpportunityStage
} from "../lib/revenueApi";
import { PIPELINE_STAGES, canMoveToStage, stageLabel, stageStatus } from "../lib/pipelineStages";
import {
  PRODUCTS_BY_SUBCATEGORY,
  SALES_TYPES,
  composeOpportunityTitle,
  getSubcategoriesByType,
  parseOpportunityTitle,
  resolveEstimatedValueByProduct
} from "../lib/productCatalog";

const PROPOSAL_TEMPLATE_STORAGE_KEY = "crm.pipeline.proposal-template.v1";

const DEFAULT_PROPOSAL_TEMPLATE = [
  "Proposta Comercial {{numero_proposta}}",
  "",
  "Cliente: {{cliente_nome}}",
  "Empresa: {{empresa_nome}}",
  "Data de emissao: {{data_emissao}}",
  "Validade: {{validade_dias}} dias",
  "",
  "Produto/Servico: {{produto}}",
  "Categoria: {{categoria}}",
  "Valor total: {{valor_total}}",
  "",
  "Condicoes de pagamento:",
  "{{condicoes_pagamento}}",
  "",
  "Prazo de entrega:",
  "{{prazo_entrega}}",
  "",
  "Garantia:",
  "{{garantia}}",
  "",
  "Observacoes:",
  "{{observacoes}}",
  "",
  "Atenciosamente,",
  "Equipe Comercial"
].join("\n");

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function cleanPhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeWhatsAppNumber(value) {
  const digits = cleanPhoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function formatDateBr(dateValue) {
  if (!dateValue) return "";
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(dateValue);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsed);
}

function getStoredProposalTemplate() {
  if (typeof window === "undefined") return DEFAULT_PROPOSAL_TEMPLATE;
  const saved = window.localStorage.getItem(PROPOSAL_TEMPLATE_STORAGE_KEY);
  return saved || DEFAULT_PROPOSAL_TEMPLATE;
}

function buildDraftProposalNumber(opportunityId = "") {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const suffix = String(opportunityId || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-6)
    .toUpperCase();
  return `RASC-${year}${month}${day}${hour}${minute}${suffix ? `-${suffix}` : ""}`;
}

function sanitizeFilePart(value) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderProposalTemplate(template, variables) {
  let output = String(template || "");
  for (const [key, value] of Object.entries(variables || {})) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, "gi");
    output = output.replace(regex, String(value ?? ""));
  }
  return output;
}

function buildProposalDocumentHtml({ proposalNumber, companyName, renderedText }) {
  const textHtml = escapeHtml(renderedText).replace(/\n/g, "<br />");
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(proposalNumber || "Proposta Comercial")}</title>
    <style>
      body {
        font-family: Arial, Helvetica, sans-serif;
        margin: 24px;
        color: #1f2937;
      }
      .header {
        margin-bottom: 20px;
      }
      .header h1 {
        margin: 0 0 6px;
        font-size: 22px;
      }
      .header p {
        margin: 0;
        color: #4b5563;
        font-size: 14px;
      }
      .content {
        border: 1px solid #d1d5db;
        border-radius: 12px;
        padding: 16px;
        line-height: 1.55;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>${escapeHtml(proposalNumber || "Proposta Comercial")}</h1>
      <p>${escapeHtml(companyName || "Cliente")}</p>
    </div>
    <div class="content">${textHtml}</div>
  </body>
</html>`;
}

function downloadFile({ fileName, content, mimeType }) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function pickPreferredContact(contacts = []) {
  if (!contacts.length) return null;
  return contacts.find((contact) => Boolean(contact.is_primary)) || contacts[0];
}

function emptyOpportunityForm(defaultCompanyId = "") {
  return {
    company_id: defaultCompanyId,
    opportunity_type: "equipment",
    title_subcategory: "",
    title_product: "",
    stage: "lead",
    estimated_value: "",
    expected_close_date: ""
  };
}

function createProposalDraft({ opportunity, linkedOrder, contacts }) {
  const parsedTitle = parseOpportunityTitle(opportunity?.title || "");
  const preferredContact = pickPreferredContact(contacts);
  const today = new Date().toISOString().slice(0, 10);
  const totalValue = Number(linkedOrder?.total_amount ?? opportunity?.estimated_value ?? 0);

  return {
    opportunity_id: opportunity?.id || "",
    company_id: opportunity?.company_id || "",
    proposal_number: linkedOrder?.order_number || buildDraftProposalNumber(opportunity?.id),
    issue_date: today,
    validity_days: "7",
    category: parsedTitle.title_subcategory || "",
    product: parsedTitle.title_product || String(opportunity?.title || "").trim(),
    estimated_value: Number.isFinite(totalValue) ? totalValue : 0,
    payment_terms: "50% de entrada e 50% na entrega/instalacao.",
    delivery_terms: "Entrega em ate 15 dias uteis apos aprovacao.",
    warranty_terms: "Garantia de 12 meses contra defeitos de fabricacao.",
    notes: "",
    contact_id: preferredContact?.id || "",
    client_name: preferredContact?.full_name || opportunity?.companies?.trade_name || "Cliente",
    client_email: preferredContact?.email || opportunity?.companies?.email || "",
    client_whatsapp: preferredContact?.whatsapp || preferredContact?.phone || opportunity?.companies?.phone || "",
    send_channel: "whatsapp",
    enable_send: false,
    template_body: getStoredProposalTemplate()
  };
}

export default function PipelineModule() {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [dragOverStage, setDragOverStage] = useState("");
  const [editingOpportunityId, setEditingOpportunityId] = useState("");
  const [creatingProposalId, setCreatingProposalId] = useState("");
  const [proposalsByOpportunity, setProposalsByOpportunity] = useState({});
  const [autoProposalMode, setAutoProposalMode] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("crm.pipeline.auto-proposal-mode") !== "0";
  });
  const [proposalEditor, setProposalEditor] = useState(null);
  const [proposalContacts, setProposalContacts] = useState([]);
  const [proposalLoadingContacts, setProposalLoadingContacts] = useState(false);
  const [sendingProposal, setSendingProposal] = useState(false);
  const [form, setForm] = useState(() => emptyOpportunityForm());

  const itemsByStage = useMemo(() => {
    const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
      acc[stage.value] = [];
      return acc;
    }, {});

    for (const item of items) {
      if (!grouped[item.stage]) continue;
      grouped[item.stage].push(item);
    }

    return grouped;
  }, [items]);

  const proposalVariables = useMemo(() => {
    if (!proposalEditor) return {};
    return {
      numero_proposta: proposalEditor.proposal_number,
      cliente_nome: proposalEditor.client_name,
      empresa_nome:
        items.find((item) => item.id === proposalEditor.opportunity_id)?.companies?.trade_name || proposalEditor.client_name,
      data_emissao: formatDateBr(proposalEditor.issue_date),
      validade_dias: proposalEditor.validity_days,
      categoria: proposalEditor.category,
      produto: proposalEditor.product,
      valor_total: brl(proposalEditor.estimated_value),
      condicoes_pagamento: proposalEditor.payment_terms,
      prazo_entrega: proposalEditor.delivery_terms,
      garantia: proposalEditor.warranty_terms,
      observacoes: proposalEditor.notes || "Sem observacoes adicionais."
    };
  }, [items, proposalEditor]);

  const renderedProposalText = useMemo(() => {
    if (!proposalEditor) return "";
    return renderProposalTemplate(proposalEditor.template_body, proposalVariables);
  }, [proposalEditor, proposalVariables]);

  const renderedProposalHtml = useMemo(() => {
    if (!proposalEditor) return "";
    return buildProposalDocumentHtml({
      proposalNumber: proposalEditor.proposal_number,
      companyName:
        items.find((item) => item.id === proposalEditor.opportunity_id)?.companies?.trade_name || proposalEditor.client_name,
      renderedText: renderedProposalText
    });
  }, [items, proposalEditor, renderedProposalText]);

  async function load() {
    setError("");
    setSuccess("");
    try {
      const [opps, companiesData] = await Promise.all([listOpportunities(), listCompanyOptions()]);
      setItems(opps);
      setCompanies(companiesData);
      const linkedOrders = await listLatestOrdersByOpportunity(opps.map((opportunity) => opportunity.id));
      const nextProposalMap = linkedOrders.reduce((acc, order) => {
        if (!order?.source_opportunity_id) return acc;
        acc[order.source_opportunity_id] = order;
        return acc;
      }, {});
      setProposalsByOpportunity(nextProposalMap);
      if (companiesData.length) {
        setForm((prev) => (prev.company_id ? prev : { ...prev, company_id: companiesData[0].id }));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      const opportunityType = String(form.opportunity_type || "").trim();
      const titleSubcategory = String(form.title_subcategory || "").trim();
      const titleProduct = String(form.title_product || "").trim();
      if (!opportunityType) {
        setError("Selecione o tipo.");
        return;
      }
      if (!titleSubcategory) {
        setError("Selecione a sub-categoria.");
        return;
      }
      if (!titleProduct) {
        setError("Informe o produto.");
        return;
      }

      const payload = {
        company_id: form.company_id,
        title: composeOpportunityTitle(titleSubcategory, titleProduct),
        stage: form.stage,
        status: stageStatus(form.stage),
        estimated_value: Number(form.estimated_value || 0),
        expected_close_date: form.expected_close_date || null
      };

      if (editingOpportunityId) {
        const currentOpportunity = items.find((item) => item.id === editingOpportunityId);
        await updateOpportunity(editingOpportunityId, {
          ...payload,
          from_stage: currentOpportunity?.stage || null
        });
      } else {
        await createOpportunity(payload);
      }

      setEditingOpportunityId("");
      setForm(emptyOpportunityForm(companies[0]?.id || ""));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDragStart(event, opportunityId) {
    if (event.target?.closest && event.target.closest(".pipeline-card-actions")) {
      event.preventDefault();
      return;
    }
    setDraggingId(opportunityId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/opportunity-id", opportunityId);
  }

  function handleDragEnd() {
    setDraggingId("");
    setDragOverStage("");
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  async function handleDrop(event, targetStage) {
    event.preventDefault();
    setDragOverStage("");
    setSuccess("");

    const opportunityId = event.dataTransfer.getData("text/opportunity-id") || draggingId;
    if (!opportunityId) return;

    const currentOpportunity = items.find((item) => item.id === opportunityId);
    if (!currentOpportunity) return;

    if (currentOpportunity.stage === targetStage) return;

    if (!canMoveToStage(currentOpportunity.stage, targetStage)) {
      setError(`Movimento invalido. Avance para a proxima etapa do funil (${stageLabel(currentOpportunity.stage)}).`);
      return;
    }

    const previousItems = items;
    setError("");
    setItems((prev) =>
      prev.map((item) =>
        item.id === opportunityId ? { ...item, stage: targetStage, status: stageStatus(targetStage) } : item
      )
    );
    if (editingOpportunityId === opportunityId) {
      setForm((prev) => ({ ...prev, stage: targetStage }));
    }

    try {
      await updateOpportunityStage({
        opportunityId,
        fromStage: currentOpportunity.stage,
        toStage: targetStage
      });
    } catch (err) {
      setItems(previousItems);
      if (editingOpportunityId === opportunityId) {
        setForm((prev) => ({ ...prev, stage: currentOpportunity.stage }));
      }
      setError(err.message);
    } finally {
      setDraggingId("");
    }
  }

  function startEditOpportunity(item) {
    setError("");
    setSuccess("");
    const parsedTitle = parseOpportunityTitle(item.title);
    setEditingOpportunityId(item.id);
    setForm({
      company_id: item.company_id || "",
      opportunity_type: parsedTitle.opportunity_type || "equipment",
      title_subcategory: parsedTitle.title_subcategory,
      title_product: parsedTitle.title_product,
      stage: item.stage || "lead",
      estimated_value: String(item.estimated_value ?? ""),
      expected_close_date: item.expected_close_date || ""
    });
  }

  function cancelEditOpportunity() {
    setError("");
    setSuccess("");
    setEditingOpportunityId("");
    setForm(emptyOpportunityForm(companies[0]?.id || ""));
  }

  function handleToggleAutoProposalMode(event) {
    const nextValue = Boolean(event.target.checked);
    setAutoProposalMode(nextValue);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("crm.pipeline.auto-proposal-mode", nextValue ? "1" : "0");
    }
  }

  async function handleCreateAutomatedProposal(event, item) {
    event.stopPropagation();
    if (!item?.id) return;

    setError("");
    setSuccess("");
    setCreatingProposalId(item.id);

    try {
      const result = await createAutomatedProposalFromOpportunity(item);
      setProposalsByOpportunity((prev) => ({ ...prev, [item.id]: result }));
      setProposalEditor((prev) => {
        if (!prev || prev.opportunity_id !== item.id) return prev;
        return {
          ...prev,
          proposal_number: result.order_number || prev.proposal_number,
          estimated_value: Number(result.total_amount ?? prev.estimated_value)
        };
      });
      if (result.already_exists) {
        setSuccess(`Essa oportunidade ja possui proposta vinculada (${result.order_number}).`);
      } else {
        setSuccess(`Proposta criada automaticamente (${result.order_number}).`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingProposalId("");
    }
  }

  async function handleOpenProposalModel(event, item) {
    event.stopPropagation();
    if (!item?.id) return;

    setError("");
    setSuccess("");
    setProposalLoadingContacts(true);

    try {
      const contacts = item.company_id ? await listCompanyContacts(item.company_id) : [];
      const linkedOrder = proposalsByOpportunity[item.id] || null;
      setProposalContacts(contacts);
      setProposalEditor(createProposalDraft({ opportunity: item, linkedOrder, contacts }));
    } catch (err) {
      setError(err.message);
    } finally {
      setProposalLoadingContacts(false);
    }
  }

  function closeProposalEditor() {
    setProposalEditor(null);
    setProposalContacts([]);
    setProposalLoadingContacts(false);
  }

  function handleProposalField(field, value) {
    setProposalEditor((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function handleProposalContactChange(contactId) {
    const contact = proposalContacts.find((item) => item.id === contactId);
    setProposalEditor((prev) => {
      if (!prev) return prev;
      const next = { ...prev, contact_id: contactId };
      if (contact) {
        next.client_name = contact.full_name || prev.client_name;
        next.client_email = contact.email || prev.client_email;
        next.client_whatsapp = contact.whatsapp || contact.phone || prev.client_whatsapp;
      }
      return next;
    });
  }

  function handleSaveProposalTemplate() {
    if (!proposalEditor || typeof window === "undefined") return;
    window.localStorage.setItem(PROPOSAL_TEMPLATE_STORAGE_KEY, proposalEditor.template_body || DEFAULT_PROPOSAL_TEMPLATE);
    setSuccess("Modelo de proposta salvo como padrao neste navegador.");
  }

  function handleSaveProposalDoc() {
    if (!proposalEditor || !renderedProposalHtml) return;
    const fileName = `${sanitizeFilePart(proposalEditor.proposal_number)}-${sanitizeFilePart(proposalEditor.client_name)}.doc`;
    downloadFile({
      fileName,
      content: renderedProposalHtml,
      mimeType: "application/msword"
    });
    setSuccess(`Arquivo DOC salvo (${fileName}).`);
  }

  function handleSaveProposalPdf() {
    if (!proposalEditor || !renderedProposalHtml) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      setError("Permita pop-up no navegador para gerar o PDF.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(renderedProposalHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();

    setSuccess("Janela de impressao aberta. Selecione 'Salvar como PDF'.");
  }

  async function handleSendProposalToClient() {
    if (!proposalEditor) return;
    if (!proposalEditor.enable_send) {
      setError("Ative a opcao 'Habilitar envio ao cliente'.");
      return;
    }

    setSendingProposal(true);
    setError("");
    setSuccess("");

    try {
      const subject = `Proposta Comercial ${proposalEditor.proposal_number}`;
      const payloadText = renderedProposalText.slice(0, 5800);
      let interactionWarning = "";

      if (proposalEditor.send_channel === "whatsapp") {
        const normalizedWhats = normalizeWhatsAppNumber(proposalEditor.client_whatsapp);
        if (!normalizedWhats) {
          setError("Informe o WhatsApp do cliente para envio.");
          return;
        }

        const text = encodeURIComponent(`${subject}\n\n${renderedProposalText}`);
        window.open(`https://wa.me/${normalizedWhats}?text=${text}`, "_blank", "noopener,noreferrer");

        try {
          await createCompanyInteraction({
            company_id: proposalEditor.company_id,
            contact_id: proposalEditor.contact_id || null,
            interaction_type: "whatsapp",
            direction: "outbound",
            subject,
            content: payloadText,
            whatsapp_number: normalizedWhats,
            occurred_at: new Date().toISOString()
          });
        } catch (err) {
          interactionWarning = err.message;
        }

        setSuccess(
          interactionWarning
            ? "WhatsApp aberto, mas nao foi possivel registrar no historico do cliente."
            : "WhatsApp aberto com a proposta pronta para envio."
        );
        return;
      }

      const email = String(proposalEditor.client_email || "").trim();
      if (!email) {
        setError("Informe o e-mail do cliente para envio.");
        return;
      }

      const body = encodeURIComponent(
        `${subject}\n\n${renderedProposalText}\n\nAnexo: incluir o arquivo PDF ou DOC gerado no CRM.`
      );
      const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${body}`;
      window.location.href = mailtoUrl;

      try {
        await createCompanyInteraction({
          company_id: proposalEditor.company_id,
          contact_id: proposalEditor.contact_id || null,
          interaction_type: "note",
          direction: "outbound",
          subject,
          content: `Proposta preparada para envio por e-mail para ${email}.\n\n${payloadText}`,
          occurred_at: new Date().toISOString()
        });
      } catch (err) {
        interactionWarning = err.message;
      }

      setSuccess(
        interactionWarning
          ? "Cliente de e-mail aberto, mas nao foi possivel registrar no historico do cliente."
          : "Cliente de e-mail aberto. Anexe o PDF ou DOC antes de enviar."
      );
    } finally {
      setSendingProposal(false);
    }
  }

  return (
    <section className="module">
      <article className="panel">
        <h2>Pipeline Comercial</h2>
        <p className="muted">Arraste os cards para evoluir a oportunidade para a proxima etapa.</p>
        <div className="pipeline-automation-toggle">
          <label className="checkbox-inline">
            <input type="checkbox" checked={autoProposalMode} onChange={handleToggleAutoProposalMode} />
            Modo automatico de proposta
          </label>
          <p className="pipeline-automation-help">
            Com este modo ativo, cada card permite gerar uma proposta automaticamente no modulo Pedidos.
          </p>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <select
            value={form.company_id}
            onChange={(e) => setForm((prev) => ({ ...prev, company_id: e.target.value }))}
            required
          >
            <option value="">Selecione a empresa</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.trade_name}
              </option>
            ))}
          </select>
          <select
            required
            value={form.opportunity_type}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                opportunity_type: e.target.value,
                title_subcategory: "",
                title_product: "",
                estimated_value: ""
              }))
            }
          >
            <option value="">Selecione o tipo</option>
            {SALES_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <input
            required
            list="pipeline-subcategory-options"
            placeholder="Sub-categoria"
            value={form.title_subcategory}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                title_subcategory: e.target.value,
                title_product: "",
                estimated_value: ""
              }))
            }
          />
          <datalist id="pipeline-subcategory-options">
            {getSubcategoriesByType(form.opportunity_type).map((subcategory) => (
              <option key={subcategory} value={subcategory} />
            ))}
          </datalist>
          <input
            required
            list="pipeline-product-options"
            placeholder="Produto (ex.: CANON imagePRESS V700)"
            value={form.title_product}
            onChange={(e) =>
              setForm((prev) => {
                const nextProduct = e.target.value;
                const mappedEstimatedValue = resolveEstimatedValueByProduct(prev.title_subcategory, nextProduct);
                return {
                  ...prev,
                  title_product: nextProduct,
                  estimated_value: mappedEstimatedValue === null ? "" : String(mappedEstimatedValue)
                };
              })
            }
            disabled={!form.title_subcategory}
          />
          <datalist id="pipeline-product-options">
            {(PRODUCTS_BY_SUBCATEGORY[form.title_subcategory] || []).map((product) => (
              <option key={product} value={product} />
            ))}
          </datalist>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Valor estimado"
            value={form.estimated_value}
            onChange={(e) => setForm((prev) => ({ ...prev, estimated_value: e.target.value }))}
          />
          <select value={form.stage} onChange={(e) => setForm((prev) => ({ ...prev, stage: e.target.value }))}>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.expected_close_date}
            onChange={(e) => setForm((prev) => ({ ...prev, expected_close_date: e.target.value }))}
          />
          <div className="inline-actions">
            <button type="submit" className="btn-primary">
              {editingOpportunityId ? "Atualizar oportunidade" : "Salvar oportunidade"}
            </button>
            {editingOpportunityId ? (
              <button type="button" className="btn-ghost" onClick={cancelEditOpportunity}>
                Cancelar edicao
              </button>
            ) : null}
          </div>
        </form>
      </article>

      <article className="panel top-gap">
        <h3>Funil de vendas</h3>
        {error ? <p className="error-text">{error}</p> : null}
        {success ? <p className="success-text">{success}</p> : null}
        <div className="pipeline-board">
          {PIPELINE_STAGES.map((stage) => (
            <section
              key={stage.value}
              className={`pipeline-column ${dragOverStage === stage.value ? "is-over" : ""}`}
              onDragOver={handleDragOver}
              onDragEnter={() => setDragOverStage(stage.value)}
              onDragLeave={() => setDragOverStage("")}
              onDrop={(event) => handleDrop(event, stage.value)}
            >
              <header className="pipeline-column-header">
                <span>{stage.label}</span>
                <strong>{itemsByStage[stage.value]?.length || 0}</strong>
              </header>

              <div className="pipeline-column-body">
                {(itemsByStage[stage.value] || []).map((item) => {
                  const linkedProposal = proposalsByOpportunity[item.id];
                  return (
                    <article
                      key={item.id}
                      className={`pipeline-card ${draggingId === item.id ? "is-dragging" : ""}`}
                      draggable
                      onDragStart={(event) => handleDragStart(event, item.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <p className="pipeline-card-title">{item.title}</p>
                      <p className="pipeline-card-company">{item.companies?.trade_name || "-"}</p>
                      <p className="pipeline-card-value">{brl(item.estimated_value)}</p>
                      {linkedProposal ? (
                        <p className="pipeline-card-proposal">
                          Proposta: {linkedProposal.order_number} ({brl(linkedProposal.total_amount)})
                        </p>
                      ) : null}
                      <div className="pipeline-card-actions">
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => handleOpenProposalModel(event, item)}
                        >
                          Modelo
                        </button>
                        {autoProposalMode ? (
                          <button
                            type="button"
                            className="btn-ghost btn-table-action"
                            disabled={Boolean(linkedProposal) || creatingProposalId === item.id}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => handleCreateAutomatedProposal(event, item)}
                          >
                            {linkedProposal
                              ? "Proposta criada"
                              : creatingProposalId === item.id
                                ? "Gerando..."
                                : "Gerar proposta"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            startEditOpportunity(item);
                          }}
                        >
                          {editingOpportunityId === item.id ? "Editando" : "Editar"}
                        </button>
                      </div>
                    </article>
                  );
                })}

                {!itemsByStage[stage.value]?.length ? <p className="pipeline-empty">Sem oportunidades</p> : null}
              </div>
            </section>
          ))}
        </div>
      </article>

      {proposalEditor ? (
        <article className="panel top-gap">
          <div className="proposal-model-header">
            <div>
              <h3>Modelo de proposta</h3>
              <p className="muted">
                Personalize o texto da proposta, salve em PDF/DOC e, se desejar, habilite envio ao cliente.
              </p>
            </div>
            <button type="button" className="btn-ghost btn-table-action" onClick={closeProposalEditor}>
              Fechar
            </button>
          </div>

          {proposalLoadingContacts ? <p className="muted">Carregando contatos do cliente...</p> : null}

          <div className="proposal-model-grid">
            <div className="proposal-model-form">
              <div className="form-grid">
                <input
                  placeholder="Numero da proposta"
                  value={proposalEditor.proposal_number}
                  onChange={(event) => handleProposalField("proposal_number", event.target.value)}
                />
                <input
                  type="date"
                  value={proposalEditor.issue_date}
                  onChange={(event) => handleProposalField("issue_date", event.target.value)}
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Validade (dias)"
                  value={proposalEditor.validity_days}
                  onChange={(event) => handleProposalField("validity_days", event.target.value)}
                />
                <select value={proposalEditor.contact_id} onChange={(event) => handleProposalContactChange(event.target.value)}>
                  <option value="">Selecionar contato do cliente</option>
                  {proposalContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.full_name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Nome do cliente"
                  value={proposalEditor.client_name}
                  onChange={(event) => handleProposalField("client_name", event.target.value)}
                />
                <input
                  type="email"
                  placeholder="E-mail do cliente"
                  value={proposalEditor.client_email}
                  onChange={(event) => handleProposalField("client_email", event.target.value)}
                />
                <input
                  placeholder="WhatsApp do cliente"
                  value={proposalEditor.client_whatsapp}
                  onChange={(event) => handleProposalField("client_whatsapp", event.target.value)}
                />
                <input
                  placeholder="Categoria"
                  value={proposalEditor.category}
                  onChange={(event) => handleProposalField("category", event.target.value)}
                />
                <input
                  placeholder="Produto/servico"
                  value={proposalEditor.product}
                  onChange={(event) => handleProposalField("product", event.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Valor da proposta"
                  value={proposalEditor.estimated_value}
                  onChange={(event) => handleProposalField("estimated_value", Number(event.target.value || 0))}
                />
                <textarea
                  placeholder="Condicoes de pagamento"
                  value={proposalEditor.payment_terms}
                  onChange={(event) => handleProposalField("payment_terms", event.target.value)}
                />
                <textarea
                  placeholder="Prazo de entrega"
                  value={proposalEditor.delivery_terms}
                  onChange={(event) => handleProposalField("delivery_terms", event.target.value)}
                />
                <textarea
                  placeholder="Garantia"
                  value={proposalEditor.warranty_terms}
                  onChange={(event) => handleProposalField("warranty_terms", event.target.value)}
                />
                <textarea
                  placeholder="Observacoes"
                  value={proposalEditor.notes}
                  onChange={(event) => handleProposalField("notes", event.target.value)}
                />
                <textarea
                  className="proposal-template-input"
                  placeholder="Modelo da proposta"
                  value={proposalEditor.template_body}
                  onChange={(event) => handleProposalField("template_body", event.target.value)}
                />
                <p className="proposal-placeholder-help">
                  Placeholders:{" "}
                  <code>{"{{numero_proposta}}"}</code>, <code>{"{{cliente_nome}}"}</code>,{" "}
                  <code>{"{{empresa_nome}}"}</code>, <code>{"{{data_emissao}}"}</code>,{" "}
                  <code>{"{{validade_dias}}"}</code>, <code>{"{{categoria}}"}</code>,{" "}
                  <code>{"{{produto}}"}</code>, <code>{"{{valor_total}}"}</code>,{" "}
                  <code>{"{{condicoes_pagamento}}"}</code>, <code>{"{{prazo_entrega}}"}</code>,{" "}
                  <code>{"{{garantia}}"}</code>, <code>{"{{observacoes}}"}</code>
                </p>
                <div className="inline-actions">
                  <button type="button" className="btn-ghost" onClick={handleSaveProposalTemplate}>
                    Salvar modelo padrao
                  </button>
                  <button type="button" className="btn-primary" onClick={handleSaveProposalDoc}>
                    Salvar .DOC
                  </button>
                  <button type="button" className="btn-primary" onClick={handleSaveProposalPdf}>
                    Salvar .PDF
                  </button>
                </div>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={proposalEditor.enable_send}
                    onChange={(event) => handleProposalField("enable_send", event.target.checked)}
                  />
                  Habilitar envio ao cliente
                </label>
                {proposalEditor.enable_send ? (
                  <div className="proposal-send-grid">
                    <select
                      value={proposalEditor.send_channel}
                      onChange={(event) => handleProposalField("send_channel", event.target.value)}
                    >
                      <option value="whatsapp">Enviar por WhatsApp</option>
                      <option value="email">Enviar por E-mail</option>
                    </select>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleSendProposalToClient}
                      disabled={sendingProposal}
                    >
                      {sendingProposal ? "Enviando..." : "Enviar ao cliente"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <aside className="proposal-preview">
              <h4>Previa da proposta</h4>
              <pre>{renderedProposalText}</pre>
            </aside>
          </div>
        </article>
      ) : null}
    </section>
  );
}
