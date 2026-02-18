import { useEffect, useMemo, useState } from "react";
import { createTask, listCompanyOptions, listTasks, updateTask } from "../lib/revenueApi";

const TASK_TYPES = [
  { value: "commercial", label: "Comercial" },
  { value: "technical", label: "Técnica" }
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

function typeLabel(value) {
  return TASK_TYPES.find((item) => item.value === value)?.label || value;
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
    title: "",
    task_type: "commercial",
    priority: "medium",
    status: "todo",
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
    setSaving(true);
    try {
      const nextStatus = form.status;
      await createTask({
        company_id: form.company_id || null,
        title: String(form.title || "").trim(),
        task_type: form.task_type,
        priority: form.priority,
        status: nextStatus,
        due_date: form.due_date || null,
        description: form.description || null,
        completed_at: nextStatus === "done" ? new Date().toISOString() : null
      });

      setForm((prev) => ({
        ...prev,
        title: "",
        description: "",
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

  async function handleStatusChange(task, nextStatus) {
    if (!task || task.status === nextStatus) return;

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
            <input
              required
              placeholder="Título da tarefa"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <select value={form.task_type} onChange={(e) => setForm((prev) => ({ ...prev, task_type: e.target.value }))}>
              {TASK_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
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
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
            />
            <textarea
              placeholder="Descrição"
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
                      <span>{typeLabel(task.task_type)}</span>
                    </div>
                    <p className="agenda-card-due">{dueLabel(task.due_date)}</p>
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
                <th>Tarefa</th>
                <th>Empresa</th>
                <th>Tipo</th>
                <th>Prioridade</th>
                <th>Prazo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {listRows.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.companies?.trade_name || "-"}</td>
                  <td>{typeLabel(task.task_type)}</td>
                  <td>
                    <span className={`badge badge-priority-${task.priority}`}>{priorityLabel(task.priority)}</span>
                  </td>
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
