export const CRM_ACCESS_MODULES = [
  "dashboard",
  "pipeline",
  "hunter",
  "companies",
  "contacts",
  "tasks",
  "reports",
  "orders",
  "service",
  "settings"
];

export const CRM_ACCESS_LEVELS = ["none", "read", "edit", "admin"];

export const CRM_MODULE_LABELS = {
  dashboard: "Dashboard",
  pipeline: "Pipeline",
  hunter: "Fluxo",
  companies: "Empresas",
  contacts: "Contatos",
  tasks: "Agenda",
  reports: "Relatórios",
  orders: "Pedidos",
  service: "Assistência",
  settings: "Configurações"
};

const ACCESS_LEVEL_WEIGHT = {
  none: 0,
  read: 1,
  edit: 2,
  admin: 3
};

export const CRM_ROLE_DEFAULT_PERMISSIONS = {
  admin: {
    dashboard: "admin",
    pipeline: "admin",
    hunter: "admin",
    companies: "admin",
    contacts: "admin",
    tasks: "admin",
    reports: "admin",
    orders: "admin",
    service: "admin",
    settings: "admin"
  },
  manager: {
    dashboard: "admin",
    pipeline: "admin",
    hunter: "admin",
    companies: "admin",
    contacts: "admin",
    tasks: "admin",
    reports: "admin",
    orders: "admin",
    service: "admin",
    settings: "read"
  },
  sales: {
    dashboard: "read",
    pipeline: "edit",
    hunter: "read",
    companies: "edit",
    contacts: "edit",
    tasks: "edit",
    reports: "read",
    orders: "edit",
    service: "edit",
    settings: "none"
  },
  backoffice: {
    dashboard: "read",
    pipeline: "read",
    hunter: "edit",
    companies: "edit",
    contacts: "edit",
    tasks: "edit",
    reports: "edit",
    orders: "read",
    service: "edit",
    settings: "none"
  }
};

export function normalizeUserRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "manager" || normalized === "sales" || normalized === "backoffice") {
    return normalized;
  }
  return "sales";
}

export function normalizeUserStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "active" || normalized === "inactive") return normalized;
  return "active";
}

export function normalizeAccessLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return CRM_ACCESS_LEVELS.includes(normalized) ? normalized : "none";
}

export function sanitizeUserPermissions(value, role = "sales") {
  const normalizedRole = normalizeUserRole(role);
  const fallback = CRM_ROLE_DEFAULT_PERMISSIONS[normalizedRole] || CRM_ROLE_DEFAULT_PERMISSIONS.sales;
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const next = {};

  for (const moduleId of CRM_ACCESS_MODULES) {
    const level = normalizeAccessLevel(source[moduleId] || fallback[moduleId] || "none");
    next[moduleId] = level;
  }

  return next;
}

export function hasModulePermission(user, moduleId, requiredLevel = "read") {
  const normalizedModule = String(moduleId || "").trim();
  if (!normalizedModule || !CRM_ACCESS_MODULES.includes(normalizedModule)) return false;

  const required = normalizeAccessLevel(requiredLevel);
  const role = normalizeUserRole(user?.role);
  const status = normalizeUserStatus(user?.status);
  if (status !== "active") return false;

  const permissions = sanitizeUserPermissions(user?.permissions, role);
  const current = normalizeAccessLevel(permissions[normalizedModule]);
  return ACCESS_LEVEL_WEIGHT[current] >= ACCESS_LEVEL_WEIGHT[required];
}

export function roleDefaultPermissions(role = "sales") {
  return sanitizeUserPermissions({}, role);
}

export function buildPermissionSummary(permissions, role = "sales") {
  const normalized = sanitizeUserPermissions(permissions, role);
  let adminCount = 0;
  let editCount = 0;
  let readCount = 0;
  let noneCount = 0;

  for (const moduleId of CRM_ACCESS_MODULES) {
    const level = normalized[moduleId];
    if (level === "admin") adminCount += 1;
    else if (level === "edit") editCount += 1;
    else if (level === "read") readCount += 1;
    else noneCount += 1;
  }

  return `Admin ${adminCount} · Edição ${editCount} · Leitura ${readCount} · Sem acesso ${noneCount}`;
}

export function resolveSearchResultModule(item) {
  const entityType = String(item?.entity_type || "").trim().toLowerCase();
  if (entityType === "company") return "companies";
  if (entityType === "contact") return "contacts";

  const tab = String(item?.tab || "").trim().toLowerCase();
  if (!tab) return "";
  if (CRM_ACCESS_MODULES.includes(tab)) return tab;
  return "";
}
