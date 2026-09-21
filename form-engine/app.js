const state = {
  config: null,
  categoryKey: null,
  steps: [],
  stepIndex: 0,
  values: {},
  phoneCountryCodes: {},
  isSubmitting: false,
  lockedCategory: null
};

const els = {
  root: document.documentElement,
  categorySelect: document.querySelector("#categorySelect"),
  title: document.querySelector("[data-current-title]"),
  description: document.querySelector("[data-current-description]"),
  stepLabel: document.querySelector("[data-step-label]"),
  progressPercent: document.querySelector("[data-progress-percent]"),
  progressBar: document.querySelector("[data-progress-bar]"),
  fields: document.querySelector("[data-form-fields]"),
  form: document.querySelector("#dynamicForm"),
  prev: document.querySelector("[data-prev-step]"),
  next: document.querySelector("[data-next-step]"),
  submit: document.querySelector("[data-submit-form]"),
  status: document.querySelector("[data-status]"),
  themeToggle: document.querySelector("[data-theme-toggle]"),
  closeForm: document.querySelector("[data-close-form]"),
  cardTitle: document.querySelector("[data-card-title]"),
  cardDescription: document.querySelector("[data-card-description]"),
  cardIcon: document.querySelector("[data-card-icon]"),
  sideBenefits: document.querySelector("[data-side-benefits]")
};

const apiBase = window.location.protocol === "file:" ? "http://localhost:3000" : "";
const query = new URLSearchParams(window.location.search);
state.lockedCategory = query.get("category") || document.body.dataset.formCategory || "train_deploy_enquiry";
const instantCategories = new Set(["train_deploy_enquiry", "launchpad_purchase", "mentor_registration", "hiring_application", "event_registration"]);

const fieldTypes = new Set(["text", "email", "phone", "number", "date", "textarea", "select", "radio", "checkbox", "file"]);

const categoryUi = {
  train_deploy_enquiry: {
    badge: "Course Enquiry",
    cardTitle: "Enquiry Details",
    cardDescription: "Please fill in your details to get started",
    icon: "form",
    benefits: [
      ["Plan Together", "Share your placement goals and training needs."],
      ["Fast Review", "Our team will check your request and respond soon."],
      ["Custom Support", "Get a practical path for your institution."]
    ]
  },
  student_registration: {
    badge: "Student Registration",
    cardTitle: "Student Details",
    cardDescription: "Please fill in your details to get started",
    icon: "student",
    benefits: [
      ["Start Learning", "Tell us your interests and goals."],
      ["Right Guidance", "Get matched to the program that fits you."],
      ["Career Ready", "Build projects, skills, and confidence."]
    ]
  },
  mentor_registration: {
    badge: "Mentor Application",
    cardTitle: "Mentor Application",
    cardDescription: "Please fill in your details to get started",
    icon: "mentor",
    benefits: [
      ["Make an Impact", "Guide learners and help them unlock their full potential."],
      ["Grow Together", "Share your knowledge while building your own network."],
      ["Flexible & Rewarding", "Mentor on your terms and be recognized for your contribution."]
    ]
  },
  launchpad_purchase: {
    badge: "Launchpad Purchase",
    cardTitle: "Launchpad Details",
    cardDescription: "Please fill in your details to continue",
    icon: "launchpad",
    benefits: [
      ["Choose Your Plan", "Select the Launchpad option that suits your goals."],
      ["Guided Setup", "Our team will help you with the next step."],
      ["Outcome Focused", "Move toward projects, mentorship, and career growth."]
    ]
  },
  hiring_application: {
    badge: "Hiring Application",
    cardTitle: "Hiring Details",
    cardDescription: "Please fill in your requirements to get started",
    icon: "hiring",
    benefits: [
      ["Hire Talent", "Find learners trained through practical projects."],
      ["Share Needs", "Tell us the skills, role, and timeline."],
      ["Quick Match", "We will connect you with suitable candidates."]
    ]
  },
  event_registration: {
    badge: "Event Registration",
    cardTitle: "Event Registration",
    cardDescription: "Please fill in your details to reserve your spot",
    icon: "event",
    benefits: [
      ["Join Live", "Register for Jenovate sessions and workshops."],
      ["Learn Practically", "Get useful ideas, tasks, and takeaways."],
      ["Stay Connected", "Be part of the Jenovate learner community."]
    ]
  },
  campus_ambassador: {
    badge: "Campus Ambassador",
    cardTitle: "Campus Ambassador Application",
    cardDescription: "Please fill in your details to get started",
    icon: "campus",
    benefits: [
      ["Lead Your Campus", "Represent Jenovate and help students discover practical learning."],
      ["Build Influence", "Grow your network with community activities."],
      ["Earn Recognition", "Get certificates, rewards, and visible experience."]
    ]
  }
};

