import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type AnyRecord = Record<string, unknown>;

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

function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhone(value: unknown) {
  let digits = normalizeDigits(value);
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function readOptionalEnv(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

function parseOptionalJson(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return {};
  try {
    return asObject(JSON.parse(raw));
  } catch {
    return {};
  }
}

function hasKey(record: AnyRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function stringifySafe(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function textLooksLikeError(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.includes("error") ||
    raw.includes("erro") ||
    raw.includes("falha") ||
    raw.includes("failed") ||
    raw.includes("unauthorized") ||
    raw.includes("forbidden") ||
    raw.includes("invalid") ||
    raw.includes("not connected") ||
    raw.includes("desconect")
  );
}

function isFalsyFailureFlag(value: unknown) {
  if (value === false) return true;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "false" || raw === "0" || raw === "failed" || raw === "error";
}

function isTruthySuccessFlag(value: unknown) {
  if (value === true) return true;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "ok" || raw === "success" || raw === "sent" || raw === "queued";
}

function isZapiSuccessPayload(payload: unknown) {
  if (typeof payload === "string") {
    const normalized = payload.trim().toLowerCase();
    if (!normalized) return false;
    if (textLooksLikeError(normalized)) return false;
    return normalized.includes("ok") || normalized.includes("success") || normalized.includes("sent") || normalized.includes("queued");
  }

  const data = asObject(payload);
  if (!Object.keys(data).length) return false;

  const explicitErrorCandidates = ["error", "erro", "errors", "exception", "detail", "details"];
  for (const key of explicitErrorCandidates) {
    if (hasKey(data, key) && String(data[key] ?? "").trim()) {
      if (textLooksLikeError(data[key])) return false;
      if (key === "error" || key === "erro" || key === "errors" || key === "exception") return false;
    }
  }

  if (hasKey(data, "connected") && isFalsyFailureFlag(data.connected)) return false;
  if (hasKey(data, "status") && isFalsyFailureFlag(data.status)) return false;
  if (hasKey(data, "success") && isFalsyFailureFlag(data.success)) return false;
  if (hasKey(data, "sent") && isFalsyFailureFlag(data.sent)) return false;

  const successSignals = ["messageId", "message_id", "zaapId", "id", "sent", "success", "status"];
  for (const key of successSignals) {
    if (!hasKey(data, key)) continue;
    const value = data[key];
    if (key === "id" || key === "messageId" || key === "message_id" || key === "zaapId") {
      if (String(value ?? "").trim()) return true;
      continue;
    }
    if (isTruthySuccessFlag(value)) return true;
  }

  if (hasKey(data, "message") && textLooksLikeError(data.message)) return false;
  if (hasKey(data, "msg") && textLooksLikeError(data.msg)) return false;

  return false;
}

function isWaSpeedSuccessPayload(payload: unknown) {
  if (typeof payload === "string") {
    const normalized = payload.trim().toLowerCase();
    if (!normalized) return false;
    if (textLooksLikeError(normalized)) return false;
    return normalized.includes("ok") || normalized.includes("success") || normalized.includes("enviado") || normalized.includes("sent");
  }

  const data = asObject(payload);
  if (!Object.keys(data).length) return false;

  const explicitErrorCandidates = ["error", "erro", "errors", "exception", "detail", "details", "message_error"];
  for (const key of explicitErrorCandidates) {
    if (!hasKey(data, key)) continue;
    const value = String(data[key] ?? "").trim();
    if (!value) continue;
    return false;
  }

  if (hasKey(data, "status") && isFalsyFailureFlag(data.status)) return false;
  if (hasKey(data, "success") && isFalsyFailureFlag(data.success)) return false;
  if (hasKey(data, "sent") && isFalsyFailureFlag(data.sent)) return false;

  const successSignals = ["messageId", "message_id", "id", "protocol", "status", "success", "sent", "queued"];
  for (const key of successSignals) {
    if (!hasKey(data, key)) continue;
    const value = data[key];
    if (["id", "messageId", "message_id", "protocol"].includes(key)) {
      if (String(value ?? "").trim()) return true;
      continue;
    }
    if (isTruthySuccessFlag(value)) return true;
  }

  if (hasKey(data, "message")) {
    const value = String(data.message ?? "").trim();
    if (value && !textLooksLikeError(value) && (value.toLowerCase().includes("ok") || value.toLowerCase().includes("enviado"))) {
      return true;
    }
  }

  return false;
}

function buildZapiUrlCandidates(baseUrl: string, instanceId: string, instanceToken: string, endpoint: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const candidates: string[] = [];

  const includeDirect = /\/instances\/[^/]+\/token\/[^/]+/i.test(base);
  if (includeDirect) {
    candidates.push(`${base}/${endpoint}`);
  }

  candidates.push(`${base}/instances/${instanceId}/token/${instanceToken}/${endpoint}`);
  candidates.push(`${base}/instance/${instanceId}/token/${instanceToken}/${endpoint}`);
  candidates.push(`${base}/instances/${instanceId}/${endpoint}?token=${encodeURIComponent(instanceToken)}`);
  candidates.push(`${base}/instance/${instanceId}/${endpoint}?token=${encodeURIComponent(instanceToken)}`);

  return Array.from(new Set(candidates));
}

function buildWaSpeedUrlCandidates(baseUrl: string, instanceId: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const candidates: string[] = [];

  candidates.push(`${base}/send-message`);
  candidates.push(`${base}/send-text`);
  candidates.push(`${base}/messages/send`);
  candidates.push(`${base}/message/send`);
  candidates.push(`${base}/api/messages/send`);
  candidates.push(`${base}/api/v1/messages/send`);
  candidates.push(`${base}/api/send-message`);
  candidates.push(`${base}/api/send-text`);

  if (instanceId) {
    candidates.push(`${base}/instances/${instanceId}/send-message`);
    candidates.push(`${base}/instances/${instanceId}/send-text`);
    candidates.push(`${base}/instance/${instanceId}/send-message`);
    candidates.push(`${base}/instance/${instanceId}/send-text`);
    candidates.push(`${base}/api/instances/${instanceId}/send-message`);
    candidates.push(`${base}/api/instances/${instanceId}/send-text`);
  }

  return Array.from(new Set(candidates));
}

function readProviderError(payload: unknown) {
  if (typeof payload === "string") return payload.trim();
  const record = asObject(payload);
  return String(record.message || record.error || record.detail || "").trim();
}

function isTerminalProviderError(payload: unknown) {
  const message = readProviderError(payload).toLowerCase();
  if (!message) return false;
  return (
    message.includes("client-token") ||
    message.includes("invalid token") ||
    message.includes("token inválido") ||
    message.includes("token invalido") ||
    message.includes("token incorreto") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("not configured") ||
    message.includes("not allowed")
  );
}

async function safeReadBody(response: Response) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  } catch {
    return "";
  }
}

async function sendViaWebhook({
  url,
  token,
  authHeaderName,
  phone,
  message,
  metadata
}: {
  url: string;
  token: string;
  authHeaderName: string;
  phone: string;
  message: string;
  metadata: AnyRecord;
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers[authHeaderName] = authHeaderName.toLowerCase() === "authorization" ? `Bearer ${token}` : token;
  }

  const extra = parseOptionalJson(readOptionalEnv("WHATSAPP_OUTBOUND_WEBHOOK_EXTRA_JSON"));
  const body = {
    phone,
    to: phone,
    message,
    text: message,
    metadata,
    ...extra
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const payload = await safeReadBody(response);
  if (!response.ok) {
    throw new Error(`webhook_http_${response.status}`);
  }

  return payload;
}

async function sendViaZapi({
  baseUrl,
  instanceId,
  instanceToken,
  clientToken,
  phone,
  message,
  metadata
}: {
  baseUrl: string;
  instanceId: string;
  instanceToken: string;
  clientToken: string;
  phone: string;
  message: string;
  metadata: AnyRecord;
}) {
  const localPhone = phone.startsWith("55") ? phone.slice(2) : phone;
  const endpoints = ["send-text", "send-message"];
  const payloads = [
    { phone, message },
    { phone, text: message },
    { to: phone, message },
    { phone: localPhone, message }
  ];

  const errors: string[] = [];
  let lastResponse: unknown = null;
  for (const endpoint of endpoints) {
    const urls = buildZapiUrlCandidates(baseUrl, instanceId, instanceToken, endpoint);
    for (const url of urls) {
      for (const payload of payloads) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        if (clientToken) headers["client-token"] = clientToken;

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...payload,
            metadata
          })
        });

        const responseBody = await safeReadBody(response);
        if (response.ok) {
          if (isZapiSuccessPayload(responseBody)) {
            return responseBody;
          }
          if (isTerminalProviderError(responseBody)) {
            throw new Error(readProviderError(responseBody) || "zapi_failed_terminal");
          }
          lastResponse = responseBody;
          errors.push(`${endpoint}:200_invalid_ack@${url}`);
          continue;
        }
        if (isTerminalProviderError(responseBody)) {
          throw new Error(readProviderError(responseBody) || `zapi_http_${response.status}`);
        }
        lastResponse = responseBody;
        errors.push(`${endpoint}:${response.status}@${url}`);
      }
    }
  }

  const details = lastResponse ? stringifySafe(lastResponse) : "";
  const detailsSuffix = details ? `::${details.slice(0, 200)}` : "";
  const compactErrors = errors.slice(0, 8).join(",");
  throw new Error(errors.length ? `zapi_failed_${compactErrors}${detailsSuffix}` : "zapi_failed");
}

