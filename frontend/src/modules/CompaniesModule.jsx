import { useEffect, useMemo, useState } from "react";
import { createCompany, findCompanyByCnpj, listCompanies, lookupCompanyDataByCnpj } from "../lib/revenueApi";

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

function isValidCnpj(value) {
  const cnpj = cleanCnpj(value);
  if (!/^\d{14}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  function calcDigit(base, factor) {
    let total = 0;
    for (let i = 0; i < base.length; i += 1) {
      total += Number(base[i]) * factor;
      factor -= 1;
      if (factor < 2) factor = 9;
    }
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }

  const base12 = cnpj.slice(0, 12);
  const digit1 = calcDigit(base12, 5);
  const digit2 = calcDigit(`${base12}${digit1}`, 6);
  return cnpj === `${base12}${digit1}${digit2}`;
}

export default function CompaniesModule() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cnpjValidation, setCnpjValidation] = useState({ type: "idle", message: "" });
  const [form, setForm] = useState({
    cnpj: "",
    trade_name: "",
    legal_name: "",
    email: "",
    phone: "",
    segmento: "",
    address_full: ""
  });

  const cnpjDigits = useMemo(() => cleanCnpj(form.cnpj), [form.cnpj]);
  const isCheckingCnpj = cnpjValidation.type === "checking";
  const isCnpjBlocked = cnpjValidation.type === "invalid" || cnpjValidation.type === "duplicate";

  useEffect(() => {
    let active = true;

    if (!cnpjDigits) {
      setCnpjValidation({ type: "idle", message: "" });
      return () => {
        active = false;
      };
    }

    if (cnpjDigits.length < 14) {
      setCnpjValidation({ type: "idle", message: "Digite os 14 dígitos do CNPJ." });
      return () => {
        active = false;
      };
    }

    if (!isValidCnpj(cnpjDigits)) {
      setCnpjValidation({ type: "invalid", message: "CNPJ inválido (dígitos verificadores não conferem)." });
      return () => {
        active = false;
      };
    }

    const timer = setTimeout(async () => {
      setCnpjValidation({ type: "checking", message: "Validando CNPJ na base..." });
      try {
        const existing = await findCompanyByCnpj(cnpjDigits);
        if (!active) return;
        if (existing) {
          setCnpjValidation({
            type: "duplicate",
            message: `CNPJ já cadastrado para "${existing.trade_name}".`
          });
          return;
        }

        setCnpjValidation({ type: "checking", message: "CNPJ válido. Buscando dados da empresa..." });
        let lookupData = null;
        try {
          lookupData = await lookupCompanyDataByCnpj(cnpjDigits);
        } catch (lookupError) {
          if (!active) return;
          setCnpjValidation({
            type: "valid",
            message: "CNPJ válido e disponível. Não foi possível autopreencher agora."
          });
          return;
        }

        if (!active) return;
        if (lookupData) {
          setForm((prev) => ({
            ...prev,
            trade_name: lookupData.trade_name || prev.trade_name,
            legal_name: lookupData.legal_name || prev.legal_name,
            email: lookupData.email || prev.email,
            phone: lookupData.phone || prev.phone,
            address_full: lookupData.address_full || prev.address_full,
            segmento: lookupData.segmento || prev.segmento
          }));
          setCnpjValidation({ type: "valid", message: "CNPJ válido. Dados da empresa preenchidos automaticamente." });
          return;
        }

        setCnpjValidation({ type: "valid", message: "CNPJ válido e disponível." });
      } catch (err) {
        if (!active) return;
        setCnpjValidation({ type: "invalid", message: err.message });
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [cnpjDigits]);

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
    const normalizedCnpj = cleanCnpj(form.cnpj);

    try {
      if (!isValidCnpj(normalizedCnpj)) {
        setError("CNPJ inválido. Verifique o número informado.");
        return;
      }

      const existing = await findCompanyByCnpj(normalizedCnpj);
      if (existing) {
        setError(`Este CNPJ já está cadastrado para "${existing.trade_name}".`);
        setCnpjValidation({
          type: "duplicate",
          message: `CNPJ já cadastrado para "${existing.trade_name}".`
        });
        return;
      }

      await createCompany({
        cnpj: normalizedCnpj,
        trade_name: form.trade_name,
        legal_name: form.legal_name,
        email: form.email || null,
        phone: form.phone || null,
        segmento: form.segmento || null,
        address_full: form.address_full || null
      });
      setForm({ cnpj: "", trade_name: "", legal_name: "", email: "", phone: "", segmento: "", address_full: "" });
      setCnpjValidation({ type: "idle", message: "" });
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
          {cnpjValidation.message ? (
            <p className={`cnpj-status cnpj-status-${cnpjValidation.type}`}>{cnpjValidation.message}</p>
          ) : null}
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
          <button type="submit" className="btn-primary" disabled={isCheckingCnpj || isCnpjBlocked}>
            {isCheckingCnpj ? "Validando CNPJ..." : "Salvar empresa"}
          </button>
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
