import { useEffect, useMemo, useState } from "react";
import {
  createCompanyAsset,
  createCompanyAssetPhoto,
  getCompanyById,
  listCompanyAssets,
  listCompanyContacts,
  listCompanyHistory,
  listCompanyInteractions,
  listCompanyOmiePurchases,
  listCompanyOmieReceivables,
  listCompanyOpportunities,
  listCompanyOpportunityStageHistory,
  listCompanySalesOrders,
  listCompanyTasks,
  uploadCompanyAssetPhoto
} from "../lib/revenueApi";
import { stageLabel } from "../lib/pipelineStages";
import { SALES_TYPES } from "../lib/productCatalog";
import { formatBrazilPhone, toTelDigits, toWhatsAppBrazilNumber } from "../lib/phone";

const CUSTOMER_MODAL_TABS = [
  { id: "overview", label: "Resumo" },
  { id: "history", label: "Historico" },
  { id: "opportunities", label: "Propostas" },
  { id: "omie_purchases", label: "Compras OMIE" },
  { id: "omie_products", label: "Produtos OMIE" },
  { id: "omie_receivables", label: "Contas a Receber" },
  { id: "tasks", label: "Agenda" },
  { id: "assets", label: "Raio-X do Parque" },
  { id: "interactions", label: "Interacoes" }
];

