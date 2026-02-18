const STORAGE_KEY = "crm_comercial_tecnica_v3";

const state = {
  clientes: [],
  oportunidades: [],
  chamados: [],
  atividades: [],
  checkins: [],
  auth: {
    users: [],
    currentUserId: null
  },
  integracaoOmie: {
    appKey: "",
    appSecret: "",
    proxyUrl: ""
  },
  slaConfig: {
    Baixa: 48,
    "Média": 24,
    Alta: 8,
    "Crítica": 4
  },
  checkinConfig: {
    raioPadraoMetros: 200
  },
  alertas: []
};

const el = {
  topbar: document.getElementById("topbar"),
  authScreen: document.getElementById("authScreen"),
  appMain: document.getElementById("appMain"),
  formLogin: document.getElementById("formLogin"),
  loginStatus: document.getElementById("loginStatus"),
  usuarioLogado: document.getElementById("usuarioLogado"),
  btnLogout: document.getElementById("btnLogout"),
  kpis: document.getElementById("kpis"),
  graficoFunil: document.getElementById("graficoFunil"),
  graficoChamados: document.getElementById("graficoChamados"),
  graficoAtividades: document.getElementById("graficoAtividades"),
  formCliente: document.getElementById("formCliente"),
  formOportunidade: document.getElementById("formOportunidade"),
  formChamado: document.getElementById("formChamado"),
  formAtividade: document.getElementById("formAtividade"),
  formSla: document.getElementById("formSla"),
  formOmie: document.getElementById("formOmie"),
  formCheckin: document.getElementById("formCheckin"),
  clienteCnpj: document.getElementById("clienteCnpj"),
  cnpjStatus: document.getElementById("cnpjStatus"),
  clienteEmpresa: document.querySelector('#formCliente input[name="empresa"]'),
  clienteTelefone: document.querySelector('#formCliente input[name="telefone"]'),
  clienteEndereco: document.querySelector('#formCliente input[name="enderecoCompleto"]'),
  oportunidadeCliente: document.getElementById("oportunidadeCliente"),
  chamadoCliente: document.getElementById("chamadoCliente"),
  atividadeCliente: document.getElementById("atividadeCliente"),
  checkinCliente: document.getElementById("checkinCliente"),
  checkinAtividade: document.getElementById("checkinAtividade"),
  tabelaClientes: document.getElementById("tabelaClientes"),
  tabelaOportunidades: document.getElementById("tabelaOportunidades"),
  tabelaChamados: document.getElementById("tabelaChamados"),
  tabelaAtividades: document.getElementById("tabelaAtividades"),
  tabelaCheckins: document.getElementById("tabelaCheckins"),
  tabelaUsuarios: document.getElementById("tabelaUsuarios"),
  formUsuario: document.getElementById("formUsuario"),
  filtroEtapa: document.getElementById("filtroEtapa"),
  btnExportar: document.getElementById("btnExportar"),
  omieAppKey: document.getElementById("omieAppKey"),
  omieAppSecret: document.getElementById("omieAppSecret"),
  omieProxyUrl: document.getElementById("omieProxyUrl"),
  btnOmieSyncClientes: document.getElementById("btnOmieSyncClientes"),
  btnOmieSyncOportunidades: document.getElementById("btnOmieSyncOportunidades"),
  btnOmieSyncChamados: document.getElementById("btnOmieSyncChamados"),
  omieStatus: document.getElementById("omieStatus"),
  checkinStatus: document.getElementById("checkinStatus"),
  slaResumo: document.getElementById("slaResumo"),
  painelAlertas: document.getElementById("painelAlertas")
};

let cnpjLookupDebounce;
const cnpjLookupCache = new Map();

const ROLE_PERMISSIONS = {
  admin: ["*"],
  comercial: [
    "view_dashboard",
    "manage_clientes",
    "manage_oportunidades",
    "manage_atividades",
    "manage_checkin",
    "view_comercial",
    "view_clientes",
    "view_checkins",
    "export_data"
  ],
  tecnico: [
    "view_dashboard",
    "manage_chamados",
    "manage_sla",
    "view_chamados",
    "view_clientes",
    "view_alertas"
  ],
  gestor: [
    "view_dashboard",
    "manage_clientes",
    "manage_oportunidades",
    "manage_atividades",
    "manage_checkin",
    "view_comercial",
    "view_clientes",
    "view_chamados",
    "view_checkins",
    "view_alertas",
    "export_data"
  ]
};

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeAddress(value) {
  return String(value || "").trim();
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return value || "-";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function applyCnpjMask(value) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base, weights) => {
    const sum = base
      .split("")
      .reduce((acc, digit, idx) => acc + Number(digit) * weights[idx], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const firstDigit = calcDigit(cnpj.slice(0, 12), firstWeights);
  const secondDigit = calcDigit(cnpj.slice(0, 12) + firstDigit, secondWeights);
  return cnpj === cnpj.slice(0, 12) + String(firstDigit) + String(secondDigit);
}

async function cnpjExists(cnpj) {
  if (cnpjLookupCache.has(cnpj)) return cnpjLookupCache.get(cnpj);
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { Accept: "application/json" }
  });
  if (response.status === 404) {
    const result = { exists: false, reason: "CNPJ não encontrado na base pública." };
    cnpjLookupCache.set(cnpj, result);
    return result;
  }
  if (!response.ok) {
    throw new Error(`Serviço de consulta indisponível (${response.status}).`);
  }
  const result = { exists: true, payload: await response.json() };
  cnpjLookupCache.set(cnpj, result);
  return result;
}

