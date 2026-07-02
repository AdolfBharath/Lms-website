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

  const client = () => window.getSupabaseClient?.();

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

  function storeSession(profile, authUser, authMode = "supabase_auth") {
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
      coins: Number(profile?.coins || profile?.coin_balance || 0),
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
    let response = await client()
      .from("users")
      .select(columns)
      .or(`id.eq.${authUser.id},auth_user_id.eq.${authUser.id}`)
      .maybeSingle();

    if ((response.error && /column|schema cache|could not find/i.test(response.error.message || "")) || !response.data) {
      response = await client()
        .from("users")
        .select("id,name,email,role,username,phone,batch_id,expertise,course_ids,coins,streak_count,last_active_date,last_login_reward_date,status,deleted_at,created_at")
        .ilike("email", authUser.email || "")
        .maybeSingle();
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
    const { data, error } = await client().auth.getUser();
    if (error || !data?.user) return null;
    const profile = await fetchProfile(data.user);
    assertUsableProfile(profile);
    return storeSession(profile, data.user, "supabase_auth");
  }

  async function signInWithPassword(email, password) {
    if (!client()?.auth?.signInWithPassword) {
      throw new Error("Supabase Auth did not load. Check your internet connection and refresh.");
    }
    const { data, error } = await client().auth.signInWithPassword({ email, password });
    if (!error) {
      const profile = await fetchProfile(data.user);
      assertUsableProfile(profile);
      return storeSession(profile, data.user, "supabase_auth");
    }

    const legacyProfile = await legacyPasswordLogin(email, password);
    if (legacyProfile) {
      return storeSession(legacyProfile, { id: legacyProfile.auth_user_id || legacyProfile.id, email: legacyProfile.email }, "legacy_password");
    }

    throw new Error(friendlyAuthError(error));
  }

  async function legacyPasswordLogin(email, password) {
    if (!client()?.rpc) return null;
    const { data, error } = await client().rpc("lms_password_login", {
      login_email: email,
      login_password: password
    });
    if (error) {
      if (/function|schema cache|not found|permission|denied|42501|PGRST202/i.test(error.message || error.code || "")) {
        return null;
      }
      return null;
    }
    const profile = Array.isArray(data) ? data[0] : data;
    if (!profile?.email) return null;
    return profile;
  }

  function friendlyAuthError(error) {
    const message = String(error?.message || "").trim();
    if (/invalid login credentials/i.test(message)) {
      return "Invalid email or password. If this is an LMS account created before Auth migration, ask the admin to create or reset the Supabase Auth login for this email.";
    }
    if (/email not confirmed/i.test(message)) {
      return "This email is not confirmed yet. Please confirm the account from Supabase Auth or send a password reset link.";
    }
    return message || "Invalid email or password.";
  }

  async function requireRole(expectedRole) {
    const profile = await profileFromCurrentAuth() || readStoredSession(expectedRole);
    const role = normalizeRole(profile?.role);
    if (!profile || role !== expectedRole) {
      return null;
    }
    return profile;
  }

  async function signOut() {
    try {
      await client()?.auth?.signOut?.();
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
    routeFor: (profile) => ROLE_ROUTES[normalizeRole(profile?.role)] || "",
    signInWithPassword,
    signOut,
    storeSession
  };
})();
