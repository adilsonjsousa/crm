import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type AnyRecord = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const DEFAULT_OMIE_CLIENTS_URL = "https://app.omie.com.br/api/v1/geral/clientes/";

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

function formatCep(value: unknown) {
  const digits = digitsOnly(value);
  if (digits.length !== 8) return safeString(value) || "";
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const raw = safeString(value).toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "y" || raw === "sim" || raw === "s") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "n" || raw === "nao") return false;
  return fallback;
}

function pickFirstNonEmpty(source: AnyRecord, keys: string[]) {
  for (const key of keys) {
    const value = safeString(source[key]);
    if (value) return value;
  }
  return "";
}

function joinAddressParts(parts: Array<string>) {
  return parts
    .map((item) => safeString(item))
    .filter(Boolean)
    .join(", ");
}

function extractOmieList(payload: AnyRecord) {
  const candidateKeys = ["clientes_cadastro", "clientes", "lista_clientes", "cadastro", "items"];
  for (const key of candidateKeys) {
    const raw = payload[key];
    if (Array.isArray(raw)) return raw;
  }
  return [];
}

function extractTotalPages(payload: AnyRecord, currentPage: number, receivedItems: number, recordsPerPage: number) {
  const direct = clampNumber(
    payload.total_de_paginas ?? payload.totalPaginas ?? payload.total_paginas ?? payload.quantidade_de_paginas,
    1,
    1000,
    0
  );
  if (direct > 0) return direct;

  if (receivedItems < recordsPerPage) return currentPage;
  return currentPage + 1;
}

function parseOmieCustomer(rawItem: unknown) {
  const row = asObject(rawItem);

  const externalId = pickFirstNonEmpty(row, [
    "codigo_cliente_omie",
    "codigo_cliente",
    "codigo_cliente_integracao",
    "codigo",
    "id"
  ]);
  const cnpj = normalizeCnpj(
    row.cnpj_cpf ??
      row.cnpj ??
      row.cpf_cnpj ??
      row.cnpjCpf ??
      row.documento
  );

  const legalName = pickFirstNonEmpty(row, ["razao_social", "razaoSocial", "nome_cliente", "nome"]);
  const tradeName = pickFirstNonEmpty(row, ["nome_fantasia", "fantasia", "empresa", "nome"]);
  const email = pickFirstNonEmpty(row, ["email", "email_cliente", "email_contato"]).toLowerCase();

  const ddd1 = pickFirstNonEmpty(row, ["telefone1_ddd", "ddd_telefone_1", "ddd1", "ddd"]);
  const tel1 = pickFirstNonEmpty(row, ["telefone1_numero", "telefone1", "telefone", "fone", "telefone_numero"]);
  const ddd2 = pickFirstNonEmpty(row, ["telefone2_ddd", "ddd_telefone_2", "celular_ddd", "ddd_celular"]);
  const tel2 = pickFirstNonEmpty(row, ["telefone2_numero", "telefone2", "celular_numero", "celular"]);

  const primaryPhone = formatBrazilPhone(`${ddd1}${tel1}`) || formatBrazilPhone(`${ddd2}${tel2}`) || formatBrazilPhone(tel1) || formatBrazilPhone(tel2);

  const address = joinAddressParts([
    pickFirstNonEmpty(row, ["endereco", "logradouro"]),
    pickFirstNonEmpty(row, ["endereco_numero", "numero"]),
    pickFirstNonEmpty(row, ["complemento"]),
    pickFirstNonEmpty(row, ["bairro"]),
    pickFirstNonEmpty(row, ["cidade"]),
    pickFirstNonEmpty(row, ["estado", "uf"]),
    formatCep(row.cep) ? `CEP ${formatCep(row.cep)}` : ""
  ]);

  const contactName = pickFirstNonEmpty(row, ["contato", "nome_contato", "responsavel"]);

  return {
    externalId,
    cnpj,
    legalName,
    tradeName,
    email,
    phone: primaryPhone,
    addressFull: address || null,
    contactName
  };
}

function normalizeCompanyNames(customer: {
  legalName: string;
  tradeName: string;
  cnpj: string;
  externalId: string;
}) {
  const legal = safeString(customer.legalName) || safeString(customer.tradeName) || `CLIENTE OMIE ${customer.cnpj || customer.externalId}`;
  const trade = safeString(customer.tradeName) || legal;
  return { legal, trade };
}

