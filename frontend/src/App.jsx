import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "./lib/supabase";
import { listUpcomingBirthdays, searchGlobalRecords } from "./lib/revenueApi";
import DashboardModule from "./modules/DashboardModule";
import CompaniesModule from "./modules/CompaniesModule";
import PipelineModule from "./modules/PipelineModule";
import ServiceModule from "./modules/ServiceModule";
import OrdersModule from "./modules/OrdersModule";
import TasksModule from "./modules/TasksModule";

const THEME_STORAGE_KEY = "crm-theme";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", hint: "Indicadores", icon: "◩" },
  { id: "tasks", label: "Agenda", hint: "Fluxo de tarefas", icon: "◪" },
  { id: "companies", label: "Empresas", hint: "Contas e CNPJ", icon: "◎" },
  { id: "pipeline", label: "Pipeline", hint: "Negócios", icon: "◧" },
  { id: "orders", label: "Pedidos", hint: "Receita", icon: "◫" },
  { id: "service", label: "Assistência", hint: "SLA e suporte", icon: "◨" }
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
  pipeline: {
    kicker: "Vendas",
    title: "Pipeline Comercial",
    description: "Evolua negócios por etapa com arrastar e soltar, mantendo processo previsível e auditável."
  },
  orders: {
    kicker: "Revenue Operations",
    title: "Pedidos de Venda",
    description: "Controle pedidos de equipamentos, suprimentos e serviços com rastreabilidade comercial."
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
  }
};

function cleanPhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeWhatsAppNumber(value) {
  const digits = cleanPhoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

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
  const normalizedNumber = normalizeWhatsAppNumber(alertItem.whatsapp);
  if (!normalizedNumber) return "";
  const text = encodeURIComponent(birthdayWhatsAppMessage(alertItem));
  return `https://wa.me/${normalizedNumber}?text=${text}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [companiesFocusTarget, setCompaniesFocusTarget] = useState("company");
  const [companiesFocusRequest, setCompaniesFocusRequest] = useState(0);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchExecuted, setSearchExecuted] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [birthdayAlerts, setBirthdayAlerts] = useState([]);
  const [birthdayError, setBirthdayError] = useState("");
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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

  const activeModule = useMemo(() => {
    if (activeTab === "companies") {
      return <CompaniesModule focusTarget={companiesFocusTarget} focusRequest={companiesFocusRequest} />;
    }
    if (activeTab === "pipeline") return <PipelineModule />;
    if (activeTab === "orders") return <OrdersModule />;
    if (activeTab === "tasks") return <TasksModule />;
    if (activeTab === "service") return <ServiceModule />;
    return <DashboardModule />;
  }, [activeTab, companiesFocusRequest, companiesFocusTarget]);

  const activeMeta = PAGE_META[activeTab] || PAGE_META.dashboard;
  const activeNav = NAV_ITEMS.find((item) => item.id === activeTab) || NAV_ITEMS[0];
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
      setSearchResults(result);
    } catch (err) {
      setSearchError(err.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    runGlobalSearch();
  }

  function openSearchResult(tab) {
    setActiveTab(tab);
  }

  function openCompanyQuickAction(target) {
    setCompaniesFocusTarget(target);
    setCompaniesFocusRequest((previous) => previous + 1);
    setActiveTab("companies");
  }

  function selectSuggestion(item) {
    setSearchFocused(false);
    setActiveTab(item.tab);
    setSearchExecuted(true);
    setSearchError("");
    setSearchLoading(false);
    setSearchResults([item]);
  }

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
        setSearchSuggestions(data.slice(0, 8));
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
  }, [globalSearch]);

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
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={item.id === activeTab ? "crm-nav-btn active" : "crm-nav-btn"}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="crm-nav-icon">{item.icon}</span>
              <span className="crm-nav-copy">
                <span className="crm-nav-label">{item.label}</span>
                <span className="crm-nav-hint">{item.hint}</span>
              </span>
            </button>
          ))}
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
            <span>Busca Global</span>
            <div className="crm-search-row">
              <input
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => {
                  window.setTimeout(() => setSearchFocused(false), 120);
                }}
                placeholder="Pesquisar empresas, contatos, negócios, pedidos e chamados..."
              />
              <button type="submit" className="crm-search-btn" aria-label="Pesquisar">
                🔍
              </button>
            </div>

            {searchFocused && globalSearch.trim().length >= 2 ? (
              <div className="search-suggestions">
                {suggestionsLoading ? <p className="muted">Buscando sugestões...</p> : null}
                {!suggestionsLoading && !searchSuggestions.length ? <p className="muted">Sem sugestões.</p> : null}
                {!suggestionsLoading && searchSuggestions.length ? (
                  <ul className="search-suggestions-list">
                    {searchSuggestions.map((item) => (
                      <li key={`suggestion-${item.type}-${item.id}`}>
                        <button
                          type="button"
                          className="search-suggestion-btn"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectSuggestion(item)}
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
            <button type="button" className="btn-ghost" onClick={() => setActiveTab("pipeline")}>
              + Novo Negócio
            </button>
            <button type="button" className="btn-ghost" onClick={() => setActiveTab("tasks")}>
              + Nova Tarefa
            </button>
            <button type="button" className="btn-ghost" onClick={() => openCompanyQuickAction("contact")}>
              + Novo Contato
            </button>
            <button type="button" className="btn-primary" onClick={() => openCompanyQuickAction("company")}>
              + Nova Empresa
            </button>
            <span className="crm-user-pill">AS</span>
          </div>
        </header>

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
                  <li key={`${item.type}-${item.id}`}>
                    <button type="button" className="search-result-btn" onClick={() => openSearchResult(item.tab)}>
                      <span className="search-result-type">{item.type}</span>
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                    </button>
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
      </div>
    </div>
  );
}
