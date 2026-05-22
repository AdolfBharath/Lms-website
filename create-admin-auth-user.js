const SUPABASE_URL = process.env.SUPABASE_URL || "https://agrzjwnsapbanbvgbwkh.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@jenovate.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123";

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Get it from Supabase Dashboard > Project Settings > API.");
  process.exit(1);
}

async function createAdminUser() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Admin" },
      app_metadata: { role: "admin" }
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Create admin failed (${response.status}):`, body);
    process.exit(1);
  }

  console.log(`Admin Auth user ready: ${body.email || ADMIN_EMAIL}`);
}

createAdminUser().catch((error) => {
  console.error(error);
  process.exit(1);
});
