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
  if (
    value.includes("out") ||
    value === "sent" ||
    value === "from_me" ||
    value.includes("saida") ||
    value.includes("saída") ||
    value.includes("enviad")
  ) {
    return "outbound";
  }
  if (value.includes("in") || value === "received" || value.includes("entrada") || value.includes("recebid")) {
    return "inbound";
  }
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
  const provider = String(payload.provider ?? payload.platform ?? payload.source ?? payload.origem ?? "whatsapp").trim() || "whatsapp";
  const waSpeedData = asObject(payload.data ?? payload.dados);
  const fromMeRaw =
    payload.fromMe ??
    payload.from_me ??
    payload.eu ??
    payload.fromMeByMe ??
    readNested(payload, ["data", "fromMe"]) ??
    readNested(payload, ["dados", "fromMe"]) ??
    readNested(payload, ["message", "fromMe"]) ??
    readNested(payload, ["messageData", "fromMe"]) ??
    readNested(payload, ["event", "fromMe"]) ??
    readNested(waSpeedData, ["fromMe"]);
  const hasFromMe = typeof fromMeRaw === "boolean";
  const direction = hasFromMe
    ? (fromMeRaw ? "outbound" : "inbound")
    : parseDirection(
        payload.direction ??
          payload.event_direction ??
          payload.flow ??
          payload.status ??
          payload.type ??
          payload.evento ??
          payload.event
      );

  const bodyCandidates = [
    payload.mensagem,
    payload.mensagem_texto,
    payload.msg,
    payload.texto,
    payload.conteudo,
    payload.body,
    payload.message,
    payload.text,
    payload.last_message,
    payload.ultima_mensagem,
    readNested(payload, ["data", "message"]),
    readNested(payload, ["data", "mensagem"]),
    readNested(payload, ["dados", "message"]),
    readNested(payload, ["dados", "mensagem"]),
    readNested(payload, ["data", "body"]),
    readNested(payload, ["data", "text"]),
    readNested(payload, ["dados", "body"]),
    readNested(payload, ["dados", "text"]),
    readNested(payload, ["event", "message"]),
    readNested(payload, ["event", "body"]),
    readNested(payload, ["message", "text"]),
    readNested(payload, ["message", "body"]),
    readNested(payload, ["messageData", "textMessageData", "textMessage"]),
    readNested(waSpeedData, ["message"]),
    readNested(waSpeedData, ["mensagem"]),
    readNested(payload, ["Message"]),
    payload.Body
  ];

  const fromCandidates = [
    payload.numero,
    payload.number,
    payload.num,
    payload.whatsapp,
    payload.whatsapp_number,
    payload.from,
    payload.sender,
    payload.senderPhone,
    payload.phone,
    payload.chatId,
    payload.remoteJid,
    payload.jid,
    payload.From,
    readNested(payload, ["data", "numero"]),
    readNested(payload, ["data", "number"]),
    readNested(payload, ["data", "phone"]),
    readNested(payload, ["dados", "numero"]),
    readNested(payload, ["dados", "number"]),
    readNested(payload, ["dados", "phone"]),
    readNested(payload, ["event", "numero"]),
    readNested(payload, ["event", "phone"]),
    readNested(payload, ["data", "from"]),
    readNested(payload, ["dados", "from"]),
    readNested(payload, ["message", "from"]),
    readNested(payload, ["messageData", "from"]),
    readNested(waSpeedData, ["from"]),
    readNested(waSpeedData, ["numero"]),
    readNested(waSpeedData, ["phone"])
  ];

  const toCandidates = [
    payload.destino,
    payload.to_number,
    payload.numero_destino,
    payload.receiver,
    payload.to,
    payload.recipient,
    payload.toPhone,
    payload.To,
    readNested(payload, ["data", "toPhone"]),
    readNested(payload, ["dados", "toPhone"]),
    readNested(payload, ["data", "to"]),
    readNested(payload, ["dados", "to"]),
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
    payload.message_id,
    payload.id,
    payload.protocolo,
    payload.protocol,
    payload.uuid,
    payload.MessageSid,
    readNested(payload, ["data", "id"]),
    readNested(payload, ["dados", "id"]),
    readNested(payload, ["event", "id"]),
    readNested(payload, ["data", "messageId"]),
    readNested(payload, ["dados", "messageId"]),
    readNested(payload, ["message", "id"])
  ];

  const contactNameCandidates = [
    payload.nome,
    payload.name,
    payload.contact_name,
    payload.contactName,
    payload.pushName,
    payload.user_name,
    readNested(payload, ["data", "nome"]),
    readNested(payload, ["data", "name"]),
    readNested(payload, ["dados", "nome"]),
    readNested(payload, ["dados", "name"]),
    readNested(payload, ["event", "nome"]),
    readNested(payload, ["event", "name"]),
    readNested(payload, ["message", "senderName"]),
    readNested(waSpeedData, ["nome"]),
    readNested(waSpeedData, ["name"])
  ];

  const bodyValue = bodyCandidates.find((value) => typeof value === "string" && String(value).trim().length > 0);
  const fromValue = fromCandidates.find((value) => String(value ?? "").trim().length > 0);
  const toValue = toCandidates.find((value) => String(value ?? "").trim().length > 0);
  const conversationIdValue = conversationIdCandidates.find((value) => String(value ?? "").trim().length > 0);
  const messageIdValue = messageIdCandidates.find((value) => String(value ?? "").trim().length > 0);
  const contactNameValue = contactNameCandidates.find((value) => String(value ?? "").trim().length > 0);

  const text = String(bodyValue ?? "").trim();
  const from = normalizeDigits(fromValue);
  const to = normalizeDigits(toValue);
  const conversationId = String(conversationIdValue ?? "").trim();
  const messageId = String(messageIdValue ?? "").trim();
  const contactName = String(contactNameValue ?? "")
    .replace(/\s+/g, " ")
    .trim();

  return { provider, direction, text, from, to, conversationId, messageId, contactName };
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
  const clauses = new Set<string>();
  for (const candidate of candidates) {
    const digits = normalizeDigits(candidate);
    if (!digits) continue;
    clauses.add(`whatsapp.eq.${digits}`);
    clauses.add(`phone.eq.${digits}`);
    if (digits.length >= 8) {
      const suffix8 = digits.slice(-8);
      clauses.add(`whatsapp.ilike.*${suffix8}*`);
      clauses.add(`phone.ilike.*${suffix8}*`);
    }
  }
  return [...clauses].join(",");
}

