import { ensureSupabase } from "./supabase";
import { PIPELINE_STAGES, sortByStageOrder, stageStatus } from "./pipelineStages";
import { parseOpportunityTitle, resolveEstimatedValueByProduct } from "./productCatalog";
import { formatBrazilPhone, validateBrazilPhoneOrEmpty } from "./phone";

function normalizeError(error, fallback) {
  return error?.message || fallback;
}

function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCep(value) {
  const cep = cleanDigits(value);
  if (cep.length !== 8) return cep;
  return `${cep.slice(0, 5)}-${cep.slice(5)}`;
}

function joinAddress(parts) {
  return parts.filter(Boolean).join(", ");
}

function inferSegmentoFromCnae(description) {
  const raw = String(description || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!raw) return "";
  if (raw.includes("grafica digital")) return "Gráfica Digital";
  if (raw.includes("grafica")) return "Gráfica";
  if (raw.includes("comunicacao visual")) return "Comunicação visual";
  if (raw.includes("varej")) return "Varejo";
  if (raw.includes("software") || raw.includes("informatica") || raw.includes("tecnologia")) return "Tecnologia";
  if (raw.includes("industria") || raw.includes("fabrica") || raw.includes("fabricacao")) return "Indústria";
  if (raw.includes("servic")) return "Serviços";
  return "";
}

function normalizeSearchTerm(term) {
  return String(term || "")
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function normalizeLifecycleStageName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeStoragePart(value) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function pickImageExtension(fileName, mimeType) {
  const normalizedName = String(fileName || "").toLowerCase();
  if (normalizedName.endsWith(".png")) return "png";
  if (normalizedName.endsWith(".webp")) return "webp";
  if (normalizedName.endsWith(".jpeg") || normalizedName.endsWith(".jpg")) return "jpg";
  const normalizedMime = String(mimeType || "").toLowerCase();
  if (normalizedMime.includes("png")) return "png";
  if (normalizedMime.includes("webp")) return "webp";
  return "jpg";
}

function buildProposalOrderNumber(opportunityId = "") {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  const milli = String(now.getMilliseconds()).padStart(3, "0");
  const suffix = String(opportunityId || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-6)
    .toUpperCase();

  if (suffix) return `PROP-${year}${month}${day}${hour}${minute}${second}${milli}-${suffix}`;
  return `PROP-${year}${month}${day}${hour}${minute}${second}${milli}`;
}

function isOrderNumberConflict(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("sales_orders_order_number_key") || message.includes("duplicate key");
}

function normalizeDateOnly(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseBirthDate(value) {
  const [yearRaw, monthRaw, dayRaw] = String(value || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function buildBirthdayDate(year, month, day) {
  const candidate = new Date(year, month - 1, day);
  // Ex.: 29/02 em ano não bissexto. Normaliza para último dia do mês.
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return new Date(year, month, 0);
  }
  return candidate;
}

function computeUpcomingBirthday(birthDate, referenceDate = new Date()) {
  const parts = parseBirthDate(birthDate);
  const today = normalizeDateOnly(referenceDate);
  if (!parts || !today) return null;

  let nextBirthday = buildBirthdayDate(today.getFullYear(), parts.month, parts.day);
  if (nextBirthday < today) {
    nextBirthday = buildBirthdayDate(today.getFullYear() + 1, parts.month, parts.day);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntil = Math.round((nextBirthday.getTime() - today.getTime()) / msPerDay);
  const ageTurning = Number.isInteger(parts.year) && parts.year > 1900 ? nextBirthday.getFullYear() - parts.year : null;

  return {
    daysUntil,
    nextBirthday,
    ageTurning
  };
}

export async function getDashboardKpis() {
  const supabase = ensureSupabase();

  const [companiesRes, oppRes, ticketsRes, ordersRes, orderRevenueRes, tasksRes] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("opportunities").select("id", { count: "exact", head: true }),
    supabase.from("service_tickets").select("id", { count: "exact", head: true }).neq("status", "closed"),
    supabase.from("sales_orders").select("id", { count: "exact", head: true }),
    supabase.from("sales_orders").select("total_amount"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", ["todo", "in_progress"])
  ]);

  if (companiesRes.error) throw new Error(normalizeError(companiesRes.error, "Falha ao buscar empresas."));
  if (oppRes.error) throw new Error(normalizeError(oppRes.error, "Falha ao buscar oportunidades."));
  if (ticketsRes.error) throw new Error(normalizeError(ticketsRes.error, "Falha ao buscar chamados."));
  if (ordersRes.error) throw new Error(normalizeError(ordersRes.error, "Falha ao buscar pedidos."));
  if (orderRevenueRes.error) throw new Error(normalizeError(orderRevenueRes.error, "Falha ao buscar faturamento."));
  if (tasksRes.error) throw new Error(normalizeError(tasksRes.error, "Falha ao buscar tarefas."));

  const revenue = (orderRevenueRes.data || []).reduce((acc, row) => acc + Number(row.total_amount || 0), 0);

  return {
    companies: companiesRes.count || 0,
    opportunities: oppRes.count || 0,
    openTickets: ticketsRes.count || 0,
    orders: ordersRes.count || 0,
    openTasks: tasksRes.count || 0,
    revenue
  };
}

export async function getPipelineByStage() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("opportunities")
    .select("stage, estimated_value");

  if (error) throw new Error(normalizeError(error, "Falha ao buscar funil."));

  const grouped = (data || []).reduce((acc, item) => {
    const stage = item.stage || "undefined";
    if (!acc[stage]) acc[stage] = { stage, totalDeals: 0, totalValue: 0 };
    acc[stage].totalDeals += 1;
    acc[stage].totalValue += Number(item.estimated_value || 0);
    return acc;
  }, {});

  const rows = PIPELINE_STAGES.map((stage) => ({
    stage: stage.value,
    stageLabel: stage.label,
    totalDeals: grouped[stage.value]?.totalDeals || 0,
    totalValue: grouped[stage.value]?.totalValue || 0
  }));

  return sortByStageOrder(rows);
}

export async function listCompanies() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("companies")
    .select("*,lifecycle_stage:company_lifecycle_stages!companies_lifecycle_stage_id_fkey(id,name,stage_order,is_active)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(normalizeError(error, "Falha ao listar empresas."));
  return (data || []).map((item) => ({
    ...item,
    phone: formatBrazilPhone(item.phone)
  }));
}

export async function listAllCompaniesForReport() {
  const supabase = ensureSupabase();
  const pageSize = 500;
  let from = 0;
  const rows = [];

  while (true) {
    const { data, error } = await supabase
      .from("companies")
      .select("id,cnpj,trade_name,legal_name,segmento,email,phone,address_full,city,state,country,created_at,lifecycle_stage:company_lifecycle_stages!companies_lifecycle_stage_id_fkey(id,name,stage_order,is_active)")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(normalizeError(error, "Falha ao listar empresas para relatório."));
    if (!data?.length) break;

    rows.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows.map((item) => ({
    ...item,
    phone: formatBrazilPhone(item.phone)
  }));
}

export async function getCompanyById(companyId) {
  const normalizedCompanyId = String(companyId || "").trim();
  if (!normalizedCompanyId) return null;

  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id,cnpj,trade_name,legal_name,email,phone,segmento,address_full,checkin_validation_mode,checkin_radius_meters,checkin_latitude,checkin_longitude,checkin_pin,lifecycle_stage_id,lifecycle_stage:company_lifecycle_stages!companies_lifecycle_stage_id_fkey(id,name,stage_order,is_active)"
    )
    .eq("id", normalizedCompanyId)
    .maybeSingle();

  if (error) throw new Error(normalizeError(error, "Falha ao buscar dados do cliente."));
  if (!data) return null;
  return {
    ...data,
    phone: formatBrazilPhone(data.phone)
  };
}

export async function findCompanyByCnpj(cnpj) {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("companies")
    .select("id,trade_name,cnpj")
    .eq("cnpj", cnpj)
    .maybeSingle();

  if (error) throw new Error(normalizeError(error, "Falha ao validar CNPJ na base."));
  return data;
}

export async function lookupCompanyDataByCnpj(cnpj) {
  const normalized = cleanDigits(cnpj);
  if (normalized.length !== 14) return null;

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${normalized}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Falha ao consultar dados públicos do CNPJ.");

  const payload = await response.json();
  const address = joinAddress([
    payload.logradouro,
    payload.numero,
    payload.complemento,
    payload.bairro,
    payload.municipio,
    payload.uf,
    payload.cep ? `CEP ${formatCep(payload.cep)}` : ""
  ]);

  return {
    legal_name: payload.razao_social || "",
    trade_name: payload.nome_fantasia || payload.razao_social || "",
    email: payload.email || "",
    phone: formatBrazilPhone(payload.ddd_telefone_1 || payload.ddd_telefone_2 || ""),
    address_full: address,
    segmento: inferSegmentoFromCnae(payload.cnae_fiscal_descricao)
  };
}

export async function createCompany(payload) {
  const supabase = ensureSupabase();
  const normalizedPayload = { ...payload };
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "phone")) {
    normalizedPayload.phone = validateBrazilPhoneOrEmpty(payload?.phone, "Telefone da empresa");
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "lifecycle_stage_id")) {
    normalizedPayload.lifecycle_stage_id = payload?.lifecycle_stage_id || null;
  }
  const { data, error } = await supabase.from("companies").insert(normalizedPayload).select("id").single();
  if (error) throw new Error(normalizeError(error, "Falha ao criar empresa."));
  return data;
}

