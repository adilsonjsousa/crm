import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

function normalizeUuid(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) return "";
  return normalized;
}

function normalizeUuidList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of value) {
    const normalized = normalizeUuid(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    list.push(normalized);
  }
  return list;
}

function normalizePhoneDigits(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseBoolean(value: unknown, fallback = true) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "sim", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "nao", "não", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function truncate(value: unknown, max = 1200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function buildNotificationText(payload: {
  companyName: string;
  authorName: string;
  subject: string;
  content: string;
  opportunityTitle: string;
  crmUrl: string;
}) {
  const lines = [
    "Voce foi mencionado(a) em uma mensagem interna no CRM.",
    `Cliente: ${payload.companyName || "-"}`,
    `Autor: ${payload.authorName || "-"}`,
    payload.opportunityTitle ? `Oportunidade: ${payload.opportunityTitle}` : "",
    payload.subject ? `Assunto: ${payload.subject}` : "",
    `Mensagem: ${payload.content || "-"}`,
    payload.crmUrl ? `Acesse o CRM: ${payload.crmUrl}` : ""
  ].filter(Boolean);
  return truncate(lines.join("\n"), 1900);
}

function buildNotificationHtml(payload: {
  recipientName: string;
  companyName: string;
  authorName: string;
  subject: string;
  content: string;
  opportunityTitle: string;
  crmUrl: string;
}) {
  const recipientName = escapeHtml(payload.recipientName || "Time comercial");
  const companyName = escapeHtml(payload.companyName || "-");
  const authorName = escapeHtml(payload.authorName || "-");
  const subject = escapeHtml(payload.subject || "Mensagem interna");
  const content = escapeHtml(payload.content || "-").replace(/\n/g, "<br>");
  const opportunityTitle = escapeHtml(payload.opportunityTitle || "");
  const crmUrl = escapeHtml(payload.crmUrl || "");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;">
      <h2 style="margin:0 0 12px;">Nova menção interna no CRM</h2>
      <p style="margin:0 0 10px;">Olá, <strong>${recipientName}</strong>.</p>
      <p style="margin:0 0 6px;">Você foi mencionado(a) em uma mensagem interna.</p>
      <p style="margin:0 0 6px;">Cliente: <strong>${companyName}</strong></p>
      <p style="margin:0 0 6px;">Autor: <strong>${authorName}</strong></p>
      ${opportunityTitle ? `<p style="margin:0 0 6px;">Oportunidade: <strong>${opportunityTitle}</strong></p>` : ""}
      <p style="margin:0 0 6px;">Assunto: <strong>${subject}</strong></p>
      <p style="margin:12px 0 0;"><strong>Mensagem:</strong><br>${content}</p>
      ${
        crmUrl
          ? `<p style="margin:14px 0 0;"><a href="${crmUrl}" style="background:#6d28d9;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px;display:inline-block;">Abrir CRM</a></p>`
          : ""
      }
    </div>
  `;
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

async function sendResendEmail({
  apiKey,
  from,
  to,
  subject,
  html,
  idempotencyKey
}: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  idempotencyKey: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html
    })
  });

  const payload = await safeReadBody(response);
  if (!response.ok) {
    return {
      status: "failed",
      code: response.status,
      error: typeof payload === "string" ? payload || `resend_http_${response.status}` : `resend_http_${response.status}`
    };
  }

  return {
    status: "sent",
    id: String(asObject(payload).id || "")
  };
}

async function sendViaWhatsAppFunction({
  supabaseUrl,
  serviceRoleKey,
  phone,
  message,
  metadata
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  phone: string;
  message: string;
  metadata: AnyRecord;
}) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/whatsapp-send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify({
      phone,
      message,
      metadata
    })
  });

  const payload = await safeReadBody(response);
  if (!response.ok) {
    const payloadObject = asObject(payload);
    const payloadMessage = String(payloadObject.message || payloadObject.error || "").trim();
    return {
      status: "failed",
      code: response.status,
      error:
        (typeof payload === "string" ? payload : payloadMessage) ||
        `whatsapp_http_${response.status}`
    };
  }

  const data = asObject(payload);
  if (data.error) {
    return {
      status: "failed",
      code: 200,
      error: String(data.message || data.error || "whatsapp_send_failed")
    };
  }

  return {
    status: "sent",
    provider: String(data.provider || ""),
    phone: String(data.phone || phone)
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "missing_supabase_env", message: "Credenciais do Supabase não configuradas." });
  }

  let body: AnyRecord = {};
  try {
    body = asObject(await request.json());
  } catch {
    return jsonResponse(400, { error: "invalid_payload", message: "Payload inválido." });
  }

  const mentionedUserIds = normalizeUuidList(body.mentioned_user_ids);
  if (!mentionedUserIds.length) {
    return jsonResponse(200, {
      status: "skipped_no_mentions",
      requested_mentions: 0,
      recipients_found: 0
    });
  }

  const notifyEmail = parseBoolean(body.notify_email, true);
  const notifyWhatsApp = parseBoolean(body.notify_whatsapp, true);
  const companyId = normalizeUuid(body.company_id);
  const companyName = String(body.company_name || "").trim() || "Cliente";
  const subject = truncate(body.subject, 240);
  const content = truncate(body.content, 2500);
  const opportunityTitle = truncate(body.linked_opportunity_title, 240);
  const authorName = String(body.created_by_user_name || "").trim() || "Equipe comercial";
  const authorUserId = normalizeUuid(body.created_by_user_id);
  const crmBaseUrl = String(Deno.env.get("CRM_APP_BASE_URL") || "https://crm-kappa-peach.vercel.app").trim();
  const crmUrl = crmBaseUrl || "";

  const resendApiKey = String(Deno.env.get("RESEND_API_KEY") || "").trim();
  const resendFromEmail = String(Deno.env.get("RESEND_FROM_EMAIL") || "").trim();
  const emailConfigured = Boolean(resendApiKey && resendFromEmail);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: usersData, error: usersError } = await supabase
    .from("app_users")
    .select("user_id,email,full_name,whatsapp,status")
    .in("user_id", mentionedUserIds);

  if (usersError) {
    return jsonResponse(500, {
      error: "users_lookup_failed",
      message: usersError.message
    });
  }

  const usersById = new Map<string, AnyRecord>();
  for (const row of usersData || []) {
    const user = asObject(row);
    const userId = normalizeUuid(user.user_id);
    if (!userId) continue;
    usersById.set(userId, user);
  }

  const results: AnyRecord[] = [];
  let sentEmail = 0;
  let sentWhatsApp = 0;
  let recipientsActive = 0;

  for (const mentionedUserId of mentionedUserIds) {
    const user = asObject(usersById.get(mentionedUserId));
    const fullName = String(user.full_name || user.email || "Usuário").trim() || "Usuário";
    const status = String(user.status || "").trim().toLowerCase();

    const recipientResult: AnyRecord = {
      user_id: mentionedUserId,
      full_name: fullName,
      status: status || "unknown",
      email_status: "skipped",
      whatsapp_status: "skipped"
    };

    if (!usersById.has(mentionedUserId)) {
      recipientResult.reason = "user_not_found";
      results.push(recipientResult);
      continue;
    }

    if (status !== "active") {
      recipientResult.reason = "user_inactive";
      results.push(recipientResult);
      continue;
    }

    recipientsActive += 1;

    const recipientEmail = String(user.email || "").trim().toLowerCase();
    if (!notifyEmail) {
      recipientResult.email_status = "disabled";
    } else if (!emailConfigured) {
      recipientResult.email_status = "not_configured";
    } else if (!isValidEmail(recipientEmail)) {
      recipientResult.email_status = "missing_or_invalid_email";
    } else {
      const html = buildNotificationHtml({
        recipientName: fullName,
        companyName,
        authorName,
        subject,
        content,
        opportunityTitle,
        crmUrl
      });
      const emailSubject = subject ? `CRM | Menção interna: ${subject}` : "CRM | Nova menção interna";
      const emailResult = await sendResendEmail({
        apiKey: resendApiKey,
        from: resendFromEmail,
        to: recipientEmail,
        subject: emailSubject,
        html,
        idempotencyKey: `mention-${mentionedUserId}-${companyId || "company"}-${Date.now()}`
      });
      recipientResult.email_status = emailResult.status;
      if (emailResult.status === "sent") {
        sentEmail += 1;
      } else {
        recipientResult.email_error = emailResult.error || `email_http_${emailResult.code || "unknown"}`;
      }
    }

    const recipientWhatsApp = normalizePhoneDigits(user.whatsapp);
    if (!notifyWhatsApp) {
      recipientResult.whatsapp_status = "disabled";
    } else if (!recipientWhatsApp) {
      recipientResult.whatsapp_status = "missing_whatsapp";
    } else {
      const whatsappMessage = buildNotificationText({
        companyName,
        authorName,
        subject,
        content,
        opportunityTitle,
        crmUrl
      });

      const whatsResult = await sendViaWhatsAppFunction({
        supabaseUrl,
        serviceRoleKey,
        phone: recipientWhatsApp,
        message: whatsappMessage,
        metadata: {
          channel: "internal_mention",
          company_id: companyId || null,
          company_name: companyName,
          linked_opportunity_title: opportunityTitle || null,
          created_by_user_id: authorUserId || null,
          created_by_user_name: authorName,
          mentioned_user_id: mentionedUserId
        }
      });

      recipientResult.whatsapp_status = whatsResult.status;
      if (whatsResult.status === "sent") {
        sentWhatsApp += 1;
      } else {
        recipientResult.whatsapp_error = whatsResult.error || `whatsapp_http_${whatsResult.code || "unknown"}`;
      }
    }

    results.push(recipientResult);
  }

  return jsonResponse(200, {
    status: "processed",
    requested_mentions: mentionedUserIds.length,
    recipients_found: usersById.size,
    recipients_active: recipientsActive,
    email_enabled: notifyEmail,
    whatsapp_enabled: notifyWhatsApp,
    email_configured: emailConfigured,
    sent_email: sentEmail,
    sent_whatsapp: sentWhatsApp,
    results
  });
});
