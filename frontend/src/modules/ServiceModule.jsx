import { useEffect, useMemo, useState } from "react";
import { createTicket, deleteTicket, listCompanyOptions, listTickets } from "../lib/revenueApi";
import { confirmStrongDelete } from "../lib/confirmDelete";

const SERVICE_FORM_DEFAULTS_STORAGE_KEY = "crm.service.form-defaults.v1";

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return String(value || "");
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function normalizeServiceFormDefaults(rawDefaults = {}) {
  const safeType = rawDefaults.ticket_type === "preventive" ? "preventive" : "corrective";
  const safePriority = ["low", "medium", "high", "critical"].includes(String(rawDefaults.priority))
    ? String(rawDefaults.priority)
    : "medium";
  return {
    ticket_type: safeType,
    priority: safePriority
  };
}

function readServiceFormDefaults() {
  if (typeof window === "undefined") return normalizeServiceFormDefaults();
  try {
    const raw = window.localStorage.getItem(SERVICE_FORM_DEFAULTS_STORAGE_KEY);
    if (!raw) return normalizeServiceFormDefaults();
    return normalizeServiceFormDefaults(JSON.parse(raw));
  } catch {
    return normalizeServiceFormDefaults();
  }
}

export default function ServiceModule({ onRequestCreateCompany = null }) {
  const initialDefaults = useMemo(() => readServiceFormDefaults(), []);
  const [tickets, setTickets] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingTicketId, setDeletingTicketId] = useState("");
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [companySuggestionsOpen, setCompanySuggestionsOpen] = useState(false);
  const [form, setForm] = useState({
    company_id: "",
    ticket_type: initialDefaults.ticket_type,
    priority: initialDefaults.priority,
    status: "open",
    description: ""
  });

  async function load() {
    setError("");
    try {
      const [ticketData, companyData] = await Promise.all([listTickets(), listCompanyOptions()]);
      setTickets(ticketData);
      setCompanies(companyData);
    } catch (err) {
      setError(err.message);
    }
  }

  const companySuggestions = useMemo(() => {
    const normalizedTerm = normalizeLookupText(companySearchTerm);
    const digitsTerm = String(companySearchTerm || "").replace(/\D/g, "");
    const source = normalizedTerm || digitsTerm
      ? companies.filter((company) => {
          const companyName = normalizeLookupText(company.trade_name);
          const companyCnpj = String(company.cnpj || "").replace(/\D/g, "");
          if (normalizedTerm && companyName.includes(normalizedTerm)) return true;
          if (digitsTerm && companyCnpj.includes(digitsTerm)) return true;
          return false;
        })
      : companies;
    return source.slice(0, 10);
  }, [companies, companySearchTerm]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const nextDefaults = normalizeServiceFormDefaults({
      ticket_type: form.ticket_type,
      priority: form.priority
    });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SERVICE_FORM_DEFAULTS_STORAGE_KEY, JSON.stringify(nextDefaults));
    }
  }, [form.ticket_type, form.priority]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const submitIntent = String(event?.nativeEvent?.submitter?.value || "save");
    const createAnotherAfterSave = submitIntent === "save_and_create";

    if (!form.company_id) {
      setError("Selecione uma empresa cadastrada.");
      return;
    }

    try {
      await createTicket({
        company_id: form.company_id,
        ticket_type: form.ticket_type,
        priority: form.priority,
        status: form.status,
        description: form.description,
        opened_at: new Date().toISOString()
      });
      if (createAnotherAfterSave) {
        setForm((prev) => ({
          ...prev,
          description: ""
        }));
        setSuccess("Chamado aberto. Formulário mantido para registrar o próximo.");
      } else {
        setForm((prev) => ({
          ...prev,
          company_id: "",
          description: ""
        }));
        setCompanySearchTerm("");
        setSuccess("Chamado aberto com sucesso.");
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleCompanySearchChange(value) {
    const nextTerm = value;
    setCompanySearchTerm(nextTerm);
    setCompanySuggestionsOpen(Boolean(nextTerm.trim()));

    const normalizedNextTerm = normalizeLookupText(nextTerm);
    const digitsNextTerm = String(nextTerm || "").replace(/\D/g, "");
    if (!normalizedNextTerm && !digitsNextTerm) {
      setForm((prev) => ({ ...prev, company_id: "" }));
      return;
    }

    const exactMatch = companies.find((company) => {
      const companyName = normalizeLookupText(company.trade_name);
      const companyCnpj = String(company.cnpj || "").replace(/\D/g, "");
      if (normalizedNextTerm && companyName === normalizedNextTerm) return true;
      if (digitsNextTerm.length === 14 && companyCnpj === digitsNextTerm) return true;
      return false;
    });

    setForm((prev) => ({
      ...prev,
      company_id: exactMatch ? exactMatch.id : ""
    }));
  }

  function handleSelectCompany(company) {
    if (!company?.id) return;
    setForm((prev) => ({ ...prev, company_id: company.id }));
    setCompanySearchTerm(company.trade_name || "");
    setCompanySuggestionsOpen(false);
  }

  function handleRequestCreateCompany() {
    const typedTerm = String(companySearchTerm || "").trim();
    if (!typedTerm) {
      setError("Digite o nome ou CNPJ para cadastrar uma nova empresa.");
      return;
    }

    if (typeof onRequestCreateCompany !== "function") {
      setError("Não foi possível abrir o cadastro de empresa neste contexto.");
      return;
    }

    const cnpjDigits = typedTerm.replace(/\D/g, "");
    setError("");
    setSuccess("");
    setCompanySuggestionsOpen(false);
    onRequestCreateCompany({
      trade_name: typedTerm,
      cnpj: cnpjDigits.length === 14 ? cnpjDigits : "",
      search_term: typedTerm
    });
  }

  async function handleDeleteTicket(ticket) {
    const ticketId = String(ticket?.id || "").trim();
    if (!ticketId) return;

    const confirmed = confirmStrongDelete({
      entityLabel: "o chamado",
      itemLabel: ticket?.companies?.trade_name || ticket?.id
    });
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setDeletingTicketId(ticketId);
    try {
      await deleteTicket(ticketId);
      setTickets((prev) => prev.filter((item) => item.id !== ticketId));
      setSuccess("Chamado excluído com sucesso.");
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingTicketId("");
    }
  }

  return (
    <section className="module two-col">
      <article className="panel">
        <h2>Assistência Técnica</h2>
        {success ? <p className="success-text">{success}</p> : null}
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="tasks-company-autocomplete">
            <input
              type="text"
              placeholder="Empresa (digite nome ou CNPJ)"
              value={companySearchTerm}
              onChange={(event) => handleCompanySearchChange(event.target.value)}
              onFocus={() => setCompanySuggestionsOpen(Boolean(companySearchTerm.trim()))}
              onBlur={() => window.setTimeout(() => setCompanySuggestionsOpen(false), 120)}
            />
            {companySuggestionsOpen && companySearchTerm.trim().length >= 1 ? (
              <div className="tasks-company-suggestions">
                {!companySuggestions.length ? <p className="muted">Nenhuma empresa encontrada.</p> : null}
                {companySuggestions.length ? (
                  <ul className="search-suggestions-list">
                    {companySuggestions.map((company) => (
                      <li key={company.id}>
                        <button
                          type="button"
                          className="search-suggestion-btn"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleSelectCompany(company);
                          }}
                        >
                          <strong>{company.trade_name || "Empresa"}</strong>
                          <span>{company.cnpj ? formatCnpj(company.cnpj) : "Sem CNPJ"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!companySuggestions.length && typeof onRequestCreateCompany === "function" ? (
                  <div className="tasks-company-suggestions-actions">
                    <button
                      type="button"
                      className="btn-ghost btn-table-action tasks-create-company-btn"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={handleRequestCreateCompany}
                    >
                      + Cadastrar nova empresa
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
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
          <div className="inline-actions">
            <button type="submit" value="save" className="btn-primary">Abrir chamado</button>
            <button type="submit" value="save_and_create" className="btn-ghost">Salvar e abrir outro</button>
          </div>
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
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>{ticket.companies?.trade_name || "-"}</td>
                  <td>{ticket.ticket_type}</td>
                  <td>{ticket.priority}</td>
                  <td>{ticket.status}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost btn-table-action"
                      onClick={() => handleDeleteTicket(ticket)}
                      disabled={deletingTicketId === ticket.id}
                    >
                      {deletingTicketId === ticket.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
