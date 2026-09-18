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

  function readSession(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null");
    } catch (error) {
      sessionStorage.removeItem(key);
      return null;
    }
  }

  function activeSession() {
    for (const [role, key] of Object.entries(ROLE_SESSION_KEYS)) {
      const profile = readSession(key);
      if (profile?.email && String(profile.role || "").toLowerCase() === role) {
        return { ...profile, role };
      }
    }

    const profile = readSession(APP_SESSION_KEY);
    const role = String(profile?.role || "").toLowerCase();
    return profile?.email && ROLE_ROUTES[role] ? { ...profile, role } : null;
  }

  function routeFor(profile) {
    return ROLE_ROUTES[String(profile?.role || "").toLowerCase()] || "";
  }

  function clearAllSessions() {
    sessionStorage.removeItem(APP_SESSION_KEY);
    Object.values(ROLE_SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
  }

  function currentPage() {
    return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function redirectActiveSession() {
    const profile = activeSession();
    const target = routeFor(profile);
    if (!target || currentPage() === target.toLowerCase()) return false;

    sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(profile));
    sessionStorage.setItem(ROLE_SESSION_KEYS[profile.role], JSON.stringify(profile));
    window.location.replace(target);
    return true;
  }

  window.JenovateSessionRouter = {
    activeSession,
    clearAllSessions,
    redirectActiveSession,
    routeFor
  };

  if (document.currentScript?.dataset.clearActiveSession === "true") {
    clearAllSessions();
  }

  if (document.currentScript?.dataset.redirectActiveSession === "true") {
    redirectActiveSession();
  }
})();