async function sendViaWaSpeed({
  baseUrl,
  apiToken,
  authHeaderName,
  authTokenPrefix,
  tokenInQuery,
  instanceId,
  phone,
  message,
  metadata
}: {
  baseUrl: string;
  apiToken: string;
  authHeaderName: string;
  authTokenPrefix: string;
  tokenInQuery: boolean;
  instanceId: string;
  phone: string;
  message: string;
  metadata: AnyRecord;
}) {
  const localPhone = phone.startsWith("55") ? phone.slice(2) : phone;
  const urls = buildWaSpeedUrlCandidates(baseUrl, instanceId);
  const payloads: AnyRecord[] = [
    { number: localPhone, message },
    { number: phone, message },
    { phone: localPhone, message },
    { phone, message },
    { to: localPhone, text: message },
    { to: phone, text: message },
    { numero: localPhone, mensagem: message },
    { numero: phone, mensagem: message }
  ];

  const extra = parseOptionalJson(readOptionalEnv("WASPEED_OUTBOUND_EXTRA_JSON"));
  const headersBase: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const normalizedAuthHeader = String(authHeaderName || "").trim() || "Authorization";

  if (apiToken && !tokenInQuery) {
    const useBearer = (authTokenPrefix || "Bearer").trim();
    headersBase[normalizedAuthHeader] =
      normalizedAuthHeader.toLowerCase() === "authorization" ? `${useBearer} ${apiToken}` : apiToken;
  }

  const errors: string[] = [];
  let lastResponse: unknown = null;
  for (const rawUrl of urls) {
    const url = tokenInQuery && apiToken
      ? `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(apiToken)}`
      : rawUrl;

    for (const payload of payloads) {
      const response = await fetch(url, {
        method: "POST",
        headers: headersBase,
        body: JSON.stringify({
          ...payload,
          metadata,
          ...extra
        })
      });

      const responseBody = await safeReadBody(response);
      if (response.ok) {
        if (isWaSpeedSuccessPayload(responseBody)) {
          return responseBody;
        }
        if (isTerminalProviderError(responseBody)) {
          throw new Error(readProviderError(responseBody) || "waspeed_failed_terminal");
        }
        lastResponse = responseBody;
        errors.push(`200_invalid_ack@${url}`);
        continue;
      }

      if (isTerminalProviderError(responseBody)) {
        throw new Error(readProviderError(responseBody) || `waspeed_http_${response.status}`);
      }
      lastResponse = responseBody;
      errors.push(`${response.status}@${url}`);
    }
  }

  const details = lastResponse ? stringifySafe(lastResponse) : "";
  const detailsSuffix = details ? `::${details.slice(0, 200)}` : "";
  const compactErrors = errors.slice(0, 8).join(",");
  throw new Error(errors.length ? `waspeed_failed_${compactErrors}${detailsSuffix}` : "waspeed_failed");
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
      message: "Payload inválido."
    });
  }

  const phone = normalizePhone(body.phone ?? body.to);
  const message = String(body.message ?? body.text ?? "").trim();
  const metadata = asObject(body.metadata);

  if (!phone || phone.length < 12) {
    return jsonResponse(400, {
      error: "invalid_phone",
      message: "Telefone WhatsApp inválido para envio."
    });
  }
  if (!message) {
    return jsonResponse(400, {
      error: "invalid_message",
      message: "Mensagem vazia para envio."
    });
  }

  const webhookUrl = readOptionalEnv("WHATSAPP_OUTBOUND_WEBHOOK_URL");
  const webhookToken = readOptionalEnv("WHATSAPP_OUTBOUND_WEBHOOK_TOKEN");
  const webhookAuthHeader = readOptionalEnv("WHATSAPP_OUTBOUND_AUTH_HEADER") || "Authorization";

  const zapiBaseUrl = readOptionalEnv("ZAPI_API_BASE_URL") || "https://api.z-api.io";
  const zapiInstanceId = readOptionalEnv("ZAPI_INSTANCE_ID");
  const zapiInstanceToken = readOptionalEnv("ZAPI_INSTANCE_TOKEN");
  const zapiClientToken = readOptionalEnv("ZAPI_CLIENT_TOKEN");

  const waSpeedBaseUrl = readOptionalEnv("WASPEED_API_BASE_URL");
  const waSpeedApiToken = readOptionalEnv("WASPEED_API_TOKEN");
  const waSpeedAuthHeader = readOptionalEnv("WASPEED_AUTH_HEADER") || "Authorization";
  const waSpeedAuthTokenPrefix = readOptionalEnv("WASPEED_AUTH_TOKEN_PREFIX") || "Bearer";
  const waSpeedTokenInQuery = ["1", "true", "yes", "sim"].includes(readOptionalEnv("WASPEED_TOKEN_IN_QUERY").toLowerCase());
  const waSpeedInstanceId = readOptionalEnv("WASPEED_INSTANCE_ID");
  const providerPreference = readOptionalEnv("WHATSAPP_OUTBOUND_PROVIDER").toLowerCase();

  try {
    if (webhookUrl) {
      await sendViaWebhook({
        url: webhookUrl,
        token: webhookToken,
        authHeaderName: webhookAuthHeader,
        phone,
        message,
        metadata
      });
      return jsonResponse(200, {
        status: "sent",
        provider: "webhook",
        phone
      });
    }

    if (waSpeedBaseUrl && waSpeedApiToken && (providerPreference === "waspeed" || !providerPreference)) {
      await sendViaWaSpeed({
        baseUrl: waSpeedBaseUrl,
        apiToken: waSpeedApiToken,
        authHeaderName: waSpeedAuthHeader,
        authTokenPrefix: waSpeedAuthTokenPrefix,
        tokenInQuery: waSpeedTokenInQuery,
        instanceId: waSpeedInstanceId,
        phone,
        message,
        metadata
      });
      return jsonResponse(200, {
        status: "sent",
        provider: "waspeed",
        phone
      });
    }

    if (zapiInstanceId && zapiInstanceToken) {
      await sendViaZapi({
        baseUrl: zapiBaseUrl,
        instanceId: zapiInstanceId,
        instanceToken: zapiInstanceToken,
        clientToken: zapiClientToken,
        phone,
        message,
        metadata
      });
      return jsonResponse(200, {
        status: "sent",
        provider: "zapi",
        phone
      });
    }

    if (waSpeedBaseUrl && waSpeedApiToken) {
      await sendViaWaSpeed({
        baseUrl: waSpeedBaseUrl,
        apiToken: waSpeedApiToken,
        authHeaderName: waSpeedAuthHeader,
        authTokenPrefix: waSpeedAuthTokenPrefix,
        tokenInQuery: waSpeedTokenInQuery,
        instanceId: waSpeedInstanceId,
        phone,
        message,
        metadata
      });
      return jsonResponse(200, {
        status: "sent",
        provider: "waspeed",
        phone
      });
    }

    return jsonResponse(503, {
      error: "whatsapp_outbound_not_configured",
      message:
        "Envio automático de WhatsApp não está configurado no servidor. Configure webhook, WaSpeed (WASPEED_*) ou Z-API."
    });
  } catch (error) {
    const messageError = error instanceof Error ? error.message : "Falha ao enviar WhatsApp.";
    return jsonResponse(500, {
      error: "whatsapp_send_failed",
      message: messageError
    });
  }
});
