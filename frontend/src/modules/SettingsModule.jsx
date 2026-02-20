import { useEffect, useMemo, useState } from "react";
import {
  createCompanyLifecycleStage,
  deleteCompanyLifecycleStage,
  listCompanyLifecycleStages,
  listOmieCustomerSyncJobs,
  saveCompanyLifecycleStageOrder,
  syncOmieCustomers,
  updateCompanyLifecycleStage
} from "../lib/revenueApi";

const OMIE_STORAGE_KEY = "crm.settings.omie.customers.v1";
const DEFAULT_OMIE_URL = "https://app.omie.com.br/api/v1/geral/clientes/";

const EMPTY_STAGE_FORM = {
  name: "",
  is_active: true
};

const EMPTY_OMIE_FORM = {
  app_key: "",
  app_secret: "",
  records_per_page: "100",
  max_pages: "20",
  omie_api_url: DEFAULT_OMIE_URL,
  dry_run: false
};

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function syncStatusLabel(status) {
  const map = {
    pending: "Pendente",
    running: "Em execução",
    success: "Concluído",
    error: "Erro"
  };
  return map[status] || String(status || "-");
}

function readOmieFormStorage() {
  if (typeof window === "undefined") return EMPTY_OMIE_FORM;

  try {
    const raw = window.localStorage.getItem(OMIE_STORAGE_KEY);
    if (!raw) return EMPTY_OMIE_FORM;
    const parsed = asObject(JSON.parse(raw));
    return {
      app_key: String(parsed.app_key || ""),
      app_secret: String(parsed.app_secret || ""),
      records_per_page: String(parsed.records_per_page || EMPTY_OMIE_FORM.records_per_page),
      max_pages: String(parsed.max_pages || EMPTY_OMIE_FORM.max_pages),
      omie_api_url: String(parsed.omie_api_url || EMPTY_OMIE_FORM.omie_api_url),
      dry_run: Boolean(parsed.dry_run)
    };
  } catch {
    return EMPTY_OMIE_FORM;
  }
}

