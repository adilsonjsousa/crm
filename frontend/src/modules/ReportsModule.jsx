import { useEffect, useMemo, useState } from "react";
import { listAllCompaniesForReport } from "../lib/revenueApi";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCityKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCityFilterValue(value) {
  const normalized = normalizeCityKey(value);
  if (!normalized) return "";
  const parts = normalized.split(" ");
  if (parts.length > 1) {
    const maybeState = parts[parts.length - 1];
    if (/^[a-z]{2}$/i.test(maybeState)) parts.pop();
  }
  return parts.join(" ");
}

function extractCityStateFromAddress(addressFull) {
  const raw = String(addressFull || "").trim();
  if (!raw) return { city: "", state: "" };

  const compact = raw.replace(/\s+/g, " ");
  const patterns = [
    /,\s*([^,()]+?)\s*\(([a-z]{2})\)(?:\s*,|$)/gi,
    /,\s*([^,()]+?)\s*[-/]\s*([a-z]{2})(?:\s*,|$)/gi,
    /,\s*([^,()]+?)\s*,\s*([a-z]{2})(?:\s*,|$)/gi
  ];

  for (const pattern of patterns) {
    const matches = Array.from(compact.matchAll(pattern));
    if (!matches.length) continue;
    const last = matches[matches.length - 1];
    const city = String(last[1] || "").replace(/\s+/g, " ").trim();
    const state = String(last[2] || "").trim().toUpperCase();
    if (city) {
      return { city, state };
    }
  }

  return { city: "", state: "" };
}

function resolveCompanyCity(row) {
  const explicitCity = String(row?.city || "").trim();
  if (explicitCity) return explicitCity;
  return extractCityStateFromAddress(row?.address_full).city;
}

function resolveCompanyState(row) {
  const explicitState = String(row?.state || "").trim();
  if (explicitState) return explicitState;
  return extractCityStateFromAddress(row?.address_full).state;
}

function formatCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return String(value || "");
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export default function ReportsModule() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await listAllCompaniesForReport();
      setRows(data);
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stageOptions = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const stageName = String(row?.lifecycle_stage?.name || "").trim();
      if (!stageName) continue;
      if (!map.has(stageName)) map.set(stageName, stageName);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeText(search);
    const normalizedCityFilter = normalizeCityFilterValue(cityFilter);
    return rows.filter((row) => {
      if (stageFilter !== "all") {
        const stageName = String(row?.lifecycle_stage?.name || "").trim() || "Sem fase";
        if (stageName !== stageFilter) return false;
      }

      if (normalizedCityFilter) {
        const normalizedCity = normalizeCityFilterValue(resolveCompanyCity(row));
        if (normalizedCity !== normalizedCityFilter) return false;
      }

      if (!normalizedSearch) return true;

      const haystack = normalizeText([
        row.trade_name,
        row.legal_name,
        row.cnpj,
        row.email,
        row.phone,
        row.country,
        row.address_full,
        row.segmento,
        row?.lifecycle_stage?.name
      ].join(" "));

      return haystack.includes(normalizedSearch);
    });
  }, [rows, search, cityFilter, stageFilter]);

  async function handleExportExcel() {
    if (!filteredRows.length) {
      setError("Nenhuma empresa para exportar com os filtros atuais.");
      return;
    }

    const reportRows = filteredRows.map((row) => ({
      "Nome Fantasia": row.trade_name || "",
      "Razão Social": row.legal_name || "",
      CNPJ: formatCnpj(row.cnpj),
      Fase: row?.lifecycle_stage?.name || "Sem fase",
      Segmento: row.segmento || "",
      Email: row.email || "",
      Telefone: row.phone || "",
      Cidade: resolveCompanyCity(row) || "",
      Estado: resolveCompanyState(row) || "",
      País: row.country || "",
      Endereço: row.address_full || "",
      "Cadastro em": formatDateTime(row.created_at)
    }));

    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(reportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Empresas");

    const now = new Date();
    const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(workbook, `relatorio_empresas_${datePart}.xlsx`);
  }

  return (
    <section className="module reports-module">
      <article className="panel reports-panel">
        <div className="reports-header">
          <div className="reports-heading">
            <h2>Relatório de empresas cadastradas</h2>
            <p className="muted reports-intro">Filtre os registros e exporte para Excel.</p>
          </div>

          <div className="kpi-grid reports-kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Total de empresas</span>
              <strong className="kpi-value">{rows.length}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Empresas filtradas</span>
              <strong className="kpi-value">{filteredRows.length}</strong>
            </div>
          </div>
        </div>

        <div className="inline-actions reports-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, CNPJ, e-mail, telefone..."
          />
          <input
            value={cityFilter}
            onChange={(event) => setCityFilter(event.target.value)}
            placeholder="Cidade (filtro exato)"
          />
          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
          >
            <option value="all">Todas as fases</option>
            <option value="Sem fase">Sem fase</option>
            {stageOptions.map((stageName) => (
              <option key={stageName} value={stageName}>
                {stageName}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={load} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <button type="button" className="btn-primary" onClick={handleExportExcel} disabled={loading || !filteredRows.length}>
            Exportar Excel (.xlsx)
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="table-wrap reports-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome Fantasia</th>
                <th>CNPJ</th>
                <th>Fase</th>
                <th>Telefone</th>
                <th>Email</th>
                <th>Cidade/UF</th>
                <th>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !filteredRows.length ? (
                <tr>
                  <td colSpan={7}>Nenhuma empresa encontrada.</td>
                </tr>
              ) : null}
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.trade_name || row.legal_name || "-"}</td>
                  <td>{formatCnpj(row.cnpj)}</td>
                  <td>{row?.lifecycle_stage?.name || "Sem fase"}</td>
                  <td>{row.phone || "-"}</td>
                  <td>{row.email || "-"}</td>
                  <td>{[resolveCompanyCity(row), resolveCompanyState(row)].filter(Boolean).join("/") || "-"}</td>
                  <td>{formatDateTime(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
