import { useEffect, useMemo, useState } from "react";
import KpiCard from "../components/KpiCard";
import { getDashboardKpis, getPipelineByStage, listOpportunities, listTickets } from "../lib/revenueApi";
import { stageLabel } from "../lib/pipelineStages";

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function DashboardModule() {
  const [kpis, setKpis] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [activities, setActivities] = useState([]);
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

        const mergedActivities = [
          ...(opportunitiesResult || []).slice(0, 6).map((item) => ({
            id: `opp-${item.id}`,
            kind: "Negócio",
            title: item.title,
            company: item.companies?.trade_name || "-",
            note: `Etapa: ${stageLabel(item.stage)}`,
            at: item.created_at
          })),
          ...(ticketsResult || []).slice(0, 6).map((item) => ({
            id: `ticket-${item.id}`,
            kind: "Suporte",
            title: item.description || "Chamado técnico",
            company: item.companies?.trade_name || "-",
            note: `Prioridade: ${item.priority}`,
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

    return {
      totalDeals,
      totalValue,
      wonDeals,
      winRate: totalDeals ? Math.round((wonDeals / totalDeals) * 100) : 0,
      maxDeals
    };
  }, [pipeline]);

  if (loading) return <p className="muted">Carregando dashboard...</p>;

  return (
    <section className="module">
      {error ? <p className="error-text">{error}</p> : null}
      <div className="dashboard-strip">
        <article className="metric-tile">
          <span>Negócios no funil</span>
          <strong>{pipelineSummary.totalDeals}</strong>
        </article>
        <article className="metric-tile">
          <span>Valor total do pipeline</span>
          <strong>{brl(pipelineSummary.totalValue)}</strong>
        </article>
        <article className="metric-tile">
          <span>Taxa de ganho</span>
          <strong>{pipelineSummary.winRate}%</strong>
        </article>
      </div>

      <article className="panel top-gap">
        <h3>Pipeline por Etapa</h3>
        <table>
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Qtd</th>
              <th>Valor</th>
              <th>Participação</th>
            </tr>
          </thead>
          <tbody>
            {pipeline.map((row) => {
              const ratio = Number(row.totalDeals || 0) / pipelineSummary.maxDeals;
              return (
                <tr key={row.stage}>
                  <td>{row.stageLabel || stageLabel(row.stage)}</td>
                  <td>{row.totalDeals}</td>
                  <td>{brl(row.totalValue)}</td>
                  <td>
                    <div className="stage-meter">
                      <span style={{ width: `${Math.round(ratio * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>

      {kpis ? (
        <div className="kpi-grid top-gap">
          <KpiCard label="Empresas" value={kpis.companies} />
          <KpiCard label="Oportunidades" value={kpis.opportunities} />
          <KpiCard label="Tarefas Abertas" value={kpis.openTasks || 0} />
          <KpiCard label="Chamados Abertos" value={kpis.openTickets} />
          <KpiCard label="Pedidos" value={kpis.orders} />
          <KpiCard label="Faturamento" value={brl(kpis.revenue)} />
        </div>
      ) : null}

      <div className="two-col top-gap">
        <article className="panel">
          <h3>Atividades Recentes</h3>
          <ul className="activity-list">
            {activities.map((item) => (
              <li key={item.id} className="activity-item">
                <div>
                  <p className="activity-title">{item.title}</p>
                  <p className="activity-meta">
                    <strong>{item.kind}</strong> · {item.company} · {item.note}
                  </p>
                </div>
                <span className="activity-date">{formatDate(item.at)}</span>
              </li>
            ))}
            {!activities.length ? <li className="muted">Sem atividades recentes.</li> : null}
          </ul>
        </article>
      </div>
    </section>
  );
}
