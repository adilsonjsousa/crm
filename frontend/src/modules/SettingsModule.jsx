import { useEffect, useMemo, useState } from "react";
import {
  createCompanyLifecycleStage,
  deleteCompanyLifecycleStage,
  listCompanyLifecycleStages,
  saveCompanyLifecycleStageOrder,
  updateCompanyLifecycleStage
} from "../lib/revenueApi";

const EMPTY_STAGE_FORM = {
  name: "",
  is_active: true
};

export default function SettingsModule() {
  const [stages, setStages] = useState([]);
  const [nameDraftById, setNameDraftById] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(EMPTY_STAGE_FORM);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingStageId, setSavingStageId] = useState("");
  const [deletingStageId, setDeletingStageId] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);

  const activeCount = useMemo(() => stages.filter((item) => item.is_active).length, [stages]);

  async function loadStages() {
    setLoading(true);
    setError("");

    try {
      const rows = await listCompanyLifecycleStages({ includeInactive: true });
      setStages(rows);
      setNameDraftById((previous) => {
        const next = {};
        for (const row of rows) {
          next[row.id] = previous[row.id] ?? row.name;
        }
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStages();
  }, []);

  async function handleCreateStage(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSavingCreate(true);

    try {
      await createCompanyLifecycleStage({
        name: form.name,
        is_active: form.is_active
      });
      setForm(EMPTY_STAGE_FORM);
      await loadStages();
      setSuccess("Fase criada no ciclo de vida.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCreate(false);
    }
  }

  async function handleSaveStageName(stage) {
    const nextName = String(nameDraftById[stage.id] || "").trim();
    if (!nextName) {
      setError("Informe o nome da fase.");
      return;
    }

    if (nextName === stage.name) return;

    setError("");
    setSuccess("");
    setSavingStageId(stage.id);

    try {
      await updateCompanyLifecycleStage(stage.id, { name: nextName });
      await loadStages();
      setSuccess("Nome da fase atualizado.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingStageId("");
    }
  }

  async function handleToggleStage(stage) {
    if (stage.is_active && activeCount <= 1) {
      setError("Mantenha ao menos uma fase ativa no ciclo de vida.");
      return;
    }

    setError("");
    setSuccess("");
    setSavingStageId(stage.id);

    try {
      await updateCompanyLifecycleStage(stage.id, { is_active: !stage.is_active });
      await loadStages();
      setSuccess(stage.is_active ? "Fase desativada." : "Fase ativada.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingStageId("");
    }
  }

  async function handleMoveStage(stageId, direction) {
    const index = stages.findIndex((item) => item.id === stageId);
    if (index < 0) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stages.length) return;

    const reordered = [...stages];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    setError("");
    setSuccess("");
    setSavingOrder(true);
    setStages(reordered);

    try {
      await saveCompanyLifecycleStageOrder(reordered.map((item) => item.id));
      await loadStages();
      setSuccess("Ordem do ciclo de vida atualizada.");
    } catch (err) {
      setError(err.message);
      await loadStages();
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleDeleteStage(stage) {
    if (!stage) return;
    if (stage.linked_companies_count > 0) {
      setError("Não é possível excluir fase com empresas vinculadas.");
      return;
    }
    if (stages.length <= 1) {
      setError("O ciclo de vida precisa ter ao menos uma fase.");
      return;
    }

    const confirmed = window.confirm(`Excluir a fase "${stage.name}" do ciclo de vida?`);
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingStageId(stage.id);

    try {
      await deleteCompanyLifecycleStage(stage.id);
      await loadStages();
      setSuccess("Fase excluída.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingStageId("");
    }
  }

  return (
    <section className="module">
      <div className="two-col">
        <article className="panel">
          <h2>Ciclo de vida de empresas</h2>
          <p className="muted">
            Cadastre as fases que representam a evolução da conta no CRM (ex.: Lead &gt; Oportunidade &gt; Cliente).
          </p>

          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p className="success-text">{success}</p> : null}

          <form className="form-grid top-gap" onSubmit={handleCreateStage}>
            <input
              required
              placeholder="Nome da fase (ex.: Lead)"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              Fase ativa
            </label>
            <button type="submit" className="btn-primary" disabled={savingCreate}>
              {savingCreate ? "Salvando..." : "Adicionar fase"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Ordem das fases</h2>
          <p className="muted">Use os botões de subir/descer para reorganizar o fluxo.</p>
          {loading ? <p className="muted">Carregando fases...</p> : null}

          <div className="table-wrap top-gap">
            <table>
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Fase</th>
                  <th>Status</th>
                  <th>Empresas</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage, index) => (
                  <tr key={stage.id}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        className="settings-stage-input"
                        value={nameDraftById[stage.id] ?? stage.name}
                        onChange={(event) =>
                          setNameDraftById((prev) => ({
                            ...prev,
                            [stage.id]: event.target.value
                          }))
                        }
                      />
                    </td>
                    <td>{stage.is_active ? "Ativa" : "Inativa"}</td>
                    <td>{stage.linked_companies_count || 0}</td>
                    <td>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleSaveStageName(stage)}
                          disabled={savingStageId === stage.id || savingOrder}
                        >
                          Salvar nome
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleToggleStage(stage)}
                          disabled={savingStageId === stage.id || savingOrder || (stage.is_active && activeCount <= 1)}
                        >
                          {stage.is_active ? "Desativar" : "Ativar"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleMoveStage(stage.id, "up")}
                          disabled={savingOrder || index === 0}
                        >
                          Subir
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleMoveStage(stage.id, "down")}
                          disabled={savingOrder || index === stages.length - 1}
                        >
                          Descer
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-table-action"
                          onClick={() => handleDeleteStage(stage)}
                          disabled={deletingStageId === stage.id || stage.linked_companies_count > 0 || stages.length <= 1}
                        >
                          {deletingStageId === stage.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!stages.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      Nenhuma fase cadastrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
