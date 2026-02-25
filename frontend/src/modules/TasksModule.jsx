import { useEffect, useMemo, useRef, useState } from "react";
import {
  createTask,
  deleteTask,
  listCompanyOptions,
  listSystemUsers,
  listTaskScheduleConflicts,
  listTasks,
  sendWhatsAppMessage,
  logTaskFlowComment,
  registerTaskCheckin,
  registerTaskCheckout,
  scheduleTaskOnlineMeeting,
  updateTask
} from "../lib/revenueApi";
import { confirmStrongDelete } from "../lib/confirmDelete";
import { toWhatsAppBrazilNumber } from "../lib/phone";

const ACTIVITY_OPTIONS = [
  "Visita",
  "Contato Telefonico",
  "Envio de Proposta"
];

const TASK_PRIORITIES = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" }
];

const TASK_STATUSES = [
  { value: "todo", label: "A Fazer" },
  { value: "in_progress", label: "Em Andamento" },
  { value: "done", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" }
];

const TASKS_CREATOR_STORAGE_KEY = "crm.tasks.creator-user-id.v1";
const TASKS_FORM_DEFAULTS_STORAGE_KEY = "crm.tasks.form-defaults.v1";
const TASKS_NOTIFY_STORAGE_KEY = "crm.tasks.notify-whatsapp.v1";

function normalizeTaskFormDefaults(rawDefaults = {}) {
  const safeActivity = ACTIVITY_OPTIONS.includes(String(rawDefaults.activity || ""))
    ? String(rawDefaults.activity)
    : "Visita";
  const safePriority = TASK_PRIORITIES.some((item) => item.value === rawDefaults.priority)
    ? String(rawDefaults.priority)
    : "medium";
  const safeStatus = TASK_STATUSES.some((item) => item.value === rawDefaults.status)
    ? String(rawDefaults.status)
    : "todo";

  return {
    activity: safeActivity,
    priority: safePriority,
    status: safeStatus
  };
}

function readTaskFormDefaults() {
  if (typeof window === "undefined") return normalizeTaskFormDefaults();
  try {
    const raw = window.localStorage.getItem(TASKS_FORM_DEFAULTS_STORAGE_KEY);
    if (!raw) return normalizeTaskFormDefaults();
    return normalizeTaskFormDefaults(JSON.parse(raw));
  } catch {
    return normalizeTaskFormDefaults();
  }
}

function readTaskNotifyDefault() {
  if (typeof window === "undefined") return true;
  const raw = String(window.localStorage.getItem(TASKS_NOTIFY_STORAGE_KEY) || "").trim();
  if (!raw) return true;
  return raw !== "0";
}

function statusLabel(value) {
  return TASK_STATUSES.find((item) => item.value === value)?.label || value;
}

function priorityLabel(value) {
  return TASK_PRIORITIES.find((item) => item.value === value)?.label || value;
}

function isOpenStatus(value) {
  return value !== "done" && value !== "cancelled";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return String(value || "");
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function isVisitTask(task) {
  const haystack = `${task?.task_type || ""} ${task?.title || ""}`;
  const normalized = normalizeText(haystack);
  return normalized.includes("visita") || normalized.includes("visit");
}

function parseFiniteNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatDate(value) {
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

function formatMeters(value) {
  const parsed = parseFiniteNumber(value);
  if (parsed === null) return "-";
  return `${Math.round(parsed)}m`;
}

function todayYmd() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dueLabel(dueDate) {
  if (!dueDate) return "Sem prazo";
  const today = todayYmd();
  if (dueDate < today) return `Atrasada · ${formatDate(dueDate)}`;
  if (dueDate === today) return "Vence hoje";
  return `Prazo ${formatDate(dueDate)}`;
}

function toIsoFromLocalInput(localValue) {
  const raw = String(localValue || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function scheduleLabel(task) {
  if (task.scheduled_start_at && task.scheduled_end_at) {
    return `${formatDateTime(task.scheduled_start_at)} até ${formatDateTime(task.scheduled_end_at)}`;
  }
  if (task.scheduled_start_at) return `Agendado ${formatDateTime(task.scheduled_start_at)}`;
  return dueLabel(task.due_date);
}

function visitMethodLabel(value) {
  const map = {
    geo: "Geolocalização",
    geo_pin: "Geolocalização + PIN"
  };
  return map[value] || "Geolocalização";
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Seu navegador não suporta geolocalização."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => {
        const map = {
          1: "Permissão de localização negada.",
          2: "Não foi possível obter sua localização.",
          3: "Tempo excedido ao buscar localização."
        };
        reject(new Error(map[error.code] || "Falha ao capturar sua geolocalização."));
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      }
    );
  });
}

function punctualVisit(task) {
  if (!task?.scheduled_start_at || !task?.visit_checkin_at) return false;
  const scheduledAt = new Date(task.scheduled_start_at).getTime();
  const checkinAt = new Date(task.visit_checkin_at).getTime();
  if (!Number.isFinite(scheduledAt) || !Number.isFinite(checkinAt)) return false;
  return Math.abs(checkinAt - scheduledAt) <= 15 * 60 * 1000;
}

function visitProgressLabel(task) {
  if (!isVisitTask(task)) return "-";
  if (task.visit_checkout_at) return `Check-out ${formatDateTime(task.visit_checkout_at)}`;
  if (task.visit_checkin_at) return `Em visita desde ${formatDateTime(task.visit_checkin_at)}`;
  return "Check-in pendente";
}

function toLocalInputFromIso(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseEmailList(value) {
  return String(value || "")
    .split(/[,\n;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function meetingProviderLabel(value) {
  const map = {
    google_meet: "Google Meet",
    microsoft_teams: "Microsoft Teams"
  };
  return map[value] || "Reunião online";
}

function meetingStatusLabel(value) {
  const map = {
    scheduled: "Agendada",
    cancelled: "Cancelada"
  };
  return map[value] || "-";
}

function userDisplayName(user) {
  if (!user) return "-";
  return String(user.full_name || user.email || "Usuário").trim() || "Usuário";
}

function localDateKeyFromIso(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHourMinute(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function scheduleWindowLabel(task) {
  if (!task?.scheduled_start_at) return "Sem horário";
  const start = formatHourMinute(task.scheduled_start_at);
  const end = task.scheduled_end_at ? formatHourMinute(task.scheduled_end_at) : "";
  return end ? `${start} - ${end}` : start;
}

function taskWindowBounds(task) {
  const startAt = new Date(task?.scheduled_start_at || "").getTime();
  if (!Number.isFinite(startAt)) return null;
  const endRaw = task?.scheduled_end_at ? new Date(task.scheduled_end_at).getTime() : startAt + 30 * 60 * 1000;
  const endAt = Number.isFinite(endRaw) && endRaw >= startAt ? endRaw : startAt + 30 * 60 * 1000;
  return { startAt, endAt };
}

export default function TasksModule({
  onRequestCreateCompany = null,
  prefillCompanyDraft = null,
  prefillCompanyRequest = 0
}) {
  const handledPrefillRequestRef = useRef(0);
  const taskDefaultsRef = useRef(readTaskFormDefaults());
  const [tasks, setTasks] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [creatorUserId, setCreatorUserId] = useState("");
  const [notifyAssigneeWhatsApp, setNotifyAssigneeWhatsApp] = useState(() => readTaskNotifyDefault());
  const [calendarDate, setCalendarDate] = useState(todayYmd());
  const [calendarAssigneeUserId, setCalendarAssigneeUserId] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [draggingTaskId, setDraggingTaskId] = useState("");
  const [dragOverStatus, setDragOverStatus] = useState("");
  const [checkinTaskId, setCheckinTaskId] = useState("");
  const [checkoutTaskId, setCheckoutTaskId] = useState("");
  const [meetingTaskId, setMeetingTaskId] = useState("");
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [companySuggestionsOpen, setCompanySuggestionsOpen] = useState(false);
  const [form, setForm] = useState({
    company_id: "",
    assignee_user_id: "",
    activity: taskDefaultsRef.current.activity,
    priority: taskDefaultsRef.current.priority,
    status: taskDefaultsRef.current.status,
    scheduled_start_local: "",
    scheduled_end_local: "",
    due_date: "",
    description: ""
  });

  async function loadUsersContext() {
    setUsersLoading(true);
    setError("");
    try {
      const rows = await listSystemUsers();
      const activeUsers = rows.filter((item) => item.status === "active");
      const availableUsers = activeUsers.length ? activeUsers : rows;
      setUsers(availableUsers);

      if (!availableUsers.length) {
        setCreatorUserId("");
        setCalendarAssigneeUserId("");
        setForm((prev) => ({ ...prev, assignee_user_id: "" }));
        return;
      }

      const savedCreatorUserId =
        typeof window === "undefined" ? "" : String(window.localStorage.getItem(TASKS_CREATOR_STORAGE_KEY) || "");
      const selectedCreator = availableUsers.find((item) => item.user_id === savedCreatorUserId) || availableUsers[0];
      setCreatorUserId(selectedCreator.user_id);
      setForm((prev) => ({
        ...prev,
        assignee_user_id: availableUsers.some((item) => item.user_id === prev.assignee_user_id)
          ? prev.assignee_user_id
          : selectedCreator.user_id
      }));
    } catch (err) {
      setUsers([]);
      setCreatorUserId("");
      setCalendarAssigneeUserId("");
      setForm((prev) => ({ ...prev, assignee_user_id: "" }));
      setError(err.message);
    } finally {
      setUsersLoading(false);
    }
  }

  async function load() {
    setError("");
    try {
      const [taskRows, companyRows] = await Promise.all([listTasks(), listCompanyOptions()]);
      setTasks(taskRows);
      setCompanies(companyRows);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadUsersContext();
    load();
  }, []);

  useEffect(() => {
    const nextDefaults = normalizeTaskFormDefaults({
      activity: form.activity,
      priority: form.priority,
      status: form.status
    });
    taskDefaultsRef.current = nextDefaults;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TASKS_FORM_DEFAULTS_STORAGE_KEY, JSON.stringify(nextDefaults));
    }
  }, [form.activity, form.priority, form.status]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TASKS_NOTIFY_STORAGE_KEY, notifyAssigneeWhatsApp ? "1" : "0");
  }, [notifyAssigneeWhatsApp]);

  useEffect(() => {
    if (!prefillCompanyRequest || prefillCompanyRequest === handledPrefillRequestRef.current) return;
    handledPrefillRequestRef.current = prefillCompanyRequest;

    const rawDraft = prefillCompanyDraft && typeof prefillCompanyDraft === "object" ? prefillCompanyDraft : {};
    const prefillCompanyId = String(rawDraft.company_id || rawDraft.id || "").trim();
    const prefillCompanyName = String(rawDraft.trade_name || rawDraft.company_name || rawDraft.search_term || "").trim();

    const companyById = prefillCompanyId ? companies.find((item) => item.id === prefillCompanyId) || null : null;
    const companyLabel = prefillCompanyName || companyById?.trade_name || "";

    setForm((prev) => ({
      ...prev,
      company_id: prefillCompanyId || companyById?.id || ""
    }));
    setCompanySearchTerm(companyLabel);
    setCompanySuggestionsOpen(false);
    setError("");
    setSuccess("");
  }, [prefillCompanyDraft, prefillCompanyRequest, companies]);

  const summary = useMemo(() => {
    const today = todayYmd();
    const openTasks = tasks.filter((item) => isOpenStatus(item.status));
    const dueToday = openTasks.filter((item) => item.due_date === today).length;
    const overdue = openTasks.filter((item) => item.due_date && item.due_date < today).length;
    const visits = tasks.filter((item) => isVisitTask(item));
    const visitsDone = visits.filter((item) => Boolean(item.visit_checkout_at)).length;
    const inField = visits.filter((item) => item.visit_checkin_at && !item.visit_checkout_at).length;
    const withoutValidation = visits.filter((item) => isOpenStatus(item.status) && !item.visit_checkin_at).length;
    const punctualCount = visits.filter((item) => Boolean(item.visit_checkout_at)).filter((item) => punctualVisit(item)).length;
    const punctualRate = visitsDone ? Math.round((punctualCount / visitsDone) * 100) : null;

    return {
      openCount: openTasks.length,
      dueToday,
      overdue,
      visitsDone,
      inField,
      withoutValidation,
      punctualRate
    };
  }, [tasks]);

  const listRows = useMemo(() => {
    if (!onlyOpen) return tasks;
    return tasks.filter((item) => isOpenStatus(item.status));
  }, [onlyOpen, tasks]);

  const upcomingAppointments = useMemo(() => {
    return tasks
      .filter((item) => isOpenStatus(item.status) && item.scheduled_start_at)
      .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())
      .slice(0, 5);
  }, [tasks]);

  const itemsByStatus = useMemo(() => {
    const grouped = TASK_STATUSES.reduce((acc, status) => {
      acc[status.value] = [];
      return acc;
    }, {});

    for (const task of tasks) {
      if (!grouped[task.status]) continue;
      grouped[task.status].push(task);
    }
    return grouped;
  }, [tasks]);

  const companySuggestions = useMemo(() => {
    const normalizedTerm = normalizeLookupText(companySearchTerm);
    const digitsTerm = String(companySearchTerm || "").replace(/\D/g, "");
    const source = normalizedTerm || digitsTerm
      ? companies.filter((company) => {
          const companyName = normalizeLookupText(company.trade_name);
          const companyCnpj = String(company.cnpj || "").replace(/\D/g, "");
          if (normalizedTerm && companyName.includes(normalizedTerm)) return true;
          if (digitsTerm && companyCnpj.includes(digitsTerm)) return true;
          return false;
        })
      : companies;
    return source.slice(0, 10);
  }, [companies, companySearchTerm]);

  const userById = useMemo(() => {
    const map = {};
    for (const user of users) {
      map[user.user_id] = user;
    }
    return map;
  }, [users]);

  const calendarRows = useMemo(() => {
    return tasks
      .filter((task) => task.scheduled_start_at)
      .filter((task) => localDateKeyFromIso(task.scheduled_start_at) === calendarDate)
      .filter((task) => (calendarAssigneeUserId ? task.assignee_user_id === calendarAssigneeUserId : true))
      .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
  }, [tasks, calendarDate, calendarAssigneeUserId]);

  const calendarConflictData = useMemo(() => {
    const conflictTaskIds = new Set();
    const pairByTaskId = {};
    const byAssignee = {};

    for (const row of calendarRows) {
      const assigneeKey = String(row.assignee_user_id || "");
      if (!byAssignee[assigneeKey]) byAssignee[assigneeKey] = [];
      byAssignee[assigneeKey].push(row);
    }

    for (const assigneeRows of Object.values(byAssignee)) {
      assigneeRows.sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
      for (let index = 0; index < assigneeRows.length; index += 1) {
        const current = assigneeRows[index];
        const currentBounds = taskWindowBounds(current);
        if (!currentBounds) continue;

        for (let nextIndex = index + 1; nextIndex < assigneeRows.length; nextIndex += 1) {
          const next = assigneeRows[nextIndex];
          const nextBounds = taskWindowBounds(next);
          if (!nextBounds) continue;
          if (nextBounds.startAt > currentBounds.endAt) break;
          if (nextBounds.startAt <= currentBounds.endAt && nextBounds.endAt >= currentBounds.startAt) {
            conflictTaskIds.add(current.id);
            conflictTaskIds.add(next.id);
            if (!pairByTaskId[current.id]) pairByTaskId[current.id] = next;
            if (!pairByTaskId[next.id]) pairByTaskId[next.id] = current;
          }
        }
      }
    }

    return {
      conflictTaskIds,
      pairByTaskId,
      count: conflictTaskIds.size
    };
  }, [calendarRows]);

  function handleCompanySearchChange(value) {
    const nextTerm = value;
    setCompanySearchTerm(nextTerm);
    setCompanySuggestionsOpen(Boolean(nextTerm.trim()));

    const normalizedNextTerm = normalizeLookupText(nextTerm);
    const digitsNextTerm = String(nextTerm || "").replace(/\D/g, "");
    if (!normalizedNextTerm && !digitsNextTerm) {
      setForm((prev) => ({ ...prev, company_id: "" }));
      return;
    }

    const exactMatch = companies.find((company) => {
      const companyName = normalizeLookupText(company.trade_name);
      const companyCnpj = String(company.cnpj || "").replace(/\D/g, "");
      if (normalizedNextTerm && companyName === normalizedNextTerm) return true;
      if (digitsNextTerm.length === 14 && companyCnpj === digitsNextTerm) return true;
      return false;
    });

    setForm((prev) => ({
      ...prev,
      company_id: exactMatch ? exactMatch.id : ""
    }));
  }

  function handleSelectCompany(company) {
    if (!company?.id) return;
    setForm((prev) => ({ ...prev, company_id: company.id }));
    setCompanySearchTerm(company.trade_name || "");
    setCompanySuggestionsOpen(false);
  }

  function handleCreatorChange(nextUserId) {
    const normalized = String(nextUserId || "").trim();
    const selected = users.find((item) => item.user_id === normalized);
    if (!selected) return;

    setCreatorUserId(selected.user_id);
    setForm((prev) => ({
      ...prev,
      assignee_user_id: prev.assignee_user_id || selected.user_id
    }));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TASKS_CREATOR_STORAGE_KEY, selected.user_id);
    }
  }

  function openWhatsAppMessage(phone, message) {
    const normalized = toWhatsAppBrazilNumber(phone);
    if (!normalized) return false;
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${normalized}?text=${encoded}`;
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    return Boolean(newWindow);
  }

  async function sendWhatsAppWithFallback({ phone, message, metadata }) {
    try {
      const result = await sendWhatsAppMessage({
        phone,
        message,
        metadata
      });
      return {
        mode: "api",
        provider: result.provider || "whatsapp_api"
      };
    } catch (apiError) {
      const opened = openWhatsAppMessage(phone, message);
      if (opened) {
        return {
          mode: "manual",
          provider: "wa.me"
        };
      }
      throw apiError;
    }
  }

  function handleRequestCreateCompany() {
    const typedTerm = String(companySearchTerm || "").trim();
    if (!typedTerm) {
      setError("Digite o nome ou CNPJ para cadastrar uma nova empresa.");
      return;
    }

    if (typeof onRequestCreateCompany !== "function") {
      setError("Não foi possível abrir o cadastro de empresa neste contexto.");
      return;
    }

    const cnpjDigits = typedTerm.replace(/\D/g, "");
    setError("");
    setCompanySuggestionsOpen(false);
    onRequestCreateCompany({
      trade_name: typedTerm,
      cnpj: cnpjDigits.length === 14 ? cnpjDigits : "",
      search_term: typedTerm
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const submitIntent = String(event?.nativeEvent?.submitter?.value || "save");
    const createAnotherAfterSave = submitIntent === "save_and_create";
    const activity = String(form.activity || "").trim();
    const description = String(form.description || "").trim();
    const dueDate = String(form.due_date || "").trim();
    const assigneeUserId = String(form.assignee_user_id || "").trim();
    const creator = userById[creatorUserId] || null;
    const assignee = userById[assigneeUserId] || null;

    if (!activity) {
      setError("Selecione a atividade.");
      return;
    }
    if (!dueDate) {
      setError("Informe a data limite.");
      return;
    }
    if (!description) {
      setError("Descrição é obrigatória.");
      return;
    }
    if (!assigneeUserId) {
      setError("Selecione o usuário responsável pela agenda.");
      return;
    }
    if (!creatorUserId) {
      setError("Selecione o usuário que está criando a agenda.");
      return;
    }

    setSaving(true);
    try {
      const nextStatus = form.status;
      const scheduledStartAt = toIsoFromLocalInput(form.scheduled_start_local);
      const scheduledEndAt = toIsoFromLocalInput(form.scheduled_end_local);
      if (scheduledStartAt && scheduledEndAt && new Date(scheduledEndAt).getTime() < new Date(scheduledStartAt).getTime()) {
        setError("O agendamento final não pode ser anterior ao início.");
        return;
      }

      if (scheduledStartAt) {
        const conflicts = await listTaskScheduleConflicts({
          assigneeUserId,
          scheduledStartAt,
          scheduledEndAt: scheduledEndAt || undefined
        });
        if (conflicts.length) {
          const preview = conflicts
            .slice(0, 3)
            .map((item) => `${item.title || "Tarefa"} (${scheduleWindowLabel(item)})`)
            .join("\n");
          const confirmed = window.confirm(
            `Conflito detectado para ${userDisplayName(assignee)}.\n\n${preview}\n\nDeseja salvar mesmo assim?`
          );
          if (!confirmed) {
            return;
          }
        }
      }

      await createTask({
        company_id: form.company_id || null,
        assignee_user_id: assigneeUserId,
        created_by_user_id: creatorUserId,
        title: activity,
        task_type: "commercial",
        priority: form.priority,
        status: nextStatus,
        due_date: dueDate,
        scheduled_start_at: scheduledStartAt,
        scheduled_end_at: scheduledEndAt,
        description,
        completed_at: nextStatus === "done" ? new Date().toISOString() : null
      });

      if (createAnotherAfterSave) {
        setForm((prev) => ({
          ...prev,
          assignee_user_id: assigneeUserId,
          description: "",
          scheduled_start_local: "",
          scheduled_end_local: "",
          due_date: ""
        }));
      } else {
        setForm((prev) => ({
          ...prev,
          company_id: "",
          assignee_user_id: assigneeUserId,
          activity: taskDefaultsRef.current.activity,
          priority: taskDefaultsRef.current.priority,
          status: taskDefaultsRef.current.status,
          description: "",
          scheduled_start_local: "",
          scheduled_end_local: "",
          due_date: ""
        }));
        setCompanySearchTerm("");
      }
      setCompanySuggestionsOpen(false);
      await load();

      const selectedCompany = companies.find((item) => item.id === form.company_id) || null;
      const companyLabel = selectedCompany?.trade_name || "Sem empresa vinculada";
      const scheduleText = scheduledStartAt ? scheduleLabel({ scheduled_start_at: scheduledStartAt, scheduled_end_at: scheduledEndAt }) : dueLabel(dueDate);
      let successMessage = "Tarefa criada com sucesso.";

      if (notifyAssigneeWhatsApp) {
        const sends = [];
        const shouldSendCopyToCreator = Boolean(creatorUserId) && creatorUserId !== assigneeUserId;
        let skippedWithoutWhatsapp = 0;

        const assigneeMessage = [
          `Ola, ${userDisplayName(assignee)}!`,
          `${userDisplayName(creator)} criou uma agenda para voce no CRM.`,
          `Atividade: ${activity}`,
          `Empresa: ${companyLabel}`,
          `Quando: ${scheduleText}`,
          `Descricao: ${description}`
        ].join("\n");

        if (assignee?.whatsapp) {
          sends.push({
            target: "assignee",
            promise: sendWhatsAppWithFallback({
              phone: assignee.whatsapp,
              message: assigneeMessage,
              metadata: {
                context: "task_created",
                recipient_role: "assignee",
                assignee_user_id: assigneeUserId,
                created_by_user_id: creatorUserId
              }
            })
          });
        } else {
          skippedWithoutWhatsapp += 1;
        }

        if (shouldSendCopyToCreator) {
          const creatorCopyMessage = [
            `Ola, ${userDisplayName(creator)}!`,
            "Copia da agenda criada no CRM.",
            `Responsavel: ${userDisplayName(assignee)}`,
            `Atividade: ${activity}`,
            `Empresa: ${companyLabel}`,
            `Quando: ${scheduleText}`,
            `Descricao: ${description}`
          ].join("\n");

          if (creator?.whatsapp) {
            sends.push({
              target: "creator",
              promise: sendWhatsAppWithFallback({
                phone: creator.whatsapp,
                message: creatorCopyMessage,
                metadata: {
                  context: "task_created_creator_copy",
                  recipient_role: "creator",
                  assignee_user_id: assigneeUserId,
                  created_by_user_id: creatorUserId
                }
              })
            });
          } else {
            skippedWithoutWhatsapp += 1;
          }
        }

        if (sends.length) {
          const results = await Promise.allSettled(sends.map((item) => item.promise));
          let apiSent = 0;
          let manualPrepared = 0;
          let failures = 0;

          results.forEach((result) => {
            if (result.status === "fulfilled") {
              if (result.value?.mode === "api") {
                apiSent += 1;
              } else {
                manualPrepared += 1;
              }
            } else {
              failures += 1;
            }
          });

          const parts = ["Tarefa criada."];
          if (apiSent) parts.push(`WhatsApp enviado automaticamente para ${apiSent} destinatario(s).`);
          if (manualPrepared) parts.push(`Mensagem preparada no WhatsApp Web para ${manualPrepared} destinatario(s).`);
          if (failures) parts.push(`${failures} envio(s) falharam.`);
          if (skippedWithoutWhatsapp) parts.push(`${skippedWithoutWhatsapp} usuario(s) sem WhatsApp cadastrado.`);
          successMessage = parts.join(" ");
        } else if (skippedWithoutWhatsapp) {
          successMessage = "Tarefa criada, mas os destinatarios nao possuem WhatsApp cadastrado.";
        }
      }

      if (createAnotherAfterSave) {
        successMessage = `${successMessage} Formulário mantido para cadastrar a próxima tarefa.`;
      }
      setSuccess(successMessage);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function requestFlowComment(task, nextStatus) {
    const fromLabel = statusLabel(task.status);
    const toLabel = statusLabel(nextStatus);
    const typedComment = window.prompt(`Comentário obrigatório para mover "${task.title}" de ${fromLabel} para ${toLabel}:`);
    if (typedComment === null) return null;
    return String(typedComment || "").trim();
  }

  async function handleStatusChange(task, nextStatus) {
    if (!task || task.status === nextStatus) return;

    if (isVisitTask(task) && nextStatus === "in_progress" && !task.visit_checkin_at) {
      setError("Para visitas, use o botão Check-in para iniciar o atendimento em campo.");
      return;
    }
    if (isVisitTask(task) && nextStatus === "done" && !task.visit_checkout_at) {
      setError("Para visitas, use o botão Check-out para concluir com resumo da visita.");
      return;
    }

    const flowComment = requestFlowComment(task, nextStatus);
    if (flowComment === null) return;
    if (!flowComment) {
      setError("Comentário obrigatório para mudar o fluxo da agenda.");
      return;
    }

    const previousStatus = task.status;
    const previousCompletedAt = task.completed_at || null;
    const nextCompletedAt = nextStatus === "done" ? new Date().toISOString() : null;

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id
          ? { ...item, status: nextStatus, completed_at: nextCompletedAt }
          : item
      )
    );

    try {
      await updateTask(task.id, {
        status: nextStatus,
        completed_at: nextCompletedAt
      });
      await logTaskFlowComment({
        taskId: task.id,
        companyId: task.company_id || null,
        taskTitle: task.title || "",
        fromStatus: previousStatus,
        toStatus: nextStatus,
        comment: flowComment
      });
    } catch (err) {
      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id
            ? { ...item, status: previousStatus, completed_at: previousCompletedAt }
            : item
        )
      );
      setError(err.message);
    }
  }

  async function handleDeleteTask(task) {
    const taskId = String(task?.id || "").trim();
    if (!taskId) return;

    const confirmed = confirmStrongDelete({
      entityLabel: "a tarefa",
      itemLabel: task?.title || "Sem título"
    });
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingTaskId(taskId);
    try {
      await deleteTask(taskId);
      setTasks((prev) => prev.filter((item) => item.id !== taskId));
      setSuccess("Tarefa excluída com sucesso.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingTaskId("");
    }
  }

  function buildVisitHint(task) {
    if (!isVisitTask(task)) return "-";
    const hasGeoTarget = parseFiniteNumber(task?.companies?.checkin_latitude) !== null && parseFiniteNumber(task?.companies?.checkin_longitude) !== null;
    const radius = parseFiniteNumber(task?.companies?.checkin_radius_meters) || 150;
    if (!task.visit_checkin_at) {
      if (!hasGeoTarget) return "Cliente sem coordenadas; check-in sem geofence.";
      return `Raio alvo ${Math.round(radius)}m.`;
    }

    const distance = parseFiniteNumber(task.visit_checkin_distance_meters);
    const method = visitMethodLabel(task.visit_checkin_method);
    if (distance !== null) return `${method} · Distância ${formatMeters(distance)}.`;
    if (!hasGeoTarget) return `${method} · Cliente sem coordenadas.`;
    return `${method} · Distância não calculada.`;
  }

  async function handleCheckin(task) {
    if (!task || !isVisitTask(task)) {
      setError("Check-in disponível apenas para tarefas de visita.");
      return;
    }
    if (task.status === "done" || task.status === "cancelled") {
      setError("Não é possível fazer check-in em tarefa encerrada.");
      return;
    }
    if (task.visit_checkin_at && !task.visit_checkout_at) {
      setError("Esta visita já está em andamento. Faça o check-out para concluir.");
      return;
    }

    setError("");
    setCheckinTaskId(task.id);
    const previousSnapshot = { ...task };
    let optimisticApplied = false;

    try {
      const position = await requestCurrentPosition();
      const latitude = Number(position.coords.latitude);
      const longitude = Number(position.coords.longitude);
      const accuracyMeters = Number(position.coords.accuracy);

      const mode = task?.companies?.checkin_validation_mode === "geo_pin" ? "geo_pin" : "geo";
      const configuredPin = String(task?.companies?.checkin_pin || "").trim();
      if (mode === "geo_pin") {
        if (!configuredPin) {
          setError("Este cliente exige PIN, mas ainda não possui PIN cadastrado.");
          return;
        }
        const typedPin = window.prompt(`Informe o PIN de validação para "${task.companies?.trade_name || "cliente"}":`);
        if (typedPin === null) return;
        if (String(typedPin || "").trim() !== configuredPin) {
          setError("PIN inválido para check-in.");
          return;
        }
      }

      const targetLat = parseFiniteNumber(task?.companies?.checkin_latitude);
      const targetLng = parseFiniteNumber(task?.companies?.checkin_longitude);
      const targetRadius = parseFiniteNumber(task?.companies?.checkin_radius_meters) || 150;
      let distanceMeters = null;

      if (targetLat !== null && targetLng !== null) {
        distanceMeters = haversineDistanceMeters(latitude, longitude, targetLat, targetLng);
        if (distanceMeters > targetRadius) {
          setError(`Check-in fora do raio do cliente. Distância ${formatMeters(distanceMeters)} · Raio ${Math.round(targetRadius)}m.`);
          return;
        }
      }

      const notePrompt = window.prompt("Observação de chegada (opcional):");
      const note = notePrompt === null ? "" : String(notePrompt || "").trim();
      const checkinAt = new Date().toISOString();
      const nextStatus = task.status === "todo" ? "in_progress" : task.status;

      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: nextStatus,
                completed_at: null,
                visit_checkin_at: checkinAt,
                visit_checkin_latitude: latitude,
                visit_checkin_longitude: longitude,
                visit_checkin_accuracy_meters: accuracyMeters,
                visit_checkin_distance_meters: distanceMeters,
                visit_checkin_method: mode,
                visit_checkin_note: note || null
              }
            : item
        )
      );
      optimisticApplied = true;

      await registerTaskCheckin({
        taskId: task.id,
        companyId: task.company_id || null,
        taskTitle: task.title || "",
        fromStatus: task.status,
        toStatus: nextStatus,
        checkinAt,
        latitude,
        longitude,
        accuracyMeters: Number.isFinite(accuracyMeters) ? Number(accuracyMeters.toFixed(2)) : null,
        distanceMeters: distanceMeters === null ? null : Number(distanceMeters.toFixed(2)),
        method: mode,
        note: note || null,
        targetRadiusMeters: Math.round(targetRadius)
      });
    } catch (err) {
      if (optimisticApplied) {
        setTasks((prev) => prev.map((item) => (item.id === task.id ? previousSnapshot : item)));
      }
      setError(err.message || "Falha ao registrar check-in.");
    } finally {
      setCheckinTaskId("");
    }
  }

  async function handleCheckout(task) {
    if (!task || !isVisitTask(task)) {
      setError("Check-out disponível apenas para tarefas de visita.");
      return;
    }
    if (!task.visit_checkin_at) {
      setError("Realize o check-in antes de concluir a visita.");
      return;
    }
    if (task.visit_checkout_at) {
      setError("Esta visita já possui check-out registrado.");
      return;
    }

    const summaryPrompt = window.prompt("Resumo obrigatório da visita para concluir o check-out:");
    if (summaryPrompt === null) return;
    const summary = String(summaryPrompt || "").trim();
    if (!summary) {
      setError("Resumo obrigatório para concluir o check-out.");
      return;
    }

    setError("");
    setCheckoutTaskId(task.id);
    const previousSnapshot = { ...task };

    const checkoutAt = new Date().toISOString();
    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status: "done",
              completed_at: checkoutAt,
              visit_checkout_at: checkoutAt,
              visit_checkout_note: summary
            }
          : item
      )
    );

    try {
      await registerTaskCheckout({
        taskId: task.id,
        companyId: task.company_id || null,
        taskTitle: task.title || "",
        fromStatus: task.status,
        toStatus: "done",
        checkoutAt,
        summary,
        checkinAt: task.visit_checkin_at
      });
    } catch (err) {
      setTasks((prev) => prev.map((item) => (item.id === task.id ? previousSnapshot : item)));
      setError(err.message || "Falha ao registrar check-out.");
    } finally {
      setCheckoutTaskId("");
    }
  }

  function buildMeetingHint(task) {
    if (!task?.meeting_join_url) return "Sem reunião agendada.";
    const attendeesCount = Array.isArray(task.meeting_attendees) ? task.meeting_attendees.length : 0;
    const attendeesLabel = attendeesCount ? `${attendeesCount} convidado(s)` : "Sem convidados";
    const status = meetingStatusLabel(task.meeting_status);
    const startLabel = task.meeting_start_at ? formatDateTime(task.meeting_start_at) : "-";
    return `${meetingProviderLabel(task.meeting_provider)} · ${status} · ${startLabel} · ${attendeesLabel}`;
  }

  async function handleScheduleOnlineMeeting(task) {
    if (!task) return;

    const now = new Date();
    const fallbackStart = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const baseStartIso = task.meeting_start_at || task.scheduled_start_at || fallbackStart;
    const baseEndIso =
      task.meeting_end_at ||
      task.scheduled_end_at ||
      new Date(new Date(baseStartIso).getTime() + 60 * 60 * 1000).toISOString();

    const currentAttendees = Array.isArray(task.meeting_attendees) ? task.meeting_attendees.join(", ") : "";
    const defaultAttendees = currentAttendees || String(task.companies?.email || "").trim();

    const startPrompt = window.prompt(
      "Início da reunião (AAAA-MM-DDTHH:MM):",
      toLocalInputFromIso(baseStartIso)
    );
    if (startPrompt === null) return;
    const endPrompt = window.prompt(
      "Fim da reunião (AAAA-MM-DDTHH:MM):",
      toLocalInputFromIso(baseEndIso)
    );
    if (endPrompt === null) return;
    const attendeesPrompt = window.prompt(
      "E-mails dos convidados (separados por vírgula):",
      defaultAttendees
    );
    if (attendeesPrompt === null) return;

    const startAt = toIsoFromLocalInput(startPrompt);
    const endAt = toIsoFromLocalInput(endPrompt);
    const attendees = parseEmailList(attendeesPrompt);

    if (!startAt || !endAt) {
      setError("Datas inválidas para agendamento da reunião online.");
      return;
    }
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setError("A reunião deve terminar após o horário de início.");
      return;
    }
    if (!attendees.length) {
      setError("Informe ao menos um e-mail de convidado para enviar o link.");
      return;
    }

    const customMessagePrompt = window.prompt(
      "Mensagem adicional para o convite (opcional):",
      String(task.description || "").trim()
    );
    const customMessage = customMessagePrompt === null ? "" : String(customMessagePrompt || "").trim();

    setError("");
    setMeetingTaskId(task.id);
    try {
      const response = await scheduleTaskOnlineMeeting({
        task_id: task.id,
        provider: "google_meet",
        title: task.title || "Reunião online",
        start_at: startAt,
        end_at: endAt,
        attendees,
        description: customMessage || task.description || "",
        send_email: true
      });

      await load();

      if (response?.meeting_join_url) {
        const statusText =
          response?.email_status === "resend_sent"
            ? "Convite por e-mail enviado e evento criado no calendário."
            : response?.email_status === "provider_invite_sent"
              ? "Evento criado e convite enviado pelo Google Calendar."
              : "Evento criado com sucesso.";
        window.alert(`${statusText}\nLink: ${response.meeting_join_url}`);
      }
    } catch (err) {
      setError(err.message || "Falha ao agendar reunião online.");
    } finally {
      setMeetingTaskId("");
    }
  }

  function handleNotifyConflictCreator(task, conflictedWith) {
    if (!task || !task.created_by_user_id) {
      setError("Não foi possível identificar quem criou essa agenda.");
      return;
    }

    const creator = task.creator || userById[task.created_by_user_id];
    if (!creator?.whatsapp) {
      setError("Criador da agenda sem WhatsApp cadastrado.");
      return;
    }

    const message = [
      `Alerta de conflito na agenda de ${userDisplayName(task.assignee || userById[task.assignee_user_id])}.`,
      `Compromisso 1: ${task.title} (${scheduleWindowLabel(task)})`,
      conflictedWith ? `Compromisso 2: ${conflictedWith.title} (${scheduleWindowLabel(conflictedWith)})` : "",
      `Data: ${formatDate(calendarDate)}`,
      "Revise o calendário no CRM para ajustar os horários."
    ]
      .filter(Boolean)
      .join("\n");

    sendWhatsAppWithFallback({
      phone: creator.whatsapp,
      message,
      metadata: {
        context: "task_conflict_alert",
        task_id: task.id,
        conflict_task_id: conflictedWith?.id || null
      }
    })
      .then((delivery) => {
        if (delivery.mode === "api") {
          setSuccess(`Aviso de conflito enviado automaticamente para ${userDisplayName(creator)}.`);
        } else {
          setSuccess(`Aviso de conflito preparado no WhatsApp Web para ${userDisplayName(creator)}.`);
        }
        setError("");
      })
      .catch(() => {
        setError("Não foi possível enviar o alerta de conflito por WhatsApp.");
      });
  }
  
  function handleDragStart(event, taskId) {
    setDraggingTaskId(taskId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/task-id", taskId);
  }

  function handleDragEnd() {
    setDraggingTaskId("");
    setDragOverStatus("");
  }

  function handleDragOver(event, statusValue) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStatus(statusValue);
  }

  async function handleDrop(event, statusValue) {
    event.preventDefault();
    setDragOverStatus("");
    const taskId = event.dataTransfer.getData("text/task-id") || draggingTaskId;
    if (!taskId) return;

    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    await handleStatusChange(task, statusValue);
    setDraggingTaskId("");
  }

  return (
    <section className="module">
      <div className="two-col">
        <article className="panel">
          <h2>Agenda de tarefas</h2>
          <p className="muted">Cadastre tarefas para os usuários e acompanhe no fluxo da agenda.</p>
          {usersLoading ? <p className="muted">Carregando usuários...</p> : null}
          {!usersLoading && !users.length ? <p className="error-text">Cadastre ao menos um usuário na aba Configurações.</p> : null}
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="tasks-users-grid">
              <label className="settings-field">
                <span>Usuário criando agenda</span>
                <select
                  value={creatorUserId}
                  onChange={(event) => handleCreatorChange(event.target.value)}
                  disabled={!users.length || usersLoading}
                >
                  {!users.length ? <option value="">Sem usuários cadastrados</option> : null}
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {userDisplayName(user)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Responsável pela agenda</span>
                <select
                  value={form.assignee_user_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, assignee_user_id: event.target.value }))}
                  disabled={!users.length || usersLoading}
                >
                  {!users.length ? <option value="">Sem usuários cadastrados</option> : null}
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {userDisplayName(user)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="tasks-company-autocomplete">
              <input
                type="text"
                placeholder="Empresa (opcional: digite nome ou CNPJ)"
                value={companySearchTerm}
                onChange={(event) => handleCompanySearchChange(event.target.value)}
                onFocus={() => setCompanySuggestionsOpen(Boolean(companySearchTerm.trim()))}
                onBlur={() => window.setTimeout(() => setCompanySuggestionsOpen(false), 120)}
              />
              {companySuggestionsOpen && companySearchTerm.trim().length >= 1 ? (
                <div className="tasks-company-suggestions">
                  {!companySuggestions.length ? <p className="muted">Nenhuma empresa encontrada.</p> : null}
                  {companySuggestions.length ? (
                    <ul className="search-suggestions-list">
                      {companySuggestions.map((company) => (
                        <li key={company.id}>
                          <button
                            type="button"
                            className="search-suggestion-btn"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              handleSelectCompany(company);
                            }}
                          >
                            <strong>{company.trade_name || "Empresa"}</strong>
                            <span>{company.cnpj ? formatCnpj(company.cnpj) : "Sem CNPJ"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {!companySuggestions.length ? (
                    <div className="tasks-company-suggestions-actions">
                      <button
                        type="button"
                        className="btn-ghost btn-table-action tasks-create-company-btn"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={handleRequestCreateCompany}
                      >
                        + Cadastrar nova empresa
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <select
              required
              value={form.activity}
              onChange={(e) => setForm((prev) => ({ ...prev, activity: e.target.value }))}
            >
              {ACTIVITY_OPTIONS.map((activity) => (
                <option key={activity} value={activity}>
                  {activity}
                </option>
              ))}
            </select>
            <select value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}>
              {TASK_PRIORITIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
              {TASK_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={form.scheduled_start_local}
              onChange={(e) => setForm((prev) => ({ ...prev, scheduled_start_local: e.target.value }))}
            />
            <input
              type="datetime-local"
              value={form.scheduled_end_local}
              onChange={(e) => setForm((prev) => ({ ...prev, scheduled_end_local: e.target.value }))}
            />
            <input
              type="date"
              required
              value={form.due_date}
              onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
            />
            <textarea
              required
              placeholder="Descrição (obrigatória)"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={notifyAssigneeWhatsApp}
                onChange={(event) => setNotifyAssigneeWhatsApp(event.target.checked)}
              />
              Avisar responsável no WhatsApp ao salvar
            </label>
            <div className="inline-actions">
              <button type="submit" value="save" className="btn-primary" disabled={saving || !users.length}>
                {saving ? "Salvando..." : "Salvar tarefa"}
              </button>
              <button type="submit" value="save_and_create" className="btn-ghost" disabled={saving || !users.length}>
                Salvar e criar outra
              </button>
            </div>
          </form>
        </article>

        <article className="panel">
          <h3>Indicadores da agenda</h3>
          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p className="success-text">{success}</p> : null}
          <div className="dashboard-strip">
            <article className="metric-tile">
              <span>Abertas</span>
              <strong>{summary.openCount}</strong>
            </article>
            <article className="metric-tile">
              <span>Vencem hoje</span>
              <strong>{summary.dueToday}</strong>
            </article>
            <article className="metric-tile">
              <span>Em atraso</span>
              <strong>{summary.overdue}</strong>
            </article>
            <article className="metric-tile">
              <span>Visitas realizadas</span>
              <strong>{summary.visitsDone}</strong>
            </article>
            <article className="metric-tile">
              <span>Pontualidade</span>
              <strong>{summary.punctualRate === null ? "-" : `${summary.punctualRate}%`}</strong>
            </article>
            <article className="metric-tile">
              <span>Sem validação</span>
              <strong>{summary.withoutValidation}</strong>
              <small>{summary.inField} em campo</small>
            </article>
          </div>
          <div className="inline-actions top-gap">
            <button type="button" className="btn-ghost btn-table-action" onClick={() => setOnlyOpen((prev) => !prev)}>
              {onlyOpen ? "Mostrar todas na lista" : "Mostrar somente abertas na lista"}
            </button>
          </div>
          <div className="top-gap">
            <h3>Próximos agendamentos</h3>
            <ul className="activity-list">
              {upcomingAppointments.map((task) => (
                <li key={`upcoming-${task.id}`} className="activity-item">
                  <div>
                    <p className="activity-title">{task.title}</p>
                    <p className="activity-meta">{task.companies?.trade_name || "SEM VÍNCULO"}</p>
                    <p className="activity-meta">Responsável: {userDisplayName(task.assignee || userById[task.assignee_user_id])}</p>
                  </div>
                  <span className="activity-date">{formatDateTime(task.scheduled_start_at)}</span>
                </li>
              ))}
              {!upcomingAppointments.length ? <li className="muted">Sem agendamentos próximos.</li> : null}
            </ul>
          </div>

          <div className="top-gap">
            <h3>Calendário diário</h3>
            <div className="tasks-calendar-toolbar">
              <label className="settings-field">
                <span>Data</span>
                <input type="date" value={calendarDate} onChange={(event) => setCalendarDate(event.target.value)} />
              </label>
              <label className="settings-field">
                <span>Responsável</span>
                <select value={calendarAssigneeUserId} onChange={(event) => setCalendarAssigneeUserId(event.target.value)}>
                  <option value="">Todos os responsáveis</option>
                  {users.map((user) => (
                    <option key={`calendar-${user.user_id}`} value={user.user_id}>
                      {userDisplayName(user)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {calendarConflictData.count ? (
              <p className="tasks-calendar-warning">
                {calendarConflictData.count} compromisso(s) com conflito detectado para a data selecionada.
              </p>
            ) : null}

            <ul className="activity-list">
              {calendarRows.map((task) => {
                const conflict = calendarConflictData.conflictTaskIds.has(task.id);
                const conflictingTask = calendarConflictData.pairByTaskId[task.id] || null;
                return (
                  <li key={`calendar-${task.id}`} className={`activity-item ${conflict ? "task-calendar-item-conflict" : ""}`}>
                    <div>
                      <p className="activity-title">{task.title}</p>
                      <p className="activity-meta">{task.companies?.trade_name || "SEM VÍNCULO"}</p>
                      <p className="activity-meta">
                        Responsável: {userDisplayName(task.assignee || userById[task.assignee_user_id])} · Criado por:{" "}
                        {userDisplayName(task.creator || userById[task.created_by_user_id])}
                      </p>
                      {conflict ? (
                        <p className="tasks-calendar-conflict-meta">
                          Conflito com: {conflictingTask?.title || "Outro compromisso"}
                        </p>
                      ) : null}
                    </div>
                    <div className="tasks-calendar-item-side">
                      <span className="activity-date">{scheduleWindowLabel(task)}</span>
                      {conflict ? <span className="badge badge-status-cancelled">Conflito</span> : null}
                      {conflict ? (
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleNotifyConflictCreator(task, conflictingTask)}
                        >
                          Avisar criador
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
              {!calendarRows.length ? <li className="muted">Sem compromissos para este dia.</li> : null}
            </ul>
          </div>
        </article>
      </div>

      <article className="panel top-gap">
        <h3>Fluxo da agenda</h3>
        <p className="muted">Arraste cada tarefa para avançar o status.</p>
        <div className="agenda-board">
          {TASK_STATUSES.map((status) => (
            <section
              key={status.value}
              className={`agenda-column ${dragOverStatus === status.value ? "is-over" : ""}`}
              onDragOver={(event) => handleDragOver(event, status.value)}
              onDrop={(event) => handleDrop(event, status.value)}
            >
              <header className="agenda-column-header">
                <span>{status.label}</span>
                <strong>{itemsByStatus[status.value]?.length || 0}</strong>
              </header>
              <div className="agenda-column-body">
                {(itemsByStatus[status.value] || []).map((task) => (
                  <article
                    key={task.id}
                    className={`agenda-card ${draggingTaskId === task.id ? "is-dragging" : ""}`}
                    draggable
                    onDragStart={(event) => handleDragStart(event, task.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <p className="agenda-card-title">{task.title}</p>
                    <p className="agenda-card-company">{task.companies?.trade_name || "SEM VÍNCULO"}</p>
                    <p className="agenda-card-company">Responsável: {userDisplayName(task.assignee || userById[task.assignee_user_id])}</p>
                    <div className="agenda-card-meta">
                      <span className={`badge badge-priority-${task.priority}`}>{priorityLabel(task.priority)}</span>
                    </div>
                    <p className="agenda-card-due">{scheduleLabel(task)}</p>
                    {isVisitTask(task) ? <p className="agenda-card-field-status">{visitProgressLabel(task)}</p> : null}
                  </article>
                ))}
                {!itemsByStatus[status.value]?.length ? <p className="pipeline-empty">Sem tarefas</p> : null}
              </div>
            </section>
          ))}
        </div>
      </article>

      <article className="panel top-gap">
        <h3>Lista de tarefas</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Atividade</th>
                <th>Empresa</th>
                <th>Criado por</th>
                <th>Responsável</th>
                <th>Prioridade</th>
                <th>Agendamento</th>
                <th>Data limite</th>
                <th>Status</th>
                <th>Reunião online</th>
                <th>Execução em campo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {listRows.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.companies?.trade_name || "-"}</td>
                  <td>{userDisplayName(task.creator || userById[task.created_by_user_id])}</td>
                  <td>{userDisplayName(task.assignee || userById[task.assignee_user_id])}</td>
                  <td>
                    <span className={`badge badge-priority-${task.priority}`}>{priorityLabel(task.priority)}</span>
                  </td>
                  <td>{task.scheduled_start_at ? scheduleLabel(task) : "-"}</td>
                  <td>{formatDate(task.due_date)}</td>
                  <td>
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task, e.target.value)}
                      className="status-select"
                    >
                      {TASK_STATUSES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <span className={`badge badge-status-${task.status}`}>{statusLabel(task.status)}</span>
                  </td>
                  <td>
                    <div className="meeting-cell">
                      {task.meeting_join_url ? (
                        <a
                          href={task.meeting_join_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost btn-table-action"
                        >
                          Abrir reunião
                        </a>
                      ) : null}
                      <p className="meeting-summary">{buildMeetingHint(task)}</p>
                      <div className="meeting-actions">
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleScheduleOnlineMeeting(task)}
                          disabled={meetingTaskId === task.id}
                        >
                          {meetingTaskId === task.id
                            ? "Agendando..."
                            : task.meeting_join_url
                              ? "Reagendar/Reenviar"
                              : "Agendar reunião"}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td>
                    {!isVisitTask(task) ? (
                      <span className="muted">-</span>
                    ) : (
                      <div className="visit-checkin-cell">
                        <span
                          className={`badge visit-status-chip ${
                            task.visit_checkout_at
                              ? "visit-status-chip-done"
                              : task.visit_checkin_at
                                ? "visit-status-chip-progress"
                                : "visit-status-chip-pending"
                          }`}
                        >
                          {task.visit_checkout_at ? "Concluída" : task.visit_checkin_at ? "Em visita" : "Pendente"}
                        </span>
                        <p className="visit-checkin-summary">{visitProgressLabel(task)}</p>
                        <p className="visit-checkin-summary muted">{buildVisitHint(task)}</p>
                        <div className="visit-checkin-actions">
                          {!task.visit_checkin_at ? (
                            <button
                              type="button"
                              className="btn-ghost btn-table-action"
                              onClick={() => handleCheckin(task)}
                              disabled={
                                checkinTaskId === task.id ||
                                checkoutTaskId === task.id ||
                                task.status === "done" ||
                                task.status === "cancelled"
                              }
                            >
                              {checkinTaskId === task.id ? "Registrando..." : "Check-in"}
                            </button>
                          ) : null}
                          {task.visit_checkin_at && !task.visit_checkout_at ? (
                            <button
                              type="button"
                              className="btn-ghost btn-table-action"
                              onClick={() => handleCheckout(task)}
                              disabled={checkoutTaskId === task.id || checkinTaskId === task.id}
                            >
                              {checkoutTaskId === task.id ? "Concluindo..." : "Check-out"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost btn-table-action"
                      onClick={() => handleDeleteTask(task)}
                      disabled={deletingTaskId === task.id}
                    >
                      {deletingTaskId === task.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </td>
                </tr>
              ))}
              {!listRows.length ? (
                <tr>
                  <td colSpan={11} className="muted">
                    Nenhuma tarefa encontrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