function emptyAssetForm() {
  return {
    model_name: "",
    contract_cost: "",
    acquisition_date: "",
    install_date: "",
    serial_number: "",
    location_description: "",
    notes: ""
  };
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateFromIso(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatBirthDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function formatUnits(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  const integerPart = Math.round(parsed);
  if (Math.abs(parsed - integerPart) < 0.000001) {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(integerPart);
  }
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(parsed);
}

function taskStatusLabel(value) {
  const map = {
    todo: "A Fazer",
    in_progress: "Em Andamento",
    done: "Concluida",
    cancelled: "Cancelada"
  };
  return map[value] || String(value || "-");
}

function visitMethodLabel(value) {
  const map = {
    geo: "Geolocalizacao",
    geo_pin: "Geolocalizacao + PIN"
  };
  return map[value] || "Geolocalizacao";
}

function opportunityStatusLabel(value) {
  const map = {
    open: "Aberta",
    won: "Ganha",
    lost: "Perdida",
    on_hold: "Em espera"
  };
  return map[value] || String(value || "-");
}

function interactionTypeLabel(value) {
  const map = {
    whatsapp: "WhatsApp",
    call: "Chamada",
    note: "Anotacao"
  };
  return map[value] || String(value || "-");
}

function directionLabel(value) {
  const map = {
    inbound: "Entrada",
    outbound: "Saida"
  };
  return map[value] || "-";
}

function orderStatusLabel(value) {
  const map = {
    pending: "Pendente",
    approved: "Aprovado",
    cancelled: "Cancelado",
    draft: "Rascunho"
  };
  return map[value] || String(value || "-");
}

function orderTypeLabel(value) {
  return SALES_TYPES.find((item) => item.value === value)?.label || String(value || "-");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function pickPreferredOmieProductCode(item) {
  const source = item && typeof item === "object" ? item : {};
  const candidates = [
    source.codigo_produto_comercial,
    source.codigo,
    source.codigo_produto,
    source.codigo_produto_omie
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!candidates.length) return "";
  const withLetters = candidates.find((value) => /[a-zA-Z]/.test(value));
  return withLetters || candidates[0];
}

function isVisitTask(task) {
  const haystack = `${task?.task_type || ""} ${task?.title || ""}`;
  const normalized = normalizeText(haystack);
  return normalized.includes("visita") || normalized.includes("visit");
}

function shortText(value, maxLength = 180) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "-";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function nextTaskDateValue(task) {
  if (task?.scheduled_start_at) {
    const parsed = new Date(task.scheduled_start_at).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (task?.due_date) {
    const parsed = new Date(`${task.due_date}T00:00:00`).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.POSITIVE_INFINITY;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function visitExecutionSummary(task) {
  if (!isVisitTask(task)) return "-";
  if (task.visit_checkout_at) {
    return `Check-out ${formatDateTime(task.visit_checkout_at)} · ${task.visit_checkout_note || "Sem resumo"}`;
  }
  if (task.visit_checkin_at) {
    const distance = parseOptionalNumber(task.visit_checkin_distance_meters);
    const distanceLabel = Number.isFinite(distance) ? ` · Distancia ${Math.round(distance)}m` : "";
    return `Check-in ${formatDateTime(task.visit_checkin_at)} (${visitMethodLabel(task.visit_checkin_method)})${distanceLabel}`;
  }
  return "Check-in pendente";
}

function meetingSummary(task) {
  if (!task?.meeting_join_url) return "-";
  const provider = task.meeting_provider === "google_meet" ? "Google Meet" : task.meeting_provider || "Reuniao online";
  const start = task.meeting_start_at ? formatDateTime(task.meeting_start_at) : "-";
  return `${provider} · ${start}`;
}

function isReceivableOverdue(receivable) {
  const normalizedStatus = normalizeText(receivable?.status || "");
  return normalizedStatus.includes("atras");
}

export default function CustomerHistoryModal({ open, companyId, companyName, onClose, onRequestEditCompany = null }) {
  const [selectedTab, setSelectedTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [companyProfile, setCompanyProfile] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [opportunityStageRows, setOpportunityStageRows] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [assetForm, setAssetForm] = useState(() => emptyAssetForm());
  const [savingAsset, setSavingAsset] = useState(false);
  const [uploadingAssetId, setUploadingAssetId] = useState("");
  const [assetFeedback, setAssetFeedback] = useState({ type: "", message: "" });
  const [omiePurchasesLoading, setOmiePurchasesLoading] = useState(false);
  const [omiePurchasesError, setOmiePurchasesError] = useState("");
  const [omiePurchasesFetched, setOmiePurchasesFetched] = useState(false);
  const [omieReceivablesLoading, setOmieReceivablesLoading] = useState(false);
  const [omieReceivablesError, setOmieReceivablesError] = useState("");
  const [omieReceivablesFetched, setOmieReceivablesFetched] = useState(false);
  const [omiePurchases, setOmiePurchases] = useState({
    summary: {},
    orders: [],
    receivables_summary: {},
    receivables: [],
    purchase_warnings: [],
    receivables_warnings: [],
    warnings: [],
    customer: {}
  });

  useEffect(() => {
    if (!open) return;
    function handleEscape(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !companyId) return;
    let active = true;

    setSelectedTab("overview");
    setLoading(true);
    setError("");
    setAssetFeedback({ type: "", message: "" });
    setAssetForm(emptyAssetForm());
    setOmiePurchasesLoading(false);
    setOmiePurchasesError("");
    setOmiePurchasesFetched(false);
    setOmieReceivablesLoading(false);
    setOmieReceivablesError("");
    setOmieReceivablesFetched(false);
    setOmiePurchases({
      summary: {},
      orders: [],
      receivables_summary: {},
      receivables: [],
      purchase_warnings: [],
      receivables_warnings: [],
      warnings: [],
      customer: {}
    });

    Promise.all([
      getCompanyById(companyId),
      listCompanyHistory({ companyId, limit: 220 }),
      listCompanyOpportunities(companyId),
      listCompanyOpportunityStageHistory(companyId),
      listCompanyTasks(companyId),
      listCompanyContacts(companyId),
      listCompanyInteractions(companyId),
      listCompanySalesOrders(companyId),
      listCompanyAssets(companyId)
    ])
      .then((result) => {
        if (!active) return;
        const [profileData, historyData, opportunityData, stageData, taskData, contactData, interactionData, ordersData, assetsData] =
          result;
        setCompanyProfile(profileData);
        setHistoryRows(historyData);
        setOpportunities(opportunityData);
        setOpportunityStageRows(stageData);
        setTasks(taskData);
        setContacts(contactData);
        setInteractions(interactionData);
        setSalesOrders(ordersData);
        setAssets(assetsData);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [companyId, open]);

  useEffect(() => {
    const shouldLoadOmiePurchases = selectedTab === "omie_purchases" || selectedTab === "omie_products";
    if (!open || !shouldLoadOmiePurchases || omiePurchasesFetched) return;

    const cnpjDigits = String(companyProfile?.cnpj || "").replace(/\D/g, "");
    if (cnpjDigits.length !== 14) {
      setOmiePurchasesError("Cliente sem CNPJ valido para consultar compras no OMIE.");
      return;
    }

    let active = true;
    setOmiePurchasesLoading(true);
    setOmiePurchasesError("");

    listCompanyOmiePurchases({ id: companyId, cnpj: cnpjDigits })
      .then((data) => {
        if (!active) return;
        setOmiePurchases((prev) => ({
          ...prev,
          summary: data.summary || {},
          orders: Array.isArray(data.orders) ? data.orders : [],
          purchase_warnings: Array.isArray(data.purchase_warnings) ? data.purchase_warnings : [],
          customer: data.customer || prev.customer || {}
        }));
        setOmiePurchasesFetched(true);
      })
      .catch((err) => {
        if (!active) return;
        setOmiePurchasesError(err.message);
        setOmiePurchases((prev) => ({
          ...prev,
          summary: {},
          orders: [],
          purchase_warnings: []
        }));
      })
      .finally(() => {
        if (active) setOmiePurchasesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, selectedTab, companyProfile?.cnpj, omiePurchasesFetched]);

  useEffect(() => {
    if (!open || selectedTab !== "omie_receivables" || omieReceivablesFetched) return;

    const cnpjDigits = String(companyProfile?.cnpj || "").replace(/\D/g, "");
    if (cnpjDigits.length !== 14) {
      setOmieReceivablesError("Cliente sem CNPJ valido para consultar contas a receber no OMIE.");
      return;
    }

    let active = true;
    setOmieReceivablesLoading(true);
    setOmieReceivablesError("");

    listCompanyOmieReceivables(
      { id: companyId, cnpj: cnpjDigits },
      {
        records_per_page: 500,
        max_pages: 30,
        page_concurrency: 4
      }
    )
      .then((data) => {
        if (!active) return;
        setOmiePurchases((prev) => ({
          ...prev,
          receivables_summary: data.receivables_summary || {},
          receivables: Array.isArray(data.receivables) ? data.receivables : [],
          receivables_warnings: Array.isArray(data.receivables_warnings) ? data.receivables_warnings : [],
          customer: data.customer || prev.customer || {}
        }));
        setOmieReceivablesFetched(true);
      })
      .catch((err) => {
        if (!active) return;
        setOmieReceivablesError(err.message);
        setOmiePurchases((prev) => ({
          ...prev,
          receivables_summary: {},
          receivables: [],
          receivables_warnings: []
        }));
      })
      .finally(() => {
        if (active) setOmieReceivablesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, selectedTab, companyProfile?.cnpj, omieReceivablesFetched]);

  const visitTasks = useMemo(() => tasks.filter((task) => isVisitTask(task)), [tasks]);
  const pendingTasks = useMemo(
    () => tasks.filter((task) => task.status === "todo" || task.status === "in_progress"),
    [tasks]
  );

  const openOpportunities = useMemo(
    () => opportunities.filter((item) => item.status === "open").length,
    [opportunities]
  );

  const latestInteraction = useMemo(() => interactions[0] || null, [interactions]);

  const nextVisit = useMemo(() => {
    const activeVisits = visitTasks.filter((task) => task.status !== "done" && task.status !== "cancelled");
    if (!activeVisits.length) return null;
    const ordered = [...activeVisits].sort((a, b) => nextTaskDateValue(a) - nextTaskDateValue(b));
    return ordered[0] || null;
  }, [visitTasks]);

  const totalContractCost = useMemo(
    () => assets.reduce((acc, item) => acc + Number(item.contract_cost || 0), 0),
    [assets]
  );
  const omieSummary = useMemo(() => omiePurchases.summary || {}, [omiePurchases.summary]);
  const omieOrders = useMemo(
    () => (Array.isArray(omiePurchases.orders) ? omiePurchases.orders : []),
    [omiePurchases.orders]
  );
  const omieProductRows = useMemo(() => {
    const grouped = new Map();

    for (const order of omieOrders) {
      const orderDateIso = order?.data_pedido_iso || order?.data_faturamento_iso || order?.data_emissao_iso || null;
      const orderItems = Array.isArray(order?.itens) ? order.itens : Array.isArray(order?.items) ? order.items : [];

      for (const itemRaw of orderItems) {
        const item = itemRaw && typeof itemRaw === "object" && !Array.isArray(itemRaw) ? itemRaw : {};
        const code = pickPreferredOmieProductCode(item);
        const description = String(item.descricao || item.descricao_produto || item.nome || "").trim();
        const quantity = Number(parseOptionalNumber(item.quantidade ?? item.qtde ?? item.qtd ?? 0) || 0);

        if (!(quantity > 0) && !code && !description) continue;

        const normalizedCode = normalizeText(code || "-");
        const normalizedDescription = normalizeText(description || "produto sem descricao");
        const key = `${normalizedCode}|${normalizedDescription}`;
        const current = grouped.get(key) || {
          codigo: code || "-",
          descricao: description || "Produto sem descricao",
          total_units: 0,
          last_purchase_at: null
        };

        current.total_units += quantity > 0 ? quantity : 0;

        const nextTime = orderDateIso ? new Date(orderDateIso).getTime() : Number.NaN;
        const prevTime = current.last_purchase_at ? new Date(current.last_purchase_at).getTime() : Number.NaN;
        if (Number.isFinite(nextTime) && (!Number.isFinite(prevTime) || nextTime > prevTime)) {
          current.last_purchase_at = orderDateIso;
        }

        if ((!current.codigo || current.codigo === "-") && code) current.codigo = code;
        if ((!current.descricao || current.descricao === "Produto sem descricao") && description) current.descricao = description;
        grouped.set(key, current);
      }
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const byUnits = Number(b.total_units || 0) - Number(a.total_units || 0);
      if (byUnits !== 0) return byUnits;
      return String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR");
    });
  }, [omieOrders]);
  const omieProductsTotalUnits = useMemo(
    () => omieProductRows.reduce((acc, row) => acc + Number(row.total_units || 0), 0),
    [omieProductRows]
  );
  const omieReceivablesSummary = useMemo(
    () => omiePurchases.receivables_summary || {},
    [omiePurchases.receivables_summary]
  );
  const omieReceivables = useMemo(
    () => (Array.isArray(omiePurchases.receivables) ? omiePurchases.receivables : []),
    [omiePurchases.receivables]
  );
  const omieOverdueReceivables = useMemo(
    () => omieReceivables.filter((item) => isReceivableOverdue(item)),
    [omieReceivables]
  );
  const omieOverdueAmount = useMemo(
    () => omieOverdueReceivables.reduce((acc, item) => acc + Number(item.valor_aberto || 0), 0),
    [omieOverdueReceivables]
  );
  const omieOldestOverdueAt = useMemo(() => {
    const values = omieOverdueReceivables
      .map((item) => {
        const source = item.data_vencimento_iso || item.data_emissao_iso || null;
        if (!source) return null;
        const parsed = new Date(source).getTime();
        if (!Number.isFinite(parsed)) return null;
        return { source, parsed };
      })
      .filter(Boolean);
    if (!values.length) return null;
    values.sort((a, b) => a.parsed - b.parsed);
    return values[0].source;
  }, [omieOverdueReceivables]);
  const omiePurchaseWarnings = useMemo(() => {
    if (Array.isArray(omiePurchases.purchase_warnings)) return omiePurchases.purchase_warnings;
    return Array.isArray(omiePurchases.warnings) ? omiePurchases.warnings : [];
  }, [omiePurchases.purchase_warnings, omiePurchases.warnings]);
  const omieReceivablesWarnings = useMemo(() => {
    if (Array.isArray(omiePurchases.receivables_warnings)) return omiePurchases.receivables_warnings;
    return Array.isArray(omiePurchases.warnings) ? omiePurchases.warnings : [];
  }, [omiePurchases.receivables_warnings, omiePurchases.warnings]);

  const timelineRows = useMemo(() => {
    const eventItems = historyRows.map((row) => {
      const payload = row.payload || {};
      if (row.event_name === "task_flow_status_changed") {
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          origin: "agenda",
          item: payload.task_title || "Atividade",
          details: `${taskStatusLabel(payload.from_status)} -> ${taskStatusLabel(payload.to_status)}`,
          note: payload.comment || "-"
        };
      }
      if (row.event_name === "task_visit_checkin") {
        const distance = parseOptionalNumber(payload.checkin_distance_meters);
        const radius = parseOptionalNumber(payload.target_radius_meters);
        const distanceLabel = Number.isFinite(distance) ? `${Math.round(distance)}m` : "sem referencia de distancia";
        const radiusLabel = Number.isFinite(radius) ? ` (raio ${Math.round(radius)}m)` : "";
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          origin: "visita",
          item: payload.task_title || "Visita",
          details: `Check-in (${visitMethodLabel(payload.method)})`,
          note: `${distanceLabel}${radiusLabel}${payload.checkin_note ? ` · ${payload.checkin_note}` : ""}`
        };
      }
      if (row.event_name === "task_visit_checkout") {
        const duration = parseOptionalNumber(payload.duration_minutes);
        const durationLabel = Number.isFinite(duration) ? `Duracao ${duration} min` : "Duracao nao calculada";
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          origin: "visita",
          item: payload.task_title || "Visita",
          details: "Check-out concluido",
          note: `${durationLabel}${payload.checkout_note ? ` · ${payload.checkout_note}` : ""}`
        };
      }
      if (row.event_name === "task_online_meeting_scheduled") {
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          origin: "agenda",
          item: payload.task_title || "Reuniao online",
          details: "Reuniao agendada",
          note: payload.meeting_join_url || "-"
        };
      }
      return {
        id: `event-${row.id}`,
        happened_at: row.happened_at,
        origin: "evento",
        item: row.event_name || "Evento",
        details: "-",
        note: shortText(payload.comment || JSON.stringify(payload || {}))
      };
    });

    const stageItems = opportunityStageRows.map((row) => ({
      id: `stage-${row.id}`,
      happened_at: row.changed_at,
      origin: "pipeline",
      item: row.opportunities?.title || "Proposta",
      details: `${stageLabel(row.from_stage) || "-"} -> ${stageLabel(row.to_stage) || "-"}`,
      note: "Mudanca de etapa"
    }));

    const interactionItems = interactions.map((row) => ({
      id: `interaction-${row.id}`,
      happened_at: row.occurred_at || row.created_at,
      origin: interactionTypeLabel(row.interaction_type),
      item: row.subject || interactionTypeLabel(row.interaction_type),
      details: `${directionLabel(row.direction)} · ${row.contacts?.full_name || "Sem contato"}`,
      note: shortText(row.content)
    }));

    const visitItems = visitTasks.map((task) => ({
      id: `visit-${task.id}`,
      happened_at: task.scheduled_start_at || task.due_date || task.created_at,
      origin: "visita",
      item: task.title || "Visita",
      details: taskStatusLabel(task.status),
      note: shortText(task.description)
    }));

    return [...eventItems, ...stageItems, ...interactionItems, ...visitItems].sort(
      (a, b) => new Date(b.happened_at).getTime() - new Date(a.happened_at).getTime()
    );
  }, [historyRows, interactions, opportunityStageRows, visitTasks]);

  async function reloadAssets() {
    if (!companyId) return;
    const data = await listCompanyAssets(companyId);
    setAssets(data);
  }

  async function handleCreateAsset(event) {
    event.preventDefault();
    if (!companyId) return;

    const modelName = String(assetForm.model_name || "").trim();
    if (!modelName) {
      setAssetFeedback({ type: "error", message: "Informe o modelo do equipamento." });
      return;
    }

    const contractCostRaw = String(assetForm.contract_cost || "").trim();
    const normalizedCost = contractCostRaw ? Number(contractCostRaw.replace(",", ".")) : null;
    if (normalizedCost !== null && !Number.isFinite(normalizedCost)) {
      setAssetFeedback({ type: "error", message: "Custo de contrato invalido." });
      return;
    }

    setSavingAsset(true);
    setAssetFeedback({ type: "", message: "" });

    try {
      await createCompanyAsset({
        company_id: companyId,
        model_name: modelName,
        contract_cost: normalizedCost,
        acquisition_date: assetForm.acquisition_date || null,
        install_date: assetForm.install_date || null,
        serial_number: assetForm.serial_number || null,
        location_description: assetForm.location_description || null,
        notes: assetForm.notes || null
      });

      setAssetForm(emptyAssetForm());
      await reloadAssets();
      setAssetFeedback({ type: "success", message: "Equipamento adicionado ao raio-x do cliente." });
    } catch (err) {
      setAssetFeedback({ type: "error", message: err.message });
    } finally {
      setSavingAsset(false);
    }
  }

  async function handleAddAssetPhoto(event, assetId) {
    event.preventDefault();
    if (!companyId || !assetId) return;

    const formData = new FormData(event.currentTarget);
    const fileRaw = formData.get("photo_file");
    const file = typeof File !== "undefined" && fileRaw instanceof File && fileRaw.size ? fileRaw : null;
    const directPhotoUrl = String(formData.get("photo_url") || "").trim();
    const caption = String(formData.get("caption") || "").trim();

    if (!file && !directPhotoUrl) {
      setAssetFeedback({ type: "error", message: "Selecione uma foto ou informe URL da imagem para anexar." });
      return;
    }

    setUploadingAssetId(assetId);
    setAssetFeedback({ type: "", message: "" });

    try {
      let photoUrl = directPhotoUrl;
      let storagePath = null;

      if (file) {
        const uploadResult = await uploadCompanyAssetPhoto({
          companyId,
          assetId,
          file
        });
        photoUrl = uploadResult.publicUrl;
        storagePath = uploadResult.storagePath;
      }

      await createCompanyAssetPhoto({
        asset_id: assetId,
        photo_url: photoUrl,
        storage_path: storagePath,
        caption: caption || null
      });

      event.currentTarget.reset();
      await reloadAssets();
      setAssetFeedback({ type: "success", message: "Foto anexada ao equipamento." });
    } catch (err) {
      setAssetFeedback({ type: "error", message: err.message });
    } finally {
      setUploadingAssetId("");
    }
  }

  if (!open) return null;

  const customerLabel = companyProfile?.trade_name || companyName || "Cliente";
  const canEditCompany = Boolean(companyId) && typeof onRequestEditCompany === "function";

  return (
    <div className="customer-popup-overlay" role="presentation" onClick={onClose}>
      <article
        className="customer-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`Historico do cliente ${customerLabel}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="customer-popup-header">
          <div>
            <h3>Historico do cliente</h3>
            <p className="muted">
              <strong>{customerLabel}</strong>
            </p>
          </div>
          <div className="inline-actions customer-popup-header-actions">
            {canEditCompany ? (
              <button type="button" className="btn-primary btn-table-action" onClick={() => onRequestEditCompany(companyId)}>
                Editar conta
              </button>
            ) : null}
            <button type="button" className="btn-ghost btn-table-action" onClick={onClose}>
              Fechar
            </button>
          </div>
        </header>

        <div className="inline-actions company-tabs customer-popup-tabs">
          {CUSTOMER_MODAL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn-ghost btn-table-action ${selectedTab === tab.id ? "is-active" : ""}`}
              onClick={() => setSelectedTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? <p className="error-text top-gap">{error}</p> : null}
        {loading ? <p className="muted top-gap">Carregando historico completo do cliente...</p> : null}

        {!loading && selectedTab === "overview" ? (
          <div className="customer-popup-overview">
            <div className="customer-popup-overview-grid">
              <article className="customer-popup-card">
                <h4>Cadastro</h4>
                <dl className="customer-popup-facts">
                  <div>
                    <dt>Empresa</dt>
                    <dd>{companyProfile?.trade_name || customerLabel}</dd>
                  </div>
                  <div>
                    <dt>Razao social</dt>
                    <dd>{companyProfile?.legal_name || "-"}</dd>
                  </div>
                  <div>
                    <dt>CNPJ</dt>
                    <dd>{companyProfile?.cnpj || "-"}</dd>
                  </div>
                  <div>
                    <dt>Segmento</dt>
                    <dd>{companyProfile?.segmento || "-"}</dd>
                  </div>
                  <div>
                    <dt>Ciclo de vida</dt>
                    <dd>{companyProfile?.lifecycle_stage?.name || "-"}</dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{companyProfile?.email || "-"}</dd>
                  </div>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{formatBrazilPhone(companyProfile?.phone) || "-"}</dd>
                  </div>
                  <div className="customer-popup-fact-wide">
                    <dt>Endereco</dt>
                    <dd>{companyProfile?.address_full || "Nao informado"}</dd>
                  </div>
                </dl>
              </article>

              <article className="customer-popup-card">
                <h4>Visao comercial</h4>
                <div className="customer-popup-kpis">
                  <div>
                    <span>Propostas no pipeline</span>
                    <strong>{opportunities.length}</strong>
                    <small>{openOpportunities} abertas</small>
                  </div>
                  <div>
                    <span>Pedidos/propostas emitidas</span>
                    <strong>{salesOrders.length}</strong>
                    <small>{brl(salesOrders.reduce((acc, row) => acc + Number(row.total_amount || 0), 0))}</small>
                  </div>
                  <div>
                    <span>Atividades pendentes</span>
                    <strong>{pendingTasks.length}</strong>
                    <small>{visitTasks.length} visitas</small>
                  </div>
                  <div>
                    <span>Interacoes registradas</span>
                    <strong>{interactions.length}</strong>
                    <small>{latestInteraction ? formatDateTime(latestInteraction.occurred_at || latestInteraction.created_at) : "-"}</small>
                  </div>
                  <div>
                    <span>Equipamentos no parque</span>
                    <strong>{assets.length}</strong>
                    <small>{assets.length ? "Raio-x atualizado" : "Nenhum equipamento cadastrado"}</small>
                  </div>
                  <div>
                    <span>Custo contratual do parque</span>
                    <strong>{brl(totalContractCost)}</strong>
                    <small>{assets.length ? "Soma dos custos por equipamento" : "-"}</small>
                  </div>
                </div>
                <p className="customer-popup-highlight">
                  Proxima visita:{" "}
                  <strong>
                    {nextVisit
                      ? `${nextVisit.title || "Visita"} (${formatDateTime(
                          nextVisit.scheduled_start_at || nextVisit.due_date || nextVisit.created_at
                        )})`
                      : "Nenhuma visita pendente"}
                  </strong>
                </p>
              </article>
            </div>

            <article className="customer-popup-card top-gap">
              <h4>Contatos e acoes rapidas</h4>
              <div className="table-wrap top-gap">
                <table>
                  <thead>
                    <tr>
                      <th>Contato</th>
                      <th>Cargo</th>
                      <th>E-mail</th>
                      <th>WhatsApp</th>
                      <th>Nascimento</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => {
                      const whatsappDigits = toWhatsAppBrazilNumber(contact.whatsapp || contact.phone);
                      const phoneDigits = toTelDigits(contact.phone || contact.whatsapp);
                      return (
                        <tr key={contact.id}>
                          <td>{contact.full_name || "-"}</td>
                          <td>{contact.role_title || "-"}</td>
                          <td>{contact.email || "-"}</td>
                          <td>{formatBrazilPhone(contact.whatsapp || contact.phone) || "-"}</td>
                          <td>{formatBirthDate(contact.birth_date)}</td>
                          <td>
                            <div className="inline-actions">
                              {contact.email ? (
                                <a className="btn-ghost btn-table-action" href={`mailto:${contact.email}`}>
                                  E-mail
                                </a>
                              ) : null}
                              {whatsappDigits ? (
                                <a
                                  className="btn-ghost btn-table-action"
                                  href={`https://wa.me/${whatsappDigits}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  WhatsApp
                                </a>
                              ) : null}
                              {phoneDigits ? (
                                <a className="btn-ghost btn-table-action" href={`tel:${phoneDigits}`}>
                                  Ligar
                                </a>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!contacts.length ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          Nenhum contato cadastrado para este cliente.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        ) : null}

        {!loading && selectedTab === "history" ? (
          <div className="table-wrap top-gap">
            <table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Origem</th>
                  <th>Item</th>
                  <th>Detalhe</th>
                  <th>Resumo</th>
                </tr>
              </thead>
              <tbody>
                {timelineRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.happened_at)}</td>
                    <td>{row.origin}</td>
                    <td>{row.item || "-"}</td>
                    <td>{row.details || "-"}</td>
                    <td>{row.note || "-"}</td>
                  </tr>
                ))}
                {!timelineRows.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Ainda nao ha historico para este cliente.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && selectedTab === "opportunities" ? (
          <div className="customer-popup-opportunities">
            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Proposta no pipeline</th>
                    <th>Etapa</th>
                    <th>Status</th>
                    <th>Valor estimado</th>
                    <th>Fechamento previsto</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title || "-"}</td>
                      <td>{stageLabel(item.stage) || "-"}</td>
                      <td>{opportunityStatusLabel(item.status)}</td>
                      <td>{brl(item.estimated_value)}</td>
                      <td>{formatDate(item.expected_close_date)}</td>
                    </tr>
                  ))}
                  {!opportunities.length ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        Nenhuma proposta no pipeline para este cliente.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Proposta</th>
                    <th>Etapa anterior</th>
                    <th>Nova etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunityStageRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.changed_at)}</td>
                      <td>{row.opportunities?.title || "-"}</td>
                      <td>{stageLabel(row.from_stage) || "-"}</td>
                      <td>{stageLabel(row.to_stage) || "-"}</td>
                    </tr>
                  ))}
                  {!opportunityStageRows.length ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        Sem mudancas de etapa registradas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Pedido/Proposta</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Valor total</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {salesOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.order_number || "-"}</td>
                      <td>{orderTypeLabel(order.order_type)}</td>
                      <td>{orderStatusLabel(order.status)}</td>
                      <td>{brl(order.total_amount)}</td>
                      <td>{formatDate(order.order_date)}</td>
                    </tr>
                  ))}
                  {!salesOrders.length ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        Nenhum pedido/proposta emitida para este cliente.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!loading && selectedTab === "omie_purchases" ? (
          <div className="customer-popup-opportunities">
            {omiePurchasesError ? <p className="error-text top-gap">{omiePurchasesError}</p> : null}
            {omiePurchasesLoading ? <p className="muted top-gap">Consultando historico de compras no OMIE...</p> : null}

            {!omiePurchasesLoading && !omiePurchasesError ? (
              <>
                <article className="customer-popup-card top-gap">
                  <h4>Resumo de compras no OMIE</h4>
                  <div className="customer-popup-kpis">
                    <div>
                      <span>Pedidos encontrados</span>
                      <strong>{Number(omieSummary.total_orders || 0)}</strong>
                      <small>{omiePurchases.customer?.codigo_cliente_omie ? `Codigo OMIE ${omiePurchases.customer.codigo_cliente_omie}` : "-"}</small>
                    </div>
                    <div>
                      <span>Total em compras</span>
                      <strong>{brl(omieSummary.total_amount)}</strong>
                      <small>Somatorio de pedidos retornados</small>
                    </div>
                    <div>
                      <span>Ultima compra</span>
                      <strong>{formatDateTime(omieSummary.last_purchase_at)}</strong>
                      <small>Base OMIE</small>
                    </div>
                    <div>
                      <span>Compras em 90 dias</span>
                      <strong>{Number(omieSummary.orders_last_90_days || 0)}</strong>
                      <small>Recencia curta</small>
                    </div>
                    <div>
                      <span>Compras em 180 dias</span>
                      <strong>{Number(omieSummary.orders_last_180_days || 0)}</strong>
                      <small>Recencia media</small>
                    </div>
                    <div>
                      <span>Compras em 360 dias</span>
                      <strong>{Number(omieSummary.orders_last_360_days || 0)}</strong>
                      <small>Recencia anual</small>
                    </div>
                  </div>
                </article>

                {omiePurchaseWarnings.length ? (
                  <article className="customer-popup-card top-gap">
                    <h4>Avisos da consulta</h4>
                    <ul>
                      {omiePurchaseWarnings.map((warning, index) => (
                        <li key={`omie-purchase-warning-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </article>
                ) : null}

                <div className="table-wrap top-gap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Pedido</th>
                        <th>Etapa / Status</th>
                        <th>Valor total</th>
                        <th>Valor produtos</th>
                        <th>Codigo OMIE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {omieOrders.map((order, index) => (
                        <tr key={`${order.codigo_pedido || order.numero_pedido || "order"}-${index}`}>
                          <td>{formatDateTime(order.data_pedido_iso || order.data_faturamento_iso || order.data_emissao_iso)}</td>
                          <td>{order.numero_pedido || order.codigo_pedido || "-"}</td>
                          <td>{[order.etapa, order.status].filter(Boolean).join(" / ") || "-"}</td>
                          <td>{brl(order.valor_total)}</td>
                          <td>{brl(order.valor_mercadorias)}</td>
                          <td>{order.codigo_pedido || "-"}</td>
                        </tr>
                      ))}
                      {!omieOrders.length ? (
                        <tr>
                          <td colSpan={6} className="muted">
                            Nenhuma compra retornada pelo OMIE para este cliente.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {!loading && selectedTab === "omie_products" ? (
          <div className="customer-popup-opportunities">
            {omiePurchasesError ? <p className="error-text top-gap">{omiePurchasesError}</p> : null}
            {omiePurchasesLoading ? <p className="muted top-gap">Consultando itens de produtos no OMIE...</p> : null}

            {!omiePurchasesLoading && !omiePurchasesError ? (
              <>
                <article className="customer-popup-card top-gap">
                  <h4>Produtos adquiridos no OMIE</h4>
                  <div className="customer-popup-kpis">
                    <div>
                      <span>Produtos distintos</span>
                      <strong>{Number(omieProductRows.length || 0)}</strong>
                      <small>Agrupados por codigo + descricao</small>
                    </div>
                    <div>
                      <span>Unidades totais</span>
                      <strong>{formatUnits(omieProductsTotalUnits)}</strong>
                      <small>Somatorio das quantidades compradas</small>
                    </div>
                    <div>
                      <span>Pedidos analisados</span>
                      <strong>{Number(omieOrders.length || 0)}</strong>
                      <small>Base de compras OMIE</small>
                    </div>
                  </div>
                </article>

                {omiePurchaseWarnings.length ? (
                  <article className="customer-popup-card top-gap">
                    <h4>Avisos da consulta</h4>
                    <ul>
                      {omiePurchaseWarnings.map((warning, index) => (
                        <li key={`omie-products-warning-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </article>
                ) : null}

                <div className="table-wrap top-gap">
                  <table>
                    <thead>
                      <tr>
                        <th>Código do Produto</th>
                        <th>Descricao</th>
                        <th>Total de unidades</th>
                        <th>Ultima compra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {omieProductRows.map((item, index) => (
                        <tr key={`${item.codigo || "sem-codigo"}-${index}`}>
                          <td>{item.codigo || "-"}</td>
                          <td>{item.descricao || "Produto sem descricao"}</td>
                          <td>{formatUnits(item.total_units)}</td>
                          <td>{formatDateFromIso(item.last_purchase_at)}</td>
                        </tr>
                      ))}
                      {!omieProductRows.length ? (
                        <tr>
                          <td colSpan={4} className="muted">
                            Nenhum item de produto retornado pelo OMIE para este cliente.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {!loading && selectedTab === "omie_receivables" ? (
          <div className="customer-popup-opportunities">
            {omieReceivablesError ? <p className="error-text top-gap">{omieReceivablesError}</p> : null}
            {omieReceivablesLoading ? <p className="muted top-gap">Consultando contas a receber no OMIE...</p> : null}

            {!omieReceivablesLoading && !omieReceivablesError ? (
              <>
                <article className="customer-popup-card top-gap">
                  <h4>Contas em atraso (OMIE)</h4>
                  <div className="customer-popup-kpis">
                    <div>
                      <span>Titulos atrasados</span>
                      <strong>{Number(omieOverdueReceivables.length || 0)}</strong>
                      <small>Somente com saldo em aberto</small>
                    </div>
                    <div>
                      <span>Valor total atrasado</span>
                      <strong>{brl(omieOverdueAmount)}</strong>
                      <small>Base OMIE</small>
                    </div>
                    <div>
                      <span>Vencimento mais antigo</span>
                      <strong>{formatDateFromIso(omieOldestOverdueAt)}</strong>
                      <small>Apenas titulos atrasados</small>
                    </div>
                    <div>
                      <span>Total retornado OMIE</span>
                      <strong>{Number(omieReceivablesSummary.total_receivables || 0)}</strong>
                      <small>Inclui quitados e a vencer</small>
                    </div>
                  </div>
                </article>

                {omieReceivablesWarnings.length ? (
                  <article className="customer-popup-card top-gap">
                    <h4>Avisos da consulta</h4>
                    <ul>
                      {omieReceivablesWarnings.map((warning, index) => (
                        <li key={`omie-receivable-warning-${index}`}>{warning}</li>
                      ))}
                    </ul>
                  </article>
                ) : null}

                <div className="table-wrap top-gap">
                  <table>
                    <thead>
                      <tr>
                        <th>Vencimento</th>
                        <th>Documento</th>
                        <th>Status</th>
                        <th>Valor documento</th>
                        <th>Valor em aberto</th>
                        <th>Valor pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {omieOverdueReceivables.map((receivable, index) => (
                        <tr
                          key={`${receivable.codigo_lancamento_omie || receivable.numero_documento || "receivable"}-${index}`}
                        >
                          <td>{formatDateFromIso(receivable.data_vencimento_iso || receivable.data_emissao_iso)}</td>
                          <td>{receivable.numero_documento || receivable.codigo_lancamento_omie || "-"}</td>
                          <td>{receivable.status || "-"}</td>
                          <td>{brl(receivable.valor_documento)}</td>
                          <td>{brl(receivable.valor_aberto)}</td>
                          <td>{brl(receivable.valor_pago)}</td>
                        </tr>
                      ))}
                      {!omieOverdueReceivables.length ? (
                        <tr>
                          <td colSpan={6} className="muted">
                            Nenhuma conta em atraso retornada pelo OMIE para este cliente.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {!loading && selectedTab === "tasks" ? (
          <div className="table-wrap top-gap">
            <table>
              <thead>
                <tr>
                  <th>Atividade</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Prioridade</th>
                  <th>Agendamento</th>
                  <th>Data limite</th>
                  <th>Reuniao online</th>
                  <th>Execucao em campo</th>
                  <th>Descricao</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title || "-"}</td>
                    <td>
                      {task.task_type || "-"}{" "}
                      {isVisitTask(task) ? <span className="badge customer-visit-badge">Visita</span> : null}
                    </td>
                    <td>{taskStatusLabel(task.status)}</td>
                    <td>{task.priority || "-"}</td>
                    <td>
                      {task.scheduled_start_at
                        ? `${formatDateTime(task.scheduled_start_at)}${
                            task.scheduled_end_at ? ` ate ${formatDateTime(task.scheduled_end_at)}` : ""
                          }`
                        : "-"}
                    </td>
                    <td>{formatDate(task.due_date)}</td>
                    <td>
                      {task.meeting_join_url ? (
                        <a href={task.meeting_join_url} target="_blank" rel="noreferrer">
                          {meetingSummary(task)}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{visitExecutionSummary(task)}</td>
                    <td>{task.description || "-"}</td>
                  </tr>
                ))}
                {!tasks.length ? (
                  <tr>
                    <td colSpan={9} className="muted">
                      Nenhuma atividade de agenda para este cliente.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && selectedTab === "assets" ? (
          <div className="customer-assets-wrap">
            <article className="customer-popup-card top-gap">
              <h4>Raio-X do parque instalado</h4>
              <form className="form-grid top-gap" onSubmit={handleCreateAsset}>
                <input
                  required
                  placeholder="Modelo do equipamento"
                  value={assetForm.model_name}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, model_name: event.target.value }))}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Custo de contrato (R$)"
                  value={assetForm.contract_cost}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, contract_cost: event.target.value }))}
                />
                <input
                  type="date"
                  placeholder="Data de aquisicao"
                  value={assetForm.acquisition_date}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, acquisition_date: event.target.value }))}
                />
                <input
                  type="date"
                  placeholder="Data de instalacao"
                  value={assetForm.install_date}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, install_date: event.target.value }))}
                />
                <input
                  placeholder="Numero de serie (opcional)"
                  value={assetForm.serial_number}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, serial_number: event.target.value }))}
                />
                <input
                  placeholder="Local instalado (opcional)"
                  value={assetForm.location_description}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, location_description: event.target.value }))}
                />
                <textarea
                  placeholder="Observacoes tecnicas (opcional)"
                  value={assetForm.notes}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
                <div className="inline-actions">
                  <button type="submit" className="btn-primary" disabled={savingAsset}>
                    {savingAsset ? "Salvando..." : "Adicionar equipamento"}
                  </button>
                </div>
              </form>
              {assetFeedback.message ? (
                <p className={assetFeedback.type === "error" ? "error-text" : "success-text"}>{assetFeedback.message}</p>
              ) : null}
            </article>

            <div className="table-wrap top-gap">
              <table>
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Custo contrato</th>
                    <th>Aquisicao</th>
                    <th>Instalacao</th>
                    <th>Serie</th>
                    <th>Local</th>
                    <th>Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => (
                    <tr key={asset.id}>
                      <td>{asset.model_name || "-"}</td>
                      <td>{asset.contract_cost === null || asset.contract_cost === undefined ? "-" : brl(asset.contract_cost)}</td>
                      <td>{formatDate(asset.acquisition_date)}</td>
                      <td>{formatDate(asset.install_date)}</td>
                      <td>{asset.serial_number || "-"}</td>
                      <td>{asset.location_description || "-"}</td>
                      <td>{Array.isArray(asset.photos) ? asset.photos.length : 0}</td>
                    </tr>
                  ))}
                  {!assets.length ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        Nenhum equipamento cadastrado no parque deste cliente.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {assets.map((asset) => (
              <article key={`asset-photo-${asset.id}`} className="customer-popup-card top-gap">
                <div className="customer-asset-heading">
                  <h4>{asset.model_name || "Equipamento"}</h4>
                  <p className="muted">
                    Custo contrato:{" "}
                    <strong>
                      {asset.contract_cost === null || asset.contract_cost === undefined ? "-" : brl(asset.contract_cost)}
                    </strong>
                    {" · "}Aquisicao: <strong>{formatDate(asset.acquisition_date)}</strong>
                  </p>
                </div>

                <form className="form-grid top-gap" onSubmit={(event) => handleAddAssetPhoto(event, asset.id)}>
                  <input type="file" name="photo_file" accept="image/png,image/jpeg,image/webp" />
                  <input name="photo_url" placeholder="Ou informe URL da foto (opcional)" />
                  <input name="caption" placeholder="Legenda da foto (opcional)" />
                  <div className="inline-actions">
                    <button type="submit" className="btn-primary" disabled={uploadingAssetId === asset.id}>
                      {uploadingAssetId === asset.id ? "Enviando foto..." : "Adicionar foto"}
                    </button>
                  </div>
                </form>

                <div className="customer-asset-photo-grid top-gap">
                  {(asset.photos || []).map((photo) => (
                    <figure key={photo.id} className="customer-asset-photo-card">
                      <img src={photo.photo_url} alt={photo.caption || asset.model_name || "Equipamento"} loading="lazy" />
                      <figcaption>{photo.caption || "Sem legenda"}</figcaption>
                    </figure>
                  ))}
                  {!asset.photos?.length ? <p className="muted">Sem fotos para este equipamento.</p> : null}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {!loading && selectedTab === "interactions" ? (
          <div className="table-wrap top-gap">
            <table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Tipo</th>
                  <th>Direcao</th>
                  <th>Contato</th>
                  <th>Canal</th>
                  <th>Assunto</th>
                  <th>Resumo</th>
                </tr>
              </thead>
              <tbody>
                {interactions.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.occurred_at || row.created_at)}</td>
                    <td>{interactionTypeLabel(row.interaction_type)}</td>
                    <td>{directionLabel(row.direction)}</td>
                    <td>{row.contacts?.full_name || "-"}</td>
                    <td>{formatBrazilPhone(row.whatsapp_number || row.phone_number) || "-"}</td>
                    <td>{row.subject || "-"}</td>
                    <td>{row.content || "-"}</td>
                  </tr>
                ))}
                {!interactions.length ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Sem interacoes registradas para este cliente.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>
    </div>
  );
}
