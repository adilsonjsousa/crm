import { useEffect, useMemo, useRef, useState } from "react";
import {
  createAutomatedProposalFromOpportunity,
  createCompanyInteraction,
  createProposalDocumentVersion,
  createOpportunity,
  deleteOpportunity,
  listCompanyContacts,
  listCompanyOptions,
  listLatestOrdersByOpportunity,
  listOpportunities,
  listProposalCommercialTerms,
  listProposalDocumentVersions,
  listProposalProductProfiles,
  listProposalTemplates,
  listSystemUsers,
  updateOpportunity,
  updateOpportunityStage
} from "../lib/revenueApi";
import { confirmStrongDelete } from "../lib/confirmDelete";
import { PIPELINE_STAGES, canMoveToStage, stageLabel, stageStatus } from "../lib/pipelineStages";
import {
  PRODUCTS_BY_SUBCATEGORY,
  SALES_TYPES,
  composeOpportunityTitleFromItems,
  getSubcategoriesByType,
  parseOpportunityItems,
  parseOpportunityTitle,
  resolveEstimatedValueByProduct
} from "../lib/productCatalog";
import { formatBrazilPhone, toWhatsAppBrazilNumber } from "../lib/phone";
import CustomerHistoryModal from "../components/CustomerHistoryModal";

const PROPOSAL_TEMPLATE_STORAGE_KEY = "crm.pipeline.proposal-template.v1";
const PROPOSAL_TEMPLATE_PROFILES_STORAGE_KEY = "crm.pipeline.proposal-template-profiles.v1";
const PROPOSAL_LOGO_STORAGE_KEY = "crm.pipeline.proposal-logo.v1";
const PIPELINE_VIEWER_STORAGE_KEY = "crm.pipeline.viewer-user-id.v1";
const PIPELINE_FORM_DEFAULTS_STORAGE_KEY = "crm.pipeline.form-defaults.v1";
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

const PRODUCT_TEMPLATE_BY_PRODUCT = [
  {
    key: "canon-imagepress-v700",
    label: "Canon imagePRESS V700",
    match_tokens: ["imagepress v700", "canon imagepress v700"],
    template: [
      "PROPOSTA COMERCIAL {{numero_proposta}}",
      "",
      "Empresa: {{empresa_nome}}",
      "Contato: {{cliente_nome}}",
      "Data de emissao: {{data_emissao}}",
      "Validade: {{validade_dias}} dias",
      "",
      "A QUALIDADE CANON",
      "Lider mundial em sistemas de impressao, a Canon entrega robustez, estabilidade, qualidade de cor e produtividade para operacoes graficas exigentes.",
      "",
      "SUPORTE PREMIUM ARTPRINTER",
      "A ArtPrinter combina tecnologia mundial e suporte local especializado para garantir implantacao segura, treinamento e acompanhamento de performance.",
      "",
      "SOLUCAO RECOMENDADA",
      "- Produto principal: {{produto}}",
      "- Categoria: {{categoria}}",
      "- Itens da oportunidade:",
      "{{itens_oportunidade}}",
      "",
      "DETALHAMENTO TECNICO INICIAL",
      "Plataforma color de alta produtividade para operacao grafica, com ampla compatibilidade de midias e foco em repetibilidade de cor.",
      "Ajuste este bloco conforme configuracao final, acessorios e escopo negociado com o cliente.",
      "",
      "INVESTIMENTO",
      "- Valor total da proposta: {{valor_total}}",
      "",
      "CONDICOES COMERCIAIS",
      "- Condicoes de pagamento: {{condicoes_pagamento}}",
      "- Prazo de entrega/instalacao: {{prazo_entrega}}",
      "- Garantia e suporte: {{garantia}}",
      "",
      "OBSERVACOES",
      "{{observacoes}}",
      "",
      "ACEITE",
      "Responsavel cliente: __________________________________________",
      "Data de aceite: ____/____/________",
      "",
      "Atenciosamente,",
      "Equipe Comercial ArtPrinter"
    ].join("\n")
  }
];

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

function formatDateTimeBr(dateTimeValue) {
  if (!dateTimeValue) return "-";
  const parsed = new Date(dateTimeValue);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("pt-BR");
}

function proposalVersionEventLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "manual_save") return "Snapshot manual";
  if (normalized === "export_docx") return "Exportou DOCX";
  if (normalized === "export_pdf") return "Exportou PDF";
  if (normalized === "send_email") return "Preparou envio e-mail";
  if (normalized === "send_whatsapp") return "Preparou envio WhatsApp";
  return "Atualizacao";
}

function proposalVersionFormatLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "docx") return "DOCX";
  if (normalized === "pdf") return "PDF";
  if (normalized === "email") return "E-mail";
  if (normalized === "whatsapp") return "WhatsApp";
  return "Snapshot";
}

function normalizeProposalLookupKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findTemplateByProduct(productValue = "") {
  const normalizedProduct = normalizeProposalLookupKey(productValue);
  if (!normalizedProduct) return null;

  return (
    PRODUCT_TEMPLATE_BY_PRODUCT.find((entry) =>
      (entry.match_tokens || []).some((token) => normalizedProduct.includes(normalizeProposalLookupKey(token)))
    ) || null
  );
}

function resolveProposalTemplateProfile({ proposalType = "equipment", product = "" } = {}) {
  const productTemplate = findTemplateByProduct(product);
  if (productTemplate?.template) {
    return {
      key: `product:${productTemplate.key}`,
      label: `Produto: ${productTemplate.label}`,
      template: productTemplate.template
    };
  }

  const normalizedType = normalizeProposalType(proposalType);
  return {
    key: `type:${normalizedType}`,
    label: `Tipo: ${proposalTypeLabel(normalizedType)}`,
    template: getRdTemplateByType(normalizedType)
  };
}

function pickSavedTemplateForOpportunity(templates = [], { proposalType = "equipment", product = "" } = {}) {
  const activeTemplates = (templates || [])
    .filter((entry) => Boolean(entry?.is_active) && String(entry?.template_body || "").trim())
    .slice()
    .sort((a, b) => {
      const orderA = Number(a.sort_order || 100);
      const orderB = Number(b.sort_order || 100);
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });
  if (!activeTemplates.length) return null;

  const normalizedType = normalizeProposalType(proposalType);
  const normalizedProduct = normalizeProposalLookupKey(product);

  if (normalizedProduct) {
    const productMatch = activeTemplates.find((entry) => {
      const hint = normalizeProposalLookupKey(entry.product_hint || "");
      if (!hint || hint.length < 3) return false;
      if (entry.proposal_type && normalizeProposalType(entry.proposal_type) !== normalizedType) return false;
      return normalizedProduct.includes(hint);
    });
    if (productMatch) return productMatch;
  }

  const typedMatch = activeTemplates.find(
    (entry) => entry.proposal_type && normalizeProposalType(entry.proposal_type) === normalizedType
  );
  if (typedMatch) return typedMatch;

  const genericMatch = activeTemplates.find((entry) => !entry.proposal_type);
  if (genericMatch) return genericMatch;

  return activeTemplates[0];
}

function pickSavedProductProfileForOpportunity(profiles = [], { proposalType = "equipment", product = "" } = {}) {
  const activeProfiles = (profiles || [])
    .filter((entry) => Boolean(entry?.is_active))
    .slice()
    .sort((a, b) => {
      const orderA = Number(a.sort_order || 100);
      const orderB = Number(b.sort_order || 100);
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });
  if (!activeProfiles.length) return null;

  const normalizedType = normalizeProposalType(proposalType);
  const normalizedProduct = normalizeProposalLookupKey(product);

  if (normalizedProduct) {
    const byCode = activeProfiles.find((entry) => {
      const code = normalizeProposalLookupKey(entry.product_code || "");
      if (!code || code.length < 3) return false;
      if (entry.proposal_type && normalizeProposalType(entry.proposal_type) !== normalizedType) return false;
      return normalizedProduct.includes(code);
    });
    if (byCode) return byCode;

    const byName = activeProfiles.find((entry) => {
      const productName = normalizeProposalLookupKey(entry.product_name || "");
      if (!productName || productName.length < 4) return false;
      if (entry.proposal_type && normalizeProposalType(entry.proposal_type) !== normalizedType) return false;
      return normalizedProduct.includes(productName);
    });
    if (byName) return byName;
  }

  const typed = activeProfiles.find((entry) => entry.proposal_type && normalizeProposalType(entry.proposal_type) === normalizedType);
  if (typed) return typed;

  return activeProfiles[0];
}

function pickDefaultCommercialTerms(terms = []) {
  const activeTerms = (terms || [])
    .filter((entry) => Boolean(entry?.is_active))
    .slice()
    .sort((a, b) => {
      if (Boolean(a.is_default) !== Boolean(b.is_default)) return a.is_default ? -1 : 1;
      const orderA = Number(a.sort_order || 100);
      const orderB = Number(b.sort_order || 100);
      if (orderA !== orderB) return orderA - orderB;
      return String(a.name || "").localeCompare(String(b.name || ""), "pt-BR");
    });
  return activeTerms[0] || null;
}

function readStoredProposalTemplateProfiles() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROPOSAL_TEMPLATE_PROFILES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function getStoredProposalTemplate(profile) {
  if (!profile?.template) return DEFAULT_PROPOSAL_TEMPLATE;
  if (typeof window === "undefined") return profile.template;

  const profileKey = String(profile.key || "").trim();
  const storedByProfile = readStoredProposalTemplateProfiles();
  const storedProfileTemplate =
    profileKey && typeof storedByProfile[profileKey] === "string" ? storedByProfile[profileKey] : "";
  if (String(storedProfileTemplate || "").trim()) return storedProfileTemplate;

  const legacyTemplate = window.localStorage.getItem(PROPOSAL_TEMPLATE_STORAGE_KEY);
  if (String(legacyTemplate || "").trim()) return legacyTemplate;

  return profile.template;
}

