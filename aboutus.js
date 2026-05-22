/* ----------------------------------
   HERO ARROW SCROLL
---------------------------------- */
const heroArrow = document.querySelector(".about-hero-arrow");
const heroSection = document.querySelector(".about-hero");

heroArrow?.addEventListener("click", () => {
  const nextSection = heroSection?.nextElementSibling;
  nextSection?.scrollIntoView({ behavior: "smooth" });
});

/* ----------------------------------
   HERO REVEAL ON LOAD
---------------------------------- */
window.addEventListener("load", () => {
  const hero = document.querySelector(".about-hero");
  if (!hero) return;

  hero.style.opacity = "0";
  hero.style.transform = "translateY(20px)";

  requestAnimationFrame(() => {
    hero.style.transition = "opacity 0.8s ease, transform 0.8s ease";
    hero.style.opacity = "1";
    hero.style.transform = "translateY(0)";
  });
});

/* ----------------------------------
   DYNAMIC ISLAND NAVBAR
---------------------------------- */
const navbar = document.querySelector(".navbar");

window.addEventListener("scroll", () => {
  if (!navbar) return;
  navbar.classList.toggle("di-scrolled", window.scrollY > 1);
});

/* ----------------------------------
   ABOUT STORY – MOBILE SLIDER
---------------------------------- */
(function () {
  if (window.innerWidth > 768) return;

  const track = document.querySelector(".slider-track");
  const images = document.querySelectorAll(".slider-track .story-img");
  const prevBtn = document.querySelector(".slider-btn.prev");
  const nextBtn = document.querySelector(".slider-btn.next");

  if (!track || !images.length) return;

  let index = 0;

  function updateSlider() {
    track.style.transform = `translateX(-${index * 100}%)`;
  }

  nextBtn.addEventListener("click", () => {
    index = (index + 1) % images.length;
    updateSlider();
  });

  prevBtn.addEventListener("click", () => {
    index = (index - 1 + images.length) % images.length;
    updateSlider();
  });
})();

/* ----------------------------------
   ABOUT STORY – LIQUID SCROLL ANIMATION
---------------------------------- */
if (window.innerWidth > 768) {
  const storySection = document.getElementById("aboutStory");
  const storyImages = document.querySelector(".about-story-images");
  const storyText = document.querySelector(".about-story-text");

  let currentX = 140; // rendered position
  let targetX = 140; // scroll-driven target
  let textOpacity = 0; // smooth text fade

  function animateStory() {
    if (!storySection || !storyImages || !storyText) {
      requestAnimationFrame(animateStory);
      return;
    }

    const rect = storySection.getBoundingClientRect();
    const vh = window.innerHeight;
    const scrollRange = storySection.offsetHeight - vh;

    if (scrollRange > 0) {
      let progress = (vh - rect.top) / scrollRange;
      progress = Math.min(Math.max(progress, 0), 1);

      // REQUIRED DISTANCE (do not change 280)
      targetX = 140 - progress * 280;
    }

    // INERTIA / WATER FEEL
    currentX += (targetX - currentX) * 0.06;
    storyImages.style.transform = `translate(${currentX}%, -50%)`;

    // TEXT AFTER IMAGES EXIT
    const imagesRect = storyImages.getBoundingClientRect();
    const shouldShowText = imagesRect.right < 0 ? 1 : 0;

    textOpacity += (shouldShowText - textOpacity) * 0.08;
    storyText.style.opacity = textOpacity;
    storyText.style.transform = `translateX(-50%) translateY(${
      (1 - textOpacity) * 60
    }px)`;

    
    requestAnimationFrame(animateStory);
  }

  // START THE LOOP
  animateStory();
}

const card = document.getElementById("beamCard");
let angle = 0;

function animate() {
  angle += 0.6; // speed
  card.style.setProperty("--angle", angle + "deg");
  requestAnimationFrame(animate);
}

animate();

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
