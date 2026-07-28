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

test("student purchases use the atomic purchase RPC", () => {
  const source = read("student.js");
  const purchase = source.slice(source.indexOf("async function purchaseItem"), source.indexOf("async function saveProfile"));
  assert.match(purchase, /rpc\("lms_purchase_shop_item"/);
  assert.doesNotMatch(purchase, /insertPurchaseRecord\(/);
  assert.doesNotMatch(purchase, /updateStudentProfile\(\{ coins:/);
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

test("all application pages use the vendored Supabase SDK", () => {
  for (const file of ["admin.html", "mentor.html", "student.html", "login.html", "join-form.html", "reset-password.html"]) {
    const source = read(file);
    assert.match(source, /assets\/vendor\/supabase-2\.49\.4\.js/);
    assert.doesNotMatch(source, /cdn\.jsdelivr\.net\/npm\/@supabase/);
  }
});
test("role portals share the extracted DOM escaping module", () => {
  const domUtils = read("modules/dom-utils.js");
  assert.match(domUtils, /window\.JenovateDom/);
  assert.match(domUtils, /function escapeHtml/);
  assert.match(domUtils, /function escapeAttr/);

  for (const file of ["admin.html", "mentor.html", "student.html"]) {
    assert.match(read(file), /modules\/dom-utils\.js\?v=20260728-dom-utils-v1/);
  }

  for (const file of ["admin.js", "mentor.js", "student.js"]) {
    const source = read(file);
    assert.match(source, /window\.JenovateDom\?\.escapeHtml/);
    assert.match(source, /window\.JenovateDom\?\.escapeAttr/);
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
  assert.match(source, /const DEFAULT_IMPORT_PASSWORD = "Temp@12345"/);
  assert.doesNotMatch(source, /123456/);
  assert.match(source, /id="createUserPassword"[^>]+minlength="\$\{MIN_ADMIN_PASSWORD_LENGTH\}"/);
  assert.match(source, /id="importDefaultPassword"[^>]+value="\$\{DEFAULT_IMPORT_PASSWORD\}"/);
  assert.match(source, /id="userPassword"[^>]+minlength="\$\{MIN_ADMIN_PASSWORD_LENGTH\}"/);
});

test("admin CSV import validates file size, type, row limit, and email before import", () => {
  const source = read("admin.js");
  assert.match(source, /const MAX_USER_CSV_BYTES = 1 \* 1024 \* 1024/);
  assert.match(source, /const MAX_USER_CSV_ROWS = 500/);
  assert.match(source, /validateUserCsvFile\(file\)/);
  assert.match(source, /CSV import is limited to \$\{MAX_USER_CSV_ROWS\} users/);
  assert.match(source, /missing an email address/);
  assert.match(source, /Upload a valid \.csv file/);
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

test("student catalog previews only unassigned courses without self enrollment", () => {
  const student = read("student.js");
  const catalog = student.slice(student.indexOf("function renderCatalog"), student.indexOf("function renderRailTasks"));
  const details = student.slice(student.indexOf("function openCourseDetailModal"), student.indexOf("function openCourseReview"));
  const openCourseHandler = student.slice(student.indexOf("const openCourse = event.target.closest"), student.indexOf("const detailCourse = event.target.closest"));

  assert.match(catalog, /const enrolledIds = studentCourseIds\(\)/);
  assert.match(catalog, /\.filter\(\(course\) => !enrolledIds\.has\(String\(course\.id\)\)\)/);
  assert.match(catalog, /courseCatalogCard\(course\)/);
  assert.doesNotMatch(catalog, /courseCatalogCard\(course,\s*enrolledIds/);
  assert.doesNotMatch(catalog, /data-open-course/);
  assert.doesNotMatch(student, /data-enroll-course/);
  assert.doesNotMatch(student, /function enrollInCourse/);
  assert.doesNotMatch(student, /lms_enroll_student/);
  assert.match(details, /Assignment Required/);
  assert.match(details, /data-open-course/);
  assert.match(openCourseHandler, /setView\("learn"\)/);
});

test("authenticated portal startup bypasses stale Supabase table cache", () => {
  const admin = read("admin.js");
  const mentor = read("mentor.js");
  const student = read("student.js");

  assert.match(admin, /getCacheScope: \(\) => \[state\.admin\?\.id \|\| state\.admin\?\.email \|\| "", state\.selectedBatchId \|\| ""\]\.join\(":"\)/);
  assert.match(admin, /await loadAllData\(\{ force: true \}\)/);
  assert.match(mentor, /await loadAllData\(\{ force: true \}\)/);
  assert.match(student, /await loadAllData\(\{ initial: true, force: true \}\)/);
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
  assert.match(enrolledCourses, /!isArchivedCourse\(course\) \|\| courseProgress\(course\)\.percent >= 100/);
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