export async function updateCompany(companyId, payload) {
  const supabase = ensureSupabase();
  const normalizedPayload = { ...payload };
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "phone")) {
    normalizedPayload.phone = validateBrazilPhoneOrEmpty(payload?.phone, "Telefone da empresa");
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "lifecycle_stage_id")) {
    normalizedPayload.lifecycle_stage_id = payload?.lifecycle_stage_id || null;
  }
  const { error } = await supabase.from("companies").update(normalizedPayload).eq("id", companyId);
  if (error) throw new Error(normalizeError(error, "Falha ao atualizar empresa."));
}

export async function listContacts() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("contacts")
    .select("id,company_id,full_name,email,phone,whatsapp,birth_date,role_title,is_primary,companies:company_id(trade_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(normalizeError(error, "Falha ao listar contatos."));
  return (data || []).map((item) => ({
    ...item,
    phone: formatBrazilPhone(item.phone),
    whatsapp: formatBrazilPhone(item.whatsapp)
  }));
}

export async function getContactById(contactId) {
  const normalizedContactId = String(contactId || "").trim();
  if (!normalizedContactId) return null;

  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("contacts")
    .select("id,company_id,full_name,email,phone,whatsapp,birth_date,role_title,is_primary,companies:company_id(trade_name)")
    .eq("id", normalizedContactId)
    .maybeSingle();

  if (error) throw new Error(normalizeError(error, "Falha ao buscar contato."));
  if (!data) return null;
  return {
    ...data,
    phone: formatBrazilPhone(data.phone),
    whatsapp: formatBrazilPhone(data.whatsapp)
  };
}

export async function listUpcomingBirthdays(daysAhead = 7) {
  const supabase = ensureSupabase();
  const horizon = Number(daysAhead);
  const safeDaysAhead = Number.isFinite(horizon) ? Math.max(0, Math.min(60, Math.floor(horizon))) : 7;

  const { data, error } = await supabase
    .from("contacts")
    .select("id,full_name,birth_date,whatsapp,phone,companies:company_id(trade_name)")
    .not("birth_date", "is", null)
    .limit(500);

  if (error) throw new Error(normalizeError(error, "Falha ao buscar alertas de aniversário."));

  const upcoming = (data || [])
    .map((contact) => {
      const computed = computeUpcomingBirthday(contact.birth_date);
      if (!computed) return null;
      if (computed.daysUntil < 0 || computed.daysUntil > safeDaysAhead) return null;

      return {
        id: contact.id,
        full_name: contact.full_name || "Contato",
        company_name: contact.companies?.trade_name || "SEM VÍNCULO",
        whatsapp: formatBrazilPhone(contact.whatsapp || contact.phone),
        birth_date: contact.birth_date,
        days_until: computed.daysUntil,
        next_birthday: computed.nextBirthday.toISOString().slice(0, 10),
        age_turning: computed.ageTurning
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.days_until !== b.days_until) return a.days_until - b.days_until;
      return String(a.full_name).localeCompare(String(b.full_name), "pt-BR");
    });

  return upcoming;
}

