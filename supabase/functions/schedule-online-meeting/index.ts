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

function parseIso(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseEmailList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim().toLowerCase())
      .filter(Boolean)
      .filter(isValidEmail)
      .filter((item, index, arr) => arr.indexOf(item) === index);
  }

  return String(value ?? "")
    .split(/[,\n;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter(isValidEmail)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

async function getGoogleAccessToken() {
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = requiredEnv("GOOGLE_REFRESH_TOKEN");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(`google_token_failed:${response.status}`);
  }

  return String(payload.access_token);
}

function buildMeetingDescription({
  companyName,
  taskTitle,
  taskDescription,
  customDescription
}: {
  companyName: string;
  taskTitle: string;
  taskDescription: string;
  customDescription: string;
}) {
  const lines = [
    `CRM - Reunião Online`,
    `Cliente: ${companyName || "Não informado"}`,
    `Atividade: ${taskTitle || "Reunião"}`
  ];

  if (customDescription) lines.push("", customDescription);
  if (taskDescription && taskDescription !== customDescription) lines.push("", `Contexto da tarefa:`, taskDescription);
  return lines.join("\n").slice(0, 7900);
}

function extractJoinUrl(eventPayload: AnyRecord) {
  const hangoutLink = String(eventPayload.hangoutLink ?? "").trim();
  if (hangoutLink) return hangoutLink;

  const conferenceData = asObject(eventPayload.conferenceData);
  const entryPoints = Array.isArray(conferenceData.entryPoints) ? conferenceData.entryPoints : [];
  for (const item of entryPoints) {
    const entry = asObject(item);
    if (String(entry.entryPointType ?? "") === "video") {
      const uri = String(entry.uri ?? "").trim();
      if (uri) return uri;
    }
  }
  return "";
}

async function createGoogleMeetingEvent({
  accessToken,
  calendarId,
  summary,
  description,
  startAt,
  endAt,
  attendees
}: {
  accessToken: string;
  calendarId: string;
  summary: string;
  description: string;
  startAt: string;
  endAt: string;
  attendees: string[];
}) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: startAt },
        end: { dateTime: endAt },
        attendees: attendees.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
        }
      })
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`google_event_failed:${response.status}`);
  }

  return asObject(payload);
}

