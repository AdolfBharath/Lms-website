const STUDENT_REGISTRATION_TABLE = "form_student_registrations";

const form = document.getElementById("joinForm");
const statusBox = document.getElementById("formStatus");

const showStatus = (message, type) => {
  statusBox.textContent = message;
  statusBox.className = `form-status show ${type}`;
};

const setSubmitting = (button, isSubmitting) => {
  button.disabled = isSubmitting;
  button.textContent = isSubmitting ? "Submitting..." : "Submit";
};

document.querySelectorAll(".login").forEach((button) => {
  button.addEventListener("click", () => {
    window.location.href = "login.html";
  });
});

document.querySelector(".join-close")?.addEventListener("click", () => {
  if (window.opener) {
    window.close();
    return;
  }
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.href = "index.html";
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = form.querySelector(".submit-btn");
  const formData = new FormData(form);
  const payload = {
    full_name: String(formData.get("fullName") || "").trim(),
    gender: String(formData.get("gender") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    college: String(formData.get("college") || "").trim(),
    course_interest: String(formData.get("course") || "").trim(),
    reference_id: String(formData.get("referenceId") || "").trim() || null,
    submitted_at: new Date().toISOString(),
    source: "join-form"
  };

  setSubmitting(submitButton, true);
  showStatus("Submitting your details...", "success");

  try {
    const client = window.getSupabaseClient?.();
    if (!client) {
      throw new Error("Unable to connect to registration database. Please refresh and try again.");
    }

    const { error } = await client.from(STUDENT_REGISTRATION_TABLE).insert(payload);
    if (error) throw error;

    form.reset();
    showStatus("Submitted successfully. Our team will contact you soon.", "success");
  } catch (error) {
    showStatus(error.message || "Something went wrong. Please try again in a moment.", "error");
  } finally {
    setSubmitting(submitButton, false);
  }
});
