export function formatPortalError(error, fallback = "Something went wrong. Please try again.") {
  const message = error?.message || String(error || "");
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Could not reach Supabase. Check your internet connection and try again.";
  }
  if (/permission denied|row-level security|rls/i.test(message)) {
    return "Supabase blocked this action. Check the table policy for this user role.";
  }
  if (/schema cache|could not find|column/i.test(message)) {
    return "Supabase schema cache does not match this table yet. Refresh the page; if it continues, reload the schema in Supabase.";
  }
  return message || fallback;
}

if (typeof window !== "undefined") {
  window.JenovatePortalErrors = {
    formatPortalError
  };
}
