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

// Carga inicial importada da planilha "EXPORTAR PARA CRM.xlsx".
const PRODUCT_CATALOG_ROWS = [
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 320v", estimated_value: 7990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 4606", estimated_value: 19900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 500v", estimated_value: 29900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 670PX", estimated_value: 59990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 670RTS", estimated_value: 64900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Guilhotina 9211D", estimated_value: 119000 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Encadernadora HotMelt Semi- automatica", estimated_value: 15900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Encadernadora HotMelt 50R", estimated_value: 34900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Encadernadora HotMelt G470", estimated_value: 129000 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora F360E", estimated_value: 43990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora D4", estimated_value: 26990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora FM490", estimated_value: 25990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora F390E", estimated_value: 35990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte PC350", estimated_value: 16900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laminadora 520c hidrauliuca", estimated_value: 1 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Laser 1390", estimated_value: 39990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Fiber Laser 30 watts", estimated_value: 29900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Vincadeira e Serrilhadeira Full Auto", estimated_value: 25900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Grampeador 1 cabeca", estimated_value: 7900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Canteadeira", estimated_value: 7900 },
  { title: "COMUNICAÇÃO VISUAL", product: "Ecosolvente K 1801S - 1 i3200", estimated_value: 54900 },
  { title: "COMUNICAÇÃO VISUAL", product: "Ecosolvente K 1802S - 2 i3200", estimated_value: 79990 },
  { title: "COMUNICAÇÃO VISUAL", product: "Ecosolvente K 3204S - 4 i3200", estimated_value: 159990 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Rolo a Rolo 2K18UV 180 Branco e Verniz 2 i3200", estimated_value: 144990 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Rolo a Rolo 4K18UV 180 Branco e Verniz 4 i3200", estimated_value: 159990 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Cilindrico K180 3 Ricoh G4", estimated_value: 319000 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Cilindrico K180 3 Ricoh G6", estimated_value: 349000 },
  { title: "COMUNICAÇÃO VISUAL", product: "UV Mesa K6090 3 i1600", estimated_value: 109990 },
  { title: "SUBLIMAÇÃO TEXTIL", product: "Sublimatica K1802TX 2 i3200", estimated_value: 79990 },
  { title: "SUBLIMAÇÃO TEXTIL", product: "Sublimatica K1804TX MAX 4 i3200", estimated_value: 149990 },
  { title: "SUBLIMAÇÃO TEXTIL", product: "Sublimatica K2008TX PRO 8 i3200", estimated_value: 319000 },
  { title: "COMUNICAÇÃO VISUAL", product: "Mesa Plana UV K1810UV 4 Ricoh G6", estimated_value: 349990 },
  { title: "COMUNICAÇÃO VISUAL", product: "Mesa Plana UV K2513UV 4 Ricoh G6", estimated_value: 369990 },
  { title: "COMUNICAÇÃO VISUAL", product: "Mesa Plana UV K2513UV 6 Ricoh G6", estimated_value: 399990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte T-24", estimated_value: 5490 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte T-48 - Motor de Passo", estimated_value: 6990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte T-48 - Motor Servo", estimated_value: 9990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Plotter de Recorte T-59 - Motor Servo", estimated_value: 12990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Auto Cutter Z Pro Max", estimated_value: 16990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Auto Cutter LN05", estimated_value: 25990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Auto Cutter LN06", estimated_value: 34990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Roll Cutter", estimated_value: 39990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Mesa de Corte 7090E", estimated_value: 49990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "Mesa de Corte 7090U", estimated_value: 54990 },
  { title: "ACABAMENTOS GRÁFICOS", product: "MapCut 6040", estimated_value: 149900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "MapCut 8060", estimated_value: 169900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "MapCut 1815", estimated_value: 329900 },
  { title: "ACABAMENTOS GRÁFICOS", product: "MapCut 2513", estimated_value: 429900 },
  { title: "PRODUÇÃO COLOR", product: "Canon imagePRESS V700", estimated_value: 125900 },
  { title: "PRODUÇÃO COLOR", product: "Canon imagePRESS V700 + POD", estimated_value: 149900 },
  { title: "PRODUÇÃO MONO", product: "Canon varioPRINT 120/130/140 nova", estimated_value: 430000 },
  { title: "PRODUÇÃO MONO", product: "Canon varioPRINT 120/130/140 semi-nova", estimated_value: 140000 },
  { title: "PRODUÇÃO MONO", product: "Canon imageRUNNER 6555 semi-nova", estimated_value: 34000 },
  { title: "OFFICE COLOR", product: "Canon imageRUNNER C3926 com pedestal", estimated_value: 26300 }
];

