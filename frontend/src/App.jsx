import { useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured } from "./lib/supabase";
import { deleteCompany, listSystemUsers, listUpcomingBirthdays, searchGlobalRecords } from "./lib/revenueApi";
import { toWhatsAppBrazilNumber } from "./lib/phone";
import { confirmStrongDelete } from "./lib/confirmDelete";
import { hasModulePermission, resolveSearchResultModule } from "./lib/accessControl";
import DashboardModule from "./modules/DashboardModule";
import CompaniesModule from "./modules/CompaniesModule";
import PipelineModule from "./modules/PipelineModule";
import HunterModule from "./modules/HunterModule";
import ServiceModule from "./modules/ServiceModule";
import OrdersModule from "./modules/OrdersModule";
import TasksModule from "./modules/TasksModule";
import SettingsModule from "./modules/SettingsModule";
import ReportsModule from "./modules/ReportsModule";
import CustomerHistoryModal from "./components/CustomerHistoryModal";

const THEME_STORAGE_KEY = "crm-theme";
const APP_VIEWER_STORAGE_KEY = "crm.app.viewer-user-id.v1";
const CANONICAL_CRM_HOST = "crm-adilson-sousas-projects.vercel.app";
const LEGACY_ALIAS_REDIRECT_HOSTS = new Set(["crm-kappa-peach.vercel.app"]);

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", hint: "Indicadores", icon: "◩" },
  { id: "pipeline", label: "Pipeline", hint: "Negócios", icon: "◧" },
  { id: "hunter", label: "Fluxo", hint: "Hunter e cobertura", icon: "◲" },
  { id: "tasks", label: "Agenda", hint: "Fluxo de tarefas", icon: "◪" },
  { id: "companies", label: "Empresas", hint: "Contas e CNPJ", icon: "◎" },
  { id: "contacts", label: "Contatos", hint: "Pessoas e cargos", icon: "◬" },
  { id: "orders", label: "Pedidos", hint: "Receita", icon: "◫" },
  { id: "reports", label: "Relatórios", hint: "Exportações", icon: "◰" },
  { id: "service", label: "Assistência", hint: "SLA e suporte", icon: "◨" },
  { id: "settings", label: "Configurações", hint: "Parâmetros gerais", icon: "◭" }
];

const PAGE_META = {
  dashboard: {
    kicker: "Visão Executiva",
    title: "Performance Comercial e Técnica",
    description: "Acompanhe funil, receita, pedidos e suporte com governança operacional em um único CRM."
  },
  companies: {
    kicker: "Gestão de Contas",
    title: "Base de Empresas",
    description: "Cadastre empresas com CNPJ validado e dados autocompletados para manter a base confiável."
  },
  contacts: {
    kicker: "Relacionamento",
    title: "Base de Contatos",
    description: "Consulte, corrija e mantenha contatos com vínculo de empresa, WhatsApp, aniversário e cargo."
  },
  pipeline: {
    kicker: "Vendas",
    title: "Pipeline Comercial",
    description: "Evolua negócios por etapa com arrastar e soltar, mantendo processo previsível e auditável."
  },
  hunter: {
    kicker: "Prospecção",
    title: "Fluxo de Oportunidades",
    description: "Priorize contas-alvo, distribua visitas e acompanhe cobertura comercial por região e responsável."
  },
  orders: {
    kicker: "Revenue Operations",
    title: "Pedidos de Venda",
    description: "Controle pedidos de equipamentos, suprimentos e serviços com rastreabilidade comercial."
  },
  reports: {
    kicker: "Dados e Exportação",
    title: "Relatórios",
    description: "Extraia relatórios de empresas cadastradas e exporte em Excel para análises externas."
  },
  tasks: {
    kicker: "Agenda",
    title: "Fluxo de Tarefas",
    description: "Cadastre tarefas pelos usuários e acompanhe o fluxo por status para gestão diária."
  },
  service: {
    kicker: "Pós-venda",
    title: "Assistência Técnica",
    description: "Centralize corretivas, preventivas e SLA com visão integrada ao histórico do cliente."
  },
  settings: {
    kicker: "Configurações Gerais",
    title: "Parâmetros do CRM",
    description: "Gerencie regras globais, como ciclo de vida de empresas e sincronização de clientes OMIE."
  }
};

function birthdayWhatsAppMessage(alertItem) {
  return [
    `Ola, ${alertItem.full_name}!`,
    "Passando para te desejar um feliz aniversario!",
    "Que seu dia seja excelente.",
    "",
    "Abracos,",
    "Equipe Comercial"
  ].join("\n");
}

function buildBirthdayWhatsAppUrl(alertItem) {
  const normalizedNumber = toWhatsAppBrazilNumber(alertItem.whatsapp);
  if (!normalizedNumber) return "";
  const text = encodeURIComponent(birthdayWhatsAppMessage(alertItem));
  return `https://wa.me/${normalizedNumber}?text=${text}`;
}

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pickDefaultAppViewerUser(users = [], savedViewerId = "") {
  if (!users.length) return null;
  const normalizedSavedId = String(savedViewerId || "").trim();
  if (normalizedSavedId) {
    const savedUser = users.find((item) => String(item?.user_id || "").trim() === normalizedSavedId);
    if (savedUser) return savedUser;
  }

  const privilegedUser = users.find((item) => {
    const role = String(item?.role || "").toLowerCase();
    return role === "admin" || role === "manager";
  });
  if (privilegedUser) return privilegedUser;

  const preferredName = users.find((item) => normalizeLookupText(item?.full_name || "").includes("adilson"));
  if (preferredName) return preferredName;

  return users[0];
}

