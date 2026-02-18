import { useEffect, useState } from "react";
import { createTicket, listCompanyOptions, listTickets } from "../lib/revenueApi";

export default function ServiceModule() {
  const [tickets, setTickets] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    company_id: "",
    ticket_type: "corrective",
    priority: "medium",
    status: "open",
    description: ""
  });

  async function load() {
    setError("");
    try {
      const [ticketData, companyData] = await Promise.all([listTickets(), listCompanyOptions()]);
      setTickets(ticketData);
      setCompanies(companyData);
      if (!form.company_id && companyData.length) {
        setForm((prev) => ({ ...prev, company_id: companyData[0].id }));
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
      await createTicket({
        company_id: form.company_id,
        ticket_type: form.ticket_type,
        priority: form.priority,
        status: form.status,
        description: form.description,
        opened_at: new Date().toISOString()
      });
      setForm((prev) => ({ ...prev, description: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="module two-col">
      <article className="panel">
        <h2>Assistência Técnica</h2>
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
          <select value={form.ticket_type} onChange={(e) => setForm((prev) => ({ ...prev, ticket_type: e.target.value }))}>
            <option value="corrective">Corretiva</option>
            <option value="preventive">Preventiva</option>
          </select>
          <select value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </select>
          <textarea
            required
            placeholder="Descrição técnica"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <button type="submit" className="btn-primary">Abrir chamado</button>
        </form>
      </article>

      <article className="panel">
        <h3>Chamados recentes</h3>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Tipo</th>
                <th>Prioridade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>{ticket.companies?.trade_name || "-"}</td>
                  <td>{ticket.ticket_type}</td>
                  <td>{ticket.priority}</td>
                  <td>{ticket.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
