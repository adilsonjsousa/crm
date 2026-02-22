import { useEffect, useMemo, useRef, useState } from "react";
import {
  createAutomatedProposalFromOpportunity,
  createCompanyInteraction,
  createOpportunity,
  listCompanyContacts,
  listCompanyOptions,
  listLatestOrdersByOpportunity,
  listOpportunities,
  listSystemUsers,
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
import { formatBrazilPhone, toWhatsAppBrazilNumber } from "../lib/phone";
import CustomerHistoryModal from "../components/CustomerHistoryModal";

const PROPOSAL_TEMPLATE_STORAGE_KEY = "crm.pipeline.proposal-template.v1";
const PIPELINE_VIEWER_STORAGE_KEY = "crm.pipeline.viewer-user-id.v1";
const ART_PRINTER_LOGO_CANDIDATES = [
  "/logo-art-printer.png",
  "/logo-artprinter.png",
  "/artprinter-logo.png",
  "/logo-art-printer.jpeg",
  "/logo-artprinter.jpeg",
  "/artprinter-logo.jpeg",
  "/logo-art-printer.jpg",
  "/logo-artprinter.jpg",
  "/artprinter-logo.jpg"
];

const BASIC_PROPOSAL_TEMPLATE = [
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

const PROPOSAL_TYPE_LABELS = {
  equipment: "Equipamentos",
  supplies: "Suprimentos",
  service: "Servicos"
};

const RD_TEMPLATE_BY_TYPE = {
  equipment: [
    "PROPOSTA COMERCIAL {{numero_proposta}}",
    "",
    "Empresa: {{empresa_nome}}",
    "Contato: {{cliente_nome}}",
    "Data de emissao: {{data_emissao}}",
    "Validade: {{validade_dias}} dias",
    "",
    "1) Contexto e objetivo",
    "Com base no diagnostico comercial realizado, esta proposta foi estruturada para ampliar produtividade e qualidade de impressao.",
    "Observacoes do contexto:",
    "{{observacoes}}",
    "",
    "2) Solucao recomendada",
    "- Categoria: {{categoria}}",
    "- Equipamento principal: {{produto}}",
    "",
    "3) Investimento",
    "- Valor total da proposta: {{valor_total}}",
    "",
    "4) Condicoes comerciais",
    "- Condicoes de pagamento: {{condicoes_pagamento}}",
    "- Prazo de entrega/instalacao: {{prazo_entrega}}",
    "- Garantia/Suporte: {{garantia}}",
    "",
    "5) Proximos passos",
    "Aprovando esta proposta, iniciamos agendamento de entrega tecnica e treinamento operacional da equipe.",
    "",
    "6) Aceite",
    "Responsavel cliente: __________________________________________",
    "Data de aceite: ____/____/________",
    "",
    "Atenciosamente,",
    "Equipe Comercial"
  ].join("\n"),
  supplies: [
    "PROPOSTA COMERCIAL {{numero_proposta}}",
    "",
    "Empresa: {{empresa_nome}}",
    "Contato: {{cliente_nome}}",
    "Data de emissao: {{data_emissao}}",
    "Validade: {{validade_dias}} dias",
    "",
    "1) Contexto e objetivo",
    "Esta proposta foi elaborada para garantir continuidade operacional e reduzir risco de ruptura de insumos.",
    "Observacoes do contexto:",
    "{{observacoes}}",
    "",
    "2) Solucao recomendada",
    "- Categoria: {{categoria}}",
    "- Item principal: {{produto}}",
    "",
    "3) Investimento",
    "- Valor total da proposta: {{valor_total}}",
    "",
    "4) Condicoes comerciais",
    "- Condicoes de pagamento: {{condicoes_pagamento}}",
    "- Prazo de entrega/reposicao: {{prazo_entrega}}",
    "- Garantia/Suporte: {{garantia}}",
    "",
    "5) Proximos passos",
    "Aprovando esta proposta, seguimos com processo de abastecimento conforme frequencia acordada.",
    "",
    "6) Aceite",
    "Responsavel cliente: __________________________________________",
    "Data de aceite: ____/____/________",
    "",
    "Atenciosamente,",
    "Equipe Comercial"
  ].join("\n"),
  service: [
    "PROPOSTA COMERCIAL {{numero_proposta}}",
    "",
    "Empresa: {{empresa_nome}}",
    "Contato: {{cliente_nome}}",
    "Data de emissao: {{data_emissao}}",
    "Validade: {{validade_dias}} dias",
    "",
    "1) Contexto e objetivo",
    "Esta proposta foi estruturada para assegurar atendimento tecnico com previsibilidade operacional e foco em disponibilidade.",
    "Observacoes do contexto:",
    "{{observacoes}}",
    "",
    "2) Solucao recomendada",
    "- Categoria: {{categoria}}",
    "- Servico principal: {{produto}}",
    "",
    "3) Investimento",
    "- Valor total da proposta: {{valor_total}}",
    "",
    "4) Condicoes comerciais",
    "- Condicoes de pagamento: {{condicoes_pagamento}}",
    "- Prazo de implantacao/atendimento: {{prazo_entrega}}",
    "- Garantia/SLA: {{garantia}}",
    "",
    "5) Proximos passos",
    "Aprovando esta proposta, iniciamos onboarding de atendimento e definicao de janelas operacionais.",
    "",
    "6) Aceite",
    "Responsavel cliente: __________________________________________",
    "Data de aceite: ____/____/________",
    "",
    "Atenciosamente,",
    "Equipe Comercial"
  ].join("\n")
};

function normalizeProposalType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "supplies" || normalized === "service" ? normalized : "equipment";
}

function proposalTypeLabel(value) {
  return PROPOSAL_TYPE_LABELS[normalizeProposalType(value)] || "Equipamentos";
}

function getRdTemplateByType(typeValue) {
  return RD_TEMPLATE_BY_TYPE[normalizeProposalType(typeValue)] || RD_TEMPLATE_BY_TYPE.equipment;
}

const DEFAULT_PROPOSAL_TEMPLATE = getRdTemplateByType("equipment");

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
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

function getStoredProposalTemplate(opportunityType = "equipment") {
  if (typeof window === "undefined") return getRdTemplateByType(opportunityType);
  const saved = window.localStorage.getItem(PROPOSAL_TEMPLATE_STORAGE_KEY);
  return saved || getRdTemplateByType(opportunityType);
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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler logo da proposta."));
    reader.readAsDataURL(blob);
  });
}

