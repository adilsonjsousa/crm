import { ensureSupabase } from "./supabase";
import { PIPELINE_STAGES, sortByStageOrder, stageStatus } from "./pipelineStages";
import { parseOpportunityTitle, resolveEstimatedValueByProduct } from "./productCatalog";
import { formatBrazilPhone, toWhatsAppBrazilNumber, validateBrazilPhoneOrEmpty } from "./phone";

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

function formatCnpj(value) {
  const digits = cleanDigits(value);
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
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

const CRM_ACCESS_MODULES = ["dashboard", "pipeline", "companies", "contacts", "tasks", "reports", "settings"];
const CRM_ACCESS_LEVELS = ["none", "read", "edit", "admin"];
const OMIE_CUSTOMERS_STORAGE_KEY = "crm.settings.omie.customers.v1";
const CRM_ROLE_DEFAULT_PERMISSIONS = {
  admin: {
    dashboard: "admin",
    pipeline: "admin",
    companies: "admin",
    contacts: "admin",
    tasks: "admin",
    reports: "admin",
    settings: "admin"
  },
  manager: {
    dashboard: "admin",
    pipeline: "admin",
    companies: "admin",
    contacts: "admin",
    tasks: "admin",
    reports: "admin",
    settings: "read"
  },
  sales: {
    dashboard: "read",
    pipeline: "edit",
    companies: "edit",
    contacts: "edit",
    tasks: "edit",
    reports: "read",
    settings: "none"
  },
  backoffice: {
    dashboard: "read",
    pipeline: "read",
    companies: "edit",
    contacts: "edit",
    tasks: "edit",
    reports: "edit",
    settings: "none"
  }
};

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

function normalizeUserRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "manager" || normalized === "sales" || normalized === "backoffice") {
    return normalized;
  }
  return "sales";
}

function normalizeUserStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "active" || normalized === "inactive") return normalized;
  return "active";
}

function normalizeUserFullName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeUserEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUserWhatsApp(value) {
  return validateBrazilPhoneOrEmpty(value, "WhatsApp");
}

function sanitizeUserPermissions(value, role = "sales") {
  const normalizedRole = normalizeUserRole(role);
  const fallback = CRM_ROLE_DEFAULT_PERMISSIONS[normalizedRole] || CRM_ROLE_DEFAULT_PERMISSIONS.sales;
  const source = asObject(value);
  const next = {};

  for (const moduleId of CRM_ACCESS_MODULES) {
    const level = String(source[moduleId] || fallback[moduleId] || "none")
      .trim()
      .toLowerCase();
    next[moduleId] = CRM_ACCESS_LEVELS.includes(level) ? level : fallback[moduleId] || "none";
  }

  return next;
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
  const normalized = cleanDigits(cnpj);
  if (normalized.length !== 14) return null;
  const masked = formatCnpj(normalized);
  const cnpjCandidates = Array.from(new Set([normalized, masked].filter(Boolean)));
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("companies")
    .select("id,trade_name,cnpj")
    .in("cnpj", cnpjCandidates)
    .limit(1);

  if (error) throw new Error(normalizeError(error, "Falha ao validar CNPJ na base."));
  return Array.isArray(data) ? data[0] || null : null;
}