function buildCompanyOrFilter(candidates: string[]) {
  const clauses = new Set<string>();
  for (const candidate of candidates) {
    const digits = normalizeDigits(candidate);
    if (!digits) continue;
    clauses.add(`phone.eq.${digits}`);
    if (digits.length >= 8) {
      const suffix8 = digits.slice(-8);
      clauses.add(`phone.ilike.*${suffix8}*`);
    }
  }
  return [...clauses].join(",");
}

function uniqueCandidates(values: string[]) {
  const normalized = values.map((value) => normalizeDigits(value)).filter(Boolean);
  return [...new Set(normalized)];
}

function normalizePhoneSet(values: unknown[]) {
  const result = new Set<string>();
  for (const value of values) {
    const digits = normalizeDigits(value);
    if (!digits) continue;
    result.add(digits);
    if (digits.startsWith("55") && digits.length > 11) {
      result.add(digits.slice(2));
    }
    if (digits.length > 11) result.add(digits.slice(-11));
    if (digits.length > 10) result.add(digits.slice(-10));
  }
  return result;
}

function bestContactMatch(
  contacts: Array<Record<string, unknown>>,
  candidates: string[]
) {
  if (!Array.isArray(contacts) || !contacts.length) return null;
  const candidateSet = normalizePhoneSet(candidates);
  const suffix8Set = new Set<string>();
  for (const candidate of candidateSet) {
    if (candidate.length >= 8) suffix8Set.add(candidate.slice(-8));
  }

  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const contact of contacts) {
    const phoneSet = normalizePhoneSet([contact.whatsapp, contact.phone]);
    let score = 0;
    for (const phone of phoneSet) {
      if (candidateSet.has(phone)) {
        score = Math.max(score, 100);
      } else if (phone.length >= 8 && suffix8Set.has(phone.slice(-8))) {
        score = Math.max(score, 60);
      }
    }
    if (score > bestScore) {
      best = contact;
      bestScore = score;
    }
  }

  return bestScore >= 60 ? best : null;
}

function sanitizeLikeTerm(value: string) {
  return value
    .replace(/[%*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  let matchMethod = "";
  if (candidates.length) {
    const orFilter = buildContactOrFilter(candidates);
    const { data: contacts, error: contactError } = await supabase
      .from("contacts")
      .select("id,company_id,whatsapp,phone")
      .or(orFilter)
      .limit(40);

    if (contactError) {
      return jsonResponse(500, {
        error: "contact_lookup_failed",
        message: contactError.message
      });
    }

    const bestContact = bestContactMatch((contacts || []) as Array<Record<string, unknown>>, candidates);
    if (bestContact) {
      matchedContactId = String(bestContact.id || "");
      matchedCompanyId = String(bestContact.company_id || "");
      matchMethod = "contact_phone";
    }

    if (!matchedCompanyId) {
      const companyOrFilter = buildCompanyOrFilter(candidates);
      if (companyOrFilter) {
        const { data: companies, error: companyError } = await supabase
          .from("companies")
          .select("id,phone")
          .or(companyOrFilter)
          .limit(10);

        if (companyError) {
          return jsonResponse(500, {
            error: "company_lookup_failed",
            message: companyError.message
          });
        }

        const firstCompany = (companies || [])[0];
        if (firstCompany) {
          matchedCompanyId = String(firstCompany.id || "");
          matchMethod = "company_phone";
        }
      }
    }
  }

  if (!matchedCompanyId && extracted.contactName && extracted.contactName.length >= 4) {
    const likeName = sanitizeLikeTerm(extracted.contactName);
    if (likeName.length >= 4) {
      const { data: contactsByName, error: contactsByNameError } = await supabase
        .from("contacts")
        .select("id,company_id,full_name")
        .ilike("full_name", `%${likeName}%`)
        .limit(6);

      if (contactsByNameError) {
        return jsonResponse(500, {
          error: "contact_name_lookup_failed",
          message: contactsByNameError.message
        });
      }

      const nameCandidates = (contactsByName || []).filter((item) => String(item.company_id || "").trim());
      if (nameCandidates.length === 1) {
        matchedContactId = String(nameCandidates[0].id || "");
        matchedCompanyId = String(nameCandidates[0].company_id || "");
        matchMethod = "contact_name_unique";
      }
    }
  }

  const companyId = matchedCompanyId || fallbackCompanyId;
  const messageText = extracted.text || JSON.stringify(payload);
  if (!companyId) {
    return jsonResponse(202, {
      status: "ignored",
      reason: "company_not_mapped",
      debug: {
        contact_name: extracted.contactName || null,
        direction: extracted.direction,
        from: extracted.from,
        to: extracted.to
      },
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
    direction: extracted.direction,
    match_method: matchMethod || "none"
  });
});
