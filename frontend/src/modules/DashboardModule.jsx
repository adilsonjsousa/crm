import { useEffect, useMemo, useState } from "react";
import { getDashboardKpis, getPipelineByStage, listOpportunities, listTickets } from "../lib/revenueApi";
import { stageLabel } from "../lib/pipelineStages";

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
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

function formatDateOnly(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function isTicketOpen(status) {
  const normalized = String(status || "")
    .toLowerCase()
    .trim();
  if (!normalized) return true;
  return !["closed", "resolved", "done", "cancelled", "fechado", "concluido", "finalizado"].includes(normalized);
}

function normalizePriority(priority) {
  const normalized = String(priority || "")
    .toLowerCase()
    .trim();
  if (["urgent", "urgente", "alta", "high", "critical", "critica", "crítica"].includes(normalized)) return "high";
  return "other";
}

/* ── SVG Icon components ── */
function IconRevenue() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

function IconTicket() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5v2" /><path d="M15 11v2" /><path d="M15 17v2" /><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconTasks() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="6" height="6" rx="1" /><path d="m3 17 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" />
    </svg>
  );
}

function IconCompany() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V3.5a1.5 1.5 0 0 0-3 0V7" /><path d="M8 7V3.5a1.5 1.5 0 0 1 3 0V7" /><path d="M6 12h4" /><path d="M14 12h4" /><path d="M6 16h4" /><path d="M14 16h4" />
    </svg>
  );
}

function IconFunnel() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

function IconValue() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconDeal() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconSupport() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const FOCUS_ICONS = {
  revenue: IconRevenue,
  won: IconTrophy,
  "open-tickets": IconTicket,
  "high-priority": IconAlert,
  "open-tasks": IconTasks,
  companies: IconCompany
};

const FOCUS_COLORS = {
  revenue: "var(--dash-green, #0b8f6f)",
  won: "var(--dash-blue, #2563eb)",
  "open-tickets": "var(--dash-amber, #d97706)",
  "high-priority": "var(--dash-red, #dc2626)",
  "open-tasks": "var(--dash-purple, #7c3aed)",
  companies: "var(--dash-teal, #0891b2)"
};

const STAGE_COLORS = [
  "#7c3aed", "#6d28d9", "#2563eb", "#0891b2", "#0b8f6f", "#16a34a", "#d97706", "#dc2626"
];

/* ── Loading skeleton ── */
function DashboardSkeleton() {
  return (
    <section className="module dashboard-modern">
      <div className="dash-skeleton-grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="dash-skeleton-card">
            <div className="dash-skeleton-line dash-skeleton-sm" />
            <div className="dash-skeleton-line dash-skeleton-lg" />
            <div className="dash-skeleton-line dash-skeleton-sm" />
          </div>
        ))}
      </div>
      <div className="dash-skeleton-hero">
        <div className="dash-skeleton-line dash-skeleton-sm" />
        <div className="dash-skeleton-line dash-skeleton-xl" />
        <div className="dash-skeleton-line dash-skeleton-md" />
      </div>
    </section>
  );
}