export async function createContact(payload) {
  const supabase = ensureSupabase();
  const normalizedPayload = { ...payload };
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "phone")) {
    normalizedPayload.phone = validateBrazilPhoneOrEmpty(payload?.phone, "Telefone do contato");
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "whatsapp")) {
    normalizedPayload.whatsapp = validateBrazilPhoneOrEmpty(payload?.whatsapp, "WhatsApp do contato");
  }
  const { error } = await supabase.from("contacts").insert(normalizedPayload);
  if (error) throw new Error(normalizeError(error, "Falha ao criar contato."));
}

export async function updateContact(contactId, payload) {
  const supabase = ensureSupabase();
  const normalizedPayload = { ...payload };
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "phone")) {
    normalizedPayload.phone = validateBrazilPhoneOrEmpty(payload?.phone, "Telefone do contato");
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPayload, "whatsapp")) {
    normalizedPayload.whatsapp = validateBrazilPhoneOrEmpty(payload?.whatsapp, "WhatsApp do contato");
  }
  const { error } = await supabase.from("contacts").update(normalizedPayload).eq("id", contactId);
  if (error) throw new Error(normalizeError(error, "Falha ao atualizar contato."));
}

export async function listOpportunities() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("opportunities")
    .select("id,company_id,title,stage,status,estimated_value,expected_close_date,created_at,companies:company_id(trade_name,email,phone)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(normalizeError(error, "Falha ao listar oportunidades."));
  return (data || []).map((item) => ({
    ...item,
    companies: item.companies
      ? {
          ...item.companies,
          phone: formatBrazilPhone(item.companies.phone)
        }
      : null
  }));
}

export async function createOpportunity(payload) {
  const supabase = ensureSupabase();
  const { error } = await supabase.from("opportunities").insert(payload);
  if (error) throw new Error(normalizeError(error, "Falha ao criar oportunidade."));
}

export async function updateOpportunity(opportunityId, payload) {
  const supabase = ensureSupabase();
  const fromStage = payload?.from_stage;
  const updatePayload = { ...payload };
  delete updatePayload.from_stage;

  const { error } = await supabase.from("opportunities").update(updatePayload).eq("id", opportunityId);
  if (error) throw new Error(normalizeError(error, "Falha ao atualizar oportunidade."));

  if (fromStage && updatePayload.stage && fromStage !== updatePayload.stage) {
    const { error: historyError } = await supabase.from("opportunity_stage_history").insert({
      opportunity_id: opportunityId,
      from_stage: fromStage,
      to_stage: updatePayload.stage
    });

    if (historyError) {
      console.warn("Falha ao registrar histórico de etapa:", historyError.message);
    }
  }
}

export async function updateOpportunityStage({ opportunityId, fromStage, toStage }) {
  const supabase = ensureSupabase();
  const { error: updateError } = await supabase
    .from("opportunities")
    .update({
      stage: toStage,
      status: stageStatus(toStage)
    })
    .eq("id", opportunityId);

  if (updateError) throw new Error(normalizeError(updateError, "Falha ao atualizar etapa da oportunidade."));

  const { error: historyError } = await supabase.from("opportunity_stage_history").insert({
    opportunity_id: opportunityId,
    from_stage: fromStage,
    to_stage: toStage
  });

  if (historyError) {
    console.warn("Falha ao registrar histórico de etapa:", historyError.message);
  }
}

export async function listTickets() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("service_tickets")
    .select("id,ticket_type,priority,status,opened_at,companies:company_id(trade_name),description")
    .order("opened_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(normalizeError(error, "Falha ao listar chamados."));
  return data || [];
}

export async function createTicket(payload) {
  const supabase = ensureSupabase();
  const { error } = await supabase.from("service_tickets").insert(payload);
  if (error) throw new Error(normalizeError(error, "Falha ao criar chamado."));
}

export async function listTasks() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id,company_id,title,task_type,priority,status,due_date,scheduled_start_at,scheduled_end_at,description,completed_at,visit_checkin_at,visit_checkin_latitude,visit_checkin_longitude,visit_checkin_accuracy_meters,visit_checkin_distance_meters,visit_checkin_method,visit_checkin_note,visit_checkout_at,visit_checkout_note,meeting_provider,meeting_external_id,meeting_join_url,meeting_start_at,meeting_end_at,meeting_attendees,meeting_status,meeting_last_sent_at,created_at,companies:company_id(trade_name,email,address_full,checkin_validation_mode,checkin_radius_meters,checkin_latitude,checkin_longitude,checkin_pin)"
    )
    .order("scheduled_start_at", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw new Error(normalizeError(error, "Falha ao listar tarefas."));
  return data || [];
}

export async function createTask(payload) {
  const supabase = ensureSupabase();
  const { error } = await supabase.from("tasks").insert(payload);
  if (error) throw new Error(normalizeError(error, "Falha ao criar tarefa."));
}

export async function updateTask(taskId, payload) {
  const supabase = ensureSupabase();
  const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
  if (error) throw new Error(normalizeError(error, "Falha ao atualizar tarefa."));
}

async function insertTaskVisitEvent({ taskId, companyId, eventName, payload, happenedAt }) {
  const supabase = ensureSupabase();
  const rows = [
    {
      entity_type: "task",
      entity_id: taskId,
      event_name: eventName,
      payload,
      happened_at: happenedAt || null
    }
  ];

  if (companyId) {
    rows.push({
      entity_type: "company",
      entity_id: companyId,
      event_name: eventName,
      payload,
      happened_at: happenedAt || null
    });
  }

  const { error } = await supabase.from("event_log").insert(rows);
  if (error) throw new Error(normalizeError(error, "Falha ao registrar evento de visita."));
}

