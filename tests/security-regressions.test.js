const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const latestMigrationContaining = (pattern) => {
  const migrationsDir = path.join(root, "supabase", "migrations");
  const file = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => pattern.test(read(path.join("supabase", "migrations", name))));
  assert.ok(file, `Expected a migration matching ${pattern}`);
  return { file, source: read(path.join("supabase", "migrations", file)) };
};

test("role authorization requires a live Supabase Auth user", () => {
  const source = read("auth-session.js");
  assert.doesNotMatch(source, /legacyPasswordLogin/);
  assert.match(source, /const profile = await profileFromCurrentAuth\(\);/);
});

test("auth profile fallback preserves auth user id lookup", () => {
  const source = read("auth-session.js");
  const fallback = source.slice(source.indexOf("if (response.error && /column"), source.indexOf("if (response.error) throw response.error"));
  assert.match(fallback, /\.or\(`id\.eq\.\$\{authUser\.id\},auth_user_id\.eq\.\$\{authUser\.id\}`\)/);
  assert.match(fallback, /\.ilike\("email", authUser\.email \|\| ""\)/);
});

test("student purchases use the atomic purchase RPC", () => {
  const source = read("student.js");
  const purchase = source.slice(source.indexOf("async function purchaseItem"), source.indexOf("async function saveProfile"));
  assert.match(purchase, /rpc\("lms_purchase_shop_item"/);
  assert.doesNotMatch(purchase, /insertPurchaseRecord\(/);
  assert.doesNotMatch(purchase, /updateStudentProfile\(\{ coins:/);
});

test("course purchase flow verifies payment server-side before enrollment", () => {
  const browser = read("course-purchase.js");
  const edge = read("supabase/functions/course-purchase/index.ts");
  const migration = read("supabase/migrations/20260822_course_purchase_flow.sql");

  assert.match(browser, /functions\.invoke\(PURCHASE_FUNCTION/);
  assert.doesNotMatch(browser, /from\("user_courses"\)\.insert/);
  assert.doesNotMatch(browser, /payment_status.*success[\s\S]{0,120}user_courses/);
  assert.match(edge, /courseAmount\(course\)/);
  assert.doesNotMatch(edge, /body\.amount/);
  assert.match(edge, /fetchProviderOrder/);
  assert.match(edge, /verifyCashfreeWebhook/);
  assert.match(edge, /Webhook amount or currency mismatch/);
  assert.match(edge, /grantEnrollment\(admin, String\(order\.user_id\), String\(order\.course_id\)\)/);
  assert.match(edge, /const enrollment = await activeEnrollment\(admin, profile\.id, order\.course_id\)\s*\|\| await grantEnrollment\(admin, String\(order\.user_id\), String\(order\.course_id\)\)/);
  assert.match(edge, /not\("status", "in", "\(archived,removed,cancelled,inactive,deleted,disabled\)"\)/);
  assert.match(edge, /await syncProfileCourseIds\(admin, String\(order\.user_id\), String\(order\.course_id\)\)/);
  assert.match(edge, /lms_admin_update_user_assignment/);
  assert.match(edge, /function parseCourseIds\(value: unknown\)/);
  assert.match(migration, /lms_course_orders/);
  assert.match(migration, /lms_course_payments/);
  assert.match(migration, /user_courses_user_course_active_unique_idx/);
});

test("course purchase uses Cashfree hosted checkout for in-app browser compatibility", () => {
  const browser = read("course-purchase.js");

  assert.match(browser, /cashfree\.checkout\(\{ paymentSessionId, redirectTarget: "_self" \}\)/);
  assert.match(browser, /invokePurchase\("verify_payment", \{ order_id: orderId \}\)/);
});

test("course purchase assigns paid courses to new and existing student profiles only after verification", () => {
  const edge = read("supabase/functions/course-purchase/index.ts");
  const ensureProfile = edge.slice(edge.indexOf("async function ensureStudentProfile"), edge.indexOf("async function findProfile"));
  const createOrder = edge.slice(edge.indexOf("async function createCourseOrder"), edge.indexOf("async function createProviderOrder"));
  const grant = edge.slice(edge.indexOf("async function grantEnrollment"), edge.indexOf("async function pendingOrder"));

  assert.match(ensureProfile, /if \(existing\?\.id\)/);
  assert.match(ensureProfile, /role: "student"/);
  assert.match(createOrder, /const existingEnrollment = await activeEnrollment\(admin, profile\.id, course\.id\)/);
  assert.match(createOrder, /return \{ already_owned: true/);
  assert.match(edge, /async function verifyPayment/);
  assert.match(edge, /const enrollment = await grantEnrollment\(admin, String\(order\.user_id\), String\(order\.course_id\)\)/);
  assert.match(grant, /user_id: userId/);
  assert.match(grant, /student_id: userId/);
  assert.match(grant, /learner_id: userId/);
  assert.match(grant, /status: "active"/);
  assert.doesNotMatch(createOrder, /grantEnrollment\(admin, profile\.id, course\.id\)[\s\S]{0,80}payment_status: "pending"/);
});

test("student-visible courses require active lifecycle while learning access requires assignment", () => {
  const student = read("student.js");
  const edge = read("supabase/functions/course-purchase/index.ts");
  const migration = latestMigrationContaining(/lms_student_has_course/);

  assert.match(student, /function isStudentVisibleCourse\(course\)/);
  assert.match(student, /String\(course\?\.status \|\| ""\)\.toLowerCase\(\) === "active"/);
  assert.match(student, /ids\.has\(String\(course\.id\)\)[\s\S]*&& isStudentVisibleCourse\(course\)/);
  assert.match(student, /return query\.ilike\("status", "active"\)\.is\("deleted_at", null\)/);
  assert.match(edge, /\.is\("deleted_at", null\)\.ilike\("status", "active"\)/);
  assert.match(edge, /String\(course\.status \|\| ""\)\.toLowerCase\(\) !== "active"/);
  assert.match(migration.source, /create policy courses_students_active_only/);
  assert.match(migration.source, /lower\(coalesce\(status, ''\)\) = 'active'/);
  assert.doesNotMatch(migration.source, /public\.lms_student_has_course\(id\)/);
  assert.match(migration.source, /create or replace function public\.lms_student_has_batch/);
  assert.match(migration.source, /drop policy if exists users_student_batch_mentor_read/);
});

test("course purchase signup prevents duplicate registration submits", () => {
  const source = read("course-purchase.js");
  assert.equal(source.match(/\.auth\.signUp\(/g)?.length || 0, 1);
  assert.match(source, /window\.__jenovatePurchaseFlowInitialized/);
  assert.match(source, /if \(state\.accountBusy\) return/);
  assert.match(source, /state\.accountBusy = true/);
  assert.match(source, /setFormBusy\(form, true, "Creating your account\.\.\."\)/);
  assert.doesNotMatch(source, /emailRedirectTo/);
  assert.doesNotMatch(source, /purchase_resume/);
  assert.doesNotMatch(source, /data-purchase-panel="confirm-email"/);
  assert.match(source, /Too many signup attempts\. Please wait a moment and try again\./);
});

test("task rewards are returned by the submission RPC", () => {
  const source = read("student.js");
  const submission = source.slice(source.indexOf("async function submitTask"), source.indexOf("async function saveProfile"));
  const latest = latestMigrationContaining(/create or replace function public\.lms_submit_task_once/);

  assert.match(submission, /rpc\("lms_submit_task_once"/);
  assert.match(submission, /result\?\.reward_amount/);
  assert.doesNotMatch(submission, /rewardCoins\(/);
  assert.match(latest.source, /returns jsonb/);
  assert.match(latest.source, /jsonb_build_object\([\s\S]*'submission_id'[\s\S]*'first_submission'[\s\S]*'reward_amount'/);
  assert.match(latest.source, /case when first_submission then 'submitted' else 'resubmitted' end/);
  assert.doesNotMatch(latest.source, /This task has already been submitted/);
});

test("public forms use the validated RPC and no browser EmailJS call", () => {
  const engine = read("form-engine/app.js");
  const join = read("join-form.js");
  assert.match(engine, /rpc\("lms_submit_public_form"/);
  assert.match(join, /rpc\("lms_submit_public_form"/);
  assert.doesNotMatch(engine, /api\.emailjs\.com/);
});

test("all application pages use a vendored platform SDK", () => {
  for (const file of ["admin.html", "mentor.html", "login.html", "join-form.html", "reset-password.html"]) {
    const source = read(file);
    assert.match(source, /assets\/vendor\/supabase-2\.49\.4\.js/);
    assert.doesNotMatch(source, /cdn\.jsdelivr\.net\/npm\/@supabase/);
  }
  const student = read("student.html");
  assert.match(student, /assets\/vendor\/lms-platform-sdk\.js/);
  assert.doesNotMatch(student, /cdn\.jsdelivr\.net\/npm\/@supabase/);
});
test("role portals share the extracted DOM escaping module", () => {
  const domUtils = read("modules/dom-utils.js");
  const portalUtils = read("modules/portal-utils.js");
  assert.match(domUtils, /window\.JenovateDom/);
  assert.match(domUtils, /function escapeHtml/);
  assert.match(domUtils, /function escapeAttr/);
  assert.match(portalUtils, /window\.JenovateDom\?\.escapeHtml/);
  assert.match(portalUtils, /window\.JenovateDom\?\.escapeAttr/);

  for (const file of ["admin.html", "mentor.html", "student.html"]) {
    assert.match(read(file), /modules\/dom-utils\.js\?v=20260728-dom-utils-v1/);
    assert.match(read(file), /modules\/portal-utils\.js\?v=20260731-file-size-v1/);
  }

  for (const file of ["admin.js", "mentor.js", "student.js"]) {
    const source = read(file);
    assert.match(source, /window\.JenovatePortalUtils/);
    assert.match(source, /escapeHtml/);
    assert.match(source, /escapeAttr/);
  }
});

test("security migration removes broad student profile access", () => {
  const migration = read("supabase/migrations/20260714_lms_security_hardening.sql");
  assert.match(migration, /drop policy if exists users_student_batch_mentor_read/);
  assert.match(migration, /create policy users_self_profile_update/);
  assert.match(migration, /create or replace function public\.lms_student_directory/);
  assert.match(migration, /create or replace function public\.lms_purchase_shop_item/);
});

test("student leaderboard uses authorized aggregate data without synthetic points", () => {
  const source = read("student.js");
  const migration = read("supabase/migrations/20260714_lms_student_leaderboard.sql");
  assert.match(source, /rpc\("lms_student_leaderboard"/);
  assert.doesNotMatch(source, /Math\.max\(0, 3 - index\) \* 1250/);
  assert.match(migration, /public\.lms_current_user_id\(\)/);
  assert.match(migration, /cross join allowed_courses/);
  assert.match(migration, /dense_rank\(\) over/);
  assert.doesNotMatch(migration, /u\.email/);
  assert.doesNotMatch(migration, /u\.phone/);
});

test("student streak uses a Monday-to-Sunday LMS-local cycle", () => {
  const student = read("student.js");
  const styles = read("student-streak-v4.css");
  const migration = read("supabase/migrations/20260715_lms_weekly_streak_cycle.sql");

  assert.match(student, /const mondayOffset = \(now\.getDay\(\) \+ 6\) % 7/);
  assert.match(student, /setupDailyStreakRefresh\(\)/);
  assert.match(student, /recordLocalStreakVisit\(\)/);
  assert.match(student, /localWeeklyStreakDates\(\)\.forEach/);
  assert.match(styles, /fill: #315cf5 !important/);
  assert.match(migration, /timezone\('Asia\/Kolkata', now\(\)\)::date/);
  assert.match(migration, /date_trunc\('week', last_active_date::timestamp\)/);
  assert.match(migration, /least\(coalesce\(streak_count, 0\) \+ 1, 7\)/);
});

test("daily login reward refreshes the persisted coin balance before rendering", () => {
  const source = read("student.js");
  const reward = source.slice(source.indexOf("async function syncDailyStreak"), source.indexOf("function setupDailyStreakRefresh"));

  assert.match(reward, /lms_claim_daily_login_reward/);
  assert.match(reward, /coin_balance: Number\(result\.coin_balance/);
  assert.match(reward, /await refreshStudentProfileAfterReward\(result\)/);
  assert.match(reward, /renderIdentity\(\)/);
  assert.match(source, /select\("coins,coin_balance,streak_count,last_active_date,last_login_reward_date"\)/);
  assert.match(read("supabase/migrations/20260813_student_rewards_persistence_fix.sql"), /scope = 'student_rewards'/);
});

test("daily login reward is ten coins with a seven-day bonus and database-unique per LMS date", () => {
  const migration = read("supabase/migrations/20260902_daily_login_10_coin_streak_bonus.sql");
  const source = read("student.js");

  assert.match(migration, /create table if not exists public\.lms_daily_login_rewards/);
  assert.match(migration, /primary key \(user_id, reward_date\)/);
  assert.match(migration, /lms_reward_date date := timezone\('Asia\/Kolkata', now\(\)\)::date/);
  assert.match(migration, /daily_reward integer := 10/);
  assert.match(migration, /streak_bonus_amount integer := 10/);
  assert.match(migration, /streak_length integer := 7/);
  assert.match(migration, /mod\(next_streak, streak_length\) = 0/);
  assert.match(migration, /daily_coins integer not null default 0/);
  assert.match(migration, /streak_day integer not null default 0/);
  assert.match(migration, /streak_bonus integer not null default 0/);
  assert.match(migration, /total_coins_awarded integer not null default 0/);
  assert.match(migration, /on conflict \(user_id, reward_date\) do nothing/);
  assert.match(migration, /target_user_id is not null and target_user_id <> profile\.id/);
  assert.match(migration, /select b\.id into valid_batch_id/);
  assert.match(migration, /new\.id,\s*valid_batch_id,/);
  assert.doesNotMatch(migration, /body\.amount|target_amount|target_reward_date/);
  assert.match(source, /totalReward/);
  assert.match(source, /streakBonus/);
});

test("admin and mentor task saves use total_marks without writing removed max_marks", () => {
  for (const file of ["admin.js", "mentor.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /batchTasks: ".*max_marks/);
    assert.doesNotMatch(source, /taskSubmissions: ".*max_marks/);
    assert.doesNotMatch(source, /\bmax_marks:\s*valueOf\("taskTotalMarks"\)/);
    assert.doesNotMatch(source, /\bmax_marks:\s*totalMarks/);
    assert.match(source, /\btotal_marks:/);
  }
});

test("admin exposes production course content management", () => {
  const source = read("admin.js");
  assert.match(source, /data-content-course/);
  assert.match(source, /openCourseContentModal/);
  assert.match(source, /normalizeGoogleDrivePreviewUrl/);
  assert.match(source, /isValidGoogleDriveVideoLink/);
});

test("admin user Edge Function validates duplicates and rolls back auth users", () => {
  const source = read("supabase/functions/admin-save-user/index.ts");
  assert.match(source, /duplicate_email/);
  assert.match(source, /createdAuthUserId/);
  assert.match(source, /auth\.admin\.deleteUser/);
  assert.match(source, /Admin access required/);
  assert.match(source, /upsertEnrollment/);
  assert.match(source, /findAuthUserByEmail/);
  assert.match(source, /updateAuthUser\(admin, targetAuthUserId, payload, password \|\| null\)/);
  assert.match(source, /user_metadata: \{ name: payload\.name, role: payload\.role \}/);
});

test("admin user creation cannot silently create profile-only login accounts", () => {
  const source = read("admin.js");
  assert.match(source, /authSensitiveChange/);
  assert.doesNotMatch(source, /createAdminUserViaPublicSignup/);
  assert.doesNotMatch(source, /signUp\(/);
  assert.match(source, /Admin user service is required to create users/);
  assert.match(source, /Admin user service is required to change emails or reset passwords/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY configured/);
  assert.match(source, /stripKeys\(payload, \["password", "auth_user_id", "course_ids", "referral", "coins", "status"\]\)/);
  assert.match(source, /adminUserServiceErrorMessage/);
  assert.match(source, /lastAdminUserApiSetupError/);
  assert.match(source, /functions\.invoke\("admin-save-user"/);
  assert.doesNotMatch(source, /saveAdminUserViaApi/);
  assert.doesNotMatch(source, /requestAdminUserSave/);
  assert.doesNotMatch(source, /\/api\/admin-save-user/);
  assert.doesNotMatch(source, /\/api\/admin-course-assignment/);
});

test("admin save services only persist allowlisted user profile fields", () => {
  for (const file of ["supabase/functions/admin-save-user/index.ts"]) {
    const source = read(file);
    assert.match(source, /const allowedProfileFields = \[/);
    assert.match(source, /function profilePayloadFromPayload/);
    assert.match(source, /for \(const field of allowedProfileFields\)/);
    assert.match(source, /password: "supabase_auth_managed"/);
    assert.doesNotMatch(source, /\{\s*\.\.\.payload,\s*auth_user_id: authUserId\s*\}/);
  }
});

test("admin assignment writes use the trusted assignment RPC", () => {
  const edge = read("supabase/functions/admin-save-user/index.ts");
  const migration = read("supabase/migrations/20260826_admin_user_assignment_trusted_writes.sql");
  const liveQa = read("scripts/final-production-acceptance-test.mjs");

  assert.match(edge, /rpc\("lms_admin_update_user_assignment"/);
  assert.match(edge, /function persistUserAssignment/);
  assert.doesNotMatch(edge, /from\("users"\)\.update\(\{ batch_id: batchId \}\)/);
  assert.match(migration, /scope in \('student_rewards', 'admin_user_write'\)/);
  assert.match(migration, /create or replace function public\.lms_admin_update_user_assignment/);
  assert.match(migration, /grant execute on function public\.lms_admin_update_user_assignment\(uuid, uuid, jsonb\) to service_role/);
  assert.match(liveQa, /functions\.invoke\("admin-save-user"/);
  assert.doesNotMatch(liveQa, /from\("users"\)\.update\(\{ batch_id: batch\.data\.id \}\)/);
});

test("admin password reset can create missing Supabase Auth logins for legacy profiles", () => {
  for (const file of ["supabase/functions/admin-save-user/index.ts"]) {
    const source = read(file);
    assert.match(source, /else if \(password\)/);
    assert.match(source, /email_confirm: true/);
    assert.match(source, /createdAuthUserId = authUserId/);
  }
});

test("admin save services link existing Auth users by email before creating a profile", () => {
  for (const file of ["supabase/functions/admin-save-user/index.ts"]) {
    const source = read(file);
    assert.match(source, /findAuthUserByEmail/);
    assert.match(source, /existingAuthUser\?\.id/);
    assert.match(source, /app_metadata: \{ role: payload\.role \}/);
  }
});

test("admin save services retry profile writes without optional schema-drift fields", () => {
  for (const file of ["supabase/functions/admin-save-user/index.ts"]) {
    const source = read(file);
    assert.match(source, /writeProfileWithFallback/);
    assert.match(source, /profilePayloadCandidates/);
    assert.match(source, /stripPayloadFields\(payload, \["course_ids", "expertise", "referral", "coins", "status"\]\)/);
    assert.match(source, /stripPayloadFields\(payload, \["password", "auth_user_id", "course_ids", "expertise", "referral", "coins", "status"\]\)/);
    assert.match(source, /pickPayloadFields\(payload, \["email", "name", "role"\]\)/);
    assert.match(source, /isSchemaShapeError/);
  }
});

test("admin user forms and CSV import enforce the backend password policy", () => {
  const source = read("admin.js");
  assert.match(source, /const MIN_ADMIN_PASSWORD_LENGTH = 8/);
  assert.doesNotMatch(source, /123456/);
  assert.match(source, /id="createUserPassword"[^>]+minlength="\$\{MIN_ADMIN_PASSWORD_LENGTH\}"/);
  assert.match(source, /Row \$\{shortPassword\._row\} password must be at least \$\{MIN_ADMIN_PASSWORD_LENGTH\} characters/);
  assert.match(source, /id="userPassword"[^>]+minlength="\$\{MIN_ADMIN_PASSWORD_LENGTH\}"/);
});

test("admin CSV import validates file size, type, row limit, and email before import", () => {
  const source = read("admin.js");
  assert.match(source, /const MAX_USER_CSV_BYTES = 1 \* 1024 \* 1024/);
  assert.match(source, /const MAX_USER_CSV_ROWS = 500/);
  assert.match(source, /validateUserCsvFile\(file\)/);
  assert.match(source, /CSV import is limited to \$\{MAX_USER_CSV_ROWS\} users/);
  assert.match(source, /CSV headers required: name, email, course, batch, password/);
  assert.match(source, /const requiredHeaders = \["name", "email", "course", "batch", "password"\]/);
  assert.match(source, /CSV is missing required header/);
  assert.match(source, /Row \$\{missingValue\._row\} is missing \$\{field\}/);
  assert.match(source, /Upload a valid \.csv file/);
  assert.match(source, /role: "student"/);
  assert.doesNotMatch(source, /importDefaultRole|importDefaultPassword|importDefaultCourse|importDefaultBatch/);
});

test("admin support attachments are restricted and optional cleanup cannot block resolved tickets", () => {
  const source = read("admin.js");
  const page = read("admin.html");
  assert.match(source, /const MAX_SUPPORT_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/);
  assert.match(source, /SUPPORT_ATTACHMENT_TYPES/);
  assert.match(source, /validateSupportAttachment\(file\)/);
  assert.match(source, /Support attachments must be PDF, image, text, CSV, Word, or Excel files/);
  assert.match(source, /deleteSupportChildRows\("support_attachments", ticketId, \{ optional: true \}\)/);
  assert.match(page, /id="supportReplyAttachment" type="file" accept="[^"]+application\/pdf/);
});

test("login and student startup do not wait on optional dashboard RPCs", () => {
  const login = read("login.html");
  const student = read("student.js");
  const auth = read("auth-session.js");

  assert.doesNotMatch(login, /await claimDailyLoginReward/);
  assert.doesNotMatch(login, /clearExistingSession\(\)/);
  assert.match(student, /void finishStudentBootstrap/);
  assert.match(student, /void syncDailyStreak/);
  assert.match(student, /8_000/);
  assert.match(auth, /Login timed out/);
  assert.match(auth, /Session verification timed out/);
});

test("student catalog shows all active courses without self enrollment", () => {
  const student = read("student.js");
  const catalog = student.slice(student.indexOf("function renderCatalog"), student.indexOf("function renderRailTasks"));
  const catalogCourses = student.slice(student.indexOf("function catalogCourses"), student.indexOf("function mergedCourseRows"));
  const details = student.slice(student.indexOf("function openCourseDetailModal"), student.indexOf("function openCourseReview"));
  const openCourseHandler = student.slice(student.indexOf("const openCourse = event.target.closest"), student.indexOf("const detailCourse = event.target.closest"));

  assert.match(catalog, /const enrolledIds = studentCourseIds\(\)/);
  assert.doesNotMatch(catalogCourses, /const ids = studentCourseIds\(\)/);
  assert.match(catalogCourses, /isStudentVisibleCourse\(course\)/);
  assert.doesNotMatch(catalogCourses, /ids\.has\(String\(course\.id\)\)/);
  assert.doesNotMatch(catalog, /\.filter\(\(course\) => !enrolledIds\.has\(String\(course\.id\)\)\)/);
  assert.match(catalog, /courseCatalogCard\(course,\s*enrolledIds\)/);
  assert.match(catalog, /Assigned/);
  assert.match(catalog, /Open/);
  assert.doesNotMatch(catalog, /data-open-course/);
  assert.doesNotMatch(student, /data-enroll-course/);
  assert.doesNotMatch(student, /function enrollInCourse/);
  assert.doesNotMatch(student, /lms_enroll_student/);
  assert.match(details, /View & Buy/);
  assert.match(details, /courseDetailCheckoutHref/);
  assert.match(student, /checkout=1/);
  assert.match(details, /data-open-course/);
  assert.match(openCourseHandler, /setView\("learn"\)/);
});

test("student portal hides broken batch data and mojibake labels", () => {
  const student = read("student.js");
  const utils = read("modules/portal-utils.js");
  const scopedBatches = student.slice(student.indexOf("function scopedBatches"), student.indexOf("function currentBatch"));
  const batchFilters = student.slice(student.indexOf("function applyScopedFilters"), student.indexOf("function revalidateTable"));
  const renderChat = student.slice(student.indexOf("function renderChat"), student.indexOf("function renderBatchPendingTasks"));

  assert.match(utils, /function cleanText/);
  assert.match(utils, /replace\(\S*�/);
  assert.match(scopedBatches, /!isInactiveRecord\(batch\)/);
  assert.match(batchFilters, /studentBatchFilterIds\(\)\.length \? query\.in\("batch_id", studentBatchFilterIds\(\)\) : query/);
  assert.match(student, /function studentBatchFilterIds/);
  assert.match(student, /state\.selectedBatchId/);
  assert.match(student, /\["archived", "deleted", "inactive", "cancelled", "removed", "disabled"\]/);
  assert.match(renderChat, />Reply<\/button>/);
  assert.doesNotMatch(renderChat, /Â|Ã|â|�/);
});

test("mentor chat and support flows stay scoped and actionable", () => {
  const mentor = read("mentor.js");
  const migration = read("supabase/migrations/20260907_mentor_batch_chat_delete.sql");
  const questionMigration = read("supabase/migrations/20260907_student_question_valid_batch.sql");
  const questionReplyMigration = read("supabase/migrations/20260907_mentor_question_reply.sql");
  const scopedBatches = mentor.slice(mentor.indexOf("function scopedBatches"), mentor.indexOf("function scopedStudents"));
  const scopedQuestions = mentor.slice(mentor.indexOf("function scopedQuestions"), mentor.indexOf("function isQuestionProject"));
  const messageRow = mentor.slice(mentor.indexOf("function messageRow"), mentor.indexOf("function announcementRow"));

  assert.match(scopedBatches, /isActiveLmsRow\(batch\)/);
  assert.match(scopedQuestions, /courseIds\.has\(String\(project\.course_id\)\)/);
  assert.match(mentor, /supportOwnerRows/);
  assert.match(mentor, /query\.eq\("user_id", mentorId\)/);
  assert.match(messageRow, /data-reply-chat/);
  assert.match(messageRow, /data-delete-chat/);
  assert.match(mentor, /lms_mentor_delete_batch_chat/);
  assert.match(migration, /public\.lms_current_role\(\) <> 'mentor'/);
  assert.match(migration, /public\.lms_is_mentor_for_batch\(target_batch_id\)/);
  assert.match(questionMigration, /valid_batch_id/);
  assert.match(questionMigration, /join public\.batches b on b\.id = uc\.batch_id/);
  assert.match(questionMigration, /b\.deleted_at is null/);
  assert.match(questionMigration, /batch_id, course_id, title, description/);
  assert.match(mentor, /lms_mentor_reply_student_question/);
  assert.match(questionReplyMigration, /public\.lms_current_role\(\) <> 'mentor'/);
  assert.match(questionReplyMigration, /feedback = trim\(reply_text\)/);
  assert.doesNotMatch(messageRow, /Â|Ã|â|�/);
});

test("student referral behavior stays extracted from the main portal bundle", () => {
  const student = read("student.js");
  const studentPage = read("student.html");
  const referral = read("student-referral.js");
  const code = read("modules/referral-code.js");

  const renderReferral = student.slice(student.indexOf("function renderReferral"), student.indexOf("function renderAchievementGrid"));
  assert.match(studentPage, /type="module" src="student-referral\.js/);
  assert.match(referral, /window\.renderStudentReferral = renderStudentReferral/);
  assert.match(code, /export function createReferralCode/);
  assert.match(renderReferral, /window\.renderStudentReferral\?\.\(state\.student\)/);
  assert.doesNotMatch(renderReferral, /innerHTML|referralShareText|referralCodeValue/);
});

test("authenticated portal startup bypasses stale Supabase table cache", () => {
  const admin = read("admin.js");
  const mentor = read("mentor.js");
  const student = read("student.js");

  assert.match(admin, /getCacheScope: \(\) => \[state\.admin\?\.id \|\| state\.admin\?\.email \|\| "", state\.selectedBatchId \|\| ""\]\.join\(":"\)/);
  assert.match(admin, /await loadAllData\(\{ initial: true, force: true \}\)/);
  assert.match(admin, /window\.setTimeout\(\(\) => void loadAllData\(\{ silent: true, force: true \}\), 0\)/);
  assert.match(mentor, /await loadAllData\(\{ initial: true, force: true \}\)/);
  assert.match(mentor, /window\.setTimeout\(\(\) => void loadAllData\(\{ silent: true, force: true \}\), 0\)/);
  assert.match(student, /await loadAllData\(\{ initial: true, force: true \}\)/);
  assert.match(student, /buildPersonalLeaderboardRows\(\)/);
});

test("academic dashboard uses real assessment data and protected activity rows", () => {
  const student = read("student.js");
  const studentPage = read("student.html");
  const admin = read("admin.js");
  const mentor = read("mentor.js");
  const migration = read("supabase/migrations/20260716_lms_academic_metrics.sql");

  assert.match(student, /buildAcademicMetrics\(tasks/);
  assert.match(student, /submittedAssignments: latestSubmissions\.size/);
  assert.match(student, /quizAttemptKey\(attempt/);
  assert.match(student, /quizAttemptPassMarks\(quiz/);
  assert.match(student, /JenovateAcademicMetrics\.courseProgress/);
  assert.match(student, /!attempt\.deleted_at/);
  assert.doesNotMatch(studentPage, /This Semester/);
  assert.match(studentPage, /<option value="all" selected>All Time<\/option>/);
  for (const portal of [admin, mentor]) {
    assert.match(portal, /taskTotalMarks/);
    assert.match(portal, /reviewScore/);
    assert.match(portal, /marks_obtained/);
    assert.match(portal, /graded_at/);
  }
  assert.match(migration, /create table if not exists public\.student_academic_activity/);
  assert.match(migration, /alter table public\.student_quiz_attempts/);
  assert.match(migration, /academic_activity_student_read/);
  assert.match(migration, /lms_record_on_time_submission_activity/);
  assert.match(migration, /lms_record_daily_login_activity/);
});

test("module quizzes use a 15-question bank and store randomized attempt details", () => {
  const student = read("student.js");
  const mentor = read("mentor.js");
  const admin = read("admin.js");
  const migration = read("supabase/migrations/20260716_lms_academic_metrics.sql");

  assert.match(student, /quiz\.questions\.length < 15/);
  assert.match(student, /Number\(quiz\.random_count \|\| 15\) \|\| 15/);
  assert.match(student, /Math\.min\(configuredCount, shuffled\.length\)/);
  assert.match(student, /time_taken_seconds/);
  assert.match(student, /selected_question_ids/);
  assert.match(mentor, /quiz needs at least 15 questions/);
  assert.match(mentor, /students get 5-7 random questions/);
  assert.match(admin, /student_quiz_attempts/);
  assert.match(admin, /adminQuizAttemptRow/);
  assert.match(migration, /time_taken_seconds integer/);
  assert.match(migration, /selected_question_ids jsonb/);
});

test("student course library scales without rendering every enrollment at once", () => {
  const student = read("student.js");
  const page = read("student.html");
  const styles = read("student-my-courses.css");

  assert.match(student, /limit: 200, scope: "courseCatalog"/);
  assert.match(student, /courseVisibleCount: 8/);
  assert.match(student, /courses\.slice\(0, state\.courseVisibleCount\)/);
  assert.match(student, /state\.courseVisibleCount \+= 8/);
  assert.match(student, /courseEnrollmentTime/);
  assert.match(page, /id="courseLibrarySearch"/);
  assert.match(page, /id="courseSortSelect"/);
  assert.match(page, /data-course-layout="grid"/);
  assert.match(page, /id="courseLoadMore"/);
  assert.match(styles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /background: #fbfcff !important/);
  assert.match(styles, /height: 326px !important/);
  assert.match(styles, /grid-template-columns: 230px minmax\(0, 1fr\) !important/);
  assert.match(styles, /footerInside|course-grid\.list-layout/);
  assert.match(styles, /@media \(max-width: 620px\)/);
});

test("student dashboard active courses are limited to the two most recent courses", () => {
  const student = read("student.js");
  const dashboard = student.slice(student.indexOf("function renderDashboard"), student.indexOf("async function loadSupplementalCourses"));
  const overview = student.slice(student.indexOf("function renderDashboardCourseOverview"), student.indexOf("function compactCourseDuration"));
  const recentCourses = student.slice(student.indexOf("function recentDashboardCourses"), student.indexOf("function renderCourseCards"));
  const enrolledCourses = student.slice(student.indexOf("function enrolledCourses"), student.indexOf("function catalogCourses"));
  const assignedCourseIds = student.slice(student.indexOf("function assignedCourseIds"), student.indexOf("function studentMentorIds"));

  assert.match(dashboard, /const activeDashboardCourses = courses\.filter\(\(course\) => !isArchivedCourse\(course\) && courseProgress\(course\)\.percent < 100\)/);
  assert.match(dashboard, /const recentCourses = recentDashboardCourses\(activeDashboardCourses\)/);
  assert.match(dashboard, /renderDashboardCourseOverview\(recentCourses\)/);
  assert.doesNotMatch(dashboard, /renderDashboardCourseOverview\(courses\.slice\(0,\s*4\)\)/);
  assert.match(overview, /const overviewCourses = courses\.slice\(0,\s*2\)/);
  assert.match(recentCourses, /courseRecentActivityTime\(b\) - courseRecentActivityTime\(a\)/);
  assert.match(recentCourses, /\.slice\(0,\s*2\)/);
  assert.match(recentCourses, /storedCourseAccessTimes\(\)/);
  assert.match(recentCourses, /latestQuizTimeForCourse/);
  assert.match(recentCourses, /latestSubmissionTimeForCourse/);
  assert.match(recentCourses, /latestAcademicActivityTimeForCourse/);
  assert.doesNotMatch(enrolledCourses, /courseFromBatch|batchFallbacks|Assigned Course|Assigned Batch/);
  assert.doesNotMatch(student, /function courseFromBatch/);
  assert.match(enrolledCourses, /isStudentVisibleCourse\(course\)/);
  assert.match(assignedCourseIds, /state\.data\.userCourses/);
  assert.match(assignedCourseIds, /state\.data\.batches/);
  assert.doesNotMatch(assignedCourseIds, /state\.data\.progress/);
});

test("admin course and batch writes preserve required relationship fields", () => {
  const admin = read("admin.js");
  const migration = read("supabase/migrations/20260723_admin_panel_functionality.sql");

  assert.match(admin, /courses: ".*thumbnail_url,image_url/);
  assert.match(admin, /id="courseThumbnailFile" type="file" accept="image\/\*"/);
  assert.match(admin, /id="courseImageFile" type="file" accept="image\/\*"/);
  assert.match(admin, /image_url: valueOf\("courseImage"\) \|\| null/);
  assert.match(admin, /data-view-batch/);
  assert.match(admin, /function openBatchDetailsModal/);
  assert.match(admin, /function batchStudents/);
  assert.match(admin, /const payload = compactObject\(\{ user_id: userId, course_id: courseId, batch_id: batchId \|\| null, status \}\)/);
  assert.match(migration, /add column if not exists image_url text/);
  assert.match(migration, /idx_user_courses_user_course_batch/);
});

test("admin shop management supports stock, enable disable, and archived records", () => {
  const admin = read("admin.js");
  const student = read("student.js");
  const migration = read("supabase/migrations/20260723_admin_panel_functionality.sql");

  assert.match(admin, /shopItems: "id,name,price,image_url,stock,status,deleted_at,created_at"/);
  assert.match(admin, /id="shopStock" type="number"/);
  assert.match(admin, /id="shopStatus"/);
  assert.match(admin, /data-toggle-shop/);
  assert.match(admin, /async function toggleShopStatus/);
  assert.match(student, /shopItems: "id,name,price,image_url,stock,status,deleted_at,created_at"/);
  assert.match(student, /\["archived", "disabled", "inactive"\]\.includes\(String\(item\.status \|\| "active"\)\.toLowerCase\(\)\)/);
  assert.match(student, /Number\(item\.stock\) > 0/);
  assert.match(migration, /add column if not exists stock integer not null default 0/);
  assert.match(migration, /add column if not exists status text not null default 'active'/);
  assert.match(migration, /add column if not exists deleted_at timestamptz/);
  assert.match(migration, /Reward item is out of stock/);
});
