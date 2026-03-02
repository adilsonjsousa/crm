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
  if (["media", "média", "medium"].includes(normalized)) return "medium";
  return "low";
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
          .slice(0, 8);

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
    const wonDeals = pipeline
      .filter((row) => row.stage === "ganho")
      .reduce((acc, row) => acc + Number(row.totalDeals || 0), 0);
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
      winRate: totalDeals ? Math.round((wonDeals / totalDeals) * 100) : 0,
      maxDeals,
      maxValue
    };
  }, [pipeline]);

  const supportSummary = useMemo(() => {
    const openTickets = supportTickets.filter((ticket) => isTicketOpen(ticket.status));
    const high = openTickets.filter((ticket) => normalizePriority(ticket.priority) === "high").length;
    const medium = openTickets.filter((ticket) => normalizePriority(ticket.priority) === "medium").length;
    const low = openTickets.filter((ticket) => normalizePriority(ticket.priority) === "low").length;

    return {
      open: openTickets.length,
      high,
      medium,
      low
    };
  }, [supportTickets]);

  const stageCards = useMemo(
    () =>
      pipeline.map((row) => ({
        ...row,
        dealsPercent: Math.round((Number(row.totalDeals || 0) / pipelineSummary.maxDeals) * 100),
        valuePercent: Math.round((Number(row.totalValue || 0) / pipelineSummary.maxValue) * 100)
      })),
    [pipeline, pipelineSummary.maxDeals, pipelineSummary.maxValue]
  );

  const upcomingClosings = useMemo(() => {
    return (recentOpportunities || [])
      .filter((item) => item.status === "open" && item.stage !== "lead" && item.expected_close_date)
      .sort((a, b) => new Date(a.expected_close_date).getTime() - new Date(b.expected_close_date).getTime())
      .slice(0, 6);
  }, [recentOpportunities]);

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

  if (loading) return <p className="muted">Carregando dashboard...</p>;

  return (
    <section className="module dashboard-modern">
      {error ? <p className="error-text">{error}</p> : null}

      <div className="dashboard-modern-hero">
        <article className="dashboard-hero-primary">
          <p className="dashboard-kicker">Resumo executivo</p>
          <h2>Painel comercial da operação</h2>
          <p className="dashboard-hero-description">
            Visão rápida de funil, performance de vendas, backlog de suporte e próximos fechamentos.
          </p>
          <div className="dashboard-hero-chips">
            <span>Atualizado em tempo real</span>
            <span>{todayLabel}</span>
          </div>
          <div className="dashboard-modern-strip">
            <article className="dashboard-modern-metric">
              <span>Negócios no funil</span>
              <strong>{pipelineSummary.totalDeals}</strong>
            </article>
            <article className="dashboard-modern-metric">
              <span>Valor total do funil</span>
              <strong>{brl(pipelineSummary.totalValue)}</strong>
            </article>
            <article className="dashboard-modern-metric">
              <span>Taxa de ganho</span>
              <strong>{pipelineSummary.winRate}%</strong>
            </article>
          </div>
        </article>

        <article className="panel dashboard-hero-side">
          <h3>Radar de suporte</h3>
          <div className="dashboard-support-kpis">
            <div>
              <span>Chamados abertos</span>
              <strong>{supportSummary.open}</strong>
            </div>
            <div>
              <span>Prioridade alta</span>
              <strong>{supportSummary.high}</strong>
            </div>
            <div>
              <span>Prioridade média</span>
              <strong>{supportSummary.medium}</strong>
            </div>
            <div>
              <span>Prioridade baixa</span>
              <strong>{supportSummary.low}</strong>
            </div>
          </div>
        </article>
      </div>

      {kpis ? (
        <div className="dashboard-modern-kpi-grid top-gap">
          <article className="kpi-card">
            <span className="kpi-label">Empresas</span>
            <strong className="kpi-value">{kpis.companies}</strong>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Oportunidades</span>
            <strong className="kpi-value">{kpis.opportunities}</strong>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Tarefas abertas</span>
            <strong className="kpi-value">{kpis.openTasks || 0}</strong>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Chamados abertos</span>
            <strong className="kpi-value">{kpis.openTickets}</strong>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Pedidos</span>
            <strong className="kpi-value">{kpis.orders}</strong>
          </article>
          <article className="kpi-card">
            <span className="kpi-label">Faturamento</span>
            <strong className="kpi-value">{brl(kpis.revenue)}</strong>
          </article>
        </div>
      ) : null}

      <div className="dashboard-modern-grid top-gap">
        <article className="panel dashboard-pipeline-panel">
          <header className="dashboard-section-header">
            <div>
              <h3>Pipeline por etapa</h3>
              <p className="muted">Quantidade e valor por etapa, com prioridade visual.</p>
            </div>
            <div className="dashboard-highlight">
              <span>Valor (sem LEAD)</span>
              <strong>{brl(pipelineSummary.nonLeadValue)}</strong>
            </div>
          </header>
          <div className="dashboard-stage-grid">
            {stageCards.map((row) => (
              <article className="dashboard-stage-card" key={row.stage}>
                <div className="dashboard-stage-head">
                  <strong>{row.stageLabel || stageLabel(row.stage)}</strong>
                  <span>{row.totalDeals} oportunidade(s)</span>
                </div>
                <p className="dashboard-stage-value">{brl(row.totalValue)}</p>
                <div className="dashboard-stage-meters">
                  <div className="dashboard-stage-meter">
                    <small>Qtd</small>
                    <div className="stage-meter">
                      <span style={{ width: `${row.dealsPercent}%` }} />
                    </div>
                  </div>
                  <div className="dashboard-stage-meter">
                    <small>Valor</small>
                    <div className="stage-meter">
                      <span style={{ width: `${row.valuePercent}%` }} />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </article>

        <div className="dashboard-right-stack">
          <article className="panel">
            <h3>Atividades recentes</h3>
            <ul className="activity-list">
              {activities.map((item) => (
                <li key={item.id} className="activity-item">
                  <div>
                    <p className="activity-title">{item.title}</p>
                    <p className="activity-meta">
                      <strong>{item.kind}</strong> · {item.company} · {item.note}
                    </p>
                  </div>
                  <span className="activity-date">{formatDateTime(item.at)}</span>
                </li>
              ))}
              {!activities.length ? <li className="muted">Sem atividades recentes.</li> : null}
            </ul>
          </article>

          <article className="panel">
            <h3>Próximos fechamentos</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Oportunidade</th>
                    <th>Previsão</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingClosings.map((item) => (
                    <tr key={item.id}>
                      <td>{item.companies?.trade_name || "-"}</td>
                      <td>{item.title || "-"}</td>
                      <td>{formatDateOnly(item.expected_close_date)}</td>
                      <td>{brl(item.estimated_value)}</td>
                    </tr>
                  ))}
                  {!upcomingClosings.length ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        Nenhum fechamento previsto nas oportunidades abertas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
