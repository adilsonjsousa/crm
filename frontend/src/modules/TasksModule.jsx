import { useEffect, useMemo, useState } from "react";
import {
  createTask,
  listCompanyOptions,
  listTasks,
  logTaskFlowComment,
  registerTaskCheckin,
  registerTaskCheckout,
  scheduleTaskOnlineMeeting,
  updateTask
} from "../lib/revenueApi";

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

export default function TasksModule() {
  const [tasks, setTasks] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [draggingTaskId, setDraggingTaskId] = useState("");
  const [dragOverStatus, setDragOverStatus] = useState("");
  const [checkinTaskId, setCheckinTaskId] = useState("");
  const [checkoutTaskId, setCheckoutTaskId] = useState("");
  const [meetingTaskId, setMeetingTaskId] = useState("");
  const [form, setForm] = useState({
    company_id: "",
    activity: "Visita",
    priority: "medium",
    status: "todo",
    scheduled_start_local: "",
    scheduled_end_local: "",
    due_date: "",
    description: ""
  });

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
    load();
  }, []);

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

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const activity = String(form.activity || "").trim();
    const description = String(form.description || "").trim();
    const dueDate = String(form.due_date || "").trim();

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

    setSaving(true);
    try {
      const nextStatus = form.status;
      const scheduledStartAt = toIsoFromLocalInput(form.scheduled_start_local);
      const scheduledEndAt = toIsoFromLocalInput(form.scheduled_end_local);
      if (scheduledStartAt && scheduledEndAt && new Date(scheduledEndAt).getTime() < new Date(scheduledStartAt).getTime()) {
        setError("O agendamento final não pode ser anterior ao início.");
        setSaving(false);
        return;
      }

      await createTask({
        company_id: form.company_id || null,
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

      setForm((prev) => ({
        ...prev,
        activity: "Visita",
        description: "",
        scheduled_start_local: "",
        scheduled_end_local: "",
        due_date: "",
        status: "todo"
      }));
      await load();
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
          <form className="form-grid" onSubmit={handleSubmit}>
            <select
              value={form.company_id}
              onChange={(e) => setForm((prev) => ({ ...prev, company_id: e.target.value }))}
            >
              <option value="">Sem vínculo com empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.trade_name}
                </option>
              ))}
            </select>
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
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar tarefa"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h3>Indicadores da agenda</h3>
          {error ? <p className="error-text">{error}</p> : null}
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
                  </div>
                  <span className="activity-date">{formatDateTime(task.scheduled_start_at)}</span>
                </li>
              ))}
              {!upcomingAppointments.length ? <li className="muted">Sem agendamentos próximos.</li> : null}
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
                <th>Prioridade</th>
                <th>Agendamento</th>
                <th>Data limite</th>
                <th>Status</th>
                <th>Reunião online</th>
                <th>Execução em campo</th>
              </tr>
            </thead>
            <tbody>
              {listRows.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.companies?.trade_name || "-"}</td>
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
                </tr>
              ))}
              {!listRows.length ? (
                <tr>
                  <td colSpan={8} className="muted">
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
