import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const baseCorsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | "course"
  | "config_check"
  | "create_student_profile"
  | "create_order"
  | "verify_payment"
  | "mark_cancelled"
  | "webhook";

type CourseRow = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  duration?: string | null;
  module_type?: string | null;
  instructor_name?: string | null;
  thumbnail_url?: string | null;
  price?: number | string | null;
  deleted_at?: string | null;
  difficulty?: string | null;
  modules?: unknown;
  status?: string | null;
};

type ProfileRow = {
  id: string;
  auth_user_id?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  phone?: string | null;
  username?: string | null;
  referral?: string | null;
  referral_key?: string | null;
  course_ids?: unknown;
  batch_id?: string | null;
};

type PaymentEnv = ReturnType<typeof loadEnv>;

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  const respond = (body: unknown, status = 200) => jsonResponse(body, status, corsHeaders);
  const fail = (message: string, status: number, code: string) => respond({ error: message, code }, status);
  if (request.method === "OPTIONS") return respond({ ok: true });
  if (request.method !== "POST") return fail("Method not allowed", 405, "method_not_allowed");

  const rawBody = await request.text();
  let body: Record<string, unknown> = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return fail("Invalid JSON body", 400, "invalid_json");
  }

  const action = String(body.action || "") as Action;

  try {
    const env = loadEnv();
    const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false } });

    const isCashfreeWebhook = Boolean(request.headers.get("x-webhook-signature") || request.headers.get("x-webhook-timestamp"));
    if (action === "webhook" || isCashfreeWebhook) {
      await handleWebhook(admin, env, request, rawBody, body);
      return respond({ ok: true });
    }

    const caller = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
      auth: { persistSession: false },
    });

    if (action === "course") {
      const course = await findCourse(admin, String(body.course_id || body.course_slug || body.course || ""));
      return respond({ course: publicCourse(course) });
    }

    if (action === "config_check") {
      return respond(paymentConfigCheck(env));
    }

    const authUser = await requireAuth(caller);

    if (action === "create_student_profile") {
      const profile = await ensureStudentProfile(admin, authUser, body.profile || {});
      return respond({ profile: publicProfile(profile) });
    }

    const profile = await ensureStudentProfile(admin, authUser, {});

    if (action === "create_order") {
      const result = await createCourseOrder(admin, env, profile, String(body.course_id || body.course_slug || body.course || ""));
      return respond(result);
    }

    if (action === "verify_payment") {
      const result = await verifyPayment(admin, env, profile, String(body.order_id || ""), String(body.provider_order_id || ""));
      return respond(result);
    }

    if (action === "mark_cancelled") {
      const result = await markCancelled(admin, profile, String(body.order_id || ""));
      return respond(result);
    }

    return fail("Unknown action", 400, "unknown_action");
  } catch (error) {
    const err = error as Error & { status?: number; code?: string };
    return fail(err.message || "Purchase request failed", err.status || 500, err.code || "purchase_failed");
  }
});

function loadEnv() {
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!anonKey) throw httpError("SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY is required", 500, "missing_anon_key");
  const provider = (Deno.env.get("PAYMENT_PROVIDER") || "cashfree").toLowerCase();
  const cashfreeEnv = String(Deno.env.get("CASHFREE_ENV") || "").trim().toLowerCase();
  if (provider === "cashfree" && !cashfreeEnv) {
    throw httpError("CASHFREE_ENV is required", 500, "missing_cashfree_env");
  }
  if (cashfreeEnv && !["sandbox", "production"].includes(cashfreeEnv)) {
    throw httpError("Invalid CASHFREE_ENV", 500, "invalid_cashfree_env");
  }
  return {
    url,
    serviceKey,
    anonKey,
    provider,
    cashfreeAppId: Deno.env.get("CASHFREE_APP_ID") || Deno.env.get("CASHFREE_CLIENT_ID") || "",
    cashfreeSecret: Deno.env.get("CASHFREE_SECRET_KEY") || Deno.env.get("CASHFREE_CLIENT_SECRET") || "",
    cashfreeEnv: cashfreeEnv || "sandbox",
    siteUrl: (Deno.env.get("SITE_URL") || Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/$/, ""),
    webhookSecret: Deno.env.get("CASHFREE_WEBHOOK_SECRET") || Deno.env.get("CASHFREE_SECRET_KEY") || "",
  };
}

