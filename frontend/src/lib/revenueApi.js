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

export async function listContacts() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("contacts")
    .select("id,full_name,email,phone,whatsapp,birth_date,is_primary,companies:company_id(trade_name)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(normalizeError(error, "Falha ao listar contatos."));
  return data || [];
}

export async function createContact(payload) {
  const supabase = ensureSupabase();
  const { error } = await supabase.from("contacts").insert(payload);
  if (error) throw new Error(normalizeError(error, "Falha ao criar contato."));
}

export async function listOpportunities() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from("opportunities")
    .select("id,title,stage,status,estimated_value,expected_close_date,created_at,companies:company_id(trade_name)")
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
    .select("id,order_number,order_type,status,total_amount,order_date,companies:company_id(trade_name)")
    .order("order_date", { ascending: false })
    .limit(30);
  if (error) throw new Error(normalizeError(error, "Falha ao listar pedidos."));
  return data || [];
}

export async function createOrder(payload) {
  const supabase = ensureSupabase();
  const { error } = await supabase.from("sales_orders").insert(payload);
  if (error) throw new Error(normalizeError(error, "Falha ao criar pedido."));
}

export async function listCompanyOptions() {
  const supabase = ensureSupabase();
  const { data, error } = await supabase.from("companies").select("id,trade_name").order("trade_name", { ascending: true });
  if (error) throw new Error(normalizeError(error, "Falha ao listar empresas para seleção."));
  return data || [];
}
