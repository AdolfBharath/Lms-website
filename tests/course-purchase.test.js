const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

function harness(provider = {}) {
  const order = { id: 'order-a', user_id: 'student-a', course_id: 'course-b', provider_order_id: 'provider-a', amount: 5999, currency: 'INR', status: 'pending' };
  const writes = [];
  let finalized = 0;
  const admin = {
    from(table) {
      const filters = [];
      let patch;
      const query = {
        select: () => query, eq: (key, value) => { filters.push([key, value]); return query; },
        neq: () => query, update: value => { patch = value; return query; },
        maybeSingle: async () => ({ data: table === 'lms_course_orders' && filters.every(([key, value]) => order[key] === value) ? order : null }),
        then(resolve) { if (patch) writes.push(patch); return Promise.resolve({ data: null }).then(resolve); }
      };
      return query;
    },
    async rpc(name, args) {
      assert.equal(name, 'lms_complete_course_order');
      assert.equal(args.target_order_id, order.id);
      finalized++;
      return { data: { order, payment_status: 'success', enrollment: { user_id: order.user_id, course_id: order.course_id } } };
    }
  };
  const env = { provider: 'cashfree', cashfreeAppId: 'test', cashfreeSecret: 'test', cashfreeEnv: 'sandbox', webhookSecret: 'test' };
  const source = fs.readFileSync('supabase/functions/course-purchase/index.ts', 'utf8').replace(/^import .*\r?\n/, '');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const context = vm.createContext({ Deno: { serve() {} }, crypto: webcrypto, TextEncoder, btoa, URL,
    fetch: async () => ({ ok: true, json: async () => ({ order_id: 'provider-a', order_status: 'PAID', order_amount: 5999, order_currency: 'INR', ...provider }) }) });
  vm.runInContext(code + '\nglobalThis.api = { verifyPayment, verifyCashfreeWebhook, courseAmount, normalizeProviderStatus, ensureStudentProfile };', context);
  return { api: context.api, admin, env, order, writes, finalized: () => finalized };
}

test('verified PAID order enrolls the order owner in the order course', async () => {
  const h = harness();
  const result = await h.api.verifyPayment(h.admin, h.env, { id: 'student-a' }, 'order-a');
  assert.equal(result.enrollment.course_id, 'course-b');
  assert.equal(result.enrollment.user_id, 'student-a');
  assert.equal(h.finalized(), 1);
});
for (const status of ['ACTIVE', 'EXPIRED', 'TERMINATED', 'UNPAID', 'SUCCESS', 'unsuccessful']) {
  test(`provider status ${status} does not grant enrollment`, async () => {
    const h = harness({ order_status: status });
    const result = await h.api.verifyPayment(h.admin, h.env, { id: 'student-a' }, 'order-a');
    assert.notEqual(result.payment_status, 'success');
    assert.equal(h.finalized(), 0);
  });
}
for (const changed of [{ order_amount: 1 }, { order_amount: 5998.99 }, { order_currency: 'USD' }, { order_id: 'other-order' }]) {
  test(`rejects mismatched provider context ${JSON.stringify(changed)}`, async () => {
    const h = harness(changed);
    await assert.rejects(h.api.verifyPayment(h.admin, h.env, { id: 'student-a' }, 'order-a'), /mismatch/);
    assert.equal(h.finalized(), 0);
  });
}
test('another student cannot verify or claim the paid order', async () => {
  const h = harness();
  await assert.rejects(h.api.verifyPayment(h.admin, h.env, { id: 'student-other' }, 'order-a'), /Order not found/);
  assert.equal(h.finalized(), 0);
});
test('webhooks fail closed without a secret or a valid signature', async () => {
  const h = harness();
  const request = { headers: new Headers() };
  await assert.rejects(h.api.verifyCashfreeWebhook({}, request, '{}'), /not configured/);
  await assert.rejects(h.api.verifyCashfreeWebhook(h.env, request, '{}'), /signature missing/);
});
test('invalid course prices cannot silently become free courses', () => {
  const h = harness();
  for (const price of [null, undefined, '', 'invalid', -1, 12.5]) assert.throws(() => h.api.courseAmount({ price }), /not configured/);
  assert.equal(h.api.courseAmount({ price: 0 }), 0);
  assert.equal(h.api.courseAmount({ price: 5999 }), 5999);
});
test('database completion errors propagate instead of reporting enrollment success', async () => {
  const h = harness();
  h.admin.rpc = async () => ({ error: new Error('transaction rolled back') });
  await assert.rejects(h.api.verifyPayment(h.admin, h.env, { id: 'student-a' }, 'order-a'), /rolled back/);
});
