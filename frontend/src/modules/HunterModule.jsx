import { useEffect, useMemo, useState } from "react";
import {
  createCompanyInteraction,
  createOpportunity,
  createTask,
  listAllCompaniesForReport,
  listCompanyInteractionsFeed,
  listPipelineAnalyticsForReport,
  listSystemUsers,
  updateOpportunity
} from "../lib/revenueApi";
import { PIPELINE_STAGES, stageLabel, stageStatus } from "../lib/pipelineStages";
import { formatBrazilPhone } from "../lib/phone";

const HUNTER_VIEWER_STORAGE_KEY = "crm.hunter.viewer-user-id.v1";
const HUNTER_VISIBILITY_ALL_ROLES = new Set(["admin", "manager", "backoffice"]);

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCnpj(value) {
  const digits = cleanDigits(value);
  if (digits.length !== 14) return String(value || "");
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function extractCityStateFromAddress(addressFull) {
  const raw = String(addressFull || "").trim();
  if (!raw) return { city: "", state: "" };

  const compact = raw.replace(/\s+/g, " ");
  const patterns = [
    /,\s*([^,()]+?)\s*\(([a-z]{2})\)(?:\s*,|$)/gi,
    /,\s*([^,()]+?)\s*[-/]\s*([a-z]{2})(?:\s*,|$)/gi,
    /,\s*([^,()]+?)\s*,\s*([a-z]{2})(?:\s*,|$)/gi
  ];

  for (const pattern of patterns) {
    const matches = Array.from(compact.matchAll(pattern));
    if (!matches.length) continue;
    const last = matches[matches.length - 1];
    const city = String(last[1] || "").replace(/\s+/g, " ").trim();
    const state = String(last[2] || "").trim().toUpperCase();
    if (city) {
      return { city, state };
    }
  }

  return { city: "", state: "" };
}

function resolveCompanyCity(company) {
  const explicitCity = String(company?.city || "").trim();
  if (explicitCity) return explicitCity;
  return extractCityStateFromAddress(company?.address_full).city;
}

function resolveCompanyState(company) {
  const explicitState = String(company?.state || "").trim().toUpperCase();
  if (explicitState) return explicitState;
  return extractCityStateFromAddress(company?.address_full).state;
}

function todayYmd() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function toLocalDateKeyFromIso(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalInputNow() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toIsoFromLocalInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function addDaysYmd(baseDateYmd, daysToAdd) {
  const normalized = String(baseDateYmd || "").trim();
  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  const date = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day)
    : new Date();
  if (Number.isNaN(date.getTime())) return todayYmd();
  date.setDate(date.getDate() + Number(daysToAdd || 0));
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function parseMoney(value) {
  const normalized = String(value || "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function daysSince(isoDate) {
  if (!isoDate) return null;
  const sourceDate = new Date(isoDate);
  if (Number.isNaN(sourceDate.getTime())) return null;
  const now = new Date();
  const diff = now.getTime() - sourceDate.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function isVisitTask(task) {
  const haystack = `${task?.title || ""} ${task?.task_type || ""}`;
  const normalized = normalizeLookupText(haystack);
  return normalized.includes("visita") || normalized.includes("visit");
}

function normalizeRiskDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(1, Math.min(180, Math.floor(parsed)));
}

function normalizeUserRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "manager" || normalized === "sales" || normalized === "backoffice") {
    return normalized;
  }
  return "sales";
}

function canViewAllByRole(role) {
  return HUNTER_VISIBILITY_ALL_ROLES.has(normalizeUserRole(role));
}

function preferredViewerUser(users = []) {
  if (!users.length) return null;

  const savedViewerId =
    typeof window === "undefined" ? "" : String(window.localStorage.getItem(HUNTER_VIEWER_STORAGE_KEY) || "").trim();
  const saved = savedViewerId ? users.find((item) => String(item.user_id || "") === savedViewerId) || null : null;
  if (saved && canViewAllByRole(saved.role)) return saved;

  const manager = users.find((item) => canViewAllByRole(item.role));
  if (manager) return manager;
  if (saved) return saved;
  return users[0];
}

function ownerDisplayName(user) {
  if (!user) return "Sem responsável";
  return String(user.full_name || user.email || "Usuário").trim() || "Usuário";
}

function segmentFilterSummary(selectedSegments = []) {
  if (!selectedSegments.length) return "Todos";
  if (selectedSegments.length === 1) return selectedSegments[0];
  return `${selectedSegments.length} segmentos`;
}

function toggleMultiValue(values = [], value = "") {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return values;
  const set = new Set(values);
  if (set.has(normalizedValue)) {
    set.delete(normalizedValue);
  } else {
    set.add(normalizedValue);
  }
  return Array.from(set);
}

function emptyInteractionForm() {
  return {
    interaction_type: "note",
    direction: "outbound",
    subject: "",
    content: "",
    occurred_at_local: toLocalInputNow(),
    whatsapp_number: "",
    phone_number: ""
  };
}

export default function HunterModule() {
  const [loading, setLoading] = useState(false);
  const [savingAction, setSavingAction] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [users, setUsers] = useState([]);
  const [viewerUserId, setViewerUserId] = useState("");
  const [viewerRole, setViewerRole] = useState("sales");

  const [companies, setCompanies] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [openTasks, setOpenTasks] = useState([]);
  const [todayInteractions, setTodayInteractions] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [segmentFilters, setSegmentFilters] = useState([]);
  const [onlyWithoutOpenOpportunities, setOnlyWithoutOpenOpportunities] = useState(false);
  const [riskDays, setRiskDays] = useState(7);

  const [quickActionType, setQuickActionType] = useState("");
  const [quickActionCompanyId, setQuickActionCompanyId] = useState("");
  const [interactionForm, setInteractionForm] = useState(() => emptyInteractionForm());
  const [visitForm, setVisitForm] = useState({
    assignee_user_id: "",
    due_date: todayYmd(),
    scheduled_start_local: "",
    scheduled_end_local: "",
    description: ""
  });
  const [opportunityForm, setOpportunityForm] = useState({
    owner_user_id: "",
    stage: "lead",
    title: "",
    estimated_value: ""
  });
  const [assignForm, setAssignForm] = useState({
    owner_user_id: ""
  });

  const viewerUser = useMemo(() => users.find((user) => user.user_id === viewerUserId) || null, [users, viewerUserId]);
  const canViewAll = canViewAllByRole(viewerRole);
  const canDistribute = canViewAll;

  const activeUsers = useMemo(() => {
    const available = users.filter((item) => item.status === "active");
    return available.length ? available : users;
  }, [users]);

  const sellerUsers = useMemo(() => {
    const salesOnly = activeUsers.filter((user) => normalizeUserRole(user.role) === "sales");
    return salesOnly.length ? salesOnly : activeUsers;
  }, [activeUsers]);

  const userById = useMemo(() => {
    const map = {};
    for (const user of users) {
      map[user.user_id] = user;
    }
    return map;
  }, [users]);

  const companyById = useMemo(() => {
    const map = {};
    for (const company of companies) {
      map[company.id] = company;
    }
    return map;
  }, [companies]);

  const selectedCompany = quickActionCompanyId ? companyById[quickActionCompanyId] || null : null;

  const visibleOpportunities = useMemo(() => {
    if (canViewAll) return opportunities;
    const normalizedViewerId = String(viewerUserId || "").trim();
    if (!normalizedViewerId) return [];
    return opportunities.filter((row) => String(row.owner_user_id || "").trim() === normalizedViewerId);
  }, [canViewAll, opportunities, viewerUserId]);

  const visibleOpenOpportunities = useMemo(
    () => visibleOpportunities.filter((row) => row.status === "open" && row.company_id),
    [visibleOpportunities]
  );

  const visibleOpenTasks = useMemo(() => {
    if (canViewAll) return openTasks;
    const normalizedViewerId = String(viewerUserId || "").trim();
    if (!normalizedViewerId) return [];
    return openTasks.filter((row) => String(row.assignee_user_id || "").trim() === normalizedViewerId);
  }, [canViewAll, openTasks, viewerUserId]);

  const visibleCompanyRows = useMemo(() => {
    if (canViewAll) return companies;

    const visibilityIds = new Set();
    for (const opportunity of visibleOpenOpportunities) {
      if (opportunity.company_id) visibilityIds.add(opportunity.company_id);
    }
    for (const task of visibleOpenTasks) {
      if (task.company_id) visibilityIds.add(task.company_id);
    }

    return companies.filter((company) => visibilityIds.has(company.id));
  }, [canViewAll, companies, visibleOpenOpportunities, visibleOpenTasks]);

  const openOpportunitiesByCompany = useMemo(() => {
    const grouped = {};
    for (const opportunity of visibleOpenOpportunities) {
      if (!grouped[opportunity.company_id]) grouped[opportunity.company_id] = [];
      grouped[opportunity.company_id].push(opportunity);
    }
    return grouped;
  }, [visibleOpenOpportunities]);

  const openTasksByCompany = useMemo(() => {
    const grouped = {};
    for (const task of visibleOpenTasks) {
      if (!grouped[task.company_id]) grouped[task.company_id] = [];
      grouped[task.company_id].push(task);
    }
    return grouped;
  }, [visibleOpenTasks]);

  const availableStates = useMemo(() => {
    const set = new Set();
    for (const company of visibleCompanyRows) {
      const state = resolveCompanyState(company);
      if (state) set.add(state);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [visibleCompanyRows]);

  const availableCities = useMemo(() => {
    const set = new Set();
    for (const company of visibleCompanyRows) {
      const state = resolveCompanyState(company);
      if (stateFilter && state !== stateFilter) continue;
      const city = String(resolveCompanyCity(company) || "").trim().toUpperCase();
      if (city) set.add(city);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [stateFilter, visibleCompanyRows]);

  const availableSegments = useMemo(() => {
    const set = new Set();
    for (const company of visibleCompanyRows) {
      const segment = String(company.segmento || "").trim();
      if (segment) set.add(segment);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [visibleCompanyRows]);

  useEffect(() => {
    setSegmentFilters((previous) => previous.filter((segment) => availableSegments.includes(segment)));
  }, [availableSegments]);

  const filteredCompanies = useMemo(() => {
    const normalizedSearch = normalizeLookupText(searchTerm);
    const digitsSearch = cleanDigits(searchTerm);

    return visibleCompanyRows
      .filter((company) => {
        const companyState = resolveCompanyState(company);
        const companyCity = String(resolveCompanyCity(company) || "").trim().toUpperCase();
        const companySegment = String(company.segmento || "").trim();
        const companyName = normalizeLookupText(company.trade_name || company.legal_name || "");
        const companyCnpjDigits = cleanDigits(company.cnpj || "");

        if (stateFilter && companyState !== stateFilter) return false;
        if (cityFilter && companyCity !== cityFilter) return false;
        if (segmentFilters.length && !segmentFilters.includes(companySegment)) return false;

        if (normalizedSearch) {
          const matchesName = companyName.includes(normalizedSearch);
          const matchesCnpj = digitsSearch ? companyCnpjDigits.includes(digitsSearch) : false;
          if (!matchesName && !matchesCnpj) return false;
        }

        const openCount = (openOpportunitiesByCompany[company.id] || []).length;
        if (onlyWithoutOpenOpportunities && openCount > 0) return false;

        return true;
      })
      .sort((a, b) => String(a.trade_name || "").localeCompare(String(b.trade_name || ""), "pt-BR"));
  }, [
    cityFilter,
    openOpportunitiesByCompany,
    onlyWithoutOpenOpportunities,
    searchTerm,
    segmentFilters,
    stateFilter,
    visibleCompanyRows
  ]);

  const filteredCompanyIds = useMemo(() => new Set(filteredCompanies.map((company) => company.id)), [filteredCompanies]);

  const filteredOpenOpportunities = useMemo(
    () => visibleOpenOpportunities.filter((row) => filteredCompanyIds.has(row.company_id)),
    [filteredCompanyIds, visibleOpenOpportunities]
  );

  const filteredOpenTasks = useMemo(
    () => visibleOpenTasks.filter((row) => filteredCompanyIds.has(row.company_id)),
    [filteredCompanyIds, visibleOpenTasks]
  );

  const riskDaysSafe = normalizeRiskDays(riskDays);

  const companiesWorkedToday = useMemo(() => {
    const today = todayYmd();
    const worked = new Set();

    for (const opportunity of filteredOpenOpportunities) {
      if (!opportunity.company_id) continue;
      if (toLocalDateKeyFromIso(opportunity.created_at) === today) worked.add(opportunity.company_id);
    }

    for (const task of filteredOpenTasks) {
      if (!task.company_id) continue;
      if (toLocalDateKeyFromIso(task.created_at) === today) worked.add(task.company_id);
    }

    if (canViewAll) {
      for (const interaction of todayInteractions) {
        if (!interaction.company_id) continue;
        if (!filteredCompanyIds.has(interaction.company_id)) continue;
        worked.add(interaction.company_id);
      }
    }

    return worked.size;
  }, [canViewAll, filteredCompanyIds, filteredOpenOpportunities, filteredOpenTasks, todayInteractions]);

  const visitsCreatedToday = useMemo(() => {
    const today = todayYmd();
    return filteredOpenTasks.filter((task) => toLocalDateKeyFromIso(task.created_at) === today).filter(isVisitTask).length;
  }, [filteredOpenTasks]);

  const opportunitiesInRisk = useMemo(
    () =>
      filteredOpenOpportunities.filter((opportunity) => {
        const days = daysSince(opportunity.updated_at || opportunity.created_at);
        return Number.isFinite(days) && days > riskDaysSafe;
      }),
    [filteredOpenOpportunities, riskDaysSafe]
  );

  const opportunityRiskRows = useMemo(() => {
    return opportunitiesInRisk
      .map((opportunity) => ({
        ...opportunity,
        company: companyById[opportunity.company_id] || null,
        ageDays: daysSince(opportunity.updated_at || opportunity.created_at)
      }))
      .sort((a, b) => Number(b.ageDays || 0) - Number(a.ageDays || 0))
      .slice(0, 20);
  }, [companyById, opportunitiesInRisk]);

  const summary = useMemo(
    () => ({
      companiesWorkedToday,
      visitsCreatedToday,
      openOpportunities: filteredOpenOpportunities.length,
      riskCount: opportunitiesInRisk.length
    }),
    [companiesWorkedToday, filteredOpenOpportunities.length, opportunitiesInRisk.length, visitsCreatedToday]
  );

  async function loadContext() {
    setLoading(true);
    setError("");

    try {
      const [usersRows, companyRows, analyticsRows, interactionRows] = await Promise.all([
        listSystemUsers(),
        listAllCompaniesForReport(),
        listPipelineAnalyticsForReport(),
        listCompanyInteractionsFeed({
          occurredFromIso: startOfTodayIso(),
          limit: 2000
        }).catch(() => [])
      ]);

      const activeUsersRows = usersRows.filter((item) => item.status === "active");
      const availableUsers = activeUsersRows.length ? activeUsersRows : usersRows;
      setUsers(availableUsers);
      setCompanies(companyRows || []);
      setOpportunities(Array.isArray(analyticsRows?.opportunities) ? analyticsRows.opportunities : []);
      setOpenTasks(Array.isArray(analyticsRows?.openTasks) ? analyticsRows.openTasks : []);
      setTodayInteractions(Array.isArray(interactionRows) ? interactionRows : []);

      if (!availableUsers.length) {
        setViewerUserId("");
        setViewerRole("sales");
        return;
      }

      const selectedViewer = preferredViewerUser(availableUsers) || availableUsers[0];
      setViewerUserId(selectedViewer.user_id);
      setViewerRole(normalizeUserRole(selectedViewer.role));

      if (typeof window !== "undefined") {
        window.localStorage.setItem(HUNTER_VIEWER_STORAGE_KEY, selectedViewer.user_id);
      }
    } catch (err) {
      setError(err.message);
      setUsers([]);
      setCompanies([]);
      setOpportunities([]);
      setOpenTasks([]);
      setTodayInteractions([]);
      setViewerUserId("");
      setViewerRole("sales");
    } finally {
      setLoading(false);
    }
  }

  async function reloadOperationsSnapshot() {
    const [analyticsRows, interactionRows] = await Promise.all([
      listPipelineAnalyticsForReport(),
      listCompanyInteractionsFeed({
        occurredFromIso: startOfTodayIso(),
        limit: 2000
      }).catch(() => [])
    ]);

    setOpportunities(Array.isArray(analyticsRows?.opportunities) ? analyticsRows.opportunities : []);
    setOpenTasks(Array.isArray(analyticsRows?.openTasks) ? analyticsRows.openTasks : []);
    setTodayInteractions(Array.isArray(interactionRows) ? interactionRows : []);
  }

  useEffect(() => {
    loadContext();
  }, []);

  useEffect(() => {
    if (!selectedCompany) {
      setQuickActionType("");
    }
  }, [selectedCompany]);

  useEffect(() => {
    const defaultOwner = canDistribute
      ? sellerUsers[0]?.user_id || ""
      : viewerUserId;

    setVisitForm((prev) => {
      if (prev.assignee_user_id) return prev;
      return {
        ...prev,
        assignee_user_id: defaultOwner
      };
    });

    setOpportunityForm((prev) => {
      if (prev.owner_user_id) return prev;
      return {
        ...prev,
        owner_user_id: defaultOwner
      };
    });

    setAssignForm((prev) => {
      if (prev.owner_user_id) return prev;
      return {
        ...prev,
        owner_user_id: defaultOwner
      };
    });
  }, [canDistribute, sellerUsers, viewerUserId]);

  function handleViewerChange(nextViewerId) {
    const normalized = String(nextViewerId || "").trim();
    const selectedViewer = users.find((user) => user.user_id === normalized);
    if (!selectedViewer) return;

    const nextRole = normalizeUserRole(selectedViewer.role);
    setViewerUserId(selectedViewer.user_id);
    setViewerRole(nextRole);
    setError("");
    setSuccess("");

    const fallbackOwner = canViewAllByRole(nextRole)
      ? sellerUsers[0]?.user_id || selectedViewer.user_id
      : selectedViewer.user_id;

    setVisitForm((prev) => ({ ...prev, assignee_user_id: fallbackOwner }));
    setOpportunityForm((prev) => ({ ...prev, owner_user_id: fallbackOwner }));
    setAssignForm((prev) => ({ ...prev, owner_user_id: fallbackOwner }));

    if (typeof window !== "undefined") {
      window.localStorage.setItem(HUNTER_VIEWER_STORAGE_KEY, selectedViewer.user_id);
    }
  }

  function handleOpenQuickAction(type, company) {
    if (!company?.id) return;

    const defaultOwner = canDistribute
      ? sellerUsers[0]?.user_id || ""
      : viewerUserId;

    setQuickActionCompanyId(company.id);
    setQuickActionType(type);
    setError("");
    setSuccess("");

    if (type === "interaction") {
      setInteractionForm(emptyInteractionForm());
    }

    if (type === "visit") {
      setVisitForm({
        assignee_user_id: defaultOwner,
        due_date: todayYmd(),
        scheduled_start_local: "",
        scheduled_end_local: "",
        description: `Planejar visita comercial para ${company.trade_name || "cliente"}.`
      });
    }

    if (type === "opportunity") {
      setOpportunityForm({
        owner_user_id: defaultOwner,
        stage: "lead",
        title: `Prospecção ${company.trade_name || "cliente"}`,
        estimated_value: ""
      });
    }

    if (type === "assign") {
      setAssignForm({
        owner_user_id: defaultOwner
      });
    }
  }

  function closeQuickAction() {
    setQuickActionType("");
    setQuickActionCompanyId("");
  }

  async function handleSubmitInteraction(event) {
    event.preventDefault();
    if (!selectedCompany?.id) {
      setError("Selecione uma empresa para registrar interação.");
      return;
    }

    const content = String(interactionForm.content || "").trim();
    if (!content) {
      setError("Descreva a interação.");
      return;
    }

    const occurredAtIso = toIsoFromLocalInput(interactionForm.occurred_at_local) || new Date().toISOString();

    setSavingAction(true);
    setError("");
    setSuccess("");

    try {
      await createCompanyInteraction({
        company_id: selectedCompany.id,
        interaction_type: interactionForm.interaction_type,
        direction: interactionForm.direction || null,
        subject: String(interactionForm.subject || "").trim() || null,
        content,
        whatsapp_number: String(interactionForm.whatsapp_number || "").trim() || null,
        phone_number: String(interactionForm.phone_number || "").trim() || null,
        occurred_at: occurredAtIso
      });

      if (toLocalDateKeyFromIso(occurredAtIso) === todayYmd()) {
        setTodayInteractions((previous) => [
          {
            id: `local-${Date.now()}`,
            company_id: selectedCompany.id,
            occurred_at: occurredAtIso
          },
          ...previous
        ]);
      }

      setInteractionForm((prev) => ({
        ...emptyInteractionForm(),
        subject: prev.subject,
        interaction_type: prev.interaction_type,
        direction: prev.direction
      }));
      setSuccess("Interação registrada no histórico da empresa.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction(false);
    }
  }

  async function handleSubmitVisit(event) {
    event.preventDefault();
    if (!selectedCompany?.id) {
      setError("Selecione uma empresa para criar visita.");
      return;
    }

    const description = String(visitForm.description || "").trim();
    if (!description) {
      setError("Descreva o objetivo da visita.");
      return;
    }

    const dueDate = String(visitForm.due_date || "").trim();
    if (!dueDate) {
      setError("Informe a data da visita.");
      return;
    }

    const assigneeUserId = canDistribute
      ? String(visitForm.assignee_user_id || "").trim()
      : String(viewerUserId || "").trim();
    if (!assigneeUserId) {
      setError("Selecione o responsável pela visita.");
      return;
    }

    const scheduledStartAt = toIsoFromLocalInput(visitForm.scheduled_start_local);
    const scheduledEndAt = toIsoFromLocalInput(visitForm.scheduled_end_local);

    if (scheduledStartAt && scheduledEndAt && new Date(scheduledEndAt).getTime() < new Date(scheduledStartAt).getTime()) {
      setError("A data/hora final não pode ser anterior ao início.");
      return;
    }

    setSavingAction(true);
    setError("");
    setSuccess("");

    try {
      await createTask({
        company_id: selectedCompany.id,
        assignee_user_id: assigneeUserId,
        created_by_user_id: viewerUserId || assigneeUserId,
        title: "Visita Hunter",
        task_type: "commercial",
        priority: "medium",
        status: "todo",
        due_date: dueDate,
        scheduled_start_at: scheduledStartAt,
        scheduled_end_at: scheduledEndAt,
        description,
        completed_at: null
      });

      await createCompanyInteraction({
        company_id: selectedCompany.id,
        interaction_type: "note",
        direction: "outbound",
        subject: "Visita agendada",
        content: `Visita criada para ${ownerDisplayName(userById[assigneeUserId])}. Data alvo: ${formatDate(dueDate)}.`
      });

      await reloadOperationsSnapshot();
      setSuccess("Visita criada e atribuída com sucesso.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction(false);
    }
  }

  async function handleSubmitOpportunity(event) {
    event.preventDefault();
    if (!selectedCompany?.id) {
      setError("Selecione uma empresa para criar oportunidade.");
      return;
    }

    const title = String(opportunityForm.title || "").trim();
    if (!title) {
      setError("Informe o título da oportunidade.");
      return;
    }

    const stage = PIPELINE_STAGES.some((item) => item.value === opportunityForm.stage)
      ? opportunityForm.stage
      : "lead";

    const ownerUserId = canDistribute
      ? String(opportunityForm.owner_user_id || "").trim()
      : String(viewerUserId || "").trim();
    if (!ownerUserId) {
      setError("Selecione o responsável da oportunidade.");
      return;
    }

    const expectedCloseDate = addDaysYmd(todayYmd(), 30);

    setSavingAction(true);
    setError("");
    setSuccess("");

    try {
      await createOpportunity({
        company_id: selectedCompany.id,
        owner_user_id: ownerUserId,
        created_by_user_id: viewerUserId || ownerUserId,
        title,
        stage,
        status: stageStatus(stage),
        estimated_value: parseMoney(opportunityForm.estimated_value),
        expected_close_date: expectedCloseDate,
        line_items: []
      });

      await createCompanyInteraction({
        company_id: selectedCompany.id,
        interaction_type: "note",
        direction: "outbound",
        subject: "Oportunidade criada",
        content: `Nova oportunidade em ${stageLabel(stage)} atribuída para ${ownerDisplayName(userById[ownerUserId])}.`
      });

      await reloadOperationsSnapshot();
      setSuccess("Oportunidade criada com previsão de fechamento em 30 dias.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction(false);
    }
  }

  async function handleSubmitAssign(event) {
    event.preventDefault();
    if (!selectedCompany?.id) {
      setError("Selecione uma empresa para atribuir vendedor.");
      return;
    }
    if (!canDistribute) {
      setError("Atribuição de vendedor disponível apenas para Gestor/Admin/Backoffice.");
      return;
    }

    const ownerUserId = String(assignForm.owner_user_id || "").trim();
    if (!ownerUserId) {
      setError("Selecione o vendedor responsável.");
      return;
    }

    const companyOpenRows = openOpportunitiesByCompany[selectedCompany.id] || [];

    setSavingAction(true);
    setError("");
    setSuccess("");

    try {
      if (companyOpenRows.length) {
        for (const row of companyOpenRows) {
          await updateOpportunity(row.id, {
            owner_user_id: ownerUserId
          });
        }

        await createCompanyInteraction({
          company_id: selectedCompany.id,
          interaction_type: "note",
          direction: "outbound",
          subject: "Carteira distribuída",
          content: `${companyOpenRows.length} oportunidade(s) aberta(s) atribuída(s) para ${ownerDisplayName(userById[ownerUserId])}.`
        });

        setSuccess(`${companyOpenRows.length} oportunidade(s) atribuída(s) para ${ownerDisplayName(userById[ownerUserId])}.`);
      } else {
        const dueDate = addDaysYmd(todayYmd(), 2);
        await createTask({
          company_id: selectedCompany.id,
          assignee_user_id: ownerUserId,
          created_by_user_id: viewerUserId || ownerUserId,
          title: "Visita distribuída (Hunter)",
          task_type: "commercial",
          priority: "medium",
          status: "todo",
          due_date: dueDate,
          description: "Conta sem oportunidade ativa. Validar potencial comercial e registrar evolução.",
          completed_at: null
        });

        await createCompanyInteraction({
          company_id: selectedCompany.id,
          interaction_type: "note",
          direction: "outbound",
          subject: "Distribuição sem oportunidade",
          content: `Conta atribuída para ${ownerDisplayName(userById[ownerUserId])} via tarefa de prospecção.`
        });

        setSuccess(`Conta distribuída para ${ownerDisplayName(userById[ownerUserId])} com tarefa de visita.`);
      }

      await reloadOperationsSnapshot();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAction(false);
    }
  }

  return (
    <section className="module hunter-module">
      {!selectedCompany && error ? <p className="error-text">{error}</p> : null}
      {!selectedCompany && success ? <p className="success-text">{success}</p> : null}

      <article className="panel hunter-panel">
        <h2>Fluxo de Oportunidades - Fase 1</h2>
        <p className="muted">
          Base de prospecção com filtros de cobertura, distribuição rápida para vendedores e rastreio de pendências críticas.
        </p>

        <div className="hunter-controls-grid">
          <label>
            Usuário da visão
            <select value={viewerUserId} onChange={(event) => handleViewerChange(event.target.value)}>
              {activeUsers.map((user) => (
                <option key={user.user_id} value={user.user_id}>
                  {ownerDisplayName(user)} ({String(user.role || "sales").toUpperCase()})
                </option>
              ))}
            </select>
          </label>

          <label>
            Pendência em risco (&gt; dias)
            <input
              type="number"
              min={1}
              max={180}
              value={riskDays}
              onChange={(event) => setRiskDays(normalizeRiskDays(event.target.value))}
            />
          </label>

          <label>
            Estado (UF)
            <select value={stateFilter} onChange={(event) => {
              setStateFilter(event.target.value);
              setCityFilter("");
            }}>
              <option value="">Todos</option>
              {availableStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>

          <label>
            Cidade
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
              <option value="">Todas</option>
              {availableCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>

          <label>
            Segmento
            <details className="multi-checkbox-filter">
              <summary className="multi-checkbox-summary">{segmentFilterSummary(segmentFilters)}</summary>
              <div className="multi-checkbox-menu">
                <label className="multi-checkbox-option">
                  <input
                    type="checkbox"
                    checked={!segmentFilters.length}
                    onChange={() => setSegmentFilters([])}
                  />
                  Todos
                </label>
                {availableSegments.map((segment) => (
                  <label key={segment} className="multi-checkbox-option">
                    <input
                      type="checkbox"
                      checked={segmentFilters.includes(segment)}
                      onChange={() => setSegmentFilters((previous) => toggleMultiValue(previous, segment))}
                    />
                    {segment}
                  </label>
                ))}
              </div>
            </details>
          </label>

          <label>
            Busca (empresa/CNPJ)
            <input
              placeholder="Ex.: Gráfica, 12.345.678/0001-90"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
        </div>

        <label className="hunter-toggle-row">
          <input
            type="checkbox"
            checked={onlyWithoutOpenOpportunities}
            onChange={(event) => setOnlyWithoutOpenOpportunities(event.target.checked)}
          />
          Mostrar apenas empresas sem oportunidade ativa
        </label>
      </article>

      <div className="kpi-grid">
        <article className="kpi-card">
          <span className="kpi-label">Empresas trabalhadas hoje</span>
          <strong className="kpi-value">{summary.companiesWorkedToday}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Visitas criadas hoje</span>
          <strong className="kpi-value">{summary.visitsCreatedToday}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Oportunidades abertas</span>
          <strong className="kpi-value">{summary.openOpportunities}</strong>
        </article>
        <article className="kpi-card">
          <span className="kpi-label">Pendências sem retorno (&gt;{riskDaysSafe}d)</span>
          <strong className="kpi-value">{summary.riskCount}</strong>
        </article>
      </div>

      {selectedCompany ? (
        <div className="edit-company-modal-overlay" role="presentation" onClick={closeQuickAction}>
          <article
            className="edit-company-modal-card hunter-quick-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label={`Ações rápidas para ${selectedCompany.trade_name || "empresa"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="hunter-quick-header">
              <div>
                <h3>Ações rápidas - {selectedCompany.trade_name || "Empresa"}</h3>
                <p className="muted">
                  CNPJ {formatCnpj(selectedCompany.cnpj)} · {resolveCompanyCity(selectedCompany) || "-"}/{resolveCompanyState(selectedCompany) || "-"}
                </p>
              </div>
              <button type="button" className="btn-ghost btn-table-action" onClick={closeQuickAction}>
                Fechar
              </button>
            </div>

            {error ? <p className="error-text">{error}</p> : null}
            {success ? <p className="success-text">{success}</p> : null}

            <div className="hunter-quick-tabs">
              <button
                type="button"
                className={quickActionType === "interaction" ? "btn-primary btn-table-action" : "btn-ghost btn-table-action"}
                onClick={() => setQuickActionType("interaction")}
              >
                Registrar contato
              </button>
              <button
                type="button"
                className={quickActionType === "visit" ? "btn-primary btn-table-action" : "btn-ghost btn-table-action"}
                onClick={() => setQuickActionType("visit")}
              >
                Criar visita
              </button>
              <button
                type="button"
                className={quickActionType === "opportunity" ? "btn-primary btn-table-action" : "btn-ghost btn-table-action"}
                onClick={() => setQuickActionType("opportunity")}
              >
                Criar oportunidade
              </button>
              {canDistribute ? (
                <button
                  type="button"
                  className={quickActionType === "assign" ? "btn-primary btn-table-action" : "btn-ghost btn-table-action"}
                  onClick={() => setQuickActionType("assign")}
                >
                  Atribuir vendedor
                </button>
              ) : null}
            </div>

            {quickActionType === "interaction" ? (
              <form className="form-grid" onSubmit={handleSubmitInteraction}>
                <div className="hunter-form-grid-two">
                  <label>
                    Tipo
                    <select
                      value={interactionForm.interaction_type}
                      onChange={(event) => setInteractionForm((prev) => ({ ...prev, interaction_type: event.target.value }))}
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="call">Chamada</option>
                      <option value="note">Anotação</option>
                    </select>
                  </label>

                  <label>
                    Direção
                    <select
                      value={interactionForm.direction}
                      onChange={(event) => setInteractionForm((prev) => ({ ...prev, direction: event.target.value }))}
                    >
                      <option value="outbound">Saída</option>
                      <option value="inbound">Entrada</option>
                    </select>
                  </label>

                  <label>
                    Ocorrido em
                    <input
                      type="datetime-local"
                      value={interactionForm.occurred_at_local}
                      onChange={(event) => setInteractionForm((prev) => ({ ...prev, occurred_at_local: event.target.value }))}
                    />
                  </label>

                  <label>
                    Assunto
                    <input
                      placeholder="Resumo rápido"
                      value={interactionForm.subject}
                      onChange={(event) => setInteractionForm((prev) => ({ ...prev, subject: event.target.value }))}
                    />
                  </label>

                  <label>
                    WhatsApp
                    <input
                      placeholder="(47) 99999-9999"
                      value={interactionForm.whatsapp_number}
                      onChange={(event) =>
                        setInteractionForm((prev) => ({ ...prev, whatsapp_number: formatBrazilPhone(event.target.value) }))
                      }
                    />
                  </label>

                  <label>
                    Telefone
                    <input
                      placeholder="(47) 3333-3333"
                      value={interactionForm.phone_number}
                      onChange={(event) =>
                        setInteractionForm((prev) => ({ ...prev, phone_number: formatBrazilPhone(event.target.value) }))
                      }
                    />
                  </label>
                </div>

                <label>
                  Conteúdo da interação
                  <textarea
                    value={interactionForm.content}
                    onChange={(event) => setInteractionForm((prev) => ({ ...prev, content: event.target.value }))}
                    placeholder="Descreva o que foi tratado e próximos passos."
                    required
                  />
                </label>

                <button type="submit" className="btn-primary" disabled={savingAction}>
                  {savingAction ? "Salvando..." : "Salvar interação"}
                </button>
              </form>
            ) : null}

            {quickActionType === "visit" ? (
              <form className="form-grid" onSubmit={handleSubmitVisit}>
                <div className="hunter-form-grid-two">
                  <label>
                    Responsável da visita
                    <select
                      value={visitForm.assignee_user_id}
                      onChange={(event) => setVisitForm((prev) => ({ ...prev, assignee_user_id: event.target.value }))}
                      disabled={!canDistribute}
                    >
                      {(canDistribute ? sellerUsers : activeUsers.filter((user) => user.user_id === viewerUserId)).map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {ownerDisplayName(user)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Data da visita
                    <input
                      type="date"
                      value={visitForm.due_date}
                      onChange={(event) => setVisitForm((prev) => ({ ...prev, due_date: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    Início (opcional)
                    <input
                      type="datetime-local"
                      value={visitForm.scheduled_start_local}
                      onChange={(event) => setVisitForm((prev) => ({ ...prev, scheduled_start_local: event.target.value }))}
                    />
                  </label>

                  <label>
                    Fim (opcional)
                    <input
                      type="datetime-local"
                      value={visitForm.scheduled_end_local}
                      onChange={(event) => setVisitForm((prev) => ({ ...prev, scheduled_end_local: event.target.value }))}
                    />
                  </label>
                </div>

                <label>
                  Objetivo da visita
                  <textarea
                    value={visitForm.description}
                    onChange={(event) => setVisitForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Ex.: validar parque atual, mapear demanda, gerar próxima ação."
                    required
                  />
                </label>

                <button type="submit" className="btn-primary" disabled={savingAction}>
                  {savingAction ? "Salvando..." : "Criar visita"}
                </button>
              </form>
            ) : null}

            {quickActionType === "opportunity" ? (
              <form className="form-grid" onSubmit={handleSubmitOpportunity}>
                <div className="hunter-form-grid-two">
                  <label>
                    Responsável da oportunidade
                    <select
                      value={opportunityForm.owner_user_id}
                      onChange={(event) => setOpportunityForm((prev) => ({ ...prev, owner_user_id: event.target.value }))}
                      disabled={!canDistribute}
                    >
                      {(canDistribute ? sellerUsers : activeUsers.filter((user) => user.user_id === viewerUserId)).map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {ownerDisplayName(user)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Etapa inicial
                    <select
                      value={opportunityForm.stage}
                      onChange={(event) => setOpportunityForm((prev) => ({ ...prev, stage: event.target.value }))}
                    >
                      {PIPELINE_STAGES.map((stage) => (
                        <option key={stage.value} value={stage.value}>
                          {stage.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Valor previsto (R$)
                    <input
                      value={opportunityForm.estimated_value}
                      onChange={(event) => setOpportunityForm((prev) => ({ ...prev, estimated_value: event.target.value }))}
                      placeholder="Opcional"
                    />
                  </label>
                </div>

                <label>
                  Título da oportunidade
                  <input
                    value={opportunityForm.title}
                    onChange={(event) => setOpportunityForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Ex.: Projeto Canon imagePRESS V700"
                    required
                  />
                </label>

                <button type="submit" className="btn-primary" disabled={savingAction}>
                  {savingAction ? "Salvando..." : "Criar oportunidade"}
                </button>
              </form>
            ) : null}

            {quickActionType === "assign" && canDistribute ? (
              <form className="form-grid" onSubmit={handleSubmitAssign}>
                <p className="muted">
                  Se a empresa já tiver oportunidade aberta, o responsável será atualizado. Se não houver, o sistema cria uma tarefa de
                  prospecção para o vendedor.
                </p>

                <label>
                  Vendedor responsável
                  <select
                    value={assignForm.owner_user_id}
                    onChange={(event) => setAssignForm((prev) => ({ ...prev, owner_user_id: event.target.value }))}
                  >
                    {sellerUsers.map((user) => (
                      <option key={user.user_id} value={user.user_id}>
                        {ownerDisplayName(user)}
                      </option>
                    ))}
                  </select>
                </label>

                <button type="submit" className="btn-primary" disabled={savingAction}>
                  {savingAction ? "Salvando..." : "Atribuir vendedor"}
                </button>
              </form>
            ) : null}
          </article>
        </div>
      ) : null}

      <article className="panel">
        <div className="hunter-table-header">
          <h3>Base de cobertura ({filteredCompanies.length})</h3>
          <span className="muted">{loading ? "Atualizando dados..." : "Pronto para distribuir e abrir novas ações."}</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>CNPJ</th>
                <th>Cidade/UF</th>
                <th>Segmento</th>
                <th>Oport. abertas</th>
                <th>Tarefas abertas</th>
                <th>Aging máx</th>
                <th>Responsáveis</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((company) => {
                const companyOpps = openOpportunitiesByCompany[company.id] || [];
                const companyTasks = openTasksByCompany[company.id] || [];
                const maxAging = companyOpps.reduce((max, row) => {
                  const days = daysSince(row.updated_at || row.created_at);
                  if (!Number.isFinite(days)) return max;
                  return Math.max(max, days);
                }, 0);

                const owners = [...new Set(companyOpps.map((row) => ownerDisplayName(userById[row.owner_user_id])))]
                  .filter(Boolean)
                  .slice(0, 2);

                return (
                  <tr key={company.id}>
                    <td>{company.trade_name || company.legal_name || "Empresa"}</td>
                    <td>{formatCnpj(company.cnpj)}</td>
                    <td>
                      {resolveCompanyCity(company) || "-"}/{resolveCompanyState(company) || "-"}
                    </td>
                    <td>{company.segmento || "-"}</td>
                    <td>{companyOpps.length}</td>
                    <td>{companyTasks.length}</td>
                    <td>{companyOpps.length ? `${maxAging} dia(s)` : "-"}</td>
                    <td>{owners.length ? owners.join(" / ") : "Sem responsável"}</td>
                    <td>
                      <div className="hunter-row-actions">
                        <button type="button" className="btn-ghost btn-table-action" onClick={() => handleOpenQuickAction("interaction", company)}>
                          Contato
                        </button>
                        <button type="button" className="btn-ghost btn-table-action" onClick={() => handleOpenQuickAction("visit", company)}>
                          Visita
                        </button>
                        <button type="button" className="btn-ghost btn-table-action" onClick={() => handleOpenQuickAction("opportunity", company)}>
                          Oportunidade
                        </button>
                        {canDistribute ? (
                          <button type="button" className="btn-primary btn-table-action" onClick={() => handleOpenQuickAction("assign", company)}>
                            Atribuir
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!filteredCompanies.length ? (
                <tr>
                  <td colSpan={9} className="muted">
                    Nenhuma empresa encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <div className="hunter-table-header">
          <h3>Pendências em risco (&gt;{riskDaysSafe} dias sem evolução)</h3>
          <span className="muted">Priorize estas oportunidades para ação do Hunter com vendedor.</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Oportunidade</th>
                <th>Etapa</th>
                <th>Responsável</th>
                <th>Valor</th>
                <th>Última evolução</th>
                <th>Previsão fechamento</th>
              </tr>
            </thead>
            <tbody>
              {opportunityRiskRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.company?.trade_name || "Empresa"}</td>
                  <td>{row.title || "Oportunidade"}</td>
                  <td>{stageLabel(row.stage)}</td>
                  <td>{ownerDisplayName(userById[row.owner_user_id])}</td>
                  <td>{formatMoney(Number(row.estimated_value || 0))}</td>
                  <td>{Number.isFinite(row.ageDays) ? `${row.ageDays} dia(s)` : "-"}</td>
                  <td>{row.expected_close_date ? formatDate(row.expected_close_date) : "-"}</td>
                </tr>
              ))}

              {!opportunityRiskRows.length ? (
                <tr>
                  <td colSpan={7} className="muted">
                    Nenhuma oportunidade em risco acima do limite atual.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      {!users.length ? (
        <p className="muted">Cadastre usuários ativos em Configurações para usar o Fluxo de Oportunidades.</p>
      ) : null}
      {viewerUser ? (
        <p className="muted">
          Visão atual: <strong>{ownerDisplayName(viewerUser)}</strong> ({String(viewerRole || "sales").toUpperCase()})
        </p>
      ) : null}
    </section>
  );
}