async function requireAuth(caller: ReturnType<typeof createClient>) {
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) throw httpError("Authentication required", 401, "authentication_required");
  return data.user;
}

async function ensureStudentProfile(admin: ReturnType<typeof createClient>, authUser: { id: string; email?: string }, raw: unknown): Promise<ProfileRow> {
  const profilePayload = typeof raw === "object" && raw ? raw as Record<string, unknown> : {};
  const email = String(authUser.email || profilePayload.email || "").trim().toLowerCase();
  if (!email) throw httpError("Student email is required", 400, "email_required");

  const existing = await findProfile(admin, authUser.id, email);
  const name = cleanText(profilePayload.name || profilePayload.full_name || existing?.name || email);
  const phone = cleanText(profilePayload.phone || existing?.phone || "");
  const username = cleanText(profilePayload.username || existing?.username || "");
  const referralSource = cleanText(profilePayload.referral_source || profilePayload.referral || profilePayload.ref || "");

  if (existing?.id) {
    if (String(existing.role || "").toLowerCase() !== "student") {
      throw httpError("Only student accounts can buy courses", 403, "student_required");
    }
    const { data, error } = await admin.from("users").update({
      auth_user_id: existing.auth_user_id || authUser.id,
      name,
      email,
      phone: phone || null,
      username: username || null,
      referral: existing.referral || referralSource || null,
      role: "student",
      status: "active",
    }).eq("id", existing.id).select("*").single();
    if (error) throw error;
    return data as ProfileRow;
  }

  const { data, error } = await admin.from("users").insert({
    auth_user_id: authUser.id,
    email,
    name,
    phone: phone || null,
    username: username || null,
    referral: referralSource || null,
    referral_key: await uniqueReferralKey(admin, authUser.id, email, username),
    role: "student",
    status: "active",
    coins: 0,
  }).select("*").single();
  if (error) throw error;
  return data as ProfileRow;
}

async function findProfile(admin: ReturnType<typeof createClient>, authUserId: string, email: string) {
  const byAuth = await admin.from("users").select("*").eq("auth_user_id", authUserId).maybeSingle();
  if (byAuth.error) throw byAuth.error;
  if (byAuth.data) return byAuth.data as ProfileRow;
  const byId = await admin.from("users").select("*").eq("id", authUserId).maybeSingle();
  if (byId.error) throw byId.error;
  if (byId.data) return byId.data as ProfileRow;
  const byEmail = await admin.from("users").select("*").ilike("email", email).maybeSingle();
  if (byEmail.error) throw byEmail.error;
  return byEmail.data as ProfileRow | null;
}

async function findCourse(admin: ReturnType<typeof createClient>, selector: string): Promise<CourseRow> {
  const value = selector.trim();
  if (!value) throw httpError("Course is required", 400, "course_required");

  const byId = /^[0-9a-f-]{30,}$/i.test(value)
    ? await admin.from("courses").select("*").eq("id", value).is("deleted_at", null).ilike("status", "active").maybeSingle()
    : { data: null, error: null };
  if (byId.error) throw byId.error;
  if (byId.data) return assertCourseAvailable(byId.data as CourseRow);

  const { data, error } = await admin.from("courses").select("*").is("deleted_at", null).ilike("status", "active").order("created_at", { ascending: true }).limit(500);
  if (error) throw error;
  const slug = slugify(value);
  const aliases = courseSlugAliases(value);
  const course = (data || []).find((item: CourseRow) => (
    aliases.has(slugify(item.title))
    || String(item.title || "").toLowerCase() === value.toLowerCase()
  ));
  if (!course) throw httpError("Course not found", 404, "course_not_found");
  return assertCourseAvailable(course as CourseRow);
}

function assertCourseAvailable(course: CourseRow) {
  if (course.deleted_at || String(course.status || "").toLowerCase() !== "active") {
    throw httpError("Course is not available for purchase", 403, "course_unavailable");
  }
  return course;
}