async function fetchOmieCustomersPage({
  url,
  appKey,
  appSecret,
  page,
  recordsPerPage
}: {
  url: string;
  appKey: string;
  appSecret: string;
  page: number;
  recordsPerPage: number;
}) {
  const body = {
    call: "ListarClientes",
    app_key: appKey,
    app_secret: appSecret,
    param: [
      {
        pagina: page,
        registros_por_pagina: recordsPerPage,
        apenas_importado_api: "N"
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const rawText = await response.text();
  let parsed: AnyRecord = {};
  try {
    parsed = asObject(JSON.parse(rawText));
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    throw new Error(`omie_http_${response.status}`);
  }

  const fault = safeString(parsed.faultstring || parsed.message || parsed.descricao_status);
  if (fault && (parsed.faultcode || parsed.status === "Erro")) {
    throw new Error(`omie_fault:${fault}`);
  }

  const items = extractOmieList(parsed);
  const totalPages = extractTotalPages(parsed, page, items.length, recordsPerPage);

  return {
    payload: parsed,
    items,
    totalPages
  };
}

async function upsertIntegrationLink({
  supabase,
  localEntityId,
  externalId,
  syncedAt
}: {
  supabase: ReturnType<typeof createClient>;
  localEntityId: string;
  externalId: string;
  syncedAt: string;
}) {
  const provider = "omie";
  const localEntityType = "company";

  const { data: byExternal, error: byExternalError } = await supabase
    .from("integration_links")
    .select("id")
    .eq("provider", provider)
    .eq("local_entity_type", localEntityType)
    .eq("external_id", externalId)
    .maybeSingle();
  if (byExternalError) throw new Error(byExternalError.message || "Falha ao buscar vínculo de integração por external_id.");

  if (byExternal?.id) {
    const { error } = await supabase
      .from("integration_links")
      .update({
        local_entity_id: localEntityId,
        last_synced_at: syncedAt
      })
      .eq("id", byExternal.id);
    if (error) throw new Error(error.message || "Falha ao atualizar vínculo de integração por external_id.");
    return;
  }

  const { data: byLocal, error: byLocalError } = await supabase
    .from("integration_links")
    .select("id")
    .eq("provider", provider)
    .eq("local_entity_type", localEntityType)
    .eq("local_entity_id", localEntityId)
    .maybeSingle();
  if (byLocalError) throw new Error(byLocalError.message || "Falha ao buscar vínculo de integração por local_entity_id.");

  if (byLocal?.id) {
    const { error } = await supabase
      .from("integration_links")
      .update({
        external_id: externalId,
        last_synced_at: syncedAt
      })
      .eq("id", byLocal.id);
    if (error) throw new Error(error.message || "Falha ao atualizar vínculo de integração por local_entity_id.");
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
    updatePayload.error_message = safeString(payload.error_message || "Falha na sincronização OMIE.");
    updatePayload.result = payload.result || null;
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
    return jsonResponse(400, { error: "invalid_payload", message: "Payload inválido." });
  }

  const appKey = safeString(body.app_key || body.appKey);
  const appSecret = safeString(body.app_secret || body.appSecret);
  const omieUrl = safeString(body.omie_api_url || body.omieApiUrl || DEFAULT_OMIE_CLIENTS_URL) || DEFAULT_OMIE_CLIENTS_URL;

  if (!appKey || !appSecret) {
    return jsonResponse(400, {
      error: "missing_omie_credentials",
      message: "Informe App Key e App Secret do OMIE."
    });
  }

  const recordsPerPage = clampNumber(body.records_per_page || body.recordsPerPage, 1, 500, 100);
  const maxPages = clampNumber(body.max_pages || body.maxPages, 1, 200, 20);
  const dryRun = parseBoolean(body.dry_run || body.dryRun, false);
  const startedAt = new Date().toISOString();

  const { data: syncJob, error: syncJobError } = await supabase
    .from("sync_jobs")
    .insert({
      provider: "omie",
      resource: "clientes",
      status: "running",
      payload: {
        records_per_page: recordsPerPage,
        max_pages: maxPages,
        dry_run: dryRun
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

  const syncJobId = String(syncJob.id || "").trim();

  try {
    const summary = {
      pages_processed: 0,
      records_received: 0,
      processed: 0,
      companies_created: 0,
      companies_updated: 0,
      links_updated: 0,
      skipped_without_identifier: 0,
      skipped_without_cnpj: 0,
      skipped_invalid_payload: 0,
      errors: [] as Array<string>
    };

    let page = 1;
    let totalPages = 1;

    while (page <= maxPages && page <= totalPages) {
      const { items, totalPages: detectedPages } = await fetchOmieCustomersPage({
        url: omieUrl,
        appKey,
        appSecret,
        page,
        recordsPerPage
      });

      totalPages = Math.max(totalPages, detectedPages);
      summary.pages_processed += 1;
      summary.records_received += items.length;

      for (const rawItem of items) {
        const parsed = parseOmieCustomer(rawItem);

        if (!parsed.externalId && !parsed.cnpj) {
          summary.skipped_without_identifier += 1;
          continue;
        }

        if (!parsed.cnpj && !parsed.externalId) {
          summary.skipped_without_cnpj += 1;
          continue;
        }

        const names = normalizeCompanyNames({
          legalName: parsed.legalName,
          tradeName: parsed.tradeName,
          cnpj: parsed.cnpj,
          externalId: parsed.externalId
        });

        let companyRow: AnyRecord | null = null;

        if (parsed.externalId) {
          const { data: linkRow, error: linkError } = await supabase
            .from("integration_links")
            .select("local_entity_id")
            .eq("provider", "omie")
            .eq("local_entity_type", "company")
            .eq("external_id", parsed.externalId)
            .maybeSingle();
          if (linkError) throw new Error(linkError.message || "Falha ao buscar vínculo OMIE por external_id.");

          const companyIdByLink = safeString(linkRow?.local_entity_id);
          if (companyIdByLink) {
            const { data: existingCompany, error: companyByLinkError } = await supabase
              .from("companies")
              .select("id,cnpj,trade_name,legal_name,email,phone,segmento,address_full")
              .eq("id", companyIdByLink)
              .maybeSingle();
            if (companyByLinkError) throw new Error(companyByLinkError.message || "Falha ao buscar empresa vinculada pelo external_id.");
            if (existingCompany) {
              companyRow = existingCompany;
            }
          }
        }

        if (!companyRow && parsed.cnpj) {
          const { data: existingByCnpj, error: byCnpjError } = await supabase
            .from("companies")
            .select("id,cnpj,trade_name,legal_name,email,phone,segmento,address_full")
            .eq("cnpj", parsed.cnpj)
            .maybeSingle();
          if (byCnpjError) throw new Error(byCnpjError.message || "Falha ao buscar empresa por CNPJ.");
          if (existingByCnpj) companyRow = existingByCnpj;
        }

        if (!companyRow && !parsed.cnpj) {
          summary.skipped_without_cnpj += 1;
          continue;
        }

        if (dryRun) {
          summary.processed += 1;
          continue;
        }

        const upsertPayload = {
          legal_name: names.legal,
          trade_name: names.trade,
          cnpj: parsed.cnpj,
          email: parsed.email || null,
          phone: parsed.phone || null,
          segmento: "OMIE",
          address_full: parsed.addressFull || null
        };

        let companyId = "";

        if (!companyRow) {
          const { data: insertedCompany, error: insertError } = await supabase
            .from("companies")
            .insert(upsertPayload)
            .select("id")
            .single();

          if (insertError) {
            summary.errors.push(`Falha ao inserir ${parsed.cnpj || parsed.externalId}: ${insertError.message}`);
            if (summary.errors.length > 20) summary.errors = summary.errors.slice(0, 20);
            continue;
          }

          companyId = safeString(insertedCompany?.id);
          summary.companies_created += 1;
        } else {
          companyId = safeString(companyRow.id);
          const patchPayload: AnyRecord = {
            trade_name: names.trade || safeString(companyRow.trade_name),
            legal_name: names.legal || safeString(companyRow.legal_name),
            email: parsed.email || companyRow.email || null,
            phone: parsed.phone || companyRow.phone || null,
            segmento: companyRow.segmento || "OMIE",
            address_full: parsed.addressFull || companyRow.address_full || null
          };

          const { error: updateError } = await supabase.from("companies").update(patchPayload).eq("id", companyId);
          if (updateError) {
            summary.errors.push(`Falha ao atualizar ${parsed.cnpj || parsed.externalId}: ${updateError.message}`);
            if (summary.errors.length > 20) summary.errors = summary.errors.slice(0, 20);
            continue;
          }
          summary.companies_updated += 1;
        }

        if (companyId && parsed.externalId) {
          await upsertIntegrationLink({
            supabase,
            localEntityId: companyId,
            externalId: parsed.externalId,
            syncedAt: new Date().toISOString()
          });
          summary.links_updated += 1;
        }

        summary.processed += 1;
      }

      if (!items.length) break;
      page += 1;
    }

    const resultPayload = {
      ...summary,
      records_per_page: recordsPerPage,
      max_pages: maxPages,
      dry_run: dryRun,
      started_at: startedAt,
      finished_at: new Date().toISOString()
    };

    await updateSyncJob(supabase, syncJobId, "success", resultPayload);
    return jsonResponse(200, {
      sync_job_id: syncJobId,
      ...resultPayload
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada na sincronização OMIE.";
    await updateSyncJob(supabase, syncJobId, "error", {
      error_message: message
    });
    return jsonResponse(500, {
      error: "omie_sync_failed",
      message,
      sync_job_id: syncJobId
    });
  }
});
