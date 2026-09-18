const state = {
  config: null,
  categoryKey: null,
  steps: [],
  stepIndex: 0,
  values: {},
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
  closeForm: document.querySelector("[data-close-form]")
};

const apiBase = window.location.protocol === "file:" ? "http://localhost:3000" : "";
const query = new URLSearchParams(window.location.search);
state.lockedCategory = query.get("category") || document.body.dataset.formCategory || "train_deploy_enquiry";
const instantCategories = new Set(["train_deploy_enquiry", "launchpad_purchase", "mentor_registration", "hiring_application", "event_registration"]);

const fieldTypes = new Set(["text", "email", "phone", "number", "date", "textarea", "select", "radio", "checkbox", "file"]);

const fallbackConfig = {
  settings: {
    brandName: "Jenovate",
    defaultCategory: "train_deploy_enquiry",
    submitMode: "supabase"
  },
  categories: {
    train_deploy_enquiry: {
      title: "ZeAI Soft - Train and Deploy Enquiry Form",
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
  return `<input class="field-control" type="${type}" ${common} value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || "")}" ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.accept ? `accept="${escapeHtml(field.accept)}"` : ""}>`;
};

const renderForm = () => {
  const category = state.config.categories[state.categoryKey];
  const step = state.steps[state.stepIndex];
  els.root.dataset.formCategory = state.categoryKey;
  document.body.dataset.formCategory = state.categoryKey;
  els.title.textContent = category.title;
  els.description.textContent = category.description || "";
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
      <div class="field${full}" data-field="${field.name}">
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
  });

  return ok;
};

const setCategory = (key) => {
  state.categoryKey = key;
  state.steps = normalizeSteps(state.config.categories[key]);
  state.stepIndex = 0;
  state.values = {};
  applyQueryDefaults(key);
  els.root.dataset.formCategory = key;
  document.body.dataset.formCategory = key;
  renderForm();
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
      sdk.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
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
  const table = record.endpoint?.table || "dynamic_form_submissions";
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
  const { error } = await client.from(table).insert(row);
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
    state.stepIndex = 0;
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
  state.stepIndex = Math.max(0, state.stepIndex - 1);
  renderForm();
});
els.next.addEventListener("click", () => {
  if (!validateStep()) return;
  state.stepIndex = Math.min(state.steps.length - 1, state.stepIndex + 1);
  renderForm();
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
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = "../index.html";
};

document.querySelectorAll("[data-close-form]").forEach((button) => {
  button.addEventListener("click", closeFormPage);
});

init();