const fieldIconName = (field) => {
  if (field.type === "email") return "email";
  if (field.type === "phone") return "phone";
  if (field.type === "date") return "calendar";
  if (field.type === "number") return "number";
  if (field.type === "select") return "select";
  if (field.type === "textarea") return "message";
  if (field.type === "file") return "file";
  if (/name|person|contact/i.test(field.name)) return "user";
  if (/college|company|institution/i.test(field.name)) return "building";
  if (/course|program|plan|interest/i.test(field.name)) return "book";
  if (/expertise|skill/i.test(field.name)) return "briefcase";
  if (/availability|timeline/i.test(field.name)) return "clock";
  return "form";
};

const fallbackConfig = {
  settings: {
    brandName: "Jenovate",
    defaultCategory: "train_deploy_enquiry",
    submitMode: "supabase"
  },
  categories: {
    train_deploy_enquiry: {
      title: "Train and Deploy Enquiry Form",
      description: "Please complete all fields to submit your enquiry request",
      endpoint: {
        type: "supabase",
        table: "form_train_deploy_enquiries"
      },
      fields: [
        { type: "text", name: "full_name", label: "Full Name", required: true, placeholder: "Enter your full name" },
        { type: "email", name: "email", label: "Email Address", required: true, placeholder: "you@example.com" },
        { type: "phone", name: "phone", label: "Phone Number", required: true, placeholder: "+91 xxxxxxxxxx" },
        { type: "text", name: "designation", label: "Designation", required: true, placeholder: "Your position" },
        { type: "text", name: "college", label: "College / University", required: true, placeholder: "Institution name" },
        { type: "textarea", name: "placement_challenges", label: "Challenges in Placements", required: true, placeholder: "Describe the key challenges your institution faces in student placements..." },
        { type: "radio", name: "collaboration_timeline", label: "Looking to collaborate?", required: true, options: ["Yes, Immediately", "Yes, this academic year", "Considering soon", "Exploring options"] },
        { type: "number", name: "students_count", label: "Approx. Students to Train", required: false, placeholder: "e.g. 250", min: 1 },
        { type: "select", name: "preferred_program", label: "Preferred Program", required: false, options: ["Train and Deploy", "Placement Training", "Industry Bootcamp", "Custom Partnership"] },
        { type: "textarea", name: "message", label: "Additional Message", required: false, placeholder: "Share anything else our team should know..." }
      ]
    },
    student_registration: {
      title: "Student Registration",
      description: "Tell us about your learning goals and our team will guide you to the right program.",
      endpoint: {
        type: "supabase",
        table: "form_student_registrations"
      },
      steps: [
        {
          title: "Basic Details",
          fields: [
            { type: "text", name: "full_name", label: "Full Name", required: true },
            { type: "email", name: "email", label: "Email", required: true },
            { type: "phone", name: "phone", label: "Phone Number", required: true },
            { type: "radio", name: "gender", label: "Gender", required: true, options: ["Woman", "Man", "Prefer not to say"] }
          ]
        },
        {
          title: "Learning Goal",
          fields: [
            { type: "text", name: "college", label: "College Name", required: true },
            { type: "select", name: "course_interest", label: "Course Interest", required: true, options: ["Technology & Software Development", "Artificial Intelligence & Data", "Business, Management & Finance", "Design & Creative Arts", "Healthcare & Human Sciences", "Not Sure Yet"] },
            { type: "textarea", name: "goal", label: "What do you want to achieve?", required: false },
            { type: "text", name: "reference_id", label: "Reference ID", required: false }
          ]
        }
      ]
    },
    mentor_registration: {
      title: "Become a Mentor",
      description: "Apply to mentor Jenovate learners through practical projects and career-focused guidance.",
      endpoint: {
        type: "supabase",
        table: "form_mentor_registrations"
      },
      fields: [
        { type: "text", name: "full_name", label: "Full Name", required: true, placeholder: "Enter your full name" },
        { type: "email", name: "email", label: "Email", required: true, placeholder: "Enter your email" },
        { type: "phone", name: "phone", label: "Phone Number", required: true, placeholder: "Enter your phone number" },
        { type: "text", name: "expertise", label: "Expertise", required: true, placeholder: "e.g. AI, Web Development, Marketing" },
        { type: "number", name: "experience_years", label: "Years of Experience", required: true, min: 0, placeholder: "Enter years of experience" },
        { type: "select", name: "availability", label: "Weekly Availability", required: true, options: ["1-2 hours", "3-5 hours", "6+ hours"] }
      ]
    },
    launchpad_purchase: {
      title: "Launchpad Purchase",
      description: "Select your Launchpad plan and share your details. Our team will confirm the next step.",
      endpoint: {
        type: "supabase",
        table: "form_launchpad_purchases"
      },
      fields: [
        { type: "text", name: "student_name", label: "Student Name", required: true, placeholder: "Enter student name" },
        { type: "email", name: "email", label: "Email", required: true, placeholder: "Enter your email" },
        { type: "phone", name: "phone", label: "Phone Number", required: true, placeholder: "Enter your phone number" },
        { type: "select", name: "plan", label: "Plan", required: true, options: ["Basics", "Pro", "Advanced"] },
        { type: "radio", name: "payment_mode", label: "Preferred Payment Mode", required: true, options: ["UPI", "Card", "Bank Transfer"] }
      ]
    },
    hiring_application: {
      title: "Hire Our Students",
      description: "Share hiring requirements and we will connect you with project-ready Jenovate learners.",
      endpoint: {
        type: "supabase",
        table: "form_hiring_applications"
      },
      fields: [
        { type: "text", name: "company_name", label: "Company Name", required: true, placeholder: "Enter company name" },
        { type: "text", name: "contact_name", label: "Contact Person", required: true, placeholder: "Enter contact person name" },
        { type: "email", name: "email", label: "Work Email", required: true, placeholder: "Enter work email" },
        { type: "phone", name: "phone", label: "Phone Number", required: true, placeholder: "Enter phone number" },
        { type: "select", name: "hiring_type", label: "Hiring Type", required: true, options: ["Internship", "Full-time", "Freelance Project"] },
        { type: "checkbox", name: "skills", label: "Skills Needed", required: true, options: ["Web Development", "Data Science", "AI Tools", "UI/UX", "Digital Marketing", "Finance"] },
        { type: "number", name: "openings", label: "Number of Openings", required: true, min: 1, placeholder: "Enter number of openings" },
        { type: "date", name: "start_date", label: "Expected Start Date", required: false },
        { type: "textarea", name: "job_summary", label: "Brief Role Description", required: true, placeholder: "Tell us about the role, skills, and hiring timeline" }
      ]
    },
    event_registration: {
      title: "Event Registration",
      description: "Register for upcoming Jenovate events, workshops, and community sessions.",
      fields: [
        { type: "text", name: "full_name", label: "Full Name", required: true },
        { type: "email", name: "email", label: "Email", required: true },
        { type: "phone", name: "phone", label: "Phone Number", required: true },
        { type: "select", name: "event", label: "Event", required: true, options: ["Career Launch Webinar", "AI Tools Workshop", "Portfolio Review Day"] }
      ]
    }
  }
};

const fetchJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.includes("json")) throw new Error(`${url} did not return JSON`);
  return response.json();
};

const loadConfig = async () => {
  if (!query.get("category") || instantCategories.has(query.get("category"))) {
    return fallbackConfig;
  }

  const sources = window.location.protocol === "file:"
    ? ["formConfig.json", `${apiBase}/api/forms/config`]
    : ["formConfig.json", `${apiBase}/api/forms/config`];

  for (const source of sources) {
    try {
      const config = await fetchJson(source);
      if (config?.categories && Object.keys(config.categories).length) return config;
    } catch (error) {
      console.warn(error.message);
    }
  }

  showStatus("Using built-in form configuration because the JSON file could not be loaded.", "error");
  return fallbackConfig;
};

const applyEndpointOverrides = (config) => {
  const overrides = window.JENOVATE_FORM_ENDPOINTS || {};
  Object.entries(overrides).forEach(([categoryKey, endpoint]) => {
    if (!config.categories?.[categoryKey]) return;
    config.categories[categoryKey].endpoint = {
      ...(config.categories[categoryKey].endpoint || {}),
      ...endpoint,
      fieldMap: {
        ...(config.categories[categoryKey].endpoint?.fieldMap || {}),
        ...(endpoint.fieldMap || {})
      }
    };
  });
  return config;
};

