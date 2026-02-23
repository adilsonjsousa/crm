import { useEffect, useMemo, useState } from "react";
import {
  createCompanyLifecycleStage,
  createSystemUser,
  deleteCompanyLifecycleStage,
  listCompanyLifecycleStages,
  listOmieCustomerSyncJobs,
  listRdStationSyncJobs,
  listSystemUsers,
  saveCompanyLifecycleStageOrder,
  sendSystemUserPasswordReset,
  syncRdStationCrm,
  syncOmieCustomers,
  updateCompanyLifecycleStage,
  updateSystemUser
} from "../lib/revenueApi";

const OMIE_STORAGE_KEY = "crm.settings.omie.customers.v1";
const RDSTATION_STORAGE_KEY = "crm.settings.rdstation.crm.v1";
const DEFAULT_OMIE_URL = "https://app.omie.com.br/api/v1/geral/clientes/";
const DEFAULT_RDSTATION_URL = "https://api.rd.services/crm/v2";
const OMIE_SYNC_PAGE_CHUNK_DRY_RUN = 3;
const OMIE_SYNC_PAGE_CHUNK_LIVE = 1;
const OMIE_SYNC_LIVE_MAX_RECORDS_PER_PAGE = 20;
const OMIE_SYNC_MAX_ROUNDS = 80;
const RD_SYNC_PAGE_CHUNK_DRY_RUN = 5;
const RD_SYNC_PAGE_CHUNK_LIVE = 1;
const RD_SYNC_LIVE_MAX_RECORDS_PER_PAGE = 100;
const RD_SYNC_MAX_ROUNDS = 80;

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

const EMPTY_RD_FORM = {
  access_token: "",
  api_url: DEFAULT_RDSTATION_URL,
  records_per_page: "100",
  max_pages: "50",
  dry_run: false
};

const USER_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Gestor" },
  { value: "sales", label: "Vendedor" },
  { value: "backoffice", label: "Backoffice" }
];

const USER_STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" }
];

const EMPTY_USER_FORM = {
  full_name: "",
  email: "",
  whatsapp: "",
  role: "sales",
  status: "active"
};

