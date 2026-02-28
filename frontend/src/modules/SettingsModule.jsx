import { useEffect, useMemo, useState } from "react";
import {
  createCompanyLifecycleStage,
  createProposalCommercialTerms,
  createProposalCppRow,
  createProposalProductProfile,
  createProposalTemplate,
  createSystemUser,
  deleteCompanyLifecycleStage,
  deleteProposalCommercialTerms,
  deleteProposalCppRow,
  deleteProposalProductProfile,
  deleteProposalTemplate,
  importWhatsAppContactsBatch,
  listCompanyLifecycleStages,
  listCompanyOptions,
  listOmieCustomerSyncJobs,
  listProposalCommercialTerms,
  listProposalCppRows,
  listProposalProductProfiles,
  listProposalTemplates,
  listRdStationSyncJobs,
  listSystemUsers,
  saveCompanyLifecycleStageOrder,
  sendSystemUserPasswordReset,
  syncRdStationCrm,
  syncLegacyProductCatalogToProposalProfiles,
  syncOmieCustomers,
  updateCompanyLifecycleStage,
  updateProposalCommercialTerms,
  updateProposalCppRow,
  updateProposalProductProfile,
  updateProposalTemplate,
  updateSystemUser
} from "../lib/revenueApi";
import { confirmStrongDelete } from "../lib/confirmDelete";
import { getSubcategoriesByType } from "../lib/productCatalog";

const OMIE_STORAGE_KEY = "crm.settings.omie.customers.v1";
const OMIE_COOKIE_KEY = "crm.settings.omie.customers.cookie.v1";
const RDSTATION_STORAGE_KEY = "crm.settings.rdstation.crm.v1";
const DEFAULT_OMIE_URL = "https://app.omie.com.br/api/v1/geral/clientes/";
const DEFAULT_RDSTATION_URL = "https://api.rd.services/crm/v2";
const OMIE_SYNC_PAGE_CHUNK_DRY_RUN = 3;
const OMIE_SYNC_PAGE_CHUNK_LIVE = 1;
const OMIE_SYNC_LIVE_MAX_RECORDS_PER_PAGE = 20;
const OMIE_SYNC_MAX_ROUNDS = 80;
const RD_SYNC_PAGE_CHUNK_DRY_RUN = 5;
const RD_SYNC_PAGE_CHUNK_LIVE = 1;
const RD_SYNC_LIVE_MAX_RECORDS_PER_PAGE = 100;
const RD_SYNC_MAX_ROUNDS = 120;
const RD_SYNC_SOUTH_STATES = ["SC", "PR", "RS"];
const RD_SOUTH_STATE_SCOPE_OPTIONS = [
  { value: "SC_PR_RS", label: "SC + PR + RS", states: RD_SYNC_SOUTH_STATES },
  { value: "SC", label: "Apenas SC", states: ["SC"] },
  { value: "PR", label: "Apenas PR", states: ["PR"] },
  { value: "RS", label: "Apenas RS", states: ["RS"] }
];
const RD_DEAL_STAGE_FILTER_OPTIONS = [
  { value: "", label: "Todas as etapas" },
  { value: "lead", label: "LEAD" },
  { value: "qualificacao", label: "QUALIFICAÇÃO" },
  { value: "proposta", label: "PROPOSTA" },
  { value: "follow_up", label: "FOLLOW-UP" },
  { value: "ganho", label: "GANHO" },
  { value: "perdido", label: "PERDIDO" }
];

const EMPTY_STAGE_FORM = {
  name: "",
  is_active: true
};

const EMPTY_OMIE_FORM = {
  app_key: "",
  app_secret: "",
  records_per_page: "100",
  max_pages: "20",
  omie_api_url: DEFAULT_OMIE_URL,
  dry_run: false
};

const EMPTY_RD_FORM = {
  access_token: "",
  api_url: DEFAULT_RDSTATION_URL,
  records_per_page: "100",
  max_pages: "200",
  dry_run: false,
  south_cnpj_only: true,
  south_state_scope: "SC_PR_RS",
  sync_customers_only: true,
  deals_only: false,
  deal_pipeline_filter: "",
  deal_stage_filter: "",
  deals_limit: "0"
};

const USER_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Gestor" },
  { value: "sales", label: "Vendedor" },
  { value: "backoffice", label: "Backoffice" }
];

const USER_STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" }
];

const EMPTY_USER_FORM = {
  full_name: "",
  email: "",
  whatsapp: "",
  role: "sales",
  status: "active"
};

const EMPTY_EDIT_USER_FORM = {
  full_name: "",
  email: "",
  whatsapp: "",
  role: "sales",
  status: "active"
};

const PROPOSAL_TEMPLATE_TYPE_OPTIONS = [
  { value: "", label: "Todos os tipos" },
  { value: "equipment", label: "Equipamentos" },
  { value: "supplies", label: "Suprimentos" },
  { value: "service", label: "Serviços" }
];

const PROPOSAL_PRODUCT_TYPE_OPTIONS = [
  { value: "", label: "Sem tipo específico" },
  { value: "equipment", label: "Equipamentos" },
  { value: "supplies", label: "Suprimentos" },
  { value: "service", label: "Serviços" }
];
const PRODUCT_REGISTRY_TYPE_OPTIONS = PROPOSAL_PRODUCT_TYPE_OPTIONS.filter((option) => Boolean(option.value));

const PROPOSAL_CPP_SECTION_OPTIONS = [
  { value: "toner", label: "Toner" },
  { value: "components", label: "Componentes" }
];

const DEFAULT_PROPOSAL_TEMPLATE_BODY = [
  "PROPOSTA COMERCIAL {{numero_proposta}}",
  "",
  "Empresa: {{empresa_nome}}",
  "Contato: {{cliente_nome}}",
  "Data de emissao: {{data_emissao}}",
  "Validade: {{validade_dias}} dias",
  "",
  "Itens da oportunidade:",
  "{{itens_oportunidade}}",
  "",
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
  "{{observacoes}}"
].join("\n");

const EMPTY_PROPOSAL_TEMPLATE_FORM = {
  name: "",
  proposal_type: "",
  product_hint: "",
  sort_order: "100",
  is_active: true,
  template_body: DEFAULT_PROPOSAL_TEMPLATE_BODY
};

const EMPTY_PROPOSAL_PRODUCT_PROFILE_FORM = {
  name: "",
  proposal_type: "",
  product_subcategory: "",
  product_code: "",
  product_name: "",
  headline: "",
  intro_text: "",
  technical_text: "",
  video_url: "",
  included_accessories: "",
  optional_accessories: "",
  base_price: "0",
  notes: "",
  is_active: true,
  sort_order: "100"
};

const EMPTY_PROPOSAL_CPP_ROW_FORM = {
  product_profile_id: "",
  section: "toner",
  item_name: "",
  manufacturer_durability: "",
  graphic_durability: "",
  item_value: "",
  cpp_cost: "",
  sort_order: "100",
  is_active: true
};

const EMPTY_PROPOSAL_COMMERCIAL_TERMS_FORM = {
  name: "",
  payment_terms: "",
  included_offer: "",
  excluded_offer: "",
  financing_terms: "",
  closing_text: "",
  is_default: false,
  is_active: true,
  sort_order: "100"
};

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "sim") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "nao") return false;
  return fallback;
}

function sanitizeRdAccessToken(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/^bearer\s+/i, "")
    .trim();
}

function normalizeUfCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function resolveSouthStates(scopeValue) {
  const selected = RD_SOUTH_STATE_SCOPE_OPTIONS.find((item) => item.value === scopeValue);
  if (!selected) return RD_SYNC_SOUTH_STATES;
  return selected.states;
}

function sanitizeAllowedStates(value) {
  if (!Array.isArray(value)) return [];
  const allowedSouthSet = new Set(RD_SYNC_SOUTH_STATES);
  const uniqueStates = [];
  for (const raw of value) {
    const uf = normalizeUfCode(raw);
    if (!uf || !allowedSouthSet.has(uf) || uniqueStates.includes(uf)) continue;
    uniqueStates.push(uf);
  }
  return uniqueStates;
}