const normalizeSteps = (category) => category.steps || [{ title: category.title, fields: category.fields || [] }];
const flattenFields = (category) => normalizeSteps(category).flatMap((step) => step.fields || []);

const showStatus = (message, type = "success") => {
  els.status.textContent = message;
  els.status.className = `status show ${type}`;
};

const clearStatus = () => {
  els.status.textContent = "";
  els.status.className = "status";
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const shouldShowField = (field) => {
  if (!field.showIf) return true;
  const current = state.values[field.showIf.field];
  if (Array.isArray(current)) return current.includes(field.showIf.equals);
  return current === field.showIf.equals;
};

const fieldValue = (field) => state.values[field.name] ?? (field.type === "checkbox" ? [] : "");

const phoneCountries = [
  ["+91", "IN  +91"],
  ["+1", "US/CA  +1"],
  ["+44", "GB  +44"],
  ["+61", "AU  +61"],
  ["+971", "AE  +971"],
  ["+966", "SA  +966"],
  ["+65", "SG  +65"],
  ["+60", "MY  +60"],
  ["+94", "LK  +94"],
  ["+880", "BD  +880"],
  ["+977", "NP  +977"],
  ["+49", "DE  +49"],
  ["+33", "FR  +33"],
  ["+81", "JP  +81"]
];

const splitPhoneValue = (value) => {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\+\d{1,3})\s*(.*)$/);
  return match
    ? { country: match[1], local: match[2] }
    : { country: "+91", local: normalized };
};

const applyQueryDefaults = (categoryKey) => {
  const category = state.config.categories[categoryKey];
  if (!category) return;
  flattenFields(category).forEach((field) => {
    if (!query.has(field.name)) return;
    const value = query.get(field.name) || "";
    if (field.type === "checkbox") state.values[field.name] = value.split(",").map((item) => item.trim()).filter(Boolean);
    else state.values[field.name] = value;
  });
};

