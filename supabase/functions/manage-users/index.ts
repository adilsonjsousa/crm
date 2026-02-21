import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type AnyRecord = Record<string, unknown>;
type UserRole = "admin" | "manager" | "sales" | "backoffice";
type UserStatus = "active" | "inactive";
type PermissionLevel = "none" | "read" | "edit" | "admin";

type UserPermissionMap = Record<string, PermissionLevel>;

type AppUserRow = {
  user_id: string;
  email: string;
  full_name: string;
  whatsapp: string | null;
  role: UserRole;
  status: UserStatus;
  permissions: UserPermissionMap;
  invited_at: string | null;
  last_invite_sent_at: string | null;
  last_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const ACCESS_MODULES = ["dashboard", "pipeline", "companies", "contacts", "tasks", "reports", "settings"];
const ACCESS_LEVELS = ["none", "read", "edit", "admin"];

const DEFAULT_PERMISSIONS: Record<UserRole, UserPermissionMap> = {
  admin: {
    dashboard: "admin",
    pipeline: "admin",
    companies: "admin",
    contacts: "admin",
    tasks: "admin",
    reports: "admin",
    settings: "admin"
  },
  manager: {
    dashboard: "admin",
    pipeline: "admin",
    companies: "admin",
    contacts: "admin",
    tasks: "admin",
    reports: "admin",
    settings: "read"
  },
  sales: {
    dashboard: "read",
    pipeline: "edit",
    companies: "edit",
    contacts: "edit",
    tasks: "edit",
    reports: "read",
    settings: "none"
  },
  backoffice: {
    dashboard: "read",
    pipeline: "read",
    companies: "edit",
    contacts: "edit",
    tasks: "edit",
    reports: "edit",
    settings: "none"
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function asObject(value: unknown): AnyRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as AnyRecord;
  return {};
}

function normalizeRole(value: unknown): UserRole {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "manager" || normalized === "sales" || normalized === "backoffice") {
    return normalized;
  }
  return "sales";
}

function normalizeStatus(value: unknown): UserStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "active" || normalized === "inactive") return normalized;
  return "active";
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWhatsApp(value: unknown) {
  const raw = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return raw || null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cloneRolePermissions(role: UserRole): UserPermissionMap {
  return { ...(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.sales) };
}

function sanitizePermissions(value: unknown, role: UserRole): UserPermissionMap {
  const fallback = cloneRolePermissions(role);
  const source = asObject(value);
  const next: UserPermissionMap = {};

  for (const moduleId of ACCESS_MODULES) {
    const level = String(source[moduleId] ?? fallback[moduleId] ?? "none")
      .trim()
      .toLowerCase();
    next[moduleId] = ACCESS_LEVELS.includes(level) ? (level as PermissionLevel) : fallback[moduleId] || "none";
  }

  return next;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env:${name}`);
  return value;
}

function parseRedirectTo(body: AnyRecord) {
  const redirectTo = String(body.redirect_to ?? body.redirectTo ?? "").trim();
  return redirectTo || undefined;
}

function userBanDuration(status: UserStatus) {
  return status === "inactive" ? "876000h" : "none";
}

async function listAllAuthUsers(adminClient: ReturnType<typeof createClient>) {
  const users: AnyRecord[] = [];
  const perPage = 200;

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message || "Falha ao listar usuários do Auth.");

    const chunk = Array.isArray(data?.users) ? (data.users as AnyRecord[]) : [];
    users.push(...chunk);
    if (chunk.length < perPage) break;
  }

  return users;
}

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  const users = await listAllAuthUsers(adminClient);
  return users.find((item) => normalizeEmail(item.email) === email) || null;
}

async function sendRecoveryEmail(adminClient: ReturnType<typeof createClient>, email: string, redirectTo?: string) {
  const { error } = await adminClient.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (!error) {
    return {
      delivery: "reset_email_sent",
      actionLink: ""
    };
  }

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: redirectTo ? { redirectTo } : undefined
  });

  if (linkError) {
    throw new Error(linkError.message || "Falha ao gerar link de redefinição de senha.");
  }

  const properties = asObject(linkData?.properties);
  return {
    delivery: "link_generated",
    actionLink: String(properties.action_link ?? "")
  };
}

function profileFromAuth(authUser: AnyRecord): AppUserRow {
  const role = normalizeRole(asObject(authUser.app_metadata).crm_role);
  return {
    user_id: String(authUser.id ?? ""),
    email: normalizeEmail(authUser.email),
    full_name: normalizeName(asObject(authUser.user_metadata).full_name) || normalizeEmail(authUser.email),
    whatsapp: null,
    role,
    status: normalizeStatus(asObject(authUser.app_metadata).crm_status),
    permissions: cloneRolePermissions(role),
    invited_at: null,
    last_invite_sent_at: null,
    last_login_at: String(authUser.last_sign_in_at ?? "") || null,
    created_at: String(authUser.created_at ?? "") || null,
    updated_at: String(authUser.updated_at ?? authUser.created_at ?? "") || null
  };
}

function mergeProfileWithAuth(profile: AppUserRow, authUser: AnyRecord | null): AppUserRow {
  const role = normalizeRole(profile.role);
  const status = normalizeStatus(profile.status);
  const authMeta = authUser ? asObject(authUser.app_metadata) : {};
  const finalRole = normalizeRole(profile.role || authMeta.crm_role);
  const finalStatus = normalizeStatus(profile.status || authMeta.crm_status);

  return {
    ...profile,
    email: normalizeEmail(profile.email || authUser?.email),
    full_name: normalizeName(profile.full_name || asObject(authUser?.user_metadata).full_name || authUser?.email),
    role: finalRole || role,
    status: finalStatus || status,
    permissions: sanitizePermissions(profile.permissions, finalRole || role),
    last_login_at: String(authUser?.last_sign_in_at ?? profile.last_login_at ?? "") || null
  };
}

async function handleList(adminClient: ReturnType<typeof createClient>) {
  const { data: profiles, error } = await adminClient
    .from("app_users")
    .select("user_id,email,full_name,whatsapp,role,status,permissions,invited_at,last_invite_sent_at,last_login_at,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Falha ao listar usuários do CRM.");
  }

  const authUsers = await listAllAuthUsers(adminClient);
  const authById = new Map<string, AnyRecord>();
  for (const authUser of authUsers) {
    const userId = String(authUser.id ?? "").trim();
    if (!userId) continue;
    authById.set(userId, authUser);
  }

  const rows: AppUserRow[] = [];
  const profiledIds = new Set<string>();

  for (const item of profiles || []) {
    const profile = {
      user_id: String(item.user_id ?? ""),
      email: normalizeEmail(item.email),
      full_name: normalizeName(item.full_name),
      whatsapp: normalizeWhatsApp(item.whatsapp),
      role: normalizeRole(item.role),
      status: normalizeStatus(item.status),
      permissions: sanitizePermissions(item.permissions, normalizeRole(item.role)),
      invited_at: String(item.invited_at ?? "") || null,
      last_invite_sent_at: String(item.last_invite_sent_at ?? "") || null,
      last_login_at: String(item.last_login_at ?? "") || null,
      created_at: String(item.created_at ?? "") || null,
      updated_at: String(item.updated_at ?? "") || null
    } as AppUserRow;

    profiledIds.add(profile.user_id);
    rows.push(mergeProfileWithAuth(profile, authById.get(profile.user_id) || null));
  }

  for (const authUser of authUsers) {
    const userId = String(authUser.id ?? "").trim();
    if (!userId || profiledIds.has(userId)) continue;

    const email = normalizeEmail(authUser.email);
    if (!email) continue;
    rows.push(profileFromAuth(authUser));
  }

  rows.sort((a, b) => {
    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    return bDate - aDate;
  });

  return rows;
}

async function handleCreate(adminClient: ReturnType<typeof createClient>, body: AnyRecord) {
  const email = normalizeEmail(body.email);
  const fullName = normalizeName(body.full_name);
  const whatsapp = normalizeWhatsApp(body.whatsapp);
  const role = normalizeRole(body.role);
  const status = normalizeStatus(body.status);
  const redirectTo = parseRedirectTo(body);

  if (!email || !isValidEmail(email)) {
    throw new Error("Informe um e-mail válido para login do usuário.");
  }
  if (!fullName) {
    throw new Error("Informe o nome completo do usuário.");
  }

  const permissions = sanitizePermissions(body.permissions, role);

  const { data: existingProfileByEmail } = await adminClient
    .from("app_users")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfileByEmail?.user_id) {
    throw new Error("Já existe um usuário cadastrado com este e-mail.");
  }

  let authUser = await findAuthUserByEmail(adminClient, email);
  let delivery = "existing_user";
  let actionLink = "";

  if (!authUser) {
    const { data: invitedData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        crm_role: role
      },
      redirectTo
    });

    if (!inviteError && invitedData?.user?.id) {
      authUser = invitedData.user as unknown as AnyRecord;
      delivery = "invite_email_sent";
    } else {
      const tempPassword = `Tmp-${crypto.randomUUID()}-Aa1!`;
      const { data: createdData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName
        },
        app_metadata: {
          crm_role: role,
          crm_status: status
        },
        ban_duration: userBanDuration(status)
      });

      if (createError || !createdData?.user?.id) {
        throw new Error(createError?.message || inviteError?.message || "Falha ao criar usuário no Auth.");
      }

      authUser = createdData.user as unknown as AnyRecord;
      const recovery = await sendRecoveryEmail(adminClient, email, redirectTo);
      delivery = recovery.delivery;
      actionLink = recovery.actionLink;
    }
  } else {
    const recovery = await sendRecoveryEmail(adminClient, email, redirectTo);
    delivery = recovery.delivery;
    actionLink = recovery.actionLink;
  }

  const authUserId = String(authUser?.id ?? "").trim();
  if (!authUserId) {
    throw new Error("Falha ao obter identificador do usuário no Auth.");
  }

  const nowIso = new Date().toISOString();
  const { data: upserted, error: upsertError } = await adminClient
    .from("app_users")
    .upsert(
      {
        user_id: authUserId,
        email,
        full_name: fullName,
        whatsapp,
        role,
        status,
        permissions,
        invited_at: nowIso,
        last_invite_sent_at: nowIso
      },
      { onConflict: "user_id" }
    )
    .select("user_id,email,full_name,whatsapp,role,status,permissions,invited_at,last_invite_sent_at,last_login_at,created_at,updated_at")
    .single();

  if (upsertError) {
    throw new Error(upsertError.message || "Falha ao gravar usuário no CRM.");
  }

  const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(authUserId, {
    user_metadata: {
      full_name: fullName
    },
    app_metadata: {
      crm_role: role,
      crm_status: status
    },
    ban_duration: userBanDuration(status)
  });

  if (updateAuthError) {
    throw new Error(updateAuthError.message || "Usuário criado, mas falhou atualizar metadados no Auth.");
  }

  return {
    user: upserted,
    delivery,
    action_link: actionLink
  };
}

async function handleUpdate(adminClient: ReturnType<typeof createClient>, body: AnyRecord) {
  const userId = String(body.user_id ?? "").trim();
  if (!userId) throw new Error("Usuário inválido para atualização.");

  const { data: currentProfile, error: currentError } = await adminClient
    .from("app_users")
    .select("user_id,email,full_name,whatsapp,role,status,permissions")
    .eq("user_id", userId)
    .maybeSingle();

  if (currentError) throw new Error(currentError.message || "Falha ao carregar usuário atual.");

  const authUsers = await listAllAuthUsers(adminClient);
  const authUser = authUsers.find((item) => String(item.id ?? "").trim() === userId) || null;

  const email = normalizeEmail(body.email ?? currentProfile?.email ?? authUser?.email);
  if (!email || !isValidEmail(email)) throw new Error("E-mail do usuário inválido.");

  const fullName = normalizeName(body.full_name ?? currentProfile?.full_name ?? asObject(authUser?.user_metadata).full_name);
  if (!fullName) throw new Error("Informe o nome completo do usuário.");

  const whatsapp = normalizeWhatsApp(body.whatsapp ?? currentProfile?.whatsapp);
  const role = normalizeRole(body.role ?? currentProfile?.role ?? asObject(authUser?.app_metadata).crm_role);
  const status = normalizeStatus(body.status ?? currentProfile?.status ?? asObject(authUser?.app_metadata).crm_status);
  const permissions = sanitizePermissions(body.permissions ?? currentProfile?.permissions, role);

  const { data: upserted, error: upsertError } = await adminClient
    .from("app_users")
    .upsert(
      {
        user_id: userId,
        email,
        full_name: fullName,
        whatsapp,
        role,
        status,
        permissions
      },
      { onConflict: "user_id" }
    )
    .select("user_id,email,full_name,whatsapp,role,status,permissions,invited_at,last_invite_sent_at,last_login_at,created_at,updated_at")
    .single();

  if (upsertError) throw new Error(upsertError.message || "Falha ao atualizar usuário no CRM.");

  const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(userId, {
    email,
    user_metadata: {
      full_name: fullName
    },
    app_metadata: {
      crm_role: role,
      crm_status: status
    },
    ban_duration: userBanDuration(status)
  });

  if (updateAuthError) {
    throw new Error(updateAuthError.message || "Usuário atualizado no CRM, mas falhou atualização no Auth.");
  }

  return {
    user: upserted
  };
}

async function handleResetPassword(adminClient: ReturnType<typeof createClient>, body: AnyRecord) {
  const userId = String(body.user_id ?? "").trim();
  const informedEmail = normalizeEmail(body.email);
  const redirectTo = parseRedirectTo(body);

  let email = informedEmail;

  if (!email && userId) {
    const { data: profile, error: profileError } = await adminClient
      .from("app_users")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message || "Falha ao localizar usuário para reset de senha.");
    email = normalizeEmail(profile?.email);
  }

  if (!email && userId) {
    const authUsers = await listAllAuthUsers(adminClient);
    const authUser = authUsers.find((item) => String(item.id ?? "").trim() === userId) || null;
    email = normalizeEmail(authUser?.email);
  }

  if (!email || !isValidEmail(email)) {
    throw new Error("Não foi possível identificar e-mail válido para reset de senha.");
  }

  const recovery = await sendRecoveryEmail(adminClient, email, redirectTo);

  await adminClient
    .from("app_users")
    .update({
      last_invite_sent_at: new Date().toISOString()
    })
    .eq("email", email);

  return {
    email,
    delivery: recovery.delivery,
    action_link: recovery.actionLink
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const adminClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false }
  });

  let body: AnyRecord = {};
  try {
    body = asObject(await request.json());
  } catch {
    return jsonResponse(400, {
      error: "invalid_payload",
      message: "Payload inválido."
    });
  }

  const action = String(body.action ?? "").trim().toLowerCase();
  if (!action) {
    return jsonResponse(400, {
      error: "invalid_action",
      message: "Ação não informada."
    });
  }

  try {
    if (action === "list") {
      const users = await handleList(adminClient);
      return jsonResponse(200, { users });
    }

    if (action === "create") {
      const result = await handleCreate(adminClient, body);
      return jsonResponse(200, result);
    }

    if (action === "update") {
      const result = await handleUpdate(adminClient, body);
      return jsonResponse(200, result);
    }

    if (action === "reset_password") {
      const result = await handleResetPassword(adminClient, body);
      return jsonResponse(200, result);
    }

    return jsonResponse(400, {
      error: "unsupported_action",
      message: "Ação não suportada."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar gestão de usuários.";
    return jsonResponse(500, {
      error: "manage_users_failed",
      message
    });
  }
});
