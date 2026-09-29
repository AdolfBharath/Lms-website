import { readFile } from 'node:fs/promises';

const source = await readFile('.env.local', 'utf8');
const env = Object.fromEntries(source.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  return match ? [[match[1], match[2].replace(/^["']|["']$/g, '')]] : [];
}));
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
async function request(path, options = {}) {
  const response = await fetch(`${url}/${path}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
  if (!response.ok) throw new Error(`Read-only audit request failed: ${response.status}`);
  return response.json();
}
const config = await request('functions/v1/course-purchase', { method: 'POST', body: JSON.stringify({ action: 'config_check' }) });
const orders = await request('rest/v1/lms_course_orders?select=id,user_id,course_id,status&status=eq.success');
const results = [];
for (const order of orders) {
  const courses = await request(`rest/v1/courses?select=status,deleted_at&id=eq.${order.course_id}`);
  const archivedCourse = !courses[0] || courses[0].deleted_at || courses[0].status !== 'active';
  const enrollments = await request(`rest/v1/user_courses?select=id&user_id=eq.${order.user_id}&course_id=eq.${order.course_id}&status=eq.active&deleted_at=is.null`);
  const payments = await request(`rest/v1/lms_course_payments?select=id&order_id=eq.${order.id}&user_id=eq.${order.user_id}&course_id=eq.${order.course_id}&status=eq.success`);
  results.push({ orderId: order.id, archivedCourse: Boolean(archivedCourse), matchingActiveEnrollments: enrollments.length, matchingVerifiedPayments: payments.length });
}
console.log(JSON.stringify({ mode: config.cashfree_env, productionReady: config.production_ready, existingPaidOrders: results, newPaymentCharged: false }, null, 2));
if (results.some(row => !row.archivedCourse && (row.matchingActiveEnrollments !== 1 || row.matchingVerifiedPayments < 1))) process.exitCode = 1;
