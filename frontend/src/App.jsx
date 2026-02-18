import { useMemo, useState } from "react";
import { isSupabaseConfigured } from "./lib/supabase";
import DashboardModule from "./modules/DashboardModule";
import CompaniesModule from "./modules/CompaniesModule";
import PipelineModule from "./modules/PipelineModule";
import ServiceModule from "./modules/ServiceModule";
import OrdersModule from "./modules/OrdersModule";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "companies", label: "Empresas" },
  { id: "pipeline", label: "Pipeline" },
  { id: "orders", label: "Pedidos" },
  { id: "service", label: "Assistência" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const activeModule = useMemo(() => {
    if (activeTab === "companies") return <CompaniesModule />;
    if (activeTab === "pipeline") return <PipelineModule />;
    if (activeTab === "orders") return <OrdersModule />;
    if (activeTab === "service") return <ServiceModule />;
    return <DashboardModule />;
  }, [activeTab]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="hero-overline">Revenue OS</p>
          <h1>CRM Revenue Architecture</h1>
          <p>Design system premium com operação comercial, pedidos e assistência no mesmo fluxo.</p>
        </div>
        <div className="hero-stats">
          <span className="hero-chip">Apple-grade clarity</span>
          <span className="hero-chip">Tesla-like speed</span>
          <span className="hero-chip">Starlink resilience</span>
        </div>
      </header>

      {!isSupabaseConfigured ? (
        <section className="warning-box">
          <strong>Configuração pendente:</strong> defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no arquivo `.env`.
        </section>
      ) : null}

      <nav className="tabbar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === activeTab ? "tab active" : "tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main>{activeModule}</main>
    </div>
  );
}