export async function lookupCompanyDataByCnpj(cnpj) {
  const normalized = cleanDigits(cnpj);
  if (normalized.length !== 14) return null;

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${normalized}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Falha ao consultar dados públicos do CNPJ.");

  const payload = await response.json();
  const uf = String(payload.uf || "")
    .trim()
    .toUpperCase();
  const city = String(payload.municipio || "")
    .trim()
    .toUpperCase();
  const address = joinAddress([
    String(payload.logradouro || "")
      .trim()
      .toUpperCase(),
    String(payload.numero || "")
      .trim()
      .toUpperCase(),
    String(payload.complemento || "")
      .trim()
      .toUpperCase(),
    String(payload.bairro || "")
      .trim()
      .toUpperCase(),
    city ? `${city}${uf ? ` (${uf})` : ""}` : "",
    uf,
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

export async function listOpportunities(options = {}) {
  const supabase = ensureSupabase();
  const viewerUserId = String(options?.viewerUserId || "").trim();
  const viewerRole = normalizeUserRole(options?.viewerRole);
  const canViewAll = viewerRole === "admin" || viewerRole === "manager";

  let query = supabase
    .from("opportunities")
    .select(
      "id,company_id,owner_user_id,title,stage,status,estimated_value,expected_close_date,created_at,companies:company_id(trade_name,email,phone)"
    );

  if (viewerUserId && !canViewAll) {
    query = query.eq("owner_user_id", viewerUserId);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(30);
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

export async function createOpportunity(payload, options = {}) {
  const supabase = ensureSupabase();
  const fallbackOwnerUserId = String(options?.ownerUserId || "").trim();
  const normalizedPayload = {
    ...payload,
    owner_user_id: String(payload?.owner_user_id || "").trim() || fallbackOwnerUserId || null
  };

  const { error } = await supabase.from("opportunities").insert(normalizedPayload);
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
      "id,company_id,title,task_type,priority,status,due_date,scheduled_start_at,scheduled_end_at,description,completed_at,visit_checkin_at,visit_checkin_latitude,visit_checkin_longitude,visit_checkin_accuracy_meters,visit_checkin_distance_meters,visit_checkin_method,visit_checkin_note,visit_checkout_at,visit_checkout_note,meeting_provider,meeting_external_id,meeting_join_url,meeting_start_at,meeting_end_at,meeting_attendees,meeting_status,meeting_last_sent_at,assignee_user_id,created_by_user_id,created_at,companies:company_id(trade_name,email,address_full,checkin_validation_mode,checkin_radius_meters,checkin_latitude,checkin_longitude,checkin_pin),assignee:app_users!tasks_assignee_user_id_fkey(user_id,full_name,email,whatsapp,role,status),creator:app_users!tasks_created_by_user_id_fkey(user_id,full_name,email,whatsapp,role,status)"
    )
    .order("scheduled_start_at", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(160);
  if (error) throw new Error(normalizeError(error, "Falha ao listar tarefas."));
  return data || [];
}

export async function listTaskScheduleConflicts({
  assigneeUserId = "",
  scheduledStartAt = "",
  scheduledEndAt = "",
  ignoreTaskId = "",
  limit = 80
} = {}) {
  const normalizedAssignee = String(assigneeUserId || "").trim();
  if (!normalizedAssignee) return [];

  const startDate = new Date(String(scheduledStartAt || "").trim());
  if (Number.isNaN(startDate.getTime())) {
    throw new Error("Agendamento inicial inválido para validar conflito.");
  }

  const endRaw = String(scheduledEndAt || "").trim();
  const endDate = endRaw ? new Date(endRaw) : new Date(startDate.getTime() + 30 * 60 * 1000);
  if (Number.isNaN(endDate.getTime())) {
    throw new Error("Agendamento final inválido para validar conflito.");
  }
  if (endDate.getTime() < startDate.getTime()) {
    throw new Error("O agendamento final não pode ser anterior ao início.");
  }

  const queryWindowStart = new Date(startDate.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const queryWindowEnd = new Date(endDate.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const supabase = ensureSupabase();
  const safeLimit = Number.isFinite(limit) ? Math.max(10, Math.min(300, Math.floor(limit))) : 80;
  let query = supabase
    .from("tasks")
    .select("id,title,status,scheduled_start_at,scheduled_end_at,company_id,companies:company_id(trade_name)")
    .eq("assignee_user_id", normalizedAssignee)
    .not("status", "in", "(done,cancelled)")
    .not("scheduled_start_at", "is", null)
    .gte("scheduled_start_at", queryWindowStart)
    .lte("scheduled_start_at", queryWindowEnd)
    .order("scheduled_start_at", { ascending: true })
    .limit(safeLimit);

  const normalizedIgnoreTaskId = String(ignoreTaskId || "").trim();
  if (normalizedIgnoreTaskId) {
    query = query.neq("id", normalizedIgnoreTaskId);
  }

  const { data, error } = await query;
  if (error) throw new Error(normalizeError(error, "Falha ao validar conflito na agenda."));

  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  return (data || []).filter((item) => {
    const rowStart = new Date(item.scheduled_start_at).getTime();
    const rowEnd = item.scheduled_end_at ? new Date(item.scheduled_end_at).getTime() : rowStart + 30 * 60 * 1000;
    if (!Number.isFinite(rowStart) || !Number.isFinite(rowEnd)) return false;
    return rowStart <= endMs && rowEnd >= startMs;
  });
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

export async function sendWhatsAppMessage(payload) {
  const phone = toWhatsAppBrazilNumber(payload?.phone);
  const message = String(payload?.message || "").trim();

  if (!phone) throw new Error("WhatsApp inválido para envio.");
  if (!message) throw new Error("Mensagem de WhatsApp vazia.");

  const supabase = ensureSupabase();
  const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
    body: {
      phone,
      message,
      metadata: payload?.metadata || {}
    }
  });

  if (error) {
    throw new Error(normalizeError(error, "Falha ao enviar WhatsApp."));
  }

  const safeData = asObject(data);
  if (safeData.error) {
    throw new Error(String(safeData.message || safeData.error || "Falha ao enviar WhatsApp."));
  }

  return {
    provider: String(safeData.provider || ""),
    phone: String(safeData.phone || phone),
    status: String(safeData.status || "queued")
  };
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

export async function syncRdStationCrm(payload) {
  const supabase = ensureSupabase();
  const body = asObject(payload);

  const { data, error } = await supabase.functions.invoke("rdstation-sync-crm-public", {
    body
  });

  if (error) {
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("non-2xx")) {
      throw new Error(
        "A sincronização RD Station excedeu o tempo limite deste lote. O sistema fará nova tentativa em lotes menores."
      );
    }
    throw new Error(normalizeError(error, "Falha ao iniciar sincronização RD Station."));
  }
  if (data?.error) {
    throw new Error(String(data.message || data.error || "Falha na sincronização RD Station."));
  }
  return data || {};
}

function readOmieCredentialsFromLocalStorage() {
  if (typeof window === "undefined") {
    return { appKey: "", appSecret: "" };
  }

  try {
    const raw = window.localStorage.getItem(OMIE_CUSTOMERS_STORAGE_KEY);
    const parsed = asObject(raw ? JSON.parse(raw) : {});
    return {
      appKey: String(parsed.app_key || "").trim(),
      appSecret: String(parsed.app_secret || "").trim()
    };
  } catch {
    return { appKey: "", appSecret: "" };
  }
}

async function invokeOmieReceivablesWithFallback(supabase, body) {
  const functionNames = [
    "omie-customer-receivables-public",
    "omie-customer-receivables-public-v3",
    "omie-customer-receivables-public-v2",
  ];
  let lastResult = null;

  for (const functionName of functionNames) {
    const result = await supabase.functions.invoke(functionName, { body });
    if (!result?.error) return result;

    lastResult = result;
    const message = normalizeError(result.error, "");
    const functionNotFound = /function.*not found|not found|404/i.test(message);
    if (!functionNotFound) return result;
  }

  return lastResult || { data: null, error: { message: "Falha ao consultar contas a receber no OMIE." } };
}

function isEdgeFunctionNon2xx(errorLike) {
  const message = normalizeError(errorLike, "");
  return /non-2xx/i.test(message);
}

function buildReducedOmieLookupBody(body) {
  const currentRecordsPerPage = Number(body?.records_per_page) || 100;
  const currentMaxPages = Number(body?.max_pages) || 60;
  return {
    ...body,
    records_per_page: Math.max(20, Math.min(50, currentRecordsPerPage)),
    max_pages: Math.max(5, Math.min(20, currentMaxPages))
  };
}

async function invokeOmiePurchasesWithRetry(supabase, body) {
  const firstAttempt = await supabase.functions.invoke("omie-customer-purchases-public", { body });
  if (!firstAttempt?.error) return firstAttempt;

  if (!isEdgeFunctionNon2xx(firstAttempt.error)) {
    return firstAttempt;
  }

  const secondAttempt = await supabase.functions.invoke("omie-customer-purchases-public", {
    body: buildReducedOmieLookupBody(body)
  });
  return secondAttempt?.error ? firstAttempt : secondAttempt;
}

function resolveOmieLookupContext(company, options = {}, defaults = {}) {
  const companyData = asObject(company);
  const cnpjDigits = cleanDigits(companyData.cnpj || options.cnpj || "");

  if (cnpjDigits.length !== 14) {
    throw new Error("Cliente sem CNPJ valido para consultar historico de compras no OMIE.");
  }

  const { appKey, appSecret } = readOmieCredentialsFromLocalStorage();
  if (!appKey || !appSecret) {
    throw new Error("Credenciais OMIE nao encontradas neste navegador. Preencha App Key e App Secret em Configuracoes.");
  }

  const defaultRecordsPerPage = Number(defaults.records_per_page) > 0 ? Number(defaults.records_per_page) : 100;
  const defaultMaxPages = Number(defaults.max_pages) > 0 ? Number(defaults.max_pages) : 60;
  const body = {
    app_key: appKey,
    app_secret: appSecret,
    cnpj_cpf: cnpjDigits,
    records_per_page: Number(options.records_per_page) > 0 ? Number(options.records_per_page) : defaultRecordsPerPage,
    max_pages: Number(options.max_pages) > 0 ? Number(options.max_pages) : defaultMaxPages
  };

  return { cnpjDigits, body, supabase: ensureSupabase() };
}

export async function listCompanyOmiePurchases(company, options = {}) {
  const { cnpjDigits, body, supabase } = resolveOmieLookupContext(company, options, {
    records_per_page: 100,
    max_pages: 60
  });

  const { data, error } = await invokeOmiePurchasesWithRetry(supabase, body);
  if (error) {
    if (isEdgeFunctionNon2xx(error)) {
      throw new Error("A consulta de compras OMIE ficou instavel neste lote. Tente novamente em alguns segundos.");
    }
    throw new Error(normalizeError(error, "Falha ao consultar historico de compras no OMIE."));
  }

  const purchasesData = asObject(data);
  if (purchasesData.error) {
    throw new Error(String(purchasesData.message || purchasesData.error || "Falha ao consultar historico de compras no OMIE."));
  }

  const purchaseWarnings = Array.isArray(purchasesData.warnings) ? purchasesData.warnings.map((item) => String(item || "")) : [];
  return {
    cnpj: String(purchasesData.cnpj || cnpjDigits),
    customer: asObject(purchasesData.customer),
    summary: asObject(purchasesData.summary),
    orders: Array.isArray(purchasesData.orders) ? purchasesData.orders : [],
    purchase_warnings: purchaseWarnings,
    warnings: purchaseWarnings
  };
}

export async function listCompanyOmieReceivables(company, options = {}) {
  const { cnpjDigits, body, supabase } = resolveOmieLookupContext(company, options, {
    records_per_page: 500,
    max_pages: 30
  });

  const concurrency = Number(options.page_concurrency);
  const requestBody = {
    ...body,
    page_concurrency: Number.isFinite(concurrency) && concurrency > 0 ? Math.min(8, Math.max(1, Math.floor(concurrency))) : 4
  };

  const payload = await invokeOmieReceivablesWithFallback(supabase, requestBody);
  if (payload?.error) {
    throw new Error(normalizeError(payload.error, "Falha ao consultar contas a receber no OMIE."));
  }

  const receivablesData = asObject(payload?.data);
  if (receivablesData.error) {
    throw new Error(String(receivablesData.message || receivablesData.error || "Falha ao consultar contas a receber no OMIE."));
  }

  const receivablesWarnings = Array.isArray(receivablesData.warnings)
    ? receivablesData.warnings.map((item) => String(item || ""))
    : [];
  return {
    cnpj: String(receivablesData.cnpj || cnpjDigits),
    customer: asObject(receivablesData.customer),
    receivables_summary: asObject(receivablesData.receivables_summary),
    receivables: Array.isArray(receivablesData.receivables) ? receivablesData.receivables : [],
    receivables_warnings: receivablesWarnings,
    warnings: receivablesWarnings
  };
}

export async function listCompanyOmiePurchaseHistory(company, options = {}) {
  const [purchasesResult, receivablesResult] = await Promise.allSettled([
    listCompanyOmiePurchases(company, options),
    listCompanyOmieReceivables(company, options)
  ]);

  if (purchasesResult.status !== "fulfilled") {
    const message = purchasesResult.reason instanceof Error ? purchasesResult.reason.message : "Falha ao consultar historico de compras no OMIE.";
    throw new Error(message);
  }

  const purchasesData = purchasesResult.value || {};
  let receivablesSummary = asObject({});
  let receivablesRows = [];
  let receivablesWarnings = [];

  if (receivablesResult.status === "fulfilled") {
    const receivablesData = receivablesResult.value || {};
    receivablesSummary = asObject(receivablesData.receivables_summary);
    receivablesRows = Array.isArray(receivablesData.receivables) ? receivablesData.receivables : [];
    receivablesWarnings = Array.isArray(receivablesData.receivables_warnings)
      ? receivablesData.receivables_warnings.map((item) => String(item || ""))
      : [];
  } else {
    const fallbackMessage =
      receivablesResult.reason instanceof Error ? receivablesResult.reason.message : "Falha ao consultar contas a receber no OMIE.";
    receivablesWarnings.push(fallbackMessage);
  }

  const purchaseWarnings = Array.isArray(purchasesData.purchase_warnings)
    ? purchasesData.purchase_warnings.map((item) => String(item || ""))
    : [];

  return {
    cnpj: String(purchasesData.cnpj || ""),
    customer: asObject(purchasesData.customer),
    summary: asObject(purchasesData.summary),
    orders: Array.isArray(purchasesData.orders) ? purchasesData.orders : [],
    receivables_summary: receivablesSummary,
    receivables: receivablesRows,
    purchase_warnings: purchaseWarnings,
    receivables_warnings: receivablesWarnings,
    warnings: [...purchaseWarnings, ...receivablesWarnings].filter(Boolean)
  };
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

export async function listRdStationSyncJobs(limit = 12) {
  const supabase = ensureSupabase();
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 12;

  const { data, error } = await supabase
    .from("sync_jobs")
    .select("id,status,started_at,finished_at,error_message,result,created_at")
    .eq("provider", "rdstation")
    .eq("resource", "crm_full")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(normalizeError(error, "Falha ao listar histórico de sincronização RD Station."));
  return data || [];
}

async function invokeManageUsers(action, payload = {}) {
  const supabase = ensureSupabase();
  const { data, error } = await supabase.functions.invoke("manage-users", {
    body: {
      action,
      ...payload
    }
  });

  if (error) throw new Error(normalizeError(error, "Falha ao processar operação de usuários."));
  const safeData = asObject(data);
  if (safeData.error) {
    throw new Error(String(safeData.message || safeData.error || "Falha ao processar operação de usuários."));
  }
  return safeData;
}

export async function listSystemUsers() {
  const result = await invokeManageUsers("list");
  const rows = Array.isArray(result.users) ? result.users : [];
  return rows.map((item) => {
    const safe = asObject(item);
    const role = normalizeUserRole(safe.role);
    return {
      user_id: String(safe.user_id || "").trim(),
      email: normalizeUserEmail(safe.email),
      full_name: normalizeUserFullName(safe.full_name),
      whatsapp: formatBrazilPhone(safe.whatsapp),
      role,
      status: normalizeUserStatus(safe.status),
      permissions: sanitizeUserPermissions(safe.permissions, role),
      invited_at: safe.invited_at || null,
      last_invite_sent_at: safe.last_invite_sent_at || null,
      last_login_at: safe.last_login_at || null,
      created_at: safe.created_at || null,
      updated_at: safe.updated_at || null
    };
  });
}

export async function createSystemUser(payload) {
  const fullName = normalizeUserFullName(payload?.full_name);
  const email = normalizeUserEmail(payload?.email);
  const whatsapp = normalizeUserWhatsApp(payload?.whatsapp);
  const role = normalizeUserRole(payload?.role);
  const status = normalizeUserStatus(payload?.status);

  if (!fullName) throw new Error("Informe o nome completo do usuário.");
  if (!email) throw new Error("Informe o e-mail de login do usuário.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");

  const result = await invokeManageUsers("create", {
    full_name: fullName,
    email,
    whatsapp,
    role,
    status,
    permissions: sanitizeUserPermissions(payload?.permissions, role)
  });

  return {
    user: asObject(result.user),
    delivery: String(result.delivery || ""),
    action_link: String(result.action_link || "")
  };
}

export async function updateSystemUser(userId, payload) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) throw new Error("Usuário inválido para atualização.");

  const role = normalizeUserRole(payload?.role);
  const status = normalizeUserStatus(payload?.status);
  const hasEmail = Object.prototype.hasOwnProperty.call(payload || {}, "email");
  const hasWhatsApp = Object.prototype.hasOwnProperty.call(payload || {}, "whatsapp");
  const updatePayload = {
    user_id: normalizedUserId,
    full_name: normalizeUserFullName(payload?.full_name),
    role,
    status,
    permissions: sanitizeUserPermissions(payload?.permissions, role)
  };

  if (hasWhatsApp) {
    updatePayload.whatsapp = normalizeUserWhatsApp(payload?.whatsapp);
  }

  if (hasEmail) {
    const normalizedEmail = normalizeUserEmail(payload?.email);
    if (!normalizedEmail) throw new Error("Informe o e-mail de login do usuário.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Informe um e-mail válido.");
    updatePayload.email = normalizedEmail;
  }

  if (!updatePayload.full_name) throw new Error("Informe o nome completo do usuário.");

  const result = await invokeManageUsers("update", updatePayload);
  return asObject(result.user);
}

export async function sendSystemUserPasswordReset(payload) {
  const normalizedUserId = String(payload?.user_id || "").trim();
  const email = normalizeUserEmail(payload?.email);
  if (!normalizedUserId && !email) {
    throw new Error("Informe o usuário para enviar o reset de senha.");
  }

  const result = await invokeManageUsers("reset_password", {
    user_id: normalizedUserId || undefined,
    email: email || undefined
  });

  return {
    email: String(result.email || email || ""),
    delivery: String(result.delivery || ""),
    action_link: String(result.action_link || "")
  };
}

export async function listCompanyOptions() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("companies")
    .select("id,trade_name,cnpj")
    .order("trade_name", { ascending: true });
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
    contact_email: item.email || "",
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