function enderecoFromReceita(payload) {
  const parts = [
    payload.descricao_tipo_de_logradouro,
    payload.logradouro,
    payload.numero,
    payload.bairro,
    payload.municipio,
    payload.uf,
    payload.cep
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function applyCnpjAutofill(payload) {
  const empresa = String(payload.nome_fantasia || payload.razao_social || "").trim();
  const telefone = String(payload.ddd_telefone_1 || payload.ddd_telefone_2 || "").trim();
  const endereco = enderecoFromReceita(payload);

  if (empresa && !el.clienteEmpresa.value.trim()) el.clienteEmpresa.value = empresa;
  if (telefone && !el.clienteTelefone.value.trim()) el.clienteTelefone.value = telefone;
  if (endereco && !el.clienteEndereco.value.trim()) el.clienteEndereco.value = endereco;
}

function addressFromOmie(item) {
  const fields = [
    item.enderecoCompleto,
    item.endereco,
    item.logradouro,
    item.numero,
    item.bairro,
    item.cidade,
    item.estado,
    item.cep,
    item.pais
  ];
  return fields.filter(Boolean).join(", ");
}

async function geocodeAddress(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) return { latitude: null, longitude: null };

  const providers = [
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(normalized)}`,
    `https://geocode.maps.co/search?q=${encodeURIComponent(normalized)}`
  ];

  for (const url of providers) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) continue;
      const result = await response.json();
      if (!Array.isArray(result) || !result.length) continue;

      const latitude = Number(result[0].lat);
      const longitude = Number(result[0].lon);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    } catch {
      // Tenta provedor seguinte.
    }
  }

  return { latitude: null, longitude: null };
}

function currentUser() {
  return state.auth.users.find((u) => u.id === state.auth.currentUserId) || null;
}

