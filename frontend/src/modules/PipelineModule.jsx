import { useEffect, useState } from "react";
import { createOpportunity, listCompanyOptions, listOpportunities } from "../lib/revenueApi";

const STAGES = ["lead", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"];

function brl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

export default function PipelineModule() {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    company_id: "",
    title: "",
    stage: "lead",
    status: "open",
    estimated_value: "",
    expected_close_date: ""
  });

  async function load() {
    setError("");
    try {
      const [opps, companiesData] = await Promise.all([listOpportunities(), listCompanyOptions()]);
      setItems(opps);
      setCompanies(companiesData);
      if (!form.company_id && companiesData.length) {
        setForm((prev) => ({ ...prev, company_id: companiesData[0].id }));
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
      await createOpportunity({
        company_id: form.company_id,
        title: form.title,
        stage: form.stage,
        status: form.status,
        estimated_value: Number(form.estimated_value || 0),
        expected_close_date: form.expected_close_date || null
      });
      setForm((prev) => ({ ...prev, title: "", estimated_value: "", expected_close_date: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="module two-col">
      <article className="panel">
        <h2>Pipeline Comercial</h2>
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
          <input
            required
            placeholder="Título da oportunidade"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Valor estimado"
            value={form.estimated_value}
            onChange={(e) => setForm((prev) => ({ ...prev, estimated_value: e.target.value }))}
          />
          <select value={form.stage} onChange={(e) => setForm((prev) => ({ ...prev, stage: e.target.value }))}>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={form.expected_close_date}
            onChange={(e) => setForm((prev) => ({ ...prev, expected_close_date: e.target.value }))}
          />
          <button type="submit" className="btn-primary">Salvar oportunidade</button>
        </form>
      </article>

      <article className="panel">
        <h3>Oportunidades recentes</h3>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Título</th>
                <th>Etapa</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.companies?.trade_name || "-"}</td>
                  <td>{item.title}</td>
                  <td>{item.stage}</td>
                  <td>{brl(item.estimated_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
