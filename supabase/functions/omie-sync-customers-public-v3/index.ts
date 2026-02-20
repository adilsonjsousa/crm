import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const DEFAULT_PAGE_CHUNK_SIZE = 3;
const DEFAULT_EXECUTION_GUARD_MS = 110000;
const LIVE_MAX_RECORDS_PER_PAGE = 20;
const LIVE_MAX_PAGE_CHUNK_SIZE = 1;

type AnyRecord = Record<string, unknown>;

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function asObject(value: unknown): AnyRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as AnyRecord;
  }
  return {};
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function parseBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "sim", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "nao", "não", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return jsonResponse(500, {
      error: "missing_supabase_url",
      message: "SUPABASE_URL não configurado."
    });
  }

  let body: AnyRecord = {};
  try {
    body = asObject(await request.json());
  } catch {
    return jsonResponse(400, {
      error: "invalid_payload",
      message: "Payload inválido."
    });
  }

  const dryRun = parseBoolean(body.dry_run ?? body.dryRun, false);
  const requestedRecordsPerPage = clampNumber(body.records_per_page ?? body.recordsPerPage, 1, 500, 100);
  const requestedPageChunkSize = clampNumber(
    body.page_chunk_size ?? body.pageChunkSize,
    1,
    20,
    DEFAULT_PAGE_CHUNK_SIZE
  );

  const forwardPayload = {
    ...body,
    dry_run: dryRun,
    records_per_page: dryRun ? requestedRecordsPerPage : Math.min(requestedRecordsPerPage, LIVE_MAX_RECORDS_PER_PAGE),
    page_chunk_size: dryRun ? requestedPageChunkSize : Math.min(requestedPageChunkSize, LIVE_MAX_PAGE_CHUNK_SIZE),
    execution_guard_ms: clampNumber(
      body.execution_guard_ms ?? body.executionGuardMs,
      20000,
      130000,
      DEFAULT_EXECUTION_GUARD_MS
    )
  };

  const targetUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/omie-sync-customers-public-v2`;

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(forwardPayload)
    });

    const responseText = await response.text();
    return new Response(responseText, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("content-type") || "application/json"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao encaminhar sincronização OMIE.";
    return jsonResponse(500, {
      error: "proxy_invoke_failed",
      message
    });
  }
});