function hasPermission(permission) {
  const user = currentUser();
  if (!user || user.ativo === false) return false;
  const permissions = ROLE_PERMISSIONS[user.perfil] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

function ensurePermission(permission) {
  if (hasPermission(permission)) return true;
  alert("Você não tem permissão para esta ação.");
  return false;
}

function applyPermissionVisibility() {
  document.querySelectorAll("[data-permission]").forEach((node) => {
    const permission = node.getAttribute("data-permission");
    node.classList.toggle("hidden-by-permission", !hasPermission(permission));
  });
}

function renderAuthState() {
  const user = currentUser();
  const authenticated = Boolean(user);

  el.authScreen.style.display = authenticated ? "none" : "grid";
  el.appMain.style.display = authenticated ? "grid" : "none";
  el.btnLogout.style.display = authenticated ? "inline-block" : "none";
  el.usuarioLogado.textContent = authenticated ? `${user.nome} (${user.perfil})` : "Não autenticado";
  applyPermissionVisibility();
}

function ensureAuthSeed() {
  if (state.auth.users.length) return false;
  state.auth.users.push(
    {
      id: uid("usr"),
      nome: "Administrador",
      email: "admin@crm.local",
      senha: "admin123",
      perfil: "admin",
      ativo: true
    },
    {
      id: uid("usr"),
      nome: "Vendas",
      email: "comercial@crm.local",
      senha: "comercial123",
      perfil: "comercial",
      ativo: true
    },
    {
      id: uid("usr"),
      nome: "Suporte",
      email: "tecnico@crm.local",
      senha: "tecnico123",
      perfil: "tecnico",
      ativo: true
    }
  );
  return true;
}

function ensureUserExists(userData) {
  const email = String(userData.email || "")
    .trim()
    .toLowerCase();
  const exists = state.auth.users.some((u) => String(u.email || "").toLowerCase() === email);
  if (exists) return false;
  state.auth.users.push({
    id: uid("usr"),
    nome: userData.nome,
    email,
    senha: userData.senha,
    perfil: userData.perfil,
    ativo: true
  });
  return true;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.clientes = (parsed.clientes || []).map((cliente) => ({
      ...cliente,
      cnpj: onlyDigits(cliente.cnpj || ""),
      enderecoCompleto: normalizeAddress(cliente.enderecoCompleto || cliente.endereco || "")
    }));
    state.oportunidades = parsed.oportunidades || [];
    state.chamados = parsed.chamados || [];
    state.atividades = parsed.atividades || [];
    state.checkins = parsed.checkins || [];
    state.auth = {
      ...state.auth,
      ...(parsed.auth || {}),
      users: (parsed.auth && parsed.auth.users) || []
    };
    state.integracaoOmie = { ...state.integracaoOmie, ...(parsed.integracaoOmie || {}) };
    state.slaConfig = { ...state.slaConfig, ...(parsed.slaConfig || {}) };
    state.checkinConfig = { ...state.checkinConfig, ...(parsed.checkinConfig || {}) };
    state.alertas = parsed.alertas || [];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function ensureSeed() {
  if (state.clientes.length || state.oportunidades.length || state.chamados.length) return;

  const clienteId = uid("cli");
  state.clientes.push({
    id: clienteId,
    nome: "Larissa Melo",
    empresa: "Nexa Automação",
    cnpj: "12345678000195",
    email: "larissa@nexa.com.br",
    telefone: "(11) 91234-5678",
    segmento: "Indústria",
    enderecoCompleto: "Avenida Paulista, 1000, São Paulo, SP, Brasil",
    latitude: -23.55052,
    longitude: -46.633308,
    raioMetros: 200
  });

  state.oportunidades.push({
    id: uid("opp"),
    clienteId,
    titulo: "Ampliação do contrato anual",
    valor: 85000,
    etapa: "Proposta",
    proximoContato: new Date().toISOString().slice(0, 10)
  });

  const criadoEm = new Date().toISOString();
  state.chamados.push({
    id: uid("tic"),
    clienteId,
    titulo: "Falha de integração ERP",
    descricao: "Erro ao sincronizar pedidos desde 08h.",
    prioridade: "Alta",
    status: "Em atendimento",
    responsavel: "Carlos Suporte",
    criadoEm: criadoEm.slice(0, 10),
    criadoEmIso: criadoEm
  });

  state.atividades.push({
    id: uid("act"),
    clienteId,
    titulo: "Reunião de diagnóstico",
    tipo: "Reunião",
    responsavel: "Ana Vendas",
    dataHora: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "Planejada"
  });

  save();
}

function nomeCliente(clienteId) {
  const cliente = state.clientes.find((c) => c.id === clienteId);
  return cliente ? cliente.empresa : "Cliente removido";
}

function encodePriorityCss(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slaHoursFor(priority) {
  return Number(state.slaConfig[priority] || 24);
}

function getTicketDueDate(chamado) {
  const start = chamado.criadoEmIso ? new Date(chamado.criadoEmIso) : new Date(`${chamado.criadoEm}T00:00:00`);
  return new Date(start.getTime() + slaHoursFor(chamado.prioridade) * 60 * 60 * 1000);
}

function getSlaStatus(chamado) {
  if (chamado.status === "Resolvido") return { label: "Resolvido", css: "ok" };
  const now = Date.now();
  const due = getTicketDueDate(chamado).getTime();
  const remaining = due - now;

  if (remaining <= 0) return { label: "Vencido", css: "danger" };
  if (remaining <= 2 * 60 * 60 * 1000) return { label: "Risco", css: "warn" };
  return { label: "No prazo", css: "ok" };
}

function getCheckinResultCss(resultado) {
  if (resultado === "Dentro do raio") return "ok";
  if (resultado === "Fora do raio") return "danger";
  return "warn";
}

function renderClienteOptions() {
  const selectedOportunidade = el.oportunidadeCliente.value;
  const selectedChamado = el.chamadoCliente.value;
  const selectedAtividade = el.atividadeCliente.value;
  const selectedCheckin = el.checkinCliente.value;
  const base = '<option value="">Selecione o cliente</option>';
  const options = state.clientes
    .map((cliente) => `<option value="${cliente.id}">${cliente.empresa}</option>`)
    .join("");

  el.oportunidadeCliente.innerHTML = base + options;
  el.chamadoCliente.innerHTML = base + options;
  el.atividadeCliente.innerHTML = base + options;
  el.checkinCliente.innerHTML = base + options;
  el.oportunidadeCliente.value = selectedOportunidade;
  el.chamadoCliente.value = selectedChamado;
  el.atividadeCliente.value = selectedAtividade;
  el.checkinCliente.value = selectedCheckin;

  renderCheckinAtividadeOptions();
}

function renderCheckinAtividadeOptions() {
  const selectedClient = el.checkinCliente.value;
  const base = '<option value="">Atividade vinculada (opcional)</option>';
  if (!selectedClient) {
    el.checkinAtividade.innerHTML = base;
    return;
  }

  const options = state.atividades
    .filter((a) => a.clienteId === selectedClient && a.status !== "Concluída")
    .map((a) => `<option value="${a.id}">${a.titulo}</option>`)
    .join("");

  el.checkinAtividade.innerHTML = base + options;
}

function renderClientes() {
  el.tabelaClientes.innerHTML = state.clientes
    .map((cliente) => {
      const endereco = cliente.enderecoCompleto || "Endereço não informado";
      const hasGeo = Number.isFinite(cliente.latitude) && Number.isFinite(cliente.longitude);
      const geo = hasGeo ? `${cliente.latitude.toFixed(6)}, ${cliente.longitude.toFixed(6)}` : "pendente";
      const localizacao = `${endereco} | geo: ${geo} | raio ${Number(cliente.raioMetros || state.checkinConfig.raioPadraoMetros)}m`;

      return `
      <tr>
        <td>${cliente.nome}</td>
        <td>${cliente.empresa}</td>
        <td>${formatCnpj(cliente.cnpj)}</td>
        <td>${cliente.email}</td>
        <td>${cliente.telefone}</td>
        <td>${cliente.segmento}</td>
        <td>${localizacao}</td>
      </tr>
    `;
    })
    .join("");
}

function renderUsuarios() {
  if (!el.tabelaUsuarios) return;
  const user = currentUser();

  el.tabelaUsuarios.innerHTML = state.auth.users
    .map((item) => {
      const isSelf = user && user.id === item.id;
      return `
      <tr>
        <td>${item.nome}</td>
        <td>${item.email}</td>
        <td>${item.perfil}</td>
        <td>${item.ativo ? "Ativo" : "Inativo"}</td>
        <td>
          <div class="inline-actions">
            <button data-user-toggle="${item.id}" ${isSelf ? "disabled" : ""}>${item.ativo ? "Bloquear" : "Ativar"}</button>
            <button data-user-delete="${item.id}" ${isSelf ? "disabled" : ""}>Excluir</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

function renderOportunidades() {
  const filtro = (el.filtroEtapa.value || "").trim().toLowerCase();
  const rows = state.oportunidades.filter((oportunidade) => {
    if (!filtro) return true;
    return oportunidade.etapa.toLowerCase().includes(filtro);
  });

  el.tabelaOportunidades.innerHTML = rows
    .map(
      (oportunidade) => `
      <tr>
        <td>${nomeCliente(oportunidade.clienteId)}</td>
        <td>${oportunidade.titulo}</td>
        <td>${currency(oportunidade.valor)}</td>
        <td>${oportunidade.etapa}</td>
        <td>${formatDate(oportunidade.proximoContato)}</td>
        <td>
          <div class="inline-actions">
            <button data-next-stage="${oportunidade.id}">Avançar etapa</button>
            <button data-delete-opp="${oportunidade.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function renderChamados() {
  el.tabelaChamados.innerHTML = state.chamados
    .map((chamado) => {
      const sla = getSlaStatus(chamado);
      return `
      <tr>
        <td>${nomeCliente(chamado.clienteId)}</td>
        <td>${chamado.titulo}</td>
        <td><span class="tag ${encodePriorityCss(chamado.prioridade)}">${chamado.prioridade}</span></td>
        <td>${chamado.status}</td>
        <td>${chamado.responsavel}</td>
        <td><span class="pill ${sla.css}">${sla.label}</span></td>
        <td>${formatDate(chamado.criadoEm)}</td>
        <td>
          <div class="inline-actions">
            <button data-next-status="${chamado.id}">Próximo status</button>
            <button data-delete-ticket="${chamado.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
}

function renderAtividades() {
  const ordered = [...state.atividades].sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));

  el.tabelaAtividades.innerHTML = ordered
    .map(
      (atividade) => `
      <tr>
        <td>${formatDateTime(atividade.dataHora)}</td>
        <td>${nomeCliente(atividade.clienteId)}</td>
        <td>${atividade.titulo}</td>
        <td>${atividade.tipo}</td>
        <td>${atividade.responsavel}</td>
        <td>${atividade.status}</td>
        <td>
          <div class="inline-actions">
            <button data-atividade-done="${atividade.id}">Concluir</button>
            <button data-atividade-delete="${atividade.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

function renderCheckins() {
  const ordered = [...state.checkins].sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

  if (!ordered.length) {
    el.tabelaCheckins.innerHTML = `
      <tr>
        <td colspan="7" class="helper-text">Nenhum check-in registrado ainda.</td>
      </tr>
    `;
    return;
  }

  el.tabelaCheckins.innerHTML = ordered
    .map((checkin) => {
      const distancia = Number.isFinite(checkin.distanciaMetros)
        ? `${Math.round(checkin.distanciaMetros)} m`
        : "-";
      const coords =
        Number.isFinite(checkin.latitude) && Number.isFinite(checkin.longitude)
          ? `${checkin.latitude.toFixed(6)}, ${checkin.longitude.toFixed(6)}`
          : "-";
      return `
      <tr>
        <td>${formatDateTime(checkin.dataHora)}</td>
        <td>${nomeCliente(checkin.clienteId)}</td>
        <td>${checkin.vendedor}</td>
        <td>${distancia}</td>
        <td>${checkin.raioPermitidoMetros} m</td>
        <td><span class="pill ${getCheckinResultCss(checkin.resultado)}">${checkin.resultado}</span></td>
        <td>${coords}</td>
      </tr>
    `;
    })
    .join("");
}

function renderKpis() {
  const receitaTotal = state.oportunidades.reduce((acc, item) => acc + Number(item.valor || 0), 0);
  const oportunidadesAbertas = state.oportunidades.filter((o) => o.etapa !== "Fechado").length;
  const chamadosAbertos = state.chamados.filter((c) => c.status !== "Resolvido").length;
  const atividadesPendentes = state.atividades.filter((a) => a.status !== "Concluída").length;
  const totalCheckins = state.checkins.length;
  const taxaFechamento = state.oportunidades.length
    ? Math.round(
        (state.oportunidades.filter((o) => o.etapa === "Fechado").length / state.oportunidades.length) * 100
      )
    : 0;

  const cards = [
    { label: "Clientes", value: state.clientes.length },
    { label: "Pipeline total", value: currency(receitaTotal) },
    { label: "Oportunidades abertas", value: oportunidadesAbertas },
    { label: "Taxa de fechamento", value: `${taxaFechamento}%` },
    { label: "Chamados em aberto", value: chamadosAbertos },
    { label: "Atividades pendentes", value: atividadesPendentes },
    { label: "Check-ins", value: totalCheckins }
  ];

  el.kpis.innerHTML = cards
    .map(
      (kpi) => `
      <div class="kpi">
        <span>${kpi.label}</span>
        <strong>${kpi.value}</strong>
      </div>
    `
    )
    .join("");
}

function renderGraficoFunil() {
  const etapas = ["Lead", "Qualificação", "Proposta", "Negociação", "Fechado"];
  const counts = etapas.map((etapa) => ({
    etapa,
    total: state.oportunidades.filter((o) => o.etapa === etapa).length
  }));
  const max = Math.max(...counts.map((c) => c.total), 1);

  el.graficoFunil.innerHTML = counts
    .map(
      (item) => `
      <div class="bar-row">
        <small>${item.etapa} (${item.total})</small>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(item.total / max) * 100}%"></div>
        </div>
      </div>
    `
    )
    .join("");
}

function renderGraficoChamados() {
  const statusMap = ["Aberto", "Em atendimento", "Aguardando cliente", "Resolvido"].map((status) => ({
    status,
    total: state.chamados.filter((c) => c.status === status).length
  }));
  const total = statusMap.reduce((acc, item) => acc + item.total, 0);

  if (!total) {
    el.graficoChamados.innerHTML = '<p class="helper-text">Sem chamados cadastrados.</p>';
    return;
  }

  const colors = ["#0c5f4b", "#00a67e", "#f3a712", "#8aa7a0"];
  let cursor = 0;
  const segments = statusMap
    .map((item, idx) => {
      const angle = (item.total / total) * 360;
      const part = `${colors[idx]} ${cursor}deg ${cursor + angle}deg`;
      cursor += angle;
      return part;
    })
    .join(", ");

  el.graficoChamados.innerHTML = `
    <div class="donut" style="background: conic-gradient(${segments});"></div>
    <div class="legend">
      ${statusMap
        .map(
          (item, idx) => `
        <div class="legend-line">
          <span style="color:${colors[idx]}">${item.status}</span>
          <strong>${item.total}</strong>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function renderGraficoAtividades() {
  const proximas = [...state.atividades]
    .filter((a) => a.status !== "Concluída")
    .sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora))
    .slice(0, 5);

  if (!proximas.length) {
    el.graficoAtividades.innerHTML = '<p class="helper-text">Nenhuma atividade pendente.</p>';
    return;
  }

  el.graficoAtividades.innerHTML = proximas
    .map(
      (atividade) => `
      <div class="timeline-item">
        <strong>${atividade.tipo} - ${nomeCliente(atividade.clienteId)}</strong><br />
        <small>${formatDateTime(atividade.dataHora)} | ${atividade.responsavel}</small>
      </div>
    `
    )
    .join("");
}

function renderDashboardVisual() {
  renderGraficoFunil();
  renderGraficoChamados();
  renderGraficoAtividades();
}

function renderSlaSummary() {
  el.slaResumo.textContent = `Metas atuais (h) -> Baixa: ${state.slaConfig.Baixa}, Média: ${state.slaConfig["Média"]}, Alta: ${
    state.slaConfig.Alta
  }, Crítica: ${state.slaConfig["Crítica"]}`;

  const baixa = el.formSla.querySelector('input[name="baixa"]');
  const media = el.formSla.querySelector('input[name="media"]');
  const alta = el.formSla.querySelector('input[name="alta"]');
  const critica = el.formSla.querySelector('input[name="critica"]');

  baixa.value = state.slaConfig.Baixa;
  media.value = state.slaConfig["Média"];
  alta.value = state.slaConfig.Alta;
  critica.value = state.slaConfig["Crítica"];
}

function renderOmieConfig() {
  el.omieAppKey.value = state.integracaoOmie.appKey || "";
  el.omieAppSecret.value = state.integracaoOmie.appSecret || "";
  el.omieProxyUrl.value = state.integracaoOmie.proxyUrl || "";
}

function renderAlertas() {
  const now = Date.now();
  const ativos = state.alertas
    .filter((a) => now - new Date(a.createdAt).getTime() < 12 * 60 * 60 * 1000)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!ativos.length) {
    el.painelAlertas.innerHTML = '<p class="helper-text">Sem alertas críticos de SLA no momento.</p>';
    return;
  }

  el.painelAlertas.innerHTML = ativos
    .map(
      (alerta) => `
      <article class="alert-item ${alerta.level}">
        <strong>${alerta.title}</strong>
        <p>${alerta.message}</p>
        <small>${formatDateTime(alerta.createdAt)}</small>
      </article>
    `
    )
    .join("");
}

function refreshAll() {
  renderAuthState();
  renderClienteOptions();
  renderClientes();
  renderUsuarios();
  renderOportunidades();
  renderChamados();
  renderAtividades();
  renderCheckins();
  renderKpis();
  renderDashboardVisual();
  renderSlaSummary();
  renderOmieConfig();
  renderAlertas();
}

function nextEtapa(etapa) {
  const etapas = ["Lead", "Qualificação", "Proposta", "Negociação", "Fechado"];
  const idx = etapas.indexOf(etapa);
  if (idx < 0 || idx === etapas.length - 1) return etapa;
  return etapas[idx + 1];
}

function nextStatus(status) {
  const statuses = ["Aberto", "Em atendimento", "Aguardando cliente", "Resolvido"];
  const idx = statuses.indexOf(status);
  if (idx < 0 || idx === statuses.length - 1) return status;
  return statuses[idx + 1];
}

function maybeNotify(message) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("CRM Alerta", { body: message });
  }
}

function pushAlert(level, title, message, dedupeKey = "") {
  const key = dedupeKey || `${title}:${message}`;
  const exists = state.alertas.some((a) => a.dedupeKey === key);
  if (exists) return;

  state.alertas.push({
    id: uid("alr"),
    level,
    title,
    message,
    dedupeKey: key,
    createdAt: new Date().toISOString()
  });

  maybeNotify(message);
}

function runSlaMonitor() {
  state.chamados.forEach((chamado) => {
    if (chamado.status === "Resolvido") return;
    const sla = getSlaStatus(chamado);
    if (sla.label === "Risco") {
      pushAlert(
        "warn",
        `SLA em risco: ${chamado.titulo}`,
        `Chamado de ${nomeCliente(chamado.clienteId)} próximo do vencimento.`,
        `sla_risco_${chamado.id}`
      );
    }
    if (sla.label === "Vencido") {
      pushAlert(
        "danger",
        `SLA vencido: ${chamado.titulo}`,
        `Chamado de ${nomeCliente(chamado.clienteId)} está vencido no SLA.`,
        `sla_vencido_${chamado.id}`
      );
    }
  });

  state.alertas = state.alertas.slice(-80);
  save();
  renderChamados();
  renderAlertas();
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocalização não suportada neste navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        if (error && error.code === 1) {
          reject(new Error("permissão de localização negada no navegador"));
          return;
        }
        if (error && error.code === 2) {
          reject(new Error("localização indisponível no dispositivo"));
          return;
        }
        if (error && error.code === 3) {
          reject(new Error("tempo esgotado ao obter localização"));
          return;
        }
        reject(new Error("não foi possível obter a localização atual"));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

async function registerCheckin(clienteId, vendedor, observacao, atividadeId) {
  const cliente = state.clientes.find((c) => c.id === clienteId);
  if (!cliente) {
    el.checkinStatus.textContent = "Cliente não encontrado para check-in.";
    return;
  }

  let clienteTemGeo = Number.isFinite(cliente.latitude) && Number.isFinite(cliente.longitude);
  if (!clienteTemGeo && cliente.enderecoCompleto) {
    el.checkinStatus.textContent = "Localizando endereço do cliente para validar check-in...";
    const geo = await geocodeAddress(cliente.enderecoCompleto);
    if (Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude)) {
      cliente.latitude = geo.latitude;
      cliente.longitude = geo.longitude;
      clienteTemGeo = true;
      save();
    }
  }

  el.checkinStatus.textContent = "Capturando localização atual do vendedor...";

  try {
    const position = await getCurrentPosition();
    const latitudeAtual = position.coords.latitude;
    const longitudeAtual = position.coords.longitude;
    const raioPermitido = Number(cliente.raioMetros || state.checkinConfig.raioPadraoMetros);
    const distancia = clienteTemGeo
      ? calculateDistanceMeters(latitudeAtual, longitudeAtual, cliente.latitude, cliente.longitude)
      : null;
    const dentroDoRaio = Number.isFinite(distancia) ? distancia <= raioPermitido : false;
    const resultado = Number.isFinite(distancia)
      ? dentroDoRaio
        ? "Dentro do raio"
        : "Fora do raio"
      : "Sem validação de distância";

    const checkinId = uid("chk");
    state.checkins.push({
      id: checkinId,
      clienteId,
      vendedor,
      observacao,
      atividadeId: atividadeId || null,
      dataHora: new Date().toISOString(),
      latitude: latitudeAtual,
      longitude: longitudeAtual,
      distanciaMetros: distancia,
      raioPermitidoMetros: raioPermitido,
      resultado
    });

    if (atividadeId && (dentroDoRaio || !Number.isFinite(distancia))) {
      const atividade = state.atividades.find((a) => a.id === atividadeId);
      if (atividade) {
        atividade.status = "Check-in realizado";
        atividade.checkinId = checkinId;
      }
    }

    if (!clienteTemGeo) {
      pushAlert(
        "warn",
        `Check-in sem validação: ${nomeCliente(clienteId)}`,
        `${vendedor} registrou check-in, mas o endereço do cliente não foi geolocalizado.`,
        `checkin_sem_geo_${checkinId}`
      );
    } else if (!dentroDoRaio) {
      pushAlert(
        "warn",
        `Check-in fora do raio: ${nomeCliente(clienteId)}`,
        `${vendedor} registrou check-in a ${Math.round(distancia)}m do cliente.`,
        `checkin_fora_${checkinId}`
      );
    }

    state.checkins = state.checkins.slice(-500);
    save();
    refreshAll();
    el.checkinStatus.textContent = Number.isFinite(distancia)
      ? `Check-in registrado: ${resultado} (${Math.round(distancia)}m de distância).`
      : "Check-in registrado sem validação de distância (endereço do cliente não localizado).";
  } catch (error) {
    el.checkinStatus.textContent = `Falha no check-in: ${error.message || "permissão de localização negada"}.`;
  }
}

async function syncOmie(resource) {
  const { appKey, appSecret, proxyUrl } = state.integracaoOmie;
  if (!appKey || !appSecret || !proxyUrl) {
    el.omieStatus.textContent = "Configure App Key, App Secret e URL do proxy Omie antes de sincronizar.";
    return;
  }

  el.omieStatus.textContent = `Sincronizando ${resource}...`;

  const endpoints = {
    clientes: "/api/omie/clientes",
    oportunidades: "/api/omie/oportunidades",
    chamados: "/api/omie/chamados"
  };

  try {
    const response = await fetch(`${proxyUrl}${endpoints[resource]}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appKey, appSecret })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const items = payload.items || [];

    if (resource === "clientes") {
      items.forEach((item) => {
        const existing = state.clientes.find((c) => c.email === item.email || c.empresa === item.empresa);
        if (existing) return;
        state.clientes.push({
          id: uid("cli"),
          nome: item.nome || item.contato || "Sem nome",
          empresa: item.empresa || item.fantasia || "Sem empresa",
          cnpj: onlyDigits(item.cnpj || ""),
          email: item.email || "nao-informado@omie",
          telefone: item.telefone || "-",
          segmento: item.segmento || "Omie",
          enderecoCompleto: normalizeAddress(addressFromOmie(item)),
          latitude: toNumberOrNull(item.latitude),
          longitude: toNumberOrNull(item.longitude),
          raioMetros: Number(item.raioMetros || state.checkinConfig.raioPadraoMetros)
        });
      });
    }

    if (resource === "oportunidades") {
      items.forEach((item) => {
        const cliente = state.clientes.find((c) => c.empresa === item.empresa || c.email === item.email);
        if (!cliente) return;
        state.oportunidades.push({
          id: uid("opp"),
          clienteId: cliente.id,
          titulo: item.titulo || "Oportunidade Omie",
          valor: Number(item.valor || 0),
          etapa: item.etapa || "Lead",
          proximoContato: (item.proximoContato || new Date().toISOString()).slice(0, 10)
        });
      });
    }

    if (resource === "chamados") {
      items.forEach((item) => {
        const cliente = state.clientes.find((c) => c.empresa === item.empresa || c.email === item.email);
        if (!cliente) return;
        const criado = new Date(item.criadoEm || Date.now()).toISOString();
        state.chamados.push({
          id: uid("tic"),
          clienteId: cliente.id,
          titulo: item.titulo || "Chamado Omie",
          descricao: item.descricao || "Importado do Omie",
          prioridade: item.prioridade || "Média",
          status: item.status || "Aberto",
          responsavel: item.responsavel || "Time técnico",
          criadoEm: criado.slice(0, 10),
          criadoEmIso: criado
        });
      });
    }

    save();
    refreshAll();
    el.omieStatus.textContent = `Sincronização de ${resource} concluída. ${items.length} registros recebidos.`;
  } catch (error) {
    el.omieStatus.textContent = `Falha na sincronização de ${resource}: ${error.message}. Verifique o proxy Omie.`;
  }
}

el.formLogin.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const email = String(data.get("email") || "")
    .trim()
    .toLowerCase();
  const senha = String(data.get("senha") || "").trim();

  const user = state.auth.users.find((u) => u.email.toLowerCase() === email && u.senha === senha && u.ativo !== false);
  if (!user) {
    el.loginStatus.textContent = "Credenciais inválidas ou usuário inativo.";
    return;
  }

  state.auth.currentUserId = user.id;
  save();
  el.loginStatus.textContent = "";
  event.currentTarget.reset();
  refreshAll();
});

el.btnLogout.addEventListener("click", () => {
  state.auth.currentUserId = null;
  save();
  refreshAll();
});

el.formUsuario.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ensurePermission("manage_users")) return;

  const data = new FormData(event.currentTarget);
  const email = String(data.get("email") || "")
    .trim()
    .toLowerCase();
  const exists = state.auth.users.some((u) => u.email.toLowerCase() === email);
  if (exists) {
    alert("Já existe usuário com este e-mail.");
    return;
  }

  state.auth.users.push({
    id: uid("usr"),
    nome: String(data.get("nome") || "").trim(),
    email,
    senha: String(data.get("senha") || "").trim(),
    perfil: String(data.get("perfil") || "comercial"),
    ativo: true
  });

  save();
  refreshAll();
  event.currentTarget.reset();
});

el.tabelaUsuarios.addEventListener("click", (event) => {
  if (!ensurePermission("manage_users")) return;
  const toggleId = event.target.getAttribute("data-user-toggle");
  const deleteId = event.target.getAttribute("data-user-delete");
  const user = currentUser();

  if (toggleId) {
    const target = state.auth.users.find((u) => u.id === toggleId);
    if (!target || (user && target.id === user.id)) return;
    target.ativo = !target.ativo;
    save();
    refreshAll();
  }

  if (deleteId) {
    if (user && user.id === deleteId) return;
    state.auth.users = state.auth.users.filter((u) => u.id !== deleteId);
    save();
    refreshAll();
  }
});

el.formCliente.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensurePermission("manage_clientes")) return;
  const data = new FormData(event.currentTarget);

  const cnpj = onlyDigits(data.get("cnpj"));
  if (!isValidCnpj(cnpj)) {
    el.clienteCnpj.setCustomValidity("CNPJ inválido. Verifique e tente novamente.");
    el.clienteCnpj.reportValidity();
    return;
  }
  el.clienteCnpj.setCustomValidity("");

  const cnpjDuplicado = state.clientes.some((c) => onlyDigits(c.cnpj) === cnpj);
  if (cnpjDuplicado) {
    el.clienteCnpj.setCustomValidity("Este CNPJ já está cadastrado.");
    el.clienteCnpj.reportValidity();
    return;
  }
  el.clienteCnpj.setCustomValidity("");
  el.cnpjStatus.textContent = "Validando existência do CNPJ...";

  try {
    const cnpjLookup = await cnpjExists(cnpj);
    if (!cnpjLookup.exists) {
      el.clienteCnpj.setCustomValidity(cnpjLookup.reason);
      el.clienteCnpj.reportValidity();
      el.cnpjStatus.textContent = cnpjLookup.reason;
      return;
    }
    el.cnpjStatus.textContent = "CNPJ validado na base pública.";
  } catch (error) {
    el.clienteCnpj.setCustomValidity("Não foi possível validar existência do CNPJ agora.");
    el.clienteCnpj.reportValidity();
    el.cnpjStatus.textContent = error.message;
    return;
  }

  const enderecoCompleto = normalizeAddress(data.get("enderecoCompleto"));
  const raioMetros = Number(data.get("raioMetros") || state.checkinConfig.raioPadraoMetros);
  let latitude = null;
  let longitude = null;

  if (enderecoCompleto) {
    try {
      const geo = await geocodeAddress(enderecoCompleto);
      latitude = toNumberOrNull(geo.latitude);
      longitude = toNumberOrNull(geo.longitude);
    } catch {
      el.checkinStatus.textContent = "Cliente salvo, mas não foi possível geocodificar o endereço agora.";
    }
  }

  state.clientes.push({
    id: uid("cli"),
    nome: data.get("nome"),
    empresa: data.get("empresa"),
    cnpj,
    email: data.get("email"),
    telefone: data.get("telefone"),
    segmento: data.get("segmento"),
    enderecoCompleto,
    latitude,
    longitude,
    raioMetros
  });

  save();
  refreshAll();
  event.currentTarget.reset();
  el.clienteCnpj.setCustomValidity("");
  el.cnpjStatus.textContent = "";
});

el.clienteCnpj.addEventListener("input", () => {
  clearTimeout(cnpjLookupDebounce);
  el.clienteCnpj.value = applyCnpjMask(el.clienteCnpj.value);
  const value = onlyDigits(el.clienteCnpj.value);
  el.cnpjStatus.textContent = "";
  if (!value) {
    el.clienteCnpj.setCustomValidity("");
    return;
  }
  if (value.length < 14) {
    el.clienteCnpj.setCustomValidity("CNPJ incompleto.");
    return;
  }
  if (!isValidCnpj(value)) {
    el.clienteCnpj.setCustomValidity("CNPJ inválido.");
    return;
  }

  el.clienteCnpj.setCustomValidity("");
  cnpjLookupDebounce = setTimeout(async () => {
    el.cnpjStatus.textContent = "Consultando CNPJ para autopreenchimento...";
    try {
      const lookup = await cnpjExists(value);
      if (!lookup.exists) {
        el.cnpjStatus.textContent = lookup.reason;
        return;
      }
      applyCnpjAutofill(lookup.payload);
      el.cnpjStatus.textContent = "Dados da empresa preenchidos automaticamente.";
    } catch (error) {
      el.cnpjStatus.textContent = `Consulta indisponível: ${error.message}`;
    }
  }, 500);
});

el.clienteCnpj.addEventListener("blur", async () => {
  const cnpj = onlyDigits(el.clienteCnpj.value);
  if (!cnpj || cnpj.length !== 14 || !isValidCnpj(cnpj)) return;
  el.cnpjStatus.textContent = "Consultando existência do CNPJ...";
  try {
    const lookup = await cnpjExists(cnpj);
    if (lookup.exists) {
      applyCnpjAutofill(lookup.payload);
      el.cnpjStatus.textContent = "CNPJ encontrado. Dados sugeridos preenchidos.";
    } else {
      el.cnpjStatus.textContent = lookup.reason;
    }
  } catch (error) {
    el.cnpjStatus.textContent = `Consulta indisponível: ${error.message}`;
  }
});

el.formOportunidade.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ensurePermission("manage_oportunidades")) return;
  const data = new FormData(event.currentTarget);

  state.oportunidades.push({
    id: uid("opp"),
    clienteId: data.get("clienteId"),
    titulo: data.get("titulo"),
    valor: Number(data.get("valor")),
    etapa: data.get("etapa"),
    proximoContato: data.get("proximoContato")
  });

  save();
  refreshAll();
  event.currentTarget.reset();
});

el.formChamado.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ensurePermission("manage_chamados")) return;
  const data = new FormData(event.currentTarget);

  const createdIso = new Date().toISOString();
  state.chamados.push({
    id: uid("tic"),
    clienteId: data.get("clienteId"),
    titulo: data.get("titulo"),
    descricao: data.get("descricao"),
    prioridade: data.get("prioridade"),
    status: data.get("status"),
    responsavel: data.get("responsavel"),
    criadoEm: createdIso.slice(0, 10),
    criadoEmIso: createdIso
  });

  save();
  refreshAll();
  event.currentTarget.reset();
});

el.formAtividade.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ensurePermission("manage_atividades")) return;
  const data = new FormData(event.currentTarget);

  state.atividades.push({
    id: uid("act"),
    titulo: data.get("titulo"),
    clienteId: data.get("clienteId"),
    tipo: data.get("tipo"),
    responsavel: data.get("responsavel"),
    dataHora: new Date(data.get("dataHora")).toISOString(),
    status: "Planejada"
  });

  save();
  refreshAll();
  event.currentTarget.reset();
});

el.formSla.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ensurePermission("manage_sla")) return;
  const data = new FormData(event.currentTarget);

  state.slaConfig.Baixa = Number(data.get("baixa"));
  state.slaConfig["Média"] = Number(data.get("media"));
  state.slaConfig.Alta = Number(data.get("alta"));
  state.slaConfig["Crítica"] = Number(data.get("critica"));

  save();
  refreshAll();
  runSlaMonitor();
});

el.formOmie.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ensurePermission("manage_omie")) return;
  const data = new FormData(event.currentTarget);

  state.integracaoOmie.appKey = String(data.get("appKey") || "").trim();
  state.integracaoOmie.appSecret = String(data.get("appSecret") || "").trim();
  state.integracaoOmie.proxyUrl = String(data.get("proxyUrl") || "").trim().replace(/\/$/, "");

  save();
  el.omieStatus.textContent = "Integração Omie salva. Pronto para sincronizar via proxy.";
});

el.formCheckin.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensurePermission("manage_checkin")) return;
  const data = new FormData(event.currentTarget);
  await registerCheckin(
    String(data.get("clienteId") || ""),
    String(data.get("vendedor") || "").trim(),
    String(data.get("observacao") || "").trim(),
    String(data.get("atividadeId") || "").trim()
  );
});

el.checkinCliente.addEventListener("change", () => {
  renderCheckinAtividadeOptions();
});

el.btnOmieSyncClientes.addEventListener("click", () => {
  if (!ensurePermission("manage_omie")) return;
  syncOmie("clientes");
});
el.btnOmieSyncOportunidades.addEventListener("click", () => {
  if (!ensurePermission("manage_omie")) return;
  syncOmie("oportunidades");
});
el.btnOmieSyncChamados.addEventListener("click", () => {
  if (!ensurePermission("manage_omie")) return;
  syncOmie("chamados");
});

el.tabelaOportunidades.addEventListener("click", (event) => {
  if (!ensurePermission("manage_oportunidades")) return;
  const nextId = event.target.getAttribute("data-next-stage");
  const deleteId = event.target.getAttribute("data-delete-opp");

  if (nextId) {
    const item = state.oportunidades.find((o) => o.id === nextId);
    if (!item) return;
    item.etapa = nextEtapa(item.etapa);
    save();
    refreshAll();
  }

  if (deleteId) {
    state.oportunidades = state.oportunidades.filter((o) => o.id !== deleteId);
    save();
    refreshAll();
  }
});

el.tabelaChamados.addEventListener("click", (event) => {
  if (!ensurePermission("manage_chamados")) return;
  const nextId = event.target.getAttribute("data-next-status");
  const deleteId = event.target.getAttribute("data-delete-ticket");

  if (nextId) {
    const item = state.chamados.find((c) => c.id === nextId);
    if (!item) return;
    item.status = nextStatus(item.status);
    save();
    refreshAll();
  }

  if (deleteId) {
    state.chamados = state.chamados.filter((c) => c.id !== deleteId);
    save();
    refreshAll();
  }
});

el.tabelaAtividades.addEventListener("click", (event) => {
  if (!ensurePermission("manage_atividades")) return;
  const doneId = event.target.getAttribute("data-atividade-done");
  const deleteId = event.target.getAttribute("data-atividade-delete");

  if (doneId) {
    const item = state.atividades.find((a) => a.id === doneId);
    if (!item) return;
    item.status = "Concluída";
    save();
    refreshAll();
  }

  if (deleteId) {
    state.atividades = state.atividades.filter((a) => a.id !== deleteId);
    save();
    refreshAll();
  }
});

el.filtroEtapa.addEventListener("input", () => {
  renderOportunidades();
});

el.btnExportar.addEventListener("click", () => {
  if (!ensurePermission("export_data")) return;
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `crm-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

load();
const authSeeded = ensureAuthSeed();
const testUserAdded = ensureUserExists({
  nome: "Adilson",
  email: "adilson@helyo.com.br",
  senha: "123456",
  perfil: "admin"
});
ensureSeed();
if (!state.auth.users.some((u) => u.id === state.auth.currentUserId && u.ativo !== false)) {
  state.auth.currentUserId = null;
}
if (authSeeded || testUserAdded) save();
refreshAll();
runSlaMonitor();
setInterval(runSlaMonitor, 60 * 1000);