const EMPTY_EDIT_USER_FORM = {
  full_name: "",
  email: "",
  whatsapp: "",
  role: "sales",
  status: "active"
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

function sanitizeRdAccessToken(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/^bearer\s+/i, "")
    .trim();
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

function userRoleLabel(role) {
  const found = USER_ROLE_OPTIONS.find((item) => item.value === role);
  return found?.label || String(role || "-");
}

function userStatusLabel(status) {
  const found = USER_STATUS_OPTIONS.find((item) => item.value === status);
  return found?.label || String(status || "-");
}

function userDeliveryMessage(delivery) {
  const map = {
    invite_email_sent: "Convite enviado para o e-mail do usuário.",
    reset_email_sent: "E-mail de redefinição de senha enviado ao usuário.",
    existing_user: "Usuário já existia no Auth e foi vinculado no CRM.",
    link_generated: "Link de acesso/redefinição gerado. Copie e envie ao usuário."
  };
  return map[delivery] || "Operação concluída para o usuário.";
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

function readRdFormStorage() {
  if (typeof window === "undefined") return EMPTY_RD_FORM;

  try {
    const raw = window.localStorage.getItem(RDSTATION_STORAGE_KEY);
    if (!raw) return EMPTY_RD_FORM;
    const parsed = asObject(JSON.parse(raw));
    return {
      access_token: String(parsed.access_token || ""),
      api_url: String(parsed.api_url || EMPTY_RD_FORM.api_url),
      records_per_page: String(parsed.records_per_page || EMPTY_RD_FORM.records_per_page),
      max_pages: String(parsed.max_pages || EMPTY_RD_FORM.max_pages),
      dry_run: Boolean(parsed.dry_run)
    };
  } catch {
    return EMPTY_RD_FORM;
  }
}

export default function SettingsModule() {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [usersSuccess, setUsersSuccess] = useState("");
  const [usersActionLink, setUsersActionLink] = useState("");
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState("");
  const [editUserForm, setEditUserForm] = useState(EMPTY_EDIT_USER_FORM);
  const [savingUserId, setSavingUserId] = useState("");
  const [resettingUserId, setResettingUserId] = useState("");

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

  const [rdForm, setRdForm] = useState(() => readRdFormStorage());
  const [rdError, setRdError] = useState("");
  const [rdSuccess, setRdSuccess] = useState("");
  const [rdSyncing, setRdSyncing] = useState(false);
  const [rdHistory, setRdHistory] = useState([]);
  const [rdHistoryLoading, setRdHistoryLoading] = useState(false);
  const [rdResult, setRdResult] = useState(null);
  const [rdResumeCursor, setRdResumeCursor] = useState(null);

  const activeCount = useMemo(() => stages.filter((item) => item.is_active).length, [stages]);
  const omieResultSummary = useMemo(() => asObject(omieResult), [omieResult]);
  const rdResultSummary = useMemo(() => asObject(rdResult), [rdResult]);
  const activeUsersCount = useMemo(() => users.filter((item) => item.status === "active").length, [users]);

  async function loadUsers() {
    setUsersLoading(true);
    setUsersError("");
    try {
      const rows = await listSystemUsers();
      setUsers(rows);
    } catch (err) {
      setUsersError(err.message);
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

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

  async function loadRdHistory() {
    setRdHistoryLoading(true);
    try {
      const rows = await listRdStationSyncJobs(12);
      setRdHistory(rows);
    } catch (err) {
      setRdError(err.message);
    } finally {
      setRdHistoryLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadStages();
    loadOmieHistory();
    loadRdHistory();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OMIE_STORAGE_KEY, JSON.stringify(omieForm));
  }, [omieForm]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RDSTATION_STORAGE_KEY, JSON.stringify(rdForm));
  }, [rdForm]);

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

  async function handleCreateUser(event) {
    event.preventDefault();
    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setCreatingUser(true);

    try {
      const result = await createSystemUser(userForm);
      setUserForm(EMPTY_USER_FORM);
      setUsersSuccess(userDeliveryMessage(result.delivery));
      if (result.action_link) setUsersActionLink(result.action_link);
      await loadUsers();
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setCreatingUser(false);
    }
  }

  function startEditUser(user) {
    const userId = String(user?.user_id || "").trim();
    if (!userId) return;

    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setEditingUserId(userId);
    setEditUserForm({
      full_name: String(user.full_name || ""),
      email: String(user.email || ""),
      whatsapp: String(user.whatsapp || ""),
      role: String(user.role || "sales"),
      status: String(user.status || "active")
    });
  }

  function cancelEditUser() {
    setEditingUserId("");
    setEditUserForm(EMPTY_EDIT_USER_FORM);
  }

  async function handleSaveUser(event) {
    event.preventDefault();
    if (!editingUserId) return;

    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setSavingUserId(editingUserId);

    try {
      await updateSystemUser(editingUserId, editUserForm);
      setUsersSuccess("Usuário atualizado com sucesso.");
      cancelEditUser();
      await loadUsers();
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setSavingUserId("");
    }
  }

  async function handleToggleUserStatus(user) {
    const userId = String(user?.user_id || "").trim();
    if (!userId) return;
    const nextStatus = user.status === "active" ? "inactive" : "active";

    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setSavingUserId(userId);

    try {
      await updateSystemUser(userId, {
        full_name: user.full_name,
        whatsapp: user.whatsapp || "",
        role: user.role,
        status: nextStatus,
        permissions: user.permissions
      });
      setUsersSuccess(nextStatus === "active" ? "Usuário ativado." : "Usuário desativado.");
      if (editingUserId === userId) {
        setEditUserForm((prev) => ({
          ...prev,
          status: nextStatus
        }));
      }
      await loadUsers();
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setSavingUserId("");
    }
  }

  async function handleResetUserPassword(user) {
    const userId = String(user?.user_id || "").trim();
    if (!userId) return;

    const confirmed = window.confirm(`Enviar redefinição de senha para ${user.email || "este usuário"}?`);
    if (!confirmed) return;

    setUsersError("");
    setUsersSuccess("");
    setUsersActionLink("");
    setResettingUserId(userId);

    try {
      const result = await sendSystemUserPasswordReset({
        user_id: userId
      });
      setUsersSuccess(userDeliveryMessage(result.delivery));
      if (result.action_link) setUsersActionLink(result.action_link);
      await loadUsers();
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setResettingUserId("");
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
    setOmieResult(null);

    const appKey = String(omieForm.app_key || "").trim();
    const appSecret = String(omieForm.app_secret || "").trim();
    if (!appKey || !appSecret) {
      setOmieError("Informe App Key e App Secret do OMIE.");
      return;
    }

    const dryRun = Boolean(omieForm.dry_run);
    const requestedRecordsPerPage = clampInteger(omieForm.records_per_page, 1, 500, 100);
    const safeRecordsPerPage = dryRun
      ? requestedRecordsPerPage
      : Math.min(requestedRecordsPerPage, OMIE_SYNC_LIVE_MAX_RECORDS_PER_PAGE);

    const pageWindowSize = clampInteger(omieForm.max_pages, 1, 200, 20);

    const payload = {
      app_key: appKey,
      app_secret: appSecret,
      records_per_page: safeRecordsPerPage,
      max_pages: pageWindowSize,
      page_chunk_size: dryRun ? OMIE_SYNC_PAGE_CHUNK_DRY_RUN : OMIE_SYNC_PAGE_CHUNK_LIVE,
      dry_run: dryRun,
      omie_api_url: String(omieForm.omie_api_url || "").trim() || DEFAULT_OMIE_URL
    };

    setOmieSyncing(true);
    try {
      const aggregate = {
        pages_processed: 0,
        records_received: 0,
        processed: 0,
        companies_created: 0,
        companies_updated: 0,
        links_updated: 0,
        skipped_without_identifier: 0,
        skipped_without_cnpj: 0,
        skipped_invalid_payload: 0,
        errors: [],
        rounds: 0,
        has_more: false,
        next_page: null,
        max_pages: payload.max_pages,
        records_per_page: payload.records_per_page,
        dry_run: payload.dry_run
      };

      let nextPage = 1;
      let hasMore = true;

      while (hasMore && aggregate.rounds < OMIE_SYNC_MAX_ROUNDS) {
        aggregate.rounds += 1;
        setOmieSuccess(`Sincronizando lote ${aggregate.rounds} (página ${nextPage})...`);

        let result = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            const effectiveMaxPages = Math.min(200, Math.max(nextPage, nextPage + pageWindowSize - 1));
            result = await syncOmieCustomers({
              ...payload,
              start_page: nextPage,
              max_pages: effectiveMaxPages
            });
            break;
          } catch (error) {
            const message = String(error?.message || "").toLowerCase();
            const transientFailure =
              message.includes("failed to send a request") || message.includes("non-2xx");

            if (attempt < 2 && transientFailure) {
              setOmieSuccess(`Reenviando lote ${aggregate.rounds} (tentativa ${attempt + 1}/2)...`);
              await new Promise((resolve) => setTimeout(resolve, 1200));
              continue;
            }
            throw error;
          }
        }

        const safeResult = asObject(result);
        aggregate.pages_processed += Number(safeResult.pages_processed || 0);
        aggregate.records_received += Number(safeResult.records_received || 0);
        aggregate.processed += Number(safeResult.processed || 0);
        aggregate.companies_created += Number(safeResult.companies_created || 0);
        aggregate.companies_updated += Number(safeResult.companies_updated || 0);
        aggregate.links_updated += Number(safeResult.links_updated || 0);
        aggregate.skipped_without_identifier += Number(safeResult.skipped_without_identifier || 0);
        aggregate.skipped_without_cnpj += Number(safeResult.skipped_without_cnpj || 0);
        aggregate.skipped_invalid_payload += Number(safeResult.skipped_invalid_payload || 0);

        const resultErrors = Array.isArray(safeResult.errors)
          ? safeResult.errors.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        if (resultErrors.length) {
          aggregate.errors = [...aggregate.errors, ...resultErrors].slice(0, 20);
        }

        hasMore = Boolean(safeResult.has_more);
        const candidateNextPage = Number(safeResult.next_page || 0);
        if (hasMore && Number.isFinite(candidateNextPage) && candidateNextPage > nextPage) {
          nextPage = candidateNextPage;
        } else if (hasMore) {
          hasMore = false;
          aggregate.errors = [...aggregate.errors, "Continuação de páginas OMIE inválida. Tente executar novamente."].slice(0, 20);
        }
      }

      aggregate.has_more = hasMore;
      aggregate.next_page = hasMore ? nextPage : null;

      setOmieResult(aggregate);
      if (hasMore) {
        setOmieError(
          `A sincronização foi interrompida para segurança após ${aggregate.rounds} lotes. Clique novamente para continuar da página ${nextPage}.`
        );
      } else {
        setOmieSuccess(
          `Sincronização concluída em ${aggregate.rounds} lote(s). ${aggregate.processed} registro(s) processado(s).`
        );
      }
      await loadOmieHistory();
    } catch (err) {
      setOmieError(err.message);
    } finally {
      setOmieSyncing(false);
    }
  }

  async function handleRdSync(event) {
    event.preventDefault();
    setRdError("");
    setRdSuccess("");
    setRdResult(null);

    const accessToken = sanitizeRdAccessToken(rdForm.access_token);
    if (!accessToken) {
      setRdError("Informe o Access Token do RD Station CRM.");
      return;
    }

    const dryRun = Boolean(rdForm.dry_run);
    const requestedRecordsPerPage = clampInteger(rdForm.records_per_page, 1, 500, 100);
    const safeRecordsPerPage = dryRun
      ? requestedRecordsPerPage
      : Math.min(requestedRecordsPerPage, RD_SYNC_LIVE_MAX_RECORDS_PER_PAGE);
    const maxPages = clampInteger(rdForm.max_pages, 1, 500, 50);
    const payload = {
      access_token: accessToken,
      api_url: String(rdForm.api_url || "").trim() || DEFAULT_RDSTATION_URL,
      records_per_page: safeRecordsPerPage,
      max_pages: maxPages,
      page_chunk_size: dryRun ? RD_SYNC_PAGE_CHUNK_DRY_RUN : RD_SYNC_PAGE_CHUNK_LIVE,
      dry_run: dryRun
    };

    setRdSyncing(true);
    try {
      const aggregate = {
        pages_processed: 0,
        records_received: 0,
        processed: 0,
        companies_processed: 0,
        contacts_processed: 0,
        opportunities_processed: 0,
        companies_created: 0,
        companies_updated: 0,
        contacts_created: 0,
        contacts_updated: 0,
        opportunities_created: 0,
        opportunities_updated: 0,
        links_updated: 0,
        skipped_without_identifier: 0,
        skipped_invalid_payload: 0,
        errors: [],
        rounds: 0,
        has_more: false,
        next_cursor: null,
        max_pages: payload.max_pages,
        records_per_page: payload.records_per_page,
        dry_run: payload.dry_run
      };

      let hasMore = true;
      const previousResult = asObject(rdResult);
      const previousWasDryRun = Boolean(previousResult.dry_run);
      let cursor =
        !dryRun && !previousWasDryRun && rdResumeCursor && typeof rdResumeCursor === "object" ? rdResumeCursor : null;

      while (hasMore && aggregate.rounds < RD_SYNC_MAX_ROUNDS) {
        aggregate.rounds += 1;
        const resourceLabel = cursor?.resource_index === 1 ? "contatos" : cursor?.resource_index === 2 ? "negócios" : "organizações";
        setRdSuccess(`Sincronizando RD lote ${aggregate.rounds} (${resourceLabel})...`);

        let result = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            result = await syncRdStationCrm({
              ...payload,
              cursor
            });
            break;
          } catch (error) {
            const message = String(error?.message || "").toLowerCase();
            const transientFailure =
              message.includes("failed to send a request") || message.includes("non-2xx");
            if (attempt < 2 && transientFailure) {
              setRdSuccess(`Reenviando lote RD ${aggregate.rounds} (tentativa ${attempt + 1}/2)...`);
              await new Promise((resolve) => setTimeout(resolve, 1200));
              continue;
            }
            throw error;
          }
        }

        const safeResult = asObject(result);
        aggregate.pages_processed += Number(safeResult.pages_processed || 0);
        aggregate.records_received += Number(safeResult.records_received || 0);
        aggregate.processed += Number(safeResult.processed || 0);
        aggregate.companies_processed += Number(safeResult.companies_processed || 0);
        aggregate.contacts_processed += Number(safeResult.contacts_processed || 0);
        aggregate.opportunities_processed += Number(safeResult.opportunities_processed || 0);
        aggregate.companies_created += Number(safeResult.companies_created || 0);
        aggregate.companies_updated += Number(safeResult.companies_updated || 0);
        aggregate.contacts_created += Number(safeResult.contacts_created || 0);
        aggregate.contacts_updated += Number(safeResult.contacts_updated || 0);
        aggregate.opportunities_created += Number(safeResult.opportunities_created || 0);
        aggregate.opportunities_updated += Number(safeResult.opportunities_updated || 0);
        aggregate.links_updated += Number(safeResult.links_updated || 0);
        aggregate.skipped_without_identifier += Number(safeResult.skipped_without_identifier || 0);
        aggregate.skipped_invalid_payload += Number(safeResult.skipped_invalid_payload || 0);

        const resultErrors = Array.isArray(safeResult.errors)
          ? safeResult.errors.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        if (resultErrors.length) {
          aggregate.errors = [...aggregate.errors, ...resultErrors].slice(0, 30);
        }

        hasMore = Boolean(safeResult.has_more);
        const candidateCursor = asObject(safeResult.next_cursor);
        const cursorResourceIndex = Number(candidateCursor.resource_index);

        if (hasMore && Number.isFinite(cursorResourceIndex)) {
          cursor = candidateCursor;
        } else if (hasMore) {
          hasMore = false;
          aggregate.errors = [...aggregate.errors, "Continuação RD Station inválida. Execute novamente para reiniciar."].slice(0, 30);
        }
      }

      aggregate.has_more = hasMore;
      aggregate.next_cursor = hasMore ? cursor : null;

      setRdResult(aggregate);
      setRdResumeCursor(hasMore ? cursor : null);
      if (hasMore) {
        if (dryRun) {
          setRdError(
            `Validação RD (modo teste) interrompida após ${aggregate.rounds} lotes. Clique novamente para continuar a validação. Nenhum dado foi gravado.`
          );
        } else {
          setRdError(
            `A sincronização RD foi interrompida para segurança após ${aggregate.rounds} lotes. Clique novamente para continuar.`
          );
        }
      } else {
        if (dryRun) {
          setRdSuccess(
            `Validação RD (modo teste) concluída em ${aggregate.rounds} lote(s). ${aggregate.processed} registro(s) processado(s). Nenhum dado foi gravado.`
          );
        } else {
          setRdSuccess(
            `Sincronização RD concluída em ${aggregate.rounds} lote(s). ${aggregate.processed} registro(s) processado(s).`
          );
        }
      }
      await loadRdHistory();
    } catch (err) {
      setRdError(err.message);
    } finally {
      setRdSyncing(false);
    }
  }

  function clearOmieCredentials() {
    setOmieForm((prev) => ({
      ...prev,
      app_key: "",
      app_secret: ""
    }));
  }

  function clearRdCredentials() {
    setRdForm((prev) => ({
      ...prev,
      access_token: ""
    }));
    setRdResumeCursor(null);
  }

  return (
    <section className="module">
      <article className="panel">
        <h2>Usuários e acessos</h2>
        <p className="muted">
          Cadastre usuários com login por e-mail, perfil de acesso e status. A senha é definida pelo próprio usuário via convite/reset.
        </p>

        {usersError ? <p className="error-text">{usersError}</p> : null}
        {usersSuccess ? <p className="success-text">{usersSuccess}</p> : null}
        {usersActionLink ? (
          <p className="settings-user-link">
            Link gerado manualmente:{" "}
            <a href={usersActionLink} target="_blank" rel="noreferrer">
              Abrir link de acesso
            </a>
          </p>
        ) : null}

        <div className="settings-users-layout top-gap">
          <form className="form-grid" onSubmit={handleCreateUser}>
            <h3>Novo usuário</h3>
            <input
              required
              placeholder="Nome completo"
              value={userForm.full_name}
              onChange={(event) => setUserForm((prev) => ({ ...prev, full_name: event.target.value }))}
            />
            <input
              required
              type="email"
              placeholder="email@empresa.com"
              value={userForm.email}
              onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              placeholder="WhatsApp (DDD) 12345-1234"
              value={userForm.whatsapp}
              onChange={(event) => setUserForm((prev) => ({ ...prev, whatsapp: event.target.value }))}
            />

            <div className="settings-users-selects">
              <label className="settings-field">
                <span>Perfil</span>
                <select value={userForm.role} onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}>
                  {USER_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Status</span>
                <select value={userForm.status} onChange={(event) => setUserForm((prev) => ({ ...prev, status: event.target.value }))}>
                  {USER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="submit" className="btn-primary" disabled={creatingUser}>
              {creatingUser ? "Criando..." : "Cadastrar usuário"}
            </button>
          </form>

          <div className="settings-users-summary">
            <h3>Resumo</h3>
            <p className="muted">
              {users.length} usuário(s) cadastrado(s) • {activeUsersCount} ativo(s)
            </p>
            <div className="inline-actions">
              <button type="button" className="btn-ghost" onClick={loadUsers} disabled={usersLoading || creatingUser}>
                {usersLoading ? "Atualizando..." : "Atualizar lista"}
              </button>
            </div>
          </div>
        </div>

        <div className="table-wrap top-gap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Login</th>
                <th>WhatsApp</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id || user.email}>
                  <td>{user.full_name || "-"}</td>
                  <td>{user.email || "-"}</td>
                  <td>{user.whatsapp || "-"}</td>
                  <td>{userRoleLabel(user.role)}</td>
                  <td>{userStatusLabel(user.status)}</td>
                  <td>{formatDateTime(user.last_login_at)}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" className="btn-ghost btn-table-action" onClick={() => startEditUser(user)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-table-action"
                        onClick={() => handleToggleUserStatus(user)}
                        disabled={savingUserId === user.user_id}
                      >
                        {savingUserId === user.user_id
                          ? "Salvando..."
                          : user.status === "active"
                            ? "Desativar"
                            : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-table-action"
                        onClick={() => handleResetUserPassword(user)}
                        disabled={resettingUserId === user.user_id}
                      >
                        {resettingUserId === user.user_id ? "Enviando..." : "Reset senha"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!users.length && !usersLoading ? (
                <tr>
                  <td colSpan={7} className="muted">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {editingUserId ? (
          <form className="form-grid top-gap settings-user-edit-form" onSubmit={handleSaveUser}>
            <h3>Editar usuário</h3>
            <input
              required
              placeholder="Nome completo"
              value={editUserForm.full_name}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, full_name: event.target.value }))}
            />
            <input
              required
              type="email"
              placeholder="email@empresa.com"
              value={editUserForm.email}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              placeholder="WhatsApp (DDD) 12345-1234"
              value={editUserForm.whatsapp}
              onChange={(event) => setEditUserForm((prev) => ({ ...prev, whatsapp: event.target.value }))}
            />

            <div className="settings-users-selects">
              <label className="settings-field">
                <span>Perfil</span>
                <select value={editUserForm.role} onChange={(event) => setEditUserForm((prev) => ({ ...prev, role: event.target.value }))}>
                  {USER_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Status</span>
                <select
                  value={editUserForm.status}
                  onChange={(event) => setEditUserForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  {USER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="inline-actions">
              <button type="submit" className="btn-primary" disabled={savingUserId === editingUserId}>
                {savingUserId === editingUserId ? "Salvando..." : "Salvar usuário"}
              </button>
              <button type="button" className="btn-ghost" onClick={cancelEditUser} disabled={savingUserId === editingUserId}>
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </article>

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
        <h2>Integração RD Station CRM - Importação completa</h2>
        <p className="muted">
          Importe organizações (empresas), contatos e negócios (oportunidades) do RD Station CRM para este CRM.
          O Access Token fica salvo apenas neste navegador. Use token do RD Station CRM (não App Key/App Secret do RD Marketing).
        </p>
        {rdError ? <p className="error-text">{rdError}</p> : null}
        {rdSuccess ? <p className="success-text">{rdSuccess}</p> : null}

        <form className="form-grid top-gap" onSubmit={handleRdSync}>
          <div className="settings-omie-grid">
            <label className="settings-field">
              <span>Access Token RD Station</span>
              <input
                required
                type="password"
                value={rdForm.access_token}
                onChange={(event) => setRdForm((prev) => ({ ...prev, access_token: event.target.value }))}
                placeholder="Token do RD Station CRM (sem Bearer)"
              />
            </label>

            <label className="settings-field settings-field-wide">
              <span>URL da API RD Station CRM</span>
              <input
                value={rdForm.api_url}
                onChange={(event) => setRdForm((prev) => ({ ...prev, api_url: event.target.value }))}
                placeholder={DEFAULT_RDSTATION_URL}
              />
            </label>

            <label className="settings-field">
              <span>Registros por página (1-500)</span>
              <input
                type="number"
                min={1}
                max={500}
                value={rdForm.records_per_page}
                onChange={(event) => setRdForm((prev) => ({ ...prev, records_per_page: event.target.value }))}
              />
            </label>

            <label className="settings-field">
              <span>Máximo de páginas por recurso (1-500)</span>
              <input
                type="number"
                min={1}
                max={500}
                value={rdForm.max_pages}
                onChange={(event) => setRdForm((prev) => ({ ...prev, max_pages: event.target.value }))}
              />
            </label>
          </div>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={Boolean(rdForm.dry_run)}
              onChange={(event) => setRdForm((prev) => ({ ...prev, dry_run: event.target.checked }))}
            />
            Modo teste (não grava dados, apenas valida e contabiliza)
          </label>

          <div className="inline-actions">
            <button type="submit" className="btn-primary" disabled={rdSyncing}>
              {rdSyncing ? "Sincronizando..." : "Sincronizar RD Station CRM"}
            </button>
            <button type="button" className="btn-ghost" onClick={loadRdHistory} disabled={rdHistoryLoading || rdSyncing}>
              {rdHistoryLoading ? "Atualizando histórico..." : "Atualizar histórico"}
            </button>
            <button type="button" className="btn-ghost" onClick={clearRdCredentials} disabled={rdSyncing}>
              Limpar token
            </button>
          </div>
        </form>

        {rdResult ? (
          <div className="kpi-grid top-gap">
            <article className="kpi-card">
              <span className="kpi-label">Processados</span>
              <strong className="kpi-value">{Number(rdResultSummary.processed || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Empresas</span>
              <strong className="kpi-value">{Number(rdResultSummary.companies_processed || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Contatos</span>
              <strong className="kpi-value">{Number(rdResultSummary.contacts_processed || 0)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Oportunidades</span>
              <strong className="kpi-value">{Number(rdResultSummary.opportunities_processed || 0)}</strong>
            </article>
          </div>
        ) : null}
        {rdResult && rdResultSummary.dry_run ? (
          <p className="muted">Resultado em modo teste: os dados foram apenas validados e não foram gravados no CRM.</p>
        ) : null}

        <h3 className="top-gap">Histórico de sincronizações RD</h3>
        <div className="table-wrap top-gap">
          <table>
            <thead>
              <tr>
                <th>Início</th>
                <th>Fim</th>
                <th>Status</th>
                <th>Processados</th>
                <th>Empresas / Contatos / Oportunidades</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rdHistory.map((job) => {
                const result = asObject(job.result);
                const payload = asObject(job.payload);
                const processed = Number(result.processed || 0);
                const companies = Number(result.companies_processed || 0);
                const contacts = Number(result.contacts_processed || 0);
                const opportunities = Number(result.opportunities_processed || 0);
                const errorMessage = String(job.error_message || "").trim();
                const dryRunFlag = Boolean(result.dry_run ?? payload.dry_run);
                const details = errorMessage || (job.status === "success" ? "Concluído sem erro." : "-");

                return (
                  <tr key={job.id}>
                    <td>{formatDateTime(job.started_at || job.created_at)}</td>
                    <td>{formatDateTime(job.finished_at)}</td>
                    <td>{syncStatusLabel(job.status)}</td>
                    <td>{processed}</td>
                    <td>
                      {companies} / {contacts} / {opportunities}
                    </td>
                    <td>{dryRunFlag ? `[Modo teste] ${details}` : details}</td>
                  </tr>
                );
              })}
              {!rdHistory.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Nenhuma sincronização RD registrada ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

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
