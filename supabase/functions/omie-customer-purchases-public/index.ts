import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type AnyRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const DEFAULT_OMIE_CLIENTS_URL = "https://app.omie.com.br/api/v1/geral/clientes/";
const DEFAULT_OMIE_ORDERS_URL = "https://app.omie.com.br/api/v1/produtos/pedido/";
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

function isRetriableOmieHttpStatus(status: number) {
  return [500, 502, 503, 504].includes(status);
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
    const candidate = payload[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractTotalPages(payload: AnyRecord, currentPage: number, receivedItems: number, recordsPerPage: number) {
  const direct = clampNumber(
    payload.total_de_paginas ?? payload.totalPaginas ?? payload.total_paginas ?? payload.quantidade_de_paginas,
    1,
    2000,
    0
  );
  if (direct > 0) return direct;
  if (receivedItems < recordsPerPage) return currentPage;
  return currentPage + 1;
}

function parseOmieMoney(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  const raw = safeString(value);
  if (!raw) return 0;

  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;

  let normalized = cleaned;
  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
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

function parseOmieDateToIso(value: unknown) {
  const raw = safeString(value);
  if (!raw) return null;

  const brWithTime = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (brWithTime) {
    const day = Number(brWithTime[1]);
    const month = Number(brWithTime[2]);
    const year = Number(brWithTime[3]);
    const hour = Number(brWithTime[4]);
    const minute = Number(brWithTime[5]);
    const second = Number(brWithTime[6] || "0");
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brDate) {
    const day = Number(brDate[1]);
    const month = Number(brDate[2]);
    const year = Number(brDate[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildOrderDate(order: AnyRecord) {
  const header = asObject(order.cabecalho);
  const info = asObject(order.infoCadastro ?? order.info_cadastro);

  return (
    parseOmieDateToIso(
      pickFirstNonEmpty(header, [
        "data_faturamento",
        "data_emissao",
        "data_previsao",
        "data_previsao_faturamento",
        "previsao_entrega"
      ])
    ) ||
    parseOmieDateToIso(
      pickFirstNonEmpty(order, [
        "data_faturamento",
        "data_emissao",
        "data_previsao",
        "data_pedido",
        "data_previsao_faturamento"
      ])
    ) ||
    parseOmieDateToIso(pickFirstNonEmpty(info, ["dInc", "dAlt"])) ||
    null
  );
}

function normalizeOmieOrder(rawOrder: unknown) {
  const row = asObject(rawOrder);
  const header = asObject(row.cabecalho);
  const total = asObject(row.total_pedido ?? row.totalPedido ?? row.total);

  const orderDateIso = buildOrderDate(row);

  const detailsRows = extractArrayByKeys(row, ["det", "itens", "itens_pedido", "lista_itens", "produtos", "pedido_item"]);
  const items: AnyRecord[] = [];
  const detailsProductsAmount = detailsRows.reduce((acc, detailRaw) => {
    const detail = asObject(detailRaw);
    const product = asObject(detail.produto ?? detail.item ?? detail);

    const quantity = parseOmieMoney(product.quantidade ?? product.qtde ?? detail.quantidade ?? detail.qtde ?? 0);
    const unitPrice = parseOmieMoney(
      product.valor_unitario ?? product.valor ?? detail.valor_unitario ?? detail.valor
    );

    let lineTotal = parseOmieMoney(
      product.valor_total_item ??
        product.valor_total ??
        product.total ??
        detail.valor_total_item ??
        detail.valor_total
    );

    if (!(lineTotal > 0)) {
      if (Number.isFinite(quantity) && quantity > 0 && unitPrice > 0) {
        lineTotal = quantity * unitPrice;
      }
    }

    const itemCode =
      pickFirstNonEmpty(product, [
        "codigo_produto",
        "codigo",
        "codigo_produto_omie",
        "codigo_produto_integracao",
        "codigo_item"
      ]) ||
      pickFirstNonEmpty(detail, [
        "codigo_produto",
        "codigo",
        "codigo_produto_omie",
        "codigo_produto_integracao",
        "codigo_item"
      ]);

    const itemDescription =
      pickFirstNonEmpty(product, ["descricao", "descricao_produto", "nome", "produto"]) ||
      pickFirstNonEmpty(detail, ["descricao", "descricao_produto", "nome", "produto"]);

    if (itemCode || itemDescription || quantity > 0 || lineTotal > 0) {
      items.push({
        codigo_produto: itemCode || null,
        descricao: itemDescription || null,
        quantidade: Number.isFinite(quantity) ? quantity : 0,
        valor_unitario: unitPrice,
        valor_total: lineTotal
      });
    }

    return acc + (lineTotal > 0 ? lineTotal : 0);
  }, 0);

  let productsAmount = parseOmieMoney(
    total.valor_mercadorias ??
      total.valor_produtos ??
      header.valor_mercadorias ??
      header.valor_produtos ??
      row.valor_mercadorias ??
      row.valor_produtos
  );
  if (!(productsAmount > 0) && detailsProductsAmount > 0) {
    productsAmount = detailsProductsAmount;
  }

  const discountAmount = parseOmieMoney(
    total.valor_desconto ??
      header.valor_desconto ??
      row.valor_desconto
  );
  const freightAmount = parseOmieMoney(
    total.valor_frete ??
      header.valor_frete ??
      row.valor_frete
  );

  let totalAmount = parseOmieMoney(
    total.valor_total_pedido ??
      total.valor_total ??
      header.valor_total_pedido ??
      header.valor_total ??
      row.valor_total_pedido ??
      row.valor_total
  );
  if (!(totalAmount > 0) && productsAmount > 0) {
    totalAmount = productsAmount - discountAmount + freightAmount;
  }
  if (!(totalAmount > 0) && detailsProductsAmount > 0) {
    totalAmount = detailsProductsAmount;
  }

  const codigoPedido = pickFirstNonEmpty(row, ["codigo_pedido"]) || pickFirstNonEmpty(header, ["codigo_pedido"]);
  const numeroPedido = pickFirstNonEmpty(row, ["numero_pedido"]) || pickFirstNonEmpty(header, ["numero_pedido"]);
  const integracaoPedido =
    pickFirstNonEmpty(row, ["codigo_pedido_integracao"]) || pickFirstNonEmpty(header, ["codigo_pedido_integracao"]);

  const etapa = pickFirstNonEmpty(row, ["etapa"]) || pickFirstNonEmpty(header, ["etapa"]);
  const status =
    pickFirstNonEmpty(row, ["status_pedido", "status"]) || pickFirstNonEmpty(header, ["status_pedido", "status"]);

  return {
    codigo_pedido: codigoPedido || null,
    numero_pedido: numeroPedido || null,
    codigo_pedido_integracao: integracaoPedido || null,
    etapa: etapa || null,
    status: status || null,
    data_pedido_iso: orderDateIso,
    data_faturamento_iso:
      parseOmieDateToIso(pickFirstNonEmpty(header, ["data_faturamento"])) ||
      parseOmieDateToIso(pickFirstNonEmpty(row, ["data_faturamento"])),
    data_emissao_iso:
      parseOmieDateToIso(pickFirstNonEmpty(header, ["data_emissao"])) ||
      parseOmieDateToIso(pickFirstNonEmpty(row, ["data_emissao"])),
    valor_total: totalAmount,
    valor_mercadorias: productsAmount,
    valor_desconto: discountAmount,
    valor_frete: freightAmount,
    codigo_cliente: pickFirstNonEmpty(row, ["codigo_cliente"]) || pickFirstNonEmpty(header, ["codigo_cliente"]) || null,
    itens: items,
    items
  };
}

function buildOrderSummary(orders: Array<AnyRecord>) {
  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let totalAmount = 0;
  let count90 = 0;
  let count180 = 0;
  let count360 = 0;

  const sorted = [...orders].sort((a, b) => {
    const aMs = parseOmieDateToIso(a.data_pedido_iso)
      ? new Date(String(a.data_pedido_iso)).getTime()
      : Number.NEGATIVE_INFINITY;
    const bMs = parseOmieDateToIso(b.data_pedido_iso)
      ? new Date(String(b.data_pedido_iso)).getTime()
      : Number.NEGATIVE_INFINITY;
    return bMs - aMs;
  });

  for (const order of sorted) {
    totalAmount += parseOmieMoney(order.valor_total);
    const dateIso = parseOmieDateToIso(order.data_pedido_iso);
    if (!dateIso) continue;
    const diffDays = (nowMs - new Date(dateIso).getTime()) / dayMs;
    if (!Number.isFinite(diffDays) || diffDays < 0) continue;
    if (diffDays <= 90) count90 += 1;
    if (diffDays <= 180) count180 += 1;
    if (diffDays <= 360) count360 += 1;
  }

  const lastPurchaseAt = sorted[0]?.data_pedido_iso || null;

  return {
    total_orders: sorted.length,
    total_amount: totalAmount,
    last_purchase_at: lastPurchaseAt,
    orders_last_90_days: count90,
    orders_last_180_days: count180,
    orders_last_360_days: count360
  };
}

function normalizeStatusText(value: unknown) {
  return safeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isOpenReceivableStatus(value: unknown) {
  const normalized = normalizeStatusText(value);
  if (!normalized) return null;

  if (
    normalized.includes("pago") ||
    normalized.includes("baixad") ||
    normalized.includes("liquid") ||
    normalized.includes("quitad") ||
    normalized.includes("cancel")
  ) {
    return false;
  }

  if (
    normalized.includes("abert") ||
    normalized.includes("pendente") ||
    normalized.includes("atras") ||
    normalized.includes("vencid") ||
    normalized.includes("receber") ||
    normalized.includes("parcial")
  ) {
    return true;
  }

  return null;
}

function pickFirstMoneyValue(sources: AnyRecord[], keys: string[]) {
  for (const source of sources) {
    const current = asObject(source);
    for (const key of keys) {
      const raw = current[key];
      if (raw === undefined || raw === null) continue;
      if (typeof raw === "string" && !safeString(raw)) continue;
      return parseOmieMoney(raw);
    }
  }
  return 0;
}

function normalizeOmieReceivable(rawReceivable: unknown) {
  const row = asObject(rawReceivable);
  const header = asObject(row.cabecalho);
  const title = asObject(row.titulo ?? row.identificacao ?? row.info ?? row.dadosTitulo);
  const sources = [row, header, title];

  const status =
    pickFirstNonEmpty(row, ["status_titulo", "status", "status_lancamento", "situacao"]) ||
    pickFirstNonEmpty(header, ["status_titulo", "status", "status_lancamento", "situacao"]) ||
    pickFirstNonEmpty(title, ["status_titulo", "status", "status_lancamento", "situacao"]);

  const documentAmount = pickFirstMoneyValue(sources, [
    "valor_documento",
    "valor_titulo",
    "valor_original",
    "valor_total",
    "valor",
    "valor_bruto"
  ]);

  const paidAmount = pickFirstMoneyValue(sources, [
    "valor_pago",
    "valor_recebido",
    "valor_baixado",
    "valor_liquidado",
    "valor_pago_liquido"
  ]);

  let openAmount = pickFirstMoneyValue(sources, [
    "valor_saldo",
    "valor_aberto",
    "valor_em_aberto",
    "valor_a_receber",
    "valor_pendente",
    "saldo_em_aberto"
  ]);

  if (!(openAmount > 0) && documentAmount > 0 && paidAmount > 0 && paidAmount < documentAmount) {
    openAmount = documentAmount - paidAmount;
  }

  if (!(openAmount > 0) && documentAmount > 0) {
    const openByStatus = isOpenReceivableStatus(status);
    if (openByStatus === true) openAmount = documentAmount;
    if (openByStatus === false) openAmount = 0;
  }

  if (openAmount < 0) openAmount = 0;

  const dataVencimentoIso =
    parseOmieDateToIso(
      pickFirstNonEmpty(row, ["data_vencimento", "data_venc", "data_venc_original", "vencimento"])
    ) ||
    parseOmieDateToIso(
      pickFirstNonEmpty(header, ["data_vencimento", "data_venc", "data_venc_original", "vencimento"])
    ) ||
    parseOmieDateToIso(
      pickFirstNonEmpty(title, ["data_vencimento", "data_venc", "data_venc_original", "vencimento"])
    );

  const dataEmissaoIso =
    parseOmieDateToIso(
      pickFirstNonEmpty(row, ["data_emissao", "data_lancamento", "data_entrada", "data_documento"])
    ) ||
    parseOmieDateToIso(
      pickFirstNonEmpty(header, ["data_emissao", "data_lancamento", "data_entrada", "data_documento"])
    ) ||
    parseOmieDateToIso(
      pickFirstNonEmpty(title, ["data_emissao", "data_lancamento", "data_entrada", "data_documento"])
    );

  const dataPagamentoIso =
    parseOmieDateToIso(
      pickFirstNonEmpty(row, ["data_pagamento", "data_baixa", "data_liquidacao", "data_recebimento"])
    ) ||
    parseOmieDateToIso(
      pickFirstNonEmpty(header, ["data_pagamento", "data_baixa", "data_liquidacao", "data_recebimento"])
    ) ||
    parseOmieDateToIso(
      pickFirstNonEmpty(title, ["data_pagamento", "data_baixa", "data_liquidacao", "data_recebimento"])
    );

  const codigoLancamento =
    pickFirstNonEmpty(row, ["codigo_lancamento_omie", "codigo_lancamento", "codigo_titulo", "codigo", "id"]) ||
    pickFirstNonEmpty(header, ["codigo_lancamento_omie", "codigo_lancamento", "codigo_titulo", "codigo", "id"]) ||
    pickFirstNonEmpty(title, ["codigo_lancamento_omie", "codigo_lancamento", "codigo_titulo", "codigo", "id"]);

  const numeroDocumento =
    pickFirstNonEmpty(row, ["numero_documento", "numero_titulo", "numero_parcela", "numero"]) ||
    pickFirstNonEmpty(header, ["numero_documento", "numero_titulo", "numero_parcela", "numero"]) ||
    pickFirstNonEmpty(title, ["numero_documento", "numero_titulo", "numero_parcela", "numero"]);

  const parcela =
    pickFirstNonEmpty(row, ["parcela", "numero_parcela"]) ||
    pickFirstNonEmpty(header, ["parcela", "numero_parcela"]) ||
    pickFirstNonEmpty(title, ["parcela", "numero_parcela"]);

  return {
    codigo_lancamento_omie: codigoLancamento || null,
    numero_documento: numeroDocumento || null,
    parcela: parcela || null,
    status: status || null,
    data_vencimento_iso: dataVencimentoIso || null,
    data_emissao_iso: dataEmissaoIso || null,
    data_pagamento_iso: dataPagamentoIso || null,
    valor_documento: documentAmount,
    valor_pago: paidAmount,
    valor_aberto: openAmount,
    codigo_cliente: pickFirstNonEmpty(row, ["codigo_cliente", "codigo_cliente_fornecedor"]) || null
  };
}

function buildReceivablesSummary(receivables: Array<AnyRecord>) {
  const dayMs = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const next30DaysMs = todayMs + 30 * dayMs;

  let openReceivablesCount = 0;
  let openTotalAmount = 0;
  let overdueReceivablesCount = 0;
  let overdueTotalAmount = 0;
  let dueNext30DaysCount = 0;
  let dueNext30DaysTotal = 0;
  let nextDueAt: string | null = null;
  let lastDueAt: string | null = null;

  for (const receivable of receivables) {
    const openAmount = parseOmieMoney(receivable.valor_aberto);
    if (!(openAmount > 0)) continue;

    openReceivablesCount += 1;
    openTotalAmount += openAmount;

    const dueIso = parseOmieDateToIso(receivable.data_vencimento_iso || receivable.data_emissao_iso);
    if (!dueIso) continue;
    const dueMs = new Date(dueIso).getTime();
    if (!Number.isFinite(dueMs)) continue;

    if (dueMs < todayMs) {
      overdueReceivablesCount += 1;
      overdueTotalAmount += openAmount;
    } else if (dueMs <= next30DaysMs) {
      dueNext30DaysCount += 1;
      dueNext30DaysTotal += openAmount;
    }

    if (!nextDueAt || dueMs < new Date(nextDueAt).getTime()) {
      nextDueAt = dueIso;
    }
    if (!lastDueAt || dueMs > new Date(lastDueAt).getTime()) {
      lastDueAt = dueIso;
    }
  }

  return {
    total_receivables: receivables.length,
    open_receivables_count: openReceivablesCount,
    open_total_amount: openTotalAmount,
    overdue_receivables_count: overdueReceivablesCount,
    overdue_total_amount: overdueTotalAmount,
    due_next_30_days_count: dueNext30DaysCount,
    due_next_30_days_total: dueNext30DaysTotal,
    next_due_at: nextDueAt,
    last_due_at: lastDueAt
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  const requestBody = {
    call,
    app_key: appKey,
    app_secret: appSecret,
    param: [param]
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const rawText = await response.text();
    let parsed: AnyRecord = {};
    try {
      parsed = asObject(JSON.parse(rawText));
    } catch {
      parsed = {};
    }

    const fault = safeString(parsed.faultstring || parsed.message || parsed.descricao_status);

    if (!response.ok) {
      const details = fault || safeString(rawText).slice(0, 200);
      if (isRetriableOmieHttpStatus(response.status) && attempt < 3) {
        await sleep(700 * attempt);
        continue;
      }
      throw new Error(details ? `omie_http_${response.status}:${details}` : `omie_http_${response.status}`);
    }

    if (fault && (parsed.faultcode || safeString(parsed.status).toLowerCase() === "erro")) {
      throw new Error(`omie_fault:${fault}`);
    }

    return parsed;
  }

  throw new Error("omie_http_500:Falha persistente ao consultar OMIE.");
}

async function findOmieCustomer({
  appKey,
  appSecret,
  clientsUrl,
  cnpj,
  maxFallbackPages
}: {
  appKey: string;
  appSecret: string;
  clientsUrl: string;
  cnpj: string;
  maxFallbackPages: number;
}) {
  const warnings: string[] = [];

  const candidateCalls = [
    { call: "ListarClientesResumido", listKeys: ["clientes_cadastro_resumido", "clientes_cadastro", "clientes"] },
    { call: "ListarClientes", listKeys: ["clientes_cadastro", "clientes", "cadastro"] }
  ];

  for (const candidate of candidateCalls) {
    try {
      const payload = await callOmieApi({
        url: clientsUrl,
        appKey,
        appSecret,
        call: candidate.call,
        param: {
          pagina: 1,
          registros_por_pagina: 20,
          apenas_importado_api: "N",
          clientesFiltro: {
            cnpj_cpf: cnpj
          }
        }
      });

      const rows = extractArrayByKeys(payload, candidate.listKeys);
      for (const rowRaw of rows) {
        const row = asObject(rowRaw);
        const rowCnpj = normalizeCnpj(
          row.cnpj_cpf ?? row.cnpj ?? row.cpf_cnpj ?? row.cnpjCpf ?? row.documento
        );
        if (rowCnpj !== cnpj) continue;

        const externalId = pickFirstNonEmpty(row, [
          "codigo_cliente_omie",
          "codigo_cliente",
          "codigo_cliente_integracao",
          "codigo",
          "id"
        ]);

        if (!externalId) continue;

        return {
          customer: {
            codigo_cliente_omie: externalId,
            cnpj,
            razao_social: pickFirstNonEmpty(row, ["razao_social", "nome_cliente", "nome"]),
            nome_fantasia: pickFirstNonEmpty(row, ["nome_fantasia", "fantasia", "empresa", "nome"])
          },
          warnings
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao buscar cliente OMIE.";
      warnings.push(`${candidate.call}: ${message}`);
    }
  }

  const recordsPerPage = 20;
  let page = 1;
  let totalPages = 1;

  while (page <= maxFallbackPages && page <= totalPages) {
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
      const rowCnpj = normalizeCnpj(
        row.cnpj_cpf ?? row.cnpj ?? row.cpf_cnpj ?? row.cnpjCpf ?? row.documento
      );
      if (rowCnpj !== cnpj) continue;

      const externalId = pickFirstNonEmpty(row, [
        "codigo_cliente_omie",
        "codigo_cliente",
        "codigo_cliente_integracao",
        "codigo",
        "id"
      ]);

      if (!externalId) continue;

      warnings.push("Cliente encontrado por varredura de páginas.");
      return {
        customer: {
          codigo_cliente_omie: externalId,
          cnpj,
          razao_social: pickFirstNonEmpty(row, ["razao_social", "nome_cliente", "nome"]),
          nome_fantasia: pickFirstNonEmpty(row, ["nome_fantasia", "fantasia", "empresa", "nome"])
        },
        warnings
      };
    }

    page += 1;
  }

  return {
    customer: null,
    warnings
  };
}

async function listOmieOrdersByCustomer({
  appKey,
  appSecret,
  ordersUrl,
  customerCode,
  recordsPerPage,
  maxPages
}: {
  appKey: string;
  appSecret: string;
  ordersUrl: string;
  customerCode: string;
  recordsPerPage: number;
  maxPages: number;
}) {
  let page = 1;
  let totalPages = 1;
  let pagesProcessed = 0;
  const orders: AnyRecord[] = [];

  while (page <= maxPages && page <= totalPages) {
    const payload = await callOmieApi({
      url: ordersUrl,
      appKey,
      appSecret,
      call: "ListarPedidos",
      param: {
        pagina: page,
        registros_por_pagina: recordsPerPage,
        apenas_importado_api: "N",
        apenas_resumo: "N",
        filtrar_por_cliente: Number(customerCode) || customerCode
      }
    });

    const rows = extractArrayByKeys(payload, ["pedido_venda_produto", "pedidos", "lista_pedidos", "pedido"]);
    totalPages = Math.max(totalPages, extractTotalPages(payload, page, rows.length, recordsPerPage));

    for (const row of rows) {
      orders.push(normalizeOmieOrder(row));
    }

    pagesProcessed += 1;
    if (!rows.length) break;
    page += 1;
  }

  const sortedOrders = [...orders].sort((a, b) => {
    const aDate = parseOmieDateToIso(a.data_pedido_iso);
    const bDate = parseOmieDateToIso(b.data_pedido_iso);
    const aTime = aDate ? new Date(aDate).getTime() : Number.NEGATIVE_INFINITY;
    const bTime = bDate ? new Date(bDate).getTime() : Number.NEGATIVE_INFINITY;
    return bTime - aTime;
  });

  return {
    orders: sortedOrders,
    pages_processed: pagesProcessed,
    total_pages_detected: totalPages
  };
}

async function listOmieReceivablesByCustomer({
  appKey,
  appSecret,
  receivablesUrl,
  customerCode,
  recordsPerPage,
  maxPages
}: {
  appKey: string;
  appSecret: string;
  receivablesUrl: string;
  customerCode: string;
  recordsPerPage: number;
  maxPages: number;
}) {
  const warnings: string[] = [];
  const customerNumericCode = Number(customerCode) || customerCode;
  const filterCandidates: AnyRecord[] = [
    { filtrar_por_cliente: customerNumericCode },
    { codigo_cliente_fornecedor: customerNumericCode },
    { codigo_cliente_omie: customerNumericCode }
  ];

  for (let index = 0; index < filterCandidates.length; index += 1) {
    const filter = filterCandidates[index];
    const filterKey = Object.keys(filter)[0] || "filtrar_por_cliente";
    let page = 1;
    let totalPages = 1;
    let pagesProcessed = 0;
    const receivables: AnyRecord[] = [];

    try {
      while (page <= maxPages && page <= totalPages) {
        const payload = await callOmieApi({
          url: receivablesUrl,
          appKey,
          appSecret,
          call: "ListarContasReceber",
          param: {
            pagina: page,
            registros_por_pagina: recordsPerPage,
            apenas_importado_api: "N",
            ...filter
          }
        });

        const rows = extractArrayByKeys(payload, [
          "conta_receber_cadastro",
          "conta_receber",
          "contas_receber",
          "lista_contas_receber",
          "titulo_receber",
          "titulos_receber",
          "lista_titulos",
          "lancamentos"
        ]);
        totalPages = Math.max(totalPages, extractTotalPages(payload, page, rows.length, recordsPerPage));

        for (const row of rows) {
          receivables.push(normalizeOmieReceivable(row));
        }

        pagesProcessed += 1;
        if (!rows.length) break;
        page += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao listar contas a receber no OMIE.";
      warnings.push(`ListarContasReceber (${filterKey}): ${message}`);
      continue;
    }

    const sortedReceivables = [...receivables].sort((a, b) => {
      const aDate = parseOmieDateToIso(a.data_vencimento_iso || a.data_emissao_iso);
      const bDate = parseOmieDateToIso(b.data_vencimento_iso || b.data_emissao_iso);
      const aTime = aDate ? new Date(aDate).getTime() : Number.POSITIVE_INFINITY;
      const bTime = bDate ? new Date(bDate).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    });

    return {
      receivables: sortedReceivables,
      pages_processed: pagesProcessed,
      total_pages_detected: totalPages,
      warnings
    };
  }

  return {
    receivables: [],
    pages_processed: 0,
    total_pages_detected: 0,
    warnings
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  let body: AnyRecord = {};
  try {
    body = asObject(await request.json());
  } catch {
    return jsonResponse(400, {
      error: "invalid_payload",
      message: "Payload invalido."
    });
  }

  const appKey = safeString(body.app_key || body.appKey);
  const appSecret = safeString(body.app_secret || body.appSecret);
  const cnpj = normalizeCnpj(body.cnpj_cpf || body.cnpj || body.cnpjCpf);

  if (!appKey || !appSecret) {
    return jsonResponse(400, {
      error: "missing_omie_credentials",
      message: "Informe App Key e App Secret do OMIE."
    });
  }
  if (!cnpj) {
    return jsonResponse(400, {
      error: "invalid_cnpj",
      message: "Informe um CNPJ valido com 14 digitos."
    });
  }

  const clientsUrl = safeString(body.omie_clients_url || body.omieClientsUrl || DEFAULT_OMIE_CLIENTS_URL) || DEFAULT_OMIE_CLIENTS_URL;
  const ordersUrl = safeString(body.omie_orders_url || body.omieOrdersUrl || DEFAULT_OMIE_ORDERS_URL) || DEFAULT_OMIE_ORDERS_URL;
  const recordsPerPage = clampNumber(body.records_per_page || body.recordsPerPage, 1, 500, 100);
  const maxPages = clampNumber(body.max_pages || body.maxPages, 1, 200, 60);
  const maxFallbackPages = clampNumber(body.max_client_scan_pages || body.maxClientScanPages, 1, 300, 80);

  try {
    const customerLookup = await findOmieCustomer({
      appKey,
      appSecret,
      clientsUrl,
      cnpj,
      maxFallbackPages
    });

    if (!customerLookup.customer?.codigo_cliente_omie) {
      return jsonResponse(404, {
        error: "omie_customer_not_found",
        message: `Cliente com CNPJ ${cnpj} nao encontrado no OMIE.`,
        cnpj,
        warnings: customerLookup.warnings
      });
    }

    let orderLookup: {
      orders: AnyRecord[];
      pages_processed: number;
      total_pages_detected: number;
      warnings: string[];
    } = {
      orders: [],
      pages_processed: 0,
      total_pages_detected: 0,
      warnings: []
    };

    try {
      const orderResult = await listOmieOrdersByCustomer({
        appKey,
        appSecret,
        ordersUrl,
        customerCode: customerLookup.customer.codigo_cliente_omie,
        recordsPerPage,
        maxPages
      });
      orderLookup = {
        ...orderResult,
        warnings: []
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao listar pedidos no OMIE.";
      orderLookup.warnings.push(`ListarPedidos: ${message}`);
    }

    const summary = buildOrderSummary(orderLookup.orders);
    const warnings = [...customerLookup.warnings, ...orderLookup.warnings];

    return jsonResponse(200, {
      cnpj,
      customer: customerLookup.customer,
      summary,
      orders: orderLookup.orders,
      pages_processed: orderLookup.pages_processed,
      total_pages_detected: orderLookup.total_pages_detected,
      receivables_summary: buildReceivablesSummary([]),
      receivables: [],
      receivables_pages_processed: 0,
      receivables_total_pages_detected: 0,
      warnings
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada ao buscar historico de compras no OMIE.";
    return jsonResponse(500, {
      error: "omie_purchase_history_failed",
      message,
      cnpj
    });
  }
});
