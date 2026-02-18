import { useEffect, useMemo, useState } from "react";
import {
  createOpportunity,
  listCompanyOptions,
  listOpportunities,
  updateOpportunity,
  updateOpportunityStage
} from "../lib/revenueApi";
import { PIPELINE_STAGES, canMoveToStage, stageLabel, stageStatus } from "../lib/pipelineStages";

const OPPORTUNITY_TITLES = [
  "ACABAMENTOS GRÁFICOS",
  "COMUNICAÇÃO VISUAL",
  "PRODUÇÃO COLOR",
  "PRODUÇÃO MONO",
  "OFFICE COLOR",
  "OFFICE MONO",
  "SUBLIMAÇÃO TEXTIL"
];

const OPPORTUNITY_SUBCATEGORIES = {
  "ACABAMENTOS GRÁFICOS": [
    "LAMINAÇÃO",
    "VERNIZ UV",
    "CORTE E VINCO",
    "HOT STAMPING",
    "DOBRA E COLAGEM"
  ],
  "COMUNICAÇÃO VISUAL": ["BANNER", "ADESIVO", "LONA", "PLACA EM PVC", "FACHADA"],
  "PRODUÇÃO COLOR": [
    "CANON imagePRESS V700",
    "XEROX VERSANT 280",
    "RICOH PRO C5300",
    "KONICA MINOLTA ACCURIOPRESS C4080"
  ],
  "PRODUÇÃO MONO": ["XEROX PRIMELINK B9100", "RICOH PRO 8300S", "CANON VARIOPRINT 115"],
  "OFFICE COLOR": ["CANON IR ADV C3926", "HP COLOR LASERJET E783", "KYOCERA TASKALFA 2554CI"],
  "OFFICE MONO": ["BROTHER DCP-B7650", "KYOCERA ECOSYS M3655IDN", "XEROX B315"],
  "SUBLIMAÇÃO TEXTIL": ["EPSON SURECOLOR F9470", "MIMAKI TS100-1600", "CALANDRA TÊXTIL 1.8M"]
};

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function normalizeTitlePart(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function composeOpportunityTitle(titleCategory, titleSubcategory) {
  const category = normalizeTitlePart(titleCategory);
  const subcategory = normalizeTitlePart(titleSubcategory);
  if (!category) return "";
  if (!subcategory) return category;
  return `${category} > ${subcategory}`;
}

function parseOpportunityTitle(rawTitle) {
  const normalized = normalizeTitlePart(rawTitle);
  if (!normalized) {
    return { title_category: "", title_subcategory: "" };
  }

  const parts = normalized.split(">");
  const category = normalizeTitlePart(parts.shift());
  const subcategory = normalizeTitlePart(parts.join(">"));

  if (OPPORTUNITY_TITLES.includes(category)) {
    return { title_category: category, title_subcategory: subcategory };
  }

  return { title_category: "", title_subcategory: normalized };
}

function emptyOpportunityForm(defaultCompanyId = "") {
  return {
    company_id: defaultCompanyId,
    title_category: "",
    title_subcategory: "",
    stage: "lead",
    estimated_value: "",
    expected_close_date: ""
  };
}

export default function PipelineModule() {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [dragOverStage, setDragOverStage] = useState("");
  const [editingOpportunityId, setEditingOpportunityId] = useState("");
  const [form, setForm] = useState(() => emptyOpportunityForm());

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
      if (companiesData.length) {
        setForm((prev) => (prev.company_id ? prev : { ...prev, company_id: companiesData[0].id }));
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
      const titleCategory = normalizeTitlePart(form.title_category);
      const titleSubcategory = normalizeTitlePart(form.title_subcategory);
      if (!titleCategory) {
        setError("Selecione o título da oportunidade.");
        return;
      }
      if (!titleSubcategory) {
        setError("Informe a sub-categoria da oportunidade.");
        return;
      }

      const payload = {
        company_id: form.company_id,
        title: composeOpportunityTitle(titleCategory, titleSubcategory),
        stage: form.stage,
        status: stageStatus(form.stage),
        estimated_value: Number(form.estimated_value || 0),
        expected_close_date: form.expected_close_date || null
      };

      if (editingOpportunityId) {
        const currentOpportunity = items.find((item) => item.id === editingOpportunityId);
        await updateOpportunity(editingOpportunityId, {
          ...payload,
          from_stage: currentOpportunity?.stage || null
        });
      } else {
        await createOpportunity(payload);
      }

      setEditingOpportunityId("");
      setForm(emptyOpportunityForm(companies[0]?.id || ""));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDragStart(event, opportunityId) {
    if (event.target?.closest && event.target.closest(".pipeline-card-actions")) {
      event.preventDefault();
      return;
    }
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
    if (editingOpportunityId === opportunityId) {
      setForm((prev) => ({ ...prev, stage: targetStage }));
    }

    try {
      await updateOpportunityStage({
        opportunityId,
        fromStage: currentOpportunity.stage,
        toStage: targetStage
      });
    } catch (err) {
      setItems(previousItems);
      if (editingOpportunityId === opportunityId) {
        setForm((prev) => ({ ...prev, stage: currentOpportunity.stage }));
      }
      setError(err.message);
    } finally {
      setDraggingId("");
    }
  }

  function startEditOpportunity(item) {
    setError("");
    const parsedTitle = parseOpportunityTitle(item.title);
    setEditingOpportunityId(item.id);
    setForm({
      company_id: item.company_id || "",
      title_category: parsedTitle.title_category,
      title_subcategory: parsedTitle.title_subcategory,
      stage: item.stage || "lead",
      estimated_value: String(item.estimated_value ?? ""),
      expected_close_date: item.expected_close_date || ""
    });
  }

  function cancelEditOpportunity() {
    setError("");
    setEditingOpportunityId("");
    setForm(emptyOpportunityForm(companies[0]?.id || ""));
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
          <select
            required
            value={form.title_category}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, title_category: e.target.value, title_subcategory: "" }))
            }
          >
            <option value="">Selecione o título da oportunidade</option>
            {OPPORTUNITY_TITLES.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </select>
          <input
            required
            list="pipeline-subcategory-options"
            placeholder="Sub-categoria (ex.: CANON imagePRESS V700)"
            value={form.title_subcategory}
            onChange={(e) => setForm((prev) => ({ ...prev, title_subcategory: e.target.value }))}
            disabled={!form.title_category}
          />
          <datalist id="pipeline-subcategory-options">
            {(OPPORTUNITY_SUBCATEGORIES[form.title_category] || []).map((subcategory) => (
              <option key={subcategory} value={subcategory} />
            ))}
          </datalist>
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
          <div className="inline-actions">
            <button type="submit" className="btn-primary">
              {editingOpportunityId ? "Atualizar oportunidade" : "Salvar oportunidade"}
            </button>
            {editingOpportunityId ? (
              <button type="button" className="btn-ghost" onClick={cancelEditOpportunity}>
                Cancelar edição
              </button>
            ) : null}
          </div>
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
                    <div className="pipeline-card-actions">
                      <button
                        type="button"
                        className="btn-ghost btn-table-action"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditOpportunity(item);
                        }}
                      >
                        {editingOpportunityId === item.id ? "Editando" : "Editar"}
                      </button>
                    </div>
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
