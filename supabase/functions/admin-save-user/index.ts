import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AdminSaveUserBody = {
  target_user_id?: string | null;
  user_payload?: Record<string, unknown>;
  assign_course_id?: string | null;
  assign_batch_id?: string | null;
};

type EdgeError = Error & { status?: number; code?: string };

type NormalizedAdminUserPayload = {
  email: string;
  name: string;
  role: string;
  username: string | null;
  phone: string | null;
  referral: string | null;
  referral_key: string | null;
  batch_id: string | null;
  coins: number;
  auth_user_id?: string | null;
  password?: string;
  course_ids?: string[];
  expertise?: string[];
  status?: string;
};

const allowedProfileFields = [
  "email",
  "name",
  "role",
  "username",
  "phone",
  "referral",
  "referral_key",
  "batch_id",
  "coins",
  "course_ids",
  "expertise",
  "status",
] as const;

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  const respond = (body: unknown, status = 200) => jsonResponse(body, status, corsHeaders);
  const fail = (message: string, status: number, code: string) => respond({ error: message, code }, status);
  if (request.method === "OPTIONS") return respond({ ok: true });
  if (request.method !== "POST") return fail("Method not allowed", 405, "method_not_allowed");

  let createdAuthUserId: string | null = null;

  try {
    const url = requiredEnv("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!anonKey) throw httpError("SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is required", 500, "missing_anon_key");

    const authorization = request.headers.get("Authorization") || "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      throw httpError("Authentication required", 401, "authentication_required");
    }

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) throw httpError("Authentication required", 401, "authentication_required");

    const profile = await findCallerProfile(admin, authData.user);
    if (!profile || String(profile.role || "").toLowerCase() !== "admin") {
      throw httpError("Admin access required", 403, "admin_access_required");
    }

    const body = await request.json() as AdminSaveUserBody;
    const targetUserId = body.target_user_id || null;
    const payload = normalizePayload(body.user_payload || {});
    if (!payload.email) throw httpError("Email is required", 400, "email_required");
    if (!payload.name) payload.name = payload.email;
    if (!["student", "mentor", "admin"].includes(String(payload.role))) {
      throw httpError("Role must be student, mentor, or admin", 400, "invalid_role");
    }

    const { data: duplicateProfile, error: duplicateError } = await admin
      .from("users")
      .select("id,email")
      .eq("email", payload.email)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicateProfile && duplicateProfile.id !== targetUserId) {
      throw httpError("A user with this email already exists", 409, "duplicate_email");
    }

    let authUserId = typeof payload.auth_user_id === "string" ? payload.auth_user_id : null;
    const password = typeof payload.password === "string" ? payload.password : "";
    if (!targetUserId) {
      if (password.length < 8) {
        throw httpError("A password of at least 8 characters is required", 400, "weak_password");
      }
      const existingAuthUser = await findAuthUserByEmail(admin, String(payload.email));
      if (existingAuthUser?.id) {
        await updateAuthUser(admin, existingAuthUser.id, payload, password);
        authUserId = existingAuthUser.id;
      } else {
        const user = await createAuthUser(admin, payload, password);
        authUserId = user.id;
        createdAuthUserId = authUserId;
      }
    } else {
      const existing = await findExistingAuthLink(admin, targetUserId);
      const targetAuthUserId = existing?.auth_user_id || authUserId;
      if (targetAuthUserId) {
        if (password) {
          if (password.length < 8) {
            throw httpError("A password of at least 8 characters is required", 400, "weak_password");
          }
        }
        await updateAuthUser(admin, targetAuthUserId, payload, password || null);
        authUserId = targetAuthUserId;
      } else if (password) {
        if (password.length < 8) {
          throw httpError("A password of at least 8 characters is required", 400, "weak_password");
        }
        const existingAuthUser = await findAuthUserByEmail(admin, String(payload.email));
        const user = existingAuthUser?.id
          ? (await updateAuthUser(admin, existingAuthUser.id, payload, password), existingAuthUser)
          : await createAuthUser(admin, payload, password);
        authUserId = user.id;
        if (!existingAuthUser?.id) createdAuthUserId = authUserId;
      }
    }

    const profilePayload = profilePayloadFromPayload(payload, authUserId);

    const savedProfile = await writeProfileWithFallback(profilePayload, async (writePayload) => {
      const query = targetUserId
        ? admin.from("users").update(writePayload).eq("id", targetUserId)
        : admin.from("users").insert(writePayload);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return data;
    });

    if (body.assign_course_id) {
      await upsertEnrollment(admin, savedProfile.id, body.assign_course_id, body.assign_batch_id || null);
    }
    await persistUserAssignment(
      admin,
      savedProfile.id,
      body.assign_batch_id || payload.batch_id || null,
      mergeCourseIds(payload.course_ids, body.assign_course_id),
    );

    return respond(savedProfile);
  } catch (error) {
    if (createdAuthUserId) {
      try {
        const url = requiredEnv("SUPABASE_URL");
        const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
        await createClient(url, serviceKey, { auth: { persistSession: false } }).auth.admin.deleteUser(createdAuthUserId);
      } catch {
        // Best-effort rollback; the original error is more useful to the caller.
      }
    }
    const typed = error as EdgeError;
    return fail(typed.message || "Unable to save user", typed.status || 400, typed.code || "admin_save_user_failed");
  }
});

