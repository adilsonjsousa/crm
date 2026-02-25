import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type AnyRecord = Record<string, unknown>;
type ResourceName = "organizations" | "contacts" | "deals";
type SyncScope = "south_cnpj_only" | "customers_whatsapp_only" | "full";
type RdAuthMode = "bearer" | "query_token";
type RdAuthState = {
  mode: RdAuthMode;
  apiUrl: string;
  allowLegacyFallback: boolean;
  fallbackActivated: boolean;
};

const RESOURCE_ORDER: ResourceName[] = ["organizations", "contacts", "deals"];
const DEFAULT_RDSTATION_API_URL = "https://api.rd.services/crm/v2";
const LEGACY_RDSTATION_API_URL = "https://crm.rdstation.com/api/v1";
const DEFAULT_EXECUTION_GUARD_MS = 90000;
const DEFAULT_PAGE_CHUNK_SIZE = 4;
const LIVE_MAX_RECORDS_PER_PAGE = 100;
const LIVE_MAX_PAGE_CHUNK_SIZE = 1;
const LEGACY_MAX_RECORDS_PER_PAGE = 50;
const BEARER_REQUEST_TIMEOUT_MS = 20000;
const LEGACY_REQUEST_TIMEOUT_MS = 35000;
const BRASILAPI_REQUEST_TIMEOUT_MS = 12000;
const RD_COMPANY_ENRICHMENT_BATCH_LIMIT = 24;
const RD_COMPANY_ENRICHMENT_SCAN_LIMIT = 300;
const MAX_ERRORS = 30;
const DEFAULT_SOUTH_UF_FILTER = ["SC", "PR", "RS"] as const;
const BRAZIL_UF_CODES = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO"
]);
const BRAZIL_UF_BY_NAME: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO"
};
const OPPORTUNITY_TITLE_STOPWORDS = new Set([
  "a",
  "as",
  "o",
  "os",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "para",
  "por",
  "com",
  "sem",
  "novo",
  "nova",
  "novos",
  "novas",
  "equipamento",
  "equipamentos",
  "maquina",
  "maquinas",
  "impressora",
  "impressoras",
  "proposta",
  "comercial"
]);
const OPPORTUNITY_MATCH_SCORE_THRESHOLD = 0.74;
const OPPORTUNITY_MATCH_SCORE_STAGE_ASSISTED = 0.64;
const OPPORTUNITY_MATCH_AMBIGUITY_GAP = 0.06;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function asObject(value: unknown): AnyRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRecord;
  return {};
}

function safeString(value: unknown) {
  return String(value ?? "").trim();
}

function sanitizeRdAccessToken(value: unknown) {
  const raw = safeString(value).replace(/^['"]+|['"]+$/g, "");
  return raw.replace(/^bearer\s+/i, "").replace(/\s+/g, "").trim();
}

function resolveLegacyRdApiUrl(apiUrl: string) {
  const normalized = safeString(apiUrl).replace(/\/$/, "");
  if (!normalized) return LEGACY_RDSTATION_API_URL;
  if (/\/api\/v1$/i.test(normalized)) return normalized;

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === "api.rd.services") {
      return LEGACY_RDSTATION_API_URL;
    }
  } catch {
    return LEGACY_RDSTATION_API_URL;
  }

  return normalized.replace(/\/crm\/v2$/i, "/api/v1");
}

function buildAuthState(authModeRaw: unknown, apiUrl: string): RdAuthState {
  const mode = safeString(authModeRaw).toLowerCase();
  if (["query_token", "querytoken", "legacy", "token_query"].includes(mode)) {
    return {
      mode: "query_token",
      apiUrl: resolveLegacyRdApiUrl(apiUrl),
      allowLegacyFallback: false,
      fallbackActivated: false
    };
  }
  if (mode === "bearer") {
    return {
      mode: "bearer",
      apiUrl,
      allowLegacyFallback: false,
      fallbackActivated: false
    };
  }
  return {
    mode: "bearer",
    apiUrl,
    allowLegacyFallback: true,
    fallbackActivated: false
  };
}

function resolveSyncScope(value: unknown): SyncScope {
  const raw = safeString(value).toLowerCase();
  if (["south_cnpj_only", "south_only", "cnpj_south", "south_cnpj"].includes(raw)) {
    return "south_cnpj_only";
  }
  if (["full", "crm_full", "all", "everything", "deals"].includes(raw)) {
    return "full";
  }
  return "customers_whatsapp_only";
}

function digitsOnly(value: unknown) {
  return safeString(value).replace(/\D/g, "");
}

function normalizeCnpj(value: unknown) {
  const digits = digitsOnly(value);
  return digits.length === 14 ? digits : "";
}

function isValidCnpj(digits: string) {
  if (!/^\d{14}$/.test(digits)) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const sum = base
      .split("")
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const base12 = digits.slice(0, 12);
  const d1 = calcDigit(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(digits[12])) return false;

  const base13 = `${base12}${d1}`;
  const d2 = calcDigit(base13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(digits[13]);
}

function extractCnpjCandidatesFromText(value: unknown) {
  const text = safeString(value);
  if (!text) return [];

  const candidates = new Set<string>();
  const pushCandidate = (rawCandidate: string) => {
    const normalized = normalizeCnpj(rawCandidate);
    if (normalized) candidates.add(normalized);
  };

  const strictFormatted = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
  const plainDigits = /(?<!\d)\d{14}(?!\d)/g;
  const relaxedFormatted = /\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-\s]?\d{2}/g;

  for (const pattern of [strictFormatted, plainDigits, relaxedFormatted]) {
    const matches = text.match(pattern) || [];
    for (const match of matches) pushCandidate(match);
  }

  return Array.from(candidates);
}

function formatCnpj(value: unknown) {
  const digits = normalizeCnpj(value);
  if (!digits) return "";
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function normalizeText(value: unknown) {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeAddressToken(value: unknown) {
  return safeString(value).replace(/\s+/g, " ").trim();
}

function normalizeUf(value: unknown) {
  const raw = safeString(value).toUpperCase();
  if (!raw) return "";

  const directToken = raw.match(/\b([A-Z]{2})\b/);
  if (directToken && BRAZIL_UF_CODES.has(directToken[1])) {
    return directToken[1];
  }

  const onlyLetters = raw.replace(/[^A-Z]/g, "");
  if (onlyLetters.length === 2 && BRAZIL_UF_CODES.has(onlyLetters)) {
    return onlyLetters;
  }

  const byName = BRAZIL_UF_BY_NAME[normalizeText(raw).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()];
  if (byName) return byName;

  return "";
}

function parseUfFilter(value: unknown, fallback: readonly string[] = []) {
  const rawTokens: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) rawTokens.push(safeString(item));
  } else {
    rawTokens.push(...safeString(value).split(/[,\s;|]+/));
  }

  const normalized = new Set<string>();
  for (const token of rawTokens) {
    const uf = normalizeUf(token);
    if (uf) normalized.add(uf);
  }

  if (!normalized.size) {
    for (const item of fallback) {
      const uf = normalizeUf(item);
      if (uf) normalized.add(uf);
    }
  }

  return normalized;
}

function normalizeCity(value: unknown, stateUf: string) {
  let city = normalizeAddressToken(value);
  if (!city) return "";

  city = city
    .replace(/\s*\([A-Za-z]{2}\)\s*$/g, "")
    .replace(/\s*[-/]\s*[A-Za-z]{2}\s*$/g, "")
    .replace(/\s*,\s*[A-Za-z]{2}\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (stateUf) {
    const trailingUfPattern = new RegExp(`\\s+${stateUf}$`, "i");
    city = city.replace(trailingUfPattern, "").trim();
  }

  return city;
}

function buildCompanyAddressFull({
  street,
  number,
  complement,
  district,
  city,
  state,
  cep
}: {
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  cep: string;
}) {
  const normalizedState = normalizeUf(state);
  const normalizedCity = normalizeCity(city, normalizedState).toUpperCase();
  const cityState = normalizedCity
    ? normalizedState
      ? `${normalizedCity} (${normalizedState})`
      : normalizedCity
    : "";

  const parts = [
    normalizeAddressToken(street).toUpperCase(),
    normalizeAddressToken(number).toUpperCase(),
    normalizeAddressToken(complement).toUpperCase(),
    normalizeAddressToken(district).toUpperCase(),
    cityState,
    normalizedState,
    cep ? `CEP ${cep}` : ""
  ].filter(Boolean);

  return parts.join(", ");
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = safeString(value).toLowerCase();
  if (["1", "true", "yes", "sim", "on"].includes(raw)) return true;
  if (["0", "false", "no", "nao", "não", "off"].includes(raw)) return false;
  return fallback;
}

function parseNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = safeString(value);
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateOnly(value: unknown) {
  const raw = safeString(value);
  if (!raw) return null;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900) {
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pickFirstNonEmpty(source: AnyRecord, keys: string[]) {
  const toScalarString = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value).trim();
    }
    return "";
  };

  for (const key of keys) {
    const value = toScalarString(source[key]);
    if (value) return value;
  }
  return "";
}

function pickFirstObject(source: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const candidate = source[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate as AnyRecord;
    }
  }
  return {};
}

function pickFirstArray(source: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const candidate = source[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractScalarStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || value === undefined) return [];

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const normalized = safeString(value);
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    const collected: string[] = [];
    for (const item of value) {
      collected.push(...extractScalarStrings(item, depth + 1));
      if (collected.length >= 30) break;
    }
    return collected;
  }

  if (typeof value === "object") {
    const collected: string[] = [];
    for (const item of Object.values(asObject(value))) {
      collected.push(...extractScalarStrings(item, depth + 1));
      if (collected.length >= 30) break;
    }
    return collected;
  }

  return [];
}

function extractCnpjFromValue(value: unknown, depth = 0): string {
  if (depth > 5 || value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const direct = normalizeCnpj(value);
    if (direct && isValidCnpj(direct)) return direct;

    const textCandidates = extractCnpjCandidatesFromText(value);
    const validTextCandidate = textCandidates.find((candidate) => isValidCnpj(candidate));
    if (validTextCandidate) return validTextCandidate;

    if (direct) return direct;
    if (textCandidates.length) return textCandidates[0];
    return "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractCnpjFromValue(item, depth + 1);
      if (nested) return nested;
    }
    return "";
  }

  if (typeof value === "object") {
    for (const item of Object.values(asObject(value))) {
      const nested = extractCnpjFromValue(item, depth + 1);
      if (nested) return nested;
    }
  }

  return "";
}

function extractValidCnpjFromValue(value: unknown, depth = 0): string {
  if (depth > 5 || value === null || value === undefined) return "";

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const textCandidates = extractCnpjCandidatesFromText(value);
    const validTextCandidate = textCandidates.find((candidate) => isValidCnpj(candidate));
    if (validTextCandidate) return validTextCandidate;

    const direct = normalizeCnpj(value);
    if (direct && isValidCnpj(direct)) return direct;
    return "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractValidCnpjFromValue(item, depth + 1);
      if (nested) return nested;
    }
    return "";
  }

  if (typeof value === "object") {
    for (const item of Object.values(asObject(value))) {
      const nested = extractValidCnpjFromValue(item, depth + 1);
      if (nested) return nested;
    }
  }

  return "";
}