export default function SettingsModule() {
  const [stages, setStages] = useState([]);
  const [nameDraftById, setNameDraftById] = useState({});
  const [loading, setLoading] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleSuccess, setLifecycleSuccess] = useState("");
  const [form, setForm] = useState(EMPTY_STAGE_FORM);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingStageId, setSavingStageId] = useState("");
  const [deletingStageId, setDeletingStageId] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);

  const [omieForm, setOmieForm] = useState(() => readOmieFormStorage());
  const [omieError, setOmieError] = useState("");
  const [omieSuccess, setOmieSuccess] = useState("");
  const [omieSyncing, setOmieSyncing] = useState(false);
  const [omieHistory, setOmieHistory] = useState([]);
  const [omieHistoryLoading, setOmieHistoryLoading] = useState(false);
  const [omieResult, setOmieResult] = useState(null);

  const activeCount = useMemo(() => stages.filter((item) => item.is_active).length, [stages]);
  const omieResultSummary = useMemo(() => asObject(omieResult), [omieResult]);

  async function loadStages() {
    setLoading(true);
    setLifecycleError("");

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
      setLifecycleError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOmieHistory() {
    setOmieHistoryLoading(true);
    try {
      const rows = await listOmieCustomerSyncJobs(12);
      setOmieHistory(rows);
    } catch (err) {
      setOmieError(err.message);
    } finally {
      setOmieHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadStages();
    loadOmieHistory();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OMIE_STORAGE_KEY, JSON.stringify(omieForm));
  }, [omieForm]);

  async function handleCreateStage(event) {
    event.preventDefault();
    setLifecycleError("");
    setLifecycleSuccess("");
    setSavingCreate(true);

    try {
      await createCompanyLifecycleStage({
        name: form.name,
        is_active: form.is_active
      });
      setForm(EMPTY_STAGE_FORM);
      await loadStages();
      setLifecycleSuccess("Fase criada no ciclo de vida.");
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setSavingCreate(false);
    }
  }

  async function handleSaveStageName(stage) {
    const nextName = String(nameDraftById[stage.id] || "").trim();
    if (!nextName) {
      setLifecycleError("Informe o nome da fase.");
      return;
    }

    if (nextName === stage.name) return;

    setLifecycleError("");
    setLifecycleSuccess("");
    setSavingStageId(stage.id);

    try {
      await updateCompanyLifecycleStage(stage.id, { name: nextName });
      await loadStages();
      setLifecycleSuccess("Nome da fase atualizado.");
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setSavingStageId("");
    }
  }

  async function handleToggleStage(stage) {
    if (stage.is_active && activeCount <= 1) {
      setLifecycleError("Mantenha ao menos uma fase ativa no ciclo de vida.");
      return;
    }

    setLifecycleError("");
    setLifecycleSuccess("");
    setSavingStageId(stage.id);

    try {
      await updateCompanyLifecycleStage(stage.id, { is_active: !stage.is_active });
      await loadStages();
      setLifecycleSuccess(stage.is_active ? "Fase desativada." : "Fase ativada.");
    } catch (err) {
      setLifecycleError(err.message);
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

    setLifecycleError("");
    setLifecycleSuccess("");
    setSavingOrder(true);
    setStages(reordered);

    try {
      await saveCompanyLifecycleStageOrder(reordered.map((item) => item.id));
      await loadStages();
      setLifecycleSuccess("Ordem do ciclo de vida atualizada.");
    } catch (err) {
      setLifecycleError(err.message);
      await loadStages();
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleDeleteStage(stage) {
    if (!stage) return;
    if (stage.linked_companies_count > 0) {
      setLifecycleError("Não é possível excluir fase com empresas vinculadas.");
      return;
    }
    if (stages.length <= 1) {
      setLifecycleError("O ciclo de vida precisa ter ao menos uma fase.");
      return;
    }

    const confirmed = window.confirm(`Excluir a fase "${stage.name}" do ciclo de vida?`);
    if (!confirmed) return;

    setLifecycleError("");
    setLifecycleSuccess("");
    setDeletingStageId(stage.id);

    try {
      await deleteCompanyLifecycleStage(stage.id);
      await loadStages();
      setLifecycleSuccess("Fase excluída.");
    } catch (err) {
      setLifecycleError(err.message);
    } finally {
      setDeletingStageId("");
    }
  }

  async function handleOmieSync(event) {
    event.preventDefault();
    setOmieError("");
    setOmieSuccess("");

    const appKey = String(omieForm.app_key || "").trim();
    const appSecret = String(omieForm.app_secret || "").trim();
    if (!appKey || !appSecret) {
      setOmieError("Informe App Key e App Secret do OMIE.");
      return;
    }

    const payload = {
      app_key: appKey,
      app_secret: appSecret,
      records_per_page: clampInteger(omieForm.records_per_page, 1, 500, 100),
      max_pages: clampInteger(omieForm.max_pages, 1, 200, 20),
      dry_run: Boolean(omieForm.dry_run),
      omie_api_url: String(omieForm.omie_api_url || "").trim() || DEFAULT_OMIE_URL
    };

    setOmieSyncing(true);
    try {
      const result = await syncOmieCustomers(payload);
      setOmieResult(result);
      const processedCount = Number(result?.processed || 0);
      setOmieSuccess(`Sincronização concluída. ${processedCount} registro(s) processado(s).`);
      await loadOmieHistory();
    } catch (err) {
      setOmieError(err.message);
    } finally {
      setOmieSyncing(false);
    }
  }

  function clearOmieCredentials() {
    setOmieForm((prev) => ({
      ...prev,
      app_key: "",
      app_secret: ""
    }));
  }

  return (
    <section className="module">
      <div className="two-col">
        <article className="panel">
          <h2>Ciclo de vida de empresas</h2>
          <p className="muted">
            Cadastre as fases que representam a evolução da conta no CRM (ex.: Lead &gt; Oportunidade &gt; Cliente).
          </p>

          {lifecycleError ? <p className="error-text">{lifecycleError}</p> : null}
          {lifecycleSuccess ? <p className="success-text">{lifecycleSuccess}</p> : null}

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

      <article className="panel top-gap">
        <h2>Integração OMIE - Cadastro de clientes</h2>
        <p className="muted">
          Sincronize empresas do OMIE para o CRM usando App Key e App Secret. As credenciais ficam salvas apenas neste navegador.
        </p>
        {omieError ? <p className="error-text">{omieError}</p> : null}
        {omieSuccess ? <p className="success-text">{omieSuccess}</p> : null}

        <form className="form-grid top-gap" onSubmit={handleOmieSync}>
          <div className="settings-omie-grid">
            <label className="settings-field">
              <span>App Key</span>
              <input
                required
                value={omieForm.app_key}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, app_key: event.target.value }))}
                placeholder="Sua App Key OMIE"
              />
            </label>

            <label className="settings-field">
              <span>App Secret</span>
              <input
                required
                type="password"
                value={omieForm.app_secret}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, app_secret: event.target.value }))}
                placeholder="Seu App Secret OMIE"
              />
            </label>

            <label className="settings-field">
              <span>Registros por página (1-500)</span>
              <input
                type="number"
                min={1}
                max={500}
                value={omieForm.records_per_page}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, records_per_page: event.target.value }))}
              />
            </label>

            <label className="settings-field">
              <span>Máximo de páginas por execução (1-200)</span>
              <input
                type="number"
                min={1}
                max={200}
                value={omieForm.max_pages}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, max_pages: event.target.value }))}
              />
            </label>

            <label className="settings-field settings-field-wide">
              <span>URL da API de clientes OMIE</span>
              <input
                value={omieForm.omie_api_url}
                onChange={(event) => setOmieForm((prev) => ({ ...prev, omie_api_url: event.target.value }))}
                placeholder={DEFAULT_OMIE_URL}
              />
            </label>
          </div>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={Boolean(omieForm.dry_run)}
              onChange={(event) => setOmieForm((prev) => ({ ...prev, dry_run: event.target.checked }))}
            />
            Modo teste (não grava dados, apenas valida e contabiliza)
          </label>

          <div className="inline-actions">
            <button type="submit" className="btn-primary" disabled={omieSyncing}>
              {omieSyncing ? "Sincronizando..." : "Sincronizar clientes OMIE"}
            </button>
            <button type="button" className="btn-ghost" onClick={loadOmieHistory} disabled={omieHistoryLoading || omieSyncing}>
              {omieHistoryLoading ? "Atualizando histórico..." : "Atualizar histórico"}
            </button>
            <button type="button" className="btn-ghost" onClick={clearOmieCredentials} disabled={omieSyncing}>
              Limpar credenciais
            </button>
          </div>
        </form>

        {omieResult ? (
          <div className="kpi-grid top-gap">
            <article className="kpi-card">
              <span className="kpi-label">Processados</span>
              <strong className="kpi-value">{Number(omieResultSummary.processed || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Empresas criadas</span>
              <strong className="kpi-value">{Number(omieResultSummary.companies_created || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Empresas atualizadas</span>
              <strong className="kpi-value">{Number(omieResultSummary.companies_updated || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Registros ignorados</span>
              <strong className="kpi-value">
                {Number(omieResultSummary.skipped_without_identifier || 0) + Number(omieResultSummary.skipped_without_cnpj || 0)}
              </strong>
            </article>
          </div>
        ) : null}

        <h3 className="top-gap">Histórico de sincronizações</h3>
        <div className="table-wrap top-gap">
          <table>
            <thead>
              <tr>
                <th>Início</th>
                <th>Fim</th>
                <th>Status</th>
                <th>Processados</th>
                <th>Criadas / Atualizadas</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {omieHistory.map((job) => {
                const result = asObject(job.result);
                const processed = Number(result.processed || 0);
                const created = Number(result.companies_created || 0);
                const updated = Number(result.companies_updated || 0);
                const errorMessage = String(job.error_message || "").trim();

                return (
                  <tr key={job.id}>
                    <td>{formatDateTime(job.started_at || job.created_at)}</td>
                    <td>{formatDateTime(job.finished_at)}</td>
                    <td>{syncStatusLabel(job.status)}</td>
                    <td>{processed}</td>
                    <td>
                      {created} / {updated}
                    </td>
                    <td>{errorMessage || (job.status === "success" ? "Concluído sem erro." : "-")}</td>
                  </tr>
                );
              })}
              {!omieHistory.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Nenhuma sincronização OMIE registrada ainda.
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