function normalizePayload(payload: Record<string, unknown>): NormalizedAdminUserPayload {
  const normalized: NormalizedAdminUserPayload = {
    email: String(payload.email || "").trim().toLowerCase(),
    name: String(payload.name || "").trim(),
    role: String(payload.role || "student").trim().toLowerCase(),
    username: nullableString(payload.username),
    phone: nullableString(payload.phone),
    referral: nullableString(payload.referral),
    referral_key: nullableString(payload.referral_key),
    batch_id: nullableString(payload.batch_id),
    coins: Number.isFinite(Number(payload.coins)) ? Math.max(0, Number(payload.coins)) : 0,
  };
  const authUserId = nullableString(payload.auth_user_id);
  const password = typeof payload.password === "string" ? payload.password : "";
  const courseIds = nullableStringArray(payload.course_ids);
  const expertise = nullableStringArray(payload.expertise);
  const status = nullableString(payload.status);

  if (authUserId) normalized.auth_user_id = authUserId;
  if (password) normalized.password = password;
  if (courseIds) normalized.course_ids = courseIds;
  if (expertise) normalized.expertise = expertise;
  if (status) normalized.status = status.toLowerCase();

  return normalized;
}

function profilePayloadFromPayload(payload: NormalizedAdminUserPayload, authUserId: string | null) {
  const profilePayload: Record<string, unknown> = { auth_user_id: authUserId, password: "supabase_auth_managed" };
  for (const field of allowedProfileFields) {
    const value = payload[field];
    if (value !== undefined) profilePayload[field] = value;
  }
  return profilePayload;
}

async function createAuthUser(admin: ReturnType<typeof createClient>, payload: NormalizedAdminUserPayload, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: payload.email,
    password,
    email_confirm: true,
    app_metadata: { role: payload.role },
    user_metadata: { name: payload.name, role: payload.role },
  });
  if (error) throw error;
  return data.user;
}