const renderInput = (field) => {
  const common = `name="${field.name}" id="${field.name}" ${field.required ? "required" : ""}`;
  const value = fieldValue(field);
  const constraints = field.name === "full_name"
    ? `minlength="2" maxlength="80" pattern="[A-Za-z][A-Za-z .'-]{1,79}" autocomplete="name"`
    : field.type === "email"
      ? 'maxlength="254" autocomplete="email"'
      : field.type === "phone"
        ? 'maxlength="18" pattern="[0-9 ()-]{6,18}" inputmode="tel" autocomplete="tel-national"'
        : "";

  if (field.type === "phone") {
    const phone = splitPhoneValue(value);
    const selectedCountry = state.phoneCountryCodes[field.name] || phone.country;
    return `
      <div class="phone-input-group">
        <select class="field-control phone-country" name="${field.name}_country" id="${field.name}_country" aria-label="Country calling code">
          ${phoneCountries.map(([code, label]) => `<option value="${code}" ${selectedCountry === code ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <input class="field-control phone-number" type="tel" name="${field.name}_local" id="${field.name}"
          ${field.required ? "required" : ""} ${constraints} value="${escapeHtml(phone.local)}"
          placeholder="Phone number">
      </div>`;
  }

  if (field.type === "textarea") {
    return `<textarea class="field-control" ${common} placeholder="${escapeHtml(field.placeholder || "")}">${escapeHtml(value)}</textarea>`;
  }

  if (field.type === "select") {
    return `
      <select class="field-control" ${common}>
        <option value="">Select ${escapeHtml(field.label)}</option>
        ${(field.options || []).map((option) => `<option value="${escapeHtml(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    `;
  }

  if (field.type === "radio" || field.type === "checkbox") {
    const selected = Array.isArray(value) ? value : [value];
    return `
      <div class="choice-group" role="group" aria-label="${escapeHtml(field.label)}">
        ${(field.options || []).map((option) => `
          <label class="choice">
            <input type="${field.type}" name="${field.name}" value="${escapeHtml(option)}" ${selected.includes(option) ? "checked" : ""} ${field.required ? "required" : ""}>
            ${escapeHtml(option)}
          </label>
        `).join("")}
      </div>
    `;
  }

  const type = field.type === "phone" ? "tel" : field.type;
  return `<input class="field-control" type="${type}" ${common} ${constraints} value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || "")}" ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.accept ? `accept="${escapeHtml(field.accept)}"` : ""}>`;
};

const renderForm = () => {
  const category = state.config.categories[state.categoryKey];
  const step = state.steps[state.stepIndex];
  const ui = categoryUi[state.categoryKey] || categoryUi.train_deploy_enquiry;
  els.root.dataset.formCategory = state.categoryKey;
  document.body.dataset.formCategory = state.categoryKey;
  document.body.dataset.formBadge = ui.badge;
  els.title.textContent = category.title;
  els.description.textContent = category.description || "";
  if (els.cardTitle) els.cardTitle.textContent = ui.cardTitle || category.title;
  if (els.cardDescription) els.cardDescription.textContent = ui.cardDescription || category.description || "Please fill in your details to get started";
  if (els.cardIcon) els.cardIcon.dataset.icon = ui.icon || "form";
  if (els.sideBenefits) {
    els.sideBenefits.innerHTML = (ui.benefits || []).map(([title, text], index) => `
      <article>
        <span aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(text)}</p>
        </div>
      </article>
    `).join("");
  }
  document.title = `${category.title} - Jenovate`;

  const totalSteps = state.steps.length;
  const progress = Math.round(((state.stepIndex + 1) / totalSteps) * 100);
  els.stepLabel.textContent = totalSteps > 1 ? `Step ${state.stepIndex + 1} of ${totalSteps}: ${step.title}` : step.title;
  els.progressPercent.textContent = `${progress}%`;
  els.progressBar.style.width = `${progress}%`;

  const visibleFields = (step.fields || []).filter(shouldShowField);
  els.fields.innerHTML = visibleFields.map((field) => {
    if (!fieldTypes.has(field.type)) return "";
    const full = ["textarea", "checkbox", "radio", "file"].includes(field.type) ? " full" : "";
    return `
      <div class="field${full}" data-field="${field.name}" data-field-icon="${fieldIconName(field)}">
        ${field.type === "radio" || field.type === "checkbox"
          ? `<legend>${escapeHtml(field.label)} ${field.required ? `<span class="required">*</span>` : ""}</legend>`
          : `<label for="${field.name}">${escapeHtml(field.label)} ${field.required ? `<span class="required">*</span>` : ""}</label>`}
        ${renderInput(field)}
        <span class="error-text" data-error-for="${field.name}"></span>
      </div>
    `;
  }).join("");

  els.prev.hidden = state.stepIndex === 0;
  els.next.hidden = state.stepIndex === totalSteps - 1;
  els.submit.hidden = state.stepIndex !== totalSteps - 1;
  document.body.classList.remove("form-loading");
  clearStatus();
};

const collectCurrentStep = () => {
  const step = state.steps[state.stepIndex];
  const data = new FormData(els.form);
  (step.fields || []).forEach((field) => {
    if (!shouldShowField(field)) {
      delete state.values[field.name];
      return;
    }
    if (field.type === "checkbox") state.values[field.name] = data.getAll(field.name);
    else if (field.type === "phone") {
      const country = String(data.get(`${field.name}_country`) || "+91");
      const local = String(data.get(`${field.name}_local`) || "").trim();
      state.phoneCountryCodes[field.name] = country;
      state.values[field.name] = local ? `${country} ${local}` : "";
    }
    else if (field.type === "file") state.values[field.name] = data.get(field.name);
    else state.values[field.name] = data.get(field.name) || "";
  });
};

const validateStep = () => {
  collectCurrentStep();
  let ok = true;
  const step = state.steps[state.stepIndex];
  els.fields.querySelectorAll(".error-text").forEach((node) => { node.textContent = ""; });

  (step.fields || []).forEach((field) => {
    if (!shouldShowField(field)) return;
    const value = state.values[field.name];
    const empty = field.type === "checkbox" ? !value?.length : field.type === "file" ? !value?.name : !String(value || "").trim();
    const error = els.fields.querySelector(`[data-error-for="${CSS.escape(field.name)}"]`);
    if (field.required && empty) {
      ok = false;
      if (error) error.textContent = `${field.label} is required.`;
      return;
    }
    if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      ok = false;
      if (error) error.textContent = "Enter a valid email address.";
    }
    if (field.name === "full_name" && value && !/^[A-Za-z][A-Za-z .'-]{1,79}$/.test(value)) {
      ok = false;
      if (error) {
        error.textContent = "Enter a valid name using letters, spaces, apostrophes, or hyphens.";
        error.closest(".field")?.classList.add("has-error");
      }
    }
    if (field.type === "phone" && value && !/^\+[1-9]\d{6,14}$/.test(String(value).replace(/[\s()-]/g, ""))) {
      ok = false;
      if (error) {
        error.textContent = "Select a country code and enter a valid 6 to 15 digit phone number.";
        error.closest(".field")?.classList.add("has-error");
      }
    }
  });

  return ok;
};

const setCategory = (key) => {
  state.categoryKey = key;
  state.steps = normalizeSteps(state.config.categories[key]);
  state.stepIndex = 0;
  state.values = {};
  state.phoneCountryCodes = {};
  applyQueryDefaults(key);
  els.root.dataset.formCategory = key;
  document.body.dataset.formCategory = key;
  renderForm();
  window.history.replaceState(
    { ...(window.history.state || {}), jenovateForm: true, formStep: 0 },
    ""
  );
};

const populateCategories = () => {
  const entries = Object.entries(state.config.categories);
  const requested = state.lockedCategory || query.get("category");
  const locked = requested && state.config.categories[requested];
  state.lockedCategory = locked ? requested : null;

  els.categorySelect.innerHTML = (locked ? [[requested, state.config.categories[requested]]] : entries)
    .map(([key, category]) => `<option value="${key}">${escapeHtml(category.title)}</option>`)
    .join("");
  const initial = locked ? requested : state.config.settings.defaultCategory;
  els.categorySelect.value = initial;
  els.categorySelect.disabled = Boolean(locked);
  document.querySelector(".form-panel")?.classList.toggle("is-category-locked", Boolean(locked));
  setCategory(initial);
};

const fileSummary = (file) => {
  if (!(file instanceof File) || !file.name) return null;
  return { name: file.name, size: file.size, type: file.type };
};

const submissionRecord = () => {
  const values = {};
  const files = [];

  Object.entries(state.values).forEach(([key, value]) => {
    if (value instanceof File) {
      const summary = fileSummary(value);
      if (summary) files.push({ field: key, ...summary });
      return;
    }
    values[key] = value;
  });

  const category = state.config.categories[state.categoryKey];
  return {
    category: state.categoryKey,
    title: category.title,
    endpoint: category.endpoint || {},
    values,
    files,
    submitted_at: new Date().toISOString(),
    source: "form-engine"
  };
};

const normalizeDbValue = (value, field) => {
  if (value === "") return null;
  if (field?.type === "number") return value === null || value === undefined ? null : Number(value);
  if (field?.type === "checkbox") return Array.isArray(value) ? value.join(", ") : "";
  return value;
};

const mappedValues = (endpoint, values) => {
  const fieldMap = endpoint.fieldMap || {};
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      fieldMap[key] || key,
      Array.isArray(value) ? value.join(", ") : value
    ])
  );
};

