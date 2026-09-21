import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports");
const DRIVE_URL = "https://drive.google.com/drive/folders/10TwRB1W8ofYV4SleOCNxwowMA8LyEdyZ?usp=sharing";
const INVALID_REFER_KEYS = new Set(["", "JNV-0000000", "JNV-00000000", "JNV-0000000000", "JNV-PENDING", "JNV-ACCOUNT"]);
const TABLES = [
  "users",
  "courses",
  "batches",
  "user_courses",
  "student_course_progress",
  "batch_tasks",
  "task_submissions",
  "projects",
  "announcements",
  "student_questions",
  "batch_chats",
  "student_quiz_attempts",
  "coin_transactions",
  "shop_items",
  "shop_purchases",
  "support_tickets",
  "public_form_submissions"
];

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return null;
    const value = match[2].replace(/^['"]|['"]$/g, "");
    return [match[1], value];
  }).filter(Boolean));
}

async function loadEnv() {
  const local = await readFile(path.join(ROOT, ".env.local"), "utf8");
  const env = { ...parseEnv(local), ...process.env };
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function headers(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function request(env, resource, options = {}) {
  const response = await fetch(`${env.url}${resource}`, {
    ...options,
    headers: headers(env.serviceKey, options.headers || {})
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || response.statusText;
    const error = new Error(`${message} (${response.status})`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return { data, headers: response.headers };
}

function filterEq(column, value) {
  return `${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`;
}

async function selectRows(env, table, query = "", select = "*") {
  const suffix = query ? `&${query}` : "";
  const { data } = await request(env, `/rest/v1/${table}?select=${encodeURIComponent(select)}${suffix}`);
  return Array.isArray(data) ? data : [];
}

async function countRows(env, table) {
  const { headers: responseHeaders } = await request(env, `/rest/v1/${table}?select=*&limit=0`, {
    headers: { Prefer: "count=exact" }
  });
  const range = responseHeaders.get("content-range") || "";
  const count = Number(range.split("/").pop());
  return Number.isFinite(count) ? count : 0;
}

async function patchRow(env, table, id, payload) {
  const { data } = await request(env, `/rest/v1/${table}?${filterEq("id", id)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(data) ? data[0] : data;
}

async function postRow(env, table, payload) {
  const { data } = await request(env, `/rest/v1/${table}?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(data) ? data[0] : data;
}

function cleanReferKey(value) {
  const code = String(value || "").trim().toUpperCase();
  return INVALID_REFER_KEYS.has(code) ? "" : code;
}

function hashReferralSeed(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).toUpperCase().padStart(8, "0");
}

function referralSeed(user) {
  return [user.auth_user_id, user.id, user.email, user.phone, user.username, user.name]
    .map((item) => String(item || "").trim())
    .find(Boolean);
}

function uniqueReferKey(user, used) {
  const seed = referralSeed(user);
  if (!seed) return "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const suffix = attempt ? `:${attempt}` : "";
    const code = `JNV-${hashReferralSeed(`${seed}${suffix}`)}`;
    if (!used.has(code)) return code;
  }
  throw new Error(`Unable to generate unique refer key for user ${user.id}`);
}

async function repairReferKeys(env) {
  const users = await selectRows(env, "users", "", "id,auth_user_id,name,email,username,phone,role,referral,referral_key,created_at");
  const used = new Set();
  const duplicateKeys = new Set();
  for (const user of users) {
    const code = cleanReferKey(user.referral_key || user.referral);
    if (!code) continue;
    if (used.has(code)) duplicateKeys.add(code);
    used.add(code);
  }

  const updated = [];
  const seen = new Set();
  for (const user of users) {
    const current = cleanReferKey(user.referral_key || user.referral);
    const needsUpdate = !current || duplicateKeys.has(current) || seen.has(current);
    if (!needsUpdate) {
      seen.add(current);
      continue;
    }
    if (current) used.delete(current);
    const next = uniqueReferKey(user, used);
    if (!next) continue;
    const row = await patchRow(env, "users", user.id, { referral_key: next });
    used.add(next);
    seen.add(next);
    updated.push({ id: user.id, email: user.email || "", name: user.name || "", old: current || null, refer_key: row?.referral_key || next });
  }

  return {
    totalUsers: users.length,
    updatedCount: updated.length,
    duplicateKeys: [...duplicateKeys],
    updated
  };
}

function cloudCoursePayload(existing = null) {
  const modules = [{
    id: "cloud-computing-foundations",
    title: "Module 1: Cloud Computing Foundations",
    description: "Core cloud concepts, service models, deployment models, and practical cloud learning resources.",
    lessons: [{
      id: "cloud-computing-drive-folder",
      title: "Cloud Computing Course Materials",
      description: "Drive folder containing the Cloud Computing lectures, notes, and course resources.",
      type: "resource",
      duration: "Self paced",
      drive_link: DRIVE_URL,
      google_drive_link: DRIVE_URL,
      resource_url: DRIVE_URL
    }],
    quiz: {
      id: "cloud-computing-foundations-check",
      title: "Cloud Computing Foundations Check",
      pass_score: 3,
      questions: [
        { question: "Which cloud model offers virtual machines, storage, and networking as building blocks?", options: ["IaaS", "PaaS", "SaaS", "DaaS"], answer: "IaaS" },
        { question: "Which deployment model is dedicated to a single organization?", options: ["Public cloud", "Private cloud", "Hybrid cloud", "Community cloud"], answer: "Private cloud" },
        { question: "Which benefit is most associated with cloud scalability?", options: ["Fixed hardware sizing", "On-demand resource growth", "Manual server procurement", "Offline-only access"], answer: "On-demand resource growth" },
        { question: "Which cloud service model usually provides a complete application to end users?", options: ["IaaS", "PaaS", "SaaS", "Bare metal"], answer: "SaaS" },
        { question: "What does a hybrid cloud combine?", options: ["Only private data centers", "Only public providers", "Public and private environments", "Local laptops only"], answer: "Public and private environments" }
      ]
    }
  }];
  return {
    title: "Cloud Computing",
    description: "Learn cloud computing foundations, deployment models, service models, and practical cloud resource workflows.",
    category: "Technology",
    duration: "Self paced",
    module_type: "Drive Resources",
    instructor_name: existing?.instructor_name || "Jenovate Mentor",
    rating: existing?.rating || "4.8",
    price: existing?.price || "Included",
    difficulty: "Beginner",
    modules,
    status: "Published",
    is_featured: true,
    is_my_course: false,
    created_by_admin: true,
    quiz_pass_score: 3,
    google_form_url: DRIVE_URL,
    updated_at: new Date().toISOString()
  };
}

async function upsertCloudCourse(env) {
  const existingRows = await selectRows(env, "courses", filterEq("title", "Cloud Computing"), "*");
  const existing = existingRows[0] || null;
  const payload = cloudCoursePayload(existing);
  try {
    const course = existing?.id
      ? await patchRow(env, "courses", existing.id, payload)
      : await postRow(env, "courses", { ...payload, created_at: new Date().toISOString() });
    return { action: existing?.id ? "updated" : "created", id: course?.id || existing?.id || null, title: "Cloud Computing" };
  } catch (error) {
    if (!/column|schema cache|Could not find/i.test(error.message)) throw error;
    const minimal = {
      title: payload.title,
      description: payload.description,
      category: payload.category,
      duration: payload.duration,
      modules: payload.modules,
      status: payload.status
    };
    const course = existing?.id
      ? await patchRow(env, "courses", existing.id, minimal)
      : await postRow(env, "courses", minimal);
    return { action: existing?.id ? "updated_minimal" : "created_minimal", id: course?.id || existing?.id || null, title: "Cloud Computing", note: error.message };
  }
}

async function storageReport(env) {
  const { data: buckets } = await request(env, "/storage/v1/bucket");
  const bucketReports = [];
  for (const bucket of buckets || []) {
    let offset = 0;
    let count = 0;
    let bytes = 0;
    for (;;) {
      const { data: objects } = await request(env, `/storage/v1/object/list/${encodeURIComponent(bucket.name)}`, {
        method: "POST",
        body: JSON.stringify({ prefix: "", limit: 1000, offset, sortBy: { column: "name", order: "asc" } })
      });
      const page = Array.isArray(objects) ? objects : [];
      for (const object of page) {
        if (!object.name) continue;
        count += 1;
        bytes += Number(object.metadata?.size || 0);
      }
      if (page.length < 1000) break;
      offset += 1000;
    }
    bucketReports.push({ bucket: bucket.name, public: Boolean(bucket.public), objects: count, bytes, mb: +(bytes / 1024 / 1024).toFixed(2) });
  }
  return bucketReports;
}

async function tableReport(env) {
  const rows = [];
  for (const table of TABLES) {
    try {
      const count = await countRows(env, table);
      const sample = await selectRows(env, table, "limit=100", "*").catch(() => []);
      const sampleBytes = Buffer.byteLength(JSON.stringify(sample));
      const avgRowBytes = sample.length ? sampleBytes / sample.length : 0;
      rows.push({ table, rows: count, estimatedJsonBytes: Math.round(avgRowBytes * count), estimatedJsonMb: +((avgRowBytes * count) / 1024 / 1024).toFixed(2) });
    } catch (error) {
      rows.push({ table, error: error.message });
    }
  }
  return rows;
}

function mdReport(report) {
  const tableLines = report.tables.map((item) => `| ${item.table} | ${item.rows ?? "-"} | ${item.estimatedJsonMb ?? "-"} | ${item.error || ""} |`).join("\n");
  const storageLines = report.storage.map((item) => `| ${item.bucket} | ${item.public ? "yes" : "no"} | ${item.objects} | ${item.mb} |`).join("\n");
  return `# Supabase Backend Report

Generated: ${report.generatedAt}
Project: ${report.projectUrl}

## Fixes Applied

- Refer keys updated: ${report.referKeys.updatedCount} of ${report.referKeys.totalUsers} users
- Duplicate refer keys found before repair: ${report.referKeys.duplicateKeys.length}
- Cloud Computing course: ${report.cloudCourse.action}${report.cloudCourse.id ? ` (${report.cloudCourse.id})` : ""}

## Tables

These are REST API row counts. Size is estimated JSON payload size, not physical Postgres table/index size.

| Table | Rows | Estimated JSON MB | Note |
| --- | ---: | ---: | --- |
${tableLines}

## Storage

| Bucket | Public | Objects | Size MB |
| --- | --- | ---: | ---: |
${storageLines || "| No buckets visible | - | - | - |"}

## Exact SQL For Physical Table Sizes

Run \`reports/supabase-physical-size-report.sql\` in Supabase SQL Editor for true table, index, and total relation sizes.
`;
}

async function main() {
  const env = await loadEnv();
  const [referKeys, cloudCourse] = await Promise.all([
    repairReferKeys(env),
    upsertCloudCourse(env)
  ]);
  const [tables, storage] = await Promise.all([
    tableReport(env),
    storageReport(env)
  ]);
  const report = {
    generatedAt: new Date().toISOString(),
    projectUrl: env.url,
    referKeys,
    cloudCourse,
    tables,
    storage
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(path.join(REPORT_DIR, "supabase-backend-report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(REPORT_DIR, "supabase-backend-report.md"), mdReport(report));
  console.log(JSON.stringify({
    report: "reports/supabase-backend-report.md",
    referKeysUpdated: referKeys.updatedCount,
    totalUsers: referKeys.totalUsers,
    cloudCourse,
    tableCount: tables.length,
    storageBuckets: storage.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