async function updateAuthUser(
  admin: ReturnType<typeof createClient>,
  authUserId: string,
  payload: NormalizedAdminUserPayload,
  password: string | null,
) {
  const authUpdate: Record<string, unknown> = {
    email: payload.email,
    app_metadata: { role: payload.role },
    user_metadata: { name: payload.name, role: payload.role },
  };
  if (password) authUpdate.password = password;
  const { error } = await admin.auth.admin.updateUserById(authUserId, authUpdate);
  if (error) throw error;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return (data.users || []).find((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail) || null;
}

async function writeProfileWithFallback<T>(payload: Record<string, unknown>, write: (payload: Record<string, unknown>) => Promise<T>) {
  let lastError: unknown = null;
  for (const writePayload of profilePayloadCandidates(payload)) {
    try {
      return await write(writePayload);
    } catch (error) {
      lastError = error;
      if (!isSchemaShapeError(error)) throw error;
    }
  }
  throw lastError || httpError("Unable to save user", 400, "admin_save_user_failed");
}

function profilePayloadCandidates(payload: Record<string, unknown>) {
  return [
    payload,
    stripPayloadFields(payload, ["password"]),
    stripPayloadFields(payload, ["course_ids"]),
    stripPayloadFields(payload, ["password", "course_ids"]),
    stripPayloadFields(payload, ["course_ids", "expertise"]),
    stripPayloadFields(payload, ["course_ids", "expertise", "referral"]),
    stripPayloadFields(payload, ["course_ids", "expertise", "referral", "coins", "status"]),
    stripPayloadFields(payload, ["password", "auth_user_id", "course_ids", "expertise", "referral", "coins", "status"]),
    stripPayloadFields(payload, ["course_ids", "expertise", "referral", "referral_key"]),
    stripPayloadFields(payload, ["course_ids", "expertise", "referral", "referral_key", "coins"]),
    stripPayloadFields(payload, ["course_ids", "expertise", "referral", "referral_key", "coins", "status"]),
    stripPayloadFields(payload, ["password", "auth_user_id", "course_ids", "expertise", "referral", "referral_key", "coins", "status"]),
    pickPayloadFields(payload, ["email", "name", "role"]),
  ];
}

function stripPayloadFields(payload: Record<string, unknown>, fields: string[]) {
  const next = { ...payload };
  for (const field of fields) delete next[field];
  return next;
}

function pickPayloadFields(payload: Record<string, unknown>, fields: string[]) {
  const next: Record<string, unknown> = {};
  for (const field of fields) {
    if (payload[field] !== undefined) next[field] = payload[field];
  }
  return next;
}

function isSchemaShapeError(error: unknown) {
  const typed = error as EdgeError;
  const message = String(typed?.message || "");
  const code = String(typed?.code || "");
  return code === "PGRST204" || /column|schema cache|could not find|does not exist/i.test(message);
}

async function findCallerProfile(admin: ReturnType<typeof createClient>, authUser: { id: string; email?: string }) {
  const { data, error } = await admin
    .from("users")
    .select("id,role,email")
    .or(`auth_user_id.eq.${authUser.id},id.eq.${authUser.id},email.eq.${authUser.email}`)
    .maybeSingle();
  if (!error) return data;
  if (!isSchemaShapeError(error)) throw error;

  const fallback = await admin
    .from("users")
    .select("id,role,email")
    .eq("email", authUser.email || "")
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data;
}

async function findExistingAuthLink(admin: ReturnType<typeof createClient>, targetUserId: string) {
  const { data, error } = await admin.from("users").select("auth_user_id").eq("id", targetUserId).maybeSingle();
  if (!error) return data;
  if (!isSchemaShapeError(error)) throw error;
  return null;
}

async function upsertEnrollment(
  admin: ReturnType<typeof createClient>,
  userId: string,
  courseId: string,
  batchId: string | null,
) {
  const { data: existing, error: lookupError } = await admin
    .from("user_courses")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const payload = { user_id: userId, course_id: courseId, batch_id: batchId, status: "active", deleted_at: null };
  const request = existing?.id
    ? admin.from("user_courses").update(payload).eq("id", existing.id)
    : admin.from("user_courses").insert(payload);
  const { error } = await request;
  if (error) throw error;
}

async function persistUserAssignment(
  admin: ReturnType<typeof createClient>,
  userId: string,
  batchId: string | null,
  courseIds: string[] | null,
) {
  if (!batchId && !courseIds?.length) return;
  const { error } = await admin.rpc("lms_admin_update_user_assignment", {
    target_user_id: userId,
    target_batch_id: batchId,
    target_course_ids: courseIds || null,
  });
  if (error) throw error;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "";
}

function mergeCourseIds(existing: string[] | undefined, assigned: string | null | undefined) {
  const values = [...(existing || []), assigned]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return values.length ? Array.from(new Set(values)) : null;
}

function nullableString(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function nullableStringArray(value: unknown) {
  if (!Array.isArray(value)) return null;
  const values = value.map((item) => String(item || "").trim()).filter(Boolean);
  return values.length ? Array.from(new Set(values)) : null;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw httpError(`${name} is required`, 500, `missing_${name.toLowerCase()}`);
  return value;
}

function httpError(message: string, status: number, code: string) {
  const error = new Error(message) as EdgeError;
  error.status = status;
  error.code = code;
  return error;
}

function corsHeadersFor(request: Request) {
  const origin = String(request.headers.get("origin") || "").replace(/\/$/, "");
  const configured = ["https://jenovate.in", "https://www.jenovate.in", "https://lms-website-zeta-vert.vercel.app", Deno.env.get("SITE_URL") || "", Deno.env.get("PUBLIC_SITE_URL") || "", ...(Deno.env.get("CORS_ALLOWED_ORIGINS") || "").split(",")]
    .map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
  return origin && configured.includes(origin)
    ? { ...baseCorsHeaders, "Access-Control-Allow-Origin": origin, "Vary": "Origin" }
    : baseCorsHeaders;
}

function jsonResponse(body: unknown, status = 200, corsHeaders = baseCorsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number, code: string) {
  return jsonResponse({ error: message, code }, status);
}