function saveStoredProposalTemplate(profileKey, templateBody) {
  if (typeof window === "undefined") return;
  const safeTemplate = String(templateBody || "").trim();
  if (!safeTemplate) return;

  const safeKey = String(profileKey || "").trim();
  if (safeKey) {
    const current = readStoredProposalTemplateProfiles();
    window.localStorage.setItem(
      PROPOSAL_TEMPLATE_PROFILES_STORAGE_KEY,
      JSON.stringify({
        ...current,
        [safeKey]: safeTemplate
      })
    );
  }

  window.localStorage.setItem(PROPOSAL_TEMPLATE_STORAGE_KEY, safeTemplate);
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

  const storedLogo = window.localStorage.getItem(PROPOSAL_LOGO_STORAGE_KEY);
  if (String(storedLogo || "").startsWith("data:image/")) {
    return String(storedLogo);
  }

  for (const logoPath of ART_PRINTER_LOGO_CANDIDATES) {
    try {
      const response = await fetch(logoPath, { cache: "no-store" });
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (!response.ok || !contentType.startsWith("image/")) continue;
      const loadedLogo = await blobToDataUrl(await response.blob());
      if (loadedLogo.startsWith("data:image/")) {
        window.localStorage.setItem(PROPOSAL_LOGO_STORAGE_KEY, loadedLogo);
      }
      return loadedLogo;
    } catch (_err) {
      continue;
    }
  }

  return "";
}

function salesTypeLabel(typeValue) {
  const normalizedType = normalizeProposalType(typeValue);
  return SALES_TYPES.find((entry) => entry.value === normalizedType)?.label || proposalTypeLabel(normalizedType);
}

function normalizeCommercialItemQuantity(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.round(parsed * 1000) / 1000);
}

function normalizeCommercialItemDiscount(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
}

function normalizeProposalCommercialItem(item = {}, fallbackType = "equipment") {
  const normalizedType = normalizeProposalType(item.item_type || item.opportunity_type || fallbackType);
  const subcategory = String(item.title_subcategory || "").trim();
  const product = String(item.title_product || "").trim();
  const descriptionRaw = String(item.item_description || "").trim();
  const description =
    descriptionRaw ||
    (subcategory && product ? `${subcategory} - ${product}` : product || subcategory || String(item.title || "").trim());
  const unitPrice = toPositiveMoneyNumber(item.unit_price ?? item.estimated_value);
  const quantity = normalizeCommercialItemQuantity(item.quantity, 1);
  const discountPercent = normalizeCommercialItemDiscount(item.discount_percent, 0);

  return {
    item_type: normalizedType,
    item_code: String(item.item_code || item.product_code || "").trim(),
    item_description: description,
    quantity,
    unit_price: unitPrice,
    discount_percent: discountPercent,
    title_subcategory: subcategory,
    title_product: product
  };
}

function computeCommercialItemSubtotal(item = {}) {
  const quantity = normalizeCommercialItemQuantity(item.quantity, 1);
  const unitPrice = toPositiveMoneyNumber(item.unit_price);
  const discountPercent = normalizeCommercialItemDiscount(item.discount_percent, 0);
  const factor = 1 - discountPercent / 100;
  return Math.max(0, quantity * unitPrice * factor);
}

function buildCommercialItemsFromOpportunityItems(items = []) {
  return (items || [])
    .map((entry) => normalizeProposalCommercialItem(entry, entry.opportunity_type || "equipment"))
    .filter((entry) => String(entry.item_description || "").trim());
}

function ensureProposalCommercialItems(items = [], fallbackItems = []) {
  const normalized = (items || [])
    .map((entry) => normalizeProposalCommercialItem(entry))
    .filter((entry) => String(entry.item_description || "").trim());
  if (normalized.length) return normalized;
  return buildCommercialItemsFromOpportunityItems(fallbackItems);
}

function computeProposalCommercialItemsTotal(items = []) {
  return (items || []).reduce((acc, entry) => acc + computeCommercialItemSubtotal(entry), 0);
}

function buildProposalItemsListText(items = []) {
  if (!items.length) return "Nenhum item cadastrado.";
  return items
    .map((entry, index) => {
      const normalized = normalizeProposalCommercialItem(entry);
      const typeLabel = salesTypeLabel(normalized.item_type);
      const subtotal = computeCommercialItemSubtotal(normalized);
      const discount = normalizeCommercialItemDiscount(normalized.discount_percent, 0);
      const discountLabel = discount > 0 ? `, desconto ${discount.toLocaleString("pt-BR")} %` : "";
      return `${index + 1}. ${typeLabel} | ${normalized.item_description} | qtd ${normalized.quantity.toLocaleString("pt-BR")} x ${brl(
        normalized.unit_price
      )}${discountLabel} = ${brl(subtotal)}`;
    })
    .join("\n");
}

function buildProposalItemsSummaryText(items = []) {
  if (!items.length) return "";
  return items.map((entry) => normalizeProposalCommercialItem(entry).item_description).join(" | ");
}

function buildProposalItemsTableHtml(items = []) {
  if (!items.length) {
    return `<p class="items-empty">Nenhum item da oportunidade foi informado.</p>`;
  }

  const rowsHtml = items
    .map((entry, index) => {
      const normalized = normalizeProposalCommercialItem(entry);
      const subtotal = computeCommercialItemSubtotal(normalized);
      const discount = normalizeCommercialItemDiscount(normalized.discount_percent, 0);
      return `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(normalized.item_description || "-")}</td>
        <td class="is-right">${escapeHtml(normalized.quantity.toLocaleString("pt-BR"))}</td>
        <td class="is-right">${escapeHtml(brl(normalized.unit_price))}</td>
        <td class="is-right">${escapeHtml(discount > 0 ? `${discount.toLocaleString("pt-BR")} %` : "-")}</td>
        <td class="is-right">${escapeHtml(brl(subtotal))}</td>
      </tr>`;
    })
    .join("");
  const totalValue = computeProposalCommercialItemsTotal(items);
  return `<table class="items-table" cellspacing="0" cellpadding="0">
    <thead>
      <tr>
        <th>#</th>
        <th>Produto ou servico</th>
        <th class="is-right">Qtd.</th>
        <th class="is-right">Preco unit.</th>
        <th class="is-right">Desconto</th>
        <th class="is-right">Sub-total</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">Valor total do pedido</td>
        <td class="is-right">${escapeHtml(brl(totalValue))}</td>
      </tr>
    </tfoot>
  </table>`;
}