async function sendResendEmail({
  from,
  to,
  subject,
  html,
  idempotencyKey
}: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  idempotencyKey: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { status: "skipped_no_resend" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html
    })
  });

  if (!response.ok) {
    return { status: "resend_failed", code: response.status };
  }

  return { status: "resend_sent" };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(500, { error: "missing_supabase_env", message: "Credenciais do Supabase não configuradas." });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  let payload: AnyRecord = {};
  try {
    payload = asObject(await request.json());
  } catch {
    return jsonResponse(400, { error: "invalid_payload", message: "Payload inválido." });
  }

  const taskId = String(payload.task_id ?? "").trim();
  if (!taskId) {
    return jsonResponse(400, { error: "invalid_task", message: "task_id é obrigatório." });
  }

  const provider = String(payload.provider ?? "google_meet").trim().toLowerCase();
  if (provider !== "google_meet") {
    return jsonResponse(400, { error: "unsupported_provider", message: "Fase 1 suporta somente Google Meet." });
  }

  const { data: taskRow, error: taskError } = await supabase
    .from("tasks")
    .select("id,company_id,title,description,scheduled_start_at,scheduled_end_at,due_date,companies:company_id(id,trade_name,email)")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError) {
    return jsonResponse(500, { error: "task_lookup_failed", message: taskError.message });
  }
  if (!taskRow) {
    return jsonResponse(404, { error: "task_not_found", message: "Tarefa não encontrada." });
  }

  const now = Date.now();
  const fallbackStart = new Date(now + 30 * 60 * 1000).toISOString();
  const startAt = parseIso(payload.start_at) || parseIso(taskRow.scheduled_start_at) || fallbackStart;
  const endAt =
    parseIso(payload.end_at) ||
    parseIso(taskRow.scheduled_end_at) ||
    new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();

  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    return jsonResponse(400, {
      error: "invalid_schedule",
      message: "Horário de fim deve ser posterior ao horário de início."
    });
  }

  const attendeesPayload = parseEmailList(payload.attendees);
  const company = asObject(taskRow.companies);
  const companyEmail = String(company.email ?? "").trim().toLowerCase();
  const attendees = [...attendeesPayload];
  if (companyEmail && isValidEmail(companyEmail) && !attendees.includes(companyEmail)) {
    attendees.push(companyEmail);
  }

  if (!attendees.length) {
    return jsonResponse(400, {
      error: "missing_attendees",
      message: "Informe ao menos um e-mail válido para envio do convite."
    });
  }

  const summary = String(payload.title ?? taskRow.title ?? "Reunião online").trim() || "Reunião online";
  const customDescription = String(payload.description ?? "").trim();
  const taskDescription = String(taskRow.description ?? "").trim();
  const companyName = String(company.trade_name ?? "").trim();

  const description = buildMeetingDescription({
    companyName,
    taskTitle: summary,
    taskDescription,
    customDescription
  });

  let accessToken = "";
  let calendarId = "";
  try {
    accessToken = await getGoogleAccessToken();
    calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_auth_failed";
    return jsonResponse(500, {
      error: "google_auth_failed",
      message: "Integração Google não configurada. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN.",
      detail: message
    });
  }

  let eventPayload: AnyRecord = {};
  try {
    eventPayload = await createGoogleMeetingEvent({
      accessToken,
      calendarId,
      summary,
      description,
      startAt,
      endAt,
      attendees
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_event_failed";
    return jsonResponse(502, {
      error: "meeting_creation_failed",
      message: "Falha ao criar reunião no Google Calendar/Meet.",
      detail: message
    });
  }

  const meetingExternalId = String(eventPayload.id ?? "").trim();
  const meetingJoinUrl = extractJoinUrl(eventPayload);
  if (!meetingExternalId || !meetingJoinUrl) {
    return jsonResponse(502, {
      error: "meeting_link_missing",
      message: "Reunião criada sem link de acesso. Verifique permissões do Google Meet na conta conectada."
    });
  }

  const nowIso = new Date().toISOString();
  const updatePayload = {
    meeting_provider: "google_meet",
    meeting_external_id: meetingExternalId,
    meeting_join_url: meetingJoinUrl,
    meeting_start_at: startAt,
    meeting_end_at: endAt,
    meeting_attendees: attendees,
    meeting_status: "scheduled",
    meeting_last_sent_at: nowIso
  };

  const { error: updateError } = await supabase.from("tasks").update(updatePayload).eq("id", taskId);
  if (updateError) {
    return jsonResponse(500, {
      error: "task_update_failed",
      message: updateError.message
    });
  }

  const eventLogPayload = {
    task_id: taskId,
    task_title: summary,
    provider: "google_meet",
    meeting_external_id: meetingExternalId,
    meeting_join_url: meetingJoinUrl,
    meeting_start_at: startAt,
    meeting_end_at: endAt,
    attendees
  };

  const eventRows = [
    {
      entity_type: "task",
      entity_id: taskId,
      event_name: "task_online_meeting_scheduled",
      payload: eventLogPayload,
      happened_at: nowIso
    }
  ];

  if (taskRow.company_id) {
    eventRows.push({
      entity_type: "company",
      entity_id: taskRow.company_id,
      event_name: "task_online_meeting_scheduled",
      payload: eventLogPayload,
      happened_at: nowIso
    });
  }

  const { error: eventError } = await supabase.from("event_log").insert(eventRows);
  if (eventError) {
    console.warn("Falha ao registrar evento task_online_meeting_scheduled:", eventError.message);
  }

  let emailStatus = "provider_invite_sent";
  const shouldSendEmail = payload.send_email !== false;
  if (shouldSendEmail) {
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
    if (fromEmail) {
      const subject = `Convite: ${summary}`;
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;">
          <h2 style="margin:0 0 12px;">${summary}</h2>
          <p style="margin:0 0 10px;">Cliente: <strong>${companyName || "Não informado"}</strong></p>
          <p style="margin:0 0 10px;">Início: <strong>${new Date(startAt).toLocaleString("pt-BR")}</strong></p>
          <p style="margin:0 0 10px;">Fim: <strong>${new Date(endAt).toLocaleString("pt-BR")}</strong></p>
          <p style="margin:14px 0;"><a href="${meetingJoinUrl}" style="background:#1f5fbf;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px;display:inline-block;">Entrar na reunião</a></p>
          <p style="margin:10px 0 0;font-size:13px;color:#4b5563;">Link direto: ${meetingJoinUrl}</p>
        </div>
      `;

      const resendResult = await sendResendEmail({
        from: fromEmail,
        to: attendees,
        subject,
        html,
        idempotencyKey: `task-${taskId}-meeting-${meetingExternalId}`
      });

      emailStatus = String(resendResult.status || "provider_invite_sent");
    }
  }

  return jsonResponse(200, {
    status: "ok",
    meeting_provider: "google_meet",
    meeting_external_id: meetingExternalId,
    meeting_join_url: meetingJoinUrl,
    meeting_start_at: startAt,
    meeting_end_at: endAt,
    meeting_attendees: attendees,
    meeting_status: "scheduled",
    email_status: emailStatus
  });
});
