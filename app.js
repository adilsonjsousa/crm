const STORAGE_KEY = "crm_comercial_tecnica_v3";

const state = {
  clientes: [],
  oportunidades: [],
  chamados: [],
  atividades: [],
  checkins: [],
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
  kpis: document.getElementById("kpis"),
  formCliente: document.getElementById("formCliente"),
  formOportunidade: document.getElementById("formOportunidade"),
  formChamado: document.getElementById("formChamado"),
  formAtividade: document.getElementById("formAtividade"),
  formSla: document.getElementById("formSla"),
  formOmie: document.getElementById("formOmie"),
  formCheckin: document.getElementById("formCheckin"),
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

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.clientes = parsed.clientes || [];
    state.oportunidades = parsed.oportunidades || [];
    state.chamados = parsed.chamados || [];
    state.atividades = parsed.atividades || [];
    state.checkins = parsed.checkins || [];
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
    email: "larissa@nexa.com.br",
    telefone: "(11) 91234-5678",
    segmento: "Indústria",
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
      const hasGeo = Number.isFinite(cliente.latitude) && Number.isFinite(cliente.longitude);
      const geo = hasGeo
        ? `${cliente.latitude.toFixed(6)}, ${cliente.longitude.toFixed(6)} (raio ${Number(cliente.raioMetros || state.checkinConfig.raioPadraoMetros)}m)`
        : "Sem georreferência";

      return `
      <tr>
        <td>${cliente.nome}</td>
        <td>${cliente.empresa}</td>
        <td>${cliente.email}</td>
        <td>${cliente.telefone}</td>
        <td>${cliente.segmento}</td>
        <td>${geo}</td>
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
      const coords = `${checkin.latitude.toFixed(6)}, ${checkin.longitude.toFixed(6)}`;
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
  renderClienteOptions();
  renderClientes();
  renderOportunidades();
  renderChamados();
  renderAtividades();
  renderCheckins();
  renderKpis();
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

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  });
}

async function registerCheckin(clienteId, vendedor, observacao, atividadeId) {
  const cliente = state.clientes.find((c) => c.id === clienteId);
  if (!cliente) {
    el.checkinStatus.textContent = "Cliente não encontrado para check-in.";
    return;
  }

  if (!Number.isFinite(cliente.latitude) || !Number.isFinite(cliente.longitude)) {
    el.checkinStatus.textContent =
      "Este cliente não possui latitude/longitude cadastradas. Atualize o cadastro para validar o check-in.";
    return;
  }

  el.checkinStatus.textContent = "Capturando localização atual do vendedor...";

  try {
    const position = await getCurrentPosition();
    const latitudeAtual = position.coords.latitude;
    const longitudeAtual = position.coords.longitude;
    const raioPermitido = Number(cliente.raioMetros || state.checkinConfig.raioPadraoMetros);
    const distancia = calculateDistanceMeters(latitudeAtual, longitudeAtual, cliente.latitude, cliente.longitude);
    const dentroDoRaio = distancia <= raioPermitido;
    const resultado = dentroDoRaio ? "Dentro do raio" : "Fora do raio";

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

    if (atividadeId && dentroDoRaio) {
      const atividade = state.atividades.find((a) => a.id === atividadeId);
      if (atividade) {
        atividade.status = "Check-in realizado";
        atividade.checkinId = checkinId;
      }
    }

    if (!dentroDoRaio) {
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
    el.checkinStatus.textContent = `Check-in registrado: ${resultado} (${Math.round(distancia)}m de distância).`;
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
          email: item.email || "nao-informado@omie",
          telefone: item.telefone || "-",
          segmento: item.segmento || "Omie",
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

el.formCliente.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);

  const latitude = toNumberOrNull(data.get("latitude"));
  const longitude = toNumberOrNull(data.get("longitude"));
  const raioMetros = Number(data.get("raioMetros") || state.checkinConfig.raioPadraoMetros);

  state.clientes.push({
    id: uid("cli"),
    nome: data.get("nome"),
    empresa: data.get("empresa"),
    email: data.get("email"),
    telefone: data.get("telefone"),
    segmento: data.get("segmento"),
    latitude,
    longitude,
    raioMetros
  });

  save();
  refreshAll();
  event.currentTarget.reset();
});

el.formOportunidade.addEventListener("submit", (event) => {
  event.preventDefault();
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
  const data = new FormData(event.currentTarget);

  state.integracaoOmie.appKey = String(data.get("appKey") || "").trim();
  state.integracaoOmie.appSecret = String(data.get("appSecret") || "").trim();
  state.integracaoOmie.proxyUrl = String(data.get("proxyUrl") || "").trim().replace(/\/$/, "");

  save();
  el.omieStatus.textContent = "Integração Omie salva. Pronto para sincronizar via proxy.";
});

el.formCheckin.addEventListener("submit", async (event) => {
  event.preventDefault();
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

el.btnOmieSyncClientes.addEventListener("click", () => syncOmie("clientes"));
el.btnOmieSyncOportunidades.addEventListener("click", () => syncOmie("oportunidades"));
el.btnOmieSyncChamados.addEventListener("click", () => syncOmie("chamados"));

el.tabelaOportunidades.addEventListener("click", (event) => {
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
ensureSeed();
refreshAll();
runSlaMonitor();
setInterval(runSlaMonitor, 60 * 1000);
