import { useEffect, useState } from "react";
import KpiCard from "../components/KpiCard";
import { getDashboardKpis, getPipelineByStage } from "../lib/revenueApi";
import { stageLabel } from "../lib/pipelineStages";

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export default function DashboardModule() {
  const [kpis, setKpis] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [kpiResult, pipelineResult] = await Promise.all([getDashboardKpis(), getPipelineByStage()]);
        if (!active) return;
        setKpis(kpiResult);
        setPipeline(pipelineResult);
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

  if (loading) return <p className="muted">Carregando dashboard...</p>;

  return (
    <section className="module">
      <h2>Dashboard de Receita</h2>
      {error ? <p className="error-text">{error}</p> : null}
      {kpis ? (
        <div className="kpi-grid">
          <KpiCard label="Empresas" value={kpis.companies} />
          <KpiCard label="Oportunidades" value={kpis.opportunities} />
          <KpiCard label="Chamados Abertos" value={kpis.openTickets} />
          <KpiCard label="Pedidos" value={kpis.orders} />
          <KpiCard label="Faturamento" value={brl(kpis.revenue)} />
        </div>
      ) : null}

      <article className="panel top-gap">
        <h3>Funil por Etapa</h3>
        <table>
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Qtd</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {pipeline.map((row) => (
              <tr key={row.stage}>
                <td>{row.stageLabel || stageLabel(row.stage)}</td>
                <td>{row.totalDeals}</td>
                <td>{brl(row.totalValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
