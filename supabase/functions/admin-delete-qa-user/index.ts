import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EdgeError = Error & { status?: number; code?: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse({ ok: true });
  if (request.method !== "POST") return jsonError("Method not allowed", 405, "method_not_allowed");

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

    const callerProfile = await findProfile(admin, authData.user.email || "");
    if (!callerProfile || String(callerProfile.role || "").toLowerCase() !== "admin") {
      throw httpError("Admin access required", 403, "admin_access_required");
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId = String(body.target_user_id || "").trim();
    const targetEmail = String(body.target_email || "").trim().toLowerCase();
    if (!targetUserId && !targetEmail) throw httpError("target_user_id or target_email is required", 400, "missing_target");

    const target = targetUserId
      ? await findProfileById(admin, targetUserId)
      : await findProfile(admin, targetEmail);
    if (!target?.id || !isQaEmail(target.email)) {
      throw httpError("Only QA-created users may be deleted by this function", 403, "qa_user_required");
    }

    await deleteProfileDependents(admin, target.id);
    const { error: profileError } = await admin.from("users").delete().eq("id", target.id);
    if (profileError) throw profileError;

    const authUserId = target.auth_user_id || (await findAuthUserByEmail(admin, target.email))?.id || null;
    if (authUserId) {
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(authUserId);
      if (authDeleteError) throw authDeleteError;
    }

    return jsonResponse({ ok: true, deleted_profile_id: target.id, deleted_email: target.email });
  } catch (error) {
    const typed = error as EdgeError;
    return jsonError(typed.message || "Unable to delete QA user", typed.status || 400, typed.code || "delete_qa_user_failed");
  }
});

function isQaEmail(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  return /^(final-prod-qa|final-qa)-[a-z0-9-]+@(example\.com|jenovate\.qa)$/.test(normalized);
}

async function findProfile(admin: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await admin.from("users").select("id,email,role,auth_user_id").eq("email", email).maybeSingle();
  if (error) throw error;
  return data;
}

async function findProfileById(admin: ReturnType<typeof createClient>, id: string) {
  const { data, error } = await admin.from("users").select("id,email,role,auth_user_id").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return (data.users || []).find((user) => String(user.email || "").trim().toLowerCase() === normalizedEmail) || null;
}

async function deleteProfileDependents(admin: ReturnType<typeof createClient>, userId: string) {
  const deletions: Array<[string, string]> = [
    ["support_notifications", "recipient_user_id"],
    ["support_messages", "sender_id"],
    ["support_tickets", "user_id"],
    ["batch_chats", "user_id"],
    ["task_submissions", "student_id"],
    ["task_submissions", "user_id"],
    ["student_quiz_attempts", "student_id"],
    ["student_course_progress", "student_id"],
    ["student_extra_marks", "student_id"],
    ["user_courses", "user_id"],
    ["user_courses", "student_id"],
    ["user_courses", "learner_id"],
    ["projects", "student_id"],
  ];
  for (const [table, column] of deletions) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error && !isMissingShapeError(error)) throw error;
  }
}

function isMissingShapeError(error: unknown) {
  const typed = error as EdgeError;
  const message = String(typed?.message || "");
  const code = String(typed?.code || "");
  return code === "PGRST204" || /column|schema cache|could not find|does not exist/i.test(message);
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number, code: string) {
  return jsonResponse({ error: message, code }, status);
}
