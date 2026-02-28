import { useEffect, useMemo, useState } from "react";
import {
  listAllCompaniesForReport,
  listPipelineAnalyticsForReport,
  listSystemUsers
} from "../lib/revenueApi";
import { PIPELINE_STAGES, stageLabel } from "../lib/pipelineStages";

const ORIGIN_LABELS = {
  all: "Todas as origens",
  manual: "Manual",
  rdstation: "RD Station",
  omie: "OMIE",
  rd_omie: "RD + OMIE"
};

const STAGE_PROBABILITY = {
  lead: 10,
  qualificacao: 25,
  proposta: 60,
  follow_up: 70,
  ganho: 100,
  perdido: 0
};

const FUNNEL_FLOW = [
  ["lead", "qualificacao"],
  ["qualificacao", "proposta"],
  ["proposta", "follow_up"],
  ["follow_up", "ganho"]
];

const STAGE_COLOR_BY_KEY = {
  lead: "#7c3aed",
  qualificacao: "#2563eb",
  proposta: "#0891b2",
  follow_up: "#d97706",
  ganho: "#059669",
  perdido: "#dc2626"
};

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function segmentFilterSummary(selectedSegments = []) {
  if (!selectedSegments.length) return "Todos";
  if (selectedSegments.length === 1) return selectedSegments[0];
  return `${selectedSegments.length} segmentos`;
}

function toggleMultiValue(values = [], value = "") {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return values;
  const set = new Set(values);
  if (set.has(normalizedValue)) {
    set.delete(normalizedValue);
  } else {
    set.add(normalizedValue);
  }
  return Array.from(set);
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

function parseCityUfFilter(value) {
  const raw = String(value || "").trim();
  if (!raw) return { city: "", state: "" };

  const bySlash = raw.split("/");
  if (bySlash.length >= 2) {
    return {
      city: normalizeCityFilterValue(bySlash[0]),
      state: String(bySlash[1] || "")
        .trim()
        .toUpperCase()
        .slice(0, 2)
    };
  }

  const normalized = normalizeCityFilterValue(raw);
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length > 1) {
    const maybeState = parts[parts.length - 1];
    if (/^[a-z]{2}$/i.test(maybeState)) {
      parts.pop();
      return { city: parts.join(" "), state: maybeState.toUpperCase() };
    }
  }

  return { city: normalized, state: "" };
}

function matchesCityUfFilter(row, parsedFilter) {
  if (!parsedFilter?.city && !parsedFilter?.state) return true;
  const normalizedCity = normalizeCityFilterValue(resolveCompanyCity(row));
  const normalizedState = String(resolveCompanyState(row) || "").trim().toUpperCase();

  if (parsedFilter.city && normalizedCity !== parsedFilter.city) return false;
  if (parsedFilter.state && normalizedState !== parsedFilter.state) return false;
  return true;
}

function formatCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return String(value || "");
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsed);
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

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}%`;
}

function formatDecimal(value, digits = 1) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoYmd(days) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function toDateMs(value, endOfDay = false) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const parsed = new Date(`${normalized.slice(0, 10)}${suffix}`);
  const time = parsed.getTime();
  if (!Number.isFinite(time)) return null;
  return time;
}

function diffDays(fromValue, toValue = new Date()) {
  const fromDate = new Date(fromValue);
  const toDate = new Date(toValue);
  const fromTime = fromDate.getTime();
  const toTime = toDate.getTime();
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((toTime - fromTime) / msPerDay));
}

function parseMoneyFilter(value) {
  const normalized = String(value || "").replace(/\./g, "").replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveOriginKey(providerSet) {
  if (!(providerSet instanceof Set) || !providerSet.size) return "manual";
  const hasRd = providerSet.has("rdstation");
  const hasOmie = providerSet.has("omie");
  if (hasRd && hasOmie) return "rd_omie";
  if (hasRd) return "rdstation";
  if (hasOmie) return "omie";
  return "manual";
}

function resolveOpportunityProbability(opportunity) {
  const customProbability = Number(opportunity?.close_probability);
  if (Number.isFinite(customProbability) && customProbability >= 0 && customProbability <= 100) {
    return customProbability;
  }
  return STAGE_PROBABILITY[String(opportunity?.stage || "").trim()] || 0;
}

function buildStageHistoryMap(stageHistoryRows) {
  const map = new Map();
  for (const row of stageHistoryRows || []) {
    const opportunityId = String(row?.opportunity_id || "").trim();
    if (!opportunityId) continue;
    if (!map.has(opportunityId)) map.set(opportunityId, []);
    map.get(opportunityId).push(row);
  }

  for (const [opportunityId, rows] of map.entries()) {
    map.set(
      opportunityId,
      [...rows].sort((a, b) => {
        const aTime = new Date(a.changed_at || 0).getTime();
        const bTime = new Date(b.changed_at || 0).getTime();
        return aTime - bTime;
      })
    );
  }

  return map;
}

function buildEnteredStagesSet(opportunity, historyRows) {
  const set = new Set();
  const currentStage = String(opportunity?.stage || "").trim();

  if (historyRows.length && historyRows[0]?.from_stage) {
    set.add(String(historyRows[0].from_stage).trim());
  }

  for (const row of historyRows) {
    const fromStage = String(row?.from_stage || "").trim();
    const toStage = String(row?.to_stage || "").trim();
    if (fromStage) set.add(fromStage);
    if (toStage) set.add(toStage);
  }

  if (currentStage) set.add(currentStage);
  return set;
}

function findStageEnteredAt(opportunity, historyRows) {
  const currentStage = String(opportunity?.stage || "").trim();
  let stageEnteredAt = String(opportunity?.created_at || "").trim();
  let stageEnteredMs = Number(new Date(stageEnteredAt).getTime()) || 0;

  for (const row of historyRows) {
    const toStage = String(row?.to_stage || "").trim();
    if (toStage !== currentStage) continue;
    const changedAt = String(row?.changed_at || "").trim();
    const changedMs = Number(new Date(changedAt).getTime()) || 0;
    if (changedMs > stageEnteredMs) {
      stageEnteredAt = changedAt;
      stageEnteredMs = changedMs;
    }
  }

  return stageEnteredAt || String(opportunity?.created_at || "").trim();
}

function findWonAt(opportunity, historyRows) {
  for (let index = historyRows.length - 1; index >= 0; index -= 1) {
    if (String(historyRows[index]?.to_stage || "").trim() === "ganho") {
      return String(historyRows[index]?.changed_at || "").trim();
    }
  }

  const stage = String(opportunity?.stage || "").trim();
  const status = String(opportunity?.status || "").trim();
  if (stage === "ganho" || status === "won") {
    return String(opportunity?.updated_at || opportunity?.created_at || "").trim();
  }
  return "";
}

function ownerLabelForRow(userId, usersById) {
  const normalized = String(userId || "").trim();
  if (!normalized) return "Sem responsável";
  const user = usersById.get(normalized);
  if (!user) return "Usuário";
  return String(user.full_name || user.email || "Usuário").trim();
}

export default function ReportsModule() {
  const [companyRows, setCompanyRows] = useState([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companiesError, setCompaniesError] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [companyCityFilter, setCompanyCityFilter] = useState("");
  const [companyStageFilter, setCompanyStageFilter] = useState("all");

  const [funnelData, setFunnelData] = useState({
    opportunities: [],
    stageHistory: [],
    openTasks: [],
    integrationLinks: []
  });
  const [funnelUsers, setFunnelUsers] = useState([]);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelError, setFunnelError] = useState("");

  const [funnelStartDate, setFunnelStartDate] = useState(() => daysAgoYmd(180));
  const [funnelEndDate, setFunnelEndDate] = useState(() => todayYmd());
  const [funnelOwnerFilter, setFunnelOwnerFilter] = useState("all");
  const [funnelStageFilter, setFunnelStageFilter] = useState("all");
  const [funnelSegmentFilters, setFunnelSegmentFilters] = useState([]);
  const [funnelOriginFilter, setFunnelOriginFilter] = useState("all");
  const [funnelCityFilter, setFunnelCityFilter] = useState("");
  const [funnelMinValue, setFunnelMinValue] = useState("");
  const [funnelMaxValue, setFunnelMaxValue] = useState("");
  const [funnelOnlyOpen, setFunnelOnlyOpen] = useState(false);

  async function loadCompaniesReport() {
    setCompaniesLoading(true);
    setCompaniesError("");
    try {
      const data = await listAllCompaniesForReport();
      setCompanyRows(data);
    } catch (err) {
      setCompaniesError(err.message);
      setCompanyRows([]);
    } finally {
      setCompaniesLoading(false);
    }
  }

  async function loadFunnelReport() {
    setFunnelLoading(true);
    setFunnelError("");
    try {
      const [dataset, users] = await Promise.all([
        listPipelineAnalyticsForReport(),
        listSystemUsers().catch(() => [])
      ]);
      setFunnelData(asObject(dataset));
      setFunnelUsers(Array.isArray(users) ? users : []);
    } catch (err) {
      setFunnelError(err.message);
      setFunnelData({ opportunities: [], stageHistory: [], openTasks: [], integrationLinks: [] });
      setFunnelUsers([]);
    } finally {
      setFunnelLoading(false);
    }
  }

  useEffect(() => {
    loadCompaniesReport();
    loadFunnelReport();
  }, []);

  const companyStageOptions = useMemo(() => {
    const map = new Map();
    for (const row of companyRows) {
      const stageName = String(row?.lifecycle_stage?.name || "").trim();
      if (!stageName) continue;
      if (!map.has(stageName)) map.set(stageName, stageName);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [companyRows]);

  const filteredCompanyRows = useMemo(() => {
    const normalizedSearch = normalizeText(companySearch);
    const normalizedCityFilter = normalizeCityFilterValue(companyCityFilter);

    return companyRows.filter((row) => {
      if (companyStageFilter !== "all") {
        const stageName = String(row?.lifecycle_stage?.name || "").trim() || "Sem fase";
        if (stageName !== companyStageFilter) return false;
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
  }, [companyRows, companySearch, companyCityFilter, companyStageFilter]);

  const stageHistoryByOpportunity = useMemo(
    () => buildStageHistoryMap(funnelData.stageHistory || []),
    [funnelData.stageHistory]
  );

  const usersById = useMemo(() => {
    const map = new Map();
    for (const row of funnelUsers || []) {
      const userId = String(row?.user_id || "").trim();
      if (!userId) continue;
      map.set(userId, row);
    }
    return map;
  }, [funnelUsers]);

  const providersByCompanyId = useMemo(() => {
    const map = new Map();
    for (const row of funnelData.integrationLinks || []) {
      const companyId = String(row?.local_entity_id || "").trim();
      const provider = String(row?.provider || "").trim();
      if (!companyId || !provider) continue;
      if (!map.has(companyId)) map.set(companyId, new Set());
      map.get(companyId).add(provider);
    }
    return map;
  }, [funnelData.integrationLinks]);

  const overdueTasksByCompanyId = useMemo(() => {
    const map = new Map();
    const today = todayYmd();
    for (const row of funnelData.openTasks || []) {
      const companyId = String(row?.company_id || "").trim();
      const dueDate = String(row?.due_date || "").trim();
      if (!companyId || !dueDate) continue;
      if (dueDate >= today) continue;
      map.set(companyId, (map.get(companyId) || 0) + 1);
    }
    return map;
  }, [funnelData.openTasks]);

  const enrichedFunnelRows = useMemo(() => {
    return (funnelData.opportunities || []).map((opportunity) => {
      const safeOpportunity = asObject(opportunity);
      const company = asObject(safeOpportunity.companies);
      const opportunityId = String(safeOpportunity.id || "").trim();
      const companyId = String(safeOpportunity.company_id || "").trim();
      const ownerUserId = String(safeOpportunity.owner_user_id || "").trim();
      const stage = String(safeOpportunity.stage || "").trim();
      const status = String(safeOpportunity.status || "").trim();

      const historyRows = stageHistoryByOpportunity.get(opportunityId) || [];
      const enteredStages = buildEnteredStagesSet(safeOpportunity, historyRows);
      const stageEnteredAt = findStageEnteredAt(safeOpportunity, historyRows);
      const wonAt = findWonAt(safeOpportunity, historyRows);

      const estimatedValue = Number(safeOpportunity.estimated_value || 0);
      const closeProbability = resolveOpportunityProbability(safeOpportunity);
      const weightedValue = estimatedValue * (closeProbability / 100);

      const originKey = resolveOriginKey(providersByCompanyId.get(companyId));
      const ownerLabel = ownerLabelForRow(ownerUserId, usersById);
      const agingDays = diffDays(stageEnteredAt, new Date()) ?? 0;
      const cycleDays = wonAt ? diffDays(safeOpportunity.created_at, wonAt) : null;
      const daysWithoutUpdate = diffDays(safeOpportunity.updated_at || safeOpportunity.created_at, new Date()) ?? 0;

      const expectedCloseDate = String(safeOpportunity.expected_close_date || "").trim();
      const expectedCloseDelayDays = expectedCloseDate && expectedCloseDate < todayYmd()
        ? diffDays(expectedCloseDate, todayYmd()) || 0
        : 0;

      return {
        ...safeOpportunity,
        id: opportunityId,
        company_id: companyId,
        owner_user_id: ownerUserId,
        owner_label: ownerLabel,
        stage,
        stage_label: stageLabel(stage) || stage || "Sem etapa",
        status,
        estimated_value: Number.isFinite(estimatedValue) ? estimatedValue : 0,
        close_probability: closeProbability,
        weighted_value: Number.isFinite(weightedValue) ? weightedValue : 0,
        expected_close_date: expectedCloseDate,
        created_at: safeOpportunity.created_at,
        updated_at: safeOpportunity.updated_at,
        title: String(safeOpportunity.title || "").trim() || "Sem título",
        company_trade_name: String(company.trade_name || "").trim() || "Sem empresa",
        company_segment: String(company.segmento || "").trim(),
        company_city: resolveCompanyCity(company),
        company_state: resolveCompanyState(company),
        company_address_full: String(company.address_full || "").trim(),
        origin_key: originKey,
        origin_label: ORIGIN_LABELS[originKey] || ORIGIN_LABELS.manual,
        history_rows: historyRows,
        entered_stages: enteredStages,
        stage_entered_at: stageEnteredAt,
        aging_days: agingDays,
        won_at: wonAt,
        cycle_days: cycleDays,
        days_without_update: daysWithoutUpdate,
        expected_close_delay_days: expectedCloseDelayDays,
        overdue_tasks: overdueTasksByCompanyId.get(companyId) || 0,
        is_won: stage === "ganho" || status === "won",
        is_lost: stage === "perdido" || status === "lost",
        is_open: !(stage === "ganho" || stage === "perdido" || status === "won" || status === "lost")
      };
    });
  }, [funnelData.opportunities, overdueTasksByCompanyId, providersByCompanyId, stageHistoryByOpportunity, usersById]);

  const funnelCityFilterParsed = useMemo(() => parseCityUfFilter(funnelCityFilter), [funnelCityFilter]);

  const funnelOwnerOptions = useMemo(() => {
    const map = new Map();
    for (const row of enrichedFunnelRows) {
      const key = row.owner_user_id || "unassigned";
      const label = row.owner_label || "Usuário";
      if (!map.has(key)) map.set(key, label);
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [enrichedFunnelRows]);

  const funnelSegmentOptions = useMemo(() => {
    const set = new Set();
    for (const row of enrichedFunnelRows) {
      const segment = String(row.company_segment || "").trim();
      if (segment) set.add(segment);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [enrichedFunnelRows]);

  useEffect(() => {
    setFunnelSegmentFilters((previous) => previous.filter((segment) => funnelSegmentOptions.includes(segment)));
  }, [funnelSegmentOptions]);

  const filteredFunnelRows = useMemo(() => {
    const startMs = toDateMs(funnelStartDate, false);
    const endMs = toDateMs(funnelEndDate, true);
    const minValue = parseMoneyFilter(funnelMinValue);
    const maxValue = parseMoneyFilter(funnelMaxValue);

    return enrichedFunnelRows.filter((row) => {
      const createdMs = Number(new Date(row.created_at || 0).getTime());
      if (!Number.isFinite(createdMs)) return false;

      if (startMs !== null && createdMs < startMs) return false;
      if (endMs !== null && createdMs > endMs) return false;

      if (funnelOnlyOpen && !row.is_open) return false;
      if (funnelOwnerFilter !== "all") {
        if (funnelOwnerFilter === "unassigned") {
          if (row.owner_user_id) return false;
        } else if (row.owner_user_id !== funnelOwnerFilter) {
          return false;
        }
      }
      if (funnelStageFilter !== "all" && row.stage !== funnelStageFilter) return false;
      if (funnelSegmentFilters.length && !funnelSegmentFilters.includes(row.company_segment)) return false;
      if (funnelOriginFilter !== "all" && row.origin_key !== funnelOriginFilter) return false;
      if (!matchesCityUfFilter({ city: row.company_city, state: row.company_state }, funnelCityFilterParsed)) return false;

      if (minValue !== null && row.estimated_value < minValue) return false;
      if (maxValue !== null && row.estimated_value > maxValue) return false;

      return true;
    });
  }, [
    enrichedFunnelRows,
    funnelStartDate,
    funnelEndDate,
    funnelOnlyOpen,
    funnelOwnerFilter,
    funnelStageFilter,
    funnelSegmentFilters,
    funnelOriginFilter,
    funnelCityFilterParsed,
    funnelMinValue,
    funnelMaxValue
  ]);

  const funnelKpis = useMemo(() => {
    const total = filteredFunnelRows.length;
    const wonRows = filteredFunnelRows.filter((row) => row.is_won);
    const lostRows = filteredFunnelRows.filter((row) => row.is_lost);
    const openRows = filteredFunnelRows.filter((row) => row.is_open);

    const totalValue = filteredFunnelRows.reduce((sum, row) => sum + row.estimated_value, 0);
    const weightedForecast = filteredFunnelRows.reduce((sum, row) => sum + row.weighted_value, 0);
    const openValue = openRows.reduce((sum, row) => sum + row.estimated_value, 0);

    const wonCycleRows = wonRows.filter((row) => Number.isFinite(row.cycle_days));
    const avgCycleDays = wonCycleRows.length
      ? wonCycleRows.reduce((sum, row) => sum + Number(row.cycle_days || 0), 0) / wonCycleRows.length
      : null;

    const now = new Date();
    const next30 = new Date();
    next30.setDate(now.getDate() + 30);
    const next7 = new Date();
    next7.setDate(now.getDate() + 7);
    const forecastNext30Days = openRows
      .filter((row) => {
        if (!row.expected_close_date) return false;
        const expectedMs = toDateMs(row.expected_close_date, true);
        if (expectedMs === null) return false;
        return expectedMs >= now.getTime() && expectedMs <= next30.getTime();
      })
      .reduce((sum, row) => sum + row.weighted_value, 0);

    const openWithoutExpectedCloseCount = openRows.filter((row) => !row.expected_close_date).length;
    const openCloseNext7DaysCount = openRows.filter((row) => {
      if (!row.expected_close_date) return false;
      const expectedMs = toDateMs(row.expected_close_date, true);
      if (expectedMs === null) return false;
      return expectedMs >= now.getTime() && expectedMs <= next7.getTime();
    }).length;

    const overdueCloseCount = openRows.filter((row) => row.expected_close_delay_days > 0).length;
    const staleWithoutUpdate = openRows.filter((row) => row.days_without_update > 14).length;

    return {
      total,
      totalValue,
      weightedForecast,
      openValue,
      wonCount: wonRows.length,
      lostCount: lostRows.length,
      openCount: openRows.length,
      winRate: total ? (wonRows.length / total) * 100 : 0,
      avgTicket: total ? totalValue / total : 0,
      avgCycleDays,
      forecastNext30Days,
      openWithoutExpectedCloseCount,
      openCloseNext7DaysCount,
      overdueCloseCount,
      staleWithoutUpdate
    };
  }, [filteredFunnelRows]);

  const funnelByStage = useMemo(() => {
    return PIPELINE_STAGES.map((stage) => {
      const rows = filteredFunnelRows.filter((row) => row.stage === stage.value);
      const openRows = rows.filter((row) => row.is_open);
      const avgAging = openRows.length
        ? openRows.reduce((sum, row) => sum + row.aging_days, 0) / openRows.length
        : 0;

      return {
        stage: stage.value,
        stageLabel: stage.label,
        count: rows.length,
        totalValue: rows.reduce((sum, row) => sum + row.estimated_value, 0),
        weightedValue: rows.reduce((sum, row) => sum + row.weighted_value, 0),
        avgAging,
        gt15: openRows.filter((row) => row.aging_days > 15).length,
        gt30: openRows.filter((row) => row.aging_days > 30).length,
        gt60: openRows.filter((row) => row.aging_days > 60).length
      };
    });
  }, [filteredFunnelRows]);

  const funnelStageScale = useMemo(() => {
    const maxCount = Math.max(1, ...funnelByStage.map((row) => Number(row.count || 0)));
    const maxValue = Math.max(1, ...funnelByStage.map((row) => Number(row.totalValue || 0)));
    return { maxCount, maxValue };
  }, [funnelByStage]);

  const conversionByStage = useMemo(() => {
    return FUNNEL_FLOW.map(([fromStage, toStage]) => {
      const entered = filteredFunnelRows.filter((row) => row.entered_stages.has(fromStage));
      const advanced = entered.filter((row) =>
        row.history_rows.some(
          (historyRow) =>
            String(historyRow?.from_stage || "").trim() === fromStage &&
            String(historyRow?.to_stage || "").trim() === toStage
        )
      );

      return {
        fromStage,
        toStage,
        fromLabel: stageLabel(fromStage),
        toLabel: stageLabel(toStage),
        enteredCount: entered.length,
        advancedCount: advanced.length,
        rate: entered.length ? (advanced.length / entered.length) * 100 : 0
      };
    });
  }, [filteredFunnelRows]);

  const performanceByOwner = useMemo(() => {
    const grouped = new Map();

    for (const row of filteredFunnelRows) {
      const key = row.owner_user_id || "unassigned";
      if (!grouped.has(key)) {
        grouped.set(key, {
          ownerKey: key,
          ownerLabel: row.owner_label || "Usuário",
          totalCount: 0,
          openCount: 0,
          wonCount: 0,
          lostCount: 0,
          totalValue: 0,
          weightedValue: 0
        });
      }

      const current = grouped.get(key);
      current.totalCount += 1;
      current.totalValue += row.estimated_value;
      current.weightedValue += row.weighted_value;
      if (row.is_won) current.wonCount += 1;
      else if (row.is_lost) current.lostCount += 1;
      else current.openCount += 1;
    }

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        winRate: item.totalCount ? (item.wonCount / item.totalCount) * 100 : 0
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [filteredFunnelRows]);

  const performanceBySegment = useMemo(() => {
    const grouped = new Map();

    for (const row of filteredFunnelRows) {
      const key = row.company_segment || "Sem segmento";
      if (!grouped.has(key)) {
        grouped.set(key, {
          segment: key,
          totalCount: 0,
          wonCount: 0,
          lostCount: 0,
          openCount: 0,
          totalValue: 0,
          weightedValue: 0
        });
      }

      const current = grouped.get(key);
      current.totalCount += 1;
      current.totalValue += row.estimated_value;
      current.weightedValue += row.weighted_value;
      if (row.is_won) current.wonCount += 1;
      else if (row.is_lost) current.lostCount += 1;
      else current.openCount += 1;
    }

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        winRate: item.totalCount ? (item.wonCount / item.totalCount) * 100 : 0
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [filteredFunnelRows]);

  const lossesByStage = useMemo(() => {
    const grouped = new Map();

    for (const row of filteredFunnelRows) {
      if (!row.is_lost) continue;
      const reversedHistory = [...row.history_rows].reverse();
      const lossTransition = reversedHistory.find((historyRow) => String(historyRow?.to_stage || "").trim() === "perdido");
      const sourceStage = String(lossTransition?.from_stage || row.stage || "perdido").trim();
      const key = sourceStage || "perdido";

      if (!grouped.has(key)) {
        grouped.set(key, {
          stage: key,
          stageLabel: stageLabel(key) || key,
          totalCount: 0,
          totalValue: 0
        });
      }

      const current = grouped.get(key);
      current.totalCount += 1;
      current.totalValue += row.estimated_value;
    }

    return Array.from(grouped.values()).sort((a, b) => b.totalCount - a.totalCount);
  }, [filteredFunnelRows]);

  const riskRows = useMemo(() => {
    const risks = [];

    for (const row of filteredFunnelRows) {
      if (!row.is_open) continue;

      let score = 0;
      const reasons = [];
      if (row.overdue_tasks > 0) {
        score += 2;
        reasons.push(`Tarefas atrasadas: ${row.overdue_tasks}`);
      }
      if (row.expected_close_delay_days > 0) {
        score += 2;
        reasons.push(`Previsão vencida há ${row.expected_close_delay_days} dia(s)`);
      }
      if (row.aging_days > 30) {
        score += 1;
        reasons.push(`Aging da etapa: ${row.aging_days} dia(s)`);
      }
      if (row.days_without_update > 14) {
        score += 1;
        reasons.push(`Sem atualização há ${row.days_without_update} dia(s)`);
      }

      if (!score) continue;

      risks.push({
        ...row,
        risk_score: score,
        risk_reasons: reasons.join(" | ")
      });
    }

    return risks
      .sort((a, b) => {
        if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score;
        if (b.aging_days !== a.aging_days) return b.aging_days - a.aging_days;
        return b.estimated_value - a.estimated_value;
      })
      .slice(0, 50);
  }, [filteredFunnelRows]);

  async function handleExportCompaniesExcel() {
    if (!filteredCompanyRows.length) {
      setCompaniesError("Nenhuma empresa para exportar com os filtros atuais.");
      return;
    }

    const reportRows = filteredCompanyRows.map((row) => ({
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
    XLSX.writeFile(workbook, `relatorio_empresas_${todayYmd()}.xlsx`);
  }

  async function handleExportFunnelExcel() {
    if (!filteredFunnelRows.length) {
      setFunnelError("Nenhuma oportunidade no funil para exportar com os filtros atuais.");
      return;
    }

    const summaryRows = [
      { Indicador: "Oportunidades", Valor: funnelKpis.total },
      { Indicador: "Valor total", Valor: funnelKpis.totalValue },
      { Indicador: "Forecast ponderado", Valor: funnelKpis.weightedForecast },
      { Indicador: "Valor aberto", Valor: funnelKpis.openValue },
      { Indicador: "Ganhos", Valor: funnelKpis.wonCount },
      { Indicador: "Perdidos", Valor: funnelKpis.lostCount },
      { Indicador: "Taxa de ganho (%)", Valor: Number(funnelKpis.winRate.toFixed(2)) },
      { Indicador: "Ticket médio", Valor: funnelKpis.avgTicket },
      { Indicador: "Ciclo médio ganho (dias)", Valor: funnelKpis.avgCycleDays === null ? "-" : Number(funnelKpis.avgCycleDays.toFixed(2)) },
      { Indicador: "Forecast 30 dias (ponderado)", Valor: funnelKpis.forecastNext30Days },
      { Indicador: "Abertas com fechamento em até 7 dias", Valor: funnelKpis.openCloseNext7DaysCount },
      { Indicador: "Abertas sem previsão de fechamento", Valor: funnelKpis.openWithoutExpectedCloseCount },
      { Indicador: "Abertas com previsão vencida", Valor: funnelKpis.overdueCloseCount },
      { Indicador: "Abertas sem atualização >14 dias", Valor: funnelKpis.staleWithoutUpdate }
    ];

    const stageRows = funnelByStage.map((row) => ({
      Etapa: row.stageLabel,
      Oportunidades: row.count,
      "Valor total": row.totalValue,
      "Forecast ponderado": row.weightedValue,
      "Aging médio (dias)": Number(row.avgAging.toFixed(2)),
      "> 15 dias": row.gt15,
      "> 30 dias": row.gt30,
      "> 60 dias": row.gt60
    }));

    const conversionRows = conversionByStage.map((row) => ({
      "Da etapa": row.fromLabel,
      "Para etapa": row.toLabel,
      Entraram: row.enteredCount,
      Avancaram: row.advancedCount,
      "Taxa (%)": Number(row.rate.toFixed(2))
    }));

    const ownerRows = performanceByOwner.map((row) => ({
      Vendedor: row.ownerLabel,
      Oportunidades: row.totalCount,
      Abertas: row.openCount,
      Ganhas: row.wonCount,
      Perdidas: row.lostCount,
      "Taxa ganho (%)": Number(row.winRate.toFixed(2)),
      "Valor total": row.totalValue,
      "Forecast ponderado": row.weightedValue
    }));

    const segmentRows = performanceBySegment.map((row) => ({
      Segmento: row.segment,
      Oportunidades: row.totalCount,
      Abertas: row.openCount,
      Ganhas: row.wonCount,
      Perdidas: row.lostCount,
      "Taxa ganho (%)": Number(row.winRate.toFixed(2)),
      "Valor total": row.totalValue,
      "Forecast ponderado": row.weightedValue
    }));

    const lossRows = lossesByStage.map((row) => ({
      "Etapa de perda": row.stageLabel,
      Perdidas: row.totalCount,
      "Valor perdido": row.totalValue
    }));

    const riskSheetRows = riskRows.map((row) => ({
      Empresa: row.company_trade_name,
      Oportunidade: row.title,
      Etapa: row.stage_label,
      Vendedor: row.owner_label,
      Valor: row.estimated_value,
      "Aging etapa (dias)": row.aging_days,
      "Sem atualização (dias)": row.days_without_update,
      "Cadastro oportunidade": formatDate(row.created_at),
      "Previsão fechamento": formatDate(row.expected_close_date),
      "Previsão vencida (dias)": row.expected_close_delay_days,
      "Tarefas atrasadas": row.overdue_tasks,
      "Score risco": row.risk_score,
      Motivos: row.risk_reasons
    }));

    const opportunitiesRows = filteredFunnelRows.map((row) => ({
      Empresa: row.company_trade_name,
      Oportunidade: row.title,
      Etapa: row.stage_label,
      Status: row.status,
      Vendedor: row.owner_label,
      Segmento: row.company_segment || "Sem segmento",
      Origem: row.origin_label,
      Cidade: row.company_city || "",
      UF: row.company_state || "",
      Valor: row.estimated_value,
      "Probabilidade (%)": row.close_probability,
      "Valor ponderado": row.weighted_value,
      "Cadastro oportunidade": formatDate(row.created_at),
      "Prev. fechamento": formatDate(row.expected_close_date),
      "Aging etapa (dias)": row.aging_days,
      "Tarefas atrasadas": row.overdue_tasks,
      "Atualizada em": formatDate(row.updated_at)
    }));

    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Resumo");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(stageRows), "Funil por etapa");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(conversionRows), "Conversao etapas");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ownerRows), "Por vendedor");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(segmentRows), "Por segmento");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(lossRows), "Perdas por etapa");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(riskSheetRows), "Riscos");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(opportunitiesRows), "Oportunidades");

    XLSX.writeFile(workbook, `relatorio_funil_analitico_${todayYmd()}.xlsx`);
  }

  return (
    <section className="module reports-module">
      <article className="panel reports-panel reports-companies top-gap">
        <div className="reports-header">
          <div className="reports-heading">
            <h2>Relatório de empresas cadastradas</h2>
            <p className="muted reports-intro">Filtre os registros e exporte para Excel.</p>
          </div>

          <div className="kpi-grid reports-kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Total de empresas</span>
              <strong className="kpi-value">{companyRows.length}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Empresas filtradas</span>
              <strong className="kpi-value">{filteredCompanyRows.length}</strong>
            </div>
          </div>
        </div>

        <div className="inline-actions reports-toolbar">
          <input
            value={companySearch}
            onChange={(event) => setCompanySearch(event.target.value)}
            placeholder="Buscar por nome, CNPJ, e-mail, telefone..."
          />
          <input
            value={companyCityFilter}
            onChange={(event) => setCompanyCityFilter(event.target.value)}
            placeholder="Cidade (filtro exato)"
          />
          <select value={companyStageFilter} onChange={(event) => setCompanyStageFilter(event.target.value)}>
            <option value="all">Todas as fases</option>
            <option value="Sem fase">Sem fase</option>
            {companyStageOptions.map((stageName) => (
              <option key={stageName} value={stageName}>
                {stageName}
              </option>
            ))}
          </select>
          <button type="button" className="btn-ghost" onClick={loadCompaniesReport} disabled={companiesLoading}>
            {companiesLoading ? "Atualizando..." : "Atualizar"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleExportCompaniesExcel}
            disabled={companiesLoading || !filteredCompanyRows.length}
          >
            Exportar Excel (.xlsx)
          </button>
        </div>

        {companiesError ? <p className="error-text">{companiesError}</p> : null}

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
              {!companiesLoading && !filteredCompanyRows.length ? (
                <tr>
                  <td colSpan={7}>Nenhuma empresa encontrada.</td>
                </tr>
              ) : null}
              {filteredCompanyRows.map((row) => (
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

      <article className="panel reports-panel reports-funnel">
        <div className="reports-header">
          <div className="reports-heading">
            <h2>Relatório analítico do funil de vendas</h2>
            <p className="muted reports-intro">
              Visão executiva, diagnóstico de gargalos e lista de oportunidades em risco para ação rápida.
            </p>
          </div>

          <div className="kpi-grid reports-kpi-grid reports-funnel-kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Oportunidades filtradas</span>
              <strong className="kpi-value">{funnelKpis.total}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Taxa de ganho</span>
              <strong className="kpi-value">{formatPercent(funnelKpis.winRate)}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Valor total</span>
              <strong className="kpi-value">{formatCurrency(funnelKpis.totalValue)}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Forecast ponderado</span>
              <strong className="kpi-value">{formatCurrency(funnelKpis.weightedForecast)}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Ticket médio</span>
              <strong className="kpi-value">{formatCurrency(funnelKpis.avgTicket)}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Ciclo médio (ganho)</span>
              <strong className="kpi-value">
                {funnelKpis.avgCycleDays === null ? "-" : `${formatDecimal(funnelKpis.avgCycleDays, 1)} dias`}
              </strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Forecast 30 dias</span>
              <strong className="kpi-value">{formatCurrency(funnelKpis.forecastNext30Days)}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Fecham em 7 dias</span>
              <strong className="kpi-value">{funnelKpis.openCloseNext7DaysCount}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Abertas sem previsão</span>
              <strong className="kpi-value">{funnelKpis.openWithoutExpectedCloseCount}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Abertas em risco</span>
              <strong className="kpi-value">{riskRows.length}</strong>
            </div>
          </div>
        </div>

        <div className="reports-funnel-toolbar">
          <label className="reports-filter-field">
            <span>Período inicial</span>
            <input type="date" value={funnelStartDate} onChange={(event) => setFunnelStartDate(event.target.value)} />
          </label>
          <label className="reports-filter-field">
            <span>Período final</span>
            <input type="date" value={funnelEndDate} onChange={(event) => setFunnelEndDate(event.target.value)} />
          </label>
          <label className="reports-filter-field">
            <span>Vendedor</span>
            <select value={funnelOwnerFilter} onChange={(event) => setFunnelOwnerFilter(event.target.value)}>
              <option value="all">Todos</option>
              {funnelOwnerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="reports-filter-field">
            <span>Etapa</span>
            <select value={funnelStageFilter} onChange={(event) => setFunnelStageFilter(event.target.value)}>
              <option value="all">Todas</option>
              {PIPELINE_STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          <label className="reports-filter-field">
            <span>Segmento</span>
            <details className="multi-checkbox-filter">
              <summary className="multi-checkbox-summary">{segmentFilterSummary(funnelSegmentFilters)}</summary>
              <div className="multi-checkbox-menu">
                <label className="multi-checkbox-option">
                  <input
                    type="checkbox"
                    checked={!funnelSegmentFilters.length}
                    onChange={() => setFunnelSegmentFilters([])}
                  />
                  Todos
                </label>
                {funnelSegmentOptions.map((segment) => (
                  <label key={segment} className="multi-checkbox-option">
                    <input
                      type="checkbox"
                      checked={funnelSegmentFilters.includes(segment)}
                      onChange={() => setFunnelSegmentFilters((previous) => toggleMultiValue(previous, segment))}
                    />
                    {segment}
                  </label>
                ))}
              </div>
            </details>
          </label>
          <label className="reports-filter-field">
            <span>Origem</span>
            <select value={funnelOriginFilter} onChange={(event) => setFunnelOriginFilter(event.target.value)}>
              {Object.entries(ORIGIN_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="reports-filter-field">
            <span>Cidade/UF</span>
            <input
              value={funnelCityFilter}
              onChange={(event) => setFunnelCityFilter(event.target.value)}
              placeholder="Ex.: BRUSQUE ou BRUSQUE/SC"
            />
          </label>
          <label className="reports-filter-field">
            <span>Valor mínimo</span>
            <input value={funnelMinValue} onChange={(event) => setFunnelMinValue(event.target.value)} placeholder="0" />
          </label>
          <label className="reports-filter-field">
            <span>Valor máximo</span>
            <input value={funnelMaxValue} onChange={(event) => setFunnelMaxValue(event.target.value)} placeholder="0" />
          </label>
          <label className="checkbox-inline reports-filter-checkbox">
            <input type="checkbox" checked={funnelOnlyOpen} onChange={(event) => setFunnelOnlyOpen(event.target.checked)} />
            Somente abertas
          </label>
          <div className="inline-actions reports-funnel-actions">
            <button type="button" className="btn-ghost" onClick={loadFunnelReport} disabled={funnelLoading}>
              {funnelLoading ? "Atualizando..." : "Atualizar dados"}
            </button>
            <button type="button" className="btn-primary" onClick={handleExportFunnelExcel} disabled={funnelLoading || !filteredFunnelRows.length}>
              Exportar funil (.xlsx)
            </button>
          </div>
        </div>

        {funnelError ? <p className="error-text">{funnelError}</p> : null}

        <div className="reports-funnel-visual">
          <h3>Visão gráfica do funil</h3>
          <div className="reports-stage-chart-grid">
            {funnelByStage.map((row) => {
              const color = STAGE_COLOR_BY_KEY[row.stage] || "#7c3aed";
              const countWidth = row.count > 0 ? Math.max(8, (Number(row.count || 0) / funnelStageScale.maxCount) * 100) : 0;
              const valueWidth = row.totalValue > 0 ? Math.max(8, (Number(row.totalValue || 0) / funnelStageScale.maxValue) * 100) : 0;
              return (
                <article key={`visual-${row.stage}`} className="reports-stage-chart-card">
                  <header>
                    <strong>{row.stageLabel}</strong>
                    <span>{row.count} op.</span>
                  </header>
                  <div className="reports-stage-chart-row">
                    <span>Volume</span>
                    <div className="reports-stage-chart-track">
                      <span className="reports-stage-chart-fill" style={{ width: `${countWidth}%`, background: color }} />
                    </div>
                  </div>
                  <div className="reports-stage-chart-row">
                    <span>Valor</span>
                    <div className="reports-stage-chart-track">
                      <span className="reports-stage-chart-fill" style={{ width: `${valueWidth}%`, background: color }} />
                    </div>
                  </div>
                  <small>{formatCurrency(row.totalValue)}</small>
                </article>
              );
            })}
          </div>
        </div>

        <div className="table-wrap reports-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Oportunidades</th>
                <th>Valor</th>
                <th>Forecast</th>
                <th>Aging médio</th>
                <th>&gt;15d</th>
                <th>&gt;30d</th>
                <th>&gt;60d</th>
              </tr>
            </thead>
            <tbody>
              {!funnelLoading && !funnelByStage.some((row) => row.count > 0) ? (
                <tr>
                  <td colSpan={8}>Sem dados para o funil no filtro selecionado.</td>
                </tr>
              ) : null}
              {funnelByStage.map((row) => (
                <tr key={row.stage}>
                  <td>{row.stageLabel}</td>
                  <td>{row.count}</td>
                  <td>{formatCurrency(row.totalValue)}</td>
                  <td>{formatCurrency(row.weightedValue)}</td>
                  <td>{formatDecimal(row.avgAging, 1)} dias</td>
                  <td>{row.gt15}</td>
                  <td>{row.gt30}</td>
                  <td>{row.gt60}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="reports-grid-two top-gap">
          <div className="table-wrap reports-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Conversão</th>
                  <th>Entraram</th>
                  <th>Avançaram</th>
                  <th>Taxa</th>
                </tr>
              </thead>
              <tbody>
                {conversionByStage.map((row) => (
                  <tr key={`${row.fromStage}-${row.toStage}`}>
                    <td>{row.fromLabel} → {row.toLabel}</td>
                    <td>{row.enteredCount}</td>
                    <td>{row.advancedCount}</td>
                    <td>{formatPercent(row.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap reports-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Oport.</th>
                  <th>Ganhas</th>
                  <th>Taxa</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {!performanceByOwner.length ? (
                  <tr>
                    <td colSpan={5}>Sem dados por vendedor.</td>
                  </tr>
                ) : null}
                {performanceByOwner.map((row) => (
                  <tr key={row.ownerKey}>
                    <td>{row.ownerLabel}</td>
                    <td>{row.totalCount}</td>
                    <td>{row.wonCount}</td>
                    <td>{formatPercent(row.winRate)}</td>
                    <td>{formatCurrency(row.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="reports-grid-two top-gap">
          <div className="table-wrap reports-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Segmento</th>
                  <th>Oport.</th>
                  <th>Ganhas</th>
                  <th>Taxa</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {!performanceBySegment.length ? (
                  <tr>
                    <td colSpan={5}>Sem dados por segmento.</td>
                  </tr>
                ) : null}
                {performanceBySegment.map((row) => (
                  <tr key={row.segment}>
                    <td>{row.segment}</td>
                    <td>{row.totalCount}</td>
                    <td>{row.wonCount}</td>
                    <td>{formatPercent(row.winRate)}</td>
                    <td>{formatCurrency(row.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap reports-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Etapa de perda</th>
                  <th>Perdidas</th>
                  <th>Valor perdido</th>
                </tr>
              </thead>
              <tbody>
                {!lossesByStage.length ? (
                  <tr>
                    <td colSpan={3}>Sem perdas no filtro atual.</td>
                  </tr>
                ) : null}
                {lossesByStage.map((row) => (
                  <tr key={row.stage}>
                    <td>{row.stageLabel}</td>
                    <td>{row.totalCount}</td>
                    <td>{formatCurrency(row.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <h3 className="top-gap">Oportunidades em risco (prioridade de ação)</h3>
        <div className="table-wrap reports-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Score</th>
                <th>Empresa</th>
                <th>Oportunidade</th>
                <th>Etapa</th>
                <th>Vendedor</th>
                <th>Valor</th>
                <th>Cadastro</th>
                <th>Prev. fechamento</th>
                <th>Aging</th>
                <th>Riscos detectados</th>
              </tr>
            </thead>
            <tbody>
              {!riskRows.length ? (
                <tr>
                  <td colSpan={10}>Nenhuma oportunidade em risco no filtro atual.</td>
                </tr>
              ) : null}
              {riskRows.map((row) => (
                <tr key={`risk-${row.id}`}>
                  <td>{row.risk_score}</td>
                  <td>{row.company_trade_name}</td>
                  <td>{row.title}</td>
                  <td>{row.stage_label}</td>
                  <td>{row.owner_label}</td>
                  <td>{formatCurrency(row.estimated_value)}</td>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{formatDate(row.expected_close_date)}</td>
                  <td>{row.aging_days} dias</td>
                  <td>{row.risk_reasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="top-gap">Base analítica de oportunidades</h3>
        <div className="table-wrap reports-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Oportunidade</th>
                <th>Etapa</th>
                <th>Vendedor</th>
                <th>Origem</th>
                <th>Segmento</th>
                <th>Cidade/UF</th>
                <th>Valor</th>
                <th>Forecast</th>
                <th>Cadastro</th>
                <th>Prev. fechamento</th>
                <th>Aging</th>
              </tr>
            </thead>
            <tbody>
              {!filteredFunnelRows.length ? (
                <tr>
                  <td colSpan={12}>Nenhuma oportunidade encontrada com os filtros atuais.</td>
                </tr>
              ) : null}
              {filteredFunnelRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.company_trade_name}</td>
                  <td>{row.title}</td>
                  <td>{row.stage_label}</td>
                  <td>{row.owner_label}</td>
                  <td>{row.origin_label}</td>
                  <td>{row.company_segment || "Sem segmento"}</td>
                  <td>{[row.company_city, row.company_state].filter(Boolean).join("/") || "-"}</td>
                  <td>{formatCurrency(row.estimated_value)}</td>
                  <td>{formatCurrency(row.weighted_value)}</td>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{formatDate(row.expected_close_date)}</td>
                  <td>{row.aging_days} dias</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
