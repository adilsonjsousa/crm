import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type AnyRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const DEFAULT_OMIE_CLIENTS_URL = "https://app.omie.com.br/api/v1/geral/clientes/";
const DEFAULT_OMIE_RECEIVABLES_URL = "https://app.omie.com.br/api/v1/financas/contareceber/";

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

function digitsOnly(value: unknown) {
  return safeString(value).replace(/\D/g, "");
}

function normalizeCnpj(value: unknown) {
  const digits = digitsOnly(value);
  return digits.length === 14 ? digits : "";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function pickFirstNonEmpty(source: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const value = safeString(source[key]);
    if (value) return value;
  }
  return "";
}

function extractArrayByKeys(payload: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function extractTotalPages(payload: AnyRecord, currentPage: number, receivedItems: number, recordsPerPage: number) {
  const direct = clampNumber(
    payload.total_de_paginas ?? payload.total_paginas ?? payload.totalPaginas ?? payload.quantidade_de_paginas,
    1,
    2000,
    0
  );
  if (direct > 0) return direct;
  if (receivedItems < recordsPerPage) return currentPage;
  return currentPage + 1;
}

function extractDirectTotalPages(payload: AnyRecord) {
  return clampNumber(
    payload.total_de_paginas ?? payload.total_paginas ?? payload.totalPaginas ?? payload.quantidade_de_paginas,
    1,
    2000,
    0
  );
}

function parseMoney(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = safeString(value);
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "")
    : cleaned.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateIso(value: unknown) {
  const raw = safeString(value);
  if (!raw) return null;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const withTime = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (withTime) {
    const parsed = new Date(
      Date.UTC(
        Number(withTime[3]),
        Number(withTime[2]) - 1,
        Number(withTime[1]),
        Number(withTime[4]),
        Number(withTime[5]),
        Number(withTime[6] || "0")
      )
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeStatus(value: unknown) {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isOpenStatus(value: unknown) {
  const status = normalizeStatus(value);
  if (!status) return null;
  if (
    status.includes("pago") ||
    status.includes("baixad") ||
    status.includes("liquid") ||
    status.includes("quitad") ||
    status.includes("cancel") ||
    status.includes("estorn")
  ) {
    return false;
  }
  if (
    status.includes("abert") ||
    status.includes("pendente") ||
    status.includes("atras") ||
    status.includes("receber") ||
    status.includes("vencid") ||
    status.includes("vencer") ||
    status.includes("vencendo") ||
    status.includes("parcial")
  ) {
    return true;
  }
  return null;
}

function normalizeText(value: unknown) {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameIdentifier(value: unknown, expected: unknown) {
  const rawValue = safeString(value);
  const rawExpected = safeString(expected);
  if (!rawValue || !rawExpected) return false;
  if (rawValue === rawExpected) return true;
  const valueDigits = digitsOnly(rawValue);
  const expectedDigits = digitsOnly(rawExpected);
  return Boolean(valueDigits && expectedDigits && valueDigits === expectedDigits);
}

function uniqueNonEmptyStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of values) {
    const value = safeString(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function parsePositiveInteger(value: unknown) {
  const digits = digitsOnly(value);
  if (!digits) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function collectDeepValuesByKeyNames(
  value: unknown,
  keyNames: Set<string>,
  depth = 0,
  maxDepth = 5,
  output: unknown[] = []
) {
  if (value === null || value === undefined || depth > maxDepth) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectDeepValuesByKeyNames(item, keyNames, depth + 1, maxDepth, output);
    return output;
  }
  if (typeof value !== "object") return output;

  const row = value as AnyRecord;
  for (const [rawKey, nested] of Object.entries(row)) {
    const key = safeString(rawKey).toLowerCase();
    if (keyNames.has(key)) output.push(nested);
    if (nested && typeof nested === "object") {
      collectDeepValuesByKeyNames(nested, keyNames, depth + 1, maxDepth, output);
    }
  }
  return output;
}

function collectCustomerIdentifiersFromRow(row: AnyRecord) {
  const raw = uniqueNonEmptyStrings([
    row.codigo_cliente_omie,
    row.codigo_cliente_fornecedor,
    row.codigo_cliente,
    row.codigo_cliente_integracao,
    row.codigo,
    row.id
  ]);
  const digits = uniqueNonEmptyStrings(raw.map((value) => digitsOnly(value)).filter(Boolean));
  return uniqueNonEmptyStrings([...raw, ...digits]);
}

function isLikelyCustomerCodeKey(rawKey: string) {
  const key = normalizeText(rawKey);
  if (!key) return false;
  if (key.includes("cliente") && (key.includes("codigo") || key.includes("id"))) return true;
  if (key.includes("fornecedor") && (key.includes("codigo") || key.includes("id"))) return true;
  if (key.includes("codcli") || key.includes("idcliente")) return true;
  return false;
}

function collectDeepValuesByPredicate(
  value: unknown,
  predicate: (normalizedKey: string) => boolean,
  depth = 0,
  maxDepth = 5,
  output: unknown[] = []
) {
  if (value === null || value === undefined || depth > maxDepth) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectDeepValuesByPredicate(item, predicate, depth + 1, maxDepth, output);
    return output;
  }
  if (typeof value !== "object") return output;

  const row = value as AnyRecord;
  for (const [rawKey, nested] of Object.entries(row)) {
    const key = normalizeText(rawKey);
    if (predicate(key)) output.push(nested);
    if (nested && typeof nested === "object") {
      collectDeepValuesByPredicate(nested, predicate, depth + 1, maxDepth, output);
    }
  }
  return output;
}

function receivableMatchesCustomer(
  rawReceivable: unknown,
  customerIdentifiers: string[],
  customerCnpj: string,
  customerNames: string[]
) {
  const row = asObject(rawReceivable);
  const header = asObject(row.cabecalho);
  const customerBlock = asObject(
    row.cliente_fornecedor ?? row.clienteFornecedor ?? row.cliente ?? row.cliente_cadastro
  );
  const normalizedIdentifiers = uniqueNonEmptyStrings(customerIdentifiers);

  const codeCandidates = [
    row.codigo_cliente_omie,
    row.codigo_cliente_fornecedor,
    row.codigo_cliente,
    row.codigo_cliente_integracao,
    header.codigo_cliente_omie,
    header.codigo_cliente_fornecedor,
    header.codigo_cliente,
    header.codigo_cliente_integracao,
    customerBlock.codigo_cliente_omie,
    customerBlock.codigo_cliente_fornecedor,
    customerBlock.codigo_cliente,
    customerBlock.codigo_cliente_integracao
  ];

  const deepCodeCandidates = collectDeepValuesByKeyNames(
    row,
    new Set([
      "codigo_cliente_omie",
      "codigo_cliente_fornecedor",
      "codigo_cliente",
      "codigo_cliente_integracao",
      "codigo_cliente_fornecedor_integracao",
      "cod_cliente",
      "codcli",
      "id_cliente_fornecedor",
      "cliente_codigo",
      "id_cliente",
      "idcliente"
    ])
  );
  const deepPatternCodeCandidates = collectDeepValuesByPredicate(row, isLikelyCustomerCodeKey);

  const allCodeCandidates = [...codeCandidates, ...deepCodeCandidates, ...deepPatternCodeCandidates];
  if (
    normalizedIdentifiers.length &&
    allCodeCandidates.some((candidate) => normalizedIdentifiers.some((identifier) => sameIdentifier(candidate, identifier)))
  ) {
    return true;
  }

  const cnpjTarget = normalizeCnpj(customerCnpj);
  if (!cnpjTarget) return false;

  const cnpjCandidates = [
    row.cnpj_cpf,
    row.cnpj,
    row.cpf_cnpj,
    row.documento,
    header.cnpj_cpf,
    header.cnpj,
    header.cpf_cnpj,
    header.documento,
    customerBlock.cnpj_cpf,
    customerBlock.cnpj,
    customerBlock.cpf_cnpj,
    customerBlock.documento
  ];

  const deepCnpjCandidates = collectDeepValuesByKeyNames(
    row,
    new Set(["cnpj_cpf", "cnpj", "cpf_cnpj", "documento", "documento_cliente", "cpfcnpj"])
  );
  if ([...cnpjCandidates, ...deepCnpjCandidates].some((value) => normalizeCnpj(value) === cnpjTarget)) {
    return true;
  }

  const normalizedTargetNames = uniqueNonEmptyStrings(customerNames.map((name) => normalizeText(name)).filter(Boolean));
  if (!normalizedTargetNames.length) return false;

  const knownNameCandidates = [
    row.razao_social,
    row.nome_fantasia,
    row.nome_cliente,
    row.nome,
    row.cliente,
    row.cliente_fornecedor,
    header.razao_social,
    header.nome_fantasia,
    header.nome_cliente,
    header.nome,
    customerBlock.razao_social,
    customerBlock.nome_fantasia,
    customerBlock.nome_cliente,
    customerBlock.nome
  ];
  const deepNameCandidates = collectDeepValuesByPredicate(
    row,
    (key) => key.includes("razao") || key.includes("fantasia") || (key.includes("nome") && key.includes("cliente"))
  );
  const normalizedNameCandidates = uniqueNonEmptyStrings(
    [...knownNameCandidates, ...deepNameCandidates].map((candidate) => normalizeText(candidate)).filter(Boolean)
  );
  if (!normalizedNameCandidates.length) return false;

  return normalizedNameCandidates.some((candidate) => {
    return normalizedTargetNames.some((target) => {
      if (!target || !candidate) return false;
      if (candidate === target) return true;
      if (target.length >= 6 && candidate.includes(target)) return true;
      if (candidate.length >= 6 && target.includes(candidate)) return true;
      return false;
    });
  });
}

async function callOmieApi({
  url,
  appKey,
  appSecret,
  call,
  param
}: {
  url: string;
  appKey: string;
  appSecret: string;
  call: string;
  param: AnyRecord;
}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call,
      app_key: appKey,
      app_secret: appSecret,
      param: [param]
    })
  });

  const text = await response.text();
  let parsed: AnyRecord = {};
  try {
    parsed = asObject(JSON.parse(text));
  } catch {
    parsed = {};
  }

  const fault = safeString(parsed.faultstring || parsed.message || parsed.descricao_status);
  if (!response.ok) {
    const detail = fault || safeString(text).slice(0, 200);
    throw new Error(detail ? `omie_http_${response.status}:${detail}` : `omie_http_${response.status}`);
  }
  if (fault && (parsed.faultcode || safeString(parsed.status).toLowerCase() === "erro")) {
    throw new Error(`omie_fault:${fault}`);
  }
  return parsed;
}

function mapCustomerFromRow(rowRaw: unknown, cnpj: string) {
  const row = asObject(rowRaw);
  const rowCnpj = normalizeCnpj(row.cnpj_cpf ?? row.cnpj ?? row.cpf_cnpj ?? row.documento);
  if (rowCnpj !== cnpj) return null;

  const identifiers = collectCustomerIdentifiersFromRow(row);
  const customerCode =
    pickFirstNonEmpty(row, [
      "codigo_cliente_omie",
      "codigo_cliente_fornecedor",
      "codigo_cliente",
      "codigo_cliente_integracao",
      "codigo",
      "id"
    ]) || identifiers[0] || "";

  if (!customerCode && !identifiers.length) return null;

  return {
    codigo_cliente_omie: customerCode || identifiers[0] || null,
    identifiers: identifiers.length ? identifiers : customerCode ? [customerCode] : [],
    cnpj,
    razao_social: pickFirstNonEmpty(row, ["razao_social", "nome_cliente", "nome"]),
    nome_fantasia: pickFirstNonEmpty(row, ["nome_fantasia", "fantasia", "empresa", "nome"])
  };
}

async function findCustomerByCnpj({
  appKey,
  appSecret,
  clientsUrl,
  cnpj,
  maxPages
}: {
  appKey: string;
  appSecret: string;
  clientsUrl: string;
  cnpj: string;
  maxPages: number;
}) {
  const warnings: string[] = [];

  try {
    const payload = await callOmieApi({
      url: clientsUrl,
      appKey,
      appSecret,
      call: "ListarClientes",
      param: {
        pagina: 1,
        registros_por_pagina: 20,
        apenas_importado_api: "N",
        clientesFiltro: { cnpj_cpf: cnpj }
      }
    });
    const directRows = extractArrayByKeys(payload, ["clientes_cadastro", "clientes", "cadastro"]);
    for (const rowRaw of directRows) {
      const customer = mapCustomerFromRow(rowRaw, cnpj);
      if (!customer) continue;
      return {
        customer,
        warnings
      };
    }
  } catch (error) {
    warnings.push(`ListarClientes filtro: ${error instanceof Error ? error.message : "falha inesperada"}`);
  }

  let page = 1;
  let totalPages = 1;
  const recordsPerPage = 50;

  while (page <= maxPages && page <= totalPages) {
    const payload = await callOmieApi({
      url: clientsUrl,
      appKey,
      appSecret,
      call: "ListarClientes",
      param: {
        pagina: page,
        registros_por_pagina: recordsPerPage,
        apenas_importado_api: "N"
      }
    });
    const rows = extractArrayByKeys(payload, ["clientes_cadastro", "clientes", "cadastro"]);
    totalPages = Math.max(totalPages, extractTotalPages(payload, page, rows.length, recordsPerPage));

    for (const rowRaw of rows) {
      const customer = mapCustomerFromRow(rowRaw, cnpj);
      if (!customer) continue;
      warnings.push("Cliente encontrado por varredura de paginas.");
      return {
        customer,
        warnings
      };
    }

    page += 1;
  }

  return { customer: null, warnings };
}

function normalizeReceivable(raw: unknown) {
  const row = asObject(raw);
  const header = asObject(row.cabecalho);

  const status =
    pickFirstNonEmpty(row, ["status_titulo", "status", "status_lancamento", "situacao"]) ||
    pickFirstNonEmpty(header, ["status_titulo", "status", "status_lancamento", "situacao"]);

  const documentAmount = parseMoney(
    row.valor_documento ?? row.valor_titulo ?? row.valor_original ?? row.valor_total ?? row.valor_nominal ?? row.valor_bruto ??
      header.valor_documento ?? header.valor_titulo ?? header.valor_original ?? header.valor_total ?? header.valor_nominal
  );
  const paidAmount = parseMoney(
    row.valor_pago ?? row.valor_recebido ?? row.valor_baixado ?? row.valor_quitado ??
      header.valor_pago ?? header.valor_recebido ?? header.valor_baixado ?? header.valor_quitado
  );

  let openAmount = parseMoney(
    row.valor_saldo ??
      row.valor_aberto ??
      row.valor_em_aberto ??
      row.valor_pendente ??
      row.valor_a_receber ??
      row.saldo_a_receber ??
      row.valor_saldo_restante ??
      row.valor_restante ??
      row.saldo_em_aberto ??
      row.saldo ??
      header.valor_saldo ??
      header.valor_aberto ??
      header.valor_em_aberto ??
      header.valor_pendente ??
      header.valor_a_receber ??
      header.saldo_a_receber ??
      header.valor_saldo_restante ??
      header.valor_restante ??
      header.saldo_em_aberto ??
      header.saldo
  );

  if (!(openAmount > 0) && documentAmount > 0 && paidAmount > 0 && paidAmount < documentAmount) {
    openAmount = documentAmount - paidAmount;
  }
  if (!(openAmount > 0) && documentAmount > 0) {
    const byStatus = isOpenStatus(status);
    if (byStatus === true) openAmount = documentAmount;
    if (byStatus === false) openAmount = 0;
  }
  if (!(openAmount > 0) && documentAmount > 0 && !(paidAmount > 0)) {
    const byStatus = isOpenStatus(status);
    if (byStatus !== false) openAmount = documentAmount;
  }
  if (openAmount < 0) openAmount = 0;

  return {
    codigo_lancamento_omie:
      pickFirstNonEmpty(row, ["codigo_lancamento_omie", "codigo_lancamento", "codigo_titulo", "id"]) ||
      pickFirstNonEmpty(header, ["codigo_lancamento_omie", "codigo_lancamento", "codigo_titulo", "id"]) ||
      null,
    numero_documento:
      pickFirstNonEmpty(row, ["numero_documento", "numero_titulo", "numero"]) ||
      pickFirstNonEmpty(header, ["numero_documento", "numero_titulo", "numero"]) ||
      null,
    status: status || null,
    data_vencimento_iso:
      parseDateIso(pickFirstNonEmpty(row, ["data_vencimento", "data_venc", "vencimento"])) ||
      parseDateIso(pickFirstNonEmpty(header, ["data_vencimento", "data_venc", "vencimento"])),
    data_emissao_iso:
      parseDateIso(pickFirstNonEmpty(row, ["data_emissao", "data_lancamento", "data_documento"])) ||
      parseDateIso(pickFirstNonEmpty(header, ["data_emissao", "data_lancamento", "data_documento"])),
    valor_documento: documentAmount,
    valor_pago: paidAmount,
    valor_aberto: openAmount
  };
}

function buildReceivablesSummary(receivables: Array<AnyRecord>) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const plus30 = todayMs + 30 * dayMs;

  let openCount = 0;
  let openAmount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let next30Count = 0;
  let next30Amount = 0;
  let nextDueAt: string | null = null;

  for (const item of receivables) {
    const amount = parseMoney(item.valor_aberto);
    if (!(amount > 0)) continue;
    openCount += 1;
    openAmount += amount;

    const dueIso = parseDateIso(item.data_vencimento_iso || item.data_emissao_iso);
    if (!dueIso) continue;
    const dueMs = new Date(dueIso).getTime();
    if (!Number.isFinite(dueMs)) continue;

    if (dueMs < todayMs) {
      overdueCount += 1;
      overdueAmount += amount;
    } else if (dueMs <= plus30) {
      next30Count += 1;
      next30Amount += amount;
    }

    if (!nextDueAt || dueMs < new Date(nextDueAt).getTime()) nextDueAt = dueIso;
  }

  return {
    total_receivables: receivables.length,
    open_receivables_count: openCount,
    open_total_amount: openAmount,
    overdue_receivables_count: overdueCount,
    overdue_total_amount: overdueAmount,
    due_next_30_days_count: next30Count,
    due_next_30_days_total: next30Amount,
    next_due_at: nextDueAt
  };
}

async function listReceivablesByCustomer({
  appKey,
  appSecret,
  receivablesUrl,
  customerIdentifiers,
  customerCnpj,
  customerNames,
  recordsPerPage,
  maxPages,
  pageConcurrency
}: {
  appKey: string;
  appSecret: string;
  receivablesUrl: string;
  customerIdentifiers: string[];
  customerCnpj: string;
  customerNames: string[];
  recordsPerPage: number;
  maxPages: number;
  pageConcurrency: number;
}) {
  const normalizedIdentifiers = uniqueNonEmptyStrings(customerIdentifiers);
  const normalizedCustomerNames = uniqueNonEmptyStrings(customerNames);
  const numericCustomerCode =
    normalizedIdentifiers
      .map((identifier) => parsePositiveInteger(identifier))
      .find((value): value is number => Number.isInteger(value) && value > 0) || null;

  type PageResult = {
    page: number;
    pageRows: unknown[];
    directTotalPages: number;
    inferredTotalPages: number;
  };

  type ScanResult = {
    receivables: AnyRecord[];
    pages_processed: number;
    total_pages_detected: number;
    scanned_rows: number;
    warnings: string[];
  };

  async function scanReceivables(filterParams: AnyRecord): Promise<ScanResult> {
    const warnings: string[] = [];
    let totalPages = 1;
    let pagesProcessed = 0;
    let scannedRows = 0;
    const rows: AnyRecord[] = [];
    const hasServerFilter = Object.keys(filterParams).length > 0;
    let acceptedByServerFilterWithoutLocalMatch = 0;

    async function fetchReceivablesPage(page: number): Promise<PageResult> {
      const payload = await callOmieApi({
        url: receivablesUrl,
        appKey,
        appSecret,
        call: "ListarContasReceber",
        param: {
          pagina: page,
          registros_por_pagina: recordsPerPage,
          apenas_importado_api: "N",
          ...filterParams
        }
      });

      const pageRows = extractArrayByKeys(payload, [
        "conta_receber_cadastro",
        "conta_receber",
        "contas_receber",
        "lista_contas_receber",
        "titulo_receber",
        "titulos_receber",
        "lista_titulos",
        "lancamentos"
      ]);

      return {
        page,
        pageRows,
        directTotalPages: extractDirectTotalPages(payload),
        inferredTotalPages: extractTotalPages(payload, page, pageRows.length, recordsPerPage)
      };
    }

    function consumePageResult(result: PageResult) {
      const { pageRows, directTotalPages, inferredTotalPages } = result;
      totalPages = Math.max(totalPages, inferredTotalPages);
      if (directTotalPages > 0) {
        totalPages = Math.max(totalPages, directTotalPages);
      }
      scannedRows += pageRows.length;

      for (const row of pageRows) {
        const matched = receivableMatchesCustomer(row, normalizedIdentifiers, customerCnpj, normalizedCustomerNames);
        if (!matched && !hasServerFilter) continue;
        if (!matched && hasServerFilter) acceptedByServerFilterWithoutLocalMatch += 1;
        rows.push(normalizeReceivable(row));
      }

      pagesProcessed += 1;
    }

    async function fetchPagesSequentially(pages: number[]) {
      for (const page of pages) {
        const result = await fetchReceivablesPage(page);
        consumePageResult(result);
        if (!result.pageRows.length) break;
      }
    }

    async function fetchPagesInParallel(pages: number[]) {
      for (let offset = 0; offset < pages.length; offset += pageConcurrency) {
        const batchPages = pages.slice(offset, offset + pageConcurrency);
        const batchResults = await Promise.all(batchPages.map((page) => fetchReceivablesPage(page)));
        batchResults.sort((a, b) => a.page - b.page);
        for (const result of batchResults) {
          consumePageResult(result);
        }
      }
    }

    const initialUpperBound = Math.min(Math.max(1, maxPages), 400);
    const firstPage = await fetchReceivablesPage(1);
    consumePageResult(firstPage);

    let initialScanUpperBound = initialUpperBound;
    if (firstPage.directTotalPages > 0) {
      initialScanUpperBound = Math.min(initialUpperBound, firstPage.directTotalPages);
    }

    if (initialScanUpperBound > 1) {
      const remainingPages: number[] = [];
      for (let page = 2; page <= initialScanUpperBound; page += 1) {
        remainingPages.push(page);
      }

      if (firstPage.directTotalPages > 0) {
        await fetchPagesInParallel(remainingPages);
      } else {
        await fetchPagesSequentially(remainingPages);
      }
    }

    const hitPageCapBeforeFallback = totalPages > initialScanUpperBound;
    if (!rows.length && hitPageCapBeforeFallback) {
      const extendedLimit = Math.min(totalPages, Math.max(initialScanUpperBound + 1, Math.min(400, initialScanUpperBound * 4)));
      if (extendedLimit > initialScanUpperBound) {
        warnings.push(
          `Busca estendida executada em contas a receber: sem match nas ${initialScanUpperBound} primeiras paginas, expandindo ate ${extendedLimit}.`
        );
        const extendedPages: number[] = [];
        for (let page = initialScanUpperBound + 1; page <= extendedLimit; page += 1) {
          extendedPages.push(page);
        }
        await fetchPagesInParallel(extendedPages);
      }
    }

    const hitPageCap = totalPages > pagesProcessed;
    if (hitPageCap) {
      warnings.push(
        `Consulta parcial: processadas ${pagesProcessed} de ${totalPages} paginas detectadas em contas a receber do OMIE.`
      );
    }
    if (!rows.length && scannedRows > 0) {
      warnings.push(
        "Nenhum titulo foi relacionado ao cliente pelo filtro de identificadores/CNPJ. Pode haver variacao de estrutura no retorno do OMIE."
      );
    }
    if (acceptedByServerFilterWithoutLocalMatch > 0) {
      warnings.push(
        `Foram aceitos ${acceptedByServerFilterWithoutLocalMatch} titulos com filtro nativo do OMIE mesmo sem match local estrito.`
      );
    }

    return {
      receivables: rows.sort((a, b) => {
        const aMs = parseDateIso(a.data_vencimento_iso || a.data_emissao_iso)
          ? new Date(String(a.data_vencimento_iso || a.data_emissao_iso)).getTime()
          : Number.POSITIVE_INFINITY;
        const bMs = parseDateIso(b.data_vencimento_iso || b.data_emissao_iso)
          ? new Date(String(b.data_vencimento_iso || b.data_emissao_iso)).getTime()
          : Number.POSITIVE_INFINITY;
        return aMs - bMs;
      }),
      pages_processed: pagesProcessed,
      total_pages_detected: totalPages,
      scanned_rows: scannedRows,
      warnings
    };
  }

  const attempts: Array<{ label: string; filterParams: AnyRecord; allowFallback: boolean }> = [];
  if (numericCustomerCode) {
    attempts.push({
      label: `filtrar_cliente=${numericCustomerCode}`,
      filterParams: { filtrar_cliente: numericCustomerCode },
      allowFallback: true
    });
  }
  if (customerCnpj) {
    attempts.push({
      label: `filtrar_por_cpf_cnpj=${customerCnpj}`,
      filterParams: { filtrar_por_cpf_cnpj: customerCnpj },
      allowFallback: true
    });
  }
  attempts.push({ label: "varredura_sem_filtro", filterParams: {}, allowFallback: false });

  const warnings: string[] = [];
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const result = await scanReceivables(attempt.filterParams);
      const hasPartialNoMatch =
        !result.receivables.length && result.total_pages_detected > result.pages_processed && result.scanned_rows > 0;

      if (attempt.allowFallback && hasPartialNoMatch) {
        warnings.push(
          `Tentativa ${attempt.label} sem match completo (${result.pages_processed}/${result.total_pages_detected} paginas). Aplicando fallback.`
        );
        warnings.push(...result.warnings);
        continue;
      }

      return {
        ...result,
        warnings: [...warnings, ...result.warnings]
      };
    } catch (error) {
      lastError = error;
      warnings.push(`Tentativa ${attempt.label} falhou: ${error instanceof Error ? error.message : "falha inesperada"}`);
      continue;
    }
  }

  if (lastError) {
    throw new Error(warnings.join(" | ") || (lastError instanceof Error ? lastError.message : "Falha ao consultar contas a receber no OMIE."));
  }

  return {
    receivables: [],
    pages_processed: 0,
    total_pages_detected: 0,
    scanned_rows: 0,
    warnings
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  let body: AnyRecord = {};
  try {
    body = asObject(await request.json());
  } catch {
    return jsonResponse(400, { error: "invalid_payload", message: "Payload invalido." });
  }

  const appKey = safeString(body.app_key || body.appKey || Deno.env.get("OMIE_APP_KEY"));
  const appSecret = safeString(body.app_secret || body.appSecret || Deno.env.get("OMIE_APP_SECRET"));
  const cnpj = normalizeCnpj(body.cnpj_cpf || body.cnpj || body.cnpjCpf);
  const customerCodeHint = safeString(
    body.customer_code_hint || body.customerCodeHint || body.customer_code || body.customerCode || body.codigo_cliente_omie
  );

  if (!appKey || !appSecret) {
    return jsonResponse(400, { error: "missing_omie_credentials", message: "Informe App Key e App Secret do OMIE." });
  }
  if (!cnpj) {
    return jsonResponse(400, { error: "invalid_cnpj", message: "Informe um CNPJ valido com 14 digitos." });
  }

  const clientsUrl = safeString(body.omie_clients_url || body.omieClientsUrl || DEFAULT_OMIE_CLIENTS_URL) || DEFAULT_OMIE_CLIENTS_URL;
  const receivablesUrl =
    safeString(body.omie_receivables_url || body.omieReceivablesUrl || DEFAULT_OMIE_RECEIVABLES_URL) ||
    DEFAULT_OMIE_RECEIVABLES_URL;
  const recordsPerPage = clampNumber(body.records_per_page || body.recordsPerPage, 1, 500, 500);
  const maxPages = clampNumber(body.max_pages || body.maxPages, 1, 400, 120);
  const maxClientScanPages = clampNumber(body.max_client_scan_pages || body.maxClientScanPages, 1, 400, 160);
  const pageConcurrency = clampNumber(body.page_concurrency || body.pageConcurrency, 1, 8, 4);

  try {
    let customerLookup: {
      customer: AnyRecord | null;
      warnings: string[];
    } = customerCodeHint
      ? {
          customer: {
            codigo_cliente_omie: customerCodeHint,
            identifiers: [customerCodeHint],
            cnpj,
            razao_social: "",
            nome_fantasia: ""
          },
          warnings: ["Consulta OMIE priorizou o codigo de cliente vinculado no CRM."]
        }
      : {
          customer: null,
          warnings: []
        };

    if (!customerLookup.customer) {
      customerLookup = await findCustomerByCnpj({
        appKey,
        appSecret,
        clientsUrl,
        cnpj,
        maxPages: maxClientScanPages
      });
    }

    if (!customerLookup.customer) {
      return jsonResponse(404, {
        error: "omie_customer_not_found",
        message: `Cliente com CNPJ ${cnpj} nao encontrado no OMIE.`,
        cnpj,
        warnings: customerLookup.warnings
      });
    }

    let receivableLookup: {
      receivables: AnyRecord[];
      pages_processed: number;
      total_pages_detected: number;
      scanned_rows: number;
      warnings: string[];
    };
    try {
      receivableLookup = await listReceivablesByCustomer({
        appKey,
        appSecret,
        receivablesUrl,
        customerIdentifiers: Array.isArray(customerLookup.customer.identifiers)
          ? customerLookup.customer.identifiers
          : customerLookup.customer.codigo_cliente_omie
          ? [customerLookup.customer.codigo_cliente_omie]
          : [],
        customerCnpj: cnpj,
        customerNames: [customerLookup.customer.razao_social, customerLookup.customer.nome_fantasia]
          .map((value) => safeString(value))
          .filter(Boolean),
        recordsPerPage,
        maxPages,
        pageConcurrency
      });
    } catch (error) {
      if (!customerCodeHint) throw error;

      const initialMessage = error instanceof Error ? error.message : "Falha ao listar contas a receber no OMIE.";
      const fallbackLookup = await findCustomerByCnpj({
        appKey,
        appSecret,
        clientsUrl,
        cnpj,
        maxPages: maxClientScanPages
      });

      if (!fallbackLookup.customer) {
        throw new Error(`${initialMessage} | Falha no fallback por CNPJ.`);
      }

      customerLookup = fallbackLookup;
      receivableLookup = await listReceivablesByCustomer({
        appKey,
        appSecret,
        receivablesUrl,
        customerIdentifiers: Array.isArray(customerLookup.customer.identifiers)
          ? customerLookup.customer.identifiers
          : customerLookup.customer.codigo_cliente_omie
          ? [customerLookup.customer.codigo_cliente_omie]
          : [],
        customerCnpj: cnpj,
        customerNames: [customerLookup.customer.razao_social, customerLookup.customer.nome_fantasia]
          .map((value) => safeString(value))
          .filter(Boolean),
        recordsPerPage,
        maxPages,
        pageConcurrency
      });
      receivableLookup = {
        ...receivableLookup,
        warnings: [
          ...(Array.isArray(receivableLookup.warnings) ? receivableLookup.warnings : []),
          "Contas a receber recuperadas via busca de cliente por CNPJ."
        ]
      };
    }

    return jsonResponse(200, {
      cnpj,
      customer: customerLookup.customer,
      receivables_summary: buildReceivablesSummary(receivableLookup.receivables),
      receivables: receivableLookup.receivables,
      pages_processed: receivableLookup.pages_processed,
      total_pages_detected: receivableLookup.total_pages_detected,
      scanned_rows: receivableLookup.scanned_rows,
      warnings: [...customerLookup.warnings, ...receivableLookup.warnings]
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "omie_receivables_failed",
      message: error instanceof Error ? error.message : "Falha ao consultar contas a receber no OMIE.",
      cnpj
    });
  }
});