async function loadArtPrinterLogoAsDataUrl() {
  if (typeof window === "undefined") return "";

  for (const logoPath of ART_PRINTER_LOGO_CANDIDATES) {
    try {
      const response = await fetch(logoPath, { cache: "no-store" });
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (!response.ok || !contentType.startsWith("image/")) continue;
      return await blobToDataUrl(await response.blob());
    } catch (_err) {
      continue;
    }
  }

  return "";
}

function buildProposalDocumentHtml({ proposalNumber, companyName, renderedText, logoDataUrl }) {
  const textHtml = escapeHtml(renderedText).replace(/\n/g, "<br />");
  const logoHtml = logoDataUrl
    ? `<img class="brand-logo" src="${escapeHtml(logoDataUrl)}" alt="Art Printer" />`
    : `<p class="brand-fallback">art printer</p>`;
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
      .brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .brand-logo {
        max-width: 280px;
        max-height: 88px;
        width: auto;
        height: auto;
        object-fit: contain;
      }
      .brand-fallback {
        margin: 0;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: 0.02em;
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
      <div class="brand">${logoHtml}</div>
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

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return String(value || "");
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function emptyOpportunityForm(defaultCompanyId = "", defaultOwnerUserId = "") {
  return {
    company_id: defaultCompanyId,
    owner_user_id: defaultOwnerUserId,
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
  const proposalType = normalizeProposalType(parsedTitle.opportunity_type);
  const preferredContact = pickPreferredContact(contacts);
  const today = new Date().toISOString().slice(0, 10);
  const totalValue = Number(linkedOrder?.total_amount ?? opportunity?.estimated_value ?? 0);

  return {
    opportunity_id: opportunity?.id || "",
    company_id: opportunity?.company_id || "",
    proposal_number: linkedOrder?.order_number || buildDraftProposalNumber(opportunity?.id),
    issue_date: today,
    validity_days: "7",
    proposal_type: proposalType,
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
    client_whatsapp: formatBrazilPhone(preferredContact?.whatsapp || preferredContact?.phone || opportunity?.companies?.phone || ""),
    send_channel: "whatsapp",
    enable_send: false,
    template_body: getStoredProposalTemplate(proposalType)
  };
}

export default function PipelineModule({
  onRequestCreateCompany = null,
  prefillCompanyDraft = null,
  prefillCompanyRequest = 0
}) {
  const handledPrefillRequestRef = useRef(0);
  const [pipelineUsers, setPipelineUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [viewerUserId, setViewerUserId] = useState("");
  const [viewerRole, setViewerRole] = useState("sales");
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
  const [proposalLogoDataUrl, setProposalLogoDataUrl] = useState("");
  const [sendingProposal, setSendingProposal] = useState(false);
  const [customerHistoryModal, setCustomerHistoryModal] = useState({
    open: false,
    companyId: "",
    companyName: ""
  });
  const [form, setForm] = useState(() => emptyOpportunityForm("", ""));
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [companySuggestionsOpen, setCompanySuggestionsOpen] = useState(false);

  const viewerUser = useMemo(
    () => pipelineUsers.find((item) => item.user_id === viewerUserId) || null,
    [pipelineUsers, viewerUserId]
  );
  const canViewAllOpportunities = viewerRole === "admin" || viewerRole === "manager";
  const assignableOwners = useMemo(() => {
    const activeUsers = pipelineUsers.filter((item) => item.status === "active");
    if (canViewAllOpportunities) return activeUsers;
    return activeUsers.filter((item) => item.user_id === viewerUserId);
  }, [canViewAllOpportunities, pipelineUsers, viewerUserId]);
  const ownerNameById = useMemo(() => {
    const map = {};
    for (const user of pipelineUsers) {
      map[user.user_id] = user.full_name || user.email || "Usuário";
    }
    return map;
  }, [pipelineUsers]);
  const companySuggestions = useMemo(() => {
    const normalizedTerm = normalizeLookupText(companySearchTerm);
    const digitsTerm = String(companySearchTerm || "").replace(/\D/g, "");
    const source = normalizedTerm || digitsTerm
      ? companies.filter((company) => {
          const companyName = normalizeLookupText(company.trade_name);
          const companyCnpj = String(company.cnpj || "").replace(/\D/g, "");
          if (normalizedTerm && companyName.includes(normalizedTerm)) return true;
          if (digitsTerm && companyCnpj.includes(digitsTerm)) return true;
          return false;
        })
      : companies;
    return source.slice(0, 10);
  }, [companies, companySearchTerm]);

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
      renderedText: renderedProposalText,
      logoDataUrl: proposalLogoDataUrl
    });
  }, [items, proposalEditor, renderedProposalText, proposalLogoDataUrl]);
  const hasArtPrinterLogo = Boolean(proposalLogoDataUrl);

  async function loadUsersContext() {
    setLoadingUsers(true);
    setError("");

    try {
      const users = await listSystemUsers();
      const activeUsers = users.filter((item) => item.status === "active");
      const availableUsers = activeUsers.length ? activeUsers : users;
      setPipelineUsers(availableUsers);

      if (!availableUsers.length) {
        setViewerUserId("");
        setViewerRole("sales");
        setForm((prev) => ({ ...prev, owner_user_id: "" }));
        return;
      }

      const savedViewerId = typeof window === "undefined" ? "" : String(window.localStorage.getItem(PIPELINE_VIEWER_STORAGE_KEY) || "");
      const selectedViewer = availableUsers.find((item) => item.user_id === savedViewerId) || availableUsers[0];

      setViewerUserId(selectedViewer.user_id);
      setViewerRole(String(selectedViewer.role || "sales"));
      setForm((prev) => ({
        ...prev,
        owner_user_id: prev.owner_user_id || selectedViewer.user_id
      }));
    } catch (err) {
      setError(err.message);
      setPipelineUsers([]);
      setViewerUserId("");
      setViewerRole("sales");
    } finally {
      setLoadingUsers(false);
    }
  }

  async function load() {
    setError("");
    setSuccess("");
    try {
      const [opps, companiesData] = await Promise.all([
        listOpportunities({
          viewerUserId,
          viewerRole
        }),
        listCompanyOptions()
      ]);
      setItems(opps);
      setCompanies(companiesData);
      const linkedOrders = await listLatestOrdersByOpportunity(opps.map((opportunity) => opportunity.id));
      const nextProposalMap = linkedOrders.reduce((acc, order) => {
        if (!order?.source_opportunity_id) return acc;
        acc[order.source_opportunity_id] = order;
        return acc;
      }, {});
      setProposalsByOpportunity(nextProposalMap);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadUsersContext();
  }, []);

  useEffect(() => {
    load();
  }, [viewerUserId, viewerRole]);

  useEffect(() => {
    if (!prefillCompanyRequest || prefillCompanyRequest === handledPrefillRequestRef.current) return;
    handledPrefillRequestRef.current = prefillCompanyRequest;

    const rawDraft = prefillCompanyDraft && typeof prefillCompanyDraft === "object" ? prefillCompanyDraft : {};
    const prefillCompanyId = String(rawDraft.company_id || rawDraft.id || "").trim();
    const prefillCompanyName = String(rawDraft.trade_name || rawDraft.company_name || rawDraft.search_term || "").trim();
    const companyById = prefillCompanyId ? companies.find((item) => item.id === prefillCompanyId) || null : null;

    setEditingOpportunityId("");
    setError("");
    setSuccess("");
    setForm(() => emptyOpportunityForm(prefillCompanyId || companyById?.id || "", viewerUserId));
    setCompanySearchTerm(prefillCompanyName || companyById?.trade_name || "");
    setCompanySuggestionsOpen(false);
  }, [prefillCompanyDraft, prefillCompanyRequest, companies, viewerUserId]);

  useEffect(() => {
    let active = true;

    loadArtPrinterLogoAsDataUrl().then((logoDataUrl) => {
      if (!active) return;
      setProposalLogoDataUrl(logoDataUrl);
    });

    return () => {
      active = false;
    };
  }, []);

  function handleCompanySearchChange(value) {
    const nextTerm = value;
    setCompanySearchTerm(nextTerm);
    setCompanySuggestionsOpen(true);

    const normalizedNextTerm = normalizeLookupText(nextTerm);
    if (!normalizedNextTerm) {
      setForm((prev) => ({ ...prev, company_id: "" }));
      return;
    }

    const exactMatch = companies.find((company) => normalizeLookupText(company.trade_name) === normalizedNextTerm);
    setForm((prev) => ({
      ...prev,
      company_id: exactMatch ? exactMatch.id : ""
    }));
  }

  function handleSelectCompany(company) {
    if (!company?.id) return;
    setForm((prev) => ({ ...prev, company_id: company.id }));
    setCompanySearchTerm(company.trade_name || "");
    setCompanySuggestionsOpen(false);
  }

  function handleRequestCreateCompany() {
    const typedTerm = String(companySearchTerm || "").trim();
    if (!typedTerm) {
      setError("Digite o nome ou CNPJ para cadastrar uma nova empresa.");
      return;
    }

    if (typeof onRequestCreateCompany !== "function") {
      setError("Não foi possível abrir o cadastro de empresa neste contexto.");
      return;
    }

    const cnpjDigits = typedTerm.replace(/\D/g, "");
    setError("");
    setSuccess("");
    setCompanySuggestionsOpen(false);
    onRequestCreateCompany({
      trade_name: typedTerm,
      cnpj: cnpjDigits.length === 14 ? cnpjDigits : "",
      search_term: typedTerm
    });
  }

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
      if (!form.company_id) {
        setError("Selecione uma empresa cadastrada.");
        return;
      }

      const payload = {
        company_id: form.company_id,
        owner_user_id: form.owner_user_id || viewerUserId || null,
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
        await createOpportunity(payload, {
          ownerUserId: viewerUserId
        });
      }

      setEditingOpportunityId("");
      setForm(emptyOpportunityForm("", viewerUserId));
      setCompanySearchTerm("");
      setCompanySuggestionsOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDragStart(event, opportunityId) {
    if (event.target?.closest && event.target.closest(".pipeline-card-actions, .pipeline-card-company-link")) {
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
    const companyLabel =
      item.companies?.trade_name || companies.find((company) => company.id === item.company_id)?.trade_name || "";
    setEditingOpportunityId(item.id);
    setForm({
      company_id: item.company_id || "",
      owner_user_id: item.owner_user_id || viewerUserId,
      opportunity_type: parsedTitle.opportunity_type || "equipment",
      title_subcategory: parsedTitle.title_subcategory,
      title_product: parsedTitle.title_product,
      stage: item.stage || "lead",
      estimated_value: String(item.estimated_value ?? ""),
      expected_close_date: item.expected_close_date || ""
    });
    setCompanySearchTerm(companyLabel);
    setCompanySuggestionsOpen(false);
  }

  function cancelEditOpportunity() {
    setError("");
    setSuccess("");
    setEditingOpportunityId("");
    setForm(emptyOpportunityForm("", viewerUserId));
    setCompanySearchTerm("");
    setCompanySuggestionsOpen(false);
  }

  function handleViewerChange(nextUserId) {
    const normalized = String(nextUserId || "").trim();
    const nextViewer = pipelineUsers.find((item) => item.user_id === normalized);
    if (!nextViewer) return;

    setViewerUserId(nextViewer.user_id);
    setViewerRole(String(nextViewer.role || "sales"));
    setEditingOpportunityId("");
    setForm(() => emptyOpportunityForm("", nextViewer.user_id));
    setCompanySearchTerm("");
    setCompanySuggestionsOpen(false);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(PIPELINE_VIEWER_STORAGE_KEY, nextViewer.user_id);
    }
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

  function handleOpenCustomerHistory(event, item) {
    event.stopPropagation();
    event.preventDefault();
    if (!item?.company_id) {
      setError("Esta oportunidade nao possui cliente vinculado.");
      return;
    }

    setCustomerHistoryModal({
      open: true,
      companyId: item.company_id,
      companyName: item.companies?.trade_name || "Cliente"
    });
  }

  function closeCustomerHistoryModal() {
    setCustomerHistoryModal((prev) => ({
      ...prev,
      open: false
    }));
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
        next.client_whatsapp = formatBrazilPhone(contact.whatsapp || contact.phone || prev.client_whatsapp);
      }
      return next;
    });
  }

  function handleSaveProposalTemplate() {
    if (!proposalEditor || typeof window === "undefined") return;
    window.localStorage.setItem(PROPOSAL_TEMPLATE_STORAGE_KEY, proposalEditor.template_body || DEFAULT_PROPOSAL_TEMPLATE);
    setSuccess("Modelo de proposta salvo como padrao neste navegador.");
  }

  function handleApplyRdTemplate() {
    if (!proposalEditor) return;
    const typeLabel = proposalTypeLabel(proposalEditor.proposal_type);
    setProposalEditor((prev) => (prev ? { ...prev, template_body: getRdTemplateByType(prev.proposal_type) } : prev));
    setSuccess(`Template RD (${typeLabel}) aplicado nesta proposta.`);
  }

  function handleApplyBasicTemplate() {
    setProposalEditor((prev) => (prev ? { ...prev, template_body: BASIC_PROPOSAL_TEMPLATE } : prev));
    setSuccess("Template basico aplicado nesta proposta.");
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
        const normalizedWhats = toWhatsAppBrazilNumber(proposalEditor.client_whatsapp);
        const formattedWhats = formatBrazilPhone(proposalEditor.client_whatsapp);
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
            whatsapp_number: formattedWhats || null,
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
    <section className="module pipeline-module">
      <article className="panel">
        <h2>Pipeline Comercial</h2>
        <p className="muted">Arraste os cards para evoluir a oportunidade para a proxima etapa.</p>
        <div className="pipeline-access-toolbar">
          <label className="settings-field">
            <span>Usuário atual (visão do pipeline)</span>
            <select
              value={viewerUserId}
              onChange={(event) => handleViewerChange(event.target.value)}
              disabled={loadingUsers || !pipelineUsers.length}
            >
              {!pipelineUsers.length ? <option value="">Sem usuários cadastrados</option> : null}
              {pipelineUsers.map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {user.full_name || user.email} ({String(user.role || "sales").toUpperCase()})
                </option>
              ))}
            </select>
          </label>
          <p className="pipeline-access-note">
            {viewerUser
              ? canViewAllOpportunities
                ? "Perfil Gestor/Admin: visualiza todas as oportunidades."
                : "Perfil Vendedor/Backoffice: visualiza apenas as oportunidades do próprio usuário."
              : "Cadastre ao menos um usuário ativo em Configurações para usar o controle de visibilidade."}
          </p>
        </div>
        <div className="pipeline-automation-toggle">
          <label className="checkbox-inline">
            <input type="checkbox" checked={autoProposalMode} onChange={handleToggleAutoProposalMode} />
            Modo automatico de proposta
          </label>
          <p className="pipeline-automation-help">
            Com este modo ativo, cada card permite gerar uma proposta automaticamente no modulo Pedidos.
          </p>
        </div>
        <form className="form-grid pipeline-form-grid" onSubmit={handleSubmit}>
          <div className="pipeline-company-autocomplete">
            <input
              type="text"
              placeholder="Empresa (digite para buscar)"
              value={companySearchTerm}
              onChange={(event) => handleCompanySearchChange(event.target.value)}
              onFocus={() => setCompanySuggestionsOpen(Boolean(companySearchTerm.trim()))}
              onBlur={() => window.setTimeout(() => setCompanySuggestionsOpen(false), 120)}
              required
            />
            {companySuggestionsOpen && companySearchTerm.trim().length >= 1 ? (
              <div className="pipeline-company-suggestions">
                {!companySuggestions.length ? <p className="muted">Nenhuma empresa encontrada.</p> : null}
                {companySuggestions.length ? (
                  <ul className="search-suggestions-list">
                    {companySuggestions.map((company) => (
                      <li key={company.id}>
                        <button
                          type="button"
                          className="search-suggestion-btn"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleSelectCompany(company);
                          }}
                        >
                          <strong>{company.trade_name || "Empresa"}</strong>
                          <span>{company.cnpj ? formatCnpj(company.cnpj) : "Sem CNPJ"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!companySuggestions.length ? (
                  <div className="pipeline-company-suggestions-actions">
                    <button
                      type="button"
                      className="btn-ghost btn-table-action pipeline-create-company-btn"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleRequestCreateCompany}
                    >
                      + Cadastrar nova empresa
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <label className="settings-field">
            <span>Responsável da oportunidade</span>
            <select
              value={form.owner_user_id}
              onChange={(event) => setForm((prev) => ({ ...prev, owner_user_id: event.target.value }))}
              required
              disabled={!assignableOwners.length}
            >
              {!assignableOwners.length ? <option value="">Sem responsável disponível</option> : null}
              {assignableOwners.map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {user.full_name || user.email}
                </option>
              ))}
            </select>
          </label>
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
          <div className="inline-actions pipeline-form-actions">
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
        {!proposalEditor ? (
          <p className="muted">
            Para ver o conteudo da proposta, clique em <strong>Modelo</strong> em qualquer card do pipeline.
          </p>
        ) : null}
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
                      {item.company_id ? (
                        <button
                          type="button"
                          className="pipeline-card-company-link"
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                          }}
                          onClick={(event) => handleOpenCustomerHistory(event, item)}
                        >
                          {item.companies?.trade_name || "Cliente"}
                        </button>
                      ) : (
                        <p className="pipeline-card-company">-</p>
                      )}
                      <p className="pipeline-card-owner">Responsável: {ownerNameById[item.owner_user_id] || "-"}</p>
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
                <select
                  value={proposalEditor.proposal_type || "equipment"}
                  onChange={(event) => handleProposalField("proposal_type", normalizeProposalType(event.target.value))}
                >
                  {SALES_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      Tipo: {type.label}
                    </option>
                  ))}
                </select>
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
                  onChange={(event) => handleProposalField("client_whatsapp", formatBrazilPhone(event.target.value))}
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
                  <button type="button" className="btn-ghost" onClick={handleApplyRdTemplate}>
                    Aplicar template RD
                  </button>
                  <button type="button" className="btn-ghost" onClick={handleApplyBasicTemplate}>
                    Usar template basico
                  </button>
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
                {!hasArtPrinterLogo ? (
                  <p className="warning-text proposal-warning">
                    Logo da Art Printer nao encontrado. Adicione em{" "}
                    <code>frontend/public/logo-art-printer.jpeg</code> ou <code>logo-art-printer.png</code>.
                  </p>
                ) : null}
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
              <div className="proposal-preview-brand">
                {hasArtPrinterLogo ? (
                  <img src={proposalLogoDataUrl} alt="Art Printer" className="proposal-preview-logo" />
                ) : (
                  <strong>art printer</strong>
                )}
              </div>
              <pre>{renderedProposalText}</pre>
            </aside>
          </div>
        </article>
      ) : null}

      <CustomerHistoryModal
        open={customerHistoryModal.open}
        companyId={customerHistoryModal.companyId}
        companyName={customerHistoryModal.companyName}
        onClose={closeCustomerHistoryModal}
      />
    </section>
  );
}