export async function registerTaskCheckin({
  taskId,
  companyId,
  taskTitle,
  fromStatus,
  toStatus,
  checkinAt,
  latitude,
  longitude,
  accuracyMeters,
  distanceMeters,
  method,
  note,
  targetRadiusMeters
}) {
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) throw new Error("Tarefa inválida para check-in.");

  const when = checkinAt || new Date().toISOString();
  await updateTask(normalizedTaskId, {
    status: toStatus || "in_progress",
    completed_at: null,
    visit_checkin_at: when,
    visit_checkin_latitude: latitude,
    visit_checkin_longitude: longitude,
    visit_checkin_accuracy_meters: accuracyMeters,
    visit_checkin_distance_meters: distanceMeters,
    visit_checkin_method: method || "geo",
    visit_checkin_note: note || null
  });

  await insertTaskVisitEvent({
    taskId: normalizedTaskId,
    companyId,
    eventName: "task_visit_checkin",
    happenedAt: when,
    payload: {
      task_id: normalizedTaskId,
      task_title: String(taskTitle || "").trim() || "Visita",
      from_status: fromStatus || null,
      to_status: toStatus || "in_progress",
      method: method || "geo",
      checkin_note: note || null,
      checkin_latitude: latitude,
      checkin_longitude: longitude,
      checkin_accuracy_meters: accuracyMeters,
      checkin_distance_meters: distanceMeters,
      target_radius_meters: targetRadiusMeters || null
    }
  });
}

export async function registerTaskCheckout({
  taskId,
  companyId,
  taskTitle,
  fromStatus,
  toStatus,
  checkoutAt,
  summary,
  checkinAt
}) {
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedTaskId) throw new Error("Tarefa inválida para check-out.");
  const checkoutNote = String(summary || "").trim();
  if (!checkoutNote) throw new Error("Resumo obrigatório para concluir a visita.");

  const when = checkoutAt || new Date().toISOString();
  let durationMinutes = null;
  if (checkinAt) {
    const start = new Date(checkinAt).getTime();
    const end = new Date(when).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      durationMinutes = Math.round((end - start) / 60000);
    }
  }

  await updateTask(normalizedTaskId, {
    status: toStatus || "done",
    completed_at: when,
    visit_checkout_at: when,
    visit_checkout_note: checkoutNote
  });

  await insertTaskVisitEvent({
    taskId: normalizedTaskId,
    companyId,
    eventName: "task_visit_checkout",
    happenedAt: when,
    payload: {
      task_id: normalizedTaskId,
      task_title: String(taskTitle || "").trim() || "Visita",
      from_status: fromStatus || null,
      to_status: toStatus || "done",
      checkout_note: checkoutNote,
      duration_minutes: durationMinutes
    }
  });
}

export async function scheduleTaskOnlineMeeting(payload) {
  const supabase = ensureSupabase();
  const { data, error } = await supabase.functions.invoke("schedule-online-meeting", {
    body: payload || {}
  });

  if (error) {
    throw new Error(normalizeError(error, "Falha ao agendar reunião online."));
  }
  if (data?.error) {
    throw new Error(String(data.message || data.error || "Falha ao criar reunião online."));
  }

  return data || {};
}

export async function logTaskFlowComment({ taskId, companyId, taskTitle, fromStatus, toStatus, comment }) {
  const supabase = ensureSupabase();
  const normalizedComment = String(comment || "").trim();
  if (!taskId || !normalizedComment) {
    throw new Error("Comentário obrigatório para registrar mudança de fluxo.");
  }

  const basePayload = {
    task_id: taskId,
    task_title: String(taskTitle || "").trim() || null,
    from_status: fromStatus || null,
    to_status: toStatus || null,
    comment: normalizedComment
  };

  const eventRows = [
    {
      entity_type: "task",
      entity_id: taskId,
      event_name: "task_flow_status_changed",
      payload: basePayload
    }
  ];

  if (companyId) {
    eventRows.push({
      entity_type: "company",
      entity_id: companyId,
      event_name: "task_flow_status_changed",
      payload: basePayload
    });
  }

  const { error } = await supabase.from("event_log").insert(eventRows);

  if (error) throw new Error(normalizeError(error, "Falha ao registrar comentário da mudança de fluxo."));
}

export async function listCompanyHistory({ companyId = "", eventName = "", limit = 120 } = {}) {
  const supabase = ensureSupabase();
  const safeLimit = Number.isFinite(limit) ? Math.max(10, Math.min(300, Math.floor(limit))) : 120;

  let query = supabase
    .from("event_log")
    .select("id,entity_id,event_name,payload,happened_at")
    .eq("entity_type", "company")
    .order("happened_at", { ascending: false })
    .limit(safeLimit);

  if (companyId) {
    query = query.eq("entity_id", companyId);
  }
  if (eventName) {
    query = query.eq("event_name", eventName);
  }

  const { data, error } = await query;
  if (error) throw new Error(normalizeError(error, "Falha ao listar histórico do cliente."));
  return data || [];
}

