import { useEffect, useMemo, useState } from "react";
import { createTask, listCompanyOptions, listTasks, logTaskFlowComment, updateTask } from "../lib/revenueApi";

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

export default function TasksModule() {
  const [tasks, setTasks] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [draggingTaskId, setDraggingTaskId] = useState("");
  const [dragOverStatus, setDragOverStatus] = useState("");
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
    return {
      openCount: openTasks.length,
      dueToday,
      overdue
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
                </tr>
              ))}
              {!listRows.length ? (
                <tr>
                  <td colSpan={6} className="muted">
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
