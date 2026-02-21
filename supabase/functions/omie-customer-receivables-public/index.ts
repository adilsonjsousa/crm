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
  if (status.includes("pago") || status.includes("baixad") || status.includes("liquid") || status.includes("quitad")) {
    return false;
  }
  if (status.includes("abert") || status.includes("pendente") || status.includes("atras") || status.includes("receber")) {
    return true;
  }
  return null;
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

function receivableMatchesCustomer(rawReceivable: unknown, customerCode: string, customerCnpj: string) {
  const row = asObject(rawReceivable);
  const header = asObject(row.cabecalho);
  const customerBlock = asObject(
    row.cliente_fornecedor ?? row.clienteFornecedor ?? row.cliente ?? row.cliente_cadastro
  );

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

  if (codeCandidates.some((value) => sameIdentifier(value, customerCode))) {
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

  return cnpjCandidates.some((value) => normalizeCnpj(value) === cnpjTarget);
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
      const row = asObject(rowRaw);
      const rowCnpj = normalizeCnpj(row.cnpj_cpf ?? row.cnpj ?? row.cpf_cnpj ?? row.documento);
      if (rowCnpj !== cnpj) continue;
      const customerCode = pickFirstNonEmpty(row, ["codigo_cliente_omie", "codigo_cliente", "id"]);
      if (!customerCode) continue;
      return {
        customer: {
          codigo_cliente_omie: customerCode,
          cnpj,
          razao_social: pickFirstNonEmpty(row, ["razao_social", "nome_cliente", "nome"]),
          nome_fantasia: pickFirstNonEmpty(row, ["nome_fantasia", "fantasia", "empresa", "nome"])
        },
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
      const row = asObject(rowRaw);
      const rowCnpj = normalizeCnpj(row.cnpj_cpf ?? row.cnpj ?? row.cpf_cnpj ?? row.documento);
      if (rowCnpj !== cnpj) continue;
      const customerCode = pickFirstNonEmpty(row, ["codigo_cliente_omie", "codigo_cliente", "id"]);
      if (!customerCode) continue;
      warnings.push("Cliente encontrado por varredura de paginas.");
      return {
        customer: {
          codigo_cliente_omie: customerCode,
          cnpj,
          razao_social: pickFirstNonEmpty(row, ["razao_social", "nome_cliente", "nome"]),
          nome_fantasia: pickFirstNonEmpty(row, ["nome_fantasia", "fantasia", "empresa", "nome"])
        },
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
    row.valor_documento ?? row.valor_titulo ?? row.valor_original ?? row.valor_total ??
      header.valor_documento ?? header.valor_titulo ?? header.valor_original ?? header.valor_total
  );
  const paidAmount = parseMoney(
    row.valor_pago ?? row.valor_recebido ?? row.valor_baixado ??
      header.valor_pago ?? header.valor_recebido ?? header.valor_baixado
  );

  let openAmount = parseMoney(
    row.valor_saldo ?? row.valor_aberto ?? row.valor_em_aberto ?? row.valor_pendente ??
      header.valor_saldo ?? header.valor_aberto ?? header.valor_em_aberto ?? header.valor_pendente
  );

  if (!(openAmount > 0) && documentAmount > 0 && paidAmount > 0 && paidAmount < documentAmount) {
    openAmount = documentAmount - paidAmount;
  }
  if (!(openAmount > 0) && documentAmount > 0) {
    const byStatus = isOpenStatus(status);
    if (byStatus === true) openAmount = documentAmount;
    if (byStatus === false) openAmount = 0;
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
  customerCode,
  customerCnpj,
  recordsPerPage,
  maxPages
}: {
  appKey: string;
  appSecret: string;
  receivablesUrl: string;
  customerCode: string;
  customerCnpj: string;
  recordsPerPage: number;
  maxPages: number;
}) {
  const warnings: string[] = [];

  let page = 1;
  let totalPages = 1;
  let pagesProcessed = 0;
  const rows: AnyRecord[] = [];

  while (page <= maxPages && page <= totalPages) {
    const payload = await callOmieApi({
      url: receivablesUrl,
      appKey,
      appSecret,
      call: "ListarContasReceber",
      param: {
        pagina: page,
        registros_por_pagina: recordsPerPage,
        apenas_importado_api: "N"
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

    totalPages = Math.max(totalPages, extractTotalPages(payload, page, pageRows.length, recordsPerPage));

    for (const row of pageRows) {
      if (!receivableMatchesCustomer(row, customerCode, customerCnpj)) continue;
      rows.push(normalizeReceivable(row));
    }

    pagesProcessed += 1;
    if (!pageRows.length) break;
    page += 1;
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

  const appKey = safeString(body.app_key || body.appKey);
  const appSecret = safeString(body.app_secret || body.appSecret);
  const cnpj = normalizeCnpj(body.cnpj_cpf || body.cnpj || body.cnpjCpf);

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
  const recordsPerPage = clampNumber(body.records_per_page || body.recordsPerPage, 1, 500, 100);
  const maxPages = clampNumber(body.max_pages || body.maxPages, 1, 200, 60);
  const maxClientScanPages = clampNumber(body.max_client_scan_pages || body.maxClientScanPages, 1, 200, 80);

  try {
    const customerLookup = await findCustomerByCnpj({
      appKey,
      appSecret,
      clientsUrl,
      cnpj,
      maxPages: maxClientScanPages
    });

    if (!customerLookup.customer?.codigo_cliente_omie) {
      return jsonResponse(404, {
        error: "omie_customer_not_found",
        message: `Cliente com CNPJ ${cnpj} nao encontrado no OMIE.`,
        cnpj,
        warnings: customerLookup.warnings
      });
    }

    const receivableLookup = await listReceivablesByCustomer({
      appKey,
      appSecret,
      receivablesUrl,
      customerCode: customerLookup.customer.codigo_cliente_omie,
      customerCnpj: cnpj,
      recordsPerPage,
      maxPages
    });

    return jsonResponse(200, {
      cnpj,
      customer: customerLookup.customer,
      receivables_summary: buildReceivablesSummary(receivableLookup.receivables),
      receivables: receivableLookup.receivables,
      pages_processed: receivableLookup.pages_processed,
      total_pages_detected: receivableLookup.total_pages_detected,
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