function buildProposalDocumentHtml({
  proposalNumber,
  companyName,
  renderedText,
  logoDataUrl,
  issueDate,
  validityDays,
  items,
  freightTerms = "",
  paymentTerms = "",
  deliveryTerms = ""
}) {
  const textHtml = escapeHtml(renderedText).replace(/\n/g, "<br />");
  const logoHtml = logoDataUrl
    ? `<img class="brand-logo" src="${escapeHtml(logoDataUrl)}" alt="Art Printer" />`
    : `<p class="brand-fallback">art printer</p>`;
  const safeIssueDate = escapeHtml(formatDateBr(issueDate) || "-");
  const safeValidity = escapeHtml(String(validityDays || "-"));
  const itemsTableHtml = buildProposalItemsTableHtml(items);
  const safeFreightTerms = escapeHtml(String(freightTerms || "-"));
  const safePaymentTerms = escapeHtml(String(paymentTerms || "-"));
  const safeDeliveryTerms = escapeHtml(String(deliveryTerms || "-"));
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(proposalNumber || "Proposta Comercial")}</title>
    <style>
      @page {
        size: A4;
        margin: 16mm 14mm;
      }
      body {
        font-family: Arial, Helvetica, sans-serif;
        margin: 0;
        color: #1f2937;
        background: #ffffff;
      }
      .sheet {
        border: 1px solid #d8dbeb;
        border-radius: 14px;
        overflow: hidden;
      }
      .letterhead {
        padding: 16px 18px 12px;
        background: linear-gradient(180deg, #f8f5ff 0%, #f3edff 100%);
        border-bottom: 2px solid #7c3aed;
      }
      .brand-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
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
      .meta-row {
        margin-top: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .meta-pill {
        border: 1px solid #d8dbeb;
        border-radius: 8px;
        background: #ffffff;
        padding: 8px 10px;
      }
      .meta-pill strong {
        display: block;
        margin-bottom: 2px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #6b7280;
      }
      .meta-pill span {
        font-size: 13px;
        font-weight: 700;
        color: #1f2937;
      }
      .proposal-content {
        padding: 14px 18px 18px;
      }
      .proposal-content h1 {
        margin: 0 0 6px;
        font-size: 22px;
      }
      .proposal-content .company-name {
        margin: 0;
        color: #4b5563;
        font-size: 13px;
      }
      .conditions-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .condition-card {
        border: 1px solid #e4e7f2;
        border-radius: 10px;
        background: #faf8ff;
        padding: 8px 10px;
      }
      .condition-card strong {
        display: block;
        margin-bottom: 4px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #5b21b6;
      }
      .condition-card span {
        display: block;
        font-size: 12px;
        color: #2f3645;
        line-height: 1.45;
      }
      .section-title {
        margin: 14px 0 8px;
        font-size: 13px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #5b21b6;
      }
      .content {
        border: 1px solid #d1d5db;
        border-radius: 12px;
        padding: 16px;
        line-height: 1.55;
        font-size: 13px;
        background: #ffffff;
      }
      .items-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        overflow: hidden;
        font-size: 12px;
      }
      .items-table th,
      .items-table td {
        border-bottom: 1px solid #e4e7f2;
        padding: 8px 10px;
        text-align: left;
      }
      .items-table thead th {
        background: #f4f1ff;
        color: #5b21b6;
        font-weight: 700;
      }
      .items-table tfoot td {
        font-weight: 700;
        background: #faf8ff;
      }
      .items-table .is-right {
        text-align: right;
      }
      .items-empty {
        margin: 0;
        border: 1px dashed #d1d5db;
        border-radius: 8px;
        padding: 8px 10px;
        color: #6b7280;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="letterhead">
        <div class="brand-row">${logoHtml}</div>
        <div class="meta-row">
          <div class="meta-pill">
            <strong>Data de emissao</strong>
            <span>${safeIssueDate}</span>
          </div>
          <div class="meta-pill">
            <strong>Validade</strong>
            <span>${safeValidity} dias</span>
          </div>
          <div class="meta-pill">
            <strong>Documento</strong>
            <span>${escapeHtml(proposalNumber || "Proposta Comercial")}</span>
          </div>
        </div>
      </div>
      <div class="proposal-content">
        <h1>${escapeHtml(proposalNumber || "Proposta Comercial")}</h1>
        <p class="company-name">${escapeHtml(companyName || "Cliente")}</p>
        <h2 class="section-title">Condicoes gerais</h2>
        <div class="conditions-grid">
          <div class="condition-card">
            <strong>Frete</strong>
            <span>${safeFreightTerms}</span>
          </div>
          <div class="condition-card">
            <strong>Prazo de entrega</strong>
            <span>${safeDeliveryTerms}</span>
          </div>
          <div class="condition-card">
            <strong>Prazo de pagamento</strong>
            <span>${safePaymentTerms}</span>
          </div>
          <div class="condition-card">
            <strong>Validade da proposta</strong>
            <span>${safeValidity} dias</span>
          </div>
        </div>
        <h2 class="section-title">Itens da oportunidade</h2>
        ${itemsTableHtml}
        <h2 class="section-title">Texto da proposta</h2>
        <div class="content">${textHtml}</div>
      </div>
    </div>
  </body>
</html>`;
}

function downloadBlobFile({ fileName, blob }) {
  if (!blob) return;
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

const OPPORTUNITY_SUBCATEGORY_BY_KEY = SALES_TYPES.flatMap((type) => getSubcategoriesByType(type.value)).reduce((acc, subcategory) => {
  acc[normalizeLookupText(subcategory)] = subcategory;
  return acc;
}, {});

function canonicalizeOpportunitySubcategory(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  return OPPORTUNITY_SUBCATEGORY_BY_KEY[normalizeLookupText(rawValue)] || rawValue;
}

function appendUniqueProduct(targetList, seenSet, value) {
  const productName = String(value || "").trim();
  if (!productName) return;
  const productKey = normalizeLookupText(productName);
  if (!productKey || seenSet.has(productKey)) return;
  seenSet.add(productKey);
  targetList.push(productName);
}

function resolveEstimatedValueByProfile(titleSubcategory, titleProduct, profiles = []) {
  const productKey = normalizeLookupText(titleProduct);
  if (!productKey) return null;
  const subcategoryKey = normalizeLookupText(canonicalizeOpportunitySubcategory(titleSubcategory));

  let fallbackProfile = null;
  for (const profile of profiles || []) {
    const profileProductKey = normalizeLookupText(profile?.product_name);
    if (profileProductKey !== productKey) continue;
    const profileSubcategoryKey = normalizeLookupText(canonicalizeOpportunitySubcategory(profile?.product_subcategory));
    if (!subcategoryKey || !profileSubcategoryKey || profileSubcategoryKey === subcategoryKey) {
      fallbackProfile = profile;
      if (subcategoryKey && profileSubcategoryKey === subcategoryKey) break;
    }
  }

  if (!fallbackProfile) return null;
  const parsed = Number(String(fallbackProfile.base_price ?? "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return String(value || "");
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function normalizePipelineFormDefaults(rawDefaults = {}) {
  const normalizedType = SALES_TYPES.some((item) => item.value === rawDefaults.opportunity_type)
    ? String(rawDefaults.opportunity_type)
    : "equipment";
  const normalizedStage = PIPELINE_STAGES.some((stage) => stage.value === rawDefaults.stage)
    ? String(rawDefaults.stage)
    : "lead";
  const normalizedSubcategory = String(rawDefaults.title_subcategory || "").trim();
  const availableSubcategories = getSubcategoriesByType(normalizedType);
  const safeSubcategory = normalizedSubcategory && availableSubcategories.includes(normalizedSubcategory) ? normalizedSubcategory : "";

  return {
    opportunity_type: normalizedType,
    title_subcategory: safeSubcategory,
    stage: normalizedStage
  };
}

function readPipelineFormDefaults() {
  if (typeof window === "undefined") return normalizePipelineFormDefaults();
  try {
    const raw = window.localStorage.getItem(PIPELINE_FORM_DEFAULTS_STORAGE_KEY);
    if (!raw) return normalizePipelineFormDefaults();
    return normalizePipelineFormDefaults(JSON.parse(raw));
  } catch {
    return normalizePipelineFormDefaults();
  }
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function emptyOpportunityForm(defaultCompanyId = "", defaultOwnerUserId = "", rawDefaults = null) {
  const defaults = normalizePipelineFormDefaults(rawDefaults || {});
  return {
    company_id: defaultCompanyId,
    owner_user_id: defaultOwnerUserId,
    opportunity_type: defaults.opportunity_type,
    title_subcategory: defaults.title_subcategory,
    title_product: "",
    stage: defaults.stage,
    estimated_value: "",
    expected_close_date: todayYmd()
  };
}

function toPositiveMoneyNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeOpportunityItem(item = {}) {
  const type = SALES_TYPES.some((entry) => entry.value === item.opportunity_type)
    ? String(item.opportunity_type)
    : "equipment";
  const titleSubcategory = String(item.title_subcategory || "").trim();
  const titleProduct = String(item.title_product || "").trim();
  const mappedValue = resolveEstimatedValueByProduct(titleSubcategory, titleProduct);
  const typedValue = String(item.estimated_value ?? "").trim();
  const fallbackValue = toPositiveMoneyNumber(item.estimated_value);
  const estimatedValue = typedValue ? fallbackValue : mappedValue === null ? fallbackValue : mappedValue;

  return {
    opportunity_type: type,
    title_subcategory: titleSubcategory,
    title_product: titleProduct,
    estimated_value: estimatedValue
  };
}

function isOpportunityItemComplete(item = {}) {
  return Boolean(String(item.title_subcategory || "").trim() && String(item.title_product || "").trim());
}

function parseOpportunityLineItems(opportunity = {}) {
  const dbItems = Array.isArray(opportunity?.line_items)
    ? opportunity.line_items.map((entry) => normalizeOpportunityItem(entry)).filter((entry) => isOpportunityItemComplete(entry))
    : [];
  if (dbItems.length) return dbItems;

  return parseOpportunityItems(opportunity?.title || "")
    .map((entry) =>
      normalizeOpportunityItem({
        opportunity_type: entry.opportunity_type,
        title_subcategory: entry.title_subcategory,
        title_product: entry.title_product,
        estimated_value: resolveEstimatedValueByProduct(entry.title_subcategory, entry.title_product)
      })
    )
    .filter((entry) => isOpportunityItemComplete(entry));
}

function ensureProposalItems(items = [], fallbackItem = null) {
  const normalizedItems = (items || []).map((entry) => normalizeOpportunityItem(entry)).filter((entry) => isOpportunityItemComplete(entry));
  if (normalizedItems.length) return normalizedItems;
  if (!fallbackItem) return [];
  const fallbackNormalized = normalizeOpportunityItem(fallbackItem);
  return isOpportunityItemComplete(fallbackNormalized) ? [fallbackNormalized] : [];
}

function createProposalDraft({
  opportunity,
  linkedOrder,
  contacts,
  templates = [],
  productProfiles = [],
  commercialTerms = []
}) {
  const parsedTitle = parseOpportunityTitle(opportunity?.title || "");
  const parsedItems = parseOpportunityLineItems(opportunity);
  const fallbackPrimaryItem = normalizeOpportunityItem({
    opportunity_type: parsedTitle.opportunity_type,
    title_subcategory: parsedTitle.title_subcategory,
    title_product: parsedTitle.title_product || String(opportunity?.title || "").trim(),
    estimated_value: opportunity?.estimated_value
  });
  const opportunityItems = ensureProposalItems(parsedItems, fallbackPrimaryItem);
  const primaryItem = opportunityItems[0] || fallbackPrimaryItem;
  const proposalType = normalizeProposalType(primaryItem.opportunity_type || parsedTitle.opportunity_type);
  const templateProfile = resolveProposalTemplateProfile({
    proposalType,
    product: primaryItem.title_product
  });
  const selectedProductProfile = pickSavedProductProfileForOpportunity(productProfiles, {
    proposalType,
    product: primaryItem.title_product
  });
  const selectedCommercialTerms = pickDefaultCommercialTerms(commercialTerms);
  const selectedTemplate = pickSavedTemplateForOpportunity(templates, {
    proposalType,
    product: primaryItem.title_product
  });
  const preferredContact = pickPreferredContact(contacts);
  const today = new Date().toISOString().slice(0, 10);
  let commercialItems = buildCommercialItemsFromOpportunityItems(opportunityItems);
  if (!commercialItems.length && selectedProductProfile) {
    commercialItems = [
      normalizeProposalCommercialItem({
        item_type: selectedProductProfile.proposal_type || proposalType,
        item_code: selectedProductProfile.product_code || "",
        item_description: selectedProductProfile.product_name || primaryItem.title_product || "Produto",
        quantity: 1,
        unit_price: toPositiveMoneyNumber(selectedProductProfile.base_price),
        discount_percent: 0
      })
    ];
  }
  if (selectedProductProfile && commercialItems.length) {
    commercialItems = commercialItems.map((entry, index) =>
      index === 0
        ? normalizeProposalCommercialItem({
            ...entry,
            item_type: selectedProductProfile.proposal_type || entry.item_type,
            item_code: entry.item_code || selectedProductProfile.product_code || "",
            item_description: entry.item_description || selectedProductProfile.product_name || "",
            unit_price:
              toPositiveMoneyNumber(entry.unit_price) > 0
                ? toPositiveMoneyNumber(entry.unit_price)
                : toPositiveMoneyNumber(selectedProductProfile.base_price)
          })
        : entry
    );
  }

  const commercialItemsTotal = computeProposalCommercialItemsTotal(commercialItems);
  const fallbackTotal = Number(opportunity?.estimated_value ?? commercialItemsTotal ?? 0);
  const linkedOrderTotal = Number(linkedOrder?.total_amount ?? 0);
  const totalValue = linkedOrderTotal > 0 ? linkedOrderTotal : fallbackTotal > 0 ? fallbackTotal : commercialItemsTotal;

  return {
    opportunity_id: opportunity?.id || "",
    company_id: opportunity?.company_id || "",
    proposal_number: linkedOrder?.order_number || buildDraftProposalNumber(opportunity?.id),
    issue_date: today,
    validity_days: "7",
    proposal_type: proposalType,
    category: selectedProductProfile?.product_subcategory || primaryItem.title_subcategory || "",
    product: selectedProductProfile?.product_name || primaryItem.title_product || String(opportunity?.title || "").trim(),
    opportunity_items: opportunityItems,
    commercial_items: commercialItems,
    selected_template_id: selectedTemplate?.id || "",
    selected_template_name: selectedTemplate?.name || "",
    template_profile_key: templateProfile.key,
    template_profile_label: templateProfile.label,
    estimated_value: Number.isFinite(totalValue) ? totalValue : 0,
    selected_product_profile_id: selectedProductProfile?.id || "",
    selected_product_profile_name: selectedProductProfile?.name || "",
    profile_product_code: selectedProductProfile?.product_code || "",
    profile_headline: selectedProductProfile?.headline || "",
    profile_intro_text: selectedProductProfile?.intro_text || "",
    profile_technical_text: selectedProductProfile?.technical_text || "",
    profile_video_url: selectedProductProfile?.video_url || "",
    profile_included_accessories: selectedProductProfile?.included_accessories || "",
    profile_optional_accessories: selectedProductProfile?.optional_accessories || "",
    selected_commercial_terms_id: selectedCommercialTerms?.id || "",
    selected_commercial_terms_name: selectedCommercialTerms?.name || "",
    payment_terms:
      selectedCommercialTerms?.payment_terms || "50% de entrada e 50% na entrega/instalacao.",
    freight_terms: "FOB Blumenau / SC (frete por conta do destinatario).",
    delivery_terms: "Entrega em ate 15 dias uteis apos aprovacao.",
    warranty_terms: "Garantia de 12 meses contra defeitos de fabricacao.",
    included_offer: selectedCommercialTerms?.included_offer || "",
    excluded_offer: selectedCommercialTerms?.excluded_offer || "",
    financing_terms: selectedCommercialTerms?.financing_terms || "",
    closing_text: selectedCommercialTerms?.closing_text || "",
    notes: "",
    contact_id: preferredContact?.id || "",
    client_name: preferredContact?.full_name || opportunity?.companies?.trade_name || "Cliente",
    client_email: preferredContact?.email || opportunity?.companies?.email || "",
    client_whatsapp: formatBrazilPhone(preferredContact?.whatsapp || preferredContact?.phone || opportunity?.companies?.phone || ""),
    send_channel: "whatsapp",
    enable_send: false,
    template_body: selectedTemplate?.template_body || getStoredProposalTemplate(templateProfile)
  };
}

export default function PipelineModule({
  onRequestCreateCompany = null,
  prefillCompanyDraft = null,
  prefillCompanyRequest = 0
}) {
  const handledPrefillRequestRef = useRef(0);
  const pipelineDefaultsRef = useRef(readPipelineFormDefaults());
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
  const [savingOpportunity, setSavingOpportunity] = useState(false);
  const [deletingOpportunityId, setDeletingOpportunityId] = useState("");
  const [creatingProposalId, setCreatingProposalId] = useState("");
  const [proposalsByOpportunity, setProposalsByOpportunity] = useState({});
  const [autoProposalMode, setAutoProposalMode] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("crm.pipeline.auto-proposal-mode") !== "0";
  });
  const [proposalEditor, setProposalEditor] = useState(null);
  const [proposalContacts, setProposalContacts] = useState([]);
  const [proposalLoadingContacts, setProposalLoadingContacts] = useState(false);
  const [savedProposalTemplates, setSavedProposalTemplates] = useState([]);
  const [savedProposalTemplatesLoading, setSavedProposalTemplatesLoading] = useState(false);
  const [savedProposalProductProfiles, setSavedProposalProductProfiles] = useState([]);
  const [savedProposalCommercialTerms, setSavedProposalCommercialTerms] = useState([]);
  const [proposalVersions, setProposalVersions] = useState([]);
  const [proposalVersionsLoading, setProposalVersionsLoading] = useState(false);
  const [proposalExporting, setProposalExporting] = useState("");
  const [proposalLogoDataUrl, setProposalLogoDataUrl] = useState("");
  const [sendingProposal, setSendingProposal] = useState(false);
  const [customerHistoryModal, setCustomerHistoryModal] = useState({
    open: false,
    companyId: "",
    companyName: ""
  });
  const [form, setForm] = useState(() => emptyOpportunityForm("", "", pipelineDefaultsRef.current));
  const [opportunityItems, setOpportunityItems] = useState([]);
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
  const productOptionsBySubcategory = useMemo(() => {
    const merged = {};
    const seenBySubcategory = {};

    function ensureBucket(subcategory) {
      if (!merged[subcategory]) merged[subcategory] = [];
      if (!seenBySubcategory[subcategory]) seenBySubcategory[subcategory] = new Set();
      return {
        items: merged[subcategory],
        seen: seenBySubcategory[subcategory]
      };
    }

    for (const [subcategory, products] of Object.entries(PRODUCTS_BY_SUBCATEGORY || {})) {
      const canonicalSubcategory = canonicalizeOpportunitySubcategory(subcategory);
      if (!canonicalSubcategory) continue;
      const bucket = ensureBucket(canonicalSubcategory);
      for (const product of products || []) {
        appendUniqueProduct(bucket.items, bucket.seen, product);
      }
    }

    for (const profile of savedProposalProductProfiles || []) {
      const canonicalSubcategory = canonicalizeOpportunitySubcategory(profile?.product_subcategory);
      if (!canonicalSubcategory) continue;
      const bucket = ensureBucket(canonicalSubcategory);
      appendUniqueProduct(bucket.items, bucket.seen, profile?.product_name);
    }

    return merged;
  }, [savedProposalProductProfiles]);
  const productsForSelectedSubcategory = useMemo(
    () => productOptionsBySubcategory[form.title_subcategory] || [],
    [form.title_subcategory, productOptionsBySubcategory]
  );
  const draftOpportunityItem = useMemo(
    () =>
      normalizeOpportunityItem({
        opportunity_type: form.opportunity_type,
        title_subcategory: form.title_subcategory,
        title_product: form.title_product,
        estimated_value: form.estimated_value
      }),
    [form.estimated_value, form.opportunity_type, form.title_product, form.title_subcategory]
  );
  const draftItemIsComplete = useMemo(() => isOpportunityItemComplete(draftOpportunityItem), [draftOpportunityItem]);
  const allOpportunityItems = useMemo(
    () => (draftItemIsComplete ? [...opportunityItems, draftOpportunityItem] : opportunityItems),
    [draftItemIsComplete, draftOpportunityItem, opportunityItems]
  );
  const opportunityItemsTotalValue = useMemo(
    () => allOpportunityItems.reduce((acc, item) => acc + toPositiveMoneyNumber(item.estimated_value), 0),
    [allOpportunityItems]
  );

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

  const proposalItemsForDocument = useMemo(() => {
    if (!proposalEditor) return [];
    const fallbackItems = ensureProposalItems(proposalEditor.opportunity_items, {
      opportunity_type: proposalEditor.proposal_type,
      title_subcategory: proposalEditor.category,
      title_product: proposalEditor.product,
      estimated_value: proposalEditor.estimated_value
    });
    return ensureProposalCommercialItems(proposalEditor.commercial_items, fallbackItems);
  }, [proposalEditor]);

  const proposalTemplateProfile = useMemo(() => {
    if (!proposalEditor) return null;
    return resolveProposalTemplateProfile({
      proposalType: proposalEditor.proposal_type,
      product: proposalEditor.product
    });
  }, [proposalEditor?.proposal_type, proposalEditor?.product]);

  const proposalCompanyName = useMemo(() => {
    if (!proposalEditor) return "";
    return items.find((item) => item.id === proposalEditor.opportunity_id)?.companies?.trade_name || proposalEditor.client_name || "";
  }, [items, proposalEditor]);

  const proposalVariables = useMemo(() => {
    if (!proposalEditor) return {};
    const itemsTotal = computeProposalCommercialItemsTotal(proposalItemsForDocument);
    const explicitValue = toPositiveMoneyNumber(proposalEditor.estimated_value);
    const totalValue = explicitValue > 0 ? explicitValue : itemsTotal;
    return {
      numero_proposta: proposalEditor.proposal_number,
      cliente_nome: proposalEditor.client_name,
      empresa_nome: proposalCompanyName || proposalEditor.client_name,
      data_emissao: formatDateBr(proposalEditor.issue_date),
      validade_dias: proposalEditor.validity_days,
      categoria: proposalEditor.category,
      produto: proposalEditor.product,
      valor_total: brl(totalValue),
      frete: proposalEditor.freight_terms || "-",
      itens_oportunidade: buildProposalItemsListText(proposalItemsForDocument),
      resumo_itens: buildProposalItemsSummaryText(proposalItemsForDocument) || "Sem itens detalhados.",
      quantidade_itens: String(proposalItemsForDocument.length),
      condicoes_pagamento: proposalEditor.payment_terms,
      prazo_entrega: proposalEditor.delivery_terms,
      garantia: proposalEditor.warranty_terms,
      inclui_oferta: proposalEditor.included_offer || "-",
      nao_inclui_oferta: proposalEditor.excluded_offer || "-",
      financiamento: proposalEditor.financing_terms || "-",
      texto_fechamento: proposalEditor.closing_text || "-",
      perfil_titulo: proposalEditor.profile_headline || "-",
      perfil_intro: proposalEditor.profile_intro_text || "-",
      perfil_tecnico: proposalEditor.profile_technical_text || "-",
      perfil_codigo_produto: proposalEditor.profile_product_code || "-",
      perfil_acessorios_inclusos: proposalEditor.profile_included_accessories || "-",
      perfil_acessorios_opcionais: proposalEditor.profile_optional_accessories || "-",
      observacoes: proposalEditor.notes || "Sem observacoes adicionais."
    };
  }, [proposalCompanyName, proposalEditor, proposalItemsForDocument]);

  const renderedProposalText = useMemo(() => {
    if (!proposalEditor) return "";
    return renderProposalTemplate(proposalEditor.template_body, proposalVariables);
  }, [proposalEditor, proposalVariables]);

  const renderedProposalHtml = useMemo(() => {
    if (!proposalEditor) return "";
    return buildProposalDocumentHtml({
      proposalNumber: proposalEditor.proposal_number,
      companyName: proposalCompanyName || proposalEditor.client_name,
      renderedText: renderedProposalText,
      logoDataUrl: proposalLogoDataUrl,
      issueDate: proposalEditor.issue_date,
      validityDays: proposalEditor.validity_days,
      items: proposalItemsForDocument,
      freightTerms: proposalEditor.freight_terms,
      paymentTerms: proposalEditor.payment_terms,
      deliveryTerms: proposalEditor.delivery_terms
    });
  }, [proposalCompanyName, proposalEditor, renderedProposalText, proposalLogoDataUrl, proposalItemsForDocument]);

  const proposalDocumentPayload = useMemo(() => {
    if (!proposalEditor) return null;
    return {
      proposalNumber: proposalEditor.proposal_number,
      companyName: proposalCompanyName || proposalEditor.client_name,
      issueDate: formatDateBr(proposalEditor.issue_date),
      validityDays: proposalEditor.validity_days,
      freightTerms: proposalEditor.freight_terms,
      paymentTerms: proposalEditor.payment_terms,
      deliveryTerms: proposalEditor.delivery_terms,
      renderedText: renderedProposalText,
      logoDataUrl: proposalLogoDataUrl,
      items: proposalItemsForDocument
    };
  }, [proposalCompanyName, proposalEditor, proposalItemsForDocument, proposalLogoDataUrl, renderedProposalText]);

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

  async function loadSavedProposalTemplates({ silent = false } = {}) {
    if (!silent) setSavedProposalTemplatesLoading(true);
    try {
      const templates = await listProposalTemplates({ includeInactive: false });
      setSavedProposalTemplates(templates);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setSavedProposalTemplatesLoading(false);
    }
  }

  async function loadSavedProposalProductProfiles() {
    try {
      const profiles = await listProposalProductProfiles({ includeInactive: false });
      setSavedProposalProductProfiles((profiles || []).filter((entry) => Boolean(entry?.is_active)));
    } catch (_err) {
      setSavedProposalProductProfiles([]);
    }
  }

  async function loadSavedProposalCommercialTerms() {
    try {
      const terms = await listProposalCommercialTerms({ includeInactive: false });
      setSavedProposalCommercialTerms((terms || []).filter((entry) => Boolean(entry?.is_active)));
    } catch (_err) {
      setSavedProposalCommercialTerms([]);
    }
  }

  async function loadProposalVersions(opportunityId, { silent = false } = {}) {
    const normalizedOpportunityId = String(opportunityId || "").trim();
    if (!normalizedOpportunityId) {
      setProposalVersions([]);
      return;
    }

    if (!silent) setProposalVersionsLoading(true);
    try {
      const versions = await listProposalDocumentVersions(normalizedOpportunityId, { limit: 20 });
      setProposalVersions(versions);
    } catch (err) {
      if (!silent) setError(err.message);
      setProposalVersions([]);
    } finally {
      if (!silent) setProposalVersionsLoading(false);
    }
  }

  async function persistProposalDocumentVersion({ eventType, outputFormat, fileName = "", extraSnapshot = {} } = {}) {
    if (!proposalEditor) {
      return { warning: "Proposta nao selecionada para versionamento." };
    }

    const linkedOrder = proposalsByOpportunity[proposalEditor.opportunity_id] || null;
    const companyName = proposalCompanyName || proposalEditor.client_name || "";
    const itemsTotal = computeProposalCommercialItemsTotal(proposalItemsForDocument);
    const explicitValue = toPositiveMoneyNumber(proposalEditor.estimated_value);
    const finalValue = explicitValue > 0 ? explicitValue : itemsTotal;

    try {
      const createdVersion = await createProposalDocumentVersion({
        opportunity_id: proposalEditor.opportunity_id,
        company_id: proposalEditor.company_id || null,
        sales_order_id: linkedOrder?.id || null,
        proposal_number: proposalEditor.proposal_number || "",
        template_id: proposalEditor.selected_template_id || null,
        template_name:
          proposalEditor.selected_template_name || proposalTemplateProfile?.label || proposalEditor.template_profile_label || null,
        event_type: eventType || "manual_save",
        output_format: outputFormat || "snapshot",
        file_name: fileName || null,
        created_by_user_id: viewerUserId || null,
        snapshot: {
          editor: proposalEditor,
          company_name: companyName,
          rendered_text: renderedProposalText,
          rendered_html: renderedProposalHtml,
          placeholders: proposalVariables,
          commercial_items: proposalItemsForDocument,
          totals: {
            items_total: itemsTotal,
            proposal_value: finalValue
          },
          extra: extraSnapshot || {},
          saved_at: new Date().toISOString()
        }
      });

      setProposalVersions((prev) => [createdVersion, ...prev.filter((entry) => entry.id !== createdVersion.id)].slice(0, 20));
      return { version: createdVersion, warning: "" };
    } catch (err) {
      return { warning: err.message || "Falha ao salvar versao da proposta." };
    }
  }

  useEffect(() => {
    loadUsersContext();
  }, []);

  useEffect(() => {
    load();
  }, [viewerUserId, viewerRole]);

  useEffect(() => {
    loadSavedProposalTemplates({ silent: true });
    loadSavedProposalProductProfiles();
    loadSavedProposalCommercialTerms();
  }, []);

  useEffect(() => {
    const nextDefaults = normalizePipelineFormDefaults({
      opportunity_type: form.opportunity_type,
      title_subcategory: form.title_subcategory,
      stage: form.stage
    });
    pipelineDefaultsRef.current = nextDefaults;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PIPELINE_FORM_DEFAULTS_STORAGE_KEY, JSON.stringify(nextDefaults));
    }
  }, [form.opportunity_type, form.title_subcategory, form.stage]);

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
    setForm(() => emptyOpportunityForm(prefillCompanyId || companyById?.id || "", viewerUserId, pipelineDefaultsRef.current));
    setOpportunityItems([]);
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

  function handleAddOpportunityItem() {
    setError("");
    setSuccess("");

    if (!draftItemIsComplete) {
      setError("Preencha categoria, sub-categoria e produto para adicionar o item.");
      return;
    }

    setOpportunityItems((prev) => [...prev, draftOpportunityItem]);
    setForm((prev) => ({
      ...prev,
      title_product: "",
      estimated_value: ""
    }));
  }

  function handleRemoveOpportunityItem(index) {
    const safeIndex = Number(index);
    if (!Number.isFinite(safeIndex) || safeIndex < 0) return;
    setOpportunityItems((prev) => prev.filter((_, itemIndex) => itemIndex !== safeIndex));
  }

  function handleEditOpportunityItem(index) {
    const safeIndex = Number(index);
    if (!Number.isFinite(safeIndex) || safeIndex < 0) return;
    const selectedItem = opportunityItems[safeIndex];
    if (!selectedItem) return;

    setForm((prev) => ({
      ...prev,
      opportunity_type: selectedItem.opportunity_type || "equipment",
      title_subcategory: selectedItem.title_subcategory || "",
      title_product: selectedItem.title_product || "",
      estimated_value: String(selectedItem.estimated_value ?? "")
    }));
    setOpportunityItems((prev) => prev.filter((_, itemIndex) => itemIndex !== safeIndex));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (savingOpportunity) return;
    const submitIntent = String(event?.nativeEvent?.submitter?.value || "save");
    const createAnotherAfterSave = !editingOpportunityId && submitIntent === "save_and_create";
    let postSaveSuccessMessage = "";

    try {
      if (!form.company_id) {
        setError("Selecione uma empresa cadastrada.");
        return;
      }
      if (!allOpportunityItems.length) {
        setError("Adicione ao menos um item na oportunidade.");
        return;
      }

      const title = composeOpportunityTitleFromItems(allOpportunityItems);
      if (!title) {
        setError("Não foi possível montar o título da oportunidade com os itens informados.");
        return;
      }

      const payload = {
        company_id: form.company_id,
        owner_user_id: form.owner_user_id || viewerUserId || null,
        title,
        line_items: allOpportunityItems,
        stage: form.stage,
        status: stageStatus(form.stage),
        estimated_value: opportunityItemsTotalValue,
        expected_close_date: form.expected_close_date || null
      };

      setSavingOpportunity(true);
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

      if (editingOpportunityId) {
        setEditingOpportunityId("");
        setForm(emptyOpportunityForm("", viewerUserId, pipelineDefaultsRef.current));
        setOpportunityItems([]);
        setCompanySearchTerm("");
        postSaveSuccessMessage = "Oportunidade atualizada com sucesso.";
      } else if (createAnotherAfterSave) {
        setForm((prev) => ({
          ...prev,
          title_subcategory: "",
          title_product: "",
          estimated_value: "",
          expected_close_date: todayYmd()
        }));
        setOpportunityItems([]);
        postSaveSuccessMessage = "Oportunidade salva. Formulário mantido para cadastrar a próxima.";
      } else {
        setForm(emptyOpportunityForm("", viewerUserId, pipelineDefaultsRef.current));
        setOpportunityItems([]);
        setCompanySearchTerm("");
        postSaveSuccessMessage = "Oportunidade salva com sucesso.";
      }
      setCompanySuggestionsOpen(false);
      await load();
      if (postSaveSuccessMessage) {
        setSuccess(postSaveSuccessMessage);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingOpportunity(false);
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
    const dbItems = Array.isArray(item.line_items)
      ? item.line_items.map((entry) => normalizeOpportunityItem(entry)).filter((entry) => isOpportunityItemComplete(entry))
      : [];
    const parsedTitleItems = parseOpportunityItems(item.title).map((entry) =>
      normalizeOpportunityItem({
        opportunity_type: entry.opportunity_type,
        title_subcategory: entry.title_subcategory,
        title_product: entry.title_product,
        estimated_value: resolveEstimatedValueByProduct(entry.title_subcategory, entry.title_product)
      })
    );
    const effectiveItems = dbItems.length ? dbItems : parsedTitleItems;
    const fallbackFirst = parseOpportunityTitle(item.title);
    const firstItem = effectiveItems[0] || normalizeOpportunityItem(fallbackFirst);
    const remainingItems = effectiveItems.slice(1);
    const firstItemEstimated = Number(
      firstItem.estimated_value ??
        item.estimated_value ??
        resolveEstimatedValueByProduct(firstItem.title_subcategory, firstItem.title_product) ??
        0
    );
    const companyLabel =
      item.companies?.trade_name || companies.find((company) => company.id === item.company_id)?.trade_name || "";
    setEditingOpportunityId(item.id);
    setOpportunityItems(remainingItems);
    setForm({
      company_id: item.company_id || "",
      owner_user_id: item.owner_user_id || viewerUserId,
      opportunity_type: firstItem.opportunity_type || "equipment",
      title_subcategory: firstItem.title_subcategory,
      title_product: firstItem.title_product,
      stage: item.stage || "lead",
      estimated_value: String(firstItemEstimated ?? ""),
      expected_close_date: item.expected_close_date || ""
    });
    setCompanySearchTerm(companyLabel);
    setCompanySuggestionsOpen(false);
  }

  function cancelEditOpportunity() {
    setError("");
    setSuccess("");
    setEditingOpportunityId("");
    setForm(emptyOpportunityForm("", viewerUserId, pipelineDefaultsRef.current));
    setOpportunityItems([]);
    setCompanySearchTerm("");
    setCompanySuggestionsOpen(false);
  }

  async function handleDeleteOpportunity(event, item) {
    event.stopPropagation();
    const opportunityId = String(item?.id || "").trim();
    if (!opportunityId) return;

    const confirmed = await confirmStrongDelete({
      entityLabel: "a oportunidade",
      itemLabel: String(item?.title || "").trim() || "Sem título"
    });
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingOpportunityId(opportunityId);

    try {
      await deleteOpportunity(opportunityId);
      if (editingOpportunityId === opportunityId) {
        cancelEditOpportunity();
      }
      if (proposalEditor?.opportunity_id === opportunityId) {
        setProposalEditor(null);
        setProposalContacts([]);
        setProposalVersions([]);
      }
      setProposalsByOpportunity((prev) => {
        const next = { ...prev };
        delete next[opportunityId];
        return next;
      });
      await load();
      setSuccess("Oportunidade excluída com sucesso.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingOpportunityId("");
    }
  }

  function handleViewerChange(nextUserId) {
    const normalized = String(nextUserId || "").trim();
    const nextViewer = pipelineUsers.find((item) => item.user_id === normalized);
    if (!nextViewer) return;

    setViewerUserId(nextViewer.user_id);
    setViewerRole(String(nextViewer.role || "sales"));
    setEditingOpportunityId("");
    setForm(() => emptyOpportunityForm("", nextViewer.user_id, pipelineDefaultsRef.current));
    setOpportunityItems([]);
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
    setProposalVersionsLoading(true);

    try {
      const [contacts, templates, profiles, terms, versions] = await Promise.all([
        item.company_id ? listCompanyContacts(item.company_id) : Promise.resolve([]),
        listProposalTemplates({ includeInactive: false }),
        listProposalProductProfiles({ includeInactive: false }),
        listProposalCommercialTerms({ includeInactive: false }),
        listProposalDocumentVersions(item.id, { limit: 20 })
      ]);
      const linkedOrder = proposalsByOpportunity[item.id] || null;
      setSavedProposalTemplates(templates);
      setSavedProposalProductProfiles((profiles || []).filter((entry) => Boolean(entry?.is_active)));
      setSavedProposalCommercialTerms((terms || []).filter((entry) => Boolean(entry?.is_active)));
      setProposalContacts(contacts);
      setProposalVersions(versions || []);
      setProposalEditor(
        createProposalDraft({
          opportunity: item,
          linkedOrder,
          contacts,
          templates,
          productProfiles: profiles,
          commercialTerms: terms
        })
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setProposalLoadingContacts(false);
      setProposalVersionsLoading(false);
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
    setProposalVersions([]);
    setProposalVersionsLoading(false);
    setProposalExporting("");
  }

  function handleProposalField(field, value) {
    setProposalEditor((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (field === "proposal_type" || field === "product") {
        const nextProfile = resolveProposalTemplateProfile({
          proposalType: next.proposal_type,
          product: next.product
        });
        next.template_profile_key = nextProfile.key;
        next.template_profile_label = nextProfile.label;
      }
      return next;
    });
  }

  function handleProposalCommercialItemChange(index, field, value) {
    const safeIndex = Number(index);
    if (!Number.isFinite(safeIndex) || safeIndex < 0) return;

    setProposalEditor((prev) => {
      if (!prev) return prev;
      const currentItems = ensureProposalCommercialItems(prev.commercial_items, prev.opportunity_items);
      if (!currentItems[safeIndex]) return prev;

      const nextItems = currentItems.map((entry, itemIndex) => {
        if (itemIndex !== safeIndex) return entry;
        const current = { ...entry };
        if (field === "item_type") current.item_type = normalizeProposalType(value);
        if (field === "item_code") current.item_code = String(value || "").trim();
        if (field === "item_description") current.item_description = String(value || "").trim();
        if (field === "quantity") current.quantity = normalizeCommercialItemQuantity(value, 1);
        if (field === "unit_price") current.unit_price = toPositiveMoneyNumber(value);
        if (field === "discount_percent") current.discount_percent = normalizeCommercialItemDiscount(value, 0);
        return normalizeProposalCommercialItem(current, current.item_type);
      });

      const nextTotal = computeProposalCommercialItemsTotal(nextItems);
      return {
        ...prev,
        commercial_items: nextItems,
        estimated_value: nextTotal
      };
    });
  }

  function handleAddProposalCommercialItem() {
    setProposalEditor((prev) => {
      if (!prev) return prev;
      const currentItems = ensureProposalCommercialItems(prev.commercial_items, prev.opportunity_items);
      const nextItems = [
        ...currentItems,
        normalizeProposalCommercialItem({
          item_type: prev.proposal_type || "equipment",
          item_code: "",
          item_description: "",
          quantity: 1,
          unit_price: 0,
          discount_percent: 0
        })
      ];
      const nextTotal = computeProposalCommercialItemsTotal(nextItems);
      return {
        ...prev,
        commercial_items: nextItems,
        estimated_value: nextTotal
      };
    });
  }

  function handleRemoveProposalCommercialItem(index) {
    const safeIndex = Number(index);
    if (!Number.isFinite(safeIndex) || safeIndex < 0) return;

    setProposalEditor((prev) => {
      if (!prev) return prev;
      const currentItems = ensureProposalCommercialItems(prev.commercial_items, prev.opportunity_items);
      const nextItems = currentItems.filter((_, itemIndex) => itemIndex !== safeIndex);
      const nextTotal = computeProposalCommercialItemsTotal(nextItems);
      return {
        ...prev,
        commercial_items: nextItems,
        estimated_value: nextTotal
      };
    });
  }

  function handleProposalProductProfileSelection(profileId) {
    const selectedId = String(profileId || "").trim();
    const selectedProfile = savedProposalProductProfiles.find((item) => String(item.id || "") === selectedId) || null;

    setProposalEditor((prev) => {
      if (!prev) return prev;
      if (!selectedProfile) {
        return {
          ...prev,
          selected_product_profile_id: "",
          selected_product_profile_name: "",
          profile_product_code: "",
          profile_headline: "",
          profile_intro_text: "",
          profile_technical_text: "",
          profile_video_url: "",
          profile_included_accessories: "",
          profile_optional_accessories: ""
        };
      }

      const currentItems = ensureProposalCommercialItems(prev.commercial_items, prev.opportunity_items);
      const nextItems = currentItems.length
        ? currentItems.map((entry, itemIndex) =>
            itemIndex === 0
              ? normalizeProposalCommercialItem({
                  ...entry,
                  item_type: selectedProfile.proposal_type || entry.item_type,
                  item_code: selectedProfile.product_code || entry.item_code,
                  item_description: selectedProfile.product_name || entry.item_description,
                  unit_price:
                    toPositiveMoneyNumber(entry.unit_price) > 0
                      ? toPositiveMoneyNumber(entry.unit_price)
                      : toPositiveMoneyNumber(selectedProfile.base_price)
                })
              : entry
          )
        : [
            normalizeProposalCommercialItem({
              item_type: selectedProfile.proposal_type || prev.proposal_type,
              item_code: selectedProfile.product_code || "",
              item_description: selectedProfile.product_name || "Produto",
              quantity: 1,
              unit_price: toPositiveMoneyNumber(selectedProfile.base_price),
              discount_percent: 0
            })
          ];

      const nextType = selectedProfile.proposal_type
        ? normalizeProposalType(selectedProfile.proposal_type)
        : normalizeProposalType(prev.proposal_type);
      const nextProduct = selectedProfile.product_name || prev.product;
      const nextTemplateProfile = resolveProposalTemplateProfile({
        proposalType: nextType,
        product: nextProduct
      });
      const nextTotal = computeProposalCommercialItemsTotal(nextItems);

      return {
        ...prev,
        proposal_type: nextType,
        category: selectedProfile.product_subcategory || prev.category,
        product: nextProduct,
        template_profile_key: nextTemplateProfile.key,
        template_profile_label: nextTemplateProfile.label,
        selected_product_profile_id: selectedProfile.id,
        selected_product_profile_name: selectedProfile.name || "",
        profile_product_code: selectedProfile.product_code || "",
        profile_headline: selectedProfile.headline || "",
        profile_intro_text: selectedProfile.intro_text || "",
        profile_technical_text: selectedProfile.technical_text || "",
        profile_video_url: selectedProfile.video_url || "",
        profile_included_accessories: selectedProfile.included_accessories || "",
        profile_optional_accessories: selectedProfile.optional_accessories || "",
        commercial_items: nextItems,
        estimated_value: nextTotal
      };
    });

    if (selectedProfile) {
      setSuccess(`Perfil aplicado: ${selectedProfile.name}.`);
    }
  }

  function handleProposalCommercialTermsSelection(termsId) {
    const selectedId = String(termsId || "").trim();
    const selectedTerms = savedProposalCommercialTerms.find((item) => String(item.id || "") === selectedId) || null;

    setProposalEditor((prev) => {
      if (!prev) return prev;
      if (!selectedTerms) {
        return {
          ...prev,
          selected_commercial_terms_id: "",
          selected_commercial_terms_name: ""
        };
      }
      return {
        ...prev,
        selected_commercial_terms_id: selectedTerms.id,
        selected_commercial_terms_name: selectedTerms.name || "",
        payment_terms: selectedTerms.payment_terms || prev.payment_terms,
        included_offer: selectedTerms.included_offer || "",
        excluded_offer: selectedTerms.excluded_offer || "",
        financing_terms: selectedTerms.financing_terms || "",
        closing_text: selectedTerms.closing_text || prev.closing_text
      };
    });

    if (selectedTerms) {
      setSuccess(`Condições comerciais aplicadas: ${selectedTerms.name}.`);
    }
  }

  function handleProposalTemplateSelection(templateId) {
    const selectedId = String(templateId || "").trim();
    const selectedTemplate = savedProposalTemplates.find((item) => String(item.id || "") === selectedId);
    setProposalEditor((prev) => {
      if (!prev) return prev;
      if (!selectedTemplate) {
        return {
          ...prev,
          selected_template_id: "",
          selected_template_name: ""
        };
      }
      return {
        ...prev,
        selected_template_id: selectedTemplate.id,
        selected_template_name: selectedTemplate.name || "",
        template_body: String(selectedTemplate.template_body || prev.template_body || "")
      };
    });
    if (selectedTemplate) {
      setSuccess(`Template aplicado: ${selectedTemplate.name}.`);
    }
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
    if (!proposalEditor) return;
    const profile = resolveProposalTemplateProfile({
      proposalType: proposalEditor.proposal_type,
      product: proposalEditor.product
    });
    saveStoredProposalTemplate(profile.key, proposalEditor.template_body || profile.template);
    setSuccess(`Modelo salvo como padrao para ${profile.label.toLowerCase()}.`);
  }

  function handleApplyRecommendedTemplate() {
    if (!proposalEditor) return;
    const selectedTemplate = pickSavedTemplateForOpportunity(savedProposalTemplates, {
      proposalType: proposalEditor.proposal_type,
      product: proposalEditor.product
    });
    if (selectedTemplate) {
      setProposalEditor((prev) =>
        prev
          ? {
              ...prev,
              selected_template_id: selectedTemplate.id,
              selected_template_name: selectedTemplate.name || "",
              template_body: String(selectedTemplate.template_body || prev.template_body || "")
            }
          : prev
      );
      setSuccess(`Template recomendado aplicado (${selectedTemplate.name}).`);
      return;
    }

    const profile = resolveProposalTemplateProfile({
      proposalType: proposalEditor.proposal_type,
      product: proposalEditor.product
    });
    setProposalEditor((prev) =>
      prev
        ? {
            ...prev,
            selected_template_id: "",
            selected_template_name: "",
            template_profile_key: profile.key,
            template_profile_label: profile.label,
            template_body: getStoredProposalTemplate(profile)
          }
        : prev
    );
    setSuccess(`Template recomendado aplicado (${profile.label}).`);
  }

  function handleApplyRdTemplate() {
    if (!proposalEditor) return;
    const typeLabel = proposalTypeLabel(proposalEditor.proposal_type);
    setProposalEditor((prev) =>
      prev
        ? {
          ...prev,
          selected_template_id: "",
          selected_template_name: "",
          template_profile_key: `type:${normalizeProposalType(prev.proposal_type)}`,
          template_profile_label: `Tipo: ${typeLabel}`,
          template_body: getRdTemplateByType(prev.proposal_type)
        }
        : prev
    );
    setSuccess(`Template RD (${typeLabel}) aplicado nesta proposta.`);
  }

  function handleApplyBasicTemplate() {
    setProposalEditor((prev) =>
      prev
        ? {
          ...prev,
          selected_template_id: "",
          selected_template_name: "",
          template_profile_key: "basic",
          template_profile_label: "Basico",
          template_body: BASIC_PROPOSAL_TEMPLATE
        }
        : prev
    );
    setSuccess("Template basico aplicado nesta proposta.");
  }

  async function handleProposalLogoUpload(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!String(file.type || "").startsWith("image/")) {
      setError("Selecione um arquivo de imagem valido para o logo.");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await blobToDataUrl(file);
      if (!String(dataUrl || "").startsWith("data:image/")) {
        throw new Error("Arquivo de imagem invalido.");
      }
      setProposalLogoDataUrl(dataUrl);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PROPOSAL_LOGO_STORAGE_KEY, dataUrl);
      }
      setSuccess("Logo do papel timbrado atualizado para esta proposta.");
    } catch (err) {
      setError(err.message || "Falha ao carregar logo.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSaveProposalSnapshot() {
    if (!proposalEditor) return;

    setProposalExporting("snapshot");
    setError("");
    setSuccess("");

    try {
      const { warning } = await persistProposalDocumentVersion({
        eventType: "manual_save",
        outputFormat: "snapshot",
        fileName: "",
        extraSnapshot: {
          trigger: "manual_button"
        }
      });
      if (warning) {
        setError(`Snapshot nao salvo: ${warning}`);
        return;
      }
      setSuccess("Snapshot da proposta salvo no historico.");
    } finally {
      setProposalExporting("");
    }
  }

  async function handleSaveProposalDocx() {
    if (!proposalEditor || !proposalDocumentPayload) return;

    setProposalExporting("docx");
    setError("");
    setSuccess("");

    try {
      const fileName = `${sanitizeFilePart(proposalEditor.proposal_number)}-${sanitizeFilePart(proposalEditor.client_name)}.docx`;
      const { buildProposalDocxBlob } = await import("../lib/proposalDocumentExport");
      const documentBlob = await buildProposalDocxBlob(proposalDocumentPayload);
      downloadBlobFile({
        fileName,
        blob: documentBlob
      });

      const { warning } = await persistProposalDocumentVersion({
        eventType: "export_docx",
        outputFormat: "docx",
        fileName,
        extraSnapshot: {
          trigger: "docx_export"
        }
      });
      if (warning) {
        setSuccess(`Arquivo DOCX salvo (${fileName}), mas sem registrar versao: ${warning}`);
        return;
      }
      setSuccess(`Arquivo DOCX salvo (${fileName}).`);
    } catch (err) {
      setError(err.message || "Falha ao gerar arquivo DOCX.");
    } finally {
      setProposalExporting("");
    }
  }

  async function handleSaveProposalPdf() {
    if (!proposalEditor || !proposalDocumentPayload) return;

    setProposalExporting("pdf");
    setError("");
    setSuccess("");

    try {
      const fileName = `${sanitizeFilePart(proposalEditor.proposal_number)}-${sanitizeFilePart(proposalEditor.client_name)}.pdf`;
      const { buildProposalPdfBlob } = await import("../lib/proposalDocumentExport");
      const pdfBlob = buildProposalPdfBlob(proposalDocumentPayload);
      downloadBlobFile({
        fileName,
        blob: pdfBlob
      });

      const { warning } = await persistProposalDocumentVersion({
        eventType: "export_pdf",
        outputFormat: "pdf",
        fileName,
        extraSnapshot: {
          trigger: "pdf_export"
        }
      });
      if (warning) {
        setSuccess(`Arquivo PDF salvo (${fileName}), mas sem registrar versao: ${warning}`);
        return;
      }
      setSuccess(`Arquivo PDF salvo (${fileName}).`);
    } catch (err) {
      setError(err.message || "Falha ao gerar arquivo PDF.");
    } finally {
      setProposalExporting("");
    }
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

        const { warning: versionWarning } = await persistProposalDocumentVersion({
          eventType: "send_whatsapp",
          outputFormat: "whatsapp",
          fileName: "",
          extraSnapshot: {
            channel: "whatsapp",
            recipient: formattedWhats || normalizedWhats || ""
          }
        });
        const warningMessages = [interactionWarning, versionWarning].filter(Boolean);

        setSuccess(
          warningMessages.length
            ? "WhatsApp aberto, mas houve alerta no registro de historico/auditoria."
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
        `${subject}\n\n${renderedProposalText}\n\nAnexo: incluir o arquivo PDF ou DOCX gerado no CRM.`
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

      const { warning: versionWarning } = await persistProposalDocumentVersion({
        eventType: "send_email",
        outputFormat: "email",
        fileName: "",
        extraSnapshot: {
          channel: "email",
          recipient: email
        }
      });
      const warningMessages = [interactionWarning, versionWarning].filter(Boolean);

      setSuccess(
        warningMessages.length
          ? "Cliente de e-mail aberto, mas houve alerta no registro de historico/auditoria."
          : "Cliente de e-mail aberto. Anexe o PDF ou DOCX antes de enviar."
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
          <label className="settings-field">
            <span>Categoria do item</span>
            <select
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
              {SALES_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span>Sub-categoria</span>
            <select
              value={form.title_subcategory}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  title_subcategory: e.target.value,
                  title_product: "",
                  estimated_value: ""
                }))
              }
            >
              <option value="">Selecione a sub-categoria</option>
              {getSubcategoriesByType(form.opportunity_type).map((subcategory) => (
                <option key={subcategory} value={subcategory}>
                  {subcategory}
                </option>
              ))}
            </select>
          </label>
          <input
            list="pipeline-product-options"
            placeholder="Produto (ex.: CANON imagePRESS V700)"
            value={form.title_product}
            onChange={(e) =>
              setForm((prev) => {
                const nextProduct = e.target.value;
                const mappedEstimatedValue = resolveEstimatedValueByProduct(prev.title_subcategory, nextProduct);
                const profileEstimatedValue = resolveEstimatedValueByProfile(
                  prev.title_subcategory,
                  nextProduct,
                  savedProposalProductProfiles
                );
                const resolvedEstimatedValue = mappedEstimatedValue === null ? profileEstimatedValue : mappedEstimatedValue;
                return {
                  ...prev,
                  title_product: nextProduct,
                  estimated_value: resolvedEstimatedValue === null ? "" : String(resolvedEstimatedValue)
                };
              })
            }
            disabled={!form.title_subcategory}
          />
          <datalist id="pipeline-product-options">
            {productsForSelectedSubcategory.map((product) => (
              <option key={product} value={product} />
            ))}
          </datalist>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Valor do item"
            value={form.estimated_value}
            onChange={(e) => setForm((prev) => ({ ...prev, estimated_value: e.target.value }))}
          />
          <button type="button" className="btn-ghost" onClick={handleAddOpportunityItem}>
            + Adicionar item
          </button>
          <div className="pipeline-items-panel">
            <p className="pipeline-items-title">Itens adicionados ({opportunityItems.length})</p>
            {!opportunityItems.length ? <p className="muted">Nenhum item adicionado.</p> : null}
            {opportunityItems.length ? (
              <ul className="pipeline-items-list">
                {opportunityItems.map((entry, index) => (
                  <li key={`${entry.opportunity_type}-${entry.title_subcategory}-${entry.title_product}-${index}`}>
                    <button
                      type="button"
                      className="btn-ghost btn-table-action"
                      onClick={() => handleEditOpportunityItem(index)}
                      title="Editar item"
                    >
                      {SALES_TYPES.find((type) => type.value === entry.opportunity_type)?.label || "Categoria"} · {entry.title_subcategory} · {entry.title_product}
                    </button>
                    <span>{brl(entry.estimated_value)}</span>
                    <button
                      type="button"
                      className="btn-ghost btn-table-action"
                      onClick={() => handleRemoveOpportunityItem(index)}
                      title="Remover item"
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {draftItemIsComplete ? (
              <p className="pipeline-items-draft">
                Item em edição (ainda não adicionado):{" "}
                <strong>
                  {SALES_TYPES.find((type) => type.value === draftOpportunityItem.opportunity_type)?.label || "Categoria"} ·{" "}
                  {draftOpportunityItem.title_subcategory} · {draftOpportunityItem.title_product}
                </strong>{" "}
                ({brl(draftOpportunityItem.estimated_value)})
              </p>
            ) : null}
            <p className="pipeline-items-total">Valor total da oportunidade: {brl(opportunityItemsTotalValue)}</p>
          </div>
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
            <button type="submit" value="save" className="btn-primary" disabled={savingOpportunity}>
              {savingOpportunity ? "Salvando..." : editingOpportunityId ? "Atualizar oportunidade" : "Salvar oportunidade"}
            </button>
            {!editingOpportunityId ? (
              <button type="submit" value="save_and_create" className="btn-ghost" disabled={savingOpportunity}>
                {savingOpportunity ? "Salvando..." : "Salvar e criar outra"}
              </button>
            ) : null}
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
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          disabled={deletingOpportunityId === item.id}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => handleDeleteOpportunity(event, item)}
                        >
                          {deletingOpportunityId === item.id ? "Excluindo..." : "Excluir"}
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
                Personalize o texto da proposta, gere DOCX/PDF real e registre versoes para auditoria.
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
                <select
                  value={proposalEditor.selected_product_profile_id || ""}
                  onChange={(event) => handleProposalProductProfileSelection(event.target.value)}
                >
                  <option value="">Perfil de produto (opcional)</option>
                  {savedProposalProductProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                      {profile.product_subcategory ? ` · ${profile.product_subcategory}` : ""}
                      {profile.product_code ? ` · ${profile.product_code}` : ""}
                    </option>
                  ))}
                </select>
                <select
                  value={proposalEditor.selected_commercial_terms_id || ""}
                  onChange={(event) => handleProposalCommercialTermsSelection(event.target.value)}
                >
                  <option value="">Condições comerciais (opcional)</option>
                  {savedProposalCommercialTerms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                      {term.is_default ? " · Padrão" : ""}
                    </option>
                  ))}
                </select>
                <select
                  value={proposalEditor.selected_template_id || ""}
                  onChange={(event) => handleProposalTemplateSelection(event.target.value)}
                >
                  <option value="">Template salvo (manual)</option>
                  {savedProposalTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.proposal_type
                        ? ` · ${SALES_TYPES.find((type) => type.value === template.proposal_type)?.label || "Tipo"}`
                        : " · Todos os tipos"}
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
                  placeholder="Frete"
                  value={proposalEditor.freight_terms}
                  onChange={(event) => handleProposalField("freight_terms", event.target.value)}
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
                  placeholder="Incluso na oferta"
                  value={proposalEditor.included_offer}
                  onChange={(event) => handleProposalField("included_offer", event.target.value)}
                />
                <textarea
                  placeholder="Nao incluso na oferta"
                  value={proposalEditor.excluded_offer}
                  onChange={(event) => handleProposalField("excluded_offer", event.target.value)}
                />
                <textarea
                  placeholder="Condições de financiamento"
                  value={proposalEditor.financing_terms}
                  onChange={(event) => handleProposalField("financing_terms", event.target.value)}
                />
                <textarea
                  placeholder="Texto de fechamento"
                  value={proposalEditor.closing_text}
                  onChange={(event) => handleProposalField("closing_text", event.target.value)}
                />
                <textarea
                  placeholder="Observacoes"
                  value={proposalEditor.notes}
                  onChange={(event) => handleProposalField("notes", event.target.value)}
                />
                <div className="proposal-commercial-items">
                  <div className="proposal-commercial-items-header">
                    <strong>Itens comerciais da proposta</strong>
                    <button type="button" className="btn-ghost btn-table-action" onClick={handleAddProposalCommercialItem}>
                      + Adicionar item
                    </button>
                  </div>
                  <div className="proposal-commercial-items-list">
                    {(proposalEditor.commercial_items || []).map((entry, index) => {
                      const subtotal = computeCommercialItemSubtotal(entry);
                      return (
                        <div className="proposal-commercial-item-row" key={`${entry.item_code || "item"}-${index}`}>
                          <select
                            value={entry.item_type || "equipment"}
                            onChange={(event) => handleProposalCommercialItemChange(index, "item_type", event.target.value)}
                          >
                            {SALES_TYPES.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                          <input
                            placeholder="Código"
                            value={entry.item_code || ""}
                            onChange={(event) => handleProposalCommercialItemChange(index, "item_code", event.target.value)}
                          />
                          <input
                            placeholder="Produto ou serviço"
                            value={entry.item_description || ""}
                            onChange={(event) =>
                              handleProposalCommercialItemChange(index, "item_description", event.target.value)
                            }
                          />
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Qtd"
                            value={entry.quantity ?? 1}
                            onChange={(event) => handleProposalCommercialItemChange(index, "quantity", event.target.value)}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Preço unit."
                            value={entry.unit_price ?? 0}
                            onChange={(event) => handleProposalCommercialItemChange(index, "unit_price", event.target.value)}
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="Desc. %"
                            value={entry.discount_percent ?? 0}
                            onChange={(event) =>
                              handleProposalCommercialItemChange(index, "discount_percent", event.target.value)
                            }
                          />
                          <div className="proposal-commercial-item-subtotal">{brl(subtotal)}</div>
                          <button
                            type="button"
                            className="btn-ghost btn-table-action"
                            onClick={() => handleRemoveProposalCommercialItem(index)}
                          >
                            Remover
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="proposal-commercial-items-total">
                    Total dos itens: <strong>{brl(computeProposalCommercialItemsTotal(proposalEditor.commercial_items || []))}</strong>
                  </p>
                </div>
                <textarea
                  className="proposal-template-input"
                  placeholder="Modelo da proposta"
                  value={proposalEditor.template_body}
                  onChange={(event) => handleProposalField("template_body", event.target.value)}
                />
                <p className="proposal-placeholder-help">
                  Template atual:{" "}
                  <strong>
                    {proposalEditor.selected_template_name ||
                      proposalTemplateProfile?.label ||
                      proposalEditor.template_profile_label ||
                      "Manual"}
                  </strong>
                  {" · "}
                  {proposalItemsForDocument.length} item(ns) na oportunidade.
                </p>
                <p className="proposal-placeholder-help">
                  Perfil: <strong>{proposalEditor.selected_product_profile_name || "Nao selecionado"}</strong>
                  {" · "}Condições: <strong>{proposalEditor.selected_commercial_terms_name || "Nao selecionadas"}</strong>
                </p>
                {!savedProposalTemplates.length ? (
                  <p className="warning-text proposal-warning">
                    Nenhum template salvo em Configurações. Você pode criar templates e depois aplicar por oportunidade.
                  </p>
                ) : null}
                <p className="proposal-placeholder-help">
                  Placeholders:{" "}
                  <code>{"{{numero_proposta}}"}</code>, <code>{"{{cliente_nome}}"}</code>,{" "}
                  <code>{"{{empresa_nome}}"}</code>, <code>{"{{data_emissao}}"}</code>,{" "}
                  <code>{"{{validade_dias}}"}</code>, <code>{"{{categoria}}"}</code>,{" "}
                  <code>{"{{produto}}"}</code>, <code>{"{{valor_total}}"}</code>,{" "}
                  <code>{"{{itens_oportunidade}}"}</code>, <code>{"{{resumo_itens}}"}</code>,{" "}
                  <code>{"{{quantidade_itens}}"}</code>,{" "}
                  <code>{"{{frete}}"}</code>, <code>{"{{condicoes_pagamento}}"}</code>,{" "}
                  <code>{"{{prazo_entrega}}"}</code>, <code>{"{{garantia}}"}</code>,{" "}
                  <code>{"{{inclui_oferta}}"}</code>, <code>{"{{nao_inclui_oferta}}"}</code>,{" "}
                  <code>{"{{financiamento}}"}</code>, <code>{"{{texto_fechamento}}"}</code>,{" "}
                  <code>{"{{perfil_titulo}}"}</code>, <code>{"{{perfil_intro}}"}</code>,{" "}
                  <code>{"{{perfil_tecnico}}"}</code>, <code>{"{{observacoes}}"}</code>
                </p>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => loadSavedProposalTemplates({ silent: false })}
                    disabled={savedProposalTemplatesLoading || Boolean(proposalExporting)}
                  >
                    {savedProposalTemplatesLoading ? "Atualizando templates..." : "Atualizar templates"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={handleApplyRecommendedTemplate}>
                    Aplicar recomendado
                  </button>
                  <button type="button" className="btn-ghost" onClick={handleApplyRdTemplate}>
                    Aplicar template RD
                  </button>
                  <button type="button" className="btn-ghost" onClick={handleApplyBasicTemplate}>
                    Usar template basico
                  </button>
                  <button type="button" className="btn-ghost" onClick={handleSaveProposalTemplate}>
                    Salvar modelo padrao
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={handleSaveProposalSnapshot}
                    disabled={Boolean(proposalExporting)}
                  >
                    {proposalExporting === "snapshot" ? "Salvando..." : "Salvar versao"}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveProposalDocx}
                    disabled={Boolean(proposalExporting)}
                  >
                    {proposalExporting === "docx" ? "Gerando DOCX..." : "Salvar .DOCX"}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveProposalPdf}
                    disabled={Boolean(proposalExporting)}
                  >
                    {proposalExporting === "pdf" ? "Gerando PDF..." : "Salvar .PDF"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => loadProposalVersions(proposalEditor.opportunity_id, { silent: false })}
                    disabled={proposalVersionsLoading || Boolean(proposalExporting)}
                  >
                    {proposalVersionsLoading ? "Atualizando historico..." : "Atualizar historico"}
                  </button>
                </div>
                {!hasArtPrinterLogo ? (
                  <p className="warning-text proposal-warning">
                    Logo da Art Printer nao encontrado. Envie abaixo o logo para aplicar no papel timbrado.
                  </p>
                ) : null}
                <label className="settings-field">
                  <span>Logo timbrado (JPG/PNG)</span>
                  <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={handleProposalLogoUpload} />
                </label>
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
              <p className="muted">Itens da oportunidade: {proposalItemsForDocument.length}</p>
              <pre>{renderedProposalText}</pre>
              <div className="proposal-versions">
                <div className="proposal-versions-header">
                  <h5>Historico de versoes</h5>
                  <span>{proposalVersions.length}</span>
                </div>
                {proposalVersionsLoading ? (
                  <p className="muted">Carregando versoes...</p>
                ) : proposalVersions.length ? (
                  <ul className="proposal-versions-list">
                    {proposalVersions.map((version) => (
                      <li key={version.id} className="proposal-version-item">
                        <strong>V{version.version_number}</strong>
                        <span>{proposalVersionEventLabel(version.event_type)}</span>
                        <span>{proposalVersionFormatLabel(version.output_format)}</span>
                        <span>{formatDateTimeBr(version.created_at)}</span>
                        {version.file_name ? <span>{version.file_name}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Nenhuma versao salva nesta oportunidade.</p>
                )}
              </div>
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
