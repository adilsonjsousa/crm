import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCompanyInteraction,
  createCompany,
  createContact,
  findCompanyByCnpj,
  getCompanyById,
  getContactById,
  listCompanies,
  listCompanyContacts,
  listCompanyHistory,
  listCompanyInteractions,
  listCompanyLifecycleStages,
  listCompanyOpportunities,
  listCompanyOpportunityStageHistory,
  listCompanyOptions,
  listCompanyTasks,
  listContacts,
  lookupCompanyDataByCnpj,
  updateCompany,
  updateContact
} from "../lib/revenueApi";
import { stageLabel } from "../lib/pipelineStages";
import { formatBrazilPhone, toTelDigits, toWhatsAppBrazilNumber, validateBrazilPhoneOrEmpty } from "../lib/phone";
import CustomerHistoryModal from "../components/CustomerHistoryModal";

const SEGMENTOS = [
  "Tecnologia",
  "Indústria",
  "Serviços",
  "Varejo",
  "Gráfica",
  "Gráfica Digital",
  "Comunicação visual"
];

const EMPTY_COMPANY_FORM = {
  cnpj: "",
  trade_name: "",
  legal_name: "",
  email: "",
  phone: "",
  segmento: "",
  lifecycle_stage_id: "",
  address_full: "",
  checkin_validation_mode: "geo",
  checkin_radius_meters: "150",
  checkin_latitude: "",
  checkin_longitude: "",
  checkin_pin: "",
  contact_name: "",
  contact_email: "",
  contact_role_title: "",
  contact_whatsapp: "",
  contact_birth_date: ""
};

const EMPTY_CONTACT_FORM = {
  company_id: "",
  full_name: "",
  email: "",
  role_title: "",
  whatsapp: "",
  birth_date: ""
};

const EMPTY_EDIT_COMPANY_FORM = {
  cnpj: "",
  trade_name: "",
  legal_name: "",
  email: "",
  phone: "",
  segmento: "",
  lifecycle_stage_id: "",
  address_full: "",
  checkin_validation_mode: "geo",
  checkin_radius_meters: "150",
  checkin_latitude: "",
  checkin_longitude: "",
  checkin_pin: ""
};

const EMPTY_EDIT_CONTACT_FORM = {
  company_id: "",
  full_name: "",
  email: "",
  role_title: "",
  whatsapp: "",
  birth_date: ""
};

const CUSTOMER_TABS = [
  { id: "history", label: "Histórico" },
  { id: "opportunities", label: "Propostas" },
  { id: "tasks", label: "Agenda" },
  { id: "interactions", label: "Interações" }
];

function localDateTimeNow() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function emptyInteractionForm() {
  return {
    contact_id: "",
    interaction_type: "whatsapp",
    direction: "outbound",
    subject: "",
    content: "",
    whatsapp_number: "",
    phone_number: "",
    occurred_at_local: localDateTimeNow(),
    provider: "",
    provider_conversation_id: "",
    provider_call_id: "",
    recording_url: ""
  };
}

function cleanCnpj(value) {
  return String(value || "").replace(/\D/g, "");
}