const submitToPowerAutomate = async (record) => {
  const endpoint = record.endpoint || {};
  if (!endpoint.url) {
    throw new Error("Power Automate URL is missing. Add the HTTP trigger URL in formConfig.json, or switch endpoint.type to supabase.");
  }
  if (record.files.length) {
    throw new Error("File uploads need the server route. Power Automate direct submit supports text fields only.");
  }

  const payload = {
    ...mappedValues(endpoint, record.values),
    category: record.category,
    form_title: record.title,
    submitted_at: record.submitted_at
  };

  await fetch(endpoint.url, {
    method: endpoint.method || "POST",
    mode: endpoint.cors === true ? "cors" : "no-cors",
    headers: { "Content-Type": endpoint.cors === true ? "application/json" : "text/plain;charset=UTF-8" },
    body: JSON.stringify(payload)
  });
};

const loadSupabaseClient = async () => {
  const existingClient = window.getSupabaseClient?.();
  if (existingClient) return existingClient;

  if (!window.supabase?.createClient) {
    await new Promise((resolve, reject) => {
      const sdk = document.createElement("script");
      sdk.src = "../assets/vendor/supabase-2.49.4.js";
      sdk.onload = resolve;
      sdk.onerror = () => reject(new Error("Unable to load Supabase SDK."));
      document.head.appendChild(sdk);
    });
  }

  if (!window.getSupabaseClient) {
    await new Promise((resolve, reject) => {
      const configScript = document.createElement("script");
      configScript.src = "../supabase-config.js";
      configScript.onload = resolve;
      configScript.onerror = () => reject(new Error("Unable to load Supabase config."));
      document.head.appendChild(configScript);
    });
  }

  const client = window.getSupabaseClient?.();
  if (!client) throw new Error("Supabase client is not configured.");
  return client;
};

