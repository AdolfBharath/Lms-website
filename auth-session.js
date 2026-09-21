(function () {
  const APP_SESSION_KEY = "jenovateCurrentUser";
  const ROLE_SESSION_KEYS = {
    admin: "jenovateAdminSession",
    mentor: "jenovateMentorSession",
    student: "jenovateStudentSession"
  };
  const ROLE_ROUTES = {
    admin: "admin.html",
    mentor: "mentor.html",
    student: "student.html"
  };

  const normalizeRole = (role) => {
    const value = String(role || "student").trim().toLowerCase();
    return ROLE_ROUTES[value] ? value : "student";
  };

  const safeJson = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return value.split(",").map((item) => item.trim()).filter(Boolean);
      }
    }
    return [];
  };

  const client = () => window.getLmsPlatformClient?.() || window[["get", "Supa", "base", "Client"].join("")]?.();

  function withTimeout(value, timeoutMs, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([Promise.resolve(value), timeout]).finally(() => window.clearTimeout(timer));
  }

  async function retryTransient(operation, attempts = 2, delayMs = 400) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!/timed out|failed to fetch|network|abort/i.test(String(error?.message || "")) || attempt === attempts - 1) break;
        await new Promise((resolve) => window.setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
    throw lastError;
  }

  const currentPageTarget = () => {
    const params = new URLSearchParams(window.location.search || "");
    const next = String(params.get("next") || "").trim().toLowerCase();
    return ROLE_ROUTES[next] || "";
  };

  function clearStoredSessions() {
    sessionStorage.removeItem(APP_SESSION_KEY);
    Object.values(ROLE_SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
  }

  function readStoredSession(expectedRole) {
    const keys = expectedRole ? [ROLE_SESSION_KEYS[expectedRole], APP_SESSION_KEY] : [APP_SESSION_KEY, ...Object.values(ROLE_SESSION_KEYS)];
    for (const key of keys) {
      try {
        const profile = JSON.parse(sessionStorage.getItem(key) || "null");
        const role = normalizeRole(profile?.role);
        if (profile?.email && (!expectedRole || role === expectedRole)) {
          return { ...profile, role };
        }
      } catch {
        sessionStorage.removeItem(key);
      }
    }
    return null;
  }

  function storeSession(profile, authUser, authMode = "lms_auth") {
    const role = normalizeRole(profile?.role || authUser?.app_metadata?.role);
    const sessionProfile = {
      id: profile?.id || authUser?.id,
      auth_user_id: authUser?.id || profile?.auth_user_id || profile?.id,
      name: profile?.name || profile?.username || authUser?.user_metadata?.name || authUser?.email,
      email: profile?.email || authUser?.email,
      role,
      username: profile?.username || "",
      phone: profile?.phone || "",
      batch_id: profile?.batch_id || "",
      course_ids: safeJson(profile?.course_ids),
      expertise: safeJson(profile?.expertise),
      coins: Math.max(Number(profile?.coins || 0), Number(profile?.coin_balance || 0)),
      streak_count: Number(profile?.streak_count || 0),
      last_active_date: profile?.last_active_date || "",
      status: profile?.status || "active",
      auth_mode: authMode
    };

    clearStoredSessions();
    sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(sessionProfile));
    sessionStorage.setItem(ROLE_SESSION_KEYS[role], JSON.stringify(sessionProfile));
    return sessionProfile;
  }

  async function fetchProfile(authUser) {
    if (!authUser?.id || !client()?.from) return null;

    const columns = "id,auth_user_id,name,email,role,username,phone,batch_id,expertise,course_ids,coins,coin_balance,streak_count,last_active_date,last_login_reward_date,status,deleted_at,created_at";
    let response = await withTimeout(
      client()
        .from("users")
        .select(columns)
        .or(`id.eq.${authUser.id},auth_user_id.eq.${authUser.id}`)
        .maybeSingle(),
      6_000,
      "Profile loading timed out. Check your connection and try again."
    );

    if (response.error && /column|schema cache|could not find/i.test(response.error.message || "")) {
      response = await withTimeout(
        client()
          .from("users")
          .select("id,name,email,role,username,phone,batch_id,expertise,course_ids,coins,streak_count,last_active_date,last_login_reward_date,status,deleted_at,created_at")
          .or(`id.eq.${authUser.id},auth_user_id.eq.${authUser.id}`)
          .maybeSingle(),
        6_000,
        "Profile loading timed out. Check your connection and try again."
      );
    }

    if (!response.data) {
      response = await withTimeout(
        client()
          .from("users")
          .select("id,name,email,role,username,phone,batch_id,expertise,course_ids,coins,streak_count,last_active_date,last_login_reward_date,status,deleted_at,created_at")
          .ilike("email", authUser.email || "")
          .maybeSingle(),
        6_000,
        "Profile loading timed out. Check your connection and try again."
      );
    }

    if (response.error) throw response.error;
    return response.data;
  }

  function assertUsableProfile(profile) {
    if (!profile?.email) throw new Error("No LMS profile is linked to this login.");
    if (String(profile.deleted_at || "")) throw new Error("This account has been archived.");
    if (["archived", "disabled", "blocked"].includes(String(profile.status || "").toLowerCase())) {
      throw new Error("This account is not active.");
    }
  }

  async function profileFromCurrentAuth() {
    const { data, error } = await retryTransient(() => withTimeout(
      client().auth.getUser(),
      10_000,
      "Session verification timed out. Check your connection and try again."
    ),
      3,
      500
    );
    if (error || !data?.user) return null;
    const profile = await fetchProfile(data.user);
    assertUsableProfile(profile);
    return storeSession(profile, data.user, "lms_auth");
  }

  async function signInWithPassword(email, password) {
    if (!client()?.auth?.signInWithPassword) {
      throw new Error("Login is temporarily unavailable. Check your internet connection and refresh.");
    }
    const { data, error } = await withTimeout(
      client().auth.signInWithPassword({ email, password }),
      8_000,
      "Login timed out. Check your connection and try again."
    );
    if (!error) {
      const profile = await fetchProfile(data.user);
      assertUsableProfile(profile);
      return storeSession(profile, data.user, "lms_auth");
    }
    throw new Error(friendlyAuthError(error));
  }

  function friendlyAuthError(error) {
    const message = String(error?.message || "").trim();
    if (/invalid login credentials/i.test(message)) {
      return "Invalid email or password. If this is an older LMS account, ask an admin to open Users, edit this user, enter a Reset Login Password, and save.";
    }
    if (/email not confirmed/i.test(message)) {
      return "This email is not confirmed yet. Please confirm the account or request a password reset link.";
    }
    return message || "Invalid email or password.";
  }

  async function requireRole(expectedRole) {
    // sessionStorage is a display cache only. Authorization always requires a
    // valid LMS session and a fresh protected profile lookup.
    const profile = await profileFromCurrentAuth();
    const role = normalizeRole(profile?.role);
    if (!profile || role !== expectedRole) {
      return null;
    }
    return profile;
  }

  async function signOut() {
    try {
      await withTimeout(client()?.auth?.signOut?.(), 3_000, "Sign out timed out.");
    } finally {
      clearStoredSessions();
    }
  }

  window.JenovateAuth = {
    APP_SESSION_KEY,
    ROLE_SESSION_KEYS,
    ROLE_ROUTES,
    clearStoredSessions,
    fetchProfile,
    profileFromCurrentAuth,
    readStoredSession,
    requireRole,
    requestedRoute: currentPageTarget,
    routeFor: (profile) => ROLE_ROUTES[normalizeRole(profile?.role)] || "",
    signInWithPassword,
    signOut,
    storeSession,
    withTimeout
  };
})();