export async function listCompanyOpportunities(companyId) {
  if (!companyId) return [];
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("opportunities")
    .select("id,title,stage,status,estimated_value,expected_close_date,created_at,updated_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) throw new Error(normalizeError(error, "Falha ao listar propostas do cliente."));
  return data || [];
}

export async function listCompanyOpportunityStageHistory(companyId) {
  if (!companyId) return [];
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("opportunity_stage_history")
    .select("id,opportunity_id,from_stage,to_stage,changed_at,opportunities!inner(id,title,company_id)")
    .eq("opportunities.company_id", companyId)
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(normalizeError(error, "Falha ao listar histórico de etapas das propostas."));
  return data || [];
}

export async function listCompanyTasks(companyId) {
  if (!companyId) return [];
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id,title,task_type,priority,status,due_date,scheduled_start_at,scheduled_end_at,description,completed_at,visit_checkin_at,visit_checkin_latitude,visit_checkin_longitude,visit_checkin_accuracy_meters,visit_checkin_distance_meters,visit_checkin_method,visit_checkin_note,visit_checkout_at,visit_checkout_note,meeting_provider,meeting_external_id,meeting_join_url,meeting_start_at,meeting_end_at,meeting_attendees,meeting_status,meeting_last_sent_at,created_at,updated_at"
    )
    .eq("company_id", companyId)
    .order("scheduled_start_at", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(normalizeError(error, "Falha ao listar tarefas do cliente."));
  return data || [];
}

export async function listCompanyContacts(companyId) {
  if (!companyId) return [];
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("contacts")
    .select("id,full_name,email,phone,whatsapp,birth_date,role_title,is_primary")
    .eq("company_id", companyId)
    .order("is_primary", { ascending: false })
    .order("full_name", { ascending: true })
    .limit(300);
  if (error) throw new Error(normalizeError(error, "Falha ao listar contatos do cliente."));
  return (data || []).map((item) => ({
    ...item,
    phone: formatBrazilPhone(item.phone),
    whatsapp: formatBrazilPhone(item.whatsapp)
  }));
}

export async function listCompanyInteractions(companyId) {
  if (!companyId) return [];
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("company_interactions")
    .select(
      "id,company_id,contact_id,interaction_type,direction,subject,content,whatsapp_number,phone_number,occurred_at,provider,provider_conversation_id,provider_call_id,recording_url,created_at,contacts:contact_id(full_name,whatsapp,phone)"
    )
    .eq("company_id", companyId)
    .order("occurred_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(normalizeError(error, "Falha ao listar interações do cliente."));
  return (data || []).map((item) => ({
    ...item,
    whatsapp_number: formatBrazilPhone(item.whatsapp_number),
    phone_number: formatBrazilPhone(item.phone_number),
    contacts: item.contacts
      ? {
          ...item.contacts,
          phone: formatBrazilPhone(item.contacts.phone),
          whatsapp: formatBrazilPhone(item.contacts.whatsapp)
        }
      : item.contacts
  }));
}

export async function listCompanyAssets(companyId) {
  const normalizedCompanyId = String(companyId || "").trim();
  if (!normalizedCompanyId) return [];

  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("assets")
    .select(
      "id,company_id,model_name,contract_cost,acquisition_date,serial_number,install_date,location_description,notes,created_at,photos:asset_photos(id,photo_url,storage_path,caption,created_at)"
    )
    .eq("company_id", normalizedCompanyId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(normalizeError(error, "Falha ao listar parque de equipamentos do cliente."));
  return data || [];
}

export async function createCompanyAsset(payload) {
  const supabase = ensureSupabase();
  const contractCostRaw = payload.contract_cost;
  let normalizedContractCost = null;
  if (contractCostRaw !== null && contractCostRaw !== undefined && String(contractCostRaw).trim() !== "") {
    normalizedContractCost = Number(String(contractCostRaw).replace(",", "."));
  }

  const normalizedPayload = {
    company_id: payload.company_id,
    model_name: String(payload.model_name || "").trim(),
    contract_cost: normalizedContractCost,
    acquisition_date: payload.acquisition_date || null,
    serial_number: payload.serial_number || null,
    install_date: payload.install_date || null,
    location_description: payload.location_description || null,
    notes: payload.notes || null
  };

  if (!normalizedPayload.company_id) {
    throw new Error("Selecione um cliente para registrar o equipamento.");
  }
  if (!normalizedPayload.model_name) {
    throw new Error("Informe o modelo do equipamento.");
  }
  if (normalizedPayload.contract_cost !== null && !Number.isFinite(normalizedPayload.contract_cost)) {
    throw new Error("Custo de contrato inválido.");
  }

  const { data, error } = await supabase.from("assets").insert(normalizedPayload).select("id").single();
  if (error) throw new Error(normalizeError(error, "Falha ao cadastrar equipamento no parque do cliente."));
  return data;
}

export async function createCompanyAssetPhoto(payload) {
  const supabase = ensureSupabase();
  const normalizedPayload = {
    asset_id: payload.asset_id,
    photo_url: String(payload.photo_url || "").trim(),
    storage_path: payload.storage_path || null,
    caption: payload.caption || null
  };

  if (!normalizedPayload.asset_id) {
    throw new Error("Equipamento inválido para anexar foto.");
  }
  if (!normalizedPayload.photo_url) {
    throw new Error("Informe a URL da foto do equipamento.");
  }

  const { error } = await supabase.from("asset_photos").insert(normalizedPayload);
  if (error) throw new Error(normalizeError(error, "Falha ao salvar foto do equipamento."));
}

export async function uploadCompanyAssetPhoto({ companyId, assetId, file }) {
  const supabase = ensureSupabase();
  const normalizedCompanyId = String(companyId || "").trim();
  const normalizedAssetId = String(assetId || "").trim();

  if (!normalizedCompanyId || !normalizedAssetId) {
    throw new Error("Cliente/equipamento inválido para upload de foto.");
  }

  const isBrowserFile = typeof File !== "undefined" && file instanceof File;
  if (!isBrowserFile || !file.size) {
    throw new Error("Selecione um arquivo de imagem para upload.");
  }

  const extension = pickImageExtension(file.name, file.type);
  const safeName = normalizeStoragePart(file.name.replace(/\.[^.]+$/, "")) || "equipamento";
  const token = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const storagePath = `${normalizedCompanyId}/${normalizedAssetId}/${token}-${safeName}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("customer-equipment-photos")
    .upload(storagePath, file, { upsert: false, cacheControl: "3600" });

  if (uploadError) throw new Error(normalizeError(uploadError, "Falha ao enviar foto para o storage."));

  const { data } = supabase.storage.from("customer-equipment-photos").getPublicUrl(storagePath);
  const publicUrl = String(data?.publicUrl || "").trim();
  if (!publicUrl) {
    throw new Error("Falha ao obter URL pública da foto enviada.");
  }

  return { publicUrl, storagePath };
}

export async function listCompanySalesOrders(companyId) {
  const normalizedCompanyId = String(companyId || "").trim();
  if (!normalizedCompanyId) return [];

  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("sales_orders")
    .select("id,order_number,order_type,status,total_amount,order_date,source_opportunity_id,created_at")
    .eq("company_id", normalizedCompanyId)
    .order("order_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) throw new Error(normalizeError(error, "Falha ao listar propostas emitidas para o cliente."));
  return data || [];
}

export async function createCompanyInteraction(payload) {
  const supabase = ensureSupabase();
  const normalizedPayload = {
    company_id: payload.company_id,
    contact_id: payload.contact_id || null,
    interaction_type: payload.interaction_type,
    direction: payload.direction || null,
    subject: payload.subject || null,
    content: String(payload.content || "").trim(),
    whatsapp_number: validateBrazilPhoneOrEmpty(payload.whatsapp_number, "WhatsApp da interação"),
    phone_number: validateBrazilPhoneOrEmpty(payload.phone_number, "Telefone da interação"),
    occurred_at: payload.occurred_at || new Date().toISOString(),
    provider: payload.provider || null,
    provider_conversation_id: payload.provider_conversation_id || null,
    provider_call_id: payload.provider_call_id || null,
    recording_url: payload.recording_url || null
  };

  if (!normalizedPayload.company_id) {
    throw new Error("Selecione o cliente para registrar a interação.");
  }
  if (!normalizedPayload.content) {
    throw new Error("Descreva a conversa/interação com o cliente.");
  }

  const { error } = await supabase.from("company_interactions").insert(normalizedPayload);
  if (error) throw new Error(normalizeError(error, "Falha ao registrar interação do cliente."));
}

export async function listOrders() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("sales_orders")
    .select("id,order_number,order_type,status,total_amount,order_date,companies:company_id(trade_name),items:sales_order_items(item_description)")
    .order("order_date", { ascending: false })
    .limit(30);
  if (error) throw new Error(normalizeError(error, "Falha ao listar pedidos."));
  return data || [];
}

export async function createOrder(payload) {
  const supabase = ensureSupabase();
  const orderPayload = { ...payload };
  const orderItems = Array.isArray(orderPayload.items) ? orderPayload.items : [];
  delete orderPayload.items;

  const { data, error } = await supabase
    .from("sales_orders")
    .insert(orderPayload)
    .select("id,source_opportunity_id,order_number,order_type,status,total_amount,order_date")
    .single();
  if (error) throw new Error(normalizeError(error, "Falha ao criar pedido."));

  const normalizedItems = orderItems
    .map((item) => ({
      sales_order_id: data.id,
      item_description: String(item.item_description || "").trim(),
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.unit_price || 0)
    }))
    .filter((item) => item.item_description);

  if (normalizedItems.length) {
    const { error: itemError } = await supabase.from("sales_order_items").insert(normalizedItems);
    if (itemError) throw new Error(normalizeError(itemError, "Falha ao criar itens do pedido."));
  }

  return data;
}

export async function findOrderByOpportunity(opportunityId) {
  const normalizedOpportunityId = String(opportunityId || "").trim();
  if (!normalizedOpportunityId) return null;

  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("sales_orders")
    .select("id,source_opportunity_id,order_number,order_type,status,total_amount,order_date,created_at")
    .eq("source_opportunity_id", normalizedOpportunityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(normalizeError(error, "Falha ao consultar proposta vinculada à oportunidade."));
  return data || null;
}

export async function listLatestOrdersByOpportunity(opportunityIds = []) {
  const normalizedIds = [...new Set(opportunityIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!normalizedIds.length) return [];

  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("sales_orders")
    .select("id,source_opportunity_id,order_number,order_type,status,total_amount,order_date,created_at")
    .in("source_opportunity_id", normalizedIds)
    .order("created_at", { ascending: false });

  if (error) throw new Error(normalizeError(error, "Falha ao buscar propostas vinculadas às oportunidades."));

  const latestByOpportunity = {};
  for (const row of data || []) {
    if (!row?.source_opportunity_id) continue;
    if (latestByOpportunity[row.source_opportunity_id]) continue;
    latestByOpportunity[row.source_opportunity_id] = row;
  }

  return Object.values(latestByOpportunity);
}

export async function createAutomatedProposalFromOpportunity(opportunity) {
  const opportunityId = String(opportunity?.id || "").trim();
  if (!opportunityId) throw new Error("Oportunidade inválida para gerar proposta.");

  const companyId = String(opportunity?.company_id || "").trim();
  if (!companyId) throw new Error("A oportunidade precisa estar vinculada a um cliente.");

  const existingOrder = await findOrderByOpportunity(opportunityId);
  if (existingOrder) {
    return { ...existingOrder, already_exists: true };
  }

  const parsedTitle = parseOpportunityTitle(opportunity?.title || "");
  const fallbackAmount = resolveEstimatedValueByProduct(parsedTitle.title_subcategory, parsedTitle.title_product);
  const totalAmount = Number(opportunity?.estimated_value ?? fallbackAmount ?? 0);
  const safeTotalAmount = Number.isFinite(totalAmount) && totalAmount >= 0 ? totalAmount : 0;

  const itemDescription = parsedTitle.title_subcategory && parsedTitle.title_product
    ? `${parsedTitle.title_subcategory} > ${parsedTitle.title_product}`
    : String(opportunity?.title || "Proposta comercial").trim() || "Proposta comercial";

  const baseOrderPayload = {
    company_id: companyId,
    source_opportunity_id: opportunityId,
    order_type: parsedTitle.opportunity_type || "equipment",
    status: "pending",
    total_amount: safeTotalAmount,
    order_date: new Date().toISOString().slice(0, 10),
    items: [
      {
        item_description: itemDescription,
        quantity: 1,
        unit_price: safeTotalAmount
      }
    ]
  };

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const createdOrder = await createOrder({
        ...baseOrderPayload,
        order_number: buildProposalOrderNumber(opportunityId)
      });
      return { ...createdOrder, already_exists: false };
    } catch (error) {
      lastError = error;
      if (!isOrderNumberConflict(error)) throw error;
    }
  }

  throw lastError || new Error("Falha ao gerar proposta automática.");
}

async function resequenceCompanyLifecycleStages(supabase) {
  const { data, error } = await supabase
    .from("company_lifecycle_stages")
    .select("id,stage_order")
    .order("stage_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(normalizeError(error, "Falha ao reorganizar fases do ciclo de vida."));

  const rows = data || [];
  const updates = rows
    .map((row, index) => ({ id: row.id, stage_order: index + 1 }))
    .filter((row, index) => Number(rows[index]?.stage_order) !== row.stage_order);

  if (!updates.length) return;

  const results = await Promise.all(
    updates.map((row) =>
      supabase.from("company_lifecycle_stages").update({ stage_order: row.stage_order }).eq("id", row.id)
    )
  );
  const failed = results.find((item) => item.error);
  if (failed?.error) {
    throw new Error(normalizeError(failed.error, "Falha ao salvar ordenação das fases do ciclo de vida."));
  }
}

export async function listCompanyLifecycleStages({ includeInactive = true } = {}) {
  const supabase = ensureSupabase();

  let stageQuery = supabase
    .from("company_lifecycle_stages")
    .select("id,name,stage_order,is_active,created_at,updated_at")
    .order("stage_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeInactive) {
    stageQuery = stageQuery.eq("is_active", true);
  }

  const [stagesRes, companiesRes] = await Promise.all([
    stageQuery,
    supabase.from("companies").select("lifecycle_stage_id").not("lifecycle_stage_id", "is", null)
  ]);

  if (stagesRes.error) {
    throw new Error(normalizeError(stagesRes.error, "Falha ao listar fases do ciclo de vida."));
  }
  if (companiesRes.error) {
    throw new Error(normalizeError(companiesRes.error, "Falha ao contabilizar empresas no ciclo de vida."));
  }

  const linkedCountByStage = (companiesRes.data || []).reduce((acc, row) => {
    const stageId = String(row.lifecycle_stage_id || "").trim();
    if (!stageId) return acc;
    acc[stageId] = (acc[stageId] || 0) + 1;
    return acc;
  }, {});

  return (stagesRes.data || []).map((stage) => ({
    ...stage,
    linked_companies_count: linkedCountByStage[stage.id] || 0
  }));
}

export async function createCompanyLifecycleStage(payload) {
  const supabase = ensureSupabase();
  const name = normalizeLifecycleStageName(payload?.name);
  if (!name) throw new Error("Informe o nome da fase do ciclo de vida.");

  const { data: lastRow, error: lastError } = await supabase
    .from("company_lifecycle_stages")
    .select("stage_order")
    .order("stage_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw new Error(normalizeError(lastError, "Falha ao calcular posição da nova fase."));

  const nextOrder = Math.max(1, Number(lastRow?.stage_order || 0) + 1);
  const { data, error } = await supabase
    .from("company_lifecycle_stages")
    .insert({
      name,
      stage_order: nextOrder,
      is_active: payload?.is_active !== false
    })
    .select("id")
    .single();

  if (error) {
    const message = String(error.message || "");
    if (message.includes("idx_company_lifecycle_stages_name_unique")) {
      throw new Error("Já existe uma fase com esse nome no ciclo de vida.");
    }
    throw new Error(normalizeError(error, "Falha ao criar fase do ciclo de vida."));
  }

  return data;
}

export async function updateCompanyLifecycleStage(stageId, payload) {
  const normalizedStageId = String(stageId || "").trim();
  if (!normalizedStageId) throw new Error("Fase inválida para atualização.");

  const supabase = ensureSupabase();
  const updatePayload = {};

  if (Object.prototype.hasOwnProperty.call(payload || {}, "name")) {
    const normalizedName = normalizeLifecycleStageName(payload?.name);
    if (!normalizedName) throw new Error("Informe o nome da fase do ciclo de vida.");
    updatePayload.name = normalizedName;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, "is_active")) {
    updatePayload.is_active = Boolean(payload?.is_active);
  }

  if (!Object.keys(updatePayload).length) return;

  const { error } = await supabase
    .from("company_lifecycle_stages")
    .update(updatePayload)
    .eq("id", normalizedStageId);

  if (error) {
    const message = String(error.message || "");
    if (message.includes("idx_company_lifecycle_stages_name_unique")) {
      throw new Error("Já existe uma fase com esse nome no ciclo de vida.");
    }
    throw new Error(normalizeError(error, "Falha ao atualizar fase do ciclo de vida."));
  }
}

export async function saveCompanyLifecycleStageOrder(stageIds) {
  const supabase = ensureSupabase();
  const orderedIds = Array.from(new Set((stageIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  if (!orderedIds.length) return;

  const { data, error } = await supabase
    .from("company_lifecycle_stages")
    .select("id")
    .order("stage_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(normalizeError(error, "Falha ao validar ordenação do ciclo de vida."));

  const existingIds = (data || []).map((row) => row.id);
  if (existingIds.length !== orderedIds.length) {
    throw new Error("Ordenação inválida das fases do ciclo de vida.");
  }
  const orderedSet = new Set(orderedIds);
  if (existingIds.some((id) => !orderedSet.has(id))) {
    throw new Error("Ordenação inválida das fases do ciclo de vida.");
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("company_lifecycle_stages").update({ stage_order: index + 1 }).eq("id", id)
    )
  );
  const failed = results.find((item) => item.error);
  if (failed?.error) {
    throw new Error(normalizeError(failed.error, "Falha ao salvar ordenação do ciclo de vida."));
  }

  await resequenceCompanyLifecycleStages(supabase);
}

export async function deleteCompanyLifecycleStage(stageId) {
  const normalizedStageId = String(stageId || "").trim();
  if (!normalizedStageId) throw new Error("Fase inválida para exclusão.");

  const supabase = ensureSupabase();
  const { count, error: countError } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("lifecycle_stage_id", normalizedStageId);
  if (countError) throw new Error(normalizeError(countError, "Falha ao validar vínculos da fase."));
  if ((count || 0) > 0) {
    throw new Error("Não é possível excluir a fase porque há empresas vinculadas.");
  }

  const { error } = await supabase.from("company_lifecycle_stages").delete().eq("id", normalizedStageId);
  if (error) throw new Error(normalizeError(error, "Falha ao excluir fase do ciclo de vida."));

  await resequenceCompanyLifecycleStages(supabase);
}

export async function syncOmieCustomers(payload) {
  const supabase = ensureSupabase();
  const body = asObject(payload);

  const { data, error } = await supabase.functions.invoke("omie-sync-customers-public-v3", {
    body
  });

  if (error) {
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("non-2xx")) {
      throw new Error(
        "A sincronização OMIE excedeu o tempo limite deste lote. O sistema fará nova tentativa em lotes menores."
      );
    }
    throw new Error(normalizeError(error, "Falha ao iniciar sincronização OMIE de clientes."));
  }
  if (data?.error) {
    throw new Error(String(data.message || data.error || "Falha na sincronização OMIE de clientes."));
  }
  return data || {};
}

export async function listOmieCustomerSyncJobs(limit = 12) {
  const supabase = ensureSupabase();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 12;

  const { data, error } = await supabase
    .from("sync_jobs")
    .select("id,status,started_at,finished_at,error_message,result,created_at")
    .eq("provider", "omie")
    .eq("resource", "clientes")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(normalizeError(error, "Falha ao listar histórico de sincronização OMIE."));
  return data || [];
}

export async function listCompanyOptions() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase.from("companies").select("id,trade_name").order("trade_name", { ascending: true });
  if (error) throw new Error(normalizeError(error, "Falha ao listar empresas para seleção."));
  return data || [];
}

export async function searchGlobalRecords(term) {
  const supabase = ensureSupabase();
  const normalized = normalizeSearchTerm(term);
  if (!normalized || normalized.length < 2) return [];

  const pattern = `%${normalized}%`;

  const [companiesRes, contactsRes, opportunitiesRes, ordersRes, ticketsRes, tasksRes] = await Promise.all([
    supabase
      .from("companies")
      .select("id,trade_name,cnpj")
      .or(`trade_name.ilike.${pattern},legal_name.ilike.${pattern},cnpj.ilike.${pattern}`)
      .limit(5),
    supabase
      .from("contacts")
      .select("id,company_id,full_name,email,companies:company_id(trade_name)")
      .or(`full_name.ilike.${pattern},email.ilike.${pattern},whatsapp.ilike.${pattern}`)
      .limit(5),
    supabase
      .from("opportunities")
      .select("id,title,stage,companies:company_id(trade_name)")
      .or(`title.ilike.${pattern},stage.ilike.${pattern}`)
      .limit(5),
    supabase
      .from("sales_orders")
      .select("id,order_number,status,companies:company_id(trade_name)")
      .or(`order_number.ilike.${pattern},status.ilike.${pattern}`)
      .limit(5),
    supabase
      .from("service_tickets")
      .select("id,description,status,companies:company_id(trade_name)")
      .or(`description.ilike.${pattern},status.ilike.${pattern}`)
      .limit(5),
    supabase
      .from("tasks")
      .select("id,title,status,task_type,companies:company_id(trade_name)")
      .or(`title.ilike.${pattern},description.ilike.${pattern},status.ilike.${pattern}`)
      .limit(5)
  ]);

  if (companiesRes.error) throw new Error(normalizeError(companiesRes.error, "Falha na busca global (empresas)."));
  if (contactsRes.error) throw new Error(normalizeError(contactsRes.error, "Falha na busca global (contatos)."));
  if (opportunitiesRes.error) throw new Error(normalizeError(opportunitiesRes.error, "Falha na busca global (pipeline)."));
  if (ordersRes.error) throw new Error(normalizeError(ordersRes.error, "Falha na busca global (pedidos)."));
  if (ticketsRes.error) throw new Error(normalizeError(ticketsRes.error, "Falha na busca global (assistência)."));
  if (tasksRes.error) throw new Error(normalizeError(tasksRes.error, "Falha na busca global (tarefas)."));

  const mappedCompanies = (companiesRes.data || []).map((item) => ({
    id: `company-${item.id}`,
    entity_type: "company",
    company_id: item.id,
    company_name: item.trade_name || "Empresa",
    type: "Empresa",
    title: item.trade_name || "Empresa",
    subtitle: item.cnpj ? `CNPJ ${item.cnpj}` : "Sem CNPJ",
    tab: "companies"
  }));

  const mappedContacts = (contactsRes.data || []).map((item) => ({
    id: `contact-${item.id}`,
    entity_type: "contact",
    contact_id: item.id,
    company_id: item.company_id || null,
    company_name: item.companies?.trade_name || "",
    type: "Contato",
    title: item.full_name || "Contato",
    subtitle: item.companies?.trade_name || "Sem vínculo com empresa",
    tab: "companies"
  }));

  const mappedOpportunities = (opportunitiesRes.data || []).map((item) => ({
    id: `opportunity-${item.id}`,
    entity_type: "opportunity",
    type: "Pipeline",
    title: item.title || "Oportunidade",
    subtitle: item.companies?.trade_name || "Sem empresa",
    tab: "pipeline"
  }));

  const mappedOrders = (ordersRes.data || []).map((item) => ({
    id: `order-${item.id}`,
    entity_type: "order",
    type: "Pedido",
    title: item.order_number || "Pedido",
    subtitle: item.companies?.trade_name || "Sem empresa",
    tab: "orders"
  }));

  const mappedTickets = (ticketsRes.data || []).map((item) => ({
    id: `ticket-${item.id}`,
    entity_type: "ticket",
    type: "Assistência",
    title: item.description || "Chamado técnico",
    subtitle: item.companies?.trade_name || "Sem empresa",
    tab: "service"
  }));

  const mappedTasks = (tasksRes.data || []).map((item) => ({
    id: `task-${item.id}`,
    entity_type: "task",
    type: "Tarefa",
    title: item.title || "Tarefa",
    subtitle: item.companies?.trade_name || "Sem empresa",
    tab: "tasks"
  }));

  return [
    ...mappedCompanies,
    ...mappedContacts,
    ...mappedOpportunities,
    ...mappedOrders,
    ...mappedTickets,
    ...mappedTasks
  ];
}
