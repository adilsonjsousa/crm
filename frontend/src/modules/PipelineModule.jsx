import { useEffect, useMemo, useState } from "react";
import { createOpportunity, listCompanyOptions, listOpportunities, updateOpportunityStage } from "../lib/revenueApi";
import { PIPELINE_STAGES, canMoveToStage, stageLabel, stageStatus } from "../lib/pipelineStages";

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export default function PipelineModule() {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [dragOverStage, setDragOverStage] = useState("");
  const [form, setForm] = useState({
    company_id: "",
    title: "",
    stage: "lead",
    estimated_value: "",
    expected_close_date: ""
  });

  const itemsByStage = useMemo(() => {
    const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
      acc[stage.value] = [];
      return acc;
    }, {});

    for (const item of items) {
      if (!grouped[item.stage]) continue;
      grouped[item.stage].push(item);
    }

    return grouped;
  }, [items]);

  async function load() {
    setError("");
    try {
      const [opps, companiesData] = await Promise.all([listOpportunities(), listCompanyOptions()]);
      setItems(opps);
      setCompanies(companiesData);
      if (!form.company_id && companiesData.length) {
        setForm((prev) => ({ ...prev, company_id: companiesData[0].id }));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      await createOpportunity({
        company_id: form.company_id,
        title: form.title,
        stage: form.stage,
        status: stageStatus(form.stage),
        estimated_value: Number(form.estimated_value || 0),
        expected_close_date: form.expected_close_date || null
      });
      setForm((prev) => ({ ...prev, title: "", estimated_value: "", expected_close_date: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDragStart(event, opportunityId) {
    setDraggingId(opportunityId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/opportunity-id", opportunityId);
  }

  function handleDragEnd() {
    setDraggingId("");
    setDragOverStage("");
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  async function handleDrop(event, targetStage) {
    event.preventDefault();
    setDragOverStage("");

    const opportunityId = event.dataTransfer.getData("text/opportunity-id") || draggingId;
    if (!opportunityId) return;

    const currentOpportunity = items.find((item) => item.id === opportunityId);
    if (!currentOpportunity) return;

    if (currentOpportunity.stage === targetStage) return;

    if (!canMoveToStage(currentOpportunity.stage, targetStage)) {
      setError(`Movimento inválido. Avance para a próxima etapa do funil (${stageLabel(currentOpportunity.stage)}).`);
      return;
    }

    const previousItems = items;
    setError("");
    setItems((prev) =>
      prev.map((item) =>
        item.id === opportunityId
          ? { ...item, stage: targetStage, status: stageStatus(targetStage) }
          : item
      )
    );

    try {
      await updateOpportunityStage({
        opportunityId,
        fromStage: currentOpportunity.stage,
        toStage: targetStage
      });
    } catch (err) {
      setItems(previousItems);
      setError(err.message);
    } finally {
      setDraggingId("");
    }
  }

  return (
    <section className="module">
      <article className="panel">
        <h2>Pipeline Comercial</h2>
        <p className="muted">Arraste os cards para evoluir a oportunidade para a próxima etapa.</p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <select
            value={form.company_id}
            onChange={(e) => setForm((prev) => ({ ...prev, company_id: e.target.value }))}
            required
          >
            <option value="">Selecione a empresa</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.trade_name}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Título da oportunidade"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Valor estimado"
            value={form.estimated_value}
            onChange={(e) => setForm((prev) => ({ ...prev, estimated_value: e.target.value }))}
          />
          <select value={form.stage} onChange={(e) => setForm((prev) => ({ ...prev, stage: e.target.value }))}>
            {PIPELINE_STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.expected_close_date}
            onChange={(e) => setForm((prev) => ({ ...prev, expected_close_date: e.target.value }))}
          />
          <button type="submit" className="btn-primary">Salvar oportunidade</button>
        </form>
      </article>

      <article className="panel top-gap">
        <h3>Funil de vendas</h3>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="pipeline-board">
          {PIPELINE_STAGES.map((stage) => (
            <section
              key={stage.value}
              className={`pipeline-column ${dragOverStage === stage.value ? "is-over" : ""}`}
              onDragOver={handleDragOver}
              onDragEnter={() => setDragOverStage(stage.value)}
              onDragLeave={() => setDragOverStage("")}
              onDrop={(event) => handleDrop(event, stage.value)}
            >
              <header className="pipeline-column-header">
                <span>{stage.label}</span>
                <strong>{itemsByStage[stage.value]?.length || 0}</strong>
              </header>

              <div className="pipeline-column-body">
                {(itemsByStage[stage.value] || []).map((item) => (
                  <article
                    key={item.id}
                    className={`pipeline-card ${draggingId === item.id ? "is-dragging" : ""}`}
                    draggable
                    onDragStart={(event) => handleDragStart(event, item.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <p className="pipeline-card-title">{item.title}</p>
                    <p className="pipeline-card-company">{item.companies?.trade_name || "-"}</p>
                    <p className="pipeline-card-value">{brl(item.estimated_value)}</p>
                  </article>
                ))}

                {!itemsByStage[stage.value]?.length ? <p className="pipeline-empty">Sem oportunidades</p> : null}
              </div>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}