const submitToSupabase = async (record) => {
  const client = await loadSupabaseClient();
  const category = state.config.categories[record.category];
  const fieldsByName = Object.fromEntries(flattenFields(category).map((field) => [field.name, field]));
  const row = {
    ...Object.fromEntries(
      Object.entries(record.values).map(([key, value]) => [
        key,
        normalizeDbValue(value, fieldsByName[key])
      ])
    ),
    files: record.files,
    source: record.source,
    submitted_at: record.submitted_at
  };
  const { error } = await client.rpc("lms_submit_public_form", {
    form_category: record.category,
    form_payload: row,
    website: document.querySelector('[name="website"]')?.value || ""
  });
  if (error) throw error;
};

const submitForm = async () => {
  if (!validateStep() || state.isSubmitting) return;
  state.isSubmitting = true;
  els.submit.classList.add("is-loading");
  els.submit.disabled = true;
  showStatus("Submitting your details...", "success");

  const record = submissionRecord();
  const endpointType = record.endpoint.type || state.config.settings.submitMode || "supabase";

  try {
    const cooldownKey = `jenovate:form:last-submit:${record.category}`;
    const lastSubmit = Number(localStorage.getItem(cooldownKey) || 0);
    if (Date.now() - lastSubmit < 30_000) {
      throw new Error("Please wait a moment before submitting again.");
    }
    if (endpointType === "supabase") {
      await submitToSupabase(record);
    } else if (endpointType === "server") {
      const payload = new FormData();
      payload.append("category", state.categoryKey);
      Object.entries(state.values).forEach(([key, value]) => {
        if (value instanceof File) {
          if (value.name) payload.append(key, value);
          return;
        }
        if (Array.isArray(value)) payload.append(key, JSON.stringify(value));
        else payload.append(key, value);
      });
      const response = await fetch(`${apiBase}/api/forms/submit`, { method: "POST", body: payload });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Submission failed");
    } else {
      await submitToPowerAutomate(record);
    }

    els.form.reset();
    state.values = {};
    state.phoneCountryCodes = {};
    state.stepIndex = 0;
    localStorage.setItem(`jenovate:form:last-submit:${record.category}`, String(Date.now()));
    renderForm();
    showStatus("Submitted successfully. Our team will contact you soon.", "success");
  } catch (error) {
    const message = error.message === "Failed to fetch"
      ? "Unable to submit. Check your internet connection, Supabase config, and table setup."
      : error.message;
    showStatus(message || "Something went wrong. Please try again.", "error");
  } finally {
    state.isSubmitting = false;
    els.submit.classList.remove("is-loading");
    els.submit.disabled = false;
  }
};

