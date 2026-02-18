import { ensureSupabase } from "./supabase";
import { PIPELINE_STAGES, sortByStageOrder, stageStatus } from "./pipelineStages";

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

  const [companiesRes, oppRes, ticketsRes, ordersRes, orderRevenueRes] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("opportunities").select("id", { count: "exact", head: true }),
    supabase.from("service_tickets").select("id", { count: "exact", head: true }).neq("status", "closed"),
    supabase.from("sales_orders").select("id", { count: "exact", head: true }),
    supabase.from("sales_orders").select("total_amount")
  ]);

  if (companiesRes.error) throw new Error(normalizeError(companiesRes.error, "Falha ao buscar empresas."));
  if (oppRes.error) throw new Error(normalizeError(oppRes.error, "Falha ao buscar oportunidades."));
  if (ticketsRes.error) throw new Error(normalizeError(ticketsRes.error, "Falha ao buscar chamados."));
  if (ordersRes.error) throw new Error(normalizeError(ordersRes.error, "Falha ao buscar pedidos."));
  if (orderRevenueRes.error) throw new Error(normalizeError(orderRevenueRes.error, "Falha ao buscar faturamento."));

  const revenue = (orderRevenueRes.data || []).reduce((acc, row) => acc + Number(row.total_amount || 0), 0);

  return {
    companies: companiesRes.count || 0,
    opportunities: oppRes.count || 0,
    openTickets: ticketsRes.count || 0,
    orders: ordersRes.count || 0,
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
  const { data, error } = await supabase.from("companies").select("*").order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error(normalizeError(error, "Falha ao listar empresas."));
  return data || [];
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
    phone: payload.ddd_telefone_1 || payload.ddd_telefone_2 || "",
    address_full: address,
    segmento: inferSegmentoFromCnae(payload.cnae_fiscal_descricao)
  };
}

export async function createCompany(payload) {
  const supabase = ensureSupabase();
  const { data, error } = await supabase.from("companies").insert(payload).select("id").single();
  if (error) throw new Error(normalizeError(error, "Falha ao criar empresa."));
  return data;
}

export async function updateCompany(companyId, payload) {
  const supabase = ensureSupabase();
  const { error } = await supabase.from("companies").update(payload).eq("id", companyId);
  if (error) throw new Error(normalizeError(error, "Falha ao atualizar empresa."));
}

export async function listContacts() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("contacts")
    .select("id,company_id,full_name,email,phone,whatsapp,birth_date,is_primary,companies:company_id(trade_name)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(normalizeError(error, "Falha ao listar contatos."));
  return data || [];
}

export async function listUpcomingBirthdays(daysAhead = 7) {
  const supabase = ensureSupabase();
  const horizon = Number(daysAhead);
  const safeDaysAhead = Number.isFinite(horizon) ? Math.max(0, Math.min(60, Math.floor(horizon))) : 7;

  const { data, error } = await supabase
    .from("contacts")
    .select("id,full_name,birth_date,companies:company_id(trade_name)")
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
  const { error } = await supabase.from("contacts").insert(payload);
  if (error) throw new Error(normalizeError(error, "Falha ao criar contato."));
}

export async function updateContact(contactId, payload) {
  const supabase = ensureSupabase();
  const { error } = await supabase.from("contacts").update(payload).eq("id", contactId);
  if (error) throw new Error(normalizeError(error, "Falha ao atualizar contato."));
}

export async function listOpportunities() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("opportunities")
    .select("id,company_id,title,stage,status,estimated_value,expected_close_date,created_at,companies:company_id(trade_name)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(normalizeError(error, "Falha ao listar oportunidades."));
  return data || [];
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

  const { data, error } = await supabase.from("sales_orders").insert(orderPayload).select("id").single();
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

  const [companiesRes, contactsRes, opportunitiesRes, ordersRes, ticketsRes] = await Promise.all([
    supabase
      .from("companies")
      .select("id,trade_name,cnpj")
      .or(`trade_name.ilike.${pattern},legal_name.ilike.${pattern},cnpj.ilike.${pattern}`)
      .limit(5),
    supabase
      .from("contacts")
      .select("id,full_name,email,companies:company_id(trade_name)")
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
      .limit(5)
  ]);

  if (companiesRes.error) throw new Error(normalizeError(companiesRes.error, "Falha na busca global (empresas)."));
  if (contactsRes.error) throw new Error(normalizeError(contactsRes.error, "Falha na busca global (contatos)."));
  if (opportunitiesRes.error) throw new Error(normalizeError(opportunitiesRes.error, "Falha na busca global (pipeline)."));
  if (ordersRes.error) throw new Error(normalizeError(ordersRes.error, "Falha na busca global (pedidos)."));
  if (ticketsRes.error) throw new Error(normalizeError(ticketsRes.error, "Falha na busca global (assistência)."));

  const mappedCompanies = (companiesRes.data || []).map((item) => ({
    id: `company-${item.id}`,
    type: "Empresa",
    title: item.trade_name || "Empresa",
    subtitle: item.cnpj ? `CNPJ ${item.cnpj}` : "Sem CNPJ",
    tab: "companies"
  }));

  const mappedContacts = (contactsRes.data || []).map((item) => ({
    id: `contact-${item.id}`,
    type: "Contato",
    title: item.full_name || "Contato",
    subtitle: item.companies?.trade_name || "Sem vínculo com empresa",
    tab: "companies"
  }));

  const mappedOpportunities = (opportunitiesRes.data || []).map((item) => ({
    id: `opportunity-${item.id}`,
    type: "Pipeline",
    title: item.title || "Oportunidade",
    subtitle: item.companies?.trade_name || "Sem empresa",
    tab: "pipeline"
  }));

  const mappedOrders = (ordersRes.data || []).map((item) => ({
    id: `order-${item.id}`,
    type: "Pedido",
    title: item.order_number || "Pedido",
    subtitle: item.companies?.trade_name || "Sem empresa",
    tab: "orders"
  }));

  const mappedTickets = (ticketsRes.data || []).map((item) => ({
    id: `ticket-${item.id}`,
    type: "Assistência",
    title: item.description || "Chamado técnico",
    subtitle: item.companies?.trade_name || "Sem empresa",
    tab: "service"
  }));

  return [
    ...mappedCompanies,
    ...mappedContacts,
    ...mappedOpportunities,
    ...mappedOrders,
    ...mappedTickets
  ];
}