export default function DashboardModule() {
  const [kpis, setKpis] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [activities, setActivities] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [recentOpportunities, setRecentOpportunities] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [kpiResult, pipelineResult, opportunitiesResult, ticketsResult] = await Promise.all([
          getDashboardKpis(),
          getPipelineByStage(),
          listOpportunities(),
          listTickets()
        ]);

        if (!active) return;
        setKpis(kpiResult);
        setPipeline(pipelineResult);
        setRecentOpportunities(opportunitiesResult || []);
        setSupportTickets(ticketsResult || []);

        const mergedActivities = [
          ...(opportunitiesResult || []).slice(0, 6).map((item) => ({
            id: `opp-${item.id}`,
            kind: "Negócio",
            title: item.title || "Oportunidade",
            company: item.companies?.trade_name || "-",
            note: `Etapa: ${stageLabel(item.stage)}`,
            at: item.created_at
          })),
          ...(ticketsResult || []).slice(0, 6).map((item) => ({
            id: `ticket-${item.id}`,
            kind: "Suporte",
            title: item.description || "Chamado técnico",
            company: item.companies?.trade_name || "-",
            note: `Prioridade: ${item.priority || "-"}`,
            at: item.opened_at
          }))
        ]
          .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
          .slice(0, 5);

        setActivities(mergedActivities);
      } catch (err) {
        if (!active) return;
        setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const pipelineSummary = useMemo(() => {
    const totalDeals = pipeline.reduce((acc, row) => acc + Number(row.totalDeals || 0), 0);
    const totalValue = pipeline.reduce((acc, row) => acc + Number(row.totalValue || 0), 0);
    const wonRows = pipeline.filter((row) => row.stage === "ganho");
    const wonDeals = wonRows.reduce((acc, row) => acc + Number(row.totalDeals || 0), 0);
    const wonValue = wonRows.reduce((acc, row) => acc + Number(row.totalValue || 0), 0);
    const maxDeals = Math.max(1, ...pipeline.map((row) => Number(row.totalDeals || 0)));
    const maxValue = Math.max(1, ...pipeline.map((row) => Number(row.totalValue || 0)));
    const nonLeadValue = pipeline
      .filter((row) => row.stage !== "lead")
      .reduce((acc, row) => acc + Number(row.totalValue || 0), 0);

    return {
      totalDeals,
      totalValue,
      nonLeadValue,
      wonDeals,
      wonValue,
      winRate: totalDeals ? Math.round((wonDeals / totalDeals) * 100) : 0,
      maxDeals,
      maxValue
    };
  }, [pipeline]);

  const supportSummary = useMemo(() => {
    const openTickets = supportTickets.filter((ticket) => isTicketOpen(ticket.status));
    const high = openTickets.filter((ticket) => normalizePriority(ticket.priority) === "high").length;

    return {
      open: openTickets.length,
      high
    };
  }, [supportTickets]);

  const stageCards = useMemo(
    () =>
      pipeline.map((row, idx) => ({
        ...row,
        dealsPercent: Math.round((Number(row.totalDeals || 0) / pipelineSummary.maxDeals) * 100),
        valuePercent: Math.round((Number(row.totalValue || 0) / pipelineSummary.maxValue) * 100),
        color: STAGE_COLORS[idx % STAGE_COLORS.length]
      })),
    [pipeline, pipelineSummary.maxDeals, pipelineSummary.maxValue]
  );

  const upcomingClosings = useMemo(() => {
    return (recentOpportunities || [])
      .filter((item) => item.status === "open" && item.stage !== "lead" && item.expected_close_date)
      .sort((a, b) => new Date(a.expected_close_date).getTime() - new Date(b.expected_close_date).getTime())
      .slice(0, 6);
  }, [recentOpportunities]);

  const focusCards = useMemo(
    () => [
      { id: "revenue", label: "Receita realizada", value: brl(kpis?.revenue || 0), note: "Base de pedidos" },
      { id: "won", label: "Negócios ganhos", value: String(pipelineSummary.wonDeals), note: brl(pipelineSummary.wonValue) },
      { id: "open-tickets", label: "Chamados abertos", value: String(supportSummary.open), note: "Pós-venda" },
      { id: "high-priority", label: "Prioridade alta", value: String(supportSummary.high), note: "Risco técnico" },
      { id: "open-tasks", label: "Tarefas abertas", value: String(kpis?.openTasks || 0), note: "Agenda comercial" },
      { id: "companies", label: "Empresas", value: String(kpis?.companies || 0), note: "Base ativa" }
    ],
    [kpis?.companies, kpis?.openTasks, kpis?.revenue, pipelineSummary.wonDeals, pipelineSummary.wonValue, supportSummary.high, supportSummary.open]
  );

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
      }).format(new Date()),
    []
  );

  if (loading) return <DashboardSkeleton />;

  return (
    <section className="module dashboard-modern">
      {error ? <p className="error-text">{error}</p> : null}

      {/* ── Hero banner ── */}
      <article className="dash-hero">
        <div className="dash-hero-content">
          <span className="dash-hero-kicker">Resumo executivo</span>
          <h2 className="dash-hero-title">Painel comercial</h2>
          <p className="dash-hero-desc">Visão rápida de funil, vendas, suporte e próximos fechamentos.</p>
          <div className="dash-hero-chips">
            <span className="dash-chip dash-chip-live">
              <span className="dash-pulse" /> Tempo real
            </span>
            <span className="dash-chip">{todayLabel}</span>
          </div>
        </div>
        <div className="dash-hero-metrics">
          <div className="dash-hero-metric">
            <div className="dash-hero-metric-icon"><IconFunnel /></div>
            <div>
              <span>Negócios no funil</span>
              <strong>{pipelineSummary.totalDeals}</strong>
            </div>
          </div>
          <div className="dash-hero-metric">
            <div className="dash-hero-metric-icon"><IconValue /></div>
            <div>
              <span>Valor total</span>
              <strong>{brl(pipelineSummary.totalValue)}</strong>
            </div>
          </div>
          <div className="dash-hero-metric">
            <div className="dash-hero-metric-icon"><IconTarget /></div>
            <div>
              <span>Taxa de ganho</span>
              <strong>{pipelineSummary.winRate}%</strong>
            </div>
          </div>
          <div className="dash-hero-metric">
            <div className="dash-hero-metric-icon"><IconValue /></div>
            <div>
              <span>Sem LEAD</span>
              <strong>{brl(pipelineSummary.nonLeadValue)}</strong>
            </div>
          </div>
        </div>
      </article>

      {/* ── Focus KPI cards ── */}
      <div className="dash-focus-grid">
        {focusCards.map((card, idx) => {
          const Icon = FOCUS_ICONS[card.id] || IconRevenue;
          const color = FOCUS_COLORS[card.id] || "var(--accent-1)";
          return (
            <article
              key={card.id}
              className="dash-focus-card"
              style={{ "--card-accent": color, animationDelay: `${idx * 60}ms` }}
            >
              <div className="dash-focus-icon" style={{ color }}>
                <Icon />
              </div>
              <div className="dash-focus-body">
                <span className="dash-focus-label">{card.label}</span>
                <strong className="dash-focus-value">{card.value}</strong>
                <small className="dash-focus-note">{card.note}</small>
              </div>
            </article>
          );
        })}
      </div>

      {/* ── Two-column: Pipeline + Activities ── */}
      <div className="dash-two-col">
        {/* Pipeline */}
        <article className="dash-panel">
          <header className="dash-panel-header">
            <div className="dash-panel-title-row">
              <div className="dash-panel-icon"><IconFunnel /></div>
              <div>
                <h3>Pipeline por etapa</h3>
                <p className="dash-panel-subtitle">Quantidade e valor por etapa</p>
              </div>
            </div>
          </header>
          <div className="dash-stage-list">
            {stageCards.map((row) => (
              <article className="dash-stage-card" key={row.stage} style={{ "--stage-color": row.color }}>
                <div className="dash-stage-head">
                  <div className="dash-stage-dot" />
                  <strong>{row.stageLabel || stageLabel(row.stage)}</strong>
                  <span className="dash-stage-count">{row.totalDeals}</span>
                </div>
                <p className="dash-stage-value">{brl(row.totalValue)}</p>
                <div className="dash-stage-bars">
                  <div className="dash-stage-bar">
                    <small>Qtd</small>
                    <div className="dash-bar-track">
                      <div className="dash-bar-fill" style={{ width: `${row.dealsPercent}%`, background: row.color }} />
                    </div>
                  </div>
                  <div className="dash-stage-bar">
                    <small>Valor</small>
                    <div className="dash-bar-track">
                      <div className="dash-bar-fill" style={{ width: `${row.valuePercent}%`, background: row.color, opacity: 0.7 }} />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        {/* Activities */}
        <article className="dash-panel">
          <header className="dash-panel-header">
            <div className="dash-panel-title-row">
              <div className="dash-panel-icon"><IconActivity /></div>
              <div>
                <h3>Atividades recentes</h3>
                <p className="dash-panel-subtitle">Últimas movimentações</p>
              </div>
            </div>
          </header>
          <ul className="dash-activity-list">
            {activities.map((item) => (
              <li key={item.id} className="dash-activity-item">
                <div className={`dash-activity-badge ${item.kind === "Suporte" ? "dash-badge-support" : "dash-badge-deal"}`}>
                  {item.kind === "Suporte" ? <IconSupport /> : <IconDeal />}
                </div>
                <div className="dash-activity-body">
                  <p className="dash-activity-title">{item.title}</p>
                  <p className="dash-activity-meta">
                    <span className={`dash-tag ${item.kind === "Suporte" ? "dash-tag-support" : "dash-tag-deal"}`}>{item.kind}</span>
                    <span>{item.company}</span>
                    <span>{item.note}</span>
                  </p>
                </div>
                <span className="dash-activity-date">{formatDateTime(item.at)}</span>
              </li>
            ))}
            {!activities.length ? <li className="muted">Sem atividades recentes.</li> : null}
          </ul>
        </article>
      </div>

      {/* ── Upcoming closings ── */}
      <article className="dash-panel">
        <header className="dash-panel-header">
          <div className="dash-panel-title-row">
            <div className="dash-panel-icon"><IconCalendar /></div>
            <div>
              <h3>Próximos fechamentos</h3>
              <p className="dash-panel-subtitle">Oportunidades com data prevista</p>
            </div>
          </div>
        </header>
        <ul className="dash-closing-list">
          {upcomingClosings.map((item, idx) => (
            <li key={item.id} className="dash-closing-item" style={{ animationDelay: `${idx * 50}ms` }}>
              <div className="dash-closing-rank">{idx + 1}</div>
              <div className="dash-closing-body">
                <p className="dash-closing-title">{item.title || "-"}</p>
                <p className="dash-closing-subtitle">{item.companies?.trade_name || "-"}</p>
              </div>
              <div className="dash-closing-side">
                <strong>{brl(item.estimated_value)}</strong>
                <span className="dash-closing-date">
                  <IconCalendar /> {formatDateOnly(item.expected_close_date)}
                </span>
              </div>
            </li>
          ))}
          {!upcomingClosings.length ? <li className="muted">Nenhum fechamento previsto nas oportunidades abertas.</li> : null}
        </ul>
      </article>
    </section>
  );
}
