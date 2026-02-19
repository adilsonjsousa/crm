import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type AnyPayload = Record<string, unknown>;

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function parseDirection(raw: unknown) {
  const value = String(raw ?? "").toLowerCase().trim();
  if (value.includes("out") || value === "sent" || value === "from_me") return "outbound";
  if (value.includes("in") || value === "received") return "inbound";
  return "inbound";
}

function asObject(value: unknown): AnyPayload {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyPayload;
  return {};
}

function readNested(payload: AnyPayload, path: string[]) {
  let current: unknown = payload;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as AnyPayload)[key];
  }
  return current;
}

function extractMessage(payload: AnyPayload) {
  const provider = String(payload.provider ?? payload.platform ?? payload.source ?? "whatsapp").trim() || "whatsapp";
  const fromMeRaw =
    payload.fromMe ??
    payload.from_me ??
    readNested(payload, ["data", "fromMe"]) ??
    readNested(payload, ["message", "fromMe"]) ??
    readNested(payload, ["messageData", "fromMe"]);
  const hasFromMe = typeof fromMeRaw === "boolean";
  const direction = hasFromMe
    ? (fromMeRaw ? "outbound" : "inbound")
    : parseDirection(payload.direction ?? payload.event_direction ?? payload.flow ?? payload.status ?? payload.type);

  const bodyCandidates = [
    payload.body,
    payload.message,
    payload.text,
    readNested(payload, ["data", "body"]),
    readNested(payload, ["data", "text"]),
    readNested(payload, ["message", "text"]),
    readNested(payload, ["message", "body"]),
    readNested(payload, ["messageData", "textMessageData", "textMessage"]),
    readNested(payload, ["Message"]),
    payload.Body
  ];

  const fromCandidates = [
    payload.from,
    payload.sender,
    payload.senderPhone,
    payload.phone,
    payload.chatId,
    payload.From,
    readNested(payload, ["data", "from"]),
    readNested(payload, ["message", "from"]),
    readNested(payload, ["messageData", "from"])
  ];

  const toCandidates = [
    payload.to,
    payload.recipient,
    payload.toPhone,
    payload.To,
    readNested(payload, ["data", "to"]),
    readNested(payload, ["message", "to"])
  ];

  const conversationIdCandidates = [
    payload.conversationId,
    payload.chatId,
    payload.ticketId,
    readNested(payload, ["data", "chatId"])
  ];

  const messageIdCandidates = [
    payload.messageId,
    payload.id,
    payload.MessageSid,
    readNested(payload, ["data", "id"]),
    readNested(payload, ["message", "id"])
  ];

  const bodyValue = bodyCandidates.find((value) => typeof value === "string" && String(value).trim().length > 0);
  const fromValue = fromCandidates.find((value) => String(value ?? "").trim().length > 0);
  const toValue = toCandidates.find((value) => String(value ?? "").trim().length > 0);
  const conversationIdValue = conversationIdCandidates.find((value) => String(value ?? "").trim().length > 0);
  const messageIdValue = messageIdCandidates.find((value) => String(value ?? "").trim().length > 0);

  const text = String(bodyValue ?? "").trim();
  const from = normalizeDigits(fromValue);
  const to = normalizeDigits(toValue);
  const conversationId = String(conversationIdValue ?? "").trim();
  const messageId = String(messageIdValue ?? "").trim();

  return { provider, direction, text, from, to, conversationId, messageId };
}

function phoneCandidates(rawDigits: string) {
  const base = normalizeDigits(rawDigits);
  const values = new Set<string>();
  if (base) values.add(base);
  if (base.startsWith("55") && base.length > 11) values.add(base.slice(2));
  if (base.length > 11) values.add(base.slice(-11));
  if (base.length > 10) values.add(base.slice(-10));
  return [...values].filter(Boolean);
}

function buildContactOrFilter(candidates: string[]) {
  const clauses: string[] = [];
  for (const candidate of candidates) {
    clauses.push(`whatsapp.eq.${candidate}`);
    clauses.push(`phone.eq.${candidate}`);
  }
  return clauses.join(",");
}

function uniqueCandidates(values: string[]) {
  const normalized = values.map((value) => normalizeDigits(value)).filter(Boolean);
  return [...new Set(normalized)];
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const url = new URL(request.url);
  const requiredSecret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET");
  if (requiredSecret) {
    const informedSecret = request.headers.get("x-webhook-secret") || url.searchParams.get("secret");
    if (!informedSecret || informedSecret !== requiredSecret) {
      return jsonResponse(401, { error: "invalid_secret" });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(500, { error: "missing_supabase_env" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  let payload: AnyPayload = {};
  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      payload = asObject(await request.json());
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
    } else {
      const text = await request.text();
      try {
        payload = asObject(JSON.parse(text));
      } catch {
        payload = { body: text };
      }
    }
  } catch (error) {
    return jsonResponse(400, {
      error: "invalid_payload",
      message: error instanceof Error ? error.message : "invalid_payload"
    });
  }

  const extracted = extractMessage(payload);
  const fallbackCompanyId = url.searchParams.get("company_id") || String(payload.company_id ?? "");
  const primaryPhone = extracted.direction === "outbound" ? extracted.to : extracted.from;
  const rawCandidates = uniqueCandidates([primaryPhone, extracted.from, extracted.to]);
  const candidates = rawCandidates.flatMap((item) => phoneCandidates(item));

  let matchedCompanyId = "";
  let matchedContactId = "";
  if (candidates.length) {
    const orFilter = buildContactOrFilter(candidates);
    const { data: contacts, error: contactError } = await supabase
      .from("contacts")
      .select("id,company_id,whatsapp,phone")
      .or(orFilter)
      .limit(10);

    if (contactError) {
      return jsonResponse(500, {
        error: "contact_lookup_failed",
        message: contactError.message
      });
    }

    const firstContact = (contacts || []).find((item) => item.company_id) || (contacts || [])[0];
    if (firstContact) {
      matchedContactId = firstContact.id;
      matchedCompanyId = firstContact.company_id || "";
    }
  }

  const companyId = matchedCompanyId || fallbackCompanyId;
  const messageText = extracted.text || JSON.stringify(payload);
  if (!companyId) {
    return jsonResponse(202, {
      status: "ignored",
      reason: "company_not_mapped",
      phone_candidates: candidates
    });
  }

  const insertPayload = {
    company_id: companyId,
    contact_id: matchedContactId || null,
    interaction_type: "whatsapp",
    direction: extracted.direction,
    subject: extracted.direction === "outbound" ? "WhatsApp enviado" : "WhatsApp recebido",
    content: messageText.slice(0, 6000),
    whatsapp_number: primaryPhone || null,
    occurred_at: new Date().toISOString(),
    provider: extracted.provider,
    provider_conversation_id: extracted.conversationId || null,
    provider_call_id: extracted.messageId || null,
    recording_url: null
  };

  const { error: insertError } = await supabase.from("company_interactions").insert(insertPayload);
  if (insertError) {
    return jsonResponse(500, {
      error: "insert_failed",
      message: insertError.message
    });
  }

  return jsonResponse(200, {
    status: "ok",
    company_id: companyId,
    contact_id: matchedContactId || null,
    direction: extracted.direction
  });
});