function getCustomFieldCollections(source: AnyRecord) {
  return [
    source.custom_fields,
    source.customFields,
    source.organization_custom_fields,
    source.organizationCustomFields,
    source.fields,
    source.extra_fields,
    source.additional_fields,
    source.metadata,
    source.meta
  ];
}

function normalizeHintToken(value: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

function extractCustomFieldValue(source: AnyRecord, hints: string[]) {
  const normalizedHints = hints.map(normalizeHintToken).filter(Boolean);
  if (!normalizedHints.length) return "";

  const keyMatchesHint = (value: unknown) => {
    const normalized = normalizeHintToken(safeString(value));
    if (!normalized) return false;
    return normalizedHints.some((hint) => normalized.includes(hint));
  };

  for (const collection of getCustomFieldCollections(source)) {
    if (Array.isArray(collection)) {
      for (const rawField of collection) {
        const field = asObject(rawField);
        const descriptors = [
          field,
          asObject(field.custom_field),
          asObject(field.field),
          asObject(field.definition),
          asObject(field.meta)
        ];

        let matched = false;
        for (const descriptor of descriptors) {
          for (const nameKey of [
            "name",
            "label",
            "key",
            "slug",
            "field_name",
            "custom_field_name",
            "identifier",
            "title",
            "tag"
          ]) {
            if (keyMatchesHint(descriptor[nameKey])) {
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
        if (!matched) continue;

        for (const valueKey of [
          "value",
          "raw_value",
          "value_text",
          "field_value",
          "content",
          "text",
          "valor"
        ]) {
          const values = extractScalarStrings(field[valueKey]);
          if (values.length) return values[0];
        }

        const fallbackValues = extractScalarStrings(field);
        if (fallbackValues.length) return fallbackValues[0];
      }
      continue;
    }

    const objectCollection = asObject(collection);
    for (const [key, value] of Object.entries(objectCollection)) {
      if (!keyMatchesHint(key)) continue;
      const values = extractScalarStrings(value);
      if (values.length) return values[0];
    }
  }

  return "";
}

function extractAnyCnpjFromCustomFields(source: AnyRecord) {
  for (const collection of getCustomFieldCollections(source)) {
    const cnpj = extractCnpjFromValue(collection);
    if (cnpj) return cnpj;
  }
  return "";
}

function extractOrganizationState(row: AnyRecord, address: AnyRecord) {
  const directState =
    pickFirstNonEmpty(address, ["state", "uf"]) ||
    pickFirstNonEmpty(row, ["state", "uf", "address_state", "state_code"]) ||
    extractCustomFieldValue(row, ["estado", "uf", "state"]);
  const normalizedDirectState = normalizeUf(directState);
  if (normalizedDirectState) return normalizedDirectState;

  const addressText =
    pickFirstNonEmpty(row, ["address_full", "full_address", "address"]) ||
    pickFirstNonEmpty(address, ["full", "formatted", "address_line", "line1"]);
  return normalizeUf(addressText);
}

function extractArrayByKeys(payload: AnyRecord, keys: string[]) {
  const root = asObject(payload);
  for (const key of keys) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  const dataObject = asObject(root.data);
  for (const key of keys) {
    if (Array.isArray(dataObject[key])) return dataObject[key] as unknown[];
  }
  if (Array.isArray(root.data)) return root.data as unknown[];
  return [];
}

function parseLinkHeaderNext(linkHeader: string) {
  const match = safeString(linkHeader).match(/<([^>]+)>;\s*rel="?next"?/i);
  if (!match) return "";
  return safeString(match[1]);
}

function getNumericFromObjects(sources: AnyRecord[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const parsed = clampNumber(source[key], 0, 1000000, -1);
      if (parsed >= 0) return parsed;
    }
  }
  return -1;
}

function detectHasNextPage({
  payload,
  page,
  recordsPerPage,
  receivedItems,
  response
}: {
  payload: AnyRecord;
  page: number;
  recordsPerPage: number;
  receivedItems: number;
  response: Response;
}) {
  const root = asObject(payload);
  const dataObj = asObject(root.data);
  const meta = asObject(root.meta);
  const pagination = asObject(root.pagination);
  const links = asObject(root.links);

  const nextRawCandidates = [
    root.next_page,
    root.nextPage,
    dataObj.next_page,
    dataObj.nextPage,
    meta.next_page,
    meta.nextPage,
    meta.next,
    pagination.next_page,
    pagination.nextPage,
    pagination.next,
    links.next
  ];
  for (const candidate of nextRawCandidates) {
    const nextRaw = safeString(candidate);
    if (nextRaw) {
      return {
        hasNext: true,
        nextCursor: nextRaw,
        nextPage: page + 1
      };
    }
  }

  const nextFromHeader = parseLinkHeaderNext(response.headers.get("link") || response.headers.get("Link") || "");
  if (nextFromHeader) {
    return {
      hasNext: true,
      nextCursor: nextFromHeader,
      nextPage: page + 1
    };
  }

  const hasMoreRaw = [
    root.has_more,
    root.hasMore,
    dataObj.has_more,
    dataObj.hasMore,
    meta.has_more,
    meta.hasMore,
    pagination.has_more,
    pagination.hasMore
  ];
  for (const item of hasMoreRaw) {
    if (typeof item === "boolean") {
      if (item) {
        return {
          hasNext: true,
          nextCursor: "",
          nextPage: page + 1
        };
      }
      return {
        hasNext: false,
        nextCursor: "",
        nextPage: page
      };
    }
  }

  const totalPages = getNumericFromObjects([root, dataObj, meta, pagination], [
    "total_pages",
    "totalPages",
    "pages",
    "total_paginas",
    "quantidade_de_paginas"
  ]);
  if (totalPages > 0) {
    return {
      hasNext: page < totalPages,
      nextCursor: "",
      nextPage: page + 1
    };
  }

  if (receivedItems <= 0 || receivedItems < recordsPerPage) {
    return {
      hasNext: false,
      nextCursor: "",
      nextPage: page
    };
  }

  return {
    hasNext: true,
    nextCursor: "",
    nextPage: page + 1
  };
}

function formatBrazilPhone(value: unknown) {
  const rawDigits = digitsOnly(value);
  if (!rawDigits) return null;

  let digits = rawDigits;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length > 11) {
    digits = digits.slice(digits.length - 11);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;

  const ddd = digits.slice(0, 2);
  const local = digits.slice(2);
  if (digits.length === 10) return `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  return `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`;
}

function phoneLookupCandidates(value: unknown) {
  const raw = safeString(value);
  const formatted = formatBrazilPhone(raw);
  const allDigits = digitsOnly(raw);
  let brazilDigits = allDigits;
  if ((brazilDigits.length === 12 || brazilDigits.length === 13) && brazilDigits.startsWith("55")) {
    brazilDigits = brazilDigits.slice(2);
  }
  if (brazilDigits.length > 11) {
    brazilDigits = brazilDigits.slice(brazilDigits.length - 11);
  }

  const unique = new Set<string>();
  for (const candidate of [raw, formatted || "", allDigits, brazilDigits]) {
    const normalized = safeString(candidate);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

function formatCep(value: unknown) {
  const digits = digitsOnly(value);
  if (digits.length !== 8) return "";
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function buildSyntheticDocument(prefix: string, value: unknown) {
  const normalized = safeString(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
  if (!normalized) return "";
  return `${prefix}-${normalized}`.toUpperCase();
}

function mapBrasilApiCompanyProfile(payloadRaw: unknown) {
  const payload = asObject(payloadRaw);
  const state = normalizeUf(payload.uf);
  const city = normalizeCity(payload.municipio ?? payload.cidade ?? payload.city, state).toUpperCase();
  const addressFull = buildCompanyAddressFull({
    street: safeString(payload.logradouro).toUpperCase(),
    number: safeString(payload.numero).toUpperCase(),
    complement: safeString(payload.complemento).toUpperCase(),
    district: safeString(payload.bairro).toUpperCase(),
    city,
    state,
    cep: formatCep(payload.cep)
  });

  return {
    legal_name: safeString(payload.razao_social),
    trade_name: safeString(payload.nome_fantasia) || safeString(payload.razao_social),
    city,
    state,
    address_full: addressFull
  };
}

async function fetchCompanyByCnpjFromBrasilApi({
  cnpj,
  cache
}: {
  cnpj: string;
  cache: Map<string, AnyRecord | null>;
}) {
  const normalizedCnpj = normalizeCnpj(cnpj);
  if (!normalizedCnpj) return null;
  if (!isValidCnpj(normalizedCnpj)) return null;

  if (cache.has(normalizedCnpj)) {
    return cache.get(normalizedCnpj) || null;
  }

  const url = `https://brasilapi.com.br/api/cnpj/v1/${normalizedCnpj}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    },
    BRASILAPI_REQUEST_TIMEOUT_MS
  );

  if (response.status === 404) {
    cache.set(normalizedCnpj, null);
    return null;
  }

  if (!response.ok) {
    const rawText = await response.text();
    const detail = safeString(rawText).slice(0, 220);
    throw new Error(detail ? `brasilapi_http_${response.status}:${detail}` : `brasilapi_http_${response.status}`);
  }

  const payload = asObject(await response.json());
  const mapped = mapBrasilApiCompanyProfile(payload);
  cache.set(normalizedCnpj, mapped);
  return mapped;
}

function shouldAttemptCompanyCnpjEnrichment(company: AnyRecord) {
  const hasWeakAddress = isWeakCompanyAddressFull(company.address_full, company.state);
  return (
    !safeString(company.city) ||
    !safeString(company.state) ||
    hasWeakAddress ||
    !safeString(company.legal_name) ||
    !safeString(company.trade_name)
  );
}

function isWeakCompanyAddressFull(addressFull: unknown, stateHint: unknown) {
  const raw = safeString(addressFull).toUpperCase();
  if (!raw) return true;

  const normalized = raw.replace(/\s+/g, " ").trim();
  const normalizedStateHint = normalizeUf(stateHint);
  const normalizedAsUf = normalizeUf(normalized);

  if (normalized.length === 2 && normalizedAsUf) return true;
  if (normalizedStateHint && normalized === normalizedStateHint) return true;
  if (/^[A-Z]{2}\s*(,|-)?\s*CEP\s*\d{5}-?\d{3}$/i.test(normalized)) return true;

  return false;
}

function buildCompanyEnrichmentPatch({
  existingCompany,
  cnpjProfile
}: {
  existingCompany: AnyRecord;
  cnpjProfile: AnyRecord;
}) {
  const patch: AnyRecord = {};

  const legalName = safeString(cnpjProfile.legal_name);
  const tradeName = safeString(cnpjProfile.trade_name);
  const city = normalizeCity(cnpjProfile.city, cnpjProfile.state).toUpperCase();
  const state = normalizeUf(cnpjProfile.state);
  const addressFull = safeString(cnpjProfile.address_full);
  const existingAddressFull = safeString(existingCompany.address_full);
  const shouldReplaceAddress = isWeakCompanyAddressFull(existingAddressFull, existingCompany.state);

  if (!safeString(existingCompany.legal_name) && legalName) patch.legal_name = legalName;
  if (!safeString(existingCompany.trade_name) && tradeName) patch.trade_name = tradeName;
  if (!safeString(existingCompany.city) && city) patch.city = city;
  if (!safeString(existingCompany.state) && state) patch.state = state;
  if (shouldReplaceAddress && addressFull) patch.address_full = addressFull;

  return patch;
}

async function loadCompanySnapshotById({
  supabase,
  companyId
}: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
}) {
  const normalizedCompanyId = safeString(companyId);
  if (!normalizedCompanyId) return null;

  const { data, error } = await supabase
    .from("companies")
    .select("id,cnpj,legal_name,trade_name,address_full,city,state,segmento")
    .eq("id", normalizedCompanyId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Falha ao carregar empresa para enriquecimento.");
  return data ? asObject(data) : null;
}

async function enrichCompanyFromCnpjIfNeeded({
  supabase,
  companyId,
  fallbackCnpj,
  currentCompany,
  dryRun,
  summary,
  cache
}: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  fallbackCnpj: string;
  currentCompany: AnyRecord | null;
  dryRun: boolean;
  summary: AnyRecord;
  cache: Map<string, AnyRecord | null>;
}) {
  const normalizedCompanyId = safeString(companyId);
  if (!normalizedCompanyId) return;

  const company = currentCompany || (await loadCompanySnapshotById({ supabase, companyId: normalizedCompanyId }));
  if (!company) return;

  if (!shouldAttemptCompanyCnpjEnrichment(company)) return;

  const cnpj =
    extractValidCnpjFromValue(company.cnpj) ||
    extractValidCnpjFromValue(fallbackCnpj);
  if (!cnpj) {
    summary.companies_enrichment_skipped_invalid_cnpj =
      getResourceCount(summary, "companies_enrichment_skipped_invalid_cnpj") + 1;
    return;
  }

  summary.companies_enrichment_attempted = getResourceCount(summary, "companies_enrichment_attempted") + 1;

  let cnpjProfile: AnyRecord | null = null;
  try {
    cnpjProfile = await fetchCompanyByCnpjFromBrasilApi({
      cnpj,
      cache
    });
  } catch (error) {
    summary.companies_enrichment_errors = getResourceCount(summary, "companies_enrichment_errors") + 1;
    const message = error instanceof Error ? error.message : "Falha ao consultar BrasilAPI para enriquecimento.";
    appendError(summary, `enrich_cnpj:${message}`);
    return;
  }

  if (!cnpjProfile) {
    summary.companies_enrichment_not_found = getResourceCount(summary, "companies_enrichment_not_found") + 1;
    return;
  }

  const patch = buildCompanyEnrichmentPatch({
    existingCompany: company,
    cnpjProfile
  });
  if (!Object.keys(patch).length) return;

  if (dryRun) {
    summary.companies_enriched_from_cnpj = getResourceCount(summary, "companies_enriched_from_cnpj") + 1;
    return;
  }

  const { error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", normalizedCompanyId);
  if (error) {
    summary.companies_enrichment_errors = getResourceCount(summary, "companies_enrichment_errors") + 1;
    appendError(summary, `enrich_update:${error.message || "Falha ao atualizar empresa com dados de CNPJ."}`);
    return;
  }

  summary.companies_enriched_from_cnpj = getResourceCount(summary, "companies_enriched_from_cnpj") + 1;
}

async function enrichMissingRdCompaniesBatch({
  supabase,
  dryRun,
  summary,
  cache,
  scanLimit,
  batchLimit
}: {
  supabase: ReturnType<typeof createClient>;
  dryRun: boolean;
  summary: AnyRecord;
  cache: Map<string, AnyRecord | null>;
  scanLimit?: number;
  batchLimit?: number;
}) {
  const effectiveScanLimit = clampNumber(
    scanLimit,
    1,
    5000,
    RD_COMPANY_ENRICHMENT_SCAN_LIMIT
  );
  const effectiveBatchLimit = clampNumber(
    batchLimit,
    1,
    effectiveScanLimit,
    RD_COMPANY_ENRICHMENT_BATCH_LIMIT
  );
  const { data, error } = await supabase
    .from("companies")
    .select("id,cnpj,legal_name,trade_name,address_full,city,state,segmento")
    .eq("segmento", "RD Station")
    .order("updated_at", { ascending: true })
    .limit(effectiveScanLimit);
  if (error) {
    appendError(summary, `enrich_batch_scan:${error.message || "Falha ao listar empresas RD para enriquecimento."}`);
    return;
  }

  const rows = Array.isArray(data) ? data.map((row) => asObject(row)) : [];
  const candidates = rows
    .map((row) => {
      const normalizedRow = asObject(row);
      const validCnpj = extractValidCnpjFromValue(normalizedRow.cnpj);
      return {
        ...normalizedRow,
        _enrichment_cnpj: validCnpj
      };
    })
    .filter((row) => {
    if (!shouldAttemptCompanyCnpjEnrichment(row)) return false;
    return safeString(row._enrichment_cnpj).length === 14;
  });
  if (!candidates.length) return;

  const batchCandidates = candidates.slice(0, effectiveBatchLimit);
  summary.companies_enrichment_batch_scanned =
    getResourceCount(summary, "companies_enrichment_batch_scanned") + batchCandidates.length;

  for (const row of batchCandidates) {
    await enrichCompanyFromCnpjIfNeeded({
      supabase,
      companyId: safeString(row.id),
      fallbackCnpj: safeString(row._enrichment_cnpj) || safeString(row.cnpj),
      currentCompany: row,
      dryRun,
      summary,
      cache
    });
  }
}

function appendError(summary: AnyRecord, message: string) {
  const current = Array.isArray(summary.errors) ? summary.errors : [];
  current.push(message);
  summary.errors = current.slice(0, MAX_ERRORS);
}

function appendSample(summary: AnyRecord, key: string, value: AnyRecord, limit = 12) {
  const current = Array.isArray(summary[key]) ? (summary[key] as unknown[]) : [];
  if (current.length >= limit) return;
  current.push(value);
  summary[key] = current;
}

function parseOrganization(itemRaw: unknown) {
  const row = asObject(itemRaw);
  const address = pickFirstObject(row, ["address", "endereco", "company_address"]);

  const externalId = pickFirstNonEmpty(row, ["id", "uuid", "organization_id", "organizationId", "code"]);
  const legalName = pickFirstNonEmpty(row, [
    "legal_name",
    "razao_social",
    "company_name",
    "corporate_name",
    "name",
    "title"
  ]);
  const tradeName = pickFirstNonEmpty(row, [
    "name",
    "trade_name",
    "nome_fantasia",
    "fantasy_name",
    "nickname",
    "title"
  ]);
  const cnpj =
    extractCnpjFromValue(row.cnpj) ||
    extractCnpjFromValue(row.tax_id) ||
    extractCnpjFromValue(row.taxId) ||
    extractCnpjFromValue(row.document) ||
    extractCnpjFromValue(row.document_number) ||
    extractCnpjFromValue(row.documentNumber) ||
    extractCnpjFromValue(row.cpf_cnpj) ||
    extractCnpjFromValue(row.cnpj_cpf) ||
    extractCnpjFromValue(address.cnpj) ||
    extractCnpjFromValue(address.document) ||
    extractCnpjFromValue(extractCustomFieldValue(row, ["cnpj", "cpf cnpj", "cpf_cnpj", "documento", "tax id"])) ||
    extractAnyCnpjFromCustomFields(row) ||
    extractCnpjFromValue(row);
  const email = pickFirstNonEmpty(row, ["email", "primary_email", "contact_email"]).toLowerCase();

  const phone = formatBrazilPhone(
    pickFirstNonEmpty(row, ["phone", "mobile_phone", "whatsapp", "telephone"])
  );

  const rawCity = pickFirstNonEmpty(address, ["city", "cidade"]) || pickFirstNonEmpty(row, ["city", "cidade"]);
  const state = extractOrganizationState(row, address);
  const city = normalizeCity(rawCity, state).toUpperCase();
  const street = pickFirstNonEmpty(address, ["street", "logradouro"]) || pickFirstNonEmpty(row, ["street", "logradouro"]);
  const number = pickFirstNonEmpty(address, ["number", "numero"]) || pickFirstNonEmpty(row, ["number", "numero"]);
  const district = pickFirstNonEmpty(address, ["district", "bairro"]) || pickFirstNonEmpty(row, ["district", "bairro"]);
  const complement = pickFirstNonEmpty(address, ["complement", "complemento"]) || pickFirstNonEmpty(row, ["complement", "complemento"]);
  const cepRaw = pickFirstNonEmpty(address, ["zip_code", "cep"]) || pickFirstNonEmpty(row, ["zip_code", "cep"]);
  const cep = formatCep(cepRaw);
  const addressFull = buildCompanyAddressFull({
    street,
    number,
    complement,
    district,
    city,
    state,
    cep
  });

  return {
    externalId,
    cnpj,
    legalName,
    tradeName,
    email,
    phone,
    city,
    state,
    addressFull
  };
}

function parseContact(itemRaw: unknown) {
  const row = asObject(itemRaw);
  const organization = pickFirstObject(row, ["organization", "company", "account"]);

  const externalId = pickFirstNonEmpty(row, ["id", "uuid", "contact_id", "contactId", "code"]);
  const fullName = pickFirstNonEmpty(row, ["name", "full_name", "nome"]);
  const email = pickFirstNonEmpty(row, ["email", "primary_email"]).toLowerCase();
  const phone = formatBrazilPhone(pickFirstNonEmpty(row, ["phone", "mobile_phone", "whatsapp", "telephone"]));
  const roleTitle = pickFirstNonEmpty(row, ["job_title", "position", "title", "cargo"]);
  const organizationExternalId =
    pickFirstNonEmpty(row, ["organization_id", "organizationId", "company_id", "account_id"]) ||
    pickFirstNonEmpty(organization, ["id", "uuid", "organization_id"]);
  const organizationCnpj = normalizeCnpj(
    row.organization_cnpj ??
      row.company_cnpj ??
      organization.cnpj ??
      organization.tax_id ??
      organization.document ??
      organization.cpf_cnpj
  );

  return {
    externalId,
    fullName,
    email,
    phone,
    roleTitle,
    organizationExternalId,
    organizationCnpj
  };
}

function parseDeal(itemRaw: unknown) {
  const row = asObject(itemRaw);
  const organization = pickFirstObject(row, ["organization", "company", "account"]);
  const contact = pickFirstObject(row, ["contact", "person"]);
  const contacts = pickFirstArray(row, ["contacts", "people"]);
  const stageObject = pickFirstObject(row, [
    "deal_stage",
    "stage",
    "pipeline_stage",
    "funnel_stage",
    "current_stage"
  ]);
  const pipelineObject = pickFirstObject(row, ["pipeline", "funnel"]);
  const statusObject = pickFirstObject(row, ["deal_status", "status", "outcome", "state"]);

  const externalId = pickFirstNonEmpty(row, ["id", "uuid", "deal_id", "dealId", "code"]);
  const title = pickFirstNonEmpty(row, ["name", "title", "deal_name"]);
  const organizationExternalId =
    pickFirstNonEmpty(row, ["organization_id", "organizationId", "company_id", "account_id"]) ||
    pickFirstNonEmpty(organization, ["id", "uuid", "organization_id"]);

  let contactExternalId =
    pickFirstNonEmpty(row, ["contact_id", "contactId", "person_id"]) ||
    pickFirstNonEmpty(contact, ["id", "uuid", "contact_id"]);
  if (!contactExternalId && contacts.length) {
    contactExternalId = pickFirstNonEmpty(asObject(contacts[0]), ["id", "uuid", "contact_id"]);
  }

  const amount = parseNumber(
    row.amount ??
      row.value ??
      row.deal_value ??
      row.total_value ??
      row.total ??
      row.revenue
  );
  const statusRaw =
    pickFirstNonEmpty(row, [
      "status_name",
      "deal_status_name",
      "status",
      "deal_status",
      "outcome",
      "state",
      "result"
    ]) ||
    pickFirstNonEmpty(statusObject, ["name", "label", "title", "status", "state", "value", "description"]) ||
    extractCustomFieldValue(row, ["status", "situacao", "situação", "resultado", "outcome"]);

  let stageRaw =
    pickFirstNonEmpty(row, [
      "stage_name",
      "deal_stage_name",
      "pipeline_stage_name",
      "funnel_stage_name",
      "stage",
      "pipeline_stage",
      "funnel_stage",
      "deal_stage",
      "deal_pipeline_stage",
      "deal_funnel_stage"
    ]) ||
    pickFirstNonEmpty(stageObject, ["name", "label", "title", "stage_name", "stage", "value", "description"]) ||
    pickFirstNonEmpty(pipelineObject, ["stage_name", "current_stage", "name", "label", "title"]) ||
    extractCustomFieldValue(row, ["etapa", "fase", "pipeline", "funil", "stage", "follow up", "follow-up"]);

  if (!stageRaw) {
    const inferredStageCandidates = extractScalarStrings([
      row.stage,
      row.deal_stage,
      row.pipeline_stage,
      row.funnel_stage,
      row.current_stage,
      stageObject,
      pipelineObject,
      row.pipeline,
      row.funnel
    ]);
    for (const candidate of inferredStageCandidates) {
      if (mapOpportunityStage(candidate, "open") !== "lead") {
        stageRaw = candidate;
        break;
      }
    }
  }

  let pipelineRaw =
    pickFirstNonEmpty(row, [
      "pipeline_name",
      "funnel_name",
      "deal_pipeline_name",
      "deal_funnel_name",
      "pipeline_label",
      "funnel_label",
      "deal_pipeline",
      "deal_funnel",
      "pipeline",
      "funnel"
    ]) ||
    pickFirstNonEmpty(pipelineObject, [
      "name",
      "label",
      "title",
      "pipeline_name",
      "funnel_name",
      "pipeline",
      "funnel",
      "slug"
    ]) ||
    pickFirstNonEmpty(stageObject, ["pipeline_name", "funnel_name", "pipeline", "funnel"]) ||
    extractCustomFieldValue(row, ["nome do funil", "funil de vendas", "pipeline", "funil"]);

  if (!pipelineRaw) {
    const inferredPipelineCandidates = extractScalarStrings([
      row.pipeline_name,
      row.funnel_name,
      row.pipeline,
      row.funnel,
      row.deal_pipeline,
      row.deal_funnel,
      pipelineObject
    ]);
    for (const candidate of inferredPipelineCandidates) {
      if (normalizeDealPipelineName(candidate)) {
        pipelineRaw = candidate;
        break;
      }
    }
  }

  const organizationCnpj = normalizeCnpj(
    row.organization_cnpj ??
      row.company_cnpj ??
      row.cnpj ??
      organization.cnpj ??
      organization.tax_id ??
      organization.document ??
      organization.cpf_cnpj ??
      extractCustomFieldValue(row, ["cnpj", "cpf cnpj", "cpf_cnpj", "documento", "tax id"])
  );
  const expectedCloseDate = parseDateOnly(
    row.expected_close_date ??
      row.close_date ??
      row.forecast_close_date ??
      row.closed_at
  );

  return {
    externalId,
    title,
    organizationExternalId,
    organizationCnpj,
    contactExternalId,
    amount,
    statusRaw,
    stageRaw,
    pipelineRaw,
    expectedCloseDate
  };
}

function mapOpportunityStatus(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return "open";
  if (
    normalized.includes("won") ||
    normalized.includes("ganh") ||
    normalized.includes("success")
  ) {
    return "won";
  }
  if (
    normalized.includes("lost") ||
    normalized.includes("perd") ||
    normalized.includes("cancel")
  ) {
    return "lost";
  }
  if (
    normalized.includes("hold") ||
    normalized.includes("espera") ||
    normalized.includes("pause")
  ) {
    return "on_hold";
  }
  return "open";
}

function mapOpportunityStage(stage: unknown, status: string) {
  if (status === "won") return "ganho";
  if (status === "lost") return "perdido";

  const normalized = normalizeText(stage);
  if (!normalized) return "lead";
  if (normalized.includes("propost") || normalized.includes("proposal")) return "proposta";
  if (normalized.includes("orcament") || normalized.includes("budget")) return "proposta";
  if (normalized.includes("qualif")) return "qualificacao";
  if (normalized.includes("follow")) return "follow_up";
  if (normalized.includes("acompanh")) return "follow_up";
  if (normalized.includes("negoci")) return "follow_up";
  if (normalized.includes("stand") || normalized.includes("espera")) return "follow_up";
  if (normalized.includes("ganh") || normalized.includes("won")) return "ganho";
  if (normalized.includes("perd") || normalized.includes("lost")) return "perdido";
  return "lead";
}

function resolveDealStageFilter(value: unknown) {
  const normalized = normalizeText(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized === "all" || normalized === "todas" || normalized === "todas as etapas") {
    return "";
  }
  if (normalized.includes("lead")) return "lead";
  if (normalized.includes("qualif")) return "qualificacao";
  if (normalized.includes("propost") || normalized.includes("proposal")) return "proposta";
  if (normalized.includes("follow")) return "follow_up";
  if (normalized.includes("stand") || normalized.includes("espera")) return "follow_up";
  if (normalized.includes("ganh") || normalized.includes("won")) return "ganho";
  if (normalized.includes("perd") || normalized.includes("lost")) return "perdido";
  return "";
}

function normalizeDealPipelineName(value: unknown) {
  return normalizeText(value)
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDealPipelineFilter(value: unknown) {
  const normalized = normalizeDealPipelineName(value);
  if (
    !normalized ||
    [
      "all",
      "todos",
      "todas",
      "todos os funis",
      "todas as etapas",
      "todos os pipelines",
      "todos os funis de vendas"
    ].includes(normalized)
  ) {
    return "";
  }
  return normalized;
}

function matchDealPipelineFilter(pipelineRaw: unknown, filterNormalized: string) {
  if (!filterNormalized) return true;
  const normalizedPipeline = normalizeDealPipelineName(pipelineRaw);
  if (!normalizedPipeline) return false;
  return (
    normalizedPipeline === filterNormalized ||
    normalizedPipeline.includes(filterNormalized) ||
    filterNormalized.includes(normalizedPipeline)
  );
}

function normalizeLooseOpportunityTitle(value: unknown) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeOpportunityTitle(value: unknown) {
  const normalized = normalizeLooseOpportunityTitle(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && (token.length > 1 || /\d/.test(token)))
    .filter((token) => !OPPORTUNITY_TITLE_STOPWORDS.has(token));
}

function computeTokenDiceScore(aTokens: string[], bTokens: string[]) {
  if (!aTokens.length || !bTokens.length) return 0;
  const counts = new Map<string, number>();
  for (const token of aTokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  let shared = 0;
  for (const token of bTokens) {
    const current = counts.get(token) || 0;
    if (current > 0) {
      shared += 1;
      counts.set(token, current - 1);
    }
  }
  return (2 * shared) / (aTokens.length + bTokens.length);
}

function computeOpportunityAmountSimilarity(left: unknown, right: unknown) {
  const leftValue = parseNumber(left);
  const rightValue = parseNumber(right);
  if (!(leftValue > 0) || !(rightValue > 0)) return 0;
  const minValue = Math.min(leftValue, rightValue);
  const maxValue = Math.max(leftValue, rightValue);
  if (maxValue <= 0) return 0;
  return minValue / maxValue;
}

function computeOpportunityTitleSimilarity(left: unknown, right: unknown) {
  const normalizedLeft = normalizeLooseOpportunityTitle(left);
  const normalizedRight = normalizeLooseOpportunityTitle(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftTokens = tokenizeOpportunityTitle(normalizedLeft);
  const rightTokens = tokenizeOpportunityTitle(normalizedRight);
  const tokenDice = computeTokenDiceScore(leftTokens, rightTokens);

  const compactLeft = normalizedLeft.replace(/\s+/g, "");
  const compactRight = normalizedRight.replace(/\s+/g, "");
  let containmentScore = 0;
  if (compactLeft && compactRight && (compactLeft.includes(compactRight) || compactRight.includes(compactLeft))) {
    const minLength = Math.min(compactLeft.length, compactRight.length);
    const maxLength = Math.max(compactLeft.length, compactRight.length);
    if (minLength >= 4 && maxLength > 0) {
      containmentScore = minLength / maxLength;
    }
  }

  const leftCodeTokens = new Set(
    leftTokens.filter((token) => token.length >= 3 && /[a-z]/.test(token) && /\d/.test(token))
  );
  let sharedCodeTokens = 0;
  for (const token of rightTokens) {
    if (leftCodeTokens.has(token)) sharedCodeTokens += 1;
  }
  const codeBonus = sharedCodeTokens > 0 ? Math.min(0.18, 0.08 + sharedCodeTokens * 0.05) : 0;

  return Math.min(1, Math.max(tokenDice, containmentScore * 0.92) + codeBonus);
}

function isRetriableHttpStatus(status: number) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchResourcePage({
  accessToken,
  resource,
  page,
  recordsPerPage,
  nextCursor,
  authState
}: {
  accessToken: string;
  resource: ResourceName;
  page: number;
  recordsPerPage: number;
  nextCursor: string;
  authState: RdAuthState;
}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const base = authState.apiUrl.replace(/\/$/, "");
    const defaultUrl = new URL(`${base}/${resource}`);
    const effectiveRecordsPerPage =
      authState.mode === "query_token"
        ? Math.min(recordsPerPage, LEGACY_MAX_RECORDS_PER_PAGE)
        : recordsPerPage;
    const nextUrlCandidate = safeString(nextCursor);
    let requestUrl = defaultUrl;

    if (nextUrlCandidate && /^https?:\/\//i.test(nextUrlCandidate)) {
      const candidate = new URL(nextUrlCandidate);
      if (authState.mode === "query_token" && /api\.rd\.services/i.test(candidate.hostname)) {
        requestUrl = defaultUrl;
      } else {
        requestUrl = candidate;
      }
    } else {
      defaultUrl.searchParams.set("page", String(page));
      defaultUrl.searchParams.set("limit", String(effectiveRecordsPerPage));
      defaultUrl.searchParams.set("per_page", String(effectiveRecordsPerPage));
      if (nextUrlCandidate) {
        defaultUrl.searchParams.set("cursor", nextUrlCandidate);
        defaultUrl.searchParams.set("next_page", nextUrlCandidate);
      }
    }

    if (authState.mode === "query_token") {
      requestUrl.searchParams.set("token", accessToken);
    }

    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (authState.mode === "bearer") {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        requestUrl.toString(),
        {
          method: "GET",
          headers
        },
        authState.mode === "query_token" ? LEGACY_REQUEST_TIMEOUT_MS : BEARER_REQUEST_TIMEOUT_MS
      );
    } catch (fetchError) {
      const message = safeString(fetchError instanceof Error ? fetchError.message : fetchError).toLowerCase();
      const timeoutLike = message.includes("abort") || message.includes("timed out") || message.includes("timeout");
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        continue;
      }
      if (timeoutLike) {
        throw new Error("rd_http_504:timeout_rdstation_api");
      }
      throw new Error("rd_http_500:Falha de rede ao consultar RD Station.");
    }

    const responseText = await response.text();
    let payload: AnyRecord = {};
    try {
      payload = asObject(JSON.parse(responseText));
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const detail =
        pickFirstNonEmpty(payload, ["message", "error", "error_description"]) ||
        safeString(responseText).slice(0, 220);
      if (response.status === 401) {
        if (authState.mode === "bearer" && authState.allowLegacyFallback) {
          authState.mode = "query_token";
          authState.apiUrl = resolveLegacyRdApiUrl(authState.apiUrl);
          authState.fallbackActivated = true;
          continue;
        }

        if (authState.mode === "query_token") {
          throw new Error(
            "rd_http_401:invalid_token. Falha também no modo legado do RD CRM. Valide o token no Perfil da conta (API v1) ou use um Access Token OAuth válido."
          );
        }

        throw new Error(
          "rd_http_401:invalid_token. Use o Access Token do RD Station CRM e informe apenas o token (sem prefixo Bearer)."
        );
      }
      if (isRetriableHttpStatus(response.status) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        continue;
      }
      throw new Error(detail ? `rd_http_${response.status}:${detail}` : `rd_http_${response.status}`);
    }

    const items = extractArrayByKeys(payload, [resource, "items", "results", "data"]);
    const pagination = detectHasNextPage({
      payload,
      page,
      recordsPerPage: effectiveRecordsPerPage,
      receivedItems: items.length,
      response
    });

    return {
      payload,
      items,
      hasNext: pagination.hasNext,
      nextPage: pagination.nextPage,
      nextCursor: pagination.nextCursor
    };
  }

  throw new Error("rd_http_500:Falha persistente ao consultar RD Station.");
}

function getResourceCount(summary: AnyRecord, key: string) {
  return Number(summary[key] || 0);
}

async function upsertIntegrationLink({
  supabase,
  provider,
  localEntityType,
  localEntityId,
  externalId,
  syncedAt
}: {
  supabase: ReturnType<typeof createClient>;
  provider: string;
  localEntityType: string;
  localEntityId: string;
  externalId: string;
  syncedAt: string;
}) {
  const { data: byExternal, error: byExternalError } = await supabase
    .from("integration_links")
    .select("id")
    .eq("provider", provider)
    .eq("local_entity_type", localEntityType)
    .eq("external_id", externalId)
    .maybeSingle();
  if (byExternalError) throw new Error(byExternalError.message || "Falha ao buscar vínculo por external_id.");

  if (byExternal?.id) {
    const { error } = await supabase
      .from("integration_links")
      .update({
        local_entity_id: localEntityId,
        last_synced_at: syncedAt
      })
      .eq("id", byExternal.id);
    if (error) throw new Error(error.message || "Falha ao atualizar vínculo por external_id.");
    return;
  }

  const { data: byLocal, error: byLocalError } = await supabase
    .from("integration_links")
    .select("id")
    .eq("provider", provider)
    .eq("local_entity_type", localEntityType)
    .eq("local_entity_id", localEntityId)
    .maybeSingle();
  if (byLocalError) throw new Error(byLocalError.message || "Falha ao buscar vínculo por local_entity_id.");

  if (byLocal?.id) {
    const { error } = await supabase
      .from("integration_links")
      .update({
        external_id: externalId,
        last_synced_at: syncedAt
      })
      .eq("id", byLocal.id);
    if (error) throw new Error(error.message || "Falha ao atualizar vínculo por local_entity_id.");
    return;
  }

  const { error: insertError } = await supabase.from("integration_links").insert({
    provider,
    local_entity_type: localEntityType,
    local_entity_id: localEntityId,
    external_id: externalId,
    last_synced_at: syncedAt
  });
  if (insertError) throw new Error(insertError.message || "Falha ao criar vínculo de integração.");
}

async function findLocalEntityIdByExternal({
  supabase,
  provider,
  localEntityType,
  externalId
}: {
  supabase: ReturnType<typeof createClient>;
  provider: string;
  localEntityType: string;
  externalId: string;
}) {
  const normalizedExternalId = safeString(externalId);
  if (!normalizedExternalId) return "";
  const { data, error } = await supabase
    .from("integration_links")
    .select("local_entity_id")
    .eq("provider", provider)
    .eq("local_entity_type", localEntityType)
    .eq("external_id", normalizedExternalId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Falha ao buscar vínculo de integração.");
  return safeString(data?.local_entity_id);
}

async function listCompanyOpportunityCandidates({
  supabase,
  companyId,
  cache
}: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  cache: Map<string, AnyRecord[]>;
}) {
  const normalizedCompanyId = safeString(companyId);
  if (!normalizedCompanyId) return [];
  if (cache.has(normalizedCompanyId)) {
    return cache.get(normalizedCompanyId) || [];
  }

  const { data, error } = await supabase
    .from("opportunities")
    .select("id,title,stage,status,estimated_value,expected_close_date,company_id,primary_contact_id,created_at,updated_at")
    .eq("company_id", normalizedCompanyId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message || "Falha ao listar oportunidades da empresa para conciliação.");

  const rows = Array.isArray(data) ? data.map((row) => asObject(row)).filter((row) => safeString(row.id)) : [];
  cache.set(normalizedCompanyId, rows);
  return rows;
}

function findBestOpportunityCandidateBySimilarity({
  dealTitle,
  dealStage,
  dealStatus,
  dealAmount,
  candidates
}: {
  dealTitle: string;
  dealStage: string;
  dealStatus: string;
  dealAmount: number;
  candidates: AnyRecord[];
}) {
  const normalizedDealTitle = safeString(dealTitle);
  if (!normalizedDealTitle) return null;

  const normalizedDealStage = safeString(dealStage);
  const normalizedDealStatus = safeString(dealStatus);
  const ranked: Array<{
    row: AnyRecord;
    score: number;
    titleScore: number;
    amountScore: number;
  }> = [];

  for (const candidate of candidates) {
    const candidateTitle = safeString(candidate.title);
    if (!candidateTitle) continue;

    const titleScore = computeOpportunityTitleSimilarity(normalizedDealTitle, candidateTitle);
    if (titleScore <= 0) continue;

    const amountScore = computeOpportunityAmountSimilarity(dealAmount, candidate.estimated_value);
    const stageBonus = safeString(candidate.stage) === normalizedDealStage ? 0.08 : 0;
    const statusBonus = safeString(candidate.status) === normalizedDealStatus ? 0.04 : 0;
    const score = Math.min(1, titleScore * 0.74 + amountScore * 0.14 + stageBonus + statusBonus);

    ranked.push({
      row: candidate,
      score,
      titleScore,
      amountScore
    });
  }

  ranked.sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const secondBest = ranked[1];
  if (!best) return null;

  const stageAligned = safeString(best.row.stage) === normalizedDealStage;
  const strongEnough =
    best.score >= OPPORTUNITY_MATCH_SCORE_THRESHOLD ||
    (best.score >= OPPORTUNITY_MATCH_SCORE_STAGE_ASSISTED && stageAligned && best.titleScore >= 0.6) ||
    (best.titleScore >= 0.82 && best.amountScore >= 0.55);
  if (!strongEnough) return null;

  if (secondBest && best.score - secondBest.score < OPPORTUNITY_MATCH_AMBIGUITY_GAP) {
    return null;
  }

  return best;
}

async function findExistingOpportunityBySimilarity({
  supabase,
  companyId,
  dealTitle,
  dealStage,
  dealStatus,
  dealAmount,
  cache
}: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  dealTitle: string;
  dealStage: string;
  dealStatus: string;
  dealAmount: number;
  cache: Map<string, AnyRecord[]>;
}) {
  const candidates = await listCompanyOpportunityCandidates({
    supabase,
    companyId,
    cache
  });
  if (!candidates.length) return null;

  return findBestOpportunityCandidateBySimilarity({
    dealTitle,
    dealStage,
    dealStatus,
    dealAmount,
    candidates
  });
}

async function findCompanyByCnpj({
  supabase,
  cnpj
}: {
  supabase: ReturnType<typeof createClient>;
  cnpj: string;
}) {
  const normalized = normalizeCnpj(cnpj);
  if (!normalized) return "";

  const cnpjFormatted = formatCnpj(normalized);
  const candidates = Array.from(new Set([normalized, cnpjFormatted].filter(Boolean)));
  if (!candidates.length) return "";

  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .in("cnpj", candidates)
    .limit(1);
  if (error) throw new Error(error.message || "Falha ao buscar empresa por CNPJ.");
  const row = Array.isArray(data) ? data[0] : null;
  return safeString(row?.id);
}

async function upsertCompanyFromOrganization({
  supabase,
  organization,
  dryRun,
  summary,
  companyMap,
  allowedStates,
  cnpjProfileCache
}: {
  supabase: ReturnType<typeof createClient>;
  organization: AnyRecord;
  dryRun: boolean;
  summary: AnyRecord;
  companyMap: Map<string, string>;
  allowedStates: Set<string>;
  cnpjProfileCache: Map<string, AnyRecord | null>;
}) {
  const externalId = safeString(organization.externalId);
  const cnpj = normalizeCnpj(organization.cnpj);
  const companyState = normalizeUf(organization.state);
  const companyCity = normalizeCity(organization.city, companyState).toUpperCase();
  const legalName = safeString(organization.legalName) || safeString(organization.tradeName) || `EMPRESA RD ${externalId || cnpj || "SEM_ID"}`;
  const tradeName = safeString(organization.tradeName) || legalName;

  if (!externalId && !cnpj) {
    summary.skipped_without_identifier = getResourceCount(summary, "skipped_without_identifier") + 1;
    return "";
  }

  if (!cnpj) {
    summary.skipped_without_cnpj = getResourceCount(summary, "skipped_without_cnpj") + 1;
    appendSample(summary, "sample_skipped_without_cnpj", {
      external_id: externalId || null,
      legal_name: legalName || null,
      trade_name: tradeName || null,
      state: companyState || null
    });
    return "";
  }

  if (allowedStates.size && !allowedStates.has(companyState)) {
    summary.companies_skipped_by_state = getResourceCount(summary, "companies_skipped_by_state") + 1;
    appendSample(summary, "sample_skipped_by_state", {
      external_id: externalId || null,
      legal_name: legalName || null,
      trade_name: tradeName || null,
      cnpj: formatCnpj(cnpj) || cnpj || null,
      state: companyState || null
    });
    return "";
  }

  let companyId = "";
  if (externalId) {
    companyId = await findLocalEntityIdByExternal({
      supabase,
      provider: "rdstation",
      localEntityType: "company",
      externalId
    });
  }

  if (!companyId) {
    companyId = await findCompanyByCnpj({
      supabase,
      cnpj
    });
  }

  if (companyId) {
    if (!dryRun && externalId) {
      await upsertIntegrationLink({
        supabase,
        provider: "rdstation",
        localEntityType: "company",
        localEntityId: companyId,
        externalId,
        syncedAt: new Date().toISOString()
      });
      summary.links_updated = getResourceCount(summary, "links_updated") + 1;
    }
    if (externalId) {
      companyMap.set(externalId, companyId);
    }
    await enrichCompanyFromCnpjIfNeeded({
      supabase,
      companyId,
      fallbackCnpj: cnpj,
      currentCompany: null,
      dryRun,
      summary,
      cache: cnpjProfileCache
    });
    summary.companies_skipped_existing = getResourceCount(summary, "companies_skipped_existing") + 1;
    summary.companies_processed = getResourceCount(summary, "companies_processed") + 1;
    return companyId;
  }

  if (dryRun) {
    summary.companies_processed = getResourceCount(summary, "companies_processed") + 1;
    return "";
  }

  const payload = {
    legal_name: legalName,
    trade_name: tradeName,
    cnpj: formatCnpj(cnpj) || cnpj,
    email: safeString(organization.email).toLowerCase() || null,
    phone: safeString(organization.phone) || null,
    address_full: safeString(organization.addressFull) || null,
    city: companyCity || null,
    state: companyState || null,
    segmento: "RD Station"
  };

  const { data, error } = await supabase
    .from("companies")
    .insert(payload)
    .select("id,cnpj,legal_name,trade_name,address_full,city,state,segmento")
    .single();

  if (error) {
    const normalizedErrorMessage = normalizeText(error.message || "");
    if (normalizedErrorMessage.includes("companies_cnpj_key") || normalizedErrorMessage.includes("duplicate key value")) {
      const existingCompanyId = await findCompanyByCnpj({
        supabase,
        cnpj
      });
      if (existingCompanyId) {
        if (!dryRun && externalId) {
          await upsertIntegrationLink({
            supabase,
            provider: "rdstation",
            localEntityType: "company",
            localEntityId: existingCompanyId,
            externalId,
            syncedAt: new Date().toISOString()
          });
          summary.links_updated = getResourceCount(summary, "links_updated") + 1;
        }
        if (externalId) companyMap.set(externalId, existingCompanyId);
        await enrichCompanyFromCnpjIfNeeded({
          supabase,
          companyId: existingCompanyId,
          fallbackCnpj: cnpj,
          currentCompany: null,
          dryRun,
          summary,
          cache: cnpjProfileCache
        });
        summary.companies_skipped_existing = getResourceCount(summary, "companies_skipped_existing") + 1;
        summary.companies_processed = getResourceCount(summary, "companies_processed") + 1;
        return existingCompanyId;
      }
    }
    throw new Error(error.message || "Falha ao inserir empresa.");
  }

  companyId = safeString(data?.id);
  summary.companies_created = getResourceCount(summary, "companies_created") + 1;

  if (companyId && externalId) {
    await upsertIntegrationLink({
      supabase,
      provider: "rdstation",
      localEntityType: "company",
      localEntityId: companyId,
      externalId,
      syncedAt: new Date().toISOString()
    });
    summary.links_updated = getResourceCount(summary, "links_updated") + 1;
    companyMap.set(externalId, companyId);
  }

  await enrichCompanyFromCnpjIfNeeded({
    supabase,
    companyId,
    fallbackCnpj: cnpj,
    currentCompany: asObject(data),
    dryRun,
    summary,
    cache: cnpjProfileCache
  });
  summary.companies_processed = getResourceCount(summary, "companies_processed") + 1;
  return companyId;
}

async function findOrCreateCompanyByExternal({
  supabase,
  externalId,
  fallbackName,
  summary
}: {
  supabase: ReturnType<typeof createClient>;
  externalId: string;
  fallbackName: string;
  summary: AnyRecord;
}) {
  const normalizedExternalId = safeString(externalId);
  if (!normalizedExternalId) return "";

  const linkedId = await findLocalEntityIdByExternal({
    supabase,
    provider: "rdstation",
    localEntityType: "company",
    externalId: normalizedExternalId
  });
  if (linkedId) return linkedId;

  const syntheticCnpj = buildSyntheticDocument("RDORG", normalizedExternalId);
  const { data: existingBySynthetic, error: findError } = await supabase
    .from("companies")
    .select("id")
    .eq("cnpj", syntheticCnpj)
    .maybeSingle();
  if (findError) throw new Error(findError.message || "Falha ao buscar empresa sintética RD.");
  if (existingBySynthetic?.id) {
    const localEntityId = safeString(existingBySynthetic.id);
    await upsertIntegrationLink({
      supabase,
      provider: "rdstation",
      localEntityType: "company",
      localEntityId,
      externalId: normalizedExternalId,
      syncedAt: new Date().toISOString()
    });
    summary.links_updated = getResourceCount(summary, "links_updated") + 1;
    return localEntityId;
  }

  const legalName = safeString(fallbackName) || `EMPRESA RD ${normalizedExternalId}`;
  const { data, error } = await supabase
    .from("companies")
    .insert({
      legal_name: legalName,
      trade_name: legalName,
      cnpj: syntheticCnpj,
      segmento: "RD Station"
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message || "Falha ao criar empresa sintética RD.");

  const localEntityId = safeString(data?.id);
  await upsertIntegrationLink({
    supabase,
    provider: "rdstation",
    localEntityType: "company",
    localEntityId,
    externalId: normalizedExternalId,
    syncedAt: new Date().toISOString()
  });
  summary.companies_created = getResourceCount(summary, "companies_created") + 1;
  summary.links_updated = getResourceCount(summary, "links_updated") + 1;
  return localEntityId;
}

async function upsertContactFromRd({
  supabase,
  contact,
  dryRun,
  summary,
  companyMap
}: {
  supabase: ReturnType<typeof createClient>;
  contact: AnyRecord;
  dryRun: boolean;
  summary: AnyRecord;
  companyMap: Map<string, string>;
}) {
  const externalId = safeString(contact.externalId);
  const fullName = safeString(contact.fullName) || `Contato RD ${externalId || "sem-id"}`;
  const email = safeString(contact.email).toLowerCase();
  const phone = safeString(contact.phone);
  const organizationExternalId = safeString(contact.organizationExternalId);
  const organizationCnpj = normalizeCnpj(contact.organizationCnpj);

  if (!externalId && !email && !phone) {
    summary.skipped_without_identifier = getResourceCount(summary, "skipped_without_identifier") + 1;
    return "";
  }

  if (!organizationExternalId && !organizationCnpj) {
    summary.contacts_skipped_without_company =
      getResourceCount(summary, "contacts_skipped_without_company") + 1;
    return "";
  }

  if (!phone) {
    summary.contacts_skipped_without_whatsapp =
      getResourceCount(summary, "contacts_skipped_without_whatsapp") + 1;
    return "";
  }

  let companyId = "";
  if (organizationExternalId) {
    companyId = companyMap.get(organizationExternalId) || "";
  }

  if (!companyId && organizationExternalId) {
    companyId = await findLocalEntityIdByExternal({
      supabase,
      provider: "rdstation",
      localEntityType: "company",
      externalId: organizationExternalId
    });
    if (companyId) {
      companyMap.set(organizationExternalId, companyId);
    }
  }

  if (!companyId && organizationCnpj) {
    companyId = await findCompanyByCnpj({
      supabase,
      cnpj: organizationCnpj
    });
  }

  if (!companyId) {
    summary.contacts_skipped_without_company =
      getResourceCount(summary, "contacts_skipped_without_company") + 1;
    return "";
  }

  let contactId = "";
  let existingContact: AnyRecord | null = null;

  if (externalId) {
    contactId = await findLocalEntityIdByExternal({
      supabase,
      provider: "rdstation",
      localEntityType: "contact",
      externalId
    });
    if (contactId) {
      existingContact = { id: contactId };
    }
  }

  if (!existingContact && phone) {
    const phoneCandidates = phoneLookupCandidates(phone);
    if (!phoneCandidates.length) {
      summary.contacts_skipped_without_whatsapp =
        getResourceCount(summary, "contacts_skipped_without_whatsapp") + 1;
      return "";
    }
    const { data, error } = await supabase
      .from("contacts")
      .select("id")
      .in("phone", phoneCandidates)
      .limit(1);
    if (error) throw new Error(error.message || "Falha ao buscar contato por WhatsApp.");
    const row = Array.isArray(data) ? data[0] : null;
    if (row?.id) {
      existingContact = row;
      contactId = safeString(row.id);
    }
  }

  if (existingContact) {
    if (!dryRun && contactId && externalId) {
      await upsertIntegrationLink({
        supabase,
        provider: "rdstation",
        localEntityType: "contact",
        localEntityId: contactId,
        externalId,
        syncedAt: new Date().toISOString()
      });
      summary.links_updated = getResourceCount(summary, "links_updated") + 1;
    }
    summary.contacts_skipped_existing_whatsapp =
      getResourceCount(summary, "contacts_skipped_existing_whatsapp") + 1;
    summary.contacts_processed = getResourceCount(summary, "contacts_processed") + 1;
    return contactId;
  }

  if (dryRun) {
    summary.contacts_processed = getResourceCount(summary, "contacts_processed") + 1;
    return "";
  }

  const payload = {
    company_id: companyId,
    full_name: fullName,
    email: email || null,
    phone,
    role_title: safeString(contact.roleTitle) || null
  };

  const { data, error } = await supabase
    .from("contacts")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(error.message || "Falha ao inserir contato.");
  contactId = safeString(data?.id);
  summary.contacts_created = getResourceCount(summary, "contacts_created") + 1;

  if (contactId && externalId) {
    await upsertIntegrationLink({
      supabase,
      provider: "rdstation",
      localEntityType: "contact",
      localEntityId: contactId,
      externalId,
      syncedAt: new Date().toISOString()
    });
    summary.links_updated = getResourceCount(summary, "links_updated") + 1;
  }

  summary.contacts_processed = getResourceCount(summary, "contacts_processed") + 1;
  return contactId;
}

async function upsertOpportunityFromDeal({
  supabase,
  deal,
  dryRun,
  summary,
  companyMap,
  opportunityMatchCache
}: {
  supabase: ReturnType<typeof createClient>;
  deal: AnyRecord;
  dryRun: boolean;
  summary: AnyRecord;
  companyMap: Map<string, string>;
  opportunityMatchCache: Map<string, AnyRecord[]>;
}) {
  const externalId = safeString(deal.externalId);
  const title = safeString(deal.title) || `Oportunidade RD ${externalId || "sem-id"}`;
  if (!externalId) {
    summary.skipped_without_identifier = getResourceCount(summary, "skipped_without_identifier") + 1;
    return "";
  }

  if (dryRun) {
    summary.opportunities_processed = getResourceCount(summary, "opportunities_processed") + 1;
    return "";
  }

  let companyId = "";
  const organizationExternalId = safeString(deal.organizationExternalId);
  const organizationCnpj = normalizeCnpj(deal.organizationCnpj);
  if (organizationExternalId) {
    companyId = companyMap.get(organizationExternalId) || "";
    if (!companyId && organizationCnpj) {
      companyId = await findCompanyByCnpj({
        supabase,
        cnpj: organizationCnpj
      });
      if (companyId) {
        await upsertIntegrationLink({
          supabase,
          provider: "rdstation",
          localEntityType: "company",
          localEntityId: companyId,
          externalId: organizationExternalId,
          syncedAt: new Date().toISOString()
        });
        summary.links_updated = getResourceCount(summary, "links_updated") + 1;
        companyMap.set(organizationExternalId, companyId);
      }
    }
    if (!companyId) {
      companyId = await findOrCreateCompanyByExternal({
        supabase,
        externalId: organizationExternalId,
        fallbackName: safeString(deal.title) || `Empresa RD ${organizationExternalId}`,
        summary
      });
      if (companyId) companyMap.set(organizationExternalId, companyId);
    }
  }

  if (!companyId && organizationCnpj) {
    companyId = await findCompanyByCnpj({
      supabase,
      cnpj: organizationCnpj
    });
  }

  if (!companyId) {
    companyId = await findOrCreateCompanyByExternal({
      supabase,
      externalId: `DEAL-${externalId}`,
      fallbackName: safeString(deal.title) || `Empresa RD DEAL ${externalId}`,
      summary
    });
  }
  if (!companyId) {
    summary.skipped_without_identifier = getResourceCount(summary, "skipped_without_identifier") + 1;
    return "";
  }

  let primaryContactId = "";
  const contactExternalId = safeString(deal.contactExternalId);
  if (contactExternalId) {
    primaryContactId = await findLocalEntityIdByExternal({
      supabase,
      provider: "rdstation",
      localEntityType: "contact",
      externalId: contactExternalId
    });
  }

  const status = mapOpportunityStatus(deal.statusRaw);
  const stage = mapOpportunityStage(deal.stageRaw, status);

  let opportunityId = await findLocalEntityIdByExternal({
    supabase,
    provider: "rdstation",
    localEntityType: "opportunity",
    externalId
  });

  let existingOpportunity: AnyRecord | null = null;
  if (opportunityId) {
    const { data, error } = await supabase
      .from("opportunities")
      .select("id,title,stage,status,estimated_value,expected_close_date,company_id,primary_contact_id")
      .eq("id", opportunityId)
      .maybeSingle();
    if (error) throw new Error(error.message || "Falha ao buscar oportunidade vinculada.");
    if (data) existingOpportunity = data;
  }

  const payload = {
    company_id: companyId,
    primary_contact_id: primaryContactId || null,
    title,
    stage,
    status,
    estimated_value: parseNumber(deal.amount),
    expected_close_date: safeString(deal.expectedCloseDate) || null
  };

  if (!existingOpportunity) {
    const matched = await findExistingOpportunityBySimilarity({
      supabase,
      companyId,
      dealTitle: title,
      dealStage: stage,
      dealStatus: status,
      dealAmount: parseNumber(deal.amount),
      cache: opportunityMatchCache
    });
    if (matched?.row) {
      existingOpportunity = matched.row;
      opportunityId = safeString(existingOpportunity.id);
      if (opportunityId) {
        summary.opportunities_matched_by_similarity =
          getResourceCount(summary, "opportunities_matched_by_similarity") + 1;
      }
    }
  }

  if (!existingOpportunity) {
    const { data, error } = await supabase
      .from("opportunities")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message || "Falha ao inserir oportunidade.");
    opportunityId = safeString(data?.id);
    summary.opportunities_created = getResourceCount(summary, "opportunities_created") + 1;
    const cacheKey = safeString(companyId);
    if (cacheKey && opportunityId) {
      const currentRows = opportunityMatchCache.get(cacheKey) || [];
      opportunityMatchCache.set(
        cacheKey,
        [
          {
            id: opportunityId,
            ...payload,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          ...currentRows
        ].slice(0, 200)
      );
    }
  } else {
    opportunityId = safeString(existingOpportunity.id);
    const patch = {
      company_id: payload.company_id || existingOpportunity.company_id,
      primary_contact_id: payload.primary_contact_id || existingOpportunity.primary_contact_id || null,
      title: payload.title || safeString(existingOpportunity.title),
      stage: payload.stage || safeString(existingOpportunity.stage),
      status: payload.status || safeString(existingOpportunity.status),
      estimated_value:
        Number.isFinite(Number(payload.estimated_value)) && Number(payload.estimated_value) >= 0
          ? payload.estimated_value
          : Number(existingOpportunity.estimated_value || 0),
      expected_close_date: payload.expected_close_date || existingOpportunity.expected_close_date || null
    };
    const { error } = await supabase.from("opportunities").update(patch).eq("id", opportunityId);
    if (error) throw new Error(error.message || "Falha ao atualizar oportunidade.");
    summary.opportunities_updated = getResourceCount(summary, "opportunities_updated") + 1;
  }

  await upsertIntegrationLink({
    supabase,
    provider: "rdstation",
    localEntityType: "opportunity",
    localEntityId: opportunityId,
    externalId,
    syncedAt: new Date().toISOString()
  });
  summary.links_updated = getResourceCount(summary, "links_updated") + 1;
  summary.opportunities_processed = getResourceCount(summary, "opportunities_processed") + 1;
  return opportunityId;
}

function parseCursorState(rawCursor: unknown, maxPages: number) {
  const cursor = asObject(rawCursor);
  const resourceIndex = clampNumber(cursor.resource_index, 0, RESOURCE_ORDER.length, 0);
  const pageByResourceRaw = asObject(cursor.page_by_resource);
  const nextByResourceRaw = asObject(cursor.next_by_resource);

  const pageByResource: Record<ResourceName, number> = {
    organizations: clampNumber(pageByResourceRaw.organizations, 1, Math.max(1, maxPages), 1),
    contacts: clampNumber(pageByResourceRaw.contacts, 1, Math.max(1, maxPages), 1),
    deals: clampNumber(pageByResourceRaw.deals, 1, Math.max(1, maxPages), 1)
  };
  const nextByResource: Record<ResourceName, string> = {
    organizations: safeString(nextByResourceRaw.organizations),
    contacts: safeString(nextByResourceRaw.contacts),
    deals: safeString(nextByResourceRaw.deals)
  };

  return {
    resource_index: resourceIndex,
    page_by_resource: pageByResource,
    next_by_resource: nextByResource
  };
}

async function updateSyncJob(
  supabase: ReturnType<typeof createClient>,
  syncJobId: string,
  status: "success" | "error",
  payload: AnyRecord
) {
  const updatePayload: AnyRecord = {
    status,
    finished_at: new Date().toISOString()
  };
  if (status === "success") {
    updatePayload.result = payload;
    updatePayload.error_message = null;
  } else {
    updatePayload.result = payload.result || null;
    updatePayload.error_message = safeString(payload.error_message || "Falha na sincronização RD Station.");
  }
  const { error } = await supabase.from("sync_jobs").update(updatePayload).eq("id", syncJobId);
  if (error) {
    console.error("Falha ao atualizar sync_jobs:", error.message);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "missing_supabase_env",
      message: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurado."
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  let body: AnyRecord = {};
  try {
    body = asObject(await request.json());
  } catch {
    return jsonResponse(400, {
      error: "invalid_payload",
      message: "Payload inválido."
    });
  }

  const enrichmentOnly = parseBoolean(
    body.enrich_missing_companies_only ??
      body.enrichMissingCompaniesOnly ??
      body.enrich_missing_rd_companies_only ??
      body.enrichMissingRdCompaniesOnly ??
      body.backfill_rd_companies ??
      body.backfillRdCompanies,
    false
  );
  const dryRun = parseBoolean(body.dry_run ?? body.dryRun, false);
  const enrichmentScanLimit = clampNumber(
    body.enrichment_scan_limit ?? body.enrichmentScanLimit,
    1,
    5000,
    RD_COMPANY_ENRICHMENT_SCAN_LIMIT
  );
  const enrichmentBatchLimit = clampNumber(
    body.enrichment_batch_limit ?? body.enrichmentBatchLimit,
    1,
    enrichmentScanLimit,
    RD_COMPANY_ENRICHMENT_BATCH_LIMIT
  );

  const apiUrl = safeString(body.api_url || body.apiUrl || DEFAULT_RDSTATION_API_URL) || DEFAULT_RDSTATION_API_URL;
  const authState = buildAuthState(body.auth_mode ?? body.authMode, apiUrl);
  const syncScope = resolveSyncScope(body.sync_scope ?? body.syncScope);
  const includeContacts = syncScope !== "south_cnpj_only";
  const includeDeals = syncScope === "full";
  const dealStageFilter = includeDeals
    ? resolveDealStageFilter(
        body.deal_stage_filter ??
          body.dealStageFilter ??
          body.opportunity_stage_filter ??
          body.opportunityStageFilter
      )
    : "";
  const dealPipelineFilter = includeDeals
    ? resolveDealPipelineFilter(
        body.deal_pipeline_filter ??
          body.dealPipelineFilter ??
          body.pipeline_filter ??
          body.pipelineFilter ??
          body.funnel_filter ??
          body.funnelFilter
      )
    : "";
  const dealsLimit = includeDeals
    ? clampNumber(
        body.deals_limit ??
          body.dealsLimit ??
          body.opportunities_limit ??
          body.opportunitiesLimit,
        0,
        500,
        0
      )
    : 0;
  const allowedStates = parseUfFilter(
    body.allowed_states ?? body.allowedStates,
    syncScope === "south_cnpj_only" ? DEFAULT_SOUTH_UF_FILTER : []
  );
  const requestedRecordsPerPage = clampNumber(body.records_per_page ?? body.recordsPerPage, 1, 500, 100);
  const recordsPerPage = dryRun ? requestedRecordsPerPage : Math.min(requestedRecordsPerPage, LIVE_MAX_RECORDS_PER_PAGE);
  const requestedMaxPages = clampNumber(body.max_pages ?? body.maxPages, 1, 500, 50);
  const requestedPageChunkSize = clampNumber(
    body.page_chunk_size ?? body.pageChunkSize,
    1,
    20,
    DEFAULT_PAGE_CHUNK_SIZE
  );
  const pageChunkSize = dryRun ? requestedPageChunkSize : Math.min(requestedPageChunkSize, LIVE_MAX_PAGE_CHUNK_SIZE);
  const executionGuardMs = clampNumber(
    body.execution_guard_ms ?? body.executionGuardMs,
    20000,
    110000,
    DEFAULT_EXECUTION_GUARD_MS
  );
  const startedAt = new Date().toISOString();
  const cursorState = parseCursorState(body.cursor, requestedMaxPages);
  const accessToken = sanitizeRdAccessToken(body.access_token || body.accessToken || body.token);

  if (!enrichmentOnly && !accessToken) {
    return jsonResponse(400, {
      error: "missing_rdstation_credentials",
      message: "Informe o Access Token do RD Station CRM."
    });
  }

  const { data: syncJob, error: syncJobError } = await supabase
    .from("sync_jobs")
    .insert({
      provider: "rdstation",
        resource: enrichmentOnly ? "company_cnpj_enrichment" : "crm_full",
        status: "running",
        payload: {
          operation: enrichmentOnly ? "enrich_missing_companies_only" : "sync_rdstation",
          api_url: apiUrl,
          auth_mode: authState.mode,
          sync_scope: syncScope,
          deal_stage_filter: dealStageFilter || null,
          deal_pipeline_filter: dealPipelineFilter || null,
          deals_limit: dealsLimit || null,
          allowed_states: Array.from(allowedStates),
          dry_run: dryRun,
        records_per_page: recordsPerPage,
        max_pages: requestedMaxPages,
        page_chunk_size: pageChunkSize,
          execution_guard_ms: executionGuardMs,
          cursor: cursorState,
          enrichment_scan_limit: enrichmentScanLimit,
          enrichment_batch_limit: enrichmentBatchLimit
        },
        started_at: startedAt
      })
    .select("id")
    .single();

  if (syncJobError) {
    return jsonResponse(500, {
      error: "sync_job_create_failed",
      message: syncJobError.message || "Falha ao criar job de sincronização."
    });
  }

  const syncJobId = safeString(syncJob?.id);

  try {
    const summary: AnyRecord = {
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
      opportunities_skipped_by_scope: 0,
      opportunities_skipped_by_pipeline_filter: 0,
      opportunities_skipped_by_stage_filter: 0,
      links_updated: 0,
      skipped_without_identifier: 0,
      skipped_without_cnpj: 0,
      skipped_invalid_payload: 0,
      companies_enrichment_batch_scanned: 0,
      companies_enrichment_attempted: 0,
      companies_enriched_from_cnpj: 0,
      companies_enrichment_not_found: 0,
      companies_enrichment_errors: 0,
      companies_enrichment_skipped_invalid_cnpj: 0,
      sample_skipped_without_cnpj: [],
      sample_skipped_by_state: [],
      errors: []
    };

    const cnpjProfileCache = new Map<string, AnyRecord | null>();
    if (enrichmentOnly) {
      await enrichMissingRdCompaniesBatch({
        supabase,
        dryRun,
        summary,
        cache: cnpjProfileCache,
        scanLimit: enrichmentScanLimit,
        batchLimit: enrichmentBatchLimit
      });

      const resultPayload: AnyRecord = {
        ...summary,
        operation: "enrich_missing_companies_only",
        sync_scope: syncScope,
        deal_stage_filter: dealStageFilter || null,
        deal_pipeline_filter: dealPipelineFilter || null,
        deals_limit: dealsLimit || null,
        allowed_states: Array.from(allowedStates),
        api_url: apiUrl,
        api_url_used: null,
        auth_mode_used: null,
        dry_run: dryRun,
        records_per_page: 0,
        max_pages: 0,
        page_chunk_size: 0,
        execution_guard_ms: executionGuardMs,
        has_more: false,
        next_cursor: null,
        next_resource: null,
        stop_reason: "completed",
        enrichment_scan_limit: enrichmentScanLimit,
        enrichment_batch_limit: enrichmentBatchLimit,
        started_at: startedAt,
        finished_at: new Date().toISOString()
      };

      await updateSyncJob(supabase, syncJobId, "success", resultPayload);
      return jsonResponse(200, {
        sync_job_id: syncJobId,
        ...resultPayload
      });
    }

    const state = parseCursorState(cursorState, requestedMaxPages);
    const companyMap = new Map<string, string>();
    const opportunityMatchCache = new Map<string, AnyRecord[]>();
    const deadline = Date.now() + executionGuardMs;
    let pagesProcessedInRun = 0;
    let stopReason = "completed";

    while (state.resource_index < RESOURCE_ORDER.length) {
      if (Date.now() >= deadline) {
        stopReason = "execution_guard";
        break;
      }
      if (pagesProcessedInRun >= pageChunkSize) {
        stopReason = "page_chunk_limit";
        break;
      }

      const resource = RESOURCE_ORDER[state.resource_index];
      if (!includeContacts && resource === "contacts") {
        state.resource_index = RESOURCE_ORDER.length;
        summary.contacts_skipped_by_scope =
          getResourceCount(summary, "contacts_skipped_by_scope") + 1;
        summary.opportunities_skipped_by_scope =
          getResourceCount(summary, "opportunities_skipped_by_scope") + 1;
        break;
      }
      if (!includeDeals && resource === "deals") {
        state.resource_index = RESOURCE_ORDER.length;
        summary.opportunities_skipped_by_scope =
          getResourceCount(summary, "opportunities_skipped_by_scope") + 1;
        break;
      }
      const page = state.page_by_resource[resource];
      const nextCursor = state.next_by_resource[resource];

      if (page > requestedMaxPages) {
        appendError(summary, `Limite de páginas atingido para ${resource}.`);
        state.resource_index += 1;
        continue;
      }

      const pageResult = await fetchResourcePage({
        accessToken,
        resource,
        page,
        recordsPerPage,
        nextCursor,
        authState
      });

      pagesProcessedInRun += 1;
      summary.pages_processed = getResourceCount(summary, "pages_processed") + 1;
      summary.records_received = getResourceCount(summary, "records_received") + pageResult.items.length;
      let stopAfterDealsLimit = false;

      for (const rawItem of pageResult.items) {
        try {
          if (resource === "organizations") {
            const parsed = parseOrganization(rawItem);
            await upsertCompanyFromOrganization({
              supabase,
              organization: parsed,
              dryRun,
              summary,
              companyMap,
              allowedStates,
              cnpjProfileCache
            });
            summary.processed = getResourceCount(summary, "processed") + 1;
            continue;
          }

          if (resource === "contacts") {
            const parsed = parseContact(rawItem);
            await upsertContactFromRd({
              supabase,
              contact: parsed,
              dryRun,
              summary,
              companyMap
            });
            summary.processed = getResourceCount(summary, "processed") + 1;
            continue;
          }

          if (dealsLimit > 0 && getResourceCount(summary, "opportunities_processed") >= dealsLimit) {
            stopReason = "deals_limit";
            state.resource_index = RESOURCE_ORDER.length;
            stopAfterDealsLimit = true;
            break;
          }

          const parsed = parseDeal(rawItem);
          if (dealPipelineFilter && !matchDealPipelineFilter(parsed.pipelineRaw, dealPipelineFilter)) {
            summary.opportunities_skipped_by_pipeline_filter =
              getResourceCount(summary, "opportunities_skipped_by_pipeline_filter") + 1;
            continue;
          }
          const mappedStatus = mapOpportunityStatus(parsed.statusRaw);
          const mappedStage = mapOpportunityStage(parsed.stageRaw, mappedStatus);
          if (dealStageFilter && mappedStage !== dealStageFilter) {
            summary.opportunities_skipped_by_stage_filter =
              getResourceCount(summary, "opportunities_skipped_by_stage_filter") + 1;
            continue;
          }

          await upsertOpportunityFromDeal({
            supabase,
            deal: parsed,
            dryRun,
            summary,
            companyMap,
            opportunityMatchCache
          });
          summary.processed = getResourceCount(summary, "processed") + 1;

          if (dealsLimit > 0 && getResourceCount(summary, "opportunities_processed") >= dealsLimit) {
            stopReason = "deals_limit";
            state.resource_index = RESOURCE_ORDER.length;
            stopAfterDealsLimit = true;
            break;
          }
        } catch (itemError) {
          const message = itemError instanceof Error ? itemError.message : "Falha ao processar item do RD Station.";
          appendError(summary, `${resource}: ${message}`);
          summary.skipped_invalid_payload = getResourceCount(summary, "skipped_invalid_payload") + 1;
        }
      }

      if (stopAfterDealsLimit) {
        break;
      }

      if (pageResult.hasNext && page < requestedMaxPages) {
        state.page_by_resource[resource] = Math.max(page + 1, pageResult.nextPage);
        state.next_by_resource[resource] = safeString(pageResult.nextCursor);
      } else {
        if (pageResult.hasNext && page >= requestedMaxPages) {
          appendError(summary, `Consulta de ${resource} truncada no limite de ${requestedMaxPages} páginas.`);
        }
        state.resource_index += 1;
        state.next_by_resource[resource] = "";
      }
    }

    await enrichMissingRdCompaniesBatch({
      supabase,
      dryRun,
      summary,
      cache: cnpjProfileCache,
      scanLimit: enrichmentScanLimit,
      batchLimit: enrichmentBatchLimit
    });

    const hasMore = state.resource_index < RESOURCE_ORDER.length;
    const nextCursor = hasMore
      ? {
          resource_index: state.resource_index,
          page_by_resource: state.page_by_resource,
          next_by_resource: state.next_by_resource
        }
      : null;
    if (authState.fallbackActivated) {
      appendError(summary, "Autenticação alternada automaticamente para modo legado do RD CRM (token por query).");
    }

    const resultPayload: AnyRecord = {
      ...summary,
      sync_scope: syncScope,
      deal_stage_filter: dealStageFilter || null,
      deal_pipeline_filter: dealPipelineFilter || null,
      deals_limit: dealsLimit || null,
      allowed_states: Array.from(allowedStates),
      api_url: apiUrl,
      api_url_used: authState.apiUrl,
      auth_mode_used: authState.mode,
      dry_run: dryRun,
      records_per_page: recordsPerPage,
      max_pages: requestedMaxPages,
      page_chunk_size: pageChunkSize,
      execution_guard_ms: executionGuardMs,
      has_more: hasMore,
      next_cursor: nextCursor,
      next_resource: hasMore ? RESOURCE_ORDER[state.resource_index] : null,
      stop_reason: stopReason,
      started_at: startedAt,
      finished_at: new Date().toISOString()
    };

    await updateSyncJob(supabase, syncJobId, "success", resultPayload);
    return jsonResponse(200, {
      sync_job_id: syncJobId,
      ...resultPayload
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada na sincronização RD Station.";
    await updateSyncJob(supabase, syncJobId, "error", {
      error_message: message
    });
    if (/^rd_http_(400|401|403)\b/i.test(message)) {
      return jsonResponse(200, {
        error: "rdstation_sync_failed",
        message,
        sync_job_id: syncJobId
      });
    }
    return jsonResponse(500, {
      error: "rdstation_sync_failed",
      message,
      sync_job_id: syncJobId
    });
  }
});
