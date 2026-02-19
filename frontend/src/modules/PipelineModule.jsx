import { useEffect, useMemo, useState } from "react";
import {
  createAutomatedProposalFromOpportunity,
  createOpportunity,
  listCompanyOptions,
  listLatestOrdersByOpportunity,
  listOpportunities,
  updateOpportunity,
  updateOpportunityStage
} from "../lib/revenueApi";
import { PIPELINE_STAGES, canMoveToStage, stageLabel, stageStatus } from "../lib/pipelineStages";
import {
  PRODUCTS_BY_SUBCATEGORY,
  SALES_TYPES,
  composeOpportunityTitle,
  getSubcategoriesByType,
  parseOpportunityTitle,
  resolveEstimatedValueByProduct
} from "../lib/productCatalog";

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function emptyOpportunityForm(defaultCompanyId = "") {
  return {
    company_id: defaultCompanyId,
    opportunity_type: "equipment",
    title_subcategory: "",
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
  const [success, setSuccess] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [dragOverStage, setDragOverStage] = useState("");
  const [editingOpportunityId, setEditingOpportunityId] = useState("");
  const [creatingProposalId, setCreatingProposalId] = useState("");
  const [proposalsByOpportunity, setProposalsByOpportunity] = useState({});
  const [autoProposalMode, setAutoProposalMode] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("crm.pipeline.auto-proposal-mode") !== "0";
  });
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
    setSuccess("");
    try {
      const [opps, companiesData] = await Promise.all([listOpportunities(), listCompanyOptions()]);
      setItems(opps);
      setCompanies(companiesData);
      const linkedOrders = await listLatestOrdersByOpportunity(opps.map((opportunity) => opportunity.id));
      const nextProposalMap = linkedOrders.reduce((acc, order) => {
        if (!order?.source_opportunity_id) return acc;
        acc[order.source_opportunity_id] = order;
        return acc;
      }, {});
      setProposalsByOpportunity(nextProposalMap);
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
    setSuccess("");

    try {
      const opportunityType = String(form.opportunity_type || "").trim();
      const titleSubcategory = String(form.title_subcategory || "").trim();
      const titleProduct = String(form.title_product || "").trim();
      if (!opportunityType) {
        setError("Selecione o tipo.");
        return;
      }
      if (!titleSubcategory) {
        setError("Selecione a sub-categoria.");
        return;
      }
      if (!titleProduct) {
        setError("Informe o produto.");
        return;
      }

      const payload = {
        company_id: form.company_id,
        title: composeOpportunityTitle(titleSubcategory, titleProduct),
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
    setSuccess("");

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
    setSuccess("");
    const parsedTitle = parseOpportunityTitle(item.title);
    setEditingOpportunityId(item.id);
    setForm({
      company_id: item.company_id || "",
      opportunity_type: parsedTitle.opportunity_type || "equipment",
      title_subcategory: parsedTitle.title_subcategory,
      title_product: parsedTitle.title_product,
      stage: item.stage || "lead",
      estimated_value: String(item.estimated_value ?? ""),
      expected_close_date: item.expected_close_date || ""
    });
  }

  function cancelEditOpportunity() {
    setError("");
    setSuccess("");
    setEditingOpportunityId("");
    setForm(emptyOpportunityForm(companies[0]?.id || ""));
  }

  function handleToggleAutoProposalMode(event) {
    const nextValue = Boolean(event.target.checked);
    setAutoProposalMode(nextValue);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("crm.pipeline.auto-proposal-mode", nextValue ? "1" : "0");
    }
  }

  async function handleCreateAutomatedProposal(event, item) {
    event.stopPropagation();
    if (!item?.id) return;

    setError("");
    setSuccess("");
    setCreatingProposalId(item.id);

    try {
      const result = await createAutomatedProposalFromOpportunity(item);
      setProposalsByOpportunity((prev) => ({ ...prev, [item.id]: result }));
      if (result.already_exists) {
        setSuccess(`Essa oportunidade já possui proposta vinculada (${result.order_number}).`);
      } else {
        setSuccess(`Proposta criada automaticamente (${result.order_number}).`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingProposalId("");
    }
  }

  return (
    <section className="module">
      <article className="panel">
        <h2>Pipeline Comercial</h2>
        <p className="muted">Arraste os cards para evoluir a oportunidade para a próxima etapa.</p>
        <div className="pipeline-automation-toggle">
          <label className="checkbox-inline">
            <input type="checkbox" checked={autoProposalMode} onChange={handleToggleAutoProposalMode} />
            Modo automático de proposta
          </label>
          <p className="pipeline-automation-help">
            Com este modo ativo, cada card permite gerar uma proposta automaticamente no módulo Pedidos.
          </p>
        </div>
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
            value={form.opportunity_type}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                opportunity_type: e.target.value,
                title_subcategory: "",
                title_product: "",
                estimated_value: ""
              }))
            }
          >
            <option value="">Selecione o tipo</option>
            {SALES_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <input
            required
            list="pipeline-subcategory-options"
            placeholder="Sub-categoria"
            value={form.title_subcategory}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                title_subcategory: e.target.value,
                title_product: "",
                estimated_value: ""
              }))
            }
          />
          <datalist id="pipeline-subcategory-options">
            {getSubcategoriesByType(form.opportunity_type).map((subcategory) => (
              <option key={subcategory} value={subcategory} />
            ))}
          </datalist>
          <input
            required
            list="pipeline-product-options"
            placeholder="Produto (ex.: CANON imagePRESS V700)"
            value={form.title_product}
            onChange={(e) =>
              setForm((prev) => {
                const nextProduct = e.target.value;
                const mappedEstimatedValue = resolveEstimatedValueByProduct(prev.title_subcategory, nextProduct);
                return {
                  ...prev,
                  title_product: nextProduct,
                  estimated_value: mappedEstimatedValue === null ? "" : String(mappedEstimatedValue)
                };
              })
            }
            disabled={!form.title_subcategory}
          />
          <datalist id="pipeline-product-options">
            {(PRODUCTS_BY_SUBCATEGORY[form.title_subcategory] || []).map((product) => (
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
        {success ? <p className="success-text">{success}</p> : null}
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
                {(itemsByStage[stage.value] || []).map((item) => {
                  const linkedProposal = proposalsByOpportunity[item.id];
                  return (
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
                      {linkedProposal ? (
                        <p className="pipeline-card-proposal">
                          Proposta: {linkedProposal.order_number} ({brl(linkedProposal.total_amount)})
                        </p>
                      ) : null}
                      <div className="pipeline-card-actions">
                        {autoProposalMode ? (
                          <button
                            type="button"
                            className="btn-ghost btn-table-action"
                            disabled={Boolean(linkedProposal) || creatingProposalId === item.id}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => handleCreateAutomatedProposal(event, item)}
                          >
                            {linkedProposal
                              ? "Proposta criada"
                              : creatingProposalId === item.id
                                ? "Gerando..."
                                : "Gerar proposta"}
                          </button>
                        ) : null}
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
                  );
                })}

                {!itemsByStage[stage.value]?.length ? <p className="pipeline-empty">Sem oportunidades</p> : null}
              </div>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}