function buildUserInitials(user) {
  const source = String(user?.full_name || user?.email || "").trim();
  if (!source) return "US";
  const parts = source
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return source.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export default function App() {
  const searchInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [companiesFocusTarget, setCompaniesFocusTarget] = useState("company");
  const [companiesFocusRequest, setCompaniesFocusRequest] = useState(0);
  const [companiesPrefillDraft, setCompaniesPrefillDraft] = useState(null);
  const [companiesPrefillRequest, setCompaniesPrefillRequest] = useState(0);
  const [companiesEditCompanyId, setCompaniesEditCompanyId] = useState("");
  const [companiesEditRequest, setCompaniesEditRequest] = useState(0);
  const [contactsFocusRequest, setContactsFocusRequest] = useState(0);
  const [contactsEditContactId, setContactsEditContactId] = useState("");
  const [contactsEditRequest, setContactsEditRequest] = useState(0);
  const [contactsEditPayload, setContactsEditPayload] = useState(null);
  const [pipelinePrefillDraft, setPipelinePrefillDraft] = useState(null);
  const [pipelinePrefillRequest, setPipelinePrefillRequest] = useState(0);
  const [tasksPrefillDraft, setTasksPrefillDraft] = useState(null);
  const [tasksPrefillRequest, setTasksPrefillRequest] = useState(0);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [deletingSearchCompanyId, setDeletingSearchCompanyId] = useState("");
  const [searchKeyboardIndex, setSearchKeyboardIndex] = useState(-1);
  const [searchKeyboardNavigating, setSearchKeyboardNavigating] = useState(false);
  const [searchCustomerHistoryModal, setSearchCustomerHistoryModal] = useState({
    open: false,
    companyId: "",
    companyName: ""
  });
  const [appUsers, setAppUsers] = useState([]);
  const [appUsersLoading, setAppUsersLoading] = useState(false);
  const [appUsersError, setAppUsersError] = useState("");
  const [appViewerUserId, setAppViewerUserId] = useState("");
  const [birthdayAlerts, setBirthdayAlerts] = useState([]);
  const [birthdayError, setBirthdayError] = useState("");
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentHost = String(window.location.hostname || "").toLowerCase();
    if (!LEGACY_ALIAS_REDIRECT_HOSTS.has(currentHost)) return;

    const { pathname, search, hash } = window.location;
    const nextUrl = `https://${CANONICAL_CRM_HOST}${pathname}${search}${hash}`;
    window.location.replace(nextUrl);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function loadAppUsersContext() {
      if (!isSupabaseConfigured) {
        if (!active) return;
        setAppUsers([]);
        setAppUsersError("");
        setAppViewerUserId("");
        return;
      }

      setAppUsersLoading(true);
      try {
        const users = await listSystemUsers();
        if (!active) return;
        const activeUsers = users.filter((item) => item.status === "active");
        const availableUsers = activeUsers.length ? activeUsers : users;
        setAppUsers(availableUsers);
        setAppUsersError("");

        if (!availableUsers.length) {
          setAppViewerUserId("");
          return;
        }

        const savedViewerId =
          typeof window === "undefined" ? "" : String(window.localStorage.getItem(APP_VIEWER_STORAGE_KEY) || "").trim();
        const selectedViewer = pickDefaultAppViewerUser(availableUsers, savedViewerId) || availableUsers[0];
        if (!selectedViewer) {
          setAppViewerUserId("");
          return;
        }

        setAppViewerUserId(selectedViewer.user_id);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(APP_VIEWER_STORAGE_KEY, String(selectedViewer.user_id || ""));
        }
      } catch (err) {
        if (!active) return;
        setAppUsers([]);
        setAppViewerUserId("");
        setAppUsersError(err?.message || "Falha ao carregar usuários para controle de acesso.");
      } finally {
        if (active) setAppUsersLoading(false);
      }
    }

    loadAppUsersContext();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadBirthdayAlerts() {
      if (!isSupabaseConfigured) {
        if (active) {
          setBirthdayAlerts([]);
          setBirthdayError("");
        }
        return;
      }

      try {
        const alerts = await listUpcomingBirthdays(7);
        if (!active) return;
        setBirthdayAlerts(alerts);
        setBirthdayError("");
      } catch (err) {
        if (!active) return;
        setBirthdayAlerts([]);
        setBirthdayError(err.message);
      }
    }

    loadBirthdayAlerts();
    const refreshTimer = window.setInterval(loadBirthdayAlerts, 10 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const appViewerUser = useMemo(
    () => appUsers.find((item) => String(item?.user_id || "").trim() === String(appViewerUserId || "").trim()) || null,
    [appUsers, appViewerUserId]
  );

  useEffect(() => {
    if (!appUsers.length) return;
    if (appViewerUser) return;
    const fallbackUser = pickDefaultAppViewerUser(appUsers) || appUsers[0];
    const fallbackUserId = String(fallbackUser?.user_id || "").trim();
    if (!fallbackUserId) return;
    setAppViewerUserId(fallbackUserId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(APP_VIEWER_STORAGE_KEY, fallbackUserId);
    }
  }, [appUsers, appViewerUser]);

  function hasAccessToModule(moduleId, requiredLevel = "read") {
    if (!appUsers.length) return true;
    return hasModulePermission(appViewerUser, moduleId, requiredLevel);
  }

  function notifyAccessDenied(message) {
    setSearchError(message || "Seu usuário não possui permissão para esta ação.");
    setSearchExecuted(true);
    setSearchLoading(false);
  }

  function ensureModuleAccess(moduleId, requiredLevel = "read", denyMessage = "") {
    if (hasAccessToModule(moduleId, requiredLevel)) return true;
    notifyAccessDenied(denyMessage || "Seu usuário não possui permissão para esta ação.");
    return false;
  }

  function canAccessSearchItem(item) {
    const moduleId = resolveSearchResultModule(item);
    if (!moduleId) return true;
    return hasAccessToModule(moduleId, "read");
  }

  const accessibleNavItems = useMemo(() => NAV_ITEMS.filter((item) => hasAccessToModule(item.id, "read")), [appUsers, appViewerUser]);
  const appUserInitials = useMemo(() => buildUserInitials(appViewerUser), [appViewerUser]);

  useEffect(() => {
    if (!accessibleNavItems.length) return;
    if (accessibleNavItems.some((item) => item.id === activeTab)) return;
    setActiveTab(accessibleNavItems[0].id);
  }, [accessibleNavItems, activeTab]);

  const activeModule = useMemo(() => {
    if (!hasAccessToModule(activeTab, "read")) {
      return (
        <section className="warning-box">
          <strong>Acesso restrito:</strong> seu usuário não possui permissão para abrir este módulo.
        </section>
      );
    }

    if (activeTab === "companies") {
      return (
        <CompaniesModule
          focusTarget={companiesFocusTarget}
          focusRequest={companiesFocusRequest}
          onRequestCreateCompany={handleRequestCreateCompany}
          prefillCompanyDraft={companiesPrefillDraft}
          prefillCompanyRequest={companiesPrefillRequest}
          editCompanyId={companiesEditCompanyId}
          editCompanyRequest={companiesEditRequest}
        />
      );
    }
    if (activeTab === "contacts") {
      return (
        <CompaniesModule
          focusTarget="contact"
          focusRequest={contactsFocusRequest}
          onRequestCreateCompany={handleRequestCreateCompany}
          editContactId={contactsEditContactId}
          editContactRequest={contactsEditRequest}
          editContactPayload={contactsEditPayload}
        />
      );
    }
    if (activeTab === "pipeline") {
      return (
        <PipelineModule
          onRequestCreateCompany={handleRequestCreateCompany}
          prefillCompanyDraft={pipelinePrefillDraft}
          prefillCompanyRequest={pipelinePrefillRequest}
        />
      );
    }
    if (activeTab === "hunter") return <HunterModule />;
    if (activeTab === "orders") return <OrdersModule />;
    if (activeTab === "reports") return <ReportsModule />;
    if (activeTab === "tasks") {
      return (
        <TasksModule
          onRequestCreateCompany={handleRequestCreateCompany}
          prefillCompanyDraft={tasksPrefillDraft}
          prefillCompanyRequest={tasksPrefillRequest}
        />
      );
    }
    if (activeTab === "service") return <ServiceModule onRequestCreateCompany={handleRequestCreateCompany} />;
    if (activeTab === "settings") return <SettingsModule />;
    return <DashboardModule />;
  }, [
    activeTab,
    appUsers,
    appViewerUser,
    companiesEditCompanyId,
    companiesEditRequest,
    companiesFocusRequest,
    companiesFocusTarget,
    companiesPrefillDraft,
    companiesPrefillRequest,
    contactsEditContactId,
    contactsEditPayload,
    contactsEditRequest,
    contactsFocusRequest,
    pipelinePrefillDraft,
    pipelinePrefillRequest,
    tasksPrefillDraft,
    tasksPrefillRequest
  ]);

  const activeMeta = PAGE_META[activeTab] || PAGE_META.dashboard;
  const activeNav = accessibleNavItems.find((item) => item.id === activeTab) || accessibleNavItems[0] || NAV_ITEMS[0];
  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
      }).format(new Date()),
    []
  );
  const birthdaySummary = useMemo(() => {
    const todayCount = birthdayAlerts.filter((item) => item.days_until === 0).length;
    return {
      total: birthdayAlerts.length,
      todayCount
    };
  }, [birthdayAlerts]);

  function formatBirthdayShort(dateValue) {
    if (!dateValue) return "--/--";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit"
    }).format(new Date(`${dateValue}T00:00:00`));
  }

  function closeSearchFocus() {
    setSearchFocused(false);
    setSearchKeyboardNavigating(false);
    setSearchKeyboardIndex(-1);
  }

  function focusGlobalSearchInput({ selectAll = true } = {}) {
    const input = searchInputRef.current;
    if (!input) return;
    input.focus();
    if (selectAll && typeof input.select === "function") {
      input.select();
    }
    setSearchFocused(true);
    setSearchKeyboardNavigating(false);
    setSearchKeyboardIndex(-1);
  }

  async function runGlobalSearch() {
    const term = globalSearch.trim();
    setSearchError("");
    setSearchExecuted(true);

    if (!term) {
      setSearchResults([]);
      return;
    }

    if (!isSupabaseConfigured) {
      setSearchError("Configure o Supabase para usar a busca global.");
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      const result = await searchGlobalRecords(term);
      setSearchResults((result || []).filter((item) => canAccessSearchItem(item)));
    } catch (err) {
      setSearchError(err.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSearchKeyboardNavigating(false);
    runGlobalSearch();
  }

  function closeSearchCustomerHistoryModal() {
    setSearchCustomerHistoryModal((prev) => ({
      ...prev,
      open: false
    }));
  }

  function handleSearchRequestEditCompany(companyId) {
    const normalizedCompanyId = String(companyId || "").trim();
    if (!normalizedCompanyId) return;
    if (!ensureModuleAccess("companies", "edit", "Seu usuário não possui permissão para editar empresas.")) return;

    closeSearchCustomerHistoryModal();
    setCompaniesFocusTarget("company");
    setCompaniesFocusRequest((previous) => previous + 1);
    setCompaniesEditCompanyId(normalizedCompanyId);
    setCompaniesEditRequest((previous) => previous + 1);
    setActiveTab("companies");
  }

  function handleSearchRequestEditContact(contactId, item = null) {
    const normalizedContactId = String(contactId || "").trim();
    if (!normalizedContactId) return;
    if (!ensureModuleAccess("contacts", "edit", "Seu usuário não possui permissão para editar contatos.")) return;

    const payload = item
      ? {
          id: normalizedContactId,
          company_id: String(item.company_id || "").trim(),
          full_name: item.contact_name || item.title || "",
          email: item.contact_email || "",
          role_title: "",
          whatsapp: "",
          birth_date: ""
        }
      : null;

    closeSearchCustomerHistoryModal();
    setContactsFocusRequest((previous) => previous + 1);
    setContactsEditContactId(normalizedContactId);
    setContactsEditPayload(payload);
    setContactsEditRequest((previous) => previous + 1);
    setActiveTab("contacts");
  }

  function resolveSearchContactId(item) {
    const explicitContactId = String(item?.contact_id || "").trim();
    if (explicitContactId) return explicitContactId;
    const prefixedId = String(item?.id || "").trim();
    if (prefixedId.startsWith("contact-")) return prefixedId.slice("contact-".length);
    return "";
  }

  function resolveSearchCompanyContext(item) {
    const normalizedCompanyId = String(item?.company_id || "").trim();
    if (!normalizedCompanyId) return null;
    const companyName = String(item?.company_name || item?.title || "").trim();
    return {
      company_id: normalizedCompanyId,
      trade_name: companyName || "Empresa",
      search_term: companyName || ""
    };
  }

  function canQuickEditSearchItem(item) {
    if (item?.entity_type === "company") {
      return hasAccessToModule("companies", "edit") && Boolean(String(item?.company_id || "").trim());
    }
    if (item?.entity_type === "contact") {
      return hasAccessToModule("contacts", "edit") && Boolean(resolveSearchContactId(item));
    }
    return false;
  }

  function canQuickCreateFromSearch(item) {
    return hasAccessToModule("tasks", "edit") || hasAccessToModule("pipeline", "edit")
      ? Boolean(resolveSearchCompanyContext(item))
      : false;
  }

  function canQuickDeleteSearchItem(item) {
    if (item?.entity_type !== "company") return false;
    return hasAccessToModule("companies", "admin") && Boolean(String(item?.company_id || "").trim());
  }

  function quickEditLabel(item) {
    if (item?.entity_type === "company") return "Editar empresa";
    if (item?.entity_type === "contact") return "Editar contato";
    return "Editar";
  }

  function handleQuickEditFromSearch(item) {
    if (item?.entity_type === "company") {
      const companyId = String(item?.company_id || "").trim();
      if (!companyId) {
        setSearchError("Este registro nao possui empresa vinculada para edicao.");
        return;
      }
      setSearchError("");
      handleSearchRequestEditCompany(companyId);
      return;
    }

    if (item?.entity_type === "contact") {
      const contactId = resolveSearchContactId(item);
      if (!contactId) {
        setSearchError("Nao foi possivel identificar este contato para edicao.");
        return;
      }
      setSearchError("");
      handleSearchRequestEditContact(contactId, item);
      return;
    }
  }

  function openTaskQuickCreateFromSearch(item) {
    if (!ensureModuleAccess("tasks", "edit", "Seu usuário não possui permissão para criar tarefas.")) return;
    const companyContext = resolveSearchCompanyContext(item);
    if (!companyContext) {
      setSearchError("Este resultado nao possui empresa vinculada para criar tarefa.");
      return;
    }

    setSearchError("");
    setTasksPrefillDraft(companyContext);
    setTasksPrefillRequest((previous) => previous + 1);
    setActiveTab("tasks");
  }

  function openPipelineQuickCreateFromSearch(item) {
    if (!ensureModuleAccess("pipeline", "edit", "Seu usuário não possui permissão para criar oportunidades.")) return;
    const companyContext = resolveSearchCompanyContext(item);
    if (!companyContext) {
      setSearchError("Este resultado nao possui empresa vinculada para criar oportunidade.");
      return;
    }

    setSearchError("");
    setPipelinePrefillDraft(companyContext);
    setPipelinePrefillRequest((previous) => previous + 1);
    setActiveTab("pipeline");
  }

  async function handleQuickDeleteFromSearch(item) {
    if (!ensureModuleAccess("companies", "admin", "Seu usuário não possui permissão para excluir empresas.")) return;
    const companyId = String(item?.company_id || "").trim();
    if (!companyId) {
      setSearchError("Nao foi possivel identificar a empresa para exclusao.");
      return;
    }

    const confirmed = await confirmStrongDelete({
      entityLabel: "a empresa",
      itemLabel: item?.company_name || item?.title || "Empresa"
    });
    if (!confirmed) return;

    setSearchError("");
    setDeletingSearchCompanyId(companyId);
    try {
      await deleteCompany(companyId);
      setSearchResults((previous) => previous.filter((entry) => String(entry?.company_id || "") !== companyId));
      await runGlobalSearch();
    } catch (err) {
      setSearchError(err.message || "Falha ao excluir empresa.");
    } finally {
      setDeletingSearchCompanyId("");
    }
  }

  function openCustomerHistoryFromSearch(item) {
    if (!ensureModuleAccess("companies", "read", "Seu usuário não possui permissão para acessar o histórico do cliente.")) return false;
    const companyId = String(item?.company_id || "").trim();
    if (!companyId) {
      if (item?.entity_type === "contact") {
        const contactId = resolveSearchContactId(item);
        if (!contactId) {
          setSearchError("Nao foi possivel identificar este contato para edicao.");
          return false;
        }
        setSearchError("");
        handleSearchRequestEditContact(contactId, item);
        return true;
      }

      setSearchError("Este contato ainda nao esta vinculado a uma empresa para abrir o historico 360.");
      return false;
    }

    setSearchError("");
    setSearchCustomerHistoryModal({
      open: true,
      companyId,
      companyName: item.company_name || item.title || "Cliente"
    });
    return true;
  }

  function handleSearchItemAction(item, { fromSuggestion = false } = {}) {
    if (!item) return;
    if (!canAccessSearchItem(item)) {
      notifyAccessDenied("Seu usuário não possui permissão para abrir este resultado.");
      return;
    }

    if (fromSuggestion) {
      closeSearchFocus();
      setSearchExecuted(true);
      setSearchError("");
      setSearchLoading(false);
      setSearchResults([item]);
    }

    if (item.entity_type === "company" || item.entity_type === "contact") {
      openCustomerHistoryFromSearch(item);
      return;
    }

    if (item.tab) {
      if (!ensureModuleAccess(item.tab, "read", "Seu usuário não possui permissão para abrir este módulo.")) return;
      setActiveTab(item.tab);
    }
  }

  function openCompanyQuickAction(target) {
    if (target === "contact") {
      if (!ensureModuleAccess("contacts", "edit", "Seu usuário não possui permissão para criar contatos.")) return;
      setContactsFocusRequest((previous) => previous + 1);
      setActiveTab("contacts");
      return;
    }
    if (!ensureModuleAccess("companies", "edit", "Seu usuário não possui permissão para criar empresas.")) return;
    setCompaniesFocusTarget(target);
    setCompaniesFocusRequest((previous) => previous + 1);
    setActiveTab("companies");
  }

  function openPipelineQuickAction() {
    if (!ensureModuleAccess("pipeline", "edit", "Seu usuário não possui permissão para criar oportunidades.")) return;
    setPipelinePrefillDraft(null);
    setPipelinePrefillRequest((previous) => previous + 1);
    setActiveTab("pipeline");
  }

  function openTasksQuickAction() {
    if (!ensureModuleAccess("tasks", "edit", "Seu usuário não possui permissão para criar tarefas.")) return;
    setTasksPrefillDraft(null);
    setTasksPrefillRequest((previous) => previous + 1);
    setActiveTab("tasks");
  }

  function openServiceQuickAction() {
    if (!ensureModuleAccess("service", "edit", "Seu usuário não possui permissão para abrir chamados.")) return;
    setActiveTab("service");
  }

  function handleRequestCreateCompany(prefill = null) {
    if (!ensureModuleAccess("companies", "edit", "Seu usuário não possui permissão para criar empresas.")) return;
    const nextDraft = prefill && typeof prefill === "object" ? prefill : null;
    setCompaniesFocusTarget("company");
    setCompaniesFocusRequest((previous) => previous + 1);
    setCompaniesPrefillDraft(nextDraft);
    setCompaniesPrefillRequest((previous) => previous + 1);
    setActiveTab("companies");
  }

  function selectSuggestion(item) {
    handleSearchItemAction(item, { fromSuggestion: true });
  }

  const hasTypedSearchTerm = globalSearch.trim().length >= 2;
  const quickSearchActions = [
    hasAccessToModule("companies", "edit")
      ? {
          id: "quick-create-company",
          type: "Atalho",
          title: "Nova Empresa",
          subtitle: "Abrir cadastro de empresa.",
          onSelect: () => {
            openCompanyQuickAction("company");
            closeSearchFocus();
          }
        }
      : null,
    hasAccessToModule("contacts", "edit")
      ? {
          id: "quick-create-contact",
          type: "Atalho",
          title: "Novo Contato",
          subtitle: "Abrir cadastro de contato.",
          onSelect: () => {
            openCompanyQuickAction("contact");
            closeSearchFocus();
          }
        }
      : null,
    hasAccessToModule("pipeline", "edit")
      ? {
          id: "quick-create-pipeline",
          type: "Atalho",
          title: "Novo Negócio",
          subtitle: "Abrir Pipeline para cadastrar oportunidade.",
          onSelect: () => {
            openPipelineQuickAction();
            closeSearchFocus();
          }
        }
      : null,
    hasAccessToModule("tasks", "edit")
      ? {
          id: "quick-create-task",
          type: "Atalho",
          title: "Nova Tarefa",
          subtitle: "Abrir Agenda para nova tarefa.",
          onSelect: () => {
            openTasksQuickAction();
            closeSearchFocus();
          }
        }
      : null,
    hasAccessToModule("service", "edit")
      ? {
          id: "quick-create-service",
          type: "Atalho",
          title: "Novo Chamado",
          subtitle: "Abrir Assistência para registrar chamado.",
          onSelect: () => {
            openServiceQuickAction();
            closeSearchFocus();
          }
        }
      : null,
    hasAccessToModule("reports", "read")
      ? {
          id: "quick-open-reports",
          type: "Atalho",
          title: "Ir para Relatórios",
          subtitle: "Abrir extração e exportação de dados.",
          onSelect: () => {
            setActiveTab("reports");
            closeSearchFocus();
          }
        }
      : null
  ].filter(Boolean);
  const searchDropdownItems = hasTypedSearchTerm
    ? searchSuggestions.map((item) => ({
        id: `suggestion-${item.type}-${item.id}`,
        type: item.type,
        title: item.title,
        subtitle: item.subtitle,
        onSelect: () => selectSuggestion(item)
      }))
    : quickSearchActions;

  function executeSearchDropdownItem(item) {
    if (!item || typeof item.onSelect !== "function") return;
    item.onSelect();
  }

  function handleSearchInputKeyDown(event) {
    if (event.key === "Escape" && searchFocused) {
      event.preventDefault();
      closeSearchFocus();
      return;
    }

    if (!searchFocused || !searchDropdownItems.length) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setSearchKeyboardNavigating(true);
      setSearchKeyboardIndex((previous) => {
        if (previous < 0) {
          return direction > 0 ? 0 : searchDropdownItems.length - 1;
        }
        const currentIndex = previous;
        return (currentIndex + direction + searchDropdownItems.length) % searchDropdownItems.length;
      });
      return;
    }

    if (event.key === "Enter" && searchKeyboardNavigating && searchKeyboardIndex >= 0) {
      event.preventDefault();
      executeSearchDropdownItem(searchDropdownItems[searchKeyboardIndex]);
    }
  }

  useEffect(() => {
    if (!searchFocused) {
      setSearchKeyboardIndex(-1);
      setSearchKeyboardNavigating(false);
      return;
    }
    if (!searchDropdownItems.length) {
      setSearchKeyboardIndex(-1);
      return;
    }
    setSearchKeyboardIndex((previous) => {
      if (previous >= 0 && previous < searchDropdownItems.length) return previous;
      return 0;
    });
  }, [searchFocused, searchDropdownItems.length]);

  useEffect(() => {
    setSearchKeyboardNavigating(false);
  }, [globalSearch]);

  useEffect(() => {
    let active = true;
    const term = globalSearch.trim();

    if (!isSupabaseConfigured || term.length < 2) {
      setSearchSuggestions([]);
      setSuggestionsLoading(false);
      return () => {
        active = false;
      };
    }

    const timer = setTimeout(async () => {
      try {
        setSuggestionsLoading(true);
        const data = await searchGlobalRecords(term);
        if (!active) return;
        setSearchSuggestions((data || []).filter((item) => canAccessSearchItem(item)).slice(0, 8));
      } catch (_err) {
        if (!active) return;
        setSearchSuggestions([]);
      } finally {
        if (active) setSuggestionsLoading(false);
      }
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [appUsers, appViewerUser, globalSearch]);

  useEffect(() => {
    function handleGlobalShortcuts(event) {
      const key = String(event.key || "").toLowerCase();
      const isSearchShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && key === "k";
      if (isSearchShortcut) {
        event.preventDefault();
        focusGlobalSearchInput({ selectAll: true });
        return;
      }

      if (event.key === "Escape" && searchFocused) {
        closeSearchFocus();
      }
    }

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [searchFocused]);

  return (
    <div className="crm-layout">
      <aside className="crm-sidebar">
        <div className="crm-brand">
          <div className="crm-brand-mark">CRM</div>
          <div>
            <p className="crm-brand-kicker">HubSpot-style</p>
            <strong>Revenue Command</strong>
          </div>
        </div>

        <nav className="crm-nav">
          {accessibleNavItems.map((item) => (
            <button
              key={item.id}
              className={item.id === activeTab ? "crm-nav-btn active" : "crm-nav-btn"}
              onClick={() => {
                if (item.id === "contacts") {
                  setContactsFocusRequest((previous) => previous + 1);
                }
                setActiveTab(item.id);
              }}
            >
              <span className="crm-nav-icon">{item.icon}</span>
              <span className="crm-nav-copy">
                <span className="crm-nav-label">{item.label}</span>
                <span className="crm-nav-hint">{item.hint}</span>
              </span>
            </button>
          ))}
          {!accessibleNavItems.length ? (
            <p className="crm-sidebar-note">Nenhum módulo habilitado para este usuário.</p>
          ) : null}
        </nav>

        <div className="crm-sidebar-footer">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "Trocar para claro" : "Trocar para escuro"}
          </button>
          <span className="crm-sidebar-note">Workspace comercial integrado</span>
        </div>
      </aside>

      <div className="crm-main">
        <header className="crm-topbar">
          <form className="crm-search" onSubmit={handleSearchSubmit}>
            <div className="crm-search-meta">
              <span>Busca Global</span>
            </div>
            <div className="crm-search-row">
              <input
                ref={searchInputRef}
                value={globalSearch}
                onChange={(event) => {
                  setGlobalSearch(event.target.value);
                  setSearchKeyboardNavigating(false);
                }}
                onFocus={() => {
                  setSearchFocused(true);
                  setSearchKeyboardNavigating(false);
                }}
                onBlur={() => {
                  window.setTimeout(() => closeSearchFocus(), 120);
                }}
                onKeyDown={handleSearchInputKeyDown}
                placeholder="Pesquisar empresas, contatos, negócios, pedidos e chamados..."
              />
              <button type="submit" className="crm-search-btn" aria-label="Pesquisar">
                🔍
              </button>
            </div>

            {searchFocused ? (
              <div className="search-suggestions">
                <p className="search-suggestions-context">{hasTypedSearchTerm ? "Sugestões de busca" : "Ações rápidas"}</p>
                {hasTypedSearchTerm && suggestionsLoading ? <p className="muted">Buscando sugestões...</p> : null}
                {hasTypedSearchTerm && !suggestionsLoading && !searchDropdownItems.length ? <p className="muted">Sem sugestões.</p> : null}
                {(!hasTypedSearchTerm || !suggestionsLoading) && searchDropdownItems.length ? (
                  <ul className="search-suggestions-list">
                    {searchDropdownItems.map((item, index) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={searchKeyboardIndex === index ? "search-suggestion-btn is-active" : "search-suggestion-btn"}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => {
                            setSearchKeyboardIndex(index);
                            setSearchKeyboardNavigating(true);
                          }}
                          onFocus={() => {
                            setSearchKeyboardIndex(index);
                            setSearchKeyboardNavigating(true);
                          }}
                          onClick={() => executeSearchDropdownItem(item)}
                        >
                          <span className="search-result-type">{item.type}</span>
                          <strong>{item.title}</strong>
                          <span>{item.subtitle}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </form>
          <div className="crm-topbar-actions">
            {hasAccessToModule("pipeline", "edit") ? (
              <button type="button" className="btn-ghost" onClick={openPipelineQuickAction}>
                + Novo Negócio
              </button>
            ) : null}
            {hasAccessToModule("tasks", "edit") ? (
              <button type="button" className="btn-ghost" onClick={openTasksQuickAction}>
                + Nova Tarefa
              </button>
            ) : null}
            {hasAccessToModule("contacts", "edit") ? (
              <button type="button" className="btn-ghost" onClick={() => openCompanyQuickAction("contact")}>
                + Novo Contato
              </button>
            ) : null}
            {hasAccessToModule("companies", "edit") ? (
              <button type="button" className="btn-primary" onClick={() => openCompanyQuickAction("company")}>
                + Nova Empresa
              </button>
            ) : null}
            {appUsers.length ? (
              <label className="crm-viewer-select">
                <span>Usuário ativo</span>
                <select
                  value={appViewerUserId}
                  onChange={(event) => {
                    const nextUserId = String(event.target.value || "").trim();
                    setAppViewerUserId(nextUserId);
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem(APP_VIEWER_STORAGE_KEY, nextUserId);
                      window.localStorage.setItem("crm.pipeline.viewer-user-id.v1", nextUserId);
                      window.localStorage.setItem("crm.hunter.viewer-user-id.v1", nextUserId);
                      window.localStorage.setItem("crm.tasks.creator-user-id.v1", nextUserId);
                    }
                  }}
                  disabled={appUsersLoading}
                >
                  {appUsers.map((user) => (
                    <option key={user.user_id || user.email} value={user.user_id}>
                      {(user.full_name || user.email || "Usuário").trim()} ({String(user.role || "sales").toUpperCase()})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <span className="crm-user-pill">{appUserInitials}</span>
          </div>
        </header>

        {appUsersError ? <section className="warning-box">{appUsersError}</section> : null}

        {!isSupabaseConfigured ? (
          <section className="warning-box">
            <strong>Configuração pendente:</strong> defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no arquivo `.env`.
          </section>
        ) : null}

        {isSupabaseConfigured && (birthdaySummary.total > 0 || birthdayError) ? (
          <section className="birthday-alert-box">
            <div className="birthday-alert-header">
              <strong>Alertas de aniversário</strong>
              <button type="button" className="btn-ghost btn-table-action" onClick={() => openCompanyQuickAction("contact")}>
                Ver contatos
              </button>
            </div>

            {birthdayError ? <p className="error-text">{birthdayError}</p> : null}

            {!birthdayError ? (
              <p className="birthday-alert-summary">
                {birthdaySummary.todayCount
                  ? `${birthdaySummary.todayCount} contato(s) fazem aniversário hoje`
                  : `Próximos aniversários (${birthdaySummary.total})`}
              </p>
            ) : null}

            {!birthdayError && birthdayAlerts.length ? (
              <ul className="birthday-alert-list">
                {birthdayAlerts.slice(0, 6).map((item) => {
                  const whatsappUrl = buildBirthdayWhatsAppUrl(item);
                  return (
                    <li key={item.id} className="birthday-alert-item">
                      <div>
                        {whatsappUrl ? (
                          <a
                            className="birthday-alert-name-link"
                            href={whatsappUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Clique para abrir o WhatsApp com mensagem pronta"
                          >
                            {item.full_name}
                          </a>
                        ) : (
                          <p className="birthday-alert-name">{item.full_name}</p>
                        )}
                        <p className="birthday-alert-company">{item.company_name}</p>
                      </div>
                      <span className="birthday-alert-date">
                        {item.days_until === 0 ? "Hoje" : `Em ${item.days_until} dia(s) · ${formatBirthdayShort(item.next_birthday)}`}
                        {item.age_turning ? ` · ${item.age_turning} anos` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        ) : null}

        {searchExecuted ? (
          <section className="search-results-panel">
            <div className="search-results-header">
              <strong>Resultados da busca</strong>
              <span>Termo: {globalSearch || "-"}</span>
            </div>

            {searchLoading ? <p className="muted">Pesquisando...</p> : null}
            {searchError ? <p className="error-text">{searchError}</p> : null}

            {!searchLoading && !searchError && !searchResults.length ? (
              <p className="muted">Nenhum resultado encontrado.</p>
            ) : null}

            {!searchLoading && !searchError && searchResults.length ? (
              <ul className="search-results-list">
                {searchResults.map((item) => (
                  <li key={`${item.type}-${item.id}`} className="search-result-item">
                    <button type="button" className="search-result-btn" onClick={() => handleSearchItemAction(item)}>
                      <span className="search-result-type">{item.type}</span>
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                    </button>
                    <div className="search-result-actions">
                      {canQuickEditSearchItem(item) ? (
                        <button type="button" className="btn-primary btn-table-action search-result-edit-btn" onClick={() => handleQuickEditFromSearch(item)}>
                          {quickEditLabel(item)}
                        </button>
                      ) : null}
                      {canQuickCreateFromSearch(item) ? (
                        <>
                          {hasAccessToModule("tasks", "edit") ? (
                            <button
                              type="button"
                              className="btn-ghost btn-table-action search-result-action-btn"
                              onClick={() => openTaskQuickCreateFromSearch(item)}
                            >
                              Nova Tarefa
                            </button>
                          ) : null}
                          {hasAccessToModule("pipeline", "edit") ? (
                            <button
                              type="button"
                              className="btn-ghost btn-table-action search-result-action-btn"
                              onClick={() => openPipelineQuickCreateFromSearch(item)}
                            >
                              Novo Negócio
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {canQuickDeleteSearchItem(item) ? (
                        <button
                          type="button"
                          className="btn-ghost btn-table-action search-result-action-btn"
                          onClick={() => handleQuickDeleteFromSearch(item)}
                          disabled={deletingSearchCompanyId === String(item?.company_id || "").trim()}
                        >
                          {deletingSearchCompanyId === String(item?.company_id || "").trim() ? "Excluindo..." : "Excluir"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="crm-content">
          <header className="crm-page-header">
            <div>
              <p className="crm-page-kicker">{activeMeta.kicker}</p>
              <h1>{activeMeta.title}</h1>
              <p>{activeMeta.description}</p>
            </div>
            <div className="crm-page-side">
              <span>{todayLabel}</span>
              <strong>{activeNav.label}</strong>
            </div>
          </header>

          <main>{activeModule}</main>
        </section>

        <CustomerHistoryModal
          open={searchCustomerHistoryModal.open}
          companyId={searchCustomerHistoryModal.companyId}
          companyName={searchCustomerHistoryModal.companyName}
          onClose={closeSearchCustomerHistoryModal}
          onRequestEditCompany={handleSearchRequestEditCompany}
        />
      </div>
    </div>
  );
}
