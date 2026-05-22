// Promo banner hide + remember state
const navbar = document.querySelector(".navbar");

const banner = document.getElementById("topBanner");
const bannerClose = document.getElementById("bannerClose");

navbar.style.marginTop = banner.offsetHeight + "px";

bannerClose.addEventListener("click", () => {
    banner.style.display = "none";
    navbar.style.transition = "margin-top 0.4s ease";
    navbar.style.marginTop = "0px";
});

// Theme toggle
const themeToggle = document.getElementById("themeToggle");
const currentTheme = localStorage.getItem("theme");

// Apply saved theme
if (currentTheme === "dark") {
  document.body.classList.add("dark");
  themeToggle.textContent = "☀️";
}

// Toggle theme on click
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  if (document.body.classList.contains("dark")) {
    themeToggle.textContent = "☀️";
    localStorage.setItem("theme", "dark");
  } else {
    themeToggle.textContent = "🌙";
    localStorage.setItem("theme", "light");
  }
});



window.addEventListener("scroll", () => {
  if (!navbar) return;
  navbar.classList.toggle("di-scrolled", window.scrollY > 1);
});

//Login Button
const loginButtons = document.querySelectorAll(".login-btn");
const loginModal = document.getElementById("loginModal");
const closeLogin = document.getElementById("closeLogin");
const leadForm = document.getElementById("leadForm");
const leadFormStatus = document.getElementById("leadFormStatus");

function openLoginModal() {
  if (!loginModal) return;
  setLeadFormStatus("");
  loginModal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeLoginModal() {
  if (!loginModal) return;
  loginModal.classList.remove("active");
  document.body.style.overflow = "auto";
}

loginButtons.forEach(btn => {
  btn.addEventListener("click", (e) => {
    if (btn.textContent.trim() === "Join Us") {
      e.preventDefault();
      openLoginModal();
    }
  });
});

closeLogin?.addEventListener("click", closeLoginModal);

// Fix: Reset modal state when the page is shown (handles "Back" button from cache)
window.addEventListener("pageshow", (event) => {
  closeLoginModal();
});

loginModal?.querySelector(".login-backdrop")?.addEventListener("click", closeLoginModal);

leadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = leadForm.querySelector(".login-submit");
  const payload = {
    full_name: document.getElementById("leadName")?.value.trim(),
    phone: document.getElementById("leadPhone")?.value.trim(),
    email: document.getElementById("leadEmail")?.value.trim(),
    message: document.getElementById("leadMessage")?.value.trim(),
    source: "index_join_us"
  };

  if (!payload.full_name || !payload.phone || !payload.email || !payload.message) {
    setLeadFormStatus("Please fill in all fields.", true);
    return;
  }

  submitButton.disabled = true;
  const originalText = submitButton.textContent;
  submitButton.textContent = "Submitting...";
  setLeadFormStatus("Sending your request...");

  try {
    const supabaseClient = window.getSupabaseClient?.();
    if (!supabaseClient) {
      throw new Error("Supabase is not ready. Refresh and try again.");
    }

    const { error } = await supabaseClient
      .from("contact_submissions")
      .insert(payload);

    if (error) throw error;

    leadForm.reset();
    setLeadFormStatus("Thanks! We will get back to you soon.");
  } catch (error) {
    setLeadFormStatus(error.message || "Could not submit your request. Please try again.", true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
});

function setLeadFormStatus(message, isError = false) {
  if (!leadFormStatus) return;
  leadFormStatus.textContent = message;
  leadFormStatus.classList.toggle("error", isError);
}

// // gradient background effect
// document.addEventListener("mousemove", (e) => {
//   const x = (e.clientX / window.innerWidth) * 100;
//   const y = (e.clientY / window.innerHeight) * 100;

//   document.documentElement.style.setProperty("--gradient-x", `${x}%`);
//   document.documentElement.style.setProperty("--gradient-y", `${y}%`);
// });

// Mobile menu
const mobileBtn = document.getElementById("mobileMenuBtn");
const navLinks = document.querySelector(".nav-links");

mobileBtn.addEventListener("click", () => {
  navLinks.classList.toggle("show");
});

// Hide menu on link click (mobile)
document.querySelectorAll(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      navLinks.classList.remove("show");
    }
  });
});

// Testimonial Section
const filterBtns = document.querySelectorAll(".cat-btn");

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelector(".cat-btn.active").classList.remove("active");
    btn.classList.add("active");
  });
});


window.addEventListener("load", () => {
  const track = document.querySelector(".scroll-track");
  const firstGroup = document.querySelectorAll(".scroll-content")[0];

  if (!track || !firstGroup) return;

  const scrollWidth = firstGroup.offsetWidth;

  track.style.setProperty("--scroll-width", `-${scrollWidth}px`);
  track.classList.add("animate-scroll");
});


// AI tools tab filtering
document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".ai-tab");
  const cards = document.querySelectorAll(".ai-card");

  if (!tabs.length || !cards.length) return;

  function applyFilter(filter) {
    cards.forEach(card => {
      const tags = (card.dataset.category || "").split(" ");
      if (filter === "trending") {
        card.style.display = tags.includes("trending") ? "" : "none";
      } else {
        card.style.display = tags.includes(filter) ? "" : "none";
      }
    });
  }

  // initial state: show trending
  applyFilter("trending");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const filter = tab.dataset.filter;
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      applyFilter(filter);
    });
  });
});

//CURRENCY TOGGLE
const currencyBtns = document.querySelectorAll(".currency-toggle span");
const prices = document.querySelectorAll(".price");

currencyBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    currencyBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const currency = btn.dataset.currency;

    prices.forEach(price => {
      if (!price.dataset.usd) return;

      price.textContent =
        currency === "usd"
          ? `${price.dataset.usd} USD`
          : `₹${price.dataset.inr}`;
    });
  });
});


//-----------------------------------------------------------------------------------------
// Open Campus Ambassador page
document.querySelectorAll(".nav-links a").forEach(link => {
  if (link.textContent.trim() === "Campus Ambassador") {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "campus-ambassador.html";
    });
  }
});

const cards = document.querySelectorAll(".ai-card");
const modal = document.getElementById("courseModal");
const closeBtn = document.getElementById("courseModalClose");

const modalTitle = document.getElementById("modalTitle");
const modalRating = document.getElementById("modalRating");
const modalDuration = document.getElementById("modalDuration");
const modalImage = document.getElementById("modalImage");

if (modal && closeBtn && modalTitle && modalRating && modalDuration && modalImage) {
  cards.forEach(card => {
    card.addEventListener("click", () => {
      modalTitle.textContent = card.dataset.title || card.querySelector("h3")?.textContent?.trim() || "Course";
      modalRating.textContent = card.dataset.rating || "";
      modalDuration.textContent = card.dataset.duration || "";
      modalImage.src = card.dataset.image || "";

      modal.classList.add("active");
      document.body.classList.add("modal-open");
    });
  });

  closeBtn.addEventListener("click", closeModal);

  modal.addEventListener("click", e => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("active");
  document.body.classList.remove("modal-open");
}