async function createCourseOrder(admin: ReturnType<typeof createClient>, env: ReturnType<typeof loadEnv>, profile: ProfileRow, selector: string) {
  const course = await findCourse(admin, selector);
  const existingEnrollment = await activeEnrollment(admin, profile.id, course.id);
  if (existingEnrollment) {
    return { already_owned: true, course: publicCourse(course), enrollment: existingEnrollment };
  }

  const amount = courseAmount(course);
  const currency = "INR";
  if (amount > 0) assertPaymentConfiguration(env);
  const pending = await pendingOrder(admin, profile.id, course.id);
  if (pending?.provider_payment_session_id && Number(pending.amount) === amount && String(pending.currency).toUpperCase() === currency) {
    return {
      order: pending,
      course: publicCourse(course),
      provider: { provider: pending.provider, mode: env.cashfreeEnv, payment_session_id: pending.provider_payment_session_id },
      payment_status: pending.status,
    };
  }

  const providerOrderId = `jnv_${crypto.randomUUID().replaceAll("-", "")}`;
  const { data: order, error } = await admin.from("lms_course_orders").insert({
    user_id: profile.id,
    course_id: course.id,
    amount,
    currency,
    status: amount > 0 ? "pending" : "success",
    provider: env.provider,
    provider_order_id: providerOrderId,
    metadata: { course_title: course.title },
  }).select("*").single();
  if (error) throw error;

  if (amount <= 0) {
    const enrollment = await grantEnrollment(admin, profile.id, course.id);
    return { order, course: publicCourse(course), enrollment, payment_status: "success" };
  }

  const provider = await createProviderOrder(env, order, profile, course);
  if (provider.payment_session_id) {
    await admin.from("lms_course_orders").update({
      provider_payment_session_id: provider.payment_session_id,
      metadata: { course_title: course.title, provider: provider.raw || {} },
    }).eq("id", order.id);
  }

  return {
    order: { ...order, provider_payment_session_id: provider.payment_session_id || null },
    course: publicCourse(course),
    provider,
    payment_status: "pending",
  };
}