function formatAllowedStatesLabel(value) {
  const states = sanitizeAllowedStates(value);
  if (!states.length) return "SC/PR/RS";
  return states.join("/");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function syncStatusLabel(status) {
  const map = {
    pending: "Pendente",
    running: "Em execução",
    success: "Concluído",
    error: "Erro"
  };
  return map[status] || String(status || "-");
}

function userRoleLabel(role) {
  const found = USER_ROLE_OPTIONS.find((item) => item.value === role);
  return found?.label || String(role || "-");
}

function userStatusLabel(status) {
  const found = USER_STATUS_OPTIONS.find((item) => item.value === status);
  return found?.label || String(status || "-");
}

function proposalTemplateTypeLabel(typeValue) {
  const found = PROPOSAL_TEMPLATE_TYPE_OPTIONS.find((item) => item.value === String(typeValue || ""));
  return found?.label || "Todos os tipos";
}

function proposalProductTypeLabel(typeValue) {
  const found = PROPOSAL_PRODUCT_TYPE_OPTIONS.find((item) => item.value === String(typeValue || ""));
  return found?.label || "Sem tipo específico";
}

function proposalCppSectionLabel(sectionValue) {
  const found = PROPOSAL_CPP_SECTION_OPTIONS.find((item) => item.value === String(sectionValue || ""));
  return found?.label || "Toner";
}

function normalizeProductRegistryLookup(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildProposalProductProfileInternalName(payload) {
  const proposalType = String(payload?.proposal_type || "").trim() || "generic";
  const productSubcategory = String(payload?.product_subcategory || "").trim() || "sem-subcategoria";
  const productName = String(payload?.product_name || "").trim();
  return `${proposalType} :: ${productSubcategory} :: ${productName}`;
}

function buildProductRegistryKey(payload) {
  const proposalType = normalizeProductRegistryLookup(payload?.proposal_type);
  const productSubcategory = normalizeProductRegistryLookup(payload?.product_subcategory);
  const productName = normalizeProductRegistryLookup(payload?.product_name);
  return `${proposalType}::${productSubcategory}::${productName}`;
}

function proposalProductDisplayLabel(profile) {
  const productName = String(profile?.product_name || "").trim() || "Produto";
  const categoryLabel = proposalProductTypeLabel(profile?.proposal_type);
  const subcategoryLabel = String(profile?.product_subcategory || "").trim();
  return subcategoryLabel ? `${productName} (${categoryLabel} · ${subcategoryLabel})` : `${productName} (${categoryLabel})`;
}

function userDeliveryMessage(delivery) {
  const map = {
    invite_email_sent: "Convite enviado para o e-mail do usuário.",
    reset_email_sent: "E-mail de redefinição de senha enviado ao usuário.",
    existing_user: "Usuário já existia no Auth e foi vinculado no CRM.",
    link_generated: "Link de acesso/redefinição gerado. Copie e envie ao usuário."
  };
  return map[delivery] || "Operação concluída para o usuário.";
}

function readOmieCookieStorage() {
  if (typeof window === "undefined") return null;
  try {
    const pairs = String(window.document?.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
    const prefix = `${OMIE_COOKIE_KEY}=`;
    const entry = pairs.find((item) => item.startsWith(prefix));
    if (!entry) return null;
    const cookieValue = entry.slice(prefix.length);
    if (!cookieValue) return null;
    return asObject(JSON.parse(decodeURIComponent(cookieValue)));
  } catch {
    return null;
  }
}

function writeOmieCookieStorage(payload) {
  if (typeof window === "undefined") return;
  try {
    const encoded = encodeURIComponent(JSON.stringify(asObject(payload)));
    window.document.cookie = `${OMIE_COOKIE_KEY}=${encoded}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // noop
  }
}

function clearOmieCookieStorage() {
  if (typeof window === "undefined") return;
  window.document.cookie = `${OMIE_COOKIE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

function readOmieFormStorage() {
  if (typeof window === "undefined") return EMPTY_OMIE_FORM;

  try {
    const raw = window.localStorage.getItem(OMIE_STORAGE_KEY);
    const parsed = asObject(raw ? JSON.parse(raw) : {});
    const fromCookie = readOmieCookieStorage();
    const merged = {
      ...fromCookie,
      ...parsed
    };
    return {
      app_key: String(merged.app_key || ""),
      app_secret: String(merged.app_secret || ""),
      records_per_page: String(merged.records_per_page || EMPTY_OMIE_FORM.records_per_page),
      max_pages: String(merged.max_pages || EMPTY_OMIE_FORM.max_pages),
      omie_api_url: String(merged.omie_api_url || EMPTY_OMIE_FORM.omie_api_url),
      dry_run: Boolean(merged.dry_run)
    };
  } catch {
    const fallback = asObject(readOmieCookieStorage() || {});
    return {
      app_key: String(fallback.app_key || ""),
      app_secret: String(fallback.app_secret || ""),
      records_per_page: String(fallback.records_per_page || EMPTY_OMIE_FORM.records_per_page),
      max_pages: String(fallback.max_pages || EMPTY_OMIE_FORM.max_pages),
      omie_api_url: String(fallback.omie_api_url || EMPTY_OMIE_FORM.omie_api_url),
      dry_run: Boolean(fallback.dry_run)
    };
  }
}

function readRdFormStorage() {
  if (typeof window === "undefined") return EMPTY_RD_FORM;

  try {
    const raw = window.localStorage.getItem(RDSTATION_STORAGE_KEY);
    if (!raw) return EMPTY_RD_FORM;
    const parsed = asObject(JSON.parse(raw));
    const southStateScopeRaw = String(parsed.south_state_scope || EMPTY_RD_FORM.south_state_scope);
    const southStateScopeValid = RD_SOUTH_STATE_SCOPE_OPTIONS.some((item) => item.value === southStateScopeRaw);
    const dealStageFilterRaw = String(parsed.deal_stage_filter || EMPTY_RD_FORM.deal_stage_filter);
    const dealStageFilterValid = RD_DEAL_STAGE_FILTER_OPTIONS.some((item) => item.value === dealStageFilterRaw);
    return {
      access_token: String(parsed.access_token || ""),
      api_url: String(parsed.api_url || EMPTY_RD_FORM.api_url),
      records_per_page: String(parsed.records_per_page || EMPTY_RD_FORM.records_per_page),
      max_pages: String(parsed.max_pages || EMPTY_RD_FORM.max_pages),
      dry_run: Boolean(parsed.dry_run),
      south_cnpj_only:
        parsed.south_cnpj_only === undefined ? Boolean(EMPTY_RD_FORM.south_cnpj_only) : Boolean(parsed.south_cnpj_only),
      south_state_scope: southStateScopeValid ? southStateScopeRaw : EMPTY_RD_FORM.south_state_scope,
      sync_customers_only:
        parsed.sync_customers_only === undefined ? Boolean(EMPTY_RD_FORM.sync_customers_only) : Boolean(parsed.sync_customers_only),
      deals_only: parsed.deals_only === undefined ? Boolean(EMPTY_RD_FORM.deals_only) : Boolean(parsed.deals_only),
      deal_pipeline_filter: String(parsed.deal_pipeline_filter || EMPTY_RD_FORM.deal_pipeline_filter),
      deal_stage_filter: dealStageFilterValid ? dealStageFilterRaw : EMPTY_RD_FORM.deal_stage_filter,
      deals_limit: String(parsed.deals_limit || EMPTY_RD_FORM.deals_limit)
    };
  } catch {
    return EMPTY_RD_FORM;
  }
}

function removeDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function decodeVCardValue(value) {
  return String(value || "")
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPhoneCandidate(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const matched = text.match(/(?:\+?55[\s.\-]*)?(?:\(?\d{2}\)?[\s.\-]*)?\d{4,5}[\s.\-]?\d{4}/);
  if (matched?.[0]) return matched[0];

  const digits = text.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 13) return digits;
  return "";
}

function isLikelyImportHeader(line) {
  const normalized = removeDiacritics(line).toLowerCase();
  if (!normalized || /\d/.test(normalized)) return false;
  const hasNameLabel = normalized.includes("nome") || normalized.includes("contato");
  const hasPhoneLabel =
    normalized.includes("whatsapp") ||
    normalized.includes("telefone") ||
    normalized.includes("celular") ||
    normalized.includes("phone");
  return hasNameLabel && hasPhoneLabel;
}

function parseVcfContactList(rawText) {
  const lines = String(rawText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const unfolded = [];
  for (const rawLine of lines) {
    if (/^[ \t]/.test(rawLine) && unfolded.length) {
      unfolded[unfolded.length - 1] += rawLine.trim();
    } else {
      unfolded.push(rawLine);
    }
  }

  const contacts = [];
  let current = null;

  for (const rawLine of unfolded) {
    const line = String(rawLine || "").trim();
    const upper = line.toUpperCase();

    if (upper === "BEGIN:VCARD") {
      current = { full_name: "", whatsapp: "", email: "" };
      continue;
    }

    if (upper === "END:VCARD") {
      if (current?.whatsapp) contacts.push(current);
      current = null;
      continue;
    }

    if (!current || !line.includes(":")) continue;
    const separatorIndex = line.indexOf(":");
    const key = line.slice(0, separatorIndex).toUpperCase();
    const value = decodeVCardValue(line.slice(separatorIndex + 1));
    if (!value) continue;

    if (!current.full_name && (key.startsWith("FN") || key === "N" || key.startsWith("N;"))) {
      const parts = value.split(";").filter(Boolean);
      current.full_name = parts.length > 1 ? parts.reverse().join(" ").trim() : value;
      continue;
    }

    if (!current.whatsapp && key.startsWith("TEL")) {
      current.whatsapp = value;
      continue;
    }

    if (!current.email && key.startsWith("EMAIL")) {
      current.email = value.toLowerCase();
    }
  }

  return contacts;
}

function parseJsonContactList(rawText) {
  const normalized = String(rawText || "").trim();
  if (!normalized) return [];
  if (!normalized.startsWith("[") && !normalized.startsWith("{")) return [];

  try {
    const parsed = JSON.parse(normalized);
    const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.contacts) ? parsed.contacts : [];
    if (!Array.isArray(candidates)) return [];

    return candidates
      .map((row) => asObject(row))
      .map((row) => ({
        full_name: String(row.full_name || row.name || row.contact || "").trim(),
        whatsapp: String(row.whatsapp || row.phone || row.number || "").trim(),
        email: String(row.email || "").trim().toLowerCase()
      }))
      .filter((row) => Boolean(row.whatsapp));
  } catch {
    return [];
  }
}

function parseDelimitedContactLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line) return null;

  const columns = line
    .split(/[;,\t|]/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  const cells = columns.length ? columns : [line];

  let whatsapp = "";
  let email = "";
  let fullName = "";

  for (const cell of cells) {
    if (!whatsapp) {
      const candidate = extractPhoneCandidate(cell);
      if (candidate) whatsapp = candidate;
    }
    if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(cell)) {
      email = cell.toLowerCase();
    }
  }

  if (!whatsapp) {
    const candidate = extractPhoneCandidate(line);
    if (candidate) whatsapp = candidate;
  }

  for (const cell of cells) {
    if (!cell) continue;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(cell)) continue;
    const phoneCandidate = extractPhoneCandidate(cell);
    if (phoneCandidate && phoneCandidate.replace(/\D/g, "").length >= 10) continue;
    fullName = cell;
    break;
  }

  return {
    full_name: fullName,
    whatsapp,
    email
  };
}

function parseWhatsAppImportText(rawText, fileName = "") {
  const sourceText = String(rawText || "").trim();
  if (!sourceText) {
    return {
      contacts: [],
      total_rows: 0,
      skipped_rows: 0
    };
  }

  const jsonContacts = parseJsonContactList(sourceText);
  if (jsonContacts.length) {
    return {
      contacts: jsonContacts,
      total_rows: jsonContacts.length,
      skipped_rows: 0
    };
  }

  const isVcf = /\.vcf$/i.test(String(fileName || "").trim()) || sourceText.toUpperCase().includes("BEGIN:VCARD");
  if (isVcf) {
    const contacts = parseVcfContactList(sourceText);
    return {
      contacts,
      total_rows: contacts.length,
      skipped_rows: 0
    };
  }

  const lines = sourceText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const contacts = [];
  let totalRows = 0;
  let skippedRows = 0;

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;
    totalRows += 1;

    if (isLikelyImportHeader(line)) continue;
    const parsed = parseDelimitedContactLine(line);
    if (!parsed?.whatsapp) {
      skippedRows += 1;
      continue;
    }
    contacts.push(parsed);
  }

  return {
    contacts,
    total_rows: totalRows,
    skipped_rows: skippedRows
  };
}

export default function SettingsModule() {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [usersSuccess, setUsersSuccess] = useState("");
  const [usersActionLink, setUsersActionLink] = useState("");
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [editUserForm, setEditUserForm] = useState(EMPTY_EDIT_USER_FORM);
  const [savingUserId, setSavingUserId] = useState("");
  const [resettingUserId, setResettingUserId] = useState("");

  const [stages, setStages] = useState([]);
  const [nameDraftById, setNameDraftById] = useState({});
  const [loading, setLoading] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleSuccess, setLifecycleSuccess] = useState("");
  const [form, setForm] = useState(EMPTY_STAGE_FORM);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingStageId, setSavingStageId] = useState("");
  const [deletingStageId, setDeletingStageId] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);

  const [proposalTemplates, setProposalTemplates] = useState([]);
  const [proposalTemplatesLoading, setProposalTemplatesLoading] = useState(false);
  const [proposalTemplatesError, setProposalTemplatesError] = useState("");
  const [proposalTemplatesSuccess, setProposalTemplatesSuccess] = useState("");
  const [proposalTemplateForm, setProposalTemplateForm] = useState(EMPTY_PROPOSAL_TEMPLATE_FORM);
  const [creatingProposalTemplate, setCreatingProposalTemplate] = useState(false);
  const [editingProposalTemplateId, setEditingProposalTemplateId] = useState("");
  const [editProposalTemplateForm, setEditProposalTemplateForm] = useState(EMPTY_PROPOSAL_TEMPLATE_FORM);
  const [savingProposalTemplateId, setSavingProposalTemplateId] = useState("");
  const [deletingProposalTemplateId, setDeletingProposalTemplateId] = useState("");

  const [proposalProductProfiles, setProposalProductProfiles] = useState([]);
  const [proposalProductProfilesLoading, setProposalProductProfilesLoading] = useState(false);
  const [proposalProductProfilesError, setProposalProductProfilesError] = useState("");
  const [proposalProductProfilesSuccess, setProposalProductProfilesSuccess] = useState("");
  const [proposalProductProfileForm, setProposalProductProfileForm] = useState(EMPTY_PROPOSAL_PRODUCT_PROFILE_FORM);
  const [creatingProposalProductProfile, setCreatingProposalProductProfile] = useState(false);
  const [editingProposalProductProfileId, setEditingProposalProductProfileId] = useState("");
  const [editProposalProductProfileForm, setEditProposalProductProfileForm] = useState(EMPTY_PROPOSAL_PRODUCT_PROFILE_FORM);
  const [savingProposalProductProfileId, setSavingProposalProductProfileId] = useState("");
  const [deletingProposalProductProfileId, setDeletingProposalProductProfileId] = useState("");
  const [syncingLegacyProductCatalog, setSyncingLegacyProductCatalog] = useState(false);

  const [proposalCppRows, setProposalCppRows] = useState([]);
  const [proposalCppRowsLoading, setProposalCppRowsLoading] = useState(false);
  const [proposalCppRowsError, setProposalCppRowsError] = useState("");
  const [proposalCppRowsSuccess, setProposalCppRowsSuccess] = useState("");
  const [proposalCppRowForm, setProposalCppRowForm] = useState(EMPTY_PROPOSAL_CPP_ROW_FORM);
  const [creatingProposalCppRow, setCreatingProposalCppRow] = useState(false);
  const [selectedProposalCppProfileId, setSelectedProposalCppProfileId] = useState("");
  const [editingProposalCppRowId, setEditingProposalCppRowId] = useState("");
  const [editProposalCppRowForm, setEditProposalCppRowForm] = useState(EMPTY_PROPOSAL_CPP_ROW_FORM);
  const [savingProposalCppRowId, setSavingProposalCppRowId] = useState("");
  const [deletingProposalCppRowId, setDeletingProposalCppRowId] = useState("");

  const [proposalCommercialTerms, setProposalCommercialTerms] = useState([]);
  const [proposalCommercialTermsLoading, setProposalCommercialTermsLoading] = useState(false);
  const [proposalCommercialTermsError, setProposalCommercialTermsError] = useState("");
  const [proposalCommercialTermsSuccess, setProposalCommercialTermsSuccess] = useState("");
  const [proposalCommercialTermsForm, setProposalCommercialTermsForm] = useState(EMPTY_PROPOSAL_COMMERCIAL_TERMS_FORM);
  const [creatingProposalCommercialTerms, setCreatingProposalCommercialTerms] = useState(false);
  const [editingProposalCommercialTermsId, setEditingProposalCommercialTermsId] = useState("");
  const [editProposalCommercialTermsForm, setEditProposalCommercialTermsForm] = useState(
    EMPTY_PROPOSAL_COMMERCIAL_TERMS_FORM
  );
  const [savingProposalCommercialTermsId, setSavingProposalCommercialTermsId] = useState("");
  const [deletingProposalCommercialTermsId, setDeletingProposalCommercialTermsId] = useState("");

  const [omieForm, setOmieForm] = useState(() => readOmieFormStorage());
  const [omieError, setOmieError] = useState("");
  const [omieSuccess, setOmieSuccess] = useState("");
  const [omieSyncing, setOmieSyncing] = useState(false);
  const [omieHistory, setOmieHistory] = useState([]);
  const [omieHistoryLoading, setOmieHistoryLoading] = useState(false);
  const [omieResult, setOmieResult] = useState(null);

  const [rdForm, setRdForm] = useState(() => readRdFormStorage());
  const [rdError, setRdError] = useState("");
  const [rdSuccess, setRdSuccess] = useState("");
  const [rdSyncing, setRdSyncing] = useState(false);
  const [rdHistory, setRdHistory] = useState([]);
  const [rdHistoryLoading, setRdHistoryLoading] = useState(false);
  const [rdResult, setRdResult] = useState(null);
  const [rdResumeCursor, setRdResumeCursor] = useState(null);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyOptionsLoading, setCompanyOptionsLoading] = useState(false);
  const [waImportRawText, setWaImportRawText] = useState("");
  const [waImportFileName, setWaImportFileName] = useState("");
  const [waImportCompanyId, setWaImportCompanyId] = useState("");
  const [waImportError, setWaImportError] = useState("");
  const [waImportSuccess, setWaImportSuccess] = useState("");
  const [waImporting, setWaImporting] = useState(false);
  const [waImportResult, setWaImportResult] = useState(null);

  const activeCount = useMemo(() => stages.filter((item) => item.is_active).length, [stages]);
  const omieResultSummary = useMemo(() => asObject(omieResult), [omieResult]);
  const rdResultSummary = useMemo(() => asObject(rdResult), [rdResult]);
  const waImportSummary = useMemo(() => asObject(waImportResult), [waImportResult]);
  const activeUsersCount = useMemo(() => users.filter((item) => item.status === "active").length, [users]);
  const createProfileSubcategoryOptions = useMemo(
    () => getSubcategoriesByType(proposalProductProfileForm.proposal_type),
    [proposalProductProfileForm.proposal_type]
  );
  const editProfileSubcategoryOptions = useMemo(
    () => getSubcategoriesByType(editProposalProductProfileForm.proposal_type),
    [editProposalProductProfileForm.proposal_type]
  );

  function buildProductProfilePayloadFromForm(formValue) {
    const proposalType = String(formValue?.proposal_type || "").trim();
    const productSubcategory = String(formValue?.product_subcategory || "").trim();
    const productName = String(formValue?.product_name || "").trim();
    const technicalText = String(formValue?.technical_text || "").trim();

    return {
      name: buildProposalProductProfileInternalName({
        proposal_type: proposalType,
        product_subcategory: productSubcategory,
        product_name: productName
      }),
      proposal_type: proposalType,
      product_subcategory: productSubcategory,
      product_name: productName,
      technical_text: technicalText,
      product_code: String(formValue?.product_code || "").trim(),
      base_price: String(formValue?.base_price ?? "0"),
      is_active: Boolean(formValue?.is_active),
      sort_order: String(formValue?.sort_order || "100")
    };
  }

  function validateProductProfilePayload(payload, { ignoreId = "" } = {}) {
    if (!payload.proposal_type) throw new Error("Selecione a categoria do produto.");
    if (!payload.product_subcategory) throw new Error("Selecione a sub-categoria do produto.");
    if (!payload.product_name) throw new Error("Informe o nome do produto.");
    if (!payload.technical_text) throw new Error("Informe o descritivo do produto.");

    const candidateKey = buildProductRegistryKey(payload);
    const duplicated = proposalProductProfiles.some((item) => {
      const currentId = String(item?.id || "");
      if (ignoreId && currentId === ignoreId) return false;
      return buildProductRegistryKey(item) === candidateKey;
    });
    if (duplicated) {
      throw new Error("Já existe produto cadastrado com a mesma categoria, sub-categoria e nome.");
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    setUsersError("");
    try {
      const rows = await listSystemUsers();
      setUsers(rows);
    } catch (err) {
      setUsersError(err.message);
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadStages() {
    setLoading(true);
    setLifecycleError("");

    try {
      const rows = await listCompanyLifecycleStages({ includeInactive: true });
      setStages(rows);
      setNameDraftById((previous) => {
        const next = {};
        for (const row of rows) {
          next[row.id] = previous[row.id] ?? row.name;
        }
        return next;
      });
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadProposalTemplates() {
    setProposalTemplatesLoading(true);
    setProposalTemplatesError("");
    try {
      const rows = await listProposalTemplates({ includeInactive: true });
      setProposalTemplates(rows);
    } catch (err) {
      setProposalTemplatesError(err.message);
      setProposalTemplates([]);
    } finally {
      setProposalTemplatesLoading(false);
    }
  }

  async function loadProposalProductProfiles() {
    setProposalProductProfilesLoading(true);
    setProposalProductProfilesError("");
    try {
      const rows = await listProposalProductProfiles({ includeInactive: true });
      setProposalProductProfiles(rows);
      setSelectedProposalCppProfileId((previous) => {
        if (previous && rows.some((row) => row.id === previous)) return previous;
        return rows[0]?.id || "";
      });
    } catch (err) {
      setProposalProductProfilesError(err.message);
      setProposalProductProfiles([]);
      setSelectedProposalCppProfileId("");
    } finally {
      setProposalProductProfilesLoading(false);
    }
  }

  async function handleSyncLegacyProductCatalog() {
    const confirmed = window.confirm(
      "Reimportar o catalogo legado de produtos agora? A operação é idempotente e não duplica itens já existentes."
    );
    if (!confirmed) return;

    setProposalProductProfilesError("");
    setProposalProductProfilesSuccess("");
    setSyncingLegacyProductCatalog(true);

    try {
      const result = await syncLegacyProductCatalogToProposalProfiles();
      await loadProposalProductProfiles();
      const summary = `Reimportação concluída: ${result.inserted} inserido(s), ${result.updated} atualizado(s), ${result.skipped} sem alteração.`;
      setProposalProductProfilesSuccess(summary);
      if (result.failures_count > 0) {
        const firstFailure = result.failures[0];
        setProposalProductProfilesError(
          `Alguns itens falharam (${result.failures_count}). Exemplo: ${firstFailure?.product_name || "produto"} - ${firstFailure?.error || "erro desconhecido"}.`
        );
      }
    } catch (err) {
      setProposalProductProfilesError(err.message);
    } finally {
      setSyncingLegacyProductCatalog(false);
    }
  }

  async function loadProposalCppRows(profileId = selectedProposalCppProfileId) {
    const normalizedProfileId = String(profileId || "").trim();
    if (!normalizedProfileId) {
      setProposalCppRows([]);
      return;
    }

    setProposalCppRowsLoading(true);
    setProposalCppRowsError("");
    try {
      const rows = await listProposalCppRows({
        productProfileId: normalizedProfileId,
        includeInactive: true
      });
      setProposalCppRows(rows);
      setProposalCppRowForm((previous) => ({
        ...previous,
        product_profile_id: normalizedProfileId
      }));
    } catch (err) {
      setProposalCppRowsError(err.message);
      setProposalCppRows([]);
    } finally {
      setProposalCppRowsLoading(false);
    }
  }

  async function loadProposalCommercialTerms() {
    setProposalCommercialTermsLoading(true);
    setProposalCommercialTermsError("");
    try {
      const rows = await listProposalCommercialTerms({ includeInactive: true });
      setProposalCommercialTerms(rows);
    } catch (err) {
      setProposalCommercialTermsError(err.message);
      setProposalCommercialTerms([]);
    } finally {
      setProposalCommercialTermsLoading(false);
    }
  }

  async function loadOmieHistory() {
    setOmieHistoryLoading(true);
    try {
      const rows = await listOmieCustomerSyncJobs(12);
      setOmieHistory(rows);
    } catch (err) {
      setOmieError(err.message);
    } finally {
      setOmieHistoryLoading(false);
    }
  }

  async function loadRdHistory() {
    setRdHistoryLoading(true);
    try {
      const rows = await listRdStationSyncJobs(12);
      setRdHistory(rows);
    } catch (err) {
      setRdError(err.message);
    } finally {
      setRdHistoryLoading(false);
    }
  }

  async function loadCompanyOptionsForImport() {
    setCompanyOptionsLoading(true);
    try {
      const rows = await listCompanyOptions();
      setCompanyOptions(rows);
    } catch (err) {
      setWaImportError(err.message);
      setCompanyOptions([]);
    } finally {
      setCompanyOptionsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadStages();
    loadProposalTemplates();
    loadProposalProductProfiles();
    loadProposalCommercialTerms();
    loadOmieHistory();
    loadRdHistory();
    loadCompanyOptionsForImport();
  }, []);

  useEffect(() => {
    if (!selectedProposalCppProfileId) {
      setProposalCppRows([]);
      setProposalCppRowForm((previous) => ({
        ...previous,
        product_profile_id: ""
      }));
      return;
    }
    loadProposalCppRows(selectedProposalCppProfileId);
  }, [selectedProposalCppProfileId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OMIE_STORAGE_KEY, JSON.stringify(omieForm));
    writeOmieCookieStorage(omieForm);
  }, [omieForm]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RDSTATION_STORAGE_KEY, JSON.stringify(rdForm));
  }, [rdForm]);

  async function handleCreateStage(event) {
    event.preventDefault();
    setLifecycleError("");
    setLifecycleSuccess("");
    setSavingCreate(true);

    try {
      await createCompanyLifecycleStage({
        name: form.name,
        is_active: form.is_active
      });
      setForm(EMPTY_STAGE_FORM);
      await loadStages();
      setLifecycleSuccess("Fase criada no ciclo de vida.");
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setSavingCreate(false);
    }
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setCreatingUser(true);

    try {
      const result = await createSystemUser(userForm);
      setUserForm(EMPTY_USER_FORM);
      setUsersSuccess(userDeliveryMessage(result.delivery));
      if (result.action_link) setUsersActionLink(result.action_link);
      await loadUsers();
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setCreatingUser(false);
    }
  }

  function startEditUser(user) {
    const userId = String(user?.user_id || "").trim();
    if (!userId) return;

    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setEditingUserId(userId);
    setEditUserForm({
      full_name: String(user.full_name || ""),
      email: String(user.email || ""),
      whatsapp: String(user.whatsapp || ""),
      role: String(user.role || "sales"),
      status: String(user.status || "active")
    });
  }

  function cancelEditUser() {
    setEditingUserId("");
    setEditUserForm(EMPTY_EDIT_USER_FORM);
  }

  async function handleSaveUser(event) {
    event.preventDefault();
    if (!editingUserId) return;

    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setSavingUserId(editingUserId);

    try {
      await updateSystemUser(editingUserId, editUserForm);
      setUsersSuccess("Usuário atualizado com sucesso.");
      cancelEditUser();
      await loadUsers();
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setSavingUserId("");
    }
  }

  async function handleToggleUserStatus(user) {
    const userId = String(user?.user_id || "").trim();
    if (!userId) return;
    const nextStatus = user.status === "active" ? "inactive" : "active";

    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setSavingUserId(userId);

    try {
      await updateSystemUser(userId, {
        full_name: user.full_name,
        whatsapp: user.whatsapp || "",
        role: user.role,
        status: nextStatus,
        permissions: user.permissions
      });
      setUsersSuccess(nextStatus === "active" ? "Usuário ativado." : "Usuário desativado.");
      if (editingUserId === userId) {
        setEditUserForm((prev) => ({
          ...prev,
          status: nextStatus
        }));
      }
      await loadUsers();
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setSavingUserId("");
    }
  }

  async function handleResetUserPassword(user) {
    const userId = String(user?.user_id || "").trim();
    if (!userId) return;

    const confirmed = window.confirm(`Enviar redefinição de senha para ${user.email || "este usuário"}?`);
    if (!confirmed) return;

    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setResettingUserId(userId);

    try {
      const result = await sendSystemUserPasswordReset({
        user_id: userId
      });
      setUsersSuccess(userDeliveryMessage(result.delivery));
      if (result.action_link) setUsersActionLink(result.action_link);
      await loadUsers();
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setResettingUserId("");
    }
  }

  async function handleSaveStageName(stage) {
    const nextName = String(nameDraftById[stage.id] || "").trim();
    if (!nextName) {
      setLifecycleError("Informe o nome da fase.");
      return;
    }

    if (nextName === stage.name) return;

    setLifecycleError("");
    setLifecycleSuccess("");
    setSavingStageId(stage.id);

    try {
      await updateCompanyLifecycleStage(stage.id, { name: nextName });
      await loadStages();
      setLifecycleSuccess("Nome da fase atualizado.");
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setSavingStageId("");
    }
  }

  async function handleToggleStage(stage) {
    if (stage.is_active && activeCount <= 1) {
      setLifecycleError("Mantenha ao menos uma fase ativa no ciclo de vida.");
      return;
    }

    setLifecycleError("");
    setLifecycleSuccess("");
    setSavingStageId(stage.id);

    try {
      await updateCompanyLifecycleStage(stage.id, { is_active: !stage.is_active });
      await loadStages();
      setLifecycleSuccess(stage.is_active ? "Fase desativada." : "Fase ativada.");
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setSavingStageId("");
    }
  }

  async function handleMoveStage(stageId, direction) {
    const index = stages.findIndex((item) => item.id === stageId);
    if (index < 0) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stages.length) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    setLifecycleError("");
    setLifecycleSuccess("");
    setSavingOrder(true);
    setStages(reordered);

    try {
      await saveCompanyLifecycleStageOrder(reordered.map((item) => item.id));
      await loadStages();
      setLifecycleSuccess("Ordem do ciclo de vida atualizada.");
    } catch (err) {
      setLifecycleError(err.message);
      await loadStages();
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleDeleteStage(stage) {
    if (!stage) return;
    if (stage.linked_companies_count > 0) {
      setLifecycleError("Não é possível excluir fase com empresas vinculadas.");
      return;
    }
    if (stages.length <= 1) {
      setLifecycleError("O ciclo de vida precisa ter ao menos uma fase.");
      return;
    }

    const confirmed = await confirmStrongDelete({
      entityLabel: "a fase do ciclo de vida",
      itemLabel: stage.name
    });
    if (!confirmed) return;

    setLifecycleError("");
    setLifecycleSuccess("");
    setDeletingStageId(stage.id);

    try {
      await deleteCompanyLifecycleStage(stage.id);
      await loadStages();
      setLifecycleSuccess("Fase excluída.");
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setDeletingStageId("");
    }
  }

  async function handleCreateProposalTemplate(event) {
    event.preventDefault();
    setProposalTemplatesError("");
    setProposalTemplatesSuccess("");
    setCreatingProposalTemplate(true);

    try {
      await createProposalTemplate(proposalTemplateForm);
      setProposalTemplateForm(EMPTY_PROPOSAL_TEMPLATE_FORM);
      await loadProposalTemplates();
      setProposalTemplatesSuccess("Template de proposta criado.");
    } catch (err) {
      setProposalTemplatesError(err.message);
    } finally {
      setCreatingProposalTemplate(false);
    }
  }

  function startEditProposalTemplate(template) {
    const templateId = String(template?.id || "").trim();
    if (!templateId) return;

    setProposalTemplatesError("");
    setProposalTemplatesSuccess("");
    setEditingProposalTemplateId(templateId);
    setEditProposalTemplateForm({
      name: String(template.name || ""),
      proposal_type: String(template.proposal_type || ""),
      product_hint: String(template.product_hint || ""),
      sort_order: String(template.sort_order || "100"),
      is_active: Boolean(template.is_active),
      template_body: String(template.template_body || "")
    });
  }

  function cancelEditProposalTemplate() {
    setEditingProposalTemplateId("");
    setEditProposalTemplateForm(EMPTY_PROPOSAL_TEMPLATE_FORM);
  }

  async function handleSaveProposalTemplate(event) {
    event.preventDefault();
    if (!editingProposalTemplateId) return;

    setProposalTemplatesError("");
    setProposalTemplatesSuccess("");
    setSavingProposalTemplateId(editingProposalTemplateId);
    try {
      await updateProposalTemplate(editingProposalTemplateId, editProposalTemplateForm);
      await loadProposalTemplates();
      setProposalTemplatesSuccess("Template atualizado com sucesso.");
      cancelEditProposalTemplate();
    } catch (err) {
      setProposalTemplatesError(err.message);
    } finally {
      setSavingProposalTemplateId("");
    }
  }

  async function handleToggleProposalTemplateStatus(template) {
    const templateId = String(template?.id || "").trim();
    if (!templateId) return;

    setProposalTemplatesError("");
    setProposalTemplatesSuccess("");
    setSavingProposalTemplateId(templateId);

    try {
      await updateProposalTemplate(templateId, {
        is_active: !Boolean(template.is_active)
      });
      await loadProposalTemplates();
      setProposalTemplatesSuccess(Boolean(template.is_active) ? "Template desativado." : "Template ativado.");
      if (editingProposalTemplateId === templateId) {
        setEditProposalTemplateForm((prev) => ({
          ...prev,
          is_active: !Boolean(template.is_active)
        }));
      }
    } catch (err) {
      setProposalTemplatesError(err.message);
    } finally {
      setSavingProposalTemplateId("");
    }
  }

  async function handleDeleteProposalTemplate(template) {
    const templateId = String(template?.id || "").trim();
    if (!templateId) return;

    const confirmed = await confirmStrongDelete({
      entityLabel: "o template",
      itemLabel: template.name
    });
    if (!confirmed) return;

    setProposalTemplatesError("");
    setProposalTemplatesSuccess("");
    setDeletingProposalTemplateId(templateId);

    try {
      await deleteProposalTemplate(templateId);
      await loadProposalTemplates();
      setProposalTemplatesSuccess("Template excluído.");
      if (editingProposalTemplateId === templateId) {
        cancelEditProposalTemplate();
      }
    } catch (err) {
      setProposalTemplatesError(err.message);
    } finally {
      setDeletingProposalTemplateId("");
    }
  }

  async function handleCreateProposalProductProfile(event) {
    event.preventDefault();
    setProposalProductProfilesError("");
    setProposalProductProfilesSuccess("");
    setCreatingProposalProductProfile(true);

    try {
      const payload = buildProductProfilePayloadFromForm(proposalProductProfileForm);
      validateProductProfilePayload(payload);
      await createProposalProductProfile(payload);
      setProposalProductProfileForm(EMPTY_PROPOSAL_PRODUCT_PROFILE_FORM);
      await loadProposalProductProfiles();
      setProposalProductProfilesSuccess("Produto cadastrado.");
    } catch (err) {
      setProposalProductProfilesError(err.message);
    } finally {
      setCreatingProposalProductProfile(false);
    }
  }

  function startEditProposalProductProfile(profile) {
    const profileId = String(profile?.id || "").trim();
    if (!profileId) return;

    setProposalProductProfilesError("");
    setProposalProductProfilesSuccess("");
    setEditingProposalProductProfileId(profileId);
    setEditProposalProductProfileForm({
      name: String(profile.name || ""),
      proposal_type: String(profile.proposal_type || ""),
      product_subcategory: String(profile.product_subcategory || ""),
      product_code: String(profile.product_code || ""),
      product_name: String(profile.product_name || ""),
      headline: String(profile.headline || ""),
      intro_text: String(profile.intro_text || ""),
      technical_text: String(profile.technical_text || ""),
      video_url: String(profile.video_url || ""),
      included_accessories: String(profile.included_accessories || ""),
      optional_accessories: String(profile.optional_accessories || ""),
      base_price: String(profile.base_price ?? "0"),
      notes: String(profile.notes || ""),
      is_active: Boolean(profile.is_active),
      sort_order: String(profile.sort_order || 100)
    });
  }

  function cancelEditProposalProductProfile() {
    setEditingProposalProductProfileId("");
    setEditProposalProductProfileForm(EMPTY_PROPOSAL_PRODUCT_PROFILE_FORM);
  }

  async function handleSaveProposalProductProfile(event) {
    event.preventDefault();
    if (!editingProposalProductProfileId) return;

    setProposalProductProfilesError("");
    setProposalProductProfilesSuccess("");
    setSavingProposalProductProfileId(editingProposalProductProfileId);
    try {
      const payload = buildProductProfilePayloadFromForm(editProposalProductProfileForm);
      validateProductProfilePayload(payload, { ignoreId: editingProposalProductProfileId });
      await updateProposalProductProfile(editingProposalProductProfileId, payload);
      await loadProposalProductProfiles();
      if (selectedProposalCppProfileId === editingProposalProductProfileId) {
        await loadProposalCppRows(editingProposalProductProfileId);
      }
      setProposalProductProfilesSuccess("Produto atualizado.");
      cancelEditProposalProductProfile();
    } catch (err) {
      setProposalProductProfilesError(err.message);
    } finally {
      setSavingProposalProductProfileId("");
    }
  }

  async function handleToggleProposalProductProfileStatus(profile) {
    const profileId = String(profile?.id || "").trim();
    if (!profileId) return;

    setProposalProductProfilesError("");
    setProposalProductProfilesSuccess("");
    setSavingProposalProductProfileId(profileId);
    try {
      await updateProposalProductProfile(profileId, {
        is_active: !Boolean(profile.is_active)
      });
      await loadProposalProductProfiles();
      setProposalProductProfilesSuccess(Boolean(profile.is_active) ? "Produto desativado." : "Produto ativado.");
      if (editingProposalProductProfileId === profileId) {
        setEditProposalProductProfileForm((previous) => ({
          ...previous,
          is_active: !Boolean(profile.is_active)
        }));
      }
    } catch (err) {
      setProposalProductProfilesError(err.message);
    } finally {
      setSavingProposalProductProfileId("");
    }
  }

  async function handleDeleteProposalProductProfile(profile) {
    const profileId = String(profile?.id || "").trim();
    if (!profileId) return;

    const confirmed = await confirmStrongDelete({
      entityLabel: "o produto",
      itemLabel: proposalProductDisplayLabel(profile)
    });
    if (!confirmed) return;

    setProposalProductProfilesError("");
    setProposalProductProfilesSuccess("");
    setDeletingProposalProductProfileId(profileId);
    try {
      await deleteProposalProductProfile(profileId);
      await loadProposalProductProfiles();
      setProposalProductProfilesSuccess("Produto excluído.");
      if (editingProposalProductProfileId === profileId) {
        cancelEditProposalProductProfile();
      }
    } catch (err) {
      setProposalProductProfilesError(err.message);
    } finally {
      setDeletingProposalProductProfileId("");
    }
  }

  async function handleCreateProposalCppRow(event) {
    event.preventDefault();
    if (!selectedProposalCppProfileId) {
      setProposalCppRowsError("Selecione um produto para cadastrar linhas CPP.");
      return;
    }

    setProposalCppRowsError("");
    setProposalCppRowsSuccess("");
    setCreatingProposalCppRow(true);
    try {
      await createProposalCppRow({
        ...proposalCppRowForm,
        product_profile_id: selectedProposalCppProfileId
      });
      setProposalCppRowForm((previous) => ({
        ...EMPTY_PROPOSAL_CPP_ROW_FORM,
        product_profile_id: selectedProposalCppProfileId
      }));
      await loadProposalCppRows(selectedProposalCppProfileId);
      setProposalCppRowsSuccess("Linha CPP criada.");
    } catch (err) {
      setProposalCppRowsError(err.message);
    } finally {
      setCreatingProposalCppRow(false);
    }
  }

  function startEditProposalCppRow(row) {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;

    setProposalCppRowsError("");
    setProposalCppRowsSuccess("");
    setEditingProposalCppRowId(rowId);
    setEditProposalCppRowForm({
      product_profile_id: String(row.product_profile_id || selectedProposalCppProfileId || ""),
      section: String(row.section || "toner"),
      item_name: String(row.item_name || ""),
      manufacturer_durability: String(row.manufacturer_durability || ""),
      graphic_durability: String(row.graphic_durability || ""),
      item_value: row.item_value === null || row.item_value === undefined ? "" : String(row.item_value),
      cpp_cost: row.cpp_cost === null || row.cpp_cost === undefined ? "" : String(row.cpp_cost),
      sort_order: String(row.sort_order || 100),
      is_active: Boolean(row.is_active)
    });
  }

  function cancelEditProposalCppRow() {
    setEditingProposalCppRowId("");
    setEditProposalCppRowForm(EMPTY_PROPOSAL_CPP_ROW_FORM);
  }

  async function handleSaveProposalCppRow(event) {
    event.preventDefault();
    if (!editingProposalCppRowId) return;

    setProposalCppRowsError("");
    setProposalCppRowsSuccess("");
    setSavingProposalCppRowId(editingProposalCppRowId);
    try {
      await updateProposalCppRow(editingProposalCppRowId, editProposalCppRowForm);
      await loadProposalCppRows(selectedProposalCppProfileId);
      setProposalCppRowsSuccess("Linha CPP atualizada.");
      cancelEditProposalCppRow();
    } catch (err) {
      setProposalCppRowsError(err.message);
    } finally {
      setSavingProposalCppRowId("");
    }
  }

  async function handleToggleProposalCppRowStatus(row) {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;

    setProposalCppRowsError("");
    setProposalCppRowsSuccess("");
    setSavingProposalCppRowId(rowId);
    try {
      await updateProposalCppRow(rowId, {
        is_active: !Boolean(row.is_active)
      });
      await loadProposalCppRows(selectedProposalCppProfileId);
      setProposalCppRowsSuccess(Boolean(row.is_active) ? "Linha CPP desativada." : "Linha CPP ativada.");
      if (editingProposalCppRowId === rowId) {
        setEditProposalCppRowForm((previous) => ({
          ...previous,
          is_active: !Boolean(row.is_active)
        }));
      }
    } catch (err) {
      setProposalCppRowsError(err.message);
    } finally {
      setSavingProposalCppRowId("");
    }
  }

  async function handleDeleteProposalCppRow(row) {
    const rowId = String(row?.id || "").trim();
    if (!rowId) return;

    const confirmed = await confirmStrongDelete({
      entityLabel: "a linha CPP",
      itemLabel: row.item_name
    });
    if (!confirmed) return;

    setProposalCppRowsError("");
    setProposalCppRowsSuccess("");
    setDeletingProposalCppRowId(rowId);
    try {
      await deleteProposalCppRow(rowId);
      await loadProposalCppRows(selectedProposalCppProfileId);
      setProposalCppRowsSuccess("Linha CPP excluída.");
      if (editingProposalCppRowId === rowId) {
        cancelEditProposalCppRow();
      }
    } catch (err) {
      setProposalCppRowsError(err.message);
    } finally {
      setDeletingProposalCppRowId("");
    }
  }

  async function handleCreateProposalCommercialTerms(event) {
    event.preventDefault();
    setProposalCommercialTermsError("");
    setProposalCommercialTermsSuccess("");
    setCreatingProposalCommercialTerms(true);
    try {
      await createProposalCommercialTerms(proposalCommercialTermsForm);
      setProposalCommercialTermsForm(EMPTY_PROPOSAL_COMMERCIAL_TERMS_FORM);
      await loadProposalCommercialTerms();
      setProposalCommercialTermsSuccess("Condições comerciais criadas.");
    } catch (err) {
      setProposalCommercialTermsError(err.message);
    } finally {
      setCreatingProposalCommercialTerms(false);
    }
  }

  function startEditProposalCommercialTerms(term) {
    const termId = String(term?.id || "").trim();
    if (!termId) return;

    setProposalCommercialTermsError("");
    setProposalCommercialTermsSuccess("");
    setEditingProposalCommercialTermsId(termId);
    setEditProposalCommercialTermsForm({
      name: String(term.name || ""),
      payment_terms: String(term.payment_terms || ""),
      included_offer: String(term.included_offer || ""),
      excluded_offer: String(term.excluded_offer || ""),
      financing_terms: String(term.financing_terms || ""),
      closing_text: String(term.closing_text || ""),
      is_default: Boolean(term.is_default),
      is_active: Boolean(term.is_active),
      sort_order: String(term.sort_order || 100)
    });
  }

  function cancelEditProposalCommercialTerms() {
    setEditingProposalCommercialTermsId("");
    setEditProposalCommercialTermsForm(EMPTY_PROPOSAL_COMMERCIAL_TERMS_FORM);
  }

  async function handleSaveProposalCommercialTerms(event) {
    event.preventDefault();
    if (!editingProposalCommercialTermsId) return;

    setProposalCommercialTermsError("");
    setProposalCommercialTermsSuccess("");
    setSavingProposalCommercialTermsId(editingProposalCommercialTermsId);
    try {
      await updateProposalCommercialTerms(editingProposalCommercialTermsId, editProposalCommercialTermsForm);
      await loadProposalCommercialTerms();
      setProposalCommercialTermsSuccess("Condições comerciais atualizadas.");
      cancelEditProposalCommercialTerms();
    } catch (err) {
      setProposalCommercialTermsError(err.message);
    } finally {
      setSavingProposalCommercialTermsId("");
    }
  }

  async function handleToggleProposalCommercialTermsStatus(term) {
    const termId = String(term?.id || "").trim();
    if (!termId) return;

    setProposalCommercialTermsError("");
    setProposalCommercialTermsSuccess("");
    setSavingProposalCommercialTermsId(termId);
    try {
      await updateProposalCommercialTerms(termId, {
        is_active: !Boolean(term.is_active)
      });
      await loadProposalCommercialTerms();
      setProposalCommercialTermsSuccess(Boolean(term.is_active) ? "Condição desativada." : "Condição ativada.");
      if (editingProposalCommercialTermsId === termId) {
        setEditProposalCommercialTermsForm((previous) => ({
          ...previous,
          is_active: !Boolean(term.is_active)
        }));
      }
    } catch (err) {
      setProposalCommercialTermsError(err.message);
    } finally {
      setSavingProposalCommercialTermsId("");
    }
  }

  async function handleSetDefaultProposalCommercialTerms(term) {
    const termId = String(term?.id || "").trim();
    if (!termId) return;
    if (term.is_default) return;

    setProposalCommercialTermsError("");
    setProposalCommercialTermsSuccess("");
    setSavingProposalCommercialTermsId(termId);
    try {
      await updateProposalCommercialTerms(termId, { is_default: true });
      await loadProposalCommercialTerms();
      setProposalCommercialTermsSuccess("Condição padrão atualizada.");
      if (editingProposalCommercialTermsId === termId) {
        setEditProposalCommercialTermsForm((previous) => ({
          ...previous,
          is_default: true
        }));
      }
    } catch (err) {
      setProposalCommercialTermsError(err.message);
    } finally {
      setSavingProposalCommercialTermsId("");
    }
  }

  async function handleDeleteProposalCommercialTerms(term) {
    const termId = String(term?.id || "").trim();
    if (!termId) return;

    const confirmed = await confirmStrongDelete({
      entityLabel: "as condições comerciais",
      itemLabel: term.name
    });
    if (!confirmed) return;

    setProposalCommercialTermsError("");
    setProposalCommercialTermsSuccess("");
    setDeletingProposalCommercialTermsId(termId);
    try {
      await deleteProposalCommercialTerms(termId);
      await loadProposalCommercialTerms();
      setProposalCommercialTermsSuccess("Condições comerciais excluídas.");
      if (editingProposalCommercialTermsId === termId) {
        cancelEditProposalCommercialTerms();
      }
    } catch (err) {
      setProposalCommercialTermsError(err.message);
    } finally {
      setDeletingProposalCommercialTermsId("");
    }
  }

  async function handleOmieSync(event) {
    event.preventDefault();
    setOmieError("");
    setOmieSuccess("");
    setOmieResult(null);

    const appKey = String(omieForm.app_key || "").trim();
    const appSecret = String(omieForm.app_secret || "").trim();
    if (!appKey || !appSecret) {
      setOmieError("Informe App Key e App Secret do OMIE.");
      return;
    }

    const dryRun = Boolean(omieForm.dry_run);
    const requestedRecordsPerPage = clampInteger(omieForm.records_per_page, 1, 500, 100);
    const safeRecordsPerPage = dryRun
      ? requestedRecordsPerPage
      : Math.min(requestedRecordsPerPage, OMIE_SYNC_LIVE_MAX_RECORDS_PER_PAGE);

    const pageWindowSize = clampInteger(omieForm.max_pages, 1, 200, 20);

    const payload = {
      app_key: appKey,
      app_secret: appSecret,
      records_per_page: safeRecordsPerPage,
      max_pages: pageWindowSize,
      page_chunk_size: dryRun ? OMIE_SYNC_PAGE_CHUNK_DRY_RUN : OMIE_SYNC_PAGE_CHUNK_LIVE,
      dry_run: dryRun,
      omie_api_url: String(omieForm.omie_api_url || "").trim() || DEFAULT_OMIE_URL
    };

    setOmieSyncing(true);
    try {
      const aggregate = {
        pages_processed: 0,
        records_received: 0,
        processed: 0,
        companies_created: 0,
        companies_updated: 0,
        links_updated: 0,
        skipped_without_identifier: 0,
        skipped_without_cnpj: 0,
        skipped_invalid_payload: 0,
        errors: [],
        rounds: 0,
        has_more: false,
        next_page: null,
        max_pages: payload.max_pages,
        records_per_page: payload.records_per_page,
        dry_run: payload.dry_run
      };

      let nextPage = 1;
      let hasMore = true;

      while (hasMore && aggregate.rounds < OMIE_SYNC_MAX_ROUNDS) {
        aggregate.rounds += 1;
        setOmieSuccess(`Sincronizando lote ${aggregate.rounds} (página ${nextPage})...`);

        let result = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            const effectiveMaxPages = Math.min(200, Math.max(nextPage, nextPage + pageWindowSize - 1));
            result = await syncOmieCustomers({
              ...payload,
              start_page: nextPage,
              max_pages: effectiveMaxPages
            });
            break;
          } catch (error) {
            const message = String(error?.message || "").toLowerCase();
            const transientFailure =
              message.includes("failed to send a request") || message.includes("non-2xx");

            if (attempt < 2 && transientFailure) {
              setOmieSuccess(`Reenviando lote ${aggregate.rounds} (tentativa ${attempt + 1}/2)...`);
              await new Promise((resolve) => setTimeout(resolve, 1200));
              continue;
            }
            throw error;
          }
        }

        const safeResult = asObject(result);
        aggregate.pages_processed += Number(safeResult.pages_processed || 0);
        aggregate.records_received += Number(safeResult.records_received || 0);
        aggregate.processed += Number(safeResult.processed || 0);
        aggregate.companies_created += Number(safeResult.companies_created || 0);
        aggregate.companies_updated += Number(safeResult.companies_updated || 0);
        aggregate.links_updated += Number(safeResult.links_updated || 0);
        aggregate.skipped_without_identifier += Number(safeResult.skipped_without_identifier || 0);
        aggregate.skipped_without_cnpj += Number(safeResult.skipped_without_cnpj || 0);
        aggregate.skipped_invalid_payload += Number(safeResult.skipped_invalid_payload || 0);

        const resultErrors = Array.isArray(safeResult.errors)
          ? safeResult.errors.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        if (resultErrors.length) {
          aggregate.errors = [...aggregate.errors, ...resultErrors].slice(0, 20);
        }

        hasMore = Boolean(safeResult.has_more);
        const candidateNextPage = Number(safeResult.next_page || 0);
        if (hasMore && Number.isFinite(candidateNextPage) && candidateNextPage > nextPage) {
          nextPage = candidateNextPage;
        } else if (hasMore) {
          hasMore = false;
          aggregate.errors = [...aggregate.errors, "Continuação de páginas OMIE inválida. Tente executar novamente."].slice(0, 20);
        }
      }

      aggregate.has_more = hasMore;
      aggregate.next_page = hasMore ? nextPage : null;

      setOmieResult(aggregate);
      if (hasMore) {
        setOmieError(
          `A sincronização foi interrompida para segurança após ${aggregate.rounds} lotes. Clique novamente para continuar da página ${nextPage}.`
        );
      } else {
        setOmieSuccess(
          `Sincronização concluída em ${aggregate.rounds} lote(s). ${aggregate.processed} registro(s) processado(s).`
        );
      }
      await loadOmieHistory();
    } catch (err) {
      setOmieError(err.message);
    } finally {
      setOmieSyncing(false);
    }
  }

  async function handleRdSync(event) {
    event.preventDefault();
    setRdError("");
    setRdSuccess("");
    setRdResult(null);

    const accessToken = sanitizeRdAccessToken(rdForm.access_token);
    if (!accessToken) {
      setRdError("Informe o Access Token do RD Station CRM.");
      return;
    }

    const dryRun = Boolean(rdForm.dry_run);
    const requestedRecordsPerPage = clampInteger(rdForm.records_per_page, 1, 500, 100);
    const safeRecordsPerPage = dryRun
      ? requestedRecordsPerPage
      : Math.min(requestedRecordsPerPage, RD_SYNC_LIVE_MAX_RECORDS_PER_PAGE);
    const maxPages = clampInteger(rdForm.max_pages, 1, 500, 50);
    const southCnpjOnly = Boolean(rdForm.south_cnpj_only);
    const southStateScope = String(rdForm.south_state_scope || EMPTY_RD_FORM.south_state_scope);
    const selectedSouthStates = southCnpjOnly ? resolveSouthStates(southStateScope) : [];
    const syncScope = southCnpjOnly ? "south_cnpj_only" : rdForm.sync_customers_only ? "customers_whatsapp_only" : "full";
    const dealsOnly = syncScope === "full" ? Boolean(rdForm.deals_only) : false;
    const dealPipelineFilter = syncScope === "full" ? String(rdForm.deal_pipeline_filter || "").trim() : "";
    const dealStageFilter = syncScope === "full" ? String(rdForm.deal_stage_filter || "").trim() : "";
    const dealsLimit = syncScope === "full" ? clampInteger(rdForm.deals_limit, 0, 500, 0) : 0;
    const estimatedResources = syncScope === "full" ? 3 : syncScope === "customers_whatsapp_only" ? 2 : 1;
    const maxRoundsBudget = Math.min(
      900,
      Math.max(RD_SYNC_MAX_ROUNDS, estimatedResources * maxPages + 12)
    );
    const payload = {
      access_token: accessToken,
      api_url: String(rdForm.api_url || "").trim() || DEFAULT_RDSTATION_URL,
      records_per_page: safeRecordsPerPage,
      max_pages: maxPages,
      page_chunk_size: dryRun ? RD_SYNC_PAGE_CHUNK_DRY_RUN : RD_SYNC_PAGE_CHUNK_LIVE,
      dry_run: dryRun,
      sync_scope: syncScope,
      deals_only: dealsOnly,
      deal_pipeline_filter: dealPipelineFilter || null,
      deal_stage_filter: dealStageFilter || null,
      deals_limit: dealsLimit || null,
      allowed_states: selectedSouthStates
    };

    setRdSyncing(true);
    try {
      const aggregate = {
        pages_processed: 0,
        records_received: 0,
        processed: 0,
        companies_processed: 0,
        contacts_processed: 0,
        opportunities_processed: 0,
        companies_created: 0,
        companies_updated: 0,
        companies_skipped_existing: 0,
        companies_skipped_by_state: 0,
        contacts_created: 0,
        contacts_updated: 0,
        contacts_skipped_without_company: 0,
        contacts_skipped_without_whatsapp: 0,
        contacts_skipped_existing_whatsapp: 0,
        contacts_skipped_by_scope: 0,
        opportunities_created: 0,
        opportunities_updated: 0,
        opportunities_matched_by_similarity: 0,
        opportunities_matched_by_pipeline_stage_fallback: 0,
        opportunities_skipped_by_scope: 0,
        opportunities_skipped_by_pipeline_filter: 0,
        opportunities_skipped_by_stage_filter: 0,
        links_updated: 0,
        skipped_without_identifier: 0,
        skipped_without_cnpj: 0,
        skipped_invalid_payload: 0,
        errors: [],
        rounds: 0,
        has_more: false,
        next_cursor: null,
        max_pages: payload.max_pages,
        max_rounds_budget: maxRoundsBudget,
        records_per_page: payload.records_per_page,
        dry_run: payload.dry_run,
        sync_scope: payload.sync_scope,
        deals_only: payload.deals_only,
        deal_pipeline_filter: payload.deal_pipeline_filter,
        deal_stage_filter: payload.deal_stage_filter,
        deals_limit: payload.deals_limit,
        allowed_states: payload.allowed_states
      };

      let hasMore = true;
      const previousResult = asObject(rdResult);
      const previousWasDryRun = Boolean(previousResult.dry_run);
      const previousScope = String(previousResult.sync_scope || "").trim().toLowerCase();
      const previousDealsOnly = Boolean(previousResult.deals_only);
      const forceFreshCursorForDealSampling =
        !dryRun &&
        syncScope === "full" &&
        (dealsOnly || Boolean(dealPipelineFilter) || Boolean(dealStageFilter) || Number(dealsLimit) > 0);
      let cursor =
        !dryRun &&
        !previousWasDryRun &&
        previousScope === syncScope &&
        previousDealsOnly === dealsOnly &&
        !forceFreshCursorForDealSampling &&
        rdResumeCursor &&
        typeof rdResumeCursor === "object"
          ? rdResumeCursor
          : null;

      while (hasMore && aggregate.rounds < maxRoundsBudget) {
        aggregate.rounds += 1;
        const resourceLabel = cursor?.resource_index === 1 ? "contatos" : cursor?.resource_index === 2 ? "negócios" : "organizações";
        setRdSuccess(`Sincronizando RD lote ${aggregate.rounds} (${resourceLabel})...`);

        let result = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            result = await syncRdStationCrm({
              ...payload,
              cursor
            });
            break;
          } catch (error) {
            const message = String(error?.message || "").toLowerCase();
            const transientFailure =
              message.includes("failed to send a request") || message.includes("non-2xx");
            if (attempt < 2 && transientFailure) {
              setRdSuccess(`Reenviando lote RD ${aggregate.rounds} (tentativa ${attempt + 1}/2)...`);
              await new Promise((resolve) => setTimeout(resolve, 1200));
              continue;
            }
            throw error;
          }
        }

        const safeResult = asObject(result);
        aggregate.pages_processed += Number(safeResult.pages_processed || 0);
        aggregate.records_received += Number(safeResult.records_received || 0);
        aggregate.processed += Number(safeResult.processed || 0);
        aggregate.companies_processed += Number(safeResult.companies_processed || 0);
        aggregate.contacts_processed += Number(safeResult.contacts_processed || 0);
        aggregate.opportunities_processed += Number(safeResult.opportunities_processed || 0);
        aggregate.companies_created += Number(safeResult.companies_created || 0);
        aggregate.companies_updated += Number(safeResult.companies_updated || 0);
        aggregate.companies_skipped_existing += Number(safeResult.companies_skipped_existing || 0);
        aggregate.companies_skipped_by_state += Number(safeResult.companies_skipped_by_state || 0);
        aggregate.contacts_created += Number(safeResult.contacts_created || 0);
        aggregate.contacts_updated += Number(safeResult.contacts_updated || 0);
        aggregate.contacts_skipped_without_company += Number(safeResult.contacts_skipped_without_company || 0);
        aggregate.contacts_skipped_without_whatsapp += Number(safeResult.contacts_skipped_without_whatsapp || 0);
        aggregate.contacts_skipped_existing_whatsapp += Number(safeResult.contacts_skipped_existing_whatsapp || 0);
        aggregate.contacts_skipped_by_scope += Number(safeResult.contacts_skipped_by_scope || 0);
        aggregate.opportunities_created += Number(safeResult.opportunities_created || 0);
        aggregate.opportunities_updated += Number(safeResult.opportunities_updated || 0);
        aggregate.opportunities_matched_by_similarity += Number(safeResult.opportunities_matched_by_similarity || 0);
        aggregate.opportunities_matched_by_pipeline_stage_fallback += Number(
          safeResult.opportunities_matched_by_pipeline_stage_fallback || 0
        );
        aggregate.opportunities_skipped_by_scope += Number(safeResult.opportunities_skipped_by_scope || 0);
        aggregate.opportunities_skipped_by_pipeline_filter += Number(safeResult.opportunities_skipped_by_pipeline_filter || 0);
        aggregate.opportunities_skipped_by_stage_filter += Number(safeResult.opportunities_skipped_by_stage_filter || 0);
        aggregate.links_updated += Number(safeResult.links_updated || 0);
        aggregate.skipped_without_identifier += Number(safeResult.skipped_without_identifier || 0);
        aggregate.skipped_without_cnpj += Number(safeResult.skipped_without_cnpj || 0);
        aggregate.skipped_invalid_payload += Number(safeResult.skipped_invalid_payload || 0);
        if (safeResult.sync_scope) {
          aggregate.sync_scope = String(safeResult.sync_scope || aggregate.sync_scope);
        }
        if (safeResult.deals_only !== undefined) {
          aggregate.deals_only = Boolean(safeResult.deals_only);
        }
        if (safeResult.deal_pipeline_filter !== undefined) {
          aggregate.deal_pipeline_filter = safeResult.deal_pipeline_filter || null;
        }
        if (safeResult.deal_stage_filter !== undefined) {
          aggregate.deal_stage_filter = safeResult.deal_stage_filter || null;
        }
        if (safeResult.deals_limit !== undefined) {
          aggregate.deals_limit = safeResult.deals_limit || null;
        }
        const resultAllowedStates = sanitizeAllowedStates(safeResult.allowed_states);
        if (resultAllowedStates.length) {
          aggregate.allowed_states = resultAllowedStates;
        }

        const resultErrors = Array.isArray(safeResult.errors)
          ? safeResult.errors.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        if (resultErrors.length) {
          aggregate.errors = [...aggregate.errors, ...resultErrors].slice(0, 30);
        }

        hasMore = Boolean(safeResult.has_more);
        const candidateCursor = asObject(safeResult.next_cursor);
        const cursorResourceIndex = Number(candidateCursor.resource_index);

        if (hasMore && Number.isFinite(cursorResourceIndex)) {
          cursor = candidateCursor;
        } else if (hasMore) {
          hasMore = false;
          aggregate.errors = [...aggregate.errors, "Continuação RD Station inválida. Execute novamente para reiniciar."].slice(0, 30);
        }
      }

      aggregate.has_more = hasMore;
      aggregate.next_cursor = hasMore ? cursor : null;

      setRdResult(aggregate);
      setRdResumeCursor(hasMore ? cursor : null);
      if (hasMore) {
        if (dryRun) {
          setRdError(
            `Validação RD (modo teste) interrompida por segurança após ${aggregate.rounds} lotes. Clique novamente para continuar a validação. Nenhum dado foi gravado.`
          );
        } else {
          setRdError(
            `A sincronização RD foi interrompida por segurança após ${aggregate.rounds} lotes. Clique novamente para continuar.`
          );
        }
      } else {
        if (dryRun) {
          setRdSuccess(
            `Validação RD (modo teste) concluída em ${aggregate.rounds} lote(s). ${aggregate.processed} registro(s) processado(s). Nenhum dado foi gravado.`
          );
        } else {
          setRdSuccess(
            `Sincronização RD concluída em ${aggregate.rounds} lote(s). ${aggregate.processed} registro(s) processado(s).`
          );
        }
      }
      await loadRdHistory();
    } catch (err) {
      setRdError(err.message);
    } finally {
      setRdSyncing(false);
    }
  }

  async function handleWaImportFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setWaImportError("");
    setWaImportSuccess("");
    setWaImportResult(null);

    try {
      const text = await file.text();
      if (!String(text || "").trim()) {
        throw new Error("Arquivo vazio. Selecione um arquivo com contatos.");
      }
      setWaImportRawText(text);
      setWaImportFileName(file.name);
      setWaImportSuccess(`Arquivo "${file.name}" carregado. Revise os dados e clique em importar.`);
    } catch (err) {
      setWaImportError(err.message || "Falha ao ler o arquivo selecionado.");
      setWaImportFileName("");
    } finally {
      event.target.value = "";
    }
  }

  function clearWaImportForm() {
    setWaImportRawText("");
    setWaImportFileName("");
    setWaImportCompanyId("");
    setWaImportError("");
    setWaImportSuccess("");
    setWaImportResult(null);
  }

  async function handleImportWhatsAppContacts(event) {
    event.preventDefault();
    setWaImportError("");
    setWaImportSuccess("");
    setWaImportResult(null);

    const parsed = parseWhatsAppImportText(waImportRawText, waImportFileName);
    if (!parsed.contacts.length) {
      setWaImportError("Nenhum contato válido encontrado. Informe linhas com nome/telefone ou carregue um arquivo válido.");
      return;
    }

    setWaImporting(true);
    try {
      const result = await importWhatsAppContactsBatch({
        company_id: String(waImportCompanyId || "").trim() || null,
        contacts: parsed.contacts
      });

      const safe = asObject(result);
      const summary = {
        ...safe,
        source_total_rows: parsed.total_rows,
        source_skipped_rows: parsed.skipped_rows
      };
      setWaImportResult(summary);

      const inserted = Number(summary.inserted || 0);
      const skippedExisting = Number(summary.skipped_existing || 0);
      const skippedInvalid = Number(summary.skipped_invalid || 0) + Number(summary.source_skipped_rows || 0);
      const duplicatedInPayload = Number(summary.skipped_duplicated_in_payload || 0);

      setWaImportSuccess(
        `Importação concluída: ${inserted} inserido(s), ${skippedExisting} já existente(s), ${skippedInvalid} inválido(s), ${duplicatedInPayload} duplicado(s) na lista.`
      );
    } catch (err) {
      setWaImportError(err.message || "Falha ao importar contatos do WhatsApp.");
    } finally {
      setWaImporting(false);
    }
  }

  function clearOmieCredentials() {
    clearOmieCookieStorage();
    setOmieForm((prev) => ({
      ...prev,
      app_key: "",
      app_secret: ""
    }));
  }

  function clearRdCredentials() {
    setRdForm((prev) => ({
      ...prev,
      access_token: ""
    }));
    setRdResumeCursor(null);
  }

  const activeProposalProductProfilesCount = useMemo(
    () => proposalProductProfiles.filter((item) => item.is_active).length,
    [proposalProductProfiles]
  );
  const activeProposalCppRowsCount = useMemo(() => proposalCppRows.filter((item) => item.is_active).length, [proposalCppRows]);
  const activeProposalCommercialTermsCount = useMemo(
    () => proposalCommercialTerms.filter((item) => item.is_active).length,
    [proposalCommercialTerms]
  );
  const selectedProposalCppProfile = useMemo(
    () => proposalProductProfiles.find((item) => item.id === selectedProposalCppProfileId) || null,
    [proposalProductProfiles, selectedProposalCppProfileId]
  );

  const rdSouthOnlySelected = Boolean(rdForm.south_cnpj_only);
  const rdCustomersOnlySelected = Boolean(rdForm.sync_customers_only);
  const rdFullSyncSelected = !rdSouthOnlySelected && !rdCustomersOnlySelected;
  const rdScopeValue = String(rdResultSummary.sync_scope || "").trim().toLowerCase();
  const rdScopeSouthOnly = rdScopeValue === "south_cnpj_only";
  const rdScopeCustomersOnly = rdScopeValue === "customers_whatsapp_only";
  const rdIgnoredContactsTotal =
    Number(rdResultSummary.contacts_skipped_without_company || 0) +
    Number(rdResultSummary.contacts_skipped_without_whatsapp || 0) +
    Number(rdResultSummary.contacts_skipped_existing_whatsapp || 0);
  const rdSkippedOutsideSouthTotal = Number(rdResultSummary.companies_skipped_by_state || 0);
  const rdPipelineFilteredTotal = Number(rdResultSummary.opportunities_skipped_by_pipeline_filter || 0);
  const rdStageFilteredTotal = Number(rdResultSummary.opportunities_skipped_by_stage_filter || 0);
  const rdPipelineStageFallbackMatchedTotal = Number(
    rdResultSummary.opportunities_matched_by_pipeline_stage_fallback || 0
  );
  const rdOpportunitiesProcessedTotal = Number(rdResultSummary.opportunities_processed || 0);
  const rdResultAllowedStates = sanitizeAllowedStates(rdResultSummary.allowed_states);
  const rdCurrentAllowedStates = rdSouthOnlySelected ? resolveSouthStates(rdForm.south_state_scope) : [];
  const rdScopeSouthLabel = formatAllowedStatesLabel(rdResultAllowedStates.length ? rdResultAllowedStates : rdCurrentAllowedStates);

  return (
    <section className="module">
      <article className="panel">
        <h2>Usuários e acessos</h2>
        <p className="muted">
          Cadastre usuários com login por e-mail, perfil de acesso e status. A senha é definida pelo próprio usuário via convite/reset.
        </p>

        {usersError ? <p className="error-text">{usersError}</p> : null}
        {usersSuccess ? <p className="success-text">{usersSuccess}</p> : null}
        {usersActionLink ? (
          <p className="settings-user-link">
            Link gerado manualmente:{" "}
            <a href={usersActionLink} target="_blank" rel="noreferrer">
              Abrir link de acesso
            </a>
          </p>
        ) : null}

        <div className="settings-users-layout top-gap">
          <form className="form-grid" onSubmit={handleCreateUser}>
            <h3>Novo usuário</h3>
            <input
              required
              placeholder="Nome completo"
              value={userForm.full_name}
              onChange={(event) => setUserForm((prev) => ({ ...prev, full_name: event.target.value }))}
            />
            <input
              required
              type="email"
              placeholder="email@empresa.com"
              value={userForm.email}
              onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              placeholder="WhatsApp (DDD) 12345-1234"
              value={userForm.whatsapp}
              onChange={(event) => setUserForm((prev) => ({ ...prev, whatsapp: event.target.value }))}
            />

            <div className="settings-users-selects">
              <label className="settings-field">
                <span>Perfil</span>
                <select value={userForm.role} onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}>
                  {USER_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Status</span>
                <select value={userForm.status} onChange={(event) => setUserForm((prev) => ({ ...prev, status: event.target.value }))}>
                  {USER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="submit" className="btn-primary" disabled={creatingUser}>
              {creatingUser ? "Criando..." : "Cadastrar usuário"}
            </button>
          </form>

          <div className="settings-users-summary">
            <h3>Resumo</h3>
            <p className="muted">
              {users.length} usuário(s) cadastrado(s) • {activeUsersCount} ativo(s)
            </p>
            <div className="inline-actions">
              <button type="button" className="btn-ghost" onClick={loadUsers} disabled={usersLoading || creatingUser}>
                {usersLoading ? "Atualizando..." : "Atualizar lista"}
              </button>
            </div>
          </div>
        </div>

        <div className="table-wrap top-gap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Login</th>
                <th>WhatsApp</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id || user.email}>
                  <td>{user.full_name || "-"}</td>
                  <td>{user.email || "-"}</td>
                  <td>{user.whatsapp || "-"}</td>
                  <td>{userRoleLabel(user.role)}</td>
                  <td>{userStatusLabel(user.status)}</td>
                  <td>{formatDateTime(user.last_login_at)}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" className="btn-ghost btn-table-action" onClick={() => startEditUser(user)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-table-action"
                        onClick={() => handleToggleUserStatus(user)}
                        disabled={savingUserId === user.user_id}
                      >
                        {savingUserId === user.user_id
                          ? "Salvando..."
                          : user.status === "active"
                            ? "Desativar"
                            : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-table-action"
                        onClick={() => handleResetUserPassword(user)}
                        disabled={resettingUserId === user.user_id}
                      >
                        {resettingUserId === user.user_id ? "Enviando..." : "Reset senha"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!users.length && !usersLoading ? (
                <tr>
                  <td colSpan={7} className="muted">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {editingUserId ? (
          <form className="form-grid top-gap settings-user-edit-form" onSubmit={handleSaveUser}>
            <h3>Editar usuário</h3>
            <input
              required
              placeholder="Nome completo"
              value={editUserForm.full_name}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, full_name: event.target.value }))}
            />
            <input
              required
              type="email"
              placeholder="email@empresa.com"
              value={editUserForm.email}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              placeholder="WhatsApp (DDD) 12345-1234"
              value={editUserForm.whatsapp}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, whatsapp: event.target.value }))}
            />

            <div className="settings-users-selects">
              <label className="settings-field">
                <span>Perfil</span>
                <select value={editUserForm.role} onChange={(event) => setEditUserForm((prev) => ({ ...prev, role: event.target.value }))}>
                  {USER_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Status</span>
                <select
                  value={editUserForm.status}
                  onChange={(event) => setEditUserForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  {USER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="inline-actions">
              <button type="submit" className="btn-primary" disabled={savingUserId === editingUserId}>
                {savingUserId === editingUserId ? "Salvando..." : "Salvar usuário"}
              </button>
              <button type="button" className="btn-ghost" onClick={cancelEditUser} disabled={savingUserId === editingUserId}>
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </article>

      <div className="two-col">
        <article className="panel">
          <h2>Ciclo de vida de empresas</h2>
          <p className="muted">
            Cadastre as fases que representam a evolução da conta no CRM (ex.: Lead &gt; Oportunidade &gt; Cliente).
          </p>

          {lifecycleError ? <p className="error-text">{lifecycleError}</p> : null}
          {lifecycleSuccess ? <p className="success-text">{lifecycleSuccess}</p> : null}

          <form className="form-grid top-gap" onSubmit={handleCreateStage}>
            <input
              required
              placeholder="Nome da fase (ex.: Lead)"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              Fase ativa
            </label>
            <button type="submit" className="btn-primary" disabled={savingCreate}>
              {savingCreate ? "Salvando..." : "Adicionar fase"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Ordem das fases</h2>
          <p className="muted">Use os botões de subir/descer para reorganizar o fluxo.</p>
          {loading ? <p className="muted">Carregando fases...</p> : null}

          <div className="table-wrap top-gap">
            <table>
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Fase</th>
                  <th>Status</th>
                  <th>Empresas</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage, index) => (
                  <tr key={stage.id}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        className="settings-stage-input"
                        value={nameDraftById[stage.id] ?? stage.name}
                        onChange={(event) =>
                          setNameDraftById((prev) => ({
                            ...prev,
                            [stage.id]: event.target.value
                          }))
                        }
                      />
                    </td>
                    <td>{stage.is_active ? "Ativa" : "Inativa"}</td>
                    <td>{stage.linked_companies_count || 0}</td>
                    <td>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleSaveStageName(stage)}
                          disabled={savingStageId === stage.id || savingOrder}
                        >
                          Salvar nome
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleToggleStage(stage)}
                          disabled={savingStageId === stage.id || savingOrder || (stage.is_active && activeCount <= 1)}
                        >
                          {stage.is_active ? "Desativar" : "Ativar"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleMoveStage(stage.id, "up")}
                          disabled={savingOrder || index === 0}
                        >
                          Subir
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleMoveStage(stage.id, "down")}
                          disabled={savingOrder || index === stages.length - 1}
                        >
                          Descer
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleDeleteStage(stage)}
                          disabled={deletingStageId === stage.id || stage.linked_companies_count > 0 || stages.length <= 1}
                        >
                          {deletingStageId === stage.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!stages.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Nenhuma fase cadastrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <article className="panel top-gap">
        <h2>Templates de proposta</h2>
        <p className="muted">
          Crie modelos reutilizáveis para propostas e aplique manualmente por oportunidade no Pipeline.
        </p>

        {proposalTemplatesError ? <p className="error-text">{proposalTemplatesError}</p> : null}
        {proposalTemplatesSuccess ? <p className="success-text">{proposalTemplatesSuccess}</p> : null}

        <div className="settings-users-layout top-gap">
          <form className="form-grid" onSubmit={handleCreateProposalTemplate}>
            <h3>Novo template</h3>
            <input
              required
              placeholder="Nome do template (ex.: Canon imagePRESS V700)"
              value={proposalTemplateForm.name}
              onChange={(event) => setProposalTemplateForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <div className="settings-users-selects">
              <label className="settings-field">
                <span>Tipo alvo</span>
                <select
                  value={proposalTemplateForm.proposal_type}
                  onChange={(event) => setProposalTemplateForm((prev) => ({ ...prev, proposal_type: event.target.value }))}
                >
                  {PROPOSAL_TEMPLATE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>Ordem</span>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={proposalTemplateForm.sort_order}
                  onChange={(event) => setProposalTemplateForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                />
              </label>
            </div>
            <input
              placeholder="Dica de produto (opcional, ex.: imagePRESS V700)"
              value={proposalTemplateForm.product_hint}
              onChange={(event) => setProposalTemplateForm((prev) => ({ ...prev, product_hint: event.target.value }))}
            />
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={proposalTemplateForm.is_active}
                onChange={(event) => setProposalTemplateForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              Template ativo
            </label>
            <textarea
              className="settings-template-body"
              required
              placeholder="Corpo do template"
              value={proposalTemplateForm.template_body}
              onChange={(event) => setProposalTemplateForm((prev) => ({ ...prev, template_body: event.target.value }))}
            />
            <p className="proposal-placeholder-help">
              Placeholders: <code>{"{{numero_proposta}}"}</code>, <code>{"{{cliente_nome}}"}</code>,{" "}
              <code>{"{{empresa_nome}}"}</code>, <code>{"{{itens_oportunidade}}"}</code>,{" "}
              <code>{"{{valor_total}}"}</code>, <code>{"{{condicoes_pagamento}}"}</code>,{" "}
              <code>{"{{prazo_entrega}}"}</code>, <code>{"{{garantia}}"}</code>, <code>{"{{observacoes}}"}</code>
            </p>
            <button type="submit" className="btn-primary" disabled={creatingProposalTemplate}>
              {creatingProposalTemplate ? "Salvando..." : "Criar template"}
            </button>
          </form>

          <div className="settings-users-summary">
            <h3>Resumo</h3>
            <p className="muted">{proposalTemplates.length} template(s) cadastrado(s)</p>
            <div className="inline-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={loadProposalTemplates}
                disabled={proposalTemplatesLoading || creatingProposalTemplate}
              >
                {proposalTemplatesLoading ? "Atualizando..." : "Atualizar templates"}
              </button>
            </div>
          </div>
        </div>

        <div className="table-wrap top-gap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Produto</th>
                <th>Ordem</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {proposalTemplates.map((template) => (
                <tr key={template.id}>
                  <td>{template.name}</td>
                  <td>{proposalTemplateTypeLabel(template.proposal_type)}</td>
                  <td>{template.product_hint || "-"}</td>
                  <td>{template.sort_order || 100}</td>
                  <td>{template.is_active ? "Ativo" : "Inativo"}</td>
                  <td>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="btn-ghost btn-table-action"
                        onClick={() => startEditProposalTemplate(template)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-table-action"
                        onClick={() => handleToggleProposalTemplateStatus(template)}
                        disabled={savingProposalTemplateId === template.id}
                      >
                        {savingProposalTemplateId === template.id
                          ? "Salvando..."
                          : template.is_active
                            ? "Desativar"
                            : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-table-action"
                        onClick={() => handleDeleteProposalTemplate(template)}
                        disabled={deletingProposalTemplateId === template.id}
                      >
                        {deletingProposalTemplateId === template.id ? "Excluindo..." : "Excluir"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!proposalTemplates.length && !proposalTemplatesLoading ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Nenhum template cadastrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {editingProposalTemplateId ? (
          <form className="form-grid top-gap settings-user-edit-form" onSubmit={handleSaveProposalTemplate}>
            <h3>Editar template</h3>
            <input
              required
              placeholder="Nome do template"
              value={editProposalTemplateForm.name}
              onChange={(event) => setEditProposalTemplateForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <div className="settings-users-selects">
              <label className="settings-field">
                <span>Tipo alvo</span>
                <select
                  value={editProposalTemplateForm.proposal_type}
                  onChange={(event) => setEditProposalTemplateForm((prev) => ({ ...prev, proposal_type: event.target.value }))}
                >
                  {PROPOSAL_TEMPLATE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value || "all"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                <span>Ordem</span>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={editProposalTemplateForm.sort_order}
                  onChange={(event) => setEditProposalTemplateForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                />
              </label>
            </div>
            <input
              placeholder="Dica de produto (opcional)"
              value={editProposalTemplateForm.product_hint}
              onChange={(event) => setEditProposalTemplateForm((prev) => ({ ...prev, product_hint: event.target.value }))}
            />
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={editProposalTemplateForm.is_active}
                onChange={(event) => setEditProposalTemplateForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              Template ativo
            </label>
            <textarea
              className="settings-template-body"
              required
              value={editProposalTemplateForm.template_body}
              onChange={(event) => setEditProposalTemplateForm((prev) => ({ ...prev, template_body: event.target.value }))}
            />
            <div className="inline-actions">
              <button type="submit" className="btn-primary" disabled={savingProposalTemplateId === editingProposalTemplateId}>
                {savingProposalTemplateId === editingProposalTemplateId ? "Salvando..." : "Salvar template"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={cancelEditProposalTemplate}
                disabled={savingProposalTemplateId === editingProposalTemplateId}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </article>

      <article className="panel top-gap">
        <h2>Cadastro de produtos</h2>
        <p className="muted">
          Cadastre os produtos de forma estruturada para uso no Pipeline e na geração de propostas. Ajustes avançados de
          proposta (CPP e condições comerciais) seguem abaixo.
        </p>

        <div className="settings-products-layout top-gap">
          <section className="settings-library-card">
            <h3>Produtos</h3>
            <p className="muted">
              {proposalProductProfiles.length} produto(s) cadastrado(s) • {activeProposalProductProfilesCount} ativo(s)
            </p>
            {proposalProductProfilesError ? <p className="error-text">{proposalProductProfilesError}</p> : null}
            {proposalProductProfilesSuccess ? <p className="success-text">{proposalProductProfilesSuccess}</p> : null}

            <form className="form-grid top-gap settings-product-create-form" onSubmit={handleCreateProposalProductProfile}>
              <div className="settings-product-create-grid">
                <label className="settings-field">
                  <span>Categoria</span>
                  <select
                    value={proposalProductProfileForm.proposal_type}
                    onChange={(event) => {
                      const nextType = event.target.value;
                      const nextOptions = getSubcategoriesByType(nextType);
                      setProposalProductProfileForm((prev) => ({
                        ...prev,
                        proposal_type: nextType,
                        product_subcategory: nextOptions.includes(prev.product_subcategory) ? prev.product_subcategory : ""
                      }));
                    }}
                    required
                  >
                    <option value="">Selecione a categoria</option>
                    {PRODUCT_REGISTRY_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>Sub-categoria</span>
                  <select
                    value={proposalProductProfileForm.product_subcategory}
                    onChange={(event) =>
                      setProposalProductProfileForm((prev) => ({ ...prev, product_subcategory: event.target.value }))
                    }
                    disabled={!proposalProductProfileForm.proposal_type}
                    required={Boolean(proposalProductProfileForm.proposal_type)}
                  >
                    <option value="">
                      {proposalProductProfileForm.proposal_type
                        ? "Selecione a sub-categoria"
                        : "Selecione a categoria primeiro"}
                    </option>
                    {createProfileSubcategoryOptions.map((subcategory) => (
                      <option key={subcategory} value={subcategory}>
                        {subcategory}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>Código no Omie (opcional)</span>
                  <input
                    placeholder="Ex.: PRD00727"
                    value={proposalProductProfileForm.product_code}
                    onChange={(event) =>
                      setProposalProductProfileForm((prev) => ({ ...prev, product_code: event.target.value }))
                    }
                  />
                </label>
                <label className="settings-field">
                  <span>Valor base</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={proposalProductProfileForm.base_price}
                    onChange={(event) => setProposalProductProfileForm((prev) => ({ ...prev, base_price: event.target.value }))}
                  />
                </label>
                <label className="settings-field settings-field-wide">
                  <span>Nome do produto</span>
                  <input
                    required
                    placeholder="Nome do produto"
                    value={proposalProductProfileForm.product_name}
                    onChange={(event) =>
                      setProposalProductProfileForm((prev) => ({ ...prev, product_name: event.target.value }))
                    }
                  />
                </label>
                <label className="settings-field settings-field-wide">
                  <span>Descritivo do produto</span>
                  <textarea
                    className="settings-library-textarea settings-product-description"
                    required
                    placeholder="Descreva o produto para uso em propostas."
                    value={proposalProductProfileForm.technical_text}
                    onChange={(event) =>
                      setProposalProductProfileForm((prev) => ({ ...prev, technical_text: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="settings-product-create-toolbar">
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={proposalProductProfileForm.is_active}
                    onChange={(event) =>
                      setProposalProductProfileForm((prev) => ({ ...prev, is_active: event.target.checked }))
                    }
                  />
                  Produto ativo
                </label>
                <div className="inline-actions">
                  <button type="submit" className="btn-primary" disabled={creatingProposalProductProfile}>
                    {creatingProposalProductProfile ? "Salvando..." : "Cadastrar produto"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={loadProposalProductProfiles}
                    disabled={proposalProductProfilesLoading || creatingProposalProductProfile}
                  >
                    {proposalProductProfilesLoading ? "Atualizando..." : "Atualizar produtos"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={handleSyncLegacyProductCatalog}
                    disabled={syncingLegacyProductCatalog || creatingProposalProductProfile || proposalProductProfilesLoading}
                  >
                    {syncingLegacyProductCatalog ? "Reimportando..." : "Reimportar catálogo legado"}
                  </button>
                </div>
              </div>
            </form>

            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th>Sub-categoria</th>
                    <th>Nome do produto</th>
                    <th>Descritivo</th>
                    <th>Código OMIE</th>
                    <th>Valor base</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {proposalProductProfiles.map((profile) => (
                    <tr key={profile.id}>
                      <td>{proposalProductTypeLabel(profile.proposal_type)}</td>
                      <td>{profile.product_subcategory || "-"}</td>
                      <td>{profile.product_name}</td>
                      <td>{profile.technical_text || "-"}</td>
                      <td>{profile.product_code || "-"}</td>
                      <td>{Number(profile.base_price || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td>{profile.is_active ? "Ativo" : "Inativo"}</td>
                      <td>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="btn-ghost btn-table-action"
                            onClick={() => startEditProposalProductProfile(profile)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-table-action"
                            onClick={() => handleDeleteProposalProductProfile(profile)}
                            disabled={deletingProposalProductProfileId === profile.id}
                          >
                            {deletingProposalProductProfileId === profile.id ? "Excluindo..." : "Excluir"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!proposalProductProfiles.length ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        Nenhum produto cadastrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {editingProposalProductProfileId ? (
              <div className="edit-company-modal-overlay" role="presentation" onClick={cancelEditProposalProductProfile}>
                <article
                  className="edit-company-modal-card"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Editar produto"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="edit-company-modal-header">
                    <h2>Editar produto</h2>
                    <button
                      type="button"
                      className="btn-ghost btn-table-action"
                      onClick={cancelEditProposalProductProfile}
                      disabled={savingProposalProductProfileId === editingProposalProductProfileId}
                    >
                      Fechar
                    </button>
                  </div>
                  <form className="form-grid" onSubmit={handleSaveProposalProductProfile}>
                    <div className="settings-users-selects">
                      <label className="settings-field">
                        <span>Categoria</span>
                        <select
                          value={editProposalProductProfileForm.proposal_type}
                          onChange={(event) => {
                            const nextType = event.target.value;
                            const nextOptions = getSubcategoriesByType(nextType);
                            setEditProposalProductProfileForm((prev) => ({
                              ...prev,
                              proposal_type: nextType,
                              product_subcategory: nextOptions.includes(prev.product_subcategory) ? prev.product_subcategory : ""
                            }));
                          }}
                          required
                        >
                          <option value="">Selecione a categoria</option>
                          {PRODUCT_REGISTRY_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="settings-field">
                        <span>Sub-categoria</span>
                        <select
                          value={editProposalProductProfileForm.product_subcategory}
                          onChange={(event) =>
                            setEditProposalProductProfileForm((prev) => ({ ...prev, product_subcategory: event.target.value }))
                          }
                          disabled={!editProposalProductProfileForm.proposal_type}
                          required={Boolean(editProposalProductProfileForm.proposal_type)}
                        >
                          <option value="">
                            {editProposalProductProfileForm.proposal_type
                              ? "Selecione a sub-categoria"
                              : "Selecione a categoria primeiro"}
                          </option>
                          {editProfileSubcategoryOptions.map((subcategory) => (
                            <option key={subcategory} value={subcategory}>
                              {subcategory}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <input
                      required
                      placeholder="Nome do produto"
                      value={editProposalProductProfileForm.product_name}
                      onChange={(event) =>
                        setEditProposalProductProfileForm((prev) => ({ ...prev, product_name: event.target.value }))
                      }
                    />
                    <textarea
                      className="settings-library-textarea"
                      required
                      placeholder="Descritivo do produto"
                      value={editProposalProductProfileForm.technical_text}
                      onChange={(event) =>
                        setEditProposalProductProfileForm((prev) => ({ ...prev, technical_text: event.target.value }))
                      }
                    />
                    <input
                      placeholder="Código no Omie (opcional)"
                      value={editProposalProductProfileForm.product_code}
                      onChange={(event) =>
                        setEditProposalProductProfileForm((prev) => ({ ...prev, product_code: event.target.value }))
                      }
                    />
                    <div className="settings-users-selects">
                      <label className="settings-field">
                        <span>Valor base</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={editProposalProductProfileForm.base_price}
                          onChange={(event) =>
                            setEditProposalProductProfileForm((prev) => ({ ...prev, base_price: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={editProposalProductProfileForm.is_active}
                        onChange={(event) =>
                          setEditProposalProductProfileForm((prev) => ({ ...prev, is_active: event.target.checked }))
                        }
                      />
                      Produto ativo
                    </label>
                    <div className="inline-actions">
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={savingProposalProductProfileId === editingProposalProductProfileId}
                      >
                        {savingProposalProductProfileId === editingProposalProductProfileId ? "Salvando..." : "Salvar produto"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={cancelEditProposalProductProfile}
                        disabled={savingProposalProductProfileId === editingProposalProductProfileId}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </article>
              </div>
            ) : null}

          </section>

        </div>

        <section className="settings-library-card top-gap">
            <h3>Linhas CPP por produto</h3>
            <p className="muted">
              {proposalCppRows.length} linha(s) para{" "}
              {selectedProposalCppProfile ? proposalProductDisplayLabel(selectedProposalCppProfile) : "produto selecionado"} •{" "}
              {activeProposalCppRowsCount} ativa(s)
            </p>
            {proposalCppRowsError ? <p className="error-text">{proposalCppRowsError}</p> : null}
            {proposalCppRowsSuccess ? <p className="success-text">{proposalCppRowsSuccess}</p> : null}

            <label className="settings-field top-gap">
              <span>Produto para editar CPP</span>
              <select
                value={selectedProposalCppProfileId}
                onChange={(event) => setSelectedProposalCppProfileId(event.target.value)}
                disabled={!proposalProductProfiles.length}
              >
                {!proposalProductProfiles.length ? <option value="">Cadastre um produto primeiro</option> : null}
                {proposalProductProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {proposalProductDisplayLabel(profile)}
                  </option>
                ))}
              </select>
            </label>

            <form className="form-grid top-gap" onSubmit={handleCreateProposalCppRow}>
              <div className="settings-users-selects">
                <label className="settings-field">
                  <span>Seção</span>
                  <select
                    value={proposalCppRowForm.section}
                    onChange={(event) => setProposalCppRowForm((prev) => ({ ...prev, section: event.target.value }))}
                  >
                    {PROPOSAL_CPP_SECTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>Ordem</span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={proposalCppRowForm.sort_order}
                    onChange={(event) => setProposalCppRowForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                  />
                </label>
              </div>
              <input
                required
                placeholder="Item (ex.: Toner T01 Preto)"
                value={proposalCppRowForm.item_name}
                onChange={(event) => setProposalCppRowForm((prev) => ({ ...prev, item_name: event.target.value }))}
                disabled={!selectedProposalCppProfileId}
              />
              <div className="settings-users-selects">
                <input
                  placeholder="Durabilidade fabricante"
                  value={proposalCppRowForm.manufacturer_durability}
                  onChange={(event) =>
                    setProposalCppRowForm((prev) => ({ ...prev, manufacturer_durability: event.target.value }))
                  }
                  disabled={!selectedProposalCppProfileId}
                />
                <input
                  placeholder="Durabilidade gráfica"
                  value={proposalCppRowForm.graphic_durability}
                  onChange={(event) => setProposalCppRowForm((prev) => ({ ...prev, graphic_durability: event.target.value }))}
                  disabled={!selectedProposalCppProfileId}
                />
              </div>
              <div className="settings-users-selects">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Valor do item"
                  value={proposalCppRowForm.item_value}
                  onChange={(event) => setProposalCppRowForm((prev) => ({ ...prev, item_value: event.target.value }))}
                  disabled={!selectedProposalCppProfileId}
                />
                <input
                  type="number"
                  min={0}
                  step="0.00001"
                  placeholder="Custo CPP"
                  value={proposalCppRowForm.cpp_cost}
                  onChange={(event) => setProposalCppRowForm((prev) => ({ ...prev, cpp_cost: event.target.value }))}
                  disabled={!selectedProposalCppProfileId}
                />
              </div>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={proposalCppRowForm.is_active}
                  onChange={(event) => setProposalCppRowForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                  disabled={!selectedProposalCppProfileId}
                />
                Linha ativa
              </label>
              <div className="inline-actions">
                <button type="submit" className="btn-primary" disabled={creatingProposalCppRow || !selectedProposalCppProfileId}>
                  {creatingProposalCppRow ? "Salvando..." : "Criar linha CPP"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => loadProposalCppRows(selectedProposalCppProfileId)}
                  disabled={proposalCppRowsLoading || creatingProposalCppRow || !selectedProposalCppProfileId}
                >
                  {proposalCppRowsLoading ? "Atualizando..." : "Atualizar CPP"}
                </button>
              </div>
            </form>

            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Seção</th>
                    <th>Item</th>
                    <th>Fabricante</th>
                    <th>Gráfica</th>
                    <th>Valor</th>
                    <th>CPP</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {proposalCppRows.map((row) => (
                    <tr key={row.id}>
                      <td>{proposalCppSectionLabel(row.section)}</td>
                      <td>{row.item_name}</td>
                      <td>{row.manufacturer_durability || "-"}</td>
                      <td>{row.graphic_durability || "-"}</td>
                      <td>
                        {row.item_value === null || row.item_value === undefined
                          ? "-"
                          : Number(row.item_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        {row.cpp_cost === null || row.cpp_cost === undefined
                          ? "-"
                          : Number(row.cpp_cost).toLocaleString("pt-BR", { minimumFractionDigits: 5 })}
                      </td>
                      <td>{row.is_active ? "Ativa" : "Inativa"}</td>
                      <td>
                        <div className="inline-actions">
                          <button type="button" className="btn-ghost btn-table-action" onClick={() => startEditProposalCppRow(row)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-table-action"
                            onClick={() => handleToggleProposalCppRowStatus(row)}
                            disabled={savingProposalCppRowId === row.id}
                          >
                            {savingProposalCppRowId === row.id ? "Salvando..." : row.is_active ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-table-action"
                            onClick={() => handleDeleteProposalCppRow(row)}
                            disabled={deletingProposalCppRowId === row.id}
                          >
                            {deletingProposalCppRowId === row.id ? "Excluindo..." : "Excluir"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!proposalCppRows.length ? (
                    <tr>
                      <td colSpan={8} className="muted">
                        Nenhuma linha CPP cadastrada para este produto.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {editingProposalCppRowId ? (
              <form className="form-grid top-gap settings-user-edit-form" onSubmit={handleSaveProposalCppRow}>
                <h3>Editar linha CPP</h3>
                <div className="settings-users-selects">
                  <label className="settings-field">
                    <span>Seção</span>
                    <select
                      value={editProposalCppRowForm.section}
                      onChange={(event) => setEditProposalCppRowForm((prev) => ({ ...prev, section: event.target.value }))}
                    >
                      {PROPOSAL_CPP_SECTION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>Ordem</span>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={editProposalCppRowForm.sort_order}
                      onChange={(event) => setEditProposalCppRowForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                    />
                  </label>
                </div>
                <input
                  required
                  placeholder="Item"
                  value={editProposalCppRowForm.item_name}
                  onChange={(event) => setEditProposalCppRowForm((prev) => ({ ...prev, item_name: event.target.value }))}
                />
                <div className="settings-users-selects">
                  <input
                    placeholder="Durabilidade fabricante"
                    value={editProposalCppRowForm.manufacturer_durability}
                    onChange={(event) =>
                      setEditProposalCppRowForm((prev) => ({ ...prev, manufacturer_durability: event.target.value }))
                    }
                  />
                  <input
                    placeholder="Durabilidade gráfica"
                    value={editProposalCppRowForm.graphic_durability}
                    onChange={(event) =>
                      setEditProposalCppRowForm((prev) => ({ ...prev, graphic_durability: event.target.value }))
                    }
                  />
                </div>
                <div className="settings-users-selects">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Valor do item"
                    value={editProposalCppRowForm.item_value}
                    onChange={(event) => setEditProposalCppRowForm((prev) => ({ ...prev, item_value: event.target.value }))}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.00001"
                    placeholder="Custo CPP"
                    value={editProposalCppRowForm.cpp_cost}
                    onChange={(event) => setEditProposalCppRowForm((prev) => ({ ...prev, cpp_cost: event.target.value }))}
                  />
                </div>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={editProposalCppRowForm.is_active}
                    onChange={(event) => setEditProposalCppRowForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                  />
                  Linha ativa
                </label>
                <div className="inline-actions">
                  <button type="submit" className="btn-primary" disabled={savingProposalCppRowId === editingProposalCppRowId}>
                    {savingProposalCppRowId === editingProposalCppRowId ? "Salvando..." : "Salvar linha CPP"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={cancelEditProposalCppRow}
                    disabled={savingProposalCppRowId === editingProposalCppRowId}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}
        </section>

        <section className="settings-library-card top-gap">
          <h3>Condições comerciais</h3>
          <p className="muted">
            {proposalCommercialTerms.length} conjunto(s) cadastrado(s) • {activeProposalCommercialTermsCount} ativo(s)
          </p>
          {proposalCommercialTermsError ? <p className="error-text">{proposalCommercialTermsError}</p> : null}
          {proposalCommercialTermsSuccess ? <p className="success-text">{proposalCommercialTermsSuccess}</p> : null}

          <form className="form-grid top-gap" onSubmit={handleCreateProposalCommercialTerms}>
            <input
              required
              placeholder="Nome das condições (ex.: Condições padrão ArtPrinter)"
              value={proposalCommercialTermsForm.name}
              onChange={(event) => setProposalCommercialTermsForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <textarea
              className="settings-library-textarea"
              placeholder="Condições de pagamento"
              value={proposalCommercialTermsForm.payment_terms}
              onChange={(event) => setProposalCommercialTermsForm((prev) => ({ ...prev, payment_terms: event.target.value }))}
            />
            <textarea
              className="settings-library-textarea"
              placeholder="Incluso na oferta"
              value={proposalCommercialTermsForm.included_offer}
              onChange={(event) => setProposalCommercialTermsForm((prev) => ({ ...prev, included_offer: event.target.value }))}
            />
            <textarea
              className="settings-library-textarea"
              placeholder="Não incluso na oferta"
              value={proposalCommercialTermsForm.excluded_offer}
              onChange={(event) => setProposalCommercialTermsForm((prev) => ({ ...prev, excluded_offer: event.target.value }))}
            />
            <textarea
              className="settings-library-textarea"
              placeholder="Condições de financiamento"
              value={proposalCommercialTermsForm.financing_terms}
              onChange={(event) => setProposalCommercialTermsForm((prev) => ({ ...prev, financing_terms: event.target.value }))}
            />
            <textarea
              className="settings-library-textarea"
              placeholder="Texto de fechamento"
              value={proposalCommercialTermsForm.closing_text}
              onChange={(event) => setProposalCommercialTermsForm((prev) => ({ ...prev, closing_text: event.target.value }))}
            />
            <div className="settings-users-selects">
              <label className="settings-field">
                <span>Ordem</span>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={proposalCommercialTermsForm.sort_order}
                  onChange={(event) => setProposalCommercialTermsForm((prev) => ({ ...prev, sort_order: event.target.value }))}
                />
              </label>
              <div className="settings-library-flags">
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={proposalCommercialTermsForm.is_default}
                    onChange={(event) => setProposalCommercialTermsForm((prev) => ({ ...prev, is_default: event.target.checked }))}
                  />
                  Definir como padrão
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={proposalCommercialTermsForm.is_active}
                    onChange={(event) => setProposalCommercialTermsForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                  />
                  Condição ativa
                </label>
              </div>
            </div>
            <div className="inline-actions">
              <button type="submit" className="btn-primary" disabled={creatingProposalCommercialTerms}>
                {creatingProposalCommercialTerms ? "Salvando..." : "Criar condições"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={loadProposalCommercialTerms}
                disabled={proposalCommercialTermsLoading || creatingProposalCommercialTerms}
              >
                {proposalCommercialTermsLoading ? "Atualizando..." : "Atualizar condições"}
              </button>
            </div>
          </form>

          <div className="table-wrap top-gap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Padrão</th>
                  <th>Status</th>
                  <th>Ordem</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {proposalCommercialTerms.map((term) => (
                  <tr key={term.id}>
                    <td>{term.name}</td>
                    <td>{term.is_default ? "Sim" : "Não"}</td>
                    <td>{term.is_active ? "Ativo" : "Inativo"}</td>
                    <td>{term.sort_order || 100}</td>
                    <td>
                      <div className="inline-actions">
                        <button type="button" className="btn-ghost btn-table-action" onClick={() => startEditProposalCommercialTerms(term)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleSetDefaultProposalCommercialTerms(term)}
                          disabled={savingProposalCommercialTermsId === term.id || term.is_default}
                        >
                          {savingProposalCommercialTermsId === term.id
                            ? "Salvando..."
                            : term.is_default
                              ? "Padrão"
                              : "Tornar padrão"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleToggleProposalCommercialTermsStatus(term)}
                          disabled={savingProposalCommercialTermsId === term.id}
                        >
                          {savingProposalCommercialTermsId === term.id
                            ? "Salvando..."
                            : term.is_active
                              ? "Desativar"
                              : "Ativar"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleDeleteProposalCommercialTerms(term)}
                          disabled={deletingProposalCommercialTermsId === term.id}
                        >
                          {deletingProposalCommercialTermsId === term.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!proposalCommercialTerms.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Nenhuma condição comercial cadastrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {editingProposalCommercialTermsId ? (
            <form className="form-grid top-gap settings-user-edit-form" onSubmit={handleSaveProposalCommercialTerms}>
              <h3>Editar condições comerciais</h3>
              <input
                required
                placeholder="Nome das condições"
                value={editProposalCommercialTermsForm.name}
                onChange={(event) => setEditProposalCommercialTermsForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <textarea
                className="settings-library-textarea"
                placeholder="Condições de pagamento"
                value={editProposalCommercialTermsForm.payment_terms}
                onChange={(event) =>
                  setEditProposalCommercialTermsForm((prev) => ({ ...prev, payment_terms: event.target.value }))
                }
              />
              <textarea
                className="settings-library-textarea"
                placeholder="Incluso na oferta"
                value={editProposalCommercialTermsForm.included_offer}
                onChange={(event) =>
                  setEditProposalCommercialTermsForm((prev) => ({ ...prev, included_offer: event.target.value }))
                }
              />
              <textarea
                className="settings-library-textarea"
                placeholder="Não incluso na oferta"
                value={editProposalCommercialTermsForm.excluded_offer}
                onChange={(event) =>
                  setEditProposalCommercialTermsForm((prev) => ({ ...prev, excluded_offer: event.target.value }))
                }
              />
              <textarea
                className="settings-library-textarea"
                placeholder="Condições de financiamento"
                value={editProposalCommercialTermsForm.financing_terms}
                onChange={(event) =>
                  setEditProposalCommercialTermsForm((prev) => ({ ...prev, financing_terms: event.target.value }))
                }
              />
              <textarea
                className="settings-library-textarea"
                placeholder="Texto de fechamento"
                value={editProposalCommercialTermsForm.closing_text}
                onChange={(event) =>
                  setEditProposalCommercialTermsForm((prev) => ({ ...prev, closing_text: event.target.value }))
                }
              />
              <div className="settings-users-selects">
                <label className="settings-field">
                  <span>Ordem</span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={editProposalCommercialTermsForm.sort_order}
                    onChange={(event) =>
                      setEditProposalCommercialTermsForm((prev) => ({ ...prev, sort_order: event.target.value }))
                    }
                  />
                </label>
                <div className="settings-library-flags">
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={editProposalCommercialTermsForm.is_default}
                      onChange={(event) =>
                        setEditProposalCommercialTermsForm((prev) => ({ ...prev, is_default: event.target.checked }))
                      }
                    />
                    Definir como padrão
                  </label>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={editProposalCommercialTermsForm.is_active}
                      onChange={(event) =>
                        setEditProposalCommercialTermsForm((prev) => ({ ...prev, is_active: event.target.checked }))
                      }
                    />
                    Condição ativa
                  </label>
                </div>
              </div>
              <div className="inline-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingProposalCommercialTermsId === editingProposalCommercialTermsId}
                >
                  {savingProposalCommercialTermsId === editingProposalCommercialTermsId ? "Salvando..." : "Salvar condições"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={cancelEditProposalCommercialTerms}
                  disabled={savingProposalCommercialTermsId === editingProposalCommercialTermsId}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </article>

      <article className="panel top-gap">
        <h2>Importação de contatos WhatsApp</h2>
        <p className="muted">
          O WhatsApp oficial não libera uma API para listar automaticamente todos os contatos do seu celular. Use este importador
          com arquivo CSV/TXT/VCF/JSON (ou cole os dados) para trazer sua base e deduplicar por número.
        </p>
        {waImportError ? <p className="error-text">{waImportError}</p> : null}
        {waImportSuccess ? <p className="success-text">{waImportSuccess}</p> : null}

        <form className="form-grid top-gap" onSubmit={handleImportWhatsAppContacts}>
          <div className="settings-omie-grid">
            <label className="settings-field">
              <span>Vincular todos os contatos a uma empresa (opcional)</span>
              <select
                value={waImportCompanyId}
                onChange={(event) => setWaImportCompanyId(event.target.value)}
                disabled={companyOptionsLoading || waImporting}
              >
                <option value="">Sem vínculo de empresa</option>
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.trade_name}
                    {company.cnpj ? ` (${company.cnpj})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Carregar arquivo (.csv, .txt, .vcf ou .json)</span>
              <input
                type="file"
                accept=".csv,.txt,.vcf,.json,text/csv,text/plain,text/vcard,application/json"
                onChange={handleWaImportFileSelect}
                disabled={waImporting}
              />
            </label>

            <label className="settings-field settings-field-wide">
              <span>Colar lista de contatos (1 linha por contato, com nome e número)</span>
              <textarea
                className="settings-library-textarea"
                value={waImportRawText}
                onChange={(event) => setWaImportRawText(event.target.value)}
                placeholder={"Nome;WhatsApp\nMaria Silva;(47) 99999-1111\nJoao,+55 11 98888-2222"}
                disabled={waImporting}
              />
            </label>
          </div>

          {waImportFileName ? <p className="muted">Arquivo carregado: {waImportFileName}</p> : null}

          <div className="inline-actions">
            <button type="submit" className="btn-primary" disabled={waImporting}>
              {waImporting ? "Importando..." : "Importar contatos"}
            </button>
            <button type="button" className="btn-ghost" onClick={clearWaImportForm} disabled={waImporting}>
              Limpar
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={loadCompanyOptionsForImport}
              disabled={companyOptionsLoading || waImporting}
            >
              {companyOptionsLoading ? "Atualizando empresas..." : "Atualizar empresas"}
            </button>
          </div>
        </form>

        {waImportResult ? (
          <div className="kpi-grid top-gap">
            <article className="kpi-card">
              <span className="kpi-label">Linhas recebidas</span>
              <strong className="kpi-value">{Number(waImportSummary.source_total_rows || waImportSummary.received || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Contatos válidos</span>
              <strong className="kpi-value">{Number(waImportSummary.normalized || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Inseridos</span>
              <strong className="kpi-value">{Number(waImportSummary.inserted || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Já existentes</span>
              <strong className="kpi-value">{Number(waImportSummary.skipped_existing || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Inválidos / ignorados</span>
              <strong className="kpi-value">
                {Number(waImportSummary.skipped_invalid || 0) + Number(waImportSummary.source_skipped_rows || 0)}
              </strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Duplicados na lista</span>
              <strong className="kpi-value">{Number(waImportSummary.skipped_duplicated_in_payload || 0)}</strong>
            </article>
          </div>
        ) : null}

        {Array.isArray(waImportSummary.errors) && waImportSummary.errors.length ? (
          <div className="top-gap">
            <h3>Erros encontrados (amostra)</h3>
            <ul className="muted">
              {waImportSummary.errors.slice(0, 5).map((item, index) => (
                <li key={`wa-import-error-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {Array.isArray(waImportSummary.warnings) && waImportSummary.warnings.length ? (
          <div className="top-gap">
            <h3>Avisos (amostra)</h3>
            <ul className="muted">
              {waImportSummary.warnings.slice(0, 5).map((item, index) => (
                <li key={`wa-import-warning-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </article>

      <article className="panel top-gap">
        <h2>Integração RD Station CRM</h2>
        <p className="muted">
          Por padrão, migra apenas empresas com CNPJ novo dos estados SC, PR e RS. Também é possível sincronizar com contatos
          (WhatsApp) ou fazer importação completa com oportunidades. O Access Token fica salvo apenas neste navegador.
        </p>
        {rdError ? <p className="error-text">{rdError}</p> : null}
        {rdSuccess ? <p className="success-text">{rdSuccess}</p> : null}

        <form className="form-grid top-gap" onSubmit={handleRdSync}>
          <div className="settings-omie-grid">
            <label className="settings-field">
              <span>Access Token RD Station</span>
              <input
                required
                type="password"
                value={rdForm.access_token}
                onChange={(event) => setRdForm((prev) => ({ ...prev, access_token: event.target.value }))}
                placeholder="Token do RD Station CRM (sem Bearer)"
              />
            </label>

            <label className="settings-field settings-field-wide">
              <span>URL da API RD Station CRM</span>
              <input
                value={rdForm.api_url}
                onChange={(event) => setRdForm((prev) => ({ ...prev, api_url: event.target.value }))}
                placeholder={DEFAULT_RDSTATION_URL}
              />
            </label>

            <label className="settings-field">
              <span>Registros por página (1-500)</span>
              <input
                type="number"
                min={1}
                max={500}
                value={rdForm.records_per_page}
                onChange={(event) => setRdForm((prev) => ({ ...prev, records_per_page: event.target.value }))}
              />
            </label>

            <label className="settings-field">
              <span>Máximo de páginas por recurso (1-500, recomendado 200+)</span>
              <input
                type="number"
                min={1}
                max={500}
                value={rdForm.max_pages}
                onChange={(event) => setRdForm((prev) => ({ ...prev, max_pages: event.target.value }))}
              />
            </label>
          </div>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={Boolean(rdForm.dry_run)}
              onChange={(event) => setRdForm((prev) => ({ ...prev, dry_run: event.target.checked }))}
            />
            Modo teste (não grava dados, apenas valida e contabiliza)
          </label>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={rdSouthOnlySelected}
              onChange={(event) => {
                const checked = event.target.checked;
                setRdForm((prev) => ({ ...prev, south_cnpj_only: checked }));
                setRdResumeCursor(null);
              }}
            />
            Migrar apenas CNPJ novos de SC/PR/RS (somente empresas)
          </label>

          {rdSouthOnlySelected ? (
            <label className="settings-field">
              <span>Estados para sincronizar</span>
              <select
                value={String(rdForm.south_state_scope || EMPTY_RD_FORM.south_state_scope)}
                onChange={(event) => {
                  const value = event.target.value;
                  setRdForm((prev) => ({ ...prev, south_state_scope: value }));
                  setRdResumeCursor(null);
                }}
              >
                {RD_SOUTH_STATE_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={rdCustomersOnlySelected}
              onChange={(event) => {
                const checked = event.target.checked;
                setRdForm((prev) => ({ ...prev, sync_customers_only: checked }));
                setRdResumeCursor(null);
              }}
              disabled={rdSouthOnlySelected}
            />
            Sincronizar apenas clientes por CNPJ + contatos com WhatsApp vinculado (ignora duplicados)
          </label>

          {rdFullSyncSelected ? (
            <>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={Boolean(rdForm.deals_only)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setRdForm((prev) => ({ ...prev, deals_only: checked }));
                    setRdResumeCursor(null);
                  }}
                />
                Sincronizar somente oportunidades (pular organizações e contatos)
              </label>

              <div className="settings-omie-grid">
                <label className="settings-field settings-field-wide">
                  <span>Filtrar oportunidades por funil do RD (opcional)</span>
                  <input
                    value={String(rdForm.deal_pipeline_filter || EMPTY_RD_FORM.deal_pipeline_filter)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRdForm((prev) => ({ ...prev, deal_pipeline_filter: value }));
                      setRdResumeCursor(null);
                    }}
                    placeholder="Ex.: Gráficas Novos Contatos"
                  />
                </label>
                <label className="settings-field">
                  <span>Filtrar oportunidades por etapa (opcional)</span>
                  <select
                    value={String(rdForm.deal_stage_filter || EMPTY_RD_FORM.deal_stage_filter)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRdForm((prev) => ({ ...prev, deal_stage_filter: value }));
                      setRdResumeCursor(null);
                    }}
                  >
                    {RD_DEAL_STAGE_FILTER_OPTIONS.map((option) => (
                      <option key={option.value || "all"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-field">
                  <span>Limite de oportunidades processadas (0 = sem limite)</span>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={String(rdForm.deals_limit || EMPTY_RD_FORM.deals_limit)}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRdForm((prev) => ({ ...prev, deals_limit: value }));
                      setRdResumeCursor(null);
                    }}
                  />
                </label>
              </div>

              <div className="inline-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setRdForm((prev) => ({
                      ...prev,
                      deals_only: true,
                      deal_pipeline_filter: "Gráficas Novos Contatos",
                      deal_stage_filter: "",
                      deals_limit: "0",
                      dry_run: true
                    }));
                    setRdResumeCursor(null);
                    setRdSuccess("Modo teste preparado: funil 'Gráficas Novos Contatos' em todas as etapas.");
                  }}
                  disabled={rdSyncing}
                >
                  Preparar teste (Funil Gráficas Novos Contatos)
                </button>
              </div>
            </>
          ) : null}

          <div className="inline-actions">
            <button type="submit" className="btn-primary" disabled={rdSyncing}>
              {rdSyncing ? "Sincronizando..." : "Sincronizar RD Station CRM"}
            </button>
            <button type="button" className="btn-ghost" onClick={loadRdHistory} disabled={rdHistoryLoading || rdSyncing}>
              {rdHistoryLoading ? "Atualizando histórico..." : "Atualizar histórico"}
            </button>
            <button type="button" className="btn-ghost" onClick={clearRdCredentials} disabled={rdSyncing}>
              Limpar token
            </button>
          </div>
        </form>

        {rdResult ? (
          <div className="kpi-grid top-gap">
            <article className="kpi-card">
              <span className="kpi-label">Processados</span>
              <strong className="kpi-value">{Number(rdResultSummary.processed || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Empresas</span>
              <strong className="kpi-value">{Number(rdResultSummary.companies_processed || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Contatos</span>
              <strong className="kpi-value">{Number(rdResultSummary.contacts_processed || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">
                {rdScopeSouthOnly ? `Fora ${rdScopeSouthLabel}` : rdScopeCustomersOnly ? "Contatos ignorados" : "Oportunidades"}
              </span>
              <strong className="kpi-value">
                {rdScopeSouthOnly
                  ? rdSkippedOutsideSouthTotal
                  : rdScopeCustomersOnly
                    ? rdIgnoredContactsTotal
                    : Number(rdResultSummary.opportunities_processed || 0)}
              </strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Empresas já existentes</span>
              <strong className="kpi-value">{Number(rdResultSummary.companies_skipped_existing || 0)}</strong>
            </article>
            {rdStageFilteredTotal > 0 ? (
              <article className="kpi-card">
                <span className="kpi-label">Oportunidades fora do filtro</span>
                <strong className="kpi-value">{rdStageFilteredTotal}</strong>
              </article>
            ) : null}
            {rdPipelineFilteredTotal > 0 ? (
              <article className="kpi-card">
                <span className="kpi-label">Oportunidades fora do funil</span>
                <strong className="kpi-value">{rdPipelineFilteredTotal}</strong>
              </article>
            ) : null}
            {rdPipelineStageFallbackMatchedTotal > 0 ? (
              <article className="kpi-card">
                <span className="kpi-label">Match por etapa (fallback)</span>
                <strong className="kpi-value">{rdPipelineStageFallbackMatchedTotal}</strong>
              </article>
            ) : null}
            {Number(rdResultSummary.opportunities_matched_by_similarity || 0) > 0 ? (
              <article className="kpi-card">
                <span className="kpi-label">Conciliação por similaridade</span>
                <strong className="kpi-value">{Number(rdResultSummary.opportunities_matched_by_similarity || 0)}</strong>
              </article>
            ) : null}
          </div>
        ) : null}
        {rdResult && rdResultSummary.dry_run ? (
          <p className="muted">Resultado em modo teste: os dados foram apenas validados e não foram gravados no CRM.</p>
        ) : null}
        {rdResult &&
        rdScopeValue === "full" &&
        rdOpportunitiesProcessedTotal === 0 &&
        rdPipelineFilteredTotal > 0 &&
        String(rdResultSummary.deal_pipeline_filter || "").trim() ? (
          <p className="error-text">
            Nenhuma oportunidade foi importada porque o filtro de funil descartou {rdPipelineFilteredTotal} registro(s). O sistema
            já aplica fallback por etapa quando o RD não informa o funil; se ainda zerar, revise o nome do funil e rode sem filtro
            para comparar.
          </p>
        ) : null}

        <h3 className="top-gap">Histórico de sincronizações RD</h3>
        <div className="table-wrap top-gap">
          <table>
            <thead>
              <tr>
                <th>Início</th>
                <th>Fim</th>
                <th>Status</th>
                <th>Processados</th>
                <th>Empresas / Contatos / Oportunidades</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rdHistory.map((job) => {
                const result = asObject(job.result);
                const payload = asObject(job.payload);
                const processed = Number(result.processed || 0);
                const companies = Number(result.companies_processed || 0);
                const contacts = Number(result.contacts_processed || 0);
                const opportunities = Number(result.opportunities_processed || 0);
                const errorMessage = String(job.error_message || "").trim();
                const dryRunFlag = Boolean(result.dry_run ?? payload.dry_run);
                const syncScopeValue = String(result.sync_scope || payload.sync_scope || "").trim().toLowerCase();
                const dealsOnlyValue = Boolean(result.deals_only ?? payload.deals_only);
                const dealPipelineFilterValue = String(result.deal_pipeline_filter || payload.deal_pipeline_filter || "").trim();
                const dealStageFilterValue = String(result.deal_stage_filter || payload.deal_stage_filter || "").trim();
                const dealStageFilterLabel = RD_DEAL_STAGE_FILTER_OPTIONS.find(
                  (option) => option.value === dealStageFilterValue
                )?.label;
                const dealsLimitValue = Number(result.deals_limit ?? payload.deals_limit ?? 0);
                const allowedStatesValue = sanitizeAllowedStates(result.allowed_states ?? payload.allowed_states);
                const allowedStatesLabel = formatAllowedStatesLabel(allowedStatesValue);
                const hasMoreFlag = parseBoolean(result.has_more ?? payload.has_more, false);
                const stopReason = String(result.stop_reason || payload.stop_reason || "").trim();
                const nextResource = String(result.next_resource || payload.next_resource || "").trim().toLowerCase();
                const opportunitiesSkippedByPipeline = Number(result.opportunities_skipped_by_pipeline_filter || 0);
                const nextResourceLabel =
                  nextResource === "organizations"
                    ? "organizações"
                    : nextResource === "contacts"
                      ? "contatos"
                      : nextResource === "deals"
                        ? "negócios"
                        : "";
                const syncScopeLabel =
                  syncScopeValue === "full"
                    ? `Importação completa${dealsOnlyValue ? " · somente oportunidades" : ""}${
                        dealPipelineFilterValue ? ` · funil ${dealPipelineFilterValue}` : ""
                      }${
                        dealStageFilterValue ? ` · etapa ${dealStageFilterLabel || dealStageFilterValue}` : ""
                      }${dealsLimitValue > 0 ? ` · limite ${dealsLimitValue}` : ""}`
                    : syncScopeValue === "south_cnpj_only"
                      ? `CNPJ novos ${allowedStatesLabel}`
                      : "Clientes + WhatsApp";
                const partialDetails =
                  hasMoreFlag && !errorMessage
                    ? `Lote parcial (${stopReason || "page_chunk_limit"}). Continue para seguir em ${nextResourceLabel || "próxima etapa"}.`
                    : "";
                const skippedByPipelineDetails =
                  !errorMessage &&
                  !hasMoreFlag &&
                  processed === 0 &&
                  opportunities === 0 &&
                  opportunitiesSkippedByPipeline > 0
                    ? `${opportunitiesSkippedByPipeline} oportunidade(s) fora do funil filtrado neste lote.`
                    : "";
                const details =
                  errorMessage || partialDetails || skippedByPipelineDetails || (job.status === "success" ? "Concluído sem erro." : "-");

                return (
                  <tr key={job.id}>
                    <td>{formatDateTime(job.started_at || job.created_at)}</td>
                    <td>{formatDateTime(job.finished_at)}</td>
                    <td>{syncStatusLabel(job.status)}</td>
                    <td>{processed}</td>
                    <td>
                      {companies} / {contacts} / {opportunities}
                    </td>
                    <td>
                      {dryRunFlag ? "[Modo teste] " : ""}
                      [{syncScopeLabel}] {details}
                    </td>
                  </tr>
                );
              })}
              {!rdHistory.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Nenhuma sincronização RD registrada ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel top-gap">
        <h2>Integração OMIE - Cadastro de clientes</h2>
        <p className="muted">
          Sincronize empresas do OMIE para o CRM usando App Key e App Secret. As credenciais ficam salvas neste navegador e reaproveitadas no mesmo host (incluindo localhost em portas diferentes).
        </p>
        {omieError ? <p className="error-text">{omieError}</p> : null}
        {omieSuccess ? <p className="success-text">{omieSuccess}</p> : null}

        <form className="form-grid top-gap" onSubmit={handleOmieSync}>
          <div className="settings-omie-grid">
            <label className="settings-field">
              <span>App Key</span>
              <input
                required
                value={omieForm.app_key}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, app_key: event.target.value }))}
                placeholder="Sua App Key OMIE"
              />
            </label>

            <label className="settings-field">
              <span>App Secret</span>
              <input
                required
                type="password"
                value={omieForm.app_secret}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, app_secret: event.target.value }))}
                placeholder="Seu App Secret OMIE"
              />
            </label>

            <label className="settings-field">
              <span>Registros por página (1-500)</span>
              <input
                type="number"
                min={1}
                max={500}
                value={omieForm.records_per_page}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, records_per_page: event.target.value }))}
              />
            </label>

            <label className="settings-field">
              <span>Máximo de páginas por execução (1-200)</span>
              <input
                type="number"
                min={1}
                max={200}
                value={omieForm.max_pages}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, max_pages: event.target.value }))}
              />
            </label>

            <label className="settings-field settings-field-wide">
              <span>URL da API de clientes OMIE</span>
              <input
                value={omieForm.omie_api_url}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, omie_api_url: event.target.value }))}
                placeholder={DEFAULT_OMIE_URL}
              />
            </label>
          </div>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={Boolean(omieForm.dry_run)}
              onChange={(event) => setOmieForm((prev) => ({ ...prev, dry_run: event.target.checked }))}
            />
            Modo teste (não grava dados, apenas valida e contabiliza)
          </label>

          <div className="inline-actions">
            <button type="submit" className="btn-primary" disabled={omieSyncing}>
              {omieSyncing ? "Sincronizando..." : "Sincronizar clientes OMIE"}
            </button>
            <button type="button" className="btn-ghost" onClick={loadOmieHistory} disabled={omieHistoryLoading || omieSyncing}>
              {omieHistoryLoading ? "Atualizando histórico..." : "Atualizar histórico"}
            </button>
            <button type="button" className="btn-ghost" onClick={clearOmieCredentials} disabled={omieSyncing}>
              Limpar credenciais
            </button>
          </div>
        </form>

        {omieResult ? (
          <div className="kpi-grid top-gap">
            <article className="kpi-card">
              <span className="kpi-label">Processados</span>
              <strong className="kpi-value">{Number(omieResultSummary.processed || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Empresas criadas</span>
              <strong className="kpi-value">{Number(omieResultSummary.companies_created || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Empresas atualizadas</span>
              <strong className="kpi-value">{Number(omieResultSummary.companies_updated || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Registros ignorados</span>
              <strong className="kpi-value">
                {Number(omieResultSummary.skipped_without_identifier || 0) + Number(omieResultSummary.skipped_without_cnpj || 0)}
              </strong>
            </article>
          </div>
        ) : null}

        <h3 className="top-gap">Histórico de sincronizações</h3>
        <div className="table-wrap top-gap">
          <table>
            <thead>
              <tr>
                <th>Início</th>
                <th>Fim</th>
                <th>Status</th>
                <th>Processados</th>
                <th>Criadas / Atualizadas</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {omieHistory.map((job) => {
                const result = asObject(job.result);
                const processed = Number(result.processed || 0);
                const created = Number(result.companies_created || 0);
                const updated = Number(result.companies_updated || 0);
                const errorMessage = String(job.error_message || "").trim();

                return (
                  <tr key={job.id}>
                    <td>{formatDateTime(job.started_at || job.created_at)}</td>
                    <td>{formatDateTime(job.finished_at)}</td>
                    <td>{syncStatusLabel(job.status)}</td>
                    <td>{processed}</td>
                    <td>
                      {created} / {updated}
                    </td>
                    <td>{errorMessage || (job.status === "success" ? "Concluído sem erro." : "-")}</td>
                  </tr>
                );
              })}
              {!omieHistory.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Nenhuma sincronização OMIE registrada ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
