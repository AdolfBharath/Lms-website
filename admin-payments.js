(function () {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminPayments);
  } else {
    initAdminPayments();
  }

  function initAdminPayments() {
    renderAdminPayments();
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-refresh-payments]")) renderAdminPayments();
    });
    window.setInterval(() => {
      if (document.body.dataset.adminView === "dashboard") renderAdminPayments();
    }, 60000);
  }

  async function renderAdminPayments() {
    const target = document.getElementById("dashboardPaymentsList");
    if (!target) return;
    target.innerHTML = `<div class="list-row"><div><strong>Loading payments...</strong><small>Fetching secure order records</small></div></div>`;
    try {
      const client = window.getLmsPlatformClient?.() || window.getSupabaseClient?.();
      if (!client?.from) throw new Error("Supabase client is not ready.");
      const [orders, payments, users, courses] = await Promise.all([
        select(client, "lms_course_orders", "id,user_id,course_id,amount,currency,status,provider,provider_order_id,created_at,updated_at", "created_at", 8),
        select(client, "lms_course_payments", "id,order_id,user_id,course_id,amount,currency,status,provider,provider_payment_id,verified_at,created_at", "created_at", 20),
        select(client, "users", "id,name,email", "created_at", 1000),
        select(client, "courses", "id,title", "created_at", 500)
      ]);
      const paymentByOrder = new Map(payments.map((payment) => [String(payment.order_id), payment]));
      target.innerHTML = orders.length ? orders.map((order) => paymentRow(order, paymentByOrder.get(String(order.id)), users, courses)).join("") : emptyState("No payment orders yet.");
    } catch (error) {
      target.innerHTML = emptyState(error.message || "Unable to load payment records.");
    }
  }

  async function select(client, table, columns, orderColumn, limit) {
    const { data, error } = await client.from(table).select(columns).order(orderColumn, { ascending: false }).limit(limit);
    if (error) {
      if (/schema cache|not find|does not exist|404/i.test(error.message || "")) return [];
      throw error;
    }
    return data || [];
  }

  function paymentRow(order, payment, users, courses) {
    const user = users.find((item) => sameId(item.id, order.user_id)) || {};
    const course = courses.find((item) => sameId(item.id, order.course_id)) || {};
    const transaction = payment?.provider_payment_id || order.provider_order_id || order.id;
    const status = payment?.status || order.status || "pending";
    return `
      <div class="list-row">
        <div>
          <strong>${escapeHtml(user.name || user.email || "Student")} - ${escapeHtml(course.title || "Course")}</strong>
          <small>${escapeHtml(order.provider || "provider")} - ${escapeHtml(transaction)} - ${formatDate(payment?.verified_at || order.updated_at || order.created_at)}</small>
        </div>
        <span class="badge ${statusClass(status)}">${escapeHtml(status)} - ${money(order.amount, order.currency)}</span>
      </div>
    `;
  }

  function emptyState(message) {
    return `<div class="empty-state"><strong>${escapeHtml(message)}</strong></div>`;
  }

  function money(amount, currency = "INR") {
    return `${currency || "INR"} ${Number(amount || 0).toLocaleString("en-IN")}`;
  }

  function formatDate(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.valueOf()) ? "-" : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function statusClass(status) {
    const value = String(status || "").toLowerCase();
    if (value === "success") return "success";
    if (["failed", "cancelled", "refunded"].includes(value)) return "danger";
    return "warning";
  }

  function sameId(a, b) {
    return String(a || "") === String(b || "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
})();
