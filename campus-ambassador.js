/* ----------------------------------
     DYNAMIC ISLAND NAVBAR
  ---------------------------------- */
const navbar = document.querySelector(".navbar");

window.addEventListener("scroll", () => {
  if (!navbar) return;

  if (window.scrollY > 1) {
    navbar.classList.add("di-scrolled");
  } else {
    navbar.classList.remove("di-scrolled");
  }
});
const coursesSlider = document.getElementById("coursesSlider");
const orderSlider = document.getElementById("orderSlider");
const coursesValue = document.getElementById("coursesValue");
const orderValue = document.getElementById("orderValue");
const totalEarning = document.getElementById("totalEarning");

function updateSlider(slider) {
  const percent =
    ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.background = `linear-gradient(
      to right,
      #5b5bf0 ${percent}%,
      #cfd2ff ${percent}%
    )`;
}

function calculate() {
  const courses = Number(coursesSlider.value);
  const order = Number(orderSlider.value);

  coursesValue.textContent = courses;
  orderValue.textContent = order;

  const earning = Math.round(courses * order * 0.08);
  totalEarning.textContent = earning.toLocaleString("en-IN");

  updateSlider(coursesSlider);
  updateSlider(orderSlider);
}

coursesSlider.addEventListener("input", calculate);
orderSlider.addEventListener("input", calculate);

calculate();

document.addEventListener("DOMContentLoaded", () => {
  const loginModal = document.getElementById("loginModal");
  const backdrop = document.querySelector(".login-backdrop");

  // Find ANY login button on the page
  const loginBtns = document.querySelectorAll(".login-btn, .login, .nav-login");

  loginBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!loginModal) return;
      loginModal.classList.add("active");
      document.body.style.overflow = "hidden";
    });
  });

  // Close button
  const closeBtn = document.getElementById("closeLogin");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      loginModal.classList.remove("active");
      document.body.style.overflow = "";
    });
  }

  // Backdrop click
  if (backdrop) {
    backdrop.addEventListener("click", () => {
      loginModal.classList.remove("active");
      document.body.style.overflow = "";
    });
  }
});
