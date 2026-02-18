import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "./lib/supabase";
import { searchGlobalRecords } from "./lib/revenueApi";
import DashboardModule from "./modules/DashboardModule";
import CompaniesModule from "./modules/CompaniesModule";
import PipelineModule from "./modules/PipelineModule";
import ServiceModule from "./modules/ServiceModule";
import OrdersModule from "./modules/OrdersModule";

const THEME_STORAGE_KEY = "crm-theme";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", hint: "Indicadores", icon: "◩" },
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
  service: {
    kicker: "Pós-venda",
    title: "Assistência Técnica",
    description: "Centralize corretivas, preventivas e SLA com visão integrada ao histórico do cliente."
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchExecuted, setSearchExecuted] = useState(false);
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

  const activeModule = useMemo(() => {
    if (activeTab === "companies") return <CompaniesModule />;
    if (activeTab === "pipeline") return <PipelineModule />;
    if (activeTab === "orders") return <OrdersModule />;
    if (activeTab === "service") return <ServiceModule />;
    return <DashboardModule />;
  }, [activeTab]);

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
                placeholder="Pesquisar empresas, contatos, negócios, pedidos e chamados..."
              />
              <button type="submit" className="crm-search-btn" aria-label="Pesquisar">
                🔍
              </button>
            </div>
          </form>
          <div className="crm-topbar-actions">
            <button type="button" className="btn-ghost" onClick={() => setActiveTab("pipeline")}>
              + Novo Negócio
            </button>
            <button type="button" className="btn-primary" onClick={() => setActiveTab("companies")}>
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
                  <li key={item.id}>
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