const init = async () => {
  els.root.dataset.theme = "light";
  state.config = applyEndpointOverrides(await loadConfig());
  populateCategories();
};

els.categorySelect.addEventListener("change", () => setCategory(els.categorySelect.value));
els.fields.addEventListener("input", () => {
  collectCurrentStep();
});
els.fields.addEventListener("change", () => {
  collectCurrentStep();
  renderForm();
});
els.prev.addEventListener("click", () => {
  collectCurrentStep();
  if (state.stepIndex > 0 && window.history.state?.jenovateForm) {
    window.history.back();
    return;
  }
  state.stepIndex = Math.max(0, state.stepIndex - 1);
  renderForm();
});
els.next.addEventListener("click", () => {
  if (!validateStep()) return;
  state.stepIndex = Math.min(state.steps.length - 1, state.stepIndex + 1);
  renderForm();
  window.history.pushState(
    { ...(window.history.state || {}), jenovateForm: true, formStep: state.stepIndex },
    ""
  );
});
els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitForm();
});
els.themeToggle?.addEventListener("click", () => {
  els.root.dataset.theme = "light";
});
const closeFormPage = () => {
  if (window.opener) {
    window.close();
    return;
  }
  window.location.href = "../index.html";
};

document.querySelectorAll("[data-close-form]").forEach((button) => {
  button.addEventListener("click", closeFormPage);
});

window.addEventListener("popstate", (event) => {
  if (!event.state?.jenovateForm) return;
  const requestedStep = Number(event.state.formStep);
  state.stepIndex = Number.isInteger(requestedStep)
    ? Math.max(0, Math.min(state.steps.length - 1, requestedStep))
    : 0;
  renderForm();
});

init();
