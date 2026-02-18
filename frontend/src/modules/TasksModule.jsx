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

export default function TasksModule() {
  const [tasks, setTasks] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(true);
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

  const filteredTasks = useMemo(() => {
    const rows = onlyOpen ? tasks.filter((item) => isOpenStatus(item.status)) : tasks;
    return rows;
  }, [onlyOpen, tasks]);

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
    setError("");
    try {
      await updateTask(task.id, {
        status: nextStatus,
        completed_at: nextStatus === "done" ? new Date().toISOString() : null
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="module two-col">
      <article className="panel">
        <h2>Tarefas</h2>
        <p className="muted">Cadastre e acompanhe tarefas comerciais e técnicas com prazo e prioridade.</p>
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
        <h3>Painel de tarefas</h3>
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
            {onlyOpen ? "Mostrar todas" : "Mostrar apenas abertas"}
          </button>
        </div>

        <div className="table-wrap top-gap">
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
              {filteredTasks.map((task) => (
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
              {!filteredTasks.length ? (
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
