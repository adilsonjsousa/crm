import { useEffect, useState } from "react";
import { createCompany, listCompanies } from "../lib/revenueApi";

const SEGMENTOS = [
  "Tecnologia",
  "Indústria",
  "Serviços",
  "Varejo",
  "Gráfica",
  "Gráfica Digital",
  "Comunicação visual"
];

function cleanCnpj(value) {
  return String(value || "").replace(/\D/g, "");
}

function maskCnpj(value) {
  const digits = cleanCnpj(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export default function CompaniesModule() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    cnpj: "",
    trade_name: "",
    legal_name: "",
    email: "",
    phone: "",
    segmento: "",
    address_full: ""
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await listCompanies();
      setCompanies(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      await createCompany({
        cnpj: cleanCnpj(form.cnpj),
        trade_name: form.trade_name,
        legal_name: form.legal_name,
        email: form.email || null,
        phone: form.phone || null,
        segmento: form.segmento || null,
        address_full: form.address_full || null
      });
      setForm({ cnpj: "", trade_name: "", legal_name: "", email: "", phone: "", segmento: "", address_full: "" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="module two-col">
      <article className="panel">
        <h2>Empresas</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <input
            required
            placeholder="CNPJ"
            value={form.cnpj}
            onChange={(e) => setForm((prev) => ({ ...prev, cnpj: maskCnpj(e.target.value) }))}
          />
          <input
            required
            placeholder="Nome Fantasia"
            value={form.trade_name}
            onChange={(e) => setForm((prev) => ({ ...prev, trade_name: e.target.value }))}
          />
          <input
            required
            placeholder="Razão Social"
            value={form.legal_name}
            onChange={(e) => setForm((prev) => ({ ...prev, legal_name: e.target.value }))}
          />
          <input
            placeholder="E-mail"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <input
            placeholder="Telefone"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
          <select
            value={form.segmento}
            onChange={(e) => setForm((prev) => ({ ...prev, segmento: e.target.value }))}
          >
            <option value="">Segmento</option>
            {SEGMENTOS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Endereço completo"
            value={form.address_full}
            onChange={(e) => setForm((prev) => ({ ...prev, address_full: e.target.value }))}
          />
          <button type="submit" className="btn-primary">Salvar empresa</button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </article>

      <article className="panel">
        <h3>Últimas empresas</h3>
        {loading ? <p className="muted">Carregando...</p> : null}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome Fantasia</th>
                <th>CNPJ</th>
                <th>Segmento</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>{company.trade_name}</td>
                  <td>{maskCnpj(company.cnpj)}</td>
                  <td>{company.segmento || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
