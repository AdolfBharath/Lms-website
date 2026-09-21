(function () {
  const COURSE_SELECTOR = new URLSearchParams(window.location.search).get("course") || "javascript-imagination";
  const PURCHASE_FUNCTION = "course-purchase";
  const CASHFREE_SCRIPT = "https://sdk.cashfree.com/js/v3/cashfree.js";
  const DEFAULT_COURSE_AMOUNT = 5999;
  const REFERRAL_SOURCE = new URLSearchParams(window.location.search).get("ref")
    || new URLSearchParams(window.location.search).get("referral")
    || "";
  const state = { course: null, courseLoad: null, order: null, payment: null, mode: "account", busy: false, accountBusy: false, loginBusy: false, paymentBusy: false };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPurchaseFlow);
  } else {
    initPurchaseFlow();
  }

  function initPurchaseFlow() {
    if (window.__jenovatePurchaseFlowInitialized) return;
    window.__jenovatePurchaseFlowInitialized = true;
    document.body.insertAdjacentHTML("beforeend", modalMarkup());
    document.querySelectorAll("#masterclassEnroll,.primary-action").forEach((button) => {
      button.setAttribute("href", "#checkout");
      button.setAttribute("data-buy-course", COURSE_SELECTOR);
      button.textContent = "Buy Now";
    });
    document.addEventListener("click", handlePurchaseClick);
    document.getElementById("purchaseAccountForm")?.addEventListener("submit", createStudentAndContinue);
    document.getElementById("purchaseLoginForm")?.addEventListener("submit", loginAndContinue);
    document.getElementById("purchaseCheckoutPayButton")?.addEventListener("click", payForSelectedCourse);
    document.getElementById("purchaseRetryButton")?.addEventListener("click", payForSelectedCourse);
    state.course = pageCourseSnapshot();
    renderCheckoutCourse();
    prefillExistingLogin();
    state.courseLoad = hydrateBackendCourse();
    void verifyReturnedPayment();
    if (shouldAutoOpenCheckout()) {
      window.setTimeout(() => void startPurchase(), 120);
    }
  }

  async function hydrateBackendCourse() {
    try {
      const response = await invokePurchase("course", { course_slug: COURSE_SELECTOR }, false);
      state.course = normalizeCourse(response.course, state.course);
      renderCheckoutCourse();
      setText("coursePrice", money(response.course.final_amount ?? response.course.amount));
    } catch {
      state.course = normalizeCourse(state.course, pageCourseSnapshot());
      renderCheckoutCourse();
    }
    return state.course;
  }

  async function verifyReturnedPayment() {
    const orderId = new URLSearchParams(window.location.search).get("purchase_order_id");
    if (!orderId) return;
    openPurchaseModal("status");
    setStatus("Payment Processing", "Verifying your payment securely. Course access opens only after backend verification.");
    try {
      handlePaymentResult(await invokePurchase("verify_payment", { order_id: orderId }));
    } catch (error) {
      setStatus("Payment Processing", userMessage(error, "We could not confirm the payment yet. Please retry verification in a moment."), "processing");
    }
  }

  function handlePurchaseClick(event) {
    const buy = event.target.closest("[data-buy-course]");
    if (buy) {
      event.preventDefault();
      void startPurchase();
      return;
    }
    if (event.target.closest("[data-close-purchase]")) closePurchaseModal();
    if (event.target.closest("[data-return-checkout]")) {
      event.preventDefault();
      switchPanel("checkout");
      return;
    }
    const passwordToggle = event.target.closest("[data-toggle-purchase-password]");
    if (passwordToggle) {
      event.preventDefault();
      togglePurchasePassword(passwordToggle);
      return;
    }
    const switchMode = event.target.closest("[data-purchase-mode]");
    if (switchMode) {
      state.mode = switchMode.dataset.purchaseMode;
      prefillExistingLogin();
      renderMode();
    }
    if (event.target.closest("[data-start-learning]")) {
      window.location.href = "student.html?view=courses";
    }
  }

  function shouldAutoOpenCheckout() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase_order_id")) return false;
    return ["1", "true", "yes"].includes(String(params.get("checkout") || params.get("buy") || "").toLowerCase())
      || window.location.hash === "#checkout";
  }

  async function startPurchase() {
    if (state.busy) return;
    state.busy = true;
    openPurchaseModal("loading");
    setStatus("Checking Account", "Preparing secure checkout for the selected course.");
    try {
      await ensureCourseReady();
      const session = await currentSession();
      if (session?.user) {
        await ensureStudentProfile({});
        await openCheckout();
        return;
      }
      state.mode = rememberedStudentEmail() ? "login" : "account";
      prefillExistingLogin();
      openPurchaseModal(state.mode);
      renderMode();
    } catch (error) {
      setStatus("Checkout Unavailable", userMessage(error, "Unable to prepare checkout right now."), "failed");
    } finally {
      state.busy = false;
    }
  }

  async function createStudentAndContinue(event) {
    event.preventDefault();
    if (state.accountBusy) return;
    const form = event.currentTarget;
    const name = valueOf("purchaseName");
    const email = valueOf("purchaseEmail").toLowerCase();
    const phone = valueOf("purchasePhone");
    const password = valueOf("purchasePassword");
    const confirm = valueOf("purchaseConfirmPassword");
    if (password !== confirm) return showFormMessage("Passwords do not match.", true);
    if (password.length < 8) return showFormMessage("Password must be at least 8 characters.", true);
    state.accountBusy = true;
    setFormBusy(form, true, "Creating your account...");
    try {
      const client = getClient();
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { name, phone, role: "student", referral_source: REFERRAL_SOURCE || null } }
      });
      if (error && isExistingAccountError(error)) {
        state.mode = "login";
        prefillExistingLogin(email);
        renderMode();
        showFormMessage("This email already has an account. Login to continue checkout.", true, "purchaseLoginMessage");
        return;
      } else if (error) {
        throw error;
      } else if (!data.session) {
        const login = await client.auth.signInWithPassword({ email, password });
        if (login.error) throw new Error("Account created, but automatic login is unavailable. Please log in to continue checkout.");
      }
      await ensureStudentProfile({ name, email, phone, referral_source: REFERRAL_SOURCE || null });
      showFormMessage("Account created. Continuing to secure checkout...");
      try {
        await openCheckout();
      } catch (checkoutError) {
        showFormMessage("Account created. Checkout could not open for this course yet.", true);
        setStatus("Checkout Unavailable", userMessage(checkoutError, "This course is not ready for checkout yet. Please contact support."), "failed");
      }
    } catch (error) {
      showFormMessage(userMessage(error, "Unable to create student account."), true);
    } finally {
      state.accountBusy = false;
      setFormBusy(form, false);
    }
  }

  async function loginAndContinue(event) {
    event.preventDefault();
    if (state.loginBusy) return;
    const form = event.currentTarget;
    state.loginBusy = true;
    setFormBusy(form, true, "Checking your account...");
    try {
      const { error } = await getClient().auth.signInWithPassword({
        email: valueOf("purchaseLoginEmail").toLowerCase(),
        password: valueOf("purchaseLoginPassword"),
      });
      if (error) throw error;
      await ensureStudentProfile({});
      await openCheckout();
    } catch (error) {
      showFormMessage(userMessage(error, "Login failed."), true, "purchaseLoginMessage");
    } finally {
      state.loginBusy = false;
      setFormBusy(form, false);
    }
  }

  async function ensureStudentProfile(profile) {
    const response = await invokePurchase("create_student_profile", { profile });
    if (String(response.profile?.role || "").toLowerCase() !== "student") throw new Error("Only student accounts can buy courses.");
    return response.profile;
  }

  async function openCheckout() {
    openPurchaseModal("checkout");
    setStatus("Secure Checkout", "Creating a pending order for the exact selected course.");
    await ensureCourseReady();
    const response = await invokePurchase("create_order", { course_slug: COURSE_SELECTOR });
    state.course = normalizeCourse(response.course, state.course);
    state.order = response.order || null;
    renderCheckoutCourse();
    if (response.already_owned) return setStatus("Already Purchased", "This course is already available in My Courses.", "owned", response);
    if (response.payment_status === "success") return handlePaymentResult(response);
    switchPanel("checkout");
    document.getElementById("purchaseCheckoutPayButton").disabled = false;
    if (response.provider?.payment_session_id) {
      state.order.provider_payment_session_id = response.provider.payment_session_id;
      state.order.provider_mode = response.provider.mode || "sandbox";
    } else {
      setStatus("Payment Provider Not Configured", "Payment credentials are not configured yet. No enrollment has been granted.", "processing", response);
    }
  }

  async function payForSelectedCourse() {
    if (!state.order?.id || state.paymentBusy) return;
    state.paymentBusy = true;
    document.getElementById("purchaseCheckoutPayButton").disabled = true;
    document.getElementById("purchaseCheckoutPayButton").textContent = "Verifying Payment...";
    setStatus("Opening Payment", "Complete payment using UPI, cards, net banking, or supported wallets.");
    try {
      if (!state.order.provider_payment_session_id) throw new Error("Payment session is not available. Configure the payment provider secrets and retry.");
      const gatewayResult = await openCashfreeCheckout(state.order.provider_payment_session_id, state.order.provider_mode || "sandbox");
      if (isCancelledGatewayResult(gatewayResult)) {
        await invokePurchase("mark_cancelled", { order_id: state.order.id }).catch(() => null);
        return setStatus("Payment Cancelled", "No enrollment was created. You can return to checkout when ready.", "cancelled", { order: state.order, course: state.course });
      }
      setStatus("Payment Processing", "Verifying your payment securely with the backend.");
      handlePaymentResult(await invokePurchase("verify_payment", { order_id: state.order.id }));
    } catch (error) {
      document.getElementById("purchaseCheckoutPayButton").disabled = false;
      updatePayButton();
      setStatus("Payment Failed", userMessage(error, "Payment could not be completed."), "failed");
    } finally {
      state.paymentBusy = false;
    }
  }

  async function openCashfreeCheckout(paymentSessionId, mode) {
    await loadScript(CASHFREE_SCRIPT);
    if (!window.Cashfree) throw new Error("Payment SDK did not load.");
    const cashfree = window.Cashfree({ mode: mode === "production" ? "production" : "sandbox" });
    // Hosted redirect checkout also works in in-app browsers; backend verification resumes from the return URL.
    const result = await cashfree.checkout({ paymentSessionId, redirectTarget: "_self" });
    if (result?.error) throw new Error(result.error.message || "Payment failed.");
    return result;
  }

  function handlePaymentResult(response) {
    state.order = response.order || state.order;
    state.payment = response.payment || response.provider || null;
    if (response.payment_status === "success") return setStatus("Payment Successful", "Your course has been assigned to My Courses. You can start learning now.", "success", response);
    if (response.payment_status === "cancelled") return setStatus("Payment Cancelled", "No enrollment was created. You can return to checkout anytime.", "cancelled", response);
    if (response.payment_status === "failed") return setStatus("Payment Failed", "No enrollment was created. Please try again.", "failed", response);
    setStatus("Payment Processing", "Payment is not confirmed yet. Access will unlock after backend verification.", "processing", response);
  }

  async function invokePurchase(action, payload = {}, requireAuth = true) {
    const client = getClient();
    if (requireAuth && !(await currentSession())?.access_token) throw new Error("Please log in to continue checkout.");
    const { data, error } = await client.functions.invoke(PURCHASE_FUNCTION, { body: { action, ...payload } });
    if (error) throw await normalizeFunctionError(error);
    return data;
  }

  async function currentSession() {
    try {
      const { data } = await withTimeout(getClient().auth.getSession(), 2500);
      return data?.session || null;
    } catch {
      return null;
    }
  }

  function withTimeout(promise, timeoutMs) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error("Request timed out.")), timeoutMs); })
    ]).finally(() => window.clearTimeout(timer));
  }

  function getClient() {
    const client = window.getLmsPlatformClient?.();
    if (!client) throw new Error("Learning platform connection is not ready.");
    return client;
  }

  function renderCheckoutCourse() {
    const course = normalizeCourse(state.course, pageCourseSnapshot());
    setText("purchaseCourseTitle", course.title || document.getElementById("courseTitle")?.textContent || "Selected course");
    setText("purchaseCourseMeta", [course.category, course.level, course.duration].filter(Boolean).join(" - "));
    setText("purchaseCourseModules", `${course.module_count || "-"} modules - ${course.lesson_count || "-"} lessons`);
    setText("purchaseSubtotal", money(course.amount));
    setText("purchaseDiscount", money(course.discount || 0));
    setText("purchaseTotal", money(course.final_amount ?? course.amount));
    updatePayButton();
    const image = document.getElementById("purchaseCourseImage");
    if (image) {
      image.src = course.thumbnail_url || "";
      image.alt = course.title || "Selected course";
    }
  }

  function openPurchaseModal(panel) {
    const modal = document.getElementById("purchaseModal");
    if (modal) {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
    switchPanel(panel);
  }

  function closePurchaseModal() {
    const modal = document.getElementById("purchaseModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function switchPanel(panel) {
    document.querySelectorAll("[data-purchase-panel]").forEach((item) => { item.hidden = item.dataset.purchasePanel !== panel; });
  }

  function renderMode() {
    clearFormMessages();
    switchPanel(state.mode === "login" ? "login" : "account");
  }

  function rememberedStudentEmail() {
    for (const key of ["jenovateStudentSession", "jenovateCurrentUser"]) {
      try {
        const user = JSON.parse(sessionStorage.getItem(key) || "null");
        if (String(user?.role || "").toLowerCase() === "student" && user?.email) return String(user.email).trim().toLowerCase();
      } catch {
        // Ignore stale session data.
      }
    }
    return "";
  }

  function prefillExistingLogin(email = "") {
    const input = document.getElementById("purchaseLoginEmail");
    if (!input) return;
    const value = String(email || rememberedStudentEmail() || valueOf("purchaseEmail") || "").trim().toLowerCase();
    if (value && !input.value) input.value = value;
  }

  function clearFormMessages() {
    ["purchaseAccountMessage", "purchaseLoginMessage"].forEach((id) => showFormMessage("", false, id));
  }

  function setStatus(title, message, tone = "processing", result = {}) {
    switchPanel("status");
    setText("purchaseStatusTitle", title);
    setText("purchaseStatusMessage", message);
    const box = document.getElementById("purchaseStatusBox");
    if (box) box.dataset.statusTone = tone;
    setText("purchaseStatusMark", statusMark(tone));
    const order = result.order || state.order || {};
    const course = result.course || state.course || {};
    const transaction = result.payment?.provider_payment_id || result.provider?.cf_payment_id || result.provider?.payment_id || order.provider_order_id || "-";
    setText("purchaseStatusCourse", course.title || document.getElementById("purchaseCourseTitle")?.textContent || "Selected course");
    setText("purchaseStatusAmount", money(course.final_amount ?? order.amount ?? course.amount ?? 0));
    setText("purchaseStatusOrder", order.provider_order_id || order.id || "-");
    setText("purchaseStatusTransaction", transaction);
    document.getElementById("purchaseRetryButton").hidden = tone !== "failed";
    const backButton = document.getElementById("purchaseBackButton");
    if (backButton) {
      backButton.hidden = !["failed", "cancelled", "processing"].includes(tone);
      backButton.textContent = tone === "cancelled" ? "Return to Checkout" : "Back to Course";
      backButton.toggleAttribute("data-return-checkout", tone === "cancelled");
      backButton.toggleAttribute("data-close-purchase", tone !== "cancelled");
    }
    document.getElementById("purchaseStartButton").hidden = !["success", "owned"].includes(tone);
  }

  function modalMarkup() {
    return `
      <div class="purchase-modal" id="purchaseModal" aria-hidden="true">
        <section class="purchase-dialog" role="dialog" aria-modal="true" aria-labelledby="purchaseModalTitle">
          <button class="purchase-close" type="button" data-close-purchase aria-label="Close checkout">x</button>
          <div class="purchase-summary">
            <img id="purchaseCourseImage" alt="">
            <div><span>Secure Checkout</span><h2 id="purchaseModalTitle">Buy This Course</h2><h3 id="purchaseCourseTitle">Selected course</h3><p id="purchaseCourseMeta"></p><small id="purchaseCourseModules"></small></div>
            <dl><div><dt>Price</dt><dd id="purchaseSubtotal">INR 0</dd></div><div><dt>Discount</dt><dd id="purchaseDiscount">INR 0</dd></div><div class="purchase-total"><dt>Total</dt><dd id="purchaseTotal">INR 0</dd></div></dl>
          </div>
          <div class="purchase-panel" data-purchase-panel="loading"><div class="purchase-spinner"></div><h3>Preparing Checkout</h3><p>Please wait while we prepare your secure enrollment.</p></div>
          <form class="purchase-panel purchase-form" data-purchase-panel="account" id="purchaseAccountForm" hidden>
            <div class="purchase-form-header"><span class="purchase-eyebrow">Student registration</span>
            <h3>Create your Jenovate account</h3><p>Join Jenovate and continue directly to the selected course checkout.</p></div>
            ${REFERRAL_SOURCE ? `<p class="purchase-referral-note">Referral preserved: <strong>${escapeHtml(REFERRAL_SOURCE)}</strong></p>` : ""}
            <label for="purchaseName">Full Name <b>*</b><input id="purchaseName" required placeholder="Enter your full name" autocomplete="name"></label>
            <label for="purchaseEmail">Email <b>*</b><input id="purchaseEmail" required type="email" placeholder="Enter your email" autocomplete="email"></label>
            <label for="purchasePhone" class="purchase-wide">Phone Number <b>*</b><input id="purchasePhone" required placeholder="+91 Enter phone number" autocomplete="tel"></label>
            <label for="purchasePassword">Password <b>*</b><span class="purchase-password-wrap"><input id="purchasePassword" required type="password" placeholder="Create a password" autocomplete="new-password"><button type="button" class="purchase-toggle-password" data-toggle-purchase-password="purchasePassword" aria-label="Show password"></button></span></label>
            <label for="purchaseConfirmPassword">Confirm Password <b>*</b><span class="purchase-password-wrap"><input id="purchaseConfirmPassword" required type="password" placeholder="Confirm your password" autocomplete="new-password"><button type="button" class="purchase-toggle-password" data-toggle-purchase-password="purchaseConfirmPassword" aria-label="Show password"></button></span></label>
            <small class="purchase-message" id="purchaseAccountMessage"></small><div class="purchase-form-actions"><button class="purchase-primary" type="submit" data-default-label="Create Account & Continue">Create Account & Continue</button><button class="purchase-link" type="button" data-purchase-mode="login">Already have an account? Login</button></div>
          </form>
          <form class="purchase-panel purchase-form" data-purchase-panel="login" id="purchaseLoginForm" hidden>
            <div class="purchase-form-header"><span class="purchase-eyebrow">Existing student</span>
            <h3>Login to continue checkout</h3><p>Your selected course will stay ready after login.</p></div>
            <label for="purchaseLoginEmail" class="purchase-wide">Email <b>*</b><input id="purchaseLoginEmail" required type="email" placeholder="Enter your email" autocomplete="email"></label>
            <label for="purchaseLoginPassword" class="purchase-wide">Password <b>*</b><span class="purchase-password-wrap"><input id="purchaseLoginPassword" required type="password" placeholder="Enter your password" autocomplete="current-password"><button type="button" class="purchase-toggle-password" data-toggle-purchase-password="purchaseLoginPassword" aria-label="Show password"></button></span></label><small class="purchase-message" id="purchaseLoginMessage"></small><div class="purchase-form-actions"><button class="purchase-primary" type="submit" data-default-label="Login & Continue">Login & Continue</button><button class="purchase-link" type="button" data-purchase-mode="account">Create new student account</button></div>
          </form>
          <div class="purchase-panel purchase-checkout" data-purchase-panel="checkout" hidden><span class="purchase-eyebrow">Secure payment</span><h3>Secure Checkout</h3><p>Complete your enrollment securely. Payment is verified by the backend before course access opens.</p><div class="purchase-checkout-grid"><article class="purchase-mini-course"><img id="purchaseCheckoutImage" alt=""><h4 id="purchaseCheckoutTitle">Selected course</h4><p id="purchaseCheckoutMeta"></p></article><aside class="purchase-pay-card"><h4>Order Summary</h4><div class="purchase-order-summary"><div class="purchase-order-row"><span>Course</span><strong id="purchaseCheckoutSubtotal">INR 0</strong></div><div class="purchase-order-row"><span>Discount</span><strong id="purchaseCheckoutDiscount">INR 0</strong></div><div class="purchase-order-row purchase-order-total"><span>Total</span><strong id="purchaseCheckoutTotal">INR 0</strong></div></div><div class="purchase-checkout-actions"><button class="purchase-primary" id="purchaseCheckoutPayButton" type="button" disabled>Pay Now</button><button class="purchase-link" type="button" data-close-purchase>Back to Course</button><small class="purchase-secure-note">Secure payment powered by Cashfree</small></div></aside></div></div>
          <div class="purchase-panel purchase-status" data-purchase-panel="status" hidden><div id="purchaseStatusBox" data-status-tone="processing"><div class="purchase-status-mark">✓</div><h3 id="purchaseStatusTitle">Payment Processing</h3><p id="purchaseStatusMessage"></p><dl class="purchase-status-details"><div><dt>Course</dt><dd id="purchaseStatusCourse">Selected course</dd></div><div><dt>Amount</dt><dd id="purchaseStatusAmount">INR 0</dd></div><div><dt>Order ID</dt><dd id="purchaseStatusOrder">-</dd></div><div><dt>Transaction ID</dt><dd id="purchaseStatusTransaction">-</dd></div></dl></div><button class="purchase-primary" id="purchaseRetryButton" type="button" hidden>Try Again</button><button class="purchase-link" id="purchaseBackButton" type="button" data-close-purchase hidden>Back to Course</button><button class="purchase-primary" id="purchaseStartButton" type="button" data-start-learning hidden>Start Learning</button></div>
        </section>
      </div>`;
  }

  function showFormMessage(message, isError = false, id = "purchaseAccountMessage") {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("error", Boolean(isError));
  }

  function setFormBusy(form, busy, busyLabel = "Please wait...") {
    form.querySelectorAll("button,input").forEach((item) => { item.disabled = busy; });
    const submit = form.querySelector("button[type='submit']");
    if (submit) submit.textContent = busy ? busyLabel : (submit.dataset.defaultLabel || submit.textContent);
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function valueOf(id) {
    return String(document.getElementById(id)?.value || "").trim();
  }

  function money(amount) {
    return `INR ${Number(amount || 0).toLocaleString("en-IN")}`;
  }

  function updatePayButton() {
    const course = normalizeCourse(state.course, pageCourseSnapshot());
    const total = money(course.final_amount ?? course.amount);
    setText("purchaseCheckoutSubtotal", document.getElementById("purchaseSubtotal")?.textContent || total);
    setText("purchaseCheckoutDiscount", document.getElementById("purchaseDiscount")?.textContent || "INR 0");
    setText("purchaseCheckoutTotal", total);
    setText("purchaseCheckoutTitle", document.getElementById("purchaseCourseTitle")?.textContent || "Selected course");
    setText("purchaseCheckoutMeta", document.getElementById("purchaseCourseMeta")?.textContent || "");
    const checkoutImage = document.getElementById("purchaseCheckoutImage");
    if (checkoutImage) checkoutImage.src = document.getElementById("purchaseCourseImage")?.getAttribute("src") || "";
    const pay = document.getElementById("purchaseCheckoutPayButton");
    if (pay && !state.paymentBusy) pay.textContent = `Pay ${total}`;
  }

  async function ensureCourseReady() {
    if (state.course?.title && Number((state.course.final_amount ?? state.course.amount) || 0) > 0) return state.course;
    if (state.courseLoad) await state.courseLoad.catch(() => null);
    state.course = normalizeCourse(state.course, pageCourseSnapshot());
    renderCheckoutCourse();
    return state.course;
  }

  function pageCourseSnapshot() {
    const image = document.getElementById("courseHeroImage");
    const title = document.getElementById("courseTitle")?.textContent?.trim() || "Selected course";
    const pagePrice = parseMoney(document.getElementById("coursePrice")?.textContent);
    return normalizeCourse({
      title,
      category: document.getElementById("courseCategory")?.textContent?.trim() || "",
      level: document.getElementById("courseLevelLine")?.textContent?.trim() || "",
      duration: document.getElementById("courseHoursLine")?.textContent?.trim() || "",
      module_count: parseInt(document.getElementById("courseModuleCount")?.textContent || "", 10) || null,
      amount: pagePrice || DEFAULT_COURSE_AMOUNT,
      final_amount: pagePrice || DEFAULT_COURSE_AMOUNT,
      thumbnail_url: image?.currentSrc || image?.getAttribute("src") || "",
    });
  }

  function normalizeCourse(primary = {}, fallback = {}) {
    const course = { ...(fallback || {}), ...(primary || {}) };
    const parsedAmount = parseMoney(course.final_amount ?? course.amount ?? course.price);
    const fallbackAmount = parseMoney(fallback?.final_amount ?? fallback?.amount ?? fallback?.price);
    const amount = parsedAmount || fallbackAmount || DEFAULT_COURSE_AMOUNT;
    return {
      ...course,
      amount,
      final_amount: parseMoney(course.final_amount) || amount,
      thumbnail_url: course.thumbnail_url || fallback?.thumbnail_url || document.getElementById("courseHeroImage")?.getAttribute("src") || "",
    };
  }

  function parseMoney(value) {
    const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
    const number = Number(cleaned);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function statusMark(tone) {
    if (tone === "success" || tone === "owned") return "OK";
    if (tone === "failed") return "!";
    if (tone === "cancelled") return "x";
    return "...";
  }

  function togglePurchasePassword(button) {
    const input = document.getElementById(button.dataset.togglePurchasePassword || "");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.setAttribute("aria-label", show ? "Hide password" : "Show password");
  }

  function userMessage(error, fallback) {
    const raw = String(error?.message || error?.error_description || "");
    if (!raw || /\b(500|undefined|null|fetch failed|rpc|supabase|internal server|edge function)\b/i.test(raw)) return fallback;
    if (/\b(429|rate limit|too many|over request rate|email rate limit)\b/i.test(raw)) return "Too many signup attempts. Please wait a moment and try again.";
    if (/payment session is not available/i.test(raw)) return "Payment is not configured yet. Please contact support or try again later.";
    if (/authentication|required|log in/i.test(raw)) return "Please log in to continue checkout.";
    return raw;
  }

  function isExistingAccountError(error) {
    return /\b(already registered|already exists|user exists|email exists|duplicate)\b/i.test(String(error?.message || error?.error_description || ""));
  }

  async function normalizeFunctionError(error) {
    const response = error?.context;
    if (response?.json) {
      try {
        const body = await response.json();
        const message = body?.error || body?.message || "";
        if (message) {
          const next = new Error(message);
          next.code = body?.code || error.code || "";
          next.status = response.status || error.status || 0;
          return next;
        }
      } catch {
        // Keep the original SDK error if the response body is unavailable.
      }
    }
    return error;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function isCancelledGatewayResult(result) {
    const text = JSON.stringify(result || {}).toLowerCase();
    return /cancel|user_dropped|dropped|closed/.test(text);
  }

  function loadScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Unable to load payment gateway."));
      document.head.appendChild(script);
    });
  }
})();