const OPPORTUNITY_PRODUCTS = PRODUCT_CATALOG_ROWS.reduce(
  (acc, row) => {
    if (!acc[row.title]) acc[row.title] = [];
    if (!acc[row.title].includes(row.product)) {
      acc[row.title].push(row.product);
    }
    return acc;
  },
  Object.fromEntries(OPPORTUNITY_TITLES.map((title) => [title, []]))
);

const PRODUCT_PRICE_CATALOG = PRODUCT_CATALOG_ROWS.reduce((acc, row) => {
  if (!acc[row.title]) acc[row.title] = {};
  acc[row.title][row.product] = row.estimated_value;
  return acc;
}, {});

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function normalizeTitlePart(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function composeOpportunityTitle(titleCategory, titleProduct) {
  const category = normalizeTitlePart(titleCategory);
  const product = normalizeTitlePart(titleProduct);
  if (!category) return "";
  if (!product) return category;
  return `${category} > ${product}`;
}

function parseOpportunityTitle(rawTitle) {
  const normalized = normalizeTitlePart(rawTitle);
  if (!normalized) {
    return { title_category: "", title_product: "" };
  }

  const parts = normalized.split(">");
  const category = normalizeTitlePart(parts.shift());
  const product = normalizeTitlePart(parts.join(">"));

  if (OPPORTUNITY_TITLES.includes(category)) {
    return { title_category: category, title_product: product };
  }

  return { title_category: "", title_product: normalized };
}

function resolveEstimatedValueByProduct(titleCategory, titleProduct) {
  const category = normalizeTitlePart(titleCategory);
  const product = normalizeTitlePart(titleProduct);
  if (!category || !product) return null;

  const rawValue = PRODUCT_PRICE_CATALOG?.[category]?.[product];
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) return null;
  return numericValue;
}

function emptyOpportunityForm(defaultCompanyId = "") {
  return {
    company_id: defaultCompanyId,
    title_category: "",
    title_product: "",
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
      const titleProduct = normalizeTitlePart(form.title_product);
      if (!titleCategory) {
        setError("Selecione o título da oportunidade.");
        return;
      }
      if (!titleProduct) {
        setError("Informe o produto da oportunidade.");
        return;
      }

      const payload = {
        company_id: form.company_id,
        title: composeOpportunityTitle(titleCategory, titleProduct),
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
      title_product: parsedTitle.title_product,
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
            onChange={(e) => setForm((prev) => ({ ...prev, title_category: e.target.value, title_product: "", estimated_value: "" }))}
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
            list="pipeline-product-options"
            placeholder="Produto (ex.: CANON imagePRESS V700)"
            value={form.title_product}
            onChange={(e) =>
              setForm((prev) => {
                const nextProduct = e.target.value;
                const mappedEstimatedValue = resolveEstimatedValueByProduct(prev.title_category, nextProduct);
                return {
                  ...prev,
                  title_product: nextProduct,
                  estimated_value: mappedEstimatedValue === null ? "" : String(mappedEstimatedValue)
                };
              })
            }
            disabled={!form.title_category}
          />
          <datalist id="pipeline-product-options">
            {(OPPORTUNITY_PRODUCTS[form.title_category] || []).map((product) => (
              <option key={product} value={product} />
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