function maskCnpj(value) {
  const digits = cleanCnpj(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function isValidCnpj(value) {
  const cnpj = cleanCnpj(value);
  if (!/^\d{14}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  function calcDigit(base, factor) {
    let total = 0;
    for (let i = 0; i < base.length; i += 1) {
      total += Number(base[i]) * factor;
      factor -= 1;
      if (factor < 2) factor = 9;
    }
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }

  const base12 = cnpj.slice(0, 12);
  const digit1 = calcDigit(base12, 5);
  const digit2 = calcDigit(`${base12}${digit1}`, 6);
  return cnpj === `${base12}${digit1}${digit2}`;
}

function formatBirthDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
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

function taskStatusLabel(value) {
  const map = {
    todo: "A Fazer",
    in_progress: "Em Andamento",
    done: "Concluída",
    cancelled: "Cancelada"
  };
  return map[value] || String(value || "-");
}

function visitMethodLabel(value) {
  const map = {
    geo: "Geolocalização",
    geo_pin: "Geolocalização + PIN"
  };
  return map[value] || "Geolocalização";
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function getDefaultLifecycleStageId(stages = []) {
  const active = stages.find((item) => item.is_active);
  if (active?.id) return active.id;
  const first = stages[0];
  return first?.id || "";
}

function visitExecutionSummary(task) {
  if (!task) return "-";
  const visitType = normalizeText(`${task.task_type || ""} ${task.title || ""}`);
  if (!visitType.includes("visita") && !visitType.includes("visit")) return "-";
  if (task.visit_checkout_at) {
    return `Check-out ${formatDateTime(task.visit_checkout_at)} · ${task.visit_checkout_note || "Sem resumo"}`;
  }
  if (task.visit_checkin_at) {
    const distance = parseOptionalNumber(task.visit_checkin_distance_meters);
    const distanceLabel = Number.isFinite(distance) ? ` · Distância ${Math.round(distance)}m` : "";
    return `Check-in ${formatDateTime(task.visit_checkin_at)} (${visitMethodLabel(task.visit_checkin_method)})${distanceLabel}`;
  }
  return "Check-in pendente";
}

function meetingSummary(task) {
  if (!task?.meeting_join_url) return "-";
  const provider = task.meeting_provider === "google_meet" ? "Google Meet" : task.meeting_provider || "Reunião online";
  const start = task.meeting_start_at ? formatDateTime(task.meeting_start_at) : "-";
  return `${provider} · ${start}`;
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
    note: "Anotação"
  };
  return map[value] || String(value || "-");
}

function directionLabel(value) {
  const map = {
    inbound: "Entrada",
    outbound: "Saída"
  };
  return map[value] || "-";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toIsoFromLocalInput(localValue) {
  const raw = String(localValue || "").trim();
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function upperLettersOnly(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-ZÀ-ÖØ-Ý\s]/g, "")
    .replace(/\s+/g, " ")
    .trimStart();
}

function normalizeCheckinMode(value) {
  return value === "geo_pin" ? "geo_pin" : "geo";
}

function normalizeCompanyCheckinConfig(raw) {
  const mode = normalizeCheckinMode(raw?.checkin_validation_mode);
  const radiusParsed = Number(String(raw?.checkin_radius_meters ?? "").trim().replace(",", "."));
  const radius = Number.isFinite(radiusParsed) ? Math.round(radiusParsed) : 150;

  if (radius < 30 || radius > 5000) {
    throw new Error("Raio de check-in deve estar entre 30 e 5000 metros.");
  }

  const latRaw = String(raw?.checkin_latitude ?? "").trim().replace(",", ".");
  const lngRaw = String(raw?.checkin_longitude ?? "").trim().replace(",", ".");
  const hasLat = Boolean(latRaw);
  const hasLng = Boolean(lngRaw);

  if (hasLat !== hasLng) {
    throw new Error("Informe latitude e longitude juntas para validar o raio de check-in.");
  }

  let latitude = null;
  let longitude = null;
  if (hasLat && hasLng) {
    latitude = Number(latRaw);
    longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error("Latitude inválida para check-in.");
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error("Longitude inválida para check-in.");
    }
  }

  const pin = String(raw?.checkin_pin || "").trim();
  if (mode === "geo_pin" && !pin) {
    throw new Error("Informe um PIN para clientes com validação Geo + PIN.");
  }

  return {
    checkin_validation_mode: mode,
    checkin_radius_meters: radius,
    checkin_latitude: latitude,
    checkin_longitude: longitude,
    checkin_pin: pin || null
  };
}

export default function CompaniesModule({
  focusTarget = "company",
  focusRequest = 0,
  editCompanyId = "",
  editCompanyRequest = 0,
  editContactId = "",
  editContactRequest = 0,
  editContactPayload = null
}) {
  const [companies, setCompanies] = useState([]);
  const [lifecycleStages, setLifecycleStages] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cnpjValidation, setCnpjValidation] = useState({ type: "idle", message: "" });
  const [form, setForm] = useState(EMPTY_COMPANY_FORM);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT_FORM);
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const [editForm, setEditForm] = useState(EMPTY_EDIT_COMPANY_FORM);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingContactId, setEditingContactId] = useState("");
  const [editContactForm, setEditContactForm] = useState(EMPTY_EDIT_CONTACT_FORM);
  const [editContactError, setEditContactError] = useState("");
  const [savingContactEdit, setSavingContactEdit] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCustomerTab, setSelectedCustomerTab] = useState("history");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [customerHistoryRows, setCustomerHistoryRows] = useState([]);
  const [customerOpportunities, setCustomerOpportunities] = useState([]);
  const [customerOpportunityStageRows, setCustomerOpportunityStageRows] = useState([]);
  const [customerTasks, setCustomerTasks] = useState([]);
  const [customerContacts, setCustomerContacts] = useState([]);
  const [customerInteractions, setCustomerInteractions] = useState([]);
  const [interactionForm, setInteractionForm] = useState(() => emptyInteractionForm());
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [customerHistoryModal, setCustomerHistoryModal] = useState({
    open: false,
    companyId: "",
    companyName: ""
  });
  const companyPanelRef = useRef(null);
  const contactPanelRef = useRef(null);

  const cnpjDigits = useMemo(() => cleanCnpj(form.cnpj), [form.cnpj]);
  const hasPrimaryContactData = useMemo(
    () =>
      [form.contact_name, form.contact_email, form.contact_role_title, form.contact_whatsapp, form.contact_birth_date]
        .map((value) => String(value || "").trim())
        .some(Boolean),
    [form.contact_birth_date, form.contact_email, form.contact_name, form.contact_role_title, form.contact_whatsapp]
  );
  const isCheckingCnpj = cnpjValidation.type === "checking";
  const isCnpjBlocked = cnpjValidation.type === "invalid" || cnpjValidation.type === "duplicate";
  const companyNameById = useMemo(() => {
    const map = new Map();
    for (const item of companies) {
      if (!map.has(item.id)) map.set(item.id, item.trade_name);
    }
    for (const item of companyOptions) {
      if (!map.has(item.id)) map.set(item.id, item.trade_name);
    }
    return map;
  }, [companies, companyOptions]);
  const selectedCompany = useMemo(() => {
    return companies.find((item) => item.id === selectedCompanyId) || companyOptions.find((item) => item.id === selectedCompanyId) || null;
  }, [companies, companyOptions, selectedCompanyId]);
  const interactionWhatsDigits = useMemo(
    () => toWhatsAppBrazilNumber(interactionForm.whatsapp_number || interactionForm.phone_number),
    [interactionForm.phone_number, interactionForm.whatsapp_number]
  );
  const interactionPhoneDigits = useMemo(
    () => toTelDigits(interactionForm.phone_number || interactionForm.whatsapp_number),
    [interactionForm.phone_number, interactionForm.whatsapp_number]
  );
  const interactionWhatsappHref = interactionWhatsDigits ? `https://wa.me/${interactionWhatsDigits}` : "";
  const interactionPhoneHref = interactionPhoneDigits ? `tel:${interactionPhoneDigits}` : "";
  const timelineRows = useMemo(() => {
    const eventRows = customerHistoryRows.map((row) => {
      const payload = row.payload || {};
      if (row.event_name === "task_flow_status_changed") {
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          type: "agenda",
          title: payload.task_title || "Atividade",
          details: `${taskStatusLabel(payload.from_status)} -> ${taskStatusLabel(payload.to_status)}`,
          note: payload.comment || "-"
        };
      }
      if (row.event_name === "task_visit_checkin") {
        const distance = parseOptionalNumber(payload.checkin_distance_meters);
        const radius = parseOptionalNumber(payload.target_radius_meters);
        const distanceLabel = Number.isFinite(distance) ? `${Math.round(distance)}m` : "Sem referência de distância";
        const radiusLabel = Number.isFinite(radius) ? ` (raio ${Math.round(radius)}m)` : "";
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          type: "visita",
          title: payload.task_title || "Visita",
          details: `Check-in (${visitMethodLabel(payload.method)})`,
          note: `${distanceLabel}${radiusLabel}${payload.checkin_note ? ` · ${payload.checkin_note}` : ""}`
        };
      }
      if (row.event_name === "task_visit_checkout") {
        const duration = parseOptionalNumber(payload.duration_minutes);
        const durationLabel = Number.isFinite(duration) ? `Duração ${duration} min` : "Duração não calculada";
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          type: "visita",
          title: payload.task_title || "Visita",
          details: "Check-out concluído",
          note: `${durationLabel}${payload.checkout_note ? ` · ${payload.checkout_note}` : ""}`
        };
      }
      if (row.event_name === "task_online_meeting_scheduled") {
        return {
          id: `event-${row.id}`,
          happened_at: row.happened_at,
          type: "agenda",
          title: payload.task_title || "Reunião online",
          details: "Reunião agendada",
          note: payload.meeting_join_url || "-"
        };
      }
      return {
        id: `event-${row.id}`,
        happened_at: row.happened_at,
        type: "evento",
        title: row.event_name,
        details: "-",
        note: payload.comment || JSON.stringify(payload || {})
      };
    });

    const stageRows = customerOpportunityStageRows.map((row) => ({
      id: `stage-${row.id}`,
      happened_at: row.changed_at,
      type: "pipeline",
      title: row.opportunities?.title || "Proposta",
      details: `${stageLabel(row.from_stage) || "-"} -> ${stageLabel(row.to_stage) || "-"}`,
      note: "Mudança de etapa da proposta"
    }));

    const interactionRows = customerInteractions.map((row) => ({
      id: `interaction-${row.id}`,
      happened_at: row.occurred_at || row.created_at,
      type: interactionTypeLabel(row.interaction_type),
      title: row.subject || interactionTypeLabel(row.interaction_type),
      details: `${directionLabel(row.direction)} · ${row.contacts?.full_name || "Sem contato definido"}`,
      note: row.content || "-"
    }));

    return [...eventRows, ...stageRows, ...interactionRows].sort((a, b) => new Date(b.happened_at).getTime() - new Date(a.happened_at).getTime());
  }, [customerHistoryRows, customerInteractions, customerOpportunityStageRows]);

  useEffect(() => {
    let active = true;

    if (!cnpjDigits) {
      setCnpjValidation({ type: "idle", message: "" });
      return () => {
        active = false;
      };
    }

    if (cnpjDigits.length < 14) {
      setCnpjValidation({ type: "idle", message: "Digite os 14 dígitos do CNPJ." });
      return () => {
        active = false;
      };
    }

    if (!isValidCnpj(cnpjDigits)) {
      setCnpjValidation({ type: "invalid", message: "CNPJ inválido (dígitos verificadores não conferem)." });
      return () => {
        active = false;
      };
    }

    const timer = setTimeout(async () => {
      setCnpjValidation({ type: "checking", message: "Validando CNPJ na base..." });
      try {
        const existing = await findCompanyByCnpj(cnpjDigits);
        if (!active) return;
        if (existing) {
          setCnpjValidation({
            type: "duplicate",
            message: `CNPJ já cadastrado para "${existing.trade_name}".`
          });
          return;
        }

        setCnpjValidation({ type: "checking", message: "CNPJ válido. Buscando dados da empresa..." });
        let lookupData = null;
        try {
          lookupData = await lookupCompanyDataByCnpj(cnpjDigits);
        } catch (lookupError) {
          if (!active) return;
          setCnpjValidation({
            type: "valid",
            message: "CNPJ válido e disponível. Não foi possível autopreencher agora."
          });
          return;
        }

        if (!active) return;
        if (lookupData) {
          setForm((prev) => ({
            ...prev,
            trade_name: upperLettersOnly(lookupData.trade_name) || prev.trade_name,
            legal_name: upperLettersOnly(lookupData.legal_name) || prev.legal_name,
            email: lookupData.email || prev.email,
            phone: lookupData.phone ? formatBrazilPhone(lookupData.phone) : prev.phone,
            address_full: lookupData.address_full || prev.address_full,
            segmento: lookupData.segmento || prev.segmento
          }));
          setCnpjValidation({ type: "valid", message: "CNPJ válido. Dados da empresa preenchidos automaticamente." });
          return;
        }

        setCnpjValidation({ type: "valid", message: "CNPJ válido e disponível." });
      } catch (err) {
        if (!active) return;
        setCnpjValidation({ type: "invalid", message: err.message });
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cnpjDigits]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [companiesData, optionsData, contactsData, lifecycleData] = await Promise.all([
        listCompanies(),
        listCompanyOptions(),
        listContacts(),
        listCompanyLifecycleStages({ includeInactive: true })
      ]);

      const normalizedOptions = optionsData.length
        ? optionsData
        : companiesData.map((item) => ({ id: item.id, trade_name: item.trade_name }));

      setCompanies(companiesData);
      setCompanyOptions(normalizedOptions);
      setContacts(contactsData);
      setLifecycleStages(lifecycleData);
      setForm((prev) => {
        if (prev.lifecycle_stage_id) return prev;
        const defaultStageId = getDefaultLifecycleStageId(lifecycleData);
        if (!defaultStageId) return prev;
        return {
          ...prev,
          lifecycle_stage_id: defaultStageId
        };
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function loadCustomerWorkspace(companyId) {
    if (!companyId) {
      setCustomerHistoryRows([]);
      setCustomerOpportunities([]);
      setCustomerOpportunityStageRows([]);
      setCustomerTasks([]);
      setCustomerContacts([]);
      setCustomerInteractions([]);
      setCustomerError("");
      return;
    }

    setCustomerLoading(true);
    setCustomerError("");
    try {
      const [historyData, opportunityData, opportunityStageData, taskData, contactData, interactionData] = await Promise.all([
        listCompanyHistory({ companyId, limit: 220 }),
        listCompanyOpportunities(companyId),
        listCompanyOpportunityStageHistory(companyId),
        listCompanyTasks(companyId),
        listCompanyContacts(companyId),
        listCompanyInteractions(companyId)
      ]);

      setCustomerHistoryRows(historyData);
      setCustomerOpportunities(opportunityData);
      setCustomerOpportunityStageRows(opportunityStageData);
      setCustomerTasks(taskData);
      setCustomerContacts(contactData);
      setCustomerInteractions(interactionData);
    } catch (err) {
      setCustomerError(err.message);
    } finally {
      setCustomerLoading(false);
    }
  }

  useEffect(() => {
    loadCustomerWorkspace(selectedCompanyId);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!focusRequest) return;
    const panelRef = focusTarget === "contact" ? contactPanelRef : companyPanelRef;
    if (!panelRef.current) return;

    panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstField = panelRef.current.querySelector("select, input, textarea");
    if (firstField && typeof firstField.focus === "function") {
      window.setTimeout(() => firstField.focus(), 180);
    }
  }, [focusRequest, focusTarget]);

  useEffect(() => {
    if (!editCompanyRequest) return;
    const normalizedCompanyId = String(editCompanyId || "").trim();
    if (!normalizedCompanyId) return;
    openEditCompanyById(normalizedCompanyId);
  }, [editCompanyId, editCompanyRequest]);

  useEffect(() => {
    if (!editContactRequest) return;
    const normalizedContactId = String(editContactId || "").trim();
    if (!normalizedContactId) return;
    openEditContactById(normalizedContactId, editContactPayload);
  }, [editContactId, editContactPayload, editContactRequest]);

  useEffect(() => {
    if (!editingCompanyId) return;
    function handleEscape(event) {
      if (event.key === "Escape") cancelEditCompany();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [editingCompanyId]);

  useEffect(() => {
    if (!editingContactId) return;
    function handleEscape(event) {
      if (event.key === "Escape") cancelEditContact();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [editingContactId]);

  async function handleCompanySubmit(event) {
    event.preventDefault();
    setError("");
    const normalizedCnpj = cleanCnpj(form.cnpj);

    try {
      if (!isValidCnpj(normalizedCnpj)) {
        setError("CNPJ inválido. Verifique o número informado.");
        return;
      }

      if (hasPrimaryContactData && !String(form.contact_name || "").trim()) {
        setError("Para salvar o contato no cadastro da empresa, informe o nome do contato.");
        return;
      }

      const existing = await findCompanyByCnpj(normalizedCnpj);
      if (existing) {
        setError(`Este CNPJ já está cadastrado para "${existing.trade_name}".`);
        setCnpjValidation({
          type: "duplicate",
          message: `CNPJ já cadastrado para "${existing.trade_name}".`
        });
        return;
      }

      const checkinConfig = normalizeCompanyCheckinConfig(form);
      const companyPhone = validateBrazilPhoneOrEmpty(form.phone, "Telefone da empresa");
      const primaryContactWhatsapp = validateBrazilPhoneOrEmpty(form.contact_whatsapp, "WhatsApp do contato");

      const createdCompany = await createCompany({
        cnpj: normalizedCnpj,
        trade_name: upperLettersOnly(form.trade_name),
        legal_name: upperLettersOnly(form.legal_name),
        email: form.email || null,
        phone: companyPhone,
        segmento: form.segmento || null,
        lifecycle_stage_id: form.lifecycle_stage_id || null,
        address_full: form.address_full || null,
        ...checkinConfig
      });

      if (hasPrimaryContactData) {
        await createContact({
          company_id: createdCompany.id,
          full_name: upperLettersOnly(form.contact_name),
          email: form.contact_email || null,
          role_title: form.contact_role_title || null,
          whatsapp: primaryContactWhatsapp,
          birth_date: form.contact_birth_date || null,
          is_primary: true
        });
      }

      setForm({
        ...EMPTY_COMPANY_FORM,
        lifecycle_stage_id: getDefaultLifecycleStageId(lifecycleStages)
      });
      setCnpjValidation({ type: "idle", message: "" });
      setContactForm((prev) => ({
        ...prev,
        company_id: createdCompany.id,
        full_name: "",
        email: "",
        role_title: "",
        whatsapp: "",
        birth_date: ""
      }));
      await load();
      setSelectedCompanyId(createdCompany.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleContactSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      if (!String(contactForm.full_name || "").trim()) {
        setError("Informe o nome do contato.");
        return;
      }

      const contactWhatsapp = validateBrazilPhoneOrEmpty(contactForm.whatsapp, "WhatsApp do contato");

      await createContact({
        company_id: contactForm.company_id || null,
        full_name: upperLettersOnly(contactForm.full_name),
        email: contactForm.email || null,
        role_title: contactForm.role_title || null,
        whatsapp: contactWhatsapp,
        birth_date: contactForm.birth_date || null
      });

      setContactForm((prev) => ({ ...prev, full_name: "", email: "", role_title: "", whatsapp: "", birth_date: "" }));
      await load();
      if (selectedCompanyId) await loadCustomerWorkspace(selectedCompanyId);
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditCompany(company) {
    setEditError("");
    setEditingCompanyId(company.id);
    setEditForm({
      cnpj: maskCnpj(company.cnpj),
      trade_name: upperLettersOnly(company.trade_name || ""),
      legal_name: upperLettersOnly(company.legal_name || ""),
      email: company.email || "",
      phone: formatBrazilPhone(company.phone || ""),
      segmento: company.segmento || "",
      lifecycle_stage_id: company.lifecycle_stage_id || "",
      address_full: company.address_full || "",
      checkin_validation_mode: normalizeCheckinMode(company.checkin_validation_mode),
      checkin_radius_meters: String(company.checkin_radius_meters || 150),
      checkin_latitude:
        company.checkin_latitude === null || company.checkin_latitude === undefined ? "" : String(company.checkin_latitude),
      checkin_longitude:
        company.checkin_longitude === null || company.checkin_longitude === undefined ? "" : String(company.checkin_longitude),
      checkin_pin: company.checkin_pin || ""
    });
  }

  async function openEditCompanyById(companyId) {
    const normalizedCompanyId = String(companyId || "").trim();
    if (!normalizedCompanyId) return;

    cancelEditContact();
    setError("");
    setSelectedCompanyId(normalizedCompanyId);

    try {
      const companyFromList = companies.find((item) => item.id === normalizedCompanyId) || null;
      if (companyFromList?.cnpj) {
        startEditCompany(companyFromList);
        return;
      }

      const profile = await getCompanyById(normalizedCompanyId);
      if (!profile) {
        setError("Não foi possível localizar a empresa para edição.");
        return;
      }

      startEditCompany(profile);
    } catch (err) {
      setError(err.message);
    }
  }

  function cancelEditCompany() {
    setEditingCompanyId("");
    setEditForm(EMPTY_EDIT_COMPANY_FORM);
    setEditError("");
    setSavingEdit(false);
  }

  async function handleEditCompanySubmit(event) {
    event.preventDefault();
    setEditError("");
    const normalizedCnpj = cleanCnpj(editForm.cnpj);

    try {
      if (!editingCompanyId) {
        setEditError("Selecione uma empresa para editar.");
        return;
      }

      if (!isValidCnpj(normalizedCnpj)) {
        setEditError("CNPJ inválido. Verifique o número informado.");
        return;
      }

      const existing = await findCompanyByCnpj(normalizedCnpj);
      if (existing && existing.id !== editingCompanyId) {
        setEditError(`Este CNPJ já está cadastrado para "${existing.trade_name}".`);
        return;
      }

      const checkinConfig = normalizeCompanyCheckinConfig(editForm);
      const companyPhone = validateBrazilPhoneOrEmpty(editForm.phone, "Telefone da empresa");

      setSavingEdit(true);
      await updateCompany(editingCompanyId, {
        cnpj: normalizedCnpj,
        trade_name: upperLettersOnly(editForm.trade_name),
        legal_name: upperLettersOnly(editForm.legal_name),
        email: editForm.email || null,
        phone: companyPhone,
        segmento: editForm.segmento || null,
        lifecycle_stage_id: editForm.lifecycle_stage_id || null,
        address_full: editForm.address_full || null,
        ...checkinConfig
      });

      cancelEditCompany();
      await load();
      if (selectedCompanyId) await loadCustomerWorkspace(selectedCompanyId);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function startEditContact(contact) {
    setEditContactError("");
    setEditingContactId(contact.id);
    setEditContactForm({
      company_id: contact.company_id || "",
      full_name: upperLettersOnly(contact.full_name || ""),
      email: contact.email || "",
      role_title: contact.role_title || "",
      whatsapp: formatBrazilPhone(contact.whatsapp || contact.phone || ""),
      birth_date: contact.birth_date || ""
    });
  }

  function normalizeExternalContactDraft(contactId, payload) {
    if (!payload || typeof payload !== "object") return null;
    const normalizedContactId = String(contactId || "").trim();
    if (!normalizedContactId) return null;
    return {
      id: normalizedContactId,
      company_id: String(payload.company_id || "").trim() || "",
      full_name: String(payload.full_name || "").trim(),
      email: String(payload.email || "").trim(),
      role_title: String(payload.role_title || "").trim(),
      whatsapp: formatBrazilPhone(payload.whatsapp || ""),
      birth_date: String(payload.birth_date || "").trim()
    };
  }

  async function openEditContactById(contactId, payload = null) {
    const normalizedContactId = String(contactId || "").trim();
    if (!normalizedContactId) return;

    cancelEditCompany();
    setEditContactError("");
    const externalDraft = normalizeExternalContactDraft(normalizedContactId, payload);

    try {
      const contactFromList = contacts.find((item) => item.id === normalizedContactId) || null;
      if (contactFromList) {
        startEditContact(contactFromList);
        if (contactFromList.company_id) setSelectedCompanyId(contactFromList.company_id);
        return;
      }

      if (externalDraft) {
        startEditContact(externalDraft);
        if (externalDraft.company_id) setSelectedCompanyId(externalDraft.company_id);
      }

      const profile = await getContactById(normalizedContactId);
      if (!profile) {
        if (!externalDraft) {
          setEditContactError("Não foi possível localizar o contato para edição.");
        }
        return;
      }

      startEditContact(profile);
      if (profile.company_id) setSelectedCompanyId(profile.company_id);
    } catch (err) {
      if (!externalDraft) {
        setEditContactError(err.message);
      }
    }
  }

  function cancelEditContact() {
    setEditingContactId("");
    setEditContactForm(EMPTY_EDIT_CONTACT_FORM);
    setEditContactError("");
    setSavingContactEdit(false);
  }

  async function handleEditContactSubmit(event) {
    event.preventDefault();
    setEditContactError("");

    try {
      if (!editingContactId) {
        setEditContactError("Selecione um contato para editar.");
        return;
      }

      if (!String(editContactForm.full_name || "").trim()) {
        setEditContactError("Informe o nome do contato.");
        return;
      }

      const contactWhatsapp = validateBrazilPhoneOrEmpty(editContactForm.whatsapp, "WhatsApp do contato");

      setSavingContactEdit(true);
      await updateContact(editingContactId, {
        company_id: editContactForm.company_id || null,
        full_name: upperLettersOnly(editContactForm.full_name),
        email: editContactForm.email || null,
        role_title: editContactForm.role_title || null,
        whatsapp: contactWhatsapp,
        birth_date: editContactForm.birth_date || null
      });

      cancelEditContact();
      await load();
      if (selectedCompanyId) await loadCustomerWorkspace(selectedCompanyId);
    } catch (err) {
      setEditContactError(err.message);
    } finally {
      setSavingContactEdit(false);
    }
  }

  function openCustomerWorkspace(company) {
    if (!company?.id) return;
    setSelectedCompanyId(company.id);
    setSelectedCustomerTab("history");
    setInteractionForm(emptyInteractionForm());
  }

  function openCustomerHistoryModal(company) {
    if (!company?.id) return;
    setCustomerHistoryModal({
      open: true,
      companyId: company.id,
      companyName: company.trade_name || "Cliente"
    });
  }

  function closeCustomerHistoryModal() {
    setCustomerHistoryModal((prev) => ({
      ...prev,
      open: false
    }));
  }

  function handleInteractionContactChange(contactId) {
    const contact = customerContacts.find((item) => item.id === contactId);
    setInteractionForm((prev) => ({
      ...prev,
      contact_id: contactId,
      whatsapp_number: formatBrazilPhone(contact?.whatsapp || prev.whatsapp_number),
      phone_number: formatBrazilPhone(contact?.phone || prev.phone_number)
    }));
  }

  async function handleInteractionSubmit(event) {
    event.preventDefault();
    if (!selectedCompanyId) {
      setCustomerError("Selecione um cliente para registrar interações.");
      return;
    }

    const content = String(interactionForm.content || "").trim();
    if (!content) {
      setCustomerError("Descreva a conversa/interação com o cliente.");
      return;
    }

    const whatsappRaw = String(interactionForm.whatsapp_number || "").trim();
    const phoneRaw = String(interactionForm.phone_number || "").trim();
    if (interactionForm.interaction_type === "whatsapp" && !whatsappRaw && !phoneRaw) {
      setCustomerError("Informe o WhatsApp envolvido na conversa.");
      return;
    }
    if (interactionForm.interaction_type === "call" && !phoneRaw && !whatsappRaw) {
      setCustomerError("Informe o telefone/WhatsApp da chamada.");
      return;
    }

    setSavingInteraction(true);
    setCustomerError("");
    try {
      const whatsappNumber = validateBrazilPhoneOrEmpty(whatsappRaw, "WhatsApp da interação");
      const phoneNumber = validateBrazilPhoneOrEmpty(phoneRaw, "Telefone da interação");

      await createCompanyInteraction({
        company_id: selectedCompanyId,
        contact_id: interactionForm.contact_id || null,
        interaction_type: interactionForm.interaction_type,
        direction: interactionForm.direction,
        subject: interactionForm.subject || null,
        content,
        whatsapp_number: whatsappNumber || null,
        phone_number: phoneNumber || null,
        occurred_at: toIsoFromLocalInput(interactionForm.occurred_at_local),
        provider: interactionForm.provider || null,
        provider_conversation_id: interactionForm.provider_conversation_id || null,
        provider_call_id: interactionForm.provider_call_id || null,
        recording_url: interactionForm.recording_url || null
      });

      setInteractionForm(emptyInteractionForm());
      await loadCustomerWorkspace(selectedCompanyId);
      setSelectedCustomerTab("interactions");
    } catch (err) {
      setCustomerError(err.message);
    } finally {
      setSavingInteraction(false);
    }
  }

  return (
    <section className="module">
      {error ? <p className="error-text">{error}</p> : null}

      <div className="two-col">
        <article className="panel">
          <h2>Últimas empresas</h2>
          <p className="muted">Clique em "Editar" para abrir o pop-up de edição.</p>
          {loading ? <p className="muted">Carregando...</p> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome Fantasia</th>
                  <th>CNPJ</th>
                  <th>Segmento</th>
                  <th>Ciclo de vida</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td>
                      <button type="button" className="btn-inline-link" onClick={() => openCustomerHistoryModal(company)}>
                        {company.trade_name}
                      </button>
                    </td>
                    <td>{maskCnpj(company.cnpj)}</td>
                    <td>{company.segmento || "-"}</td>
                    <td>{company.lifecycle_stage?.name || "-"}</td>
                    <td>
                      <button type="button" className="btn-ghost btn-table-action" onClick={() => openCustomerHistoryModal(company)}>
                        Pop-up 360
                      </button>
                      <button type="button" className="btn-ghost btn-table-action" onClick={() => openCustomerWorkspace(company)}>
                        Abrir aba
                      </button>
                      <button type="button" className="btn-ghost btn-table-action" onClick={() => startEditCompany(company)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {!companies.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Nenhuma empresa cadastrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel" ref={companyPanelRef}>
          <h2>Empresas</h2>
          <form className="form-grid" onSubmit={handleCompanySubmit}>
            <input
              required
              placeholder="CNPJ"
              value={form.cnpj}
              onChange={(event) => setForm((prev) => ({ ...prev, cnpj: maskCnpj(event.target.value) }))}
            />
            {cnpjValidation.message ? (
              <p className={`cnpj-status cnpj-status-${cnpjValidation.type}`}>{cnpjValidation.message}</p>
            ) : null}
            <input
              required
              placeholder="Nome Fantasia"
              value={form.trade_name}
              onChange={(event) => setForm((prev) => ({ ...prev, trade_name: upperLettersOnly(event.target.value) }))}
            />
            <input
              required
              placeholder="Razão Social"
              value={form.legal_name}
              onChange={(event) => setForm((prev) => ({ ...prev, legal_name: upperLettersOnly(event.target.value) }))}
            />
            <input
              placeholder="E-mail"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              placeholder="Telefone"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: formatBrazilPhone(event.target.value) }))}
            />
            <select value={form.segmento} onChange={(event) => setForm((prev) => ({ ...prev, segmento: event.target.value }))}>
              <option value="">Segmento</option>
              {SEGMENTOS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={form.lifecycle_stage_id}
              onChange={(event) => setForm((prev) => ({ ...prev, lifecycle_stage_id: event.target.value }))}
            >
              <option value="">Ciclo de vida</option>
              {lifecycleStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                  {stage.is_active ? "" : " (inativa)"}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Endereço completo"
              value={form.address_full}
              onChange={(event) => setForm((prev) => ({ ...prev, address_full: event.target.value }))}
            />
            {!lifecycleStages.length ? (
              <p className="warning-text">
                Nenhuma fase do ciclo de vida cadastrada. Configure em <strong>Configurações</strong>.
              </p>
            ) : null}

            <h3>Check-in de visitas (opcional)</h3>
            <select
              value={form.checkin_validation_mode}
              onChange={(event) => setForm((prev) => ({ ...prev, checkin_validation_mode: event.target.value }))}
            >
              <option value="geo">Somente geolocalização</option>
              <option value="geo_pin">Geolocalização + PIN do cliente</option>
            </select>
            <input
              type="number"
              min="30"
              max="5000"
              step="1"
              placeholder="Raio de validação (metros)"
              value={form.checkin_radius_meters}
              onChange={(event) => setForm((prev) => ({ ...prev, checkin_radius_meters: event.target.value }))}
            />
            <input
              type="number"
              step="0.000001"
              placeholder="Latitude do cliente"
              value={form.checkin_latitude}
              onChange={(event) => setForm((prev) => ({ ...prev, checkin_latitude: event.target.value }))}
            />
            <input
              type="number"
              step="0.000001"
              placeholder="Longitude do cliente"
              value={form.checkin_longitude}
              onChange={(event) => setForm((prev) => ({ ...prev, checkin_longitude: event.target.value }))}
            />
            {form.checkin_validation_mode === "geo_pin" ? (
              <input
                placeholder="PIN para validação no cliente"
                value={form.checkin_pin}
                onChange={(event) => setForm((prev) => ({ ...prev, checkin_pin: event.target.value }))}
              />
            ) : null}

            <h3>Contato principal (opcional)</h3>
            <input
              placeholder="Nome do contato"
              value={form.contact_name}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_name: upperLettersOnly(event.target.value) }))}
            />
            <input
              placeholder="E-mail do contato"
              value={form.contact_email}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_email: event.target.value }))}
            />
            <input
              placeholder="Cargo do contato"
              value={form.contact_role_title}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_role_title: event.target.value }))}
            />
            <input
              placeholder="WhatsApp do contato"
              value={form.contact_whatsapp}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_whatsapp: formatBrazilPhone(event.target.value) }))}
            />
            <input
              type="date"
              value={form.contact_birth_date}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_birth_date: event.target.value }))}
            />

            <button type="submit" className="btn-primary" disabled={isCheckingCnpj || isCnpjBlocked}>
              {isCheckingCnpj ? "Validando CNPJ..." : "Salvar empresa"}
            </button>
          </form>
        </article>
      </div>

      {editingCompanyId ? (
        <div className="edit-company-modal-overlay" role="presentation" onClick={cancelEditCompany}>
          <article
            className="edit-company-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Editar empresa cadastrada"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="edit-company-modal-header">
              <h2>Editar empresa cadastrada</h2>
              <button type="button" className="btn-ghost btn-table-action" onClick={cancelEditCompany}>
                Fechar
              </button>
            </div>
            <form className="form-grid" onSubmit={handleEditCompanySubmit}>
              <input
                required
                placeholder="CNPJ"
                value={editForm.cnpj}
                onChange={(event) => setEditForm((prev) => ({ ...prev, cnpj: maskCnpj(event.target.value) }))}
              />
              <input
                required
                placeholder="Nome Fantasia"
                value={editForm.trade_name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, trade_name: upperLettersOnly(event.target.value) }))}
              />
              <input
                required
                placeholder="Razão Social"
                value={editForm.legal_name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, legal_name: upperLettersOnly(event.target.value) }))}
              />
              <input
                placeholder="E-mail"
                value={editForm.email}
                onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                placeholder="Telefone"
                value={editForm.phone}
                onChange={(event) => setEditForm((prev) => ({ ...prev, phone: formatBrazilPhone(event.target.value) }))}
              />
              <select
                value={editForm.segmento}
                onChange={(event) => setEditForm((prev) => ({ ...prev, segmento: event.target.value }))}
              >
                <option value="">Segmento</option>
                {SEGMENTOS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={editForm.lifecycle_stage_id}
                onChange={(event) => setEditForm((prev) => ({ ...prev, lifecycle_stage_id: event.target.value }))}
              >
                <option value="">Ciclo de vida</option>
                {lifecycleStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                    {stage.is_active ? "" : " (inativa)"}
                  </option>
                ))}
              </select>
              <textarea
                placeholder="Endereço completo"
                value={editForm.address_full}
                onChange={(event) => setEditForm((prev) => ({ ...prev, address_full: event.target.value }))}
              />
              <h3>Check-in de visitas (opcional)</h3>
              <select
                value={editForm.checkin_validation_mode}
                onChange={(event) => setEditForm((prev) => ({ ...prev, checkin_validation_mode: event.target.value }))}
              >
                <option value="geo">Somente geolocalização</option>
                <option value="geo_pin">Geolocalização + PIN do cliente</option>
              </select>
              <input
                type="number"
                min="30"
                max="5000"
                step="1"
                placeholder="Raio de validação (metros)"
                value={editForm.checkin_radius_meters}
                onChange={(event) => setEditForm((prev) => ({ ...prev, checkin_radius_meters: event.target.value }))}
              />
              <input
                type="number"
                step="0.000001"
                placeholder="Latitude do cliente"
                value={editForm.checkin_latitude}
                onChange={(event) => setEditForm((prev) => ({ ...prev, checkin_latitude: event.target.value }))}
              />
              <input
                type="number"
                step="0.000001"
                placeholder="Longitude do cliente"
                value={editForm.checkin_longitude}
                onChange={(event) => setEditForm((prev) => ({ ...prev, checkin_longitude: event.target.value }))}
              />
              {editForm.checkin_validation_mode === "geo_pin" ? (
                <input
                  placeholder="PIN para validação no cliente"
                  value={editForm.checkin_pin}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, checkin_pin: event.target.value }))}
                />
              ) : null}
              <div className="inline-actions">
                <button type="submit" className="btn-primary" disabled={savingEdit}>
                  {savingEdit ? "Salvando..." : "Salvar alterações"}
                </button>
                <button type="button" className="btn-ghost" onClick={cancelEditCompany}>
                  Cancelar edição
                </button>
              </div>
              {editError ? <p className="error-text">{editError}</p> : null}
            </form>
          </article>
        </div>
      ) : null}

      <div className="two-col top-gap">
        <article className="panel" ref={contactPanelRef}>
          <h2>Criar contato (com ou sem vínculo)</h2>
          <form className="form-grid" onSubmit={handleContactSubmit}>
            <select
              value={contactForm.company_id}
              onChange={(event) => setContactForm((prev) => ({ ...prev, company_id: event.target.value }))}
            >
              <option value="">Sem vínculo com empresa</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.trade_name}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Nome do contato"
              value={contactForm.full_name}
              onChange={(event) => setContactForm((prev) => ({ ...prev, full_name: upperLettersOnly(event.target.value) }))}
            />
            <input
              placeholder="E-mail"
              value={contactForm.email}
              onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              placeholder="Cargo"
              value={contactForm.role_title}
              onChange={(event) => setContactForm((prev) => ({ ...prev, role_title: event.target.value }))}
            />
            <input
              placeholder="WhatsApp"
              value={contactForm.whatsapp}
              onChange={(event) => setContactForm((prev) => ({ ...prev, whatsapp: formatBrazilPhone(event.target.value) }))}
            />
            <input
              type="date"
              value={contactForm.birth_date}
              onChange={(event) => setContactForm((prev) => ({ ...prev, birth_date: event.target.value }))}
            />
            <button type="submit" className="btn-primary">Salvar contato</button>
          </form>
        </article>

        <article className="panel">
          <h2>Contatos recentes</h2>
          <p className="muted">Clique em "Editar" para abrir o pop-up de edição de contato.</p>
          {loading ? <p className="muted">Carregando...</p> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Contato</th>
                  <th>Cargo</th>
                  <th>E-mail</th>
                  <th>WhatsApp</th>
                  <th>Nascimento</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>
                      {contact.company_id ? (
                        <button
                          type="button"
                          className="btn-inline-link"
                          onClick={() =>
                            openCustomerHistoryModal({
                              id: contact.company_id,
                              trade_name: contact.companies?.trade_name || "Cliente"
                            })
                          }
                        >
                          {contact.companies?.trade_name || "Cliente"}
                        </button>
                      ) : (
                        "SEM VÍNCULO"
                      )}
                    </td>
                    <td>{contact.full_name}</td>
                    <td>{contact.role_title || "-"}</td>
                    <td>{contact.email || "-"}</td>
                    <td>{formatBrazilPhone(contact.whatsapp || contact.phone) || "-"}</td>
                    <td>{formatBirthDate(contact.birth_date)}</td>
                    <td>
                      <button type="button" className="btn-ghost btn-table-action" onClick={() => startEditContact(contact)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      {editingContactId ? (
        <div className="edit-company-modal-overlay" role="presentation" onClick={cancelEditContact}>
          <article
            className="edit-company-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="Editar contato cadastrado"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="edit-company-modal-header">
              <h2>Editar contato cadastrado</h2>
              <button type="button" className="btn-ghost btn-table-action" onClick={cancelEditContact}>
                Fechar
              </button>
            </div>
            <form className="form-grid" onSubmit={handleEditContactSubmit}>
              <select
                value={editContactForm.company_id}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, company_id: event.target.value }))}
              >
                <option value="">Sem vínculo com empresa</option>
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.trade_name}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Nome do contato"
                value={editContactForm.full_name}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, full_name: upperLettersOnly(event.target.value) }))}
              />
              <input
                placeholder="E-mail"
                value={editContactForm.email}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                placeholder="Cargo"
                value={editContactForm.role_title}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, role_title: event.target.value }))}
              />
              <input
                placeholder="WhatsApp"
                value={editContactForm.whatsapp}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, whatsapp: formatBrazilPhone(event.target.value) }))}
              />
              <input
                type="date"
                value={editContactForm.birth_date}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, birth_date: event.target.value }))}
              />
              <div className="inline-actions">
                <button type="submit" className="btn-primary" disabled={savingContactEdit}>
                  {savingContactEdit ? "Salvando..." : "Salvar contato"}
                </button>
                <button type="button" className="btn-ghost" onClick={cancelEditContact}>
                  Cancelar edição
                </button>
              </div>
              {editContactError ? <p className="error-text">{editContactError}</p> : null}
            </form>
          </article>
        </div>
      ) : null}

      <article className="panel top-gap">
        <h3>Aba do cliente (360)</h3>
        {!selectedCompanyId ? (
          <p className="muted">
            Clique no nome do cliente em “Últimas empresas” para abrir o pop-up 360, ou use “Abrir aba” para trabalhar no painel abaixo.
          </p>
        ) : (
          <>
            <p className="muted inline-actions">
              Cliente selecionado: <strong>{selectedCompany?.trade_name || companyNameById.get(selectedCompanyId) || "Cliente"}</strong>
              {selectedCompanyId ? (
                <button
                  type="button"
                  className="btn-ghost btn-table-action"
                  onClick={() =>
                    openCustomerHistoryModal({
                      id: selectedCompanyId,
                      trade_name: selectedCompany?.trade_name || companyNameById.get(selectedCompanyId) || "Cliente"
                    })
                  }
                >
                  Abrir pop-up 360
                </button>
              ) : null}
            </p>
            <div className="inline-actions company-tabs">
              {CUSTOMER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`btn-ghost btn-table-action ${selectedCustomerTab === tab.id ? "is-active" : ""}`}
                  onClick={() => setSelectedCustomerTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {customerError ? <p className="error-text">{customerError}</p> : null}
            {customerLoading ? <p className="muted top-gap">Carregando dados do cliente...</p> : null}

            {!customerLoading && selectedCustomerTab === "history" ? (
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
                        <td>{row.type}</td>
                        <td>{row.title || "-"}</td>
                        <td>{row.details || "-"}</td>
                        <td>{row.note || "-"}</td>
                      </tr>
                    ))}
                    {!timelineRows.length ? (
                      <tr>
                        <td colSpan={5} className="muted">
                          Ainda não há histórico para este cliente.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!customerLoading && selectedCustomerTab === "opportunities" ? (
              <>
                <div className="table-wrap top-gap">
                  <table>
                    <thead>
                      <tr>
                        <th>Proposta</th>
                        <th>Etapa</th>
                        <th>Status</th>
                        <th>Valor estimado</th>
                        <th>Fechamento previsto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerOpportunities.map((item) => (
                        <tr key={item.id}>
                          <td>{item.title}</td>
                          <td>{stageLabel(item.stage)}</td>
                          <td>{opportunityStatusLabel(item.status)}</td>
                          <td>{Number(item.estimated_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                          <td>{formatDate(item.expected_close_date)}</td>
                        </tr>
                      ))}
                      {!customerOpportunities.length ? (
                        <tr>
                          <td colSpan={5} className="muted">
                            Nenhuma proposta para este cliente.
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
                      {customerOpportunityStageRows.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDateTime(row.changed_at)}</td>
                          <td>{row.opportunities?.title || "-"}</td>
                          <td>{stageLabel(row.from_stage) || "-"}</td>
                          <td>{stageLabel(row.to_stage) || "-"}</td>
                        </tr>
                      ))}
                      {!customerOpportunityStageRows.length ? (
                        <tr>
                          <td colSpan={4} className="muted">
                            Sem movimentações de etapa para este cliente.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {!customerLoading && selectedCustomerTab === "tasks" ? (
              <div className="table-wrap top-gap">
                <table>
                  <thead>
                    <tr>
                      <th>Atividade</th>
                      <th>Etapa da agenda</th>
                      <th>Prioridade</th>
                      <th>Agendamento</th>
                      <th>Data limite</th>
                      <th>Reunião online</th>
                      <th>Execução em campo</th>
                      <th>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerTasks.map((task) => (
                      <tr key={task.id}>
                        <td>{task.title}</td>
                        <td>{taskStatusLabel(task.status)}</td>
                        <td>{task.priority || "-"}</td>
                        <td>
                          {task.scheduled_start_at
                            ? `${formatDateTime(task.scheduled_start_at)}${task.scheduled_end_at ? ` até ${formatDateTime(task.scheduled_end_at)}` : ""}`
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
                    {!customerTasks.length ? (
                      <tr>
                        <td colSpan={8} className="muted">
                          Nenhuma atividade de agenda para este cliente.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!customerLoading && selectedCustomerTab === "interactions" ? (
              <>
                <div className="table-wrap top-gap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contato</th>
                        <th>Cargo</th>
                        <th>WhatsApp</th>
                        <th>Telefone</th>
                        <th>Ações rápidas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerContacts.map((contact) => {
                        const quickWhatsapp = toWhatsAppBrazilNumber(contact.whatsapp || contact.phone);
                        const quickPhone = toTelDigits(contact.phone || contact.whatsapp);
                        return (
                          <tr key={`quick-${contact.id}`}>
                            <td>{contact.full_name}</td>
                            <td>{contact.role_title || "-"}</td>
                            <td>{formatBrazilPhone(contact.whatsapp) || "-"}</td>
                            <td>{formatBrazilPhone(contact.phone) || "-"}</td>
                            <td>
                              <div className="inline-actions">
                                <button
                                  type="button"
                                  className="btn-ghost btn-table-action"
                                  onClick={() =>
                                    setInteractionForm((prev) => ({
                                      ...prev,
                                      contact_id: contact.id,
                                      whatsapp_number: formatBrazilPhone(contact.whatsapp || prev.whatsapp_number),
                                      phone_number: formatBrazilPhone(contact.phone || prev.phone_number)
                                    }))
                                  }
                                >
                                  Usar no registro
                                </button>
                                {quickWhatsapp ? (
                                  <a href={`https://wa.me/${quickWhatsapp}`} target="_blank" rel="noreferrer" className="btn-ghost btn-table-action">
                                    Abrir WhatsApp
                                  </a>
                                ) : null}
                                {quickPhone ? (
                                  <a href={`tel:${quickPhone}`} className="btn-ghost btn-table-action">
                                    Iniciar chamada
                                  </a>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {!customerContacts.length ? (
                        <tr>
                          <td colSpan={5} className="muted">
                            Este cliente ainda não possui contatos vinculados.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <h4 className="top-gap">Registrar conversa/interação</h4>
                <form className="form-grid" onSubmit={handleInteractionSubmit}>
                  <select value={interactionForm.interaction_type} onChange={(event) => setInteractionForm((prev) => ({ ...prev, interaction_type: event.target.value }))}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="call">Chamada</option>
                    <option value="note">Anotação</option>
                  </select>
                  <select value={interactionForm.direction} onChange={(event) => setInteractionForm((prev) => ({ ...prev, direction: event.target.value }))}>
                    <option value="outbound">Saída</option>
                    <option value="inbound">Entrada</option>
                  </select>
                  <select value={interactionForm.contact_id} onChange={(event) => handleInteractionContactChange(event.target.value)}>
                    <option value="">Sem contato específico</option>
                    {customerContacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.full_name}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="WhatsApp envolvido"
                    value={interactionForm.whatsapp_number}
                    onChange={(event) =>
                      setInteractionForm((prev) => ({ ...prev, whatsapp_number: formatBrazilPhone(event.target.value) }))
                    }
                  />
                  <input
                    placeholder="Telefone da chamada"
                    value={interactionForm.phone_number}
                    onChange={(event) =>
                      setInteractionForm((prev) => ({ ...prev, phone_number: formatBrazilPhone(event.target.value) }))
                    }
                  />
                  <input
                    type="datetime-local"
                    value={interactionForm.occurred_at_local}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, occurred_at_local: event.target.value }))}
                  />
                  <input
                    placeholder="Assunto"
                    value={interactionForm.subject}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, subject: event.target.value }))}
                  />
                  <input
                    placeholder="Ferramenta integrada (ex.: Twilio)"
                    value={interactionForm.provider}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, provider: event.target.value }))}
                  />
                  <input
                    placeholder="ID conversa (WhatsApp)"
                    value={interactionForm.provider_conversation_id}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, provider_conversation_id: event.target.value }))}
                  />
                  <input
                    placeholder="ID conversa/chamada (ferramenta)"
                    value={interactionForm.provider_call_id}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, provider_call_id: event.target.value }))}
                  />
                  <input
                    placeholder="Link da gravação da chamada"
                    value={interactionForm.recording_url}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, recording_url: event.target.value }))}
                  />
                  <textarea
                    required
                    placeholder="Descrição da conversa/interação (obrigatório)"
                    value={interactionForm.content}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, content: event.target.value }))}
                  />
                  <div className="inline-actions">
                    <button type="submit" className="btn-primary" disabled={savingInteraction}>
                      {savingInteraction ? "Salvando..." : "Salvar interação"}
                    </button>
                    {interactionWhatsappHref ? (
                      <a href={interactionWhatsappHref} target="_blank" rel="noreferrer" className="btn-ghost btn-table-action">
                        Abrir WhatsApp
                      </a>
                    ) : null}
                    {interactionPhoneHref ? (
                      <a href={interactionPhoneHref} className="btn-ghost btn-table-action">
                        Iniciar chamada
                      </a>
                    ) : null}
                  </div>
                </form>

                <div className="table-wrap top-gap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data/Hora</th>
                        <th>Tipo</th>
                        <th>Contato</th>
                        <th>Canal</th>
                        <th>Resumo</th>
                        <th>Gravação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerInteractions.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDateTime(row.occurred_at || row.created_at)}</td>
                          <td>{interactionTypeLabel(row.interaction_type)}</td>
                          <td>{row.contacts?.full_name || "-"}</td>
                          <td>{formatBrazilPhone(row.whatsapp_number || row.phone_number) || "-"}</td>
                          <td>{row.content || "-"}</td>
                          <td>
                            {row.recording_url ? (
                              <a href={row.recording_url} target="_blank" rel="noreferrer">
                                Ouvir gravação
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                      {!customerInteractions.length ? (
                        <tr>
                          <td colSpan={6} className="muted">
                            Sem interações registradas para este cliente.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </>
        )}
      </article>

      <CustomerHistoryModal
        open={customerHistoryModal.open}
        companyId={customerHistoryModal.companyId}
        companyName={customerHistoryModal.companyName}
        onClose={closeCustomerHistoryModal}
        onRequestEditCompany={(companyId) => {
          closeCustomerHistoryModal();
          openEditCompanyById(companyId);
        }}
      />
    </section>
  );
}
