import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCompany,
  createContact,
  findCompanyByCnpj,
  listCompanies,
  listCompanyHistory,
  listCompanyOptions,
  listContacts,
  lookupCompanyDataByCnpj,
  updateCompany,
  updateContact
} from "../lib/revenueApi";

const SEGMENTOS = [
  "Tecnologia",
  "Indústria",
  "Serviços",
  "Varejo",
  "Gráfica",
  "Gráfica Digital",
  "Comunicação visual"
];

const EMPTY_COMPANY_FORM = {
  cnpj: "",
  trade_name: "",
  legal_name: "",
  email: "",
  phone: "",
  segmento: "",
  address_full: "",
  contact_name: "",
  contact_email: "",
  contact_whatsapp: "",
  contact_birth_date: ""
};

const EMPTY_CONTACT_FORM = {
  company_id: "",
  full_name: "",
  email: "",
  whatsapp: "",
  birth_date: ""
};

const EMPTY_EDIT_COMPANY_FORM = {
  cnpj: "",
  trade_name: "",
  legal_name: "",
  email: "",
  phone: "",
  segmento: "",
  address_full: ""
};

const EMPTY_EDIT_CONTACT_FORM = {
  company_id: "",
  full_name: "",
  email: "",
  whatsapp: "",
  birth_date: ""
};

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

function formatBirthDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function taskStatusLabel(value) {
  const map = {
    todo: "A Fazer",
    in_progress: "Em Andamento",
    done: "Concluída",
    cancelled: "Cancelada"
  };
  return map[value] || String(value || "-");
}

function upperLettersOnly(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-ZÀ-ÖØ-Ý\s]/g, "")
    .replace(/\s+/g, " ")
    .trimStart();
}