async function createProviderOrder(env: ReturnType<typeof loadEnv>, order: Record<string, unknown>, profile: ProfileRow, course: CourseRow) {
  if (env.provider !== "cashfree") {
    return { provider: env.provider, mode: "manual_verification_required", payment_session_id: "", raw: {} };
  }
  assertPaymentConfiguration(env);
  const api = cashfreeApi(env);
  const returnUrl = `${validatedSiteUrl(env)}/course-detail.html?purchase_order_id=${order.id}&course=${encodeURIComponent(slugify(course.title))}`;
  const response = await fetch(`${api}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": "2023-08-01",
      "x-client-id": env.cashfreeAppId,
      "x-client-secret": env.cashfreeSecret,
    },
    body: JSON.stringify({
      order_id: order.provider_order_id,
      order_amount: Number(order.amount),
      order_currency: order.currency,
      customer_details: {
        customer_id: profile.id,
        customer_name: profile.name || profile.email || "Jenovate Student",
        customer_email: profile.email,
        customer_phone: profile.phone || "9999999999",
      },
      order_meta: { return_url: returnUrl },
      order_note: `Jenovate LMS course: ${course.title}`,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(data?.message || "Payment provider order creation failed", 502, "provider_order_failed");
  return { provider: "cashfree", mode: env.cashfreeEnv, payment_session_id: data.payment_session_id || "", raw: data };
}

async function verifyPayment(admin: ReturnType<typeof createClient>, env: ReturnType<typeof loadEnv>, profile: ProfileRow, orderId: string, providerOrderId = "") {
  const order = await findOwnedOrder(admin, profile.id, orderId, providerOrderId);
  if (order.status === "success") {
    // Heal a legacy successful order only when its protected enrollment row is absent.
    const enrollment = await activeEnrollment(admin, profile.id, order.course_id)
      || await grantEnrollment(admin, String(order.user_id), String(order.course_id));
    await syncProfileCourseIds(admin, String(order.user_id), String(order.course_id));
    return { order, payment_status: "success", enrollment };
  }

  const provider = await fetchProviderOrder(env, String(order.provider_order_id || ""));
  const status = normalizeProviderStatus(provider.status || provider.order_status);
  if (status !== "success") {
    await admin.from("lms_course_orders").update({ status, updated_at: new Date().toISOString() }).eq("id", order.id);
    return { order: { ...order, status }, payment_status: status, provider };
  }

  const paidAmount = Math.round(Number(provider.amount || provider.order_amount || provider.payment_amount || 0));
  if (paidAmount !== Number(order.amount) || String(provider.currency || provider.order_currency || order.currency).toUpperCase() !== String(order.currency).toUpperCase()) {
    throw httpError("Payment amount or currency mismatch", 409, "payment_mismatch");
  }
  const result = await completeOrder(admin, order, provider);
  return { ...result, provider };
}

async function fetchProviderOrder(env: ReturnType<typeof loadEnv>, providerOrderId: string) {
  if (env.provider !== "cashfree" || !env.cashfreeAppId || !env.cashfreeSecret) {
    throw paymentConfigurationError(env);
  }
  const response = await fetch(`${cashfreeApi(env)}/orders/${encodeURIComponent(providerOrderId)}`, {
    headers: {
      "x-api-version": "2023-08-01",
      "x-client-id": env.cashfreeAppId,
      "x-client-secret": env.cashfreeSecret,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(data?.message || "Unable to verify payment", 502, "provider_verify_failed");
  return data;
}

async function handleWebhook(admin: ReturnType<typeof createClient>, env: ReturnType<typeof loadEnv>, request: Request, rawBody: string, parsed: Record<string, unknown>) {
  await verifyCashfreeWebhook(env, request, rawBody);
  const payload = parsed.data && typeof parsed.data === "object" ? parsed.data as Record<string, unknown> : parsed;
  const orderPayload = payload.order && typeof payload.order === "object" ? payload.order as Record<string, unknown> : payload;
  const paymentPayload = payload.payment && typeof payload.payment === "object" ? payload.payment as Record<string, unknown> : payload;
  const providerOrderId = String(orderPayload.order_id || payload.order_id || "");
  if (!providerOrderId) throw httpError("Webhook order id missing", 400, "webhook_order_missing");
  const { data: order, error } = await admin.from("lms_course_orders").select("*").eq("provider_order_id", providerOrderId).maybeSingle();
  if (error) throw error;
  if (!order) throw httpError("Order not found", 404, "order_not_found");
  const status = normalizeProviderStatus(String(paymentPayload.payment_status || orderPayload.order_status || payload.type || ""));
  if (status === "success") {
    const paidAmount = Math.round(Number(paymentPayload.payment_amount || orderPayload.order_amount || payload.payment_amount || 0));
    const currency = String(paymentPayload.payment_currency || orderPayload.order_currency || payload.payment_currency || order.currency).toUpperCase();
    if (paidAmount !== Number(order.amount) || currency !== String(order.currency).toUpperCase()) {
      throw httpError("Webhook amount or currency mismatch", 409, "webhook_payment_mismatch");
    }
    await completeOrder(admin, order, {
      status,
      order_amount: order.amount,
      order_currency: order.currency,
      cf_payment_id: paymentPayload.cf_payment_id || paymentPayload.payment_id || providerOrderId,
      raw: parsed,
    });
  } else {
    await admin.from("lms_course_orders").update({ status, updated_at: new Date().toISOString(), metadata: { webhook: parsed } }).eq("id", order.id);
  }
}

async function verifyCashfreeWebhook(env: ReturnType<typeof loadEnv>, request: Request, rawBody: string) {
  if (!env.webhookSecret) return;
  const signature = request.headers.get("x-webhook-signature") || "";
  const timestamp = request.headers.get("x-webhook-timestamp") || "";
  if (!signature || !timestamp) throw httpError("Webhook signature missing", 401, "webhook_signature_missing");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  if (signature !== expected) throw httpError("Webhook signature invalid", 401, "webhook_signature_invalid");
}

async function completeOrder(admin: ReturnType<typeof createClient>, order: Record<string, unknown>, provider: Record<string, unknown>) {
  const paymentId = String(provider.cf_payment_id || provider.payment_id || provider.provider_payment_id || order.provider_order_id || "");
  await admin.from("lms_course_payments").upsert({
    order_id: order.id,
    user_id: order.user_id,
    course_id: order.course_id,
    amount: order.amount,
    currency: order.currency,
    provider: order.provider || "cashfree",
    provider_payment_id: paymentId,
    provider_order_id: order.provider_order_id,
    status: "success",
    verified_at: new Date().toISOString(),
    raw_payload: provider,
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider,provider_payment_id" });
  const { data: updatedOrder, error } = await admin.from("lms_course_orders").update({
    status: "success",
    updated_at: new Date().toISOString(),
  }).eq("id", order.id).select("*").single();
  if (error) throw error;
  const enrollment = await grantEnrollment(admin, String(order.user_id), String(order.course_id));
  await syncProfileCourseIds(admin, String(order.user_id), String(order.course_id));
  return { order: updatedOrder, payment_status: "success", enrollment };
}

async function grantEnrollment(admin: ReturnType<typeof createClient>, userId: string, courseId: string) {
  const existing = await activeEnrollment(admin, userId, courseId);
  if (existing) return existing;
  const archived = await admin.from("user_courses").select("*").eq("course_id", courseId).or(`user_id.eq.${userId},student_id.eq.${userId},learner_id.eq.${userId}`).limit(1).maybeSingle();
  if (archived.error) throw archived.error;
  if (archived.data?.id) {
    const { data, error } = await admin.from("user_courses").update({
      user_id: userId,
      student_id: userId,
      learner_id: userId,
      course_id: courseId,
      status: "active",
      deleted_at: null,
    }).eq("id", archived.data.id).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await admin.from("user_courses").insert({
    user_id: userId,
    student_id: userId,
    learner_id: userId,
    course_id: courseId,
    status: "active",
    created_at: new Date().toISOString(),
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function syncProfileCourseIds(admin: ReturnType<typeof createClient>, userId: string, courseId: string) {
  const { data: profile, error: profileError } = await admin.from("users")
    .select("id,course_ids")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.id) throw httpError("Student profile not found", 404, "profile_not_found");

  const courseIds = parseCourseIds(profile.course_ids);
  if (courseIds.includes(courseId)) return;

  // Assignment fields are protected by a database trigger. Use the existing
  // service-only RPC so this post-payment update is explicit and auditable.
  const { error } = await admin.rpc("lms_admin_update_user_assignment", {
    target_user_id: userId,
    target_batch_id: null,
    target_course_ids: [...courseIds, courseId],
  });
  if (error) throw error;
}

function parseCourseIds(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(String).filter(Boolean))];
  if (typeof value === "string") {
    try {
      return parseCourseIds(JSON.parse(value));
    } catch {
      return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
    }
  }
  return [];
}

async function pendingOrder(admin: ReturnType<typeof createClient>, userId: string, courseId: string) {
  const { data, error } = await admin.from("lms_course_orders")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function activeEnrollment(admin: ReturnType<typeof createClient>, userId: string, courseId: string) {
  const { data, error } = await admin.from("user_courses")
    .select("*")
    .eq("course_id", courseId)
    .or(`user_id.eq.${userId},student_id.eq.${userId},learner_id.eq.${userId}`)
    .is("deleted_at", null)
    .not("status", "in", "(archived,removed,cancelled,inactive,deleted,disabled)")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findOwnedOrder(admin: ReturnType<typeof createClient>, userId: string, orderId: string, providerOrderId: string) {
  let query = admin.from("lms_course_orders").select("*").eq("user_id", userId);
  query = orderId ? query.eq("id", orderId) : query.eq("provider_order_id", providerOrderId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw httpError("Order not found", 404, "order_not_found");
  return data;
}

async function markCancelled(admin: ReturnType<typeof createClient>, profile: ProfileRow, orderId: string) {
  const order = await findOwnedOrder(admin, profile.id, orderId, "");
  if (order.status === "success") return { order, payment_status: "success" };
  const { data, error } = await admin.from("lms_course_orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", order.id).select("*").single();
  if (error) throw error;
  return { order: data, payment_status: "cancelled" };
}

function publicCourse(course: CourseRow) {
  const modules = parseModules(course.modules);
  const lessonCount = modules.reduce((sum, module) => sum + moduleLessons(module).length, 0);
  const amount = courseAmount(course);
  return {
    id: course.id,
    title: course.title,
    description: course.description || "",
    category: course.category || "",
    duration: course.duration || "",
    level: course.difficulty || course.module_type || "",
    instructor: course.instructor_name || "Jenovate Mentor",
    thumbnail_url: course.thumbnail_url || "",
    modules: modules.map((module, index) => ({
      id: String(module.id || `module-${index + 1}`),
      title: String(module.title || `Module ${index + 1}`),
      description: String(module.description || ""),
      lessons: moduleLessons(module).map((lesson: unknown, lessonIndex: number) => {
        const item = lesson && typeof lesson === "object" ? lesson as Record<string, unknown> : {};
        return {
          id: String(item.id || `lesson-${index + 1}-${lessonIndex + 1}`),
          title: String(item.title || item.name || `Lesson ${lessonIndex + 1}`),
          type: String(item.type || item.content_type || "lesson"),
        };
      }),
    })),
    module_count: modules.length,
    lesson_count: lessonCount,
    amount,
    currency: "INR",
    price_label: amount > 0 ? `INR ${amount.toLocaleString("en-IN")}` : "Free",
    discount: 0,
    final_amount: amount,
  };
}

function publicProfile(profile: ProfileRow) {
  return { id: profile.id, name: profile.name, email: profile.email, role: profile.role, referral_key: profile.referral_key || "" };
}

function courseAmount(course: CourseRow) {
  const text = String(course.price ?? "").replace(/,/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  return Math.max(0, Math.round(Number(match?.[0] || 0)));
}

function parseModules(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  if (typeof value === "string" && value.trim()) {
    try { return parseModules(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function moduleLessons(module: Record<string, unknown>) {
  const lessons = module.lessons || module.items || module.content;
  return Array.isArray(lessons) ? lessons : [];
}

function cleanText(value: unknown) {
  return String(value || "").trim().slice(0, 160);
}

async function uniqueReferralKey(admin: ReturnType<typeof createClient>, authUserId: string, email: string, username: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = `JNVT${randomCodePart(authUserId, email, username, attempt)}`;
    const { data, error } = await admin.from("users")
      .select("id")
      .eq("referral_key", code)
      .limit(1);
    if (error) throw error;
    if (!data?.length) return code;
  }
  return `JNVT${crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function randomCodePart(...values: Array<unknown>) {
  const input = values.map((value) => String(value || "").toLowerCase()).join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, "0").slice(-8);
}

function slugify(value: unknown) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function courseSlugAliases(value: unknown) {
  const raw = String(value || "");
  const base = slugify(raw);
  const aliases = new Set<string>();
  if (base) aliases.add(base);

  const explicitAliases: Record<string, string[]> = {
    "ui-and-ux": ["ui-ux"],
    "ui-ux-design": ["ui-ux"],
    "stock-marketing-1": ["stock-marketing"],
    "stock-market": ["stock-marketing"],
    "stock-market-trading": ["stock-marketing"],
    "cyber-security": ["cyber-security-and-ethical-hacking"],
    "cybersecurity": ["cyber-security-and-ethical-hacking"],
    "ethical-hacking": ["cyber-security-and-ethical-hacking"],
    "internet-of-things": ["internet-of-things-iot"],
    "iot": ["internet-of-things-iot"],
    "iot-robotics": ["iot-and-robotics"],
    "internet-of-things-and-robotics": ["iot-and-robotics"],
    "dsa": ["dsa-with-python"],
    "data-structures-and-algorithms": ["dsa-with-python"],
    "embedded-system": ["embedded-systems"],
    "full-stack": ["full-stack-web-development"],
    "frontend-web-development": ["front-end-web-development"],
    "front-end-development": ["front-end-web-development"],
    "hrm": ["human-resource-management"],
    "human-resources": ["human-resource-management"],
    "ai": ["artificial-intelligence"],
    "agentic-ai": ["ai-agentic-and-generative"],
    "generative-ai": ["ai-agentic-and-generative"]
  };
  for (const alias of explicitAliases[base] || []) aliases.add(alias);

  const withoutParenthetical = slugify(raw.replace(/\s*\([^)]*\)\s*/g, " "));
  if (withoutParenthetical) aliases.add(withoutParenthetical);

  const words = base.split("-").filter(Boolean);
  if (words.length > 1 && words[words.length - 1].length <= 4) {
    aliases.add(words.slice(0, -1).join("-"));
  }

  const expanded = base
    .replace(/\biot\b/g, "internet-of-things")
    .replace(/\bai\b/g, "artificial-intelligence");
  if (expanded) aliases.add(expanded);

  return aliases;
}

function normalizeProviderStatus(value: unknown) {
  const status = String(value || "").toLowerCase();
  if (["paid", "success", "successful", "payment_success", "order_paid"].some((item) => status.includes(item))) return "success";
  if (["failed", "failure", "expired"].some((item) => status.includes(item))) return "failed";
  if (["cancelled", "canceled", "user_dropped"].some((item) => status.includes(item))) return "cancelled";
  return "processing";
}

function cashfreeApi(env: ReturnType<typeof loadEnv>) {
  return env.cashfreeEnv === "production" ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";
}

function assertPaymentConfiguration(env: PaymentEnv) {
  if (env.provider !== "cashfree") return;
  if (!env.cashfreeAppId || !env.cashfreeSecret) throw paymentConfigurationError(env);
  validatedSiteUrl(env);
}

function paymentConfigurationError(env: PaymentEnv) {
  if (env.cashfreeEnv === "production") {
    return httpError("PRODUCTION CREDENTIALS REQUIRED", 503, "production_credentials_required");
  }
  return httpError("Payment provider verification is not configured", 503, "provider_not_configured");
}

function validatedSiteUrl(env: PaymentEnv) {
  const siteUrl = env.siteUrl || "";
  if (!siteUrl) throw httpError("SITE_URL or PUBLIC_SITE_URL is required", 500, "missing_site_url");
  let parsed: URL;
  try {
    parsed = new URL(siteUrl);
  } catch {
    throw httpError("SITE_URL or PUBLIC_SITE_URL is invalid", 500, "invalid_site_url");
  }
  const host = parsed.hostname.toLowerCase();
  if (env.cashfreeEnv === "production") {
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (parsed.protocol !== "https:" || isLocal) {
      throw httpError("Production payment return URL must be a public HTTPS URL", 500, "invalid_production_return_url");
    }
  }
  return parsed.toString().replace(/\/$/, "");
}

function paymentConfigCheck(env: PaymentEnv) {
  let siteUrlStatus = "pass";
  let siteUrl = "";
  try {
    siteUrl = validatedSiteUrl(env);
  } catch {
    siteUrlStatus = "fail";
  }
  return {
    provider: env.provider,
    cashfree_env: env.cashfreeEnv,
    cashfree_endpoint: cashfreeApi(env),
    cashfree_credentials_present: Boolean(env.cashfreeAppId && env.cashfreeSecret),
    webhook_secret_present: Boolean(env.webhookSecret),
    site_url_present: Boolean(env.siteUrl),
    site_url_status: siteUrlStatus,
    site_url_host: siteUrl ? new URL(siteUrl).host : "",
    production_ready: env.cashfreeEnv === "production"
      && Boolean(env.cashfreeAppId && env.cashfreeSecret)
      && Boolean(env.webhookSecret)
      && siteUrlStatus === "pass",
  };
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw httpError(`${name} is required`, 500, "missing_env");
  return value;
}

function httpError(message: string, status = 500, code = "error") {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
}

function corsHeadersFor(request: Request) {
  const origin = String(request.headers.get("origin") || "").replace(/\/$/, "");
  const configured = [
    "https://jenovate.in",
    "https://www.jenovate.in",
    "https://lms-website-zeta-vert.vercel.app",
    Deno.env.get("SITE_URL") || "",
    Deno.env.get("PUBLIC_SITE_URL") || "",
    ...(Deno.env.get("CORS_ALLOWED_ORIGINS") || "").split(","),
  ].map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
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

function jsonError(message: string, status = 500, code = "error") {
  return jsonResponse({ error: message, code }, status);
}