export default function CompaniesModule({ focusTarget = "company", focusRequest = 0 }) {
  const [companies, setCompanies] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cnpjValidation, setCnpjValidation] = useState({ type: "idle", message: "" });
  const [form, setForm] = useState(EMPTY_COMPANY_FORM);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT_FORM);
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const [editForm, setEditForm] = useState(EMPTY_EDIT_COMPANY_FORM);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editingContactId, setEditingContactId] = useState("");
  const [editContactForm, setEditContactForm] = useState(EMPTY_EDIT_CONTACT_FORM);
  const [editContactError, setEditContactError] = useState("");
  const [savingContactEdit, setSavingContactEdit] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyCompanyId, setHistoryCompanyId] = useState("");
  const companyPanelRef = useRef(null);
  const contactPanelRef = useRef(null);

  const cnpjDigits = useMemo(() => cleanCnpj(form.cnpj), [form.cnpj]);
  const hasPrimaryContactData = useMemo(
    () =>
      [form.contact_name, form.contact_email, form.contact_whatsapp, form.contact_birth_date]
        .map((value) => String(value || "").trim())
        .some(Boolean),
    [form.contact_birth_date, form.contact_email, form.contact_name, form.contact_whatsapp]
  );
  const isCheckingCnpj = cnpjValidation.type === "checking";
  const isCnpjBlocked = cnpjValidation.type === "invalid" || cnpjValidation.type === "duplicate";
  const companyNameById = useMemo(() => {
    const map = new Map();
    for (const item of companies) {
      if (!map.has(item.id)) map.set(item.id, item.trade_name);
    }
    for (const item of companyOptions) {
      if (!map.has(item.id)) map.set(item.id, item.trade_name);
    }
    return map;
  }, [companies, companyOptions]);

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
            trade_name: upperLettersOnly(lookupData.trade_name) || prev.trade_name,
            legal_name: upperLettersOnly(lookupData.legal_name) || prev.legal_name,
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
      const [companiesData, optionsData, contactsData] = await Promise.all([
        listCompanies(),
        listCompanyOptions(),
        listContacts()
      ]);
      const historyData = await listCompanyHistory({ companyId: historyCompanyId, limit: 120 });

      const normalizedOptions = optionsData.length
        ? optionsData
        : companiesData.map((item) => ({ id: item.id, trade_name: item.trade_name }));

      setCompanies(companiesData);
      setCompanyOptions(normalizedOptions);
      setContacts(contactsData);
      setHistoryRows(historyData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [historyCompanyId]);

  useEffect(() => {
    if (!focusRequest) return;
    const panelRef = focusTarget === "contact" ? contactPanelRef : companyPanelRef;
    if (!panelRef.current) return;

    panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstField = panelRef.current.querySelector("select, input, textarea");
    if (firstField && typeof firstField.focus === "function") {
      window.setTimeout(() => firstField.focus(), 180);
    }
  }, [focusRequest, focusTarget]);

  async function handleCompanySubmit(event) {
    event.preventDefault();
    setError("");
    const normalizedCnpj = cleanCnpj(form.cnpj);

    try {
      if (!isValidCnpj(normalizedCnpj)) {
        setError("CNPJ inválido. Verifique o número informado.");
        return;
      }

      if (hasPrimaryContactData && !String(form.contact_name || "").trim()) {
        setError("Para salvar o contato no cadastro da empresa, informe o nome do contato.");
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

      const createdCompany = await createCompany({
        cnpj: normalizedCnpj,
        trade_name: upperLettersOnly(form.trade_name),
        legal_name: upperLettersOnly(form.legal_name),
        email: form.email || null,
        phone: form.phone || null,
        segmento: form.segmento || null,
        address_full: form.address_full || null
      });

      if (hasPrimaryContactData) {
        await createContact({
          company_id: createdCompany.id,
          full_name: upperLettersOnly(form.contact_name),
          email: form.contact_email || null,
          whatsapp: form.contact_whatsapp || null,
          birth_date: form.contact_birth_date || null,
          is_primary: true
        });
      }

      setForm(EMPTY_COMPANY_FORM);
      setCnpjValidation({ type: "idle", message: "" });
      setContactForm((prev) => ({ ...prev, company_id: createdCompany.id, full_name: "", email: "", whatsapp: "", birth_date: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleContactSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      if (!String(contactForm.full_name || "").trim()) {
        setError("Informe o nome do contato.");
        return;
      }

      await createContact({
        company_id: contactForm.company_id || null,
        full_name: upperLettersOnly(contactForm.full_name),
        email: contactForm.email || null,
        whatsapp: contactForm.whatsapp || null,
        birth_date: contactForm.birth_date || null
      });

      setContactForm((prev) => ({ ...prev, full_name: "", email: "", whatsapp: "", birth_date: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditCompany(company) {
    setEditError("");
    setEditingCompanyId(company.id);
    setEditForm({
      cnpj: maskCnpj(company.cnpj),
      trade_name: upperLettersOnly(company.trade_name || ""),
      legal_name: upperLettersOnly(company.legal_name || ""),
      email: company.email || "",
      phone: company.phone || "",
      segmento: company.segmento || "",
      address_full: company.address_full || ""
    });
  }

  function cancelEditCompany() {
    setEditingCompanyId("");
    setEditForm(EMPTY_EDIT_COMPANY_FORM);
    setEditError("");
    setSavingEdit(false);
  }

  async function handleEditCompanySubmit(event) {
    event.preventDefault();
    setEditError("");
    const normalizedCnpj = cleanCnpj(editForm.cnpj);

    try {
      if (!editingCompanyId) {
        setEditError("Selecione uma empresa para editar.");
        return;
      }

      if (!isValidCnpj(normalizedCnpj)) {
        setEditError("CNPJ inválido. Verifique o número informado.");
        return;
      }

      const existing = await findCompanyByCnpj(normalizedCnpj);
      if (existing && existing.id !== editingCompanyId) {
        setEditError(`Este CNPJ já está cadastrado para "${existing.trade_name}".`);
        return;
      }

      setSavingEdit(true);
      await updateCompany(editingCompanyId, {
        cnpj: normalizedCnpj,
        trade_name: upperLettersOnly(editForm.trade_name),
        legal_name: upperLettersOnly(editForm.legal_name),
        email: editForm.email || null,
        phone: editForm.phone || null,
        segmento: editForm.segmento || null,
        address_full: editForm.address_full || null
      });

      cancelEditCompany();
      await load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  function startEditContact(contact) {
    setEditContactError("");
    setEditingContactId(contact.id);
    setEditContactForm({
      company_id: contact.company_id || "",
      full_name: upperLettersOnly(contact.full_name || ""),
      email: contact.email || "",
      whatsapp: contact.whatsapp || contact.phone || "",
      birth_date: contact.birth_date || ""
    });
  }

  function cancelEditContact() {
    setEditingContactId("");
    setEditContactForm(EMPTY_EDIT_CONTACT_FORM);
    setEditContactError("");
    setSavingContactEdit(false);
  }

  async function handleEditContactSubmit(event) {
    event.preventDefault();
    setEditContactError("");

    try {
      if (!editingContactId) {
        setEditContactError("Selecione um contato para editar.");
        return;
      }

      if (!String(editContactForm.full_name || "").trim()) {
        setEditContactError("Informe o nome do contato.");
        return;
      }

      setSavingContactEdit(true);
      await updateContact(editingContactId, {
        company_id: editContactForm.company_id || null,
        full_name: upperLettersOnly(editContactForm.full_name),
        email: editContactForm.email || null,
        whatsapp: editContactForm.whatsapp || null,
        birth_date: editContactForm.birth_date || null
      });

      cancelEditContact();
      await load();
    } catch (err) {
      setEditContactError(err.message);
    } finally {
      setSavingContactEdit(false);
    }
  }

  return (
    <section className="module">
      {error ? <p className="error-text">{error}</p> : null}

      <div className="two-col">
        <article className="panel" ref={companyPanelRef}>
          <h2>Empresas</h2>
          <form className="form-grid" onSubmit={handleCompanySubmit}>
            <input
              required
              placeholder="CNPJ"
              value={form.cnpj}
              onChange={(event) => setForm((prev) => ({ ...prev, cnpj: maskCnpj(event.target.value) }))}
            />
            {cnpjValidation.message ? (
              <p className={`cnpj-status cnpj-status-${cnpjValidation.type}`}>{cnpjValidation.message}</p>
            ) : null}
            <input
              required
              placeholder="Nome Fantasia"
              value={form.trade_name}
              onChange={(event) => setForm((prev) => ({ ...prev, trade_name: upperLettersOnly(event.target.value) }))}
            />
            <input
              required
              placeholder="Razão Social"
              value={form.legal_name}
              onChange={(event) => setForm((prev) => ({ ...prev, legal_name: upperLettersOnly(event.target.value) }))}
            />
            <input
              placeholder="E-mail"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              placeholder="Telefone"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
            <select value={form.segmento} onChange={(event) => setForm((prev) => ({ ...prev, segmento: event.target.value }))}>
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
              onChange={(event) => setForm((prev) => ({ ...prev, address_full: event.target.value }))}
            />

            <h3>Contato principal (opcional)</h3>
            <input
              placeholder="Nome do contato"
              value={form.contact_name}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_name: upperLettersOnly(event.target.value) }))}
            />
            <input
              placeholder="E-mail do contato"
              value={form.contact_email}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_email: event.target.value }))}
            />
            <input
              placeholder="WhatsApp do contato"
              value={form.contact_whatsapp}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_whatsapp: event.target.value }))}
            />
            <input
              type="date"
              value={form.contact_birth_date}
              onChange={(event) => setForm((prev) => ({ ...prev, contact_birth_date: event.target.value }))}
            />

            <button type="submit" className="btn-primary" disabled={isCheckingCnpj || isCnpjBlocked}>
              {isCheckingCnpj ? "Validando CNPJ..." : "Salvar empresa"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Editar empresa cadastrada</h2>
          {editingCompanyId ? (
            <form className="form-grid" onSubmit={handleEditCompanySubmit}>
              <input
                required
                placeholder="CNPJ"
                value={editForm.cnpj}
                onChange={(event) => setEditForm((prev) => ({ ...prev, cnpj: maskCnpj(event.target.value) }))}
              />
              <input
                required
                placeholder="Nome Fantasia"
                value={editForm.trade_name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, trade_name: upperLettersOnly(event.target.value) }))}
              />
              <input
                required
                placeholder="Razão Social"
                value={editForm.legal_name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, legal_name: upperLettersOnly(event.target.value) }))}
              />
              <input
                placeholder="E-mail"
                value={editForm.email}
                onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                placeholder="Telefone"
                value={editForm.phone}
                onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
              <select
                value={editForm.segmento}
                onChange={(event) => setEditForm((prev) => ({ ...prev, segmento: event.target.value }))}
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
                value={editForm.address_full}
                onChange={(event) => setEditForm((prev) => ({ ...prev, address_full: event.target.value }))}
              />
              <div className="inline-actions">
                <button type="submit" className="btn-primary" disabled={savingEdit}>
                  {savingEdit ? "Salvando..." : "Salvar alterações"}
                </button>
                <button type="button" className="btn-ghost" onClick={cancelEditCompany}>
                  Cancelar edição
                </button>
              </div>
              {editError ? <p className="error-text">{editError}</p> : null}
            </form>
          ) : (
            <p className="muted">Clique em “Editar” na lista para alterar os dados de uma empresa.</p>
          )}
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
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td>{company.trade_name}</td>
                    <td>{maskCnpj(company.cnpj)}</td>
                    <td>{company.segmento || "-"}</td>
                    <td>
                      <button type="button" className="btn-ghost btn-table-action" onClick={() => startEditCompany(company)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div className="two-col top-gap">
        <article className="panel" ref={contactPanelRef}>
          <h2>Criar contato (com ou sem vínculo)</h2>
          <form className="form-grid" onSubmit={handleContactSubmit}>
            <select
              value={contactForm.company_id}
              onChange={(event) => setContactForm((prev) => ({ ...prev, company_id: event.target.value }))}
            >
              <option value="">Sem vínculo com empresa</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.trade_name}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Nome do contato"
              value={contactForm.full_name}
              onChange={(event) => setContactForm((prev) => ({ ...prev, full_name: upperLettersOnly(event.target.value) }))}
            />
            <input
              placeholder="E-mail"
              value={contactForm.email}
              onChange={(event) => setContactForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <input
              placeholder="WhatsApp"
              value={contactForm.whatsapp}
              onChange={(event) => setContactForm((prev) => ({ ...prev, whatsapp: event.target.value }))}
            />
            <input
              type="date"
              value={contactForm.birth_date}
              onChange={(event) => setContactForm((prev) => ({ ...prev, birth_date: event.target.value }))}
            />
            <button type="submit" className="btn-primary">Salvar contato</button>
          </form>
        </article>

        <article className="panel">
          <h2>Editar contato</h2>
          {editingContactId ? (
            <form className="form-grid" onSubmit={handleEditContactSubmit}>
              <select
                value={editContactForm.company_id}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, company_id: event.target.value }))}
              >
                <option value="">Sem vínculo com empresa</option>
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.trade_name}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Nome do contato"
                value={editContactForm.full_name}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, full_name: upperLettersOnly(event.target.value) }))}
              />
              <input
                placeholder="E-mail"
                value={editContactForm.email}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, email: event.target.value }))}
              />
              <input
                placeholder="WhatsApp"
                value={editContactForm.whatsapp}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, whatsapp: event.target.value }))}
              />
              <input
                type="date"
                value={editContactForm.birth_date}
                onChange={(event) => setEditContactForm((prev) => ({ ...prev, birth_date: event.target.value }))}
              />
              <div className="inline-actions">
                <button type="submit" className="btn-primary" disabled={savingContactEdit}>
                  {savingContactEdit ? "Salvando..." : "Salvar contato"}
                </button>
                <button type="button" className="btn-ghost" onClick={cancelEditContact}>
                  Cancelar edição
                </button>
              </div>
              {editContactError ? <p className="error-text">{editContactError}</p> : null}
            </form>
          ) : (
            <p className="muted">Clique em “Editar” em um contato para alterar ou vincular/desvincular empresa.</p>
          )}

          <h3 className="top-gap">Contatos recentes</h3>
          {loading ? <p className="muted">Carregando...</p> : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Contato</th>
                  <th>E-mail</th>
                  <th>WhatsApp</th>
                  <th>Nascimento</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td>{contact.companies?.trade_name || "SEM VÍNCULO"}</td>
                    <td>{contact.full_name}</td>
                    <td>{contact.email || "-"}</td>
                    <td>{contact.whatsapp || contact.phone || "-"}</td>
                    <td>{formatBirthDate(contact.birth_date)}</td>
                    <td>
                      <button type="button" className="btn-ghost btn-table-action" onClick={() => startEditContact(contact)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <article className="panel top-gap">
        <h3>Histórico do cliente</h3>
        <p className="muted">Registros de mudança no fluxo da agenda com comentário obrigatório.</p>
        <div className="inline-actions">
          <select value={historyCompanyId} onChange={(event) => setHistoryCompanyId(event.target.value)}>
            <option value="">Todos os clientes</option>
            {companyOptions.map((company) => (
              <option key={`history-${company.id}`} value={company.id}>
                {company.trade_name}
              </option>
            ))}
          </select>
        </div>
        <div className="table-wrap top-gap">
          <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Cliente</th>
                <th>Atividade</th>
                <th>Fluxo</th>
                <th>Comentário</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((row) => {
                const payload = row.payload || {};
                const fromLabel = taskStatusLabel(payload.from_status);
                const toLabel = taskStatusLabel(payload.to_status);
                return (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.happened_at)}</td>
                    <td>{companyNameById.get(row.entity_id) || "SEM VÍNCULO"}</td>
                    <td>{payload.task_title || "Atividade"}</td>
                    <td>{`${fromLabel} -> ${toLabel}`}</td>
                    <td>{payload.comment || "-"}</td>
                  </tr>
                );
              })}
              {!historyRows.length ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Nenhum registro no histórico para o filtro selecionado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
