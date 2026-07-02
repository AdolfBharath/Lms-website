(function () {
  const featureTrack = document.querySelector(".about-feature-track");
  if (featureTrack) {
    [...featureTrack.children].forEach((card) => featureTrack.appendChild(card.cloneNode(true)));
  }

  const root = document.querySelector("[data-infinite-menu]");
  if (!root) return;

  const stage = root.querySelector(".infinite-stage");
  const info = root.querySelector(".infinite-info");
  const title = info.querySelector("h3");
  const description = info.querySelector("p");
  const action = info.querySelector("a");

  const items = [
    {
      image: "assets/img/courses/course_thumb01.jpg",
      link: "index.html#courses",
      title: "Career Programs",
      description: "Focused course tracks that move learners from practice to portfolio-ready output."
    },
    {
      image: "assets/img/others/about_img.png",
      link: "index.html#about",
      title: "Mentor Led Learning",
      description: "Live support, expert feedback, and community energy around every learning path."
    },
    {
      image: "assets/img/instructor/instructor01.png",
      link: "index.html#mentors",
      title: "Expert Instructors",
      description: "Practitioners who turn complex skills into clear, usable lessons."
    },
    {
      image: "assets/img/blog/blog_post02.jpg",
      link: "campus-ambassador.html",
      title: "Student Community",
      description: "Ambassador programs and peer groups built for students who want to grow together."
    },
    {
      image: "assets/img/courses/course_thumb03.jpg",
      link: "index.html#dashboard",
      title: "Progress Systems",
      description: "Simple dashboards, project milestones, and practical guidance that keeps momentum visible."
    },
    {
      image: "assets/img/blog/blog_post04.jpg",
      link: "index.html#home",
      title: "Job Readiness",
      description: "Skill-building shaped around confidence, communication, and real career outcomes."
    }
  ];

  let rotationX = -8;
  let rotationY = 0;
  let velocityX = 0.04;
  let velocityY = 0.16;
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  let activeIndex = -1;

  const cards = items.map((item, index) => {
    const card = document.createElement("a");
    card.className = "infinite-card";
    card.href = item.link;
    card.innerHTML = `<img src="${item.image}" alt=""><span>${item.title}</span>`;
    stage.appendChild(card);
    return { element: card, item, index };
  });

  const setActiveItem = (index) => {
    if (index === activeIndex) return;
    activeIndex = index;
    const item = items[index];
    title.textContent = item.title;
    description.textContent = item.description;
    action.href = item.link;
  };

  const render = () => {
    const bounds = stage.getBoundingClientRect();
    const size = Math.min(bounds.width, bounds.height);
    const radius = size * 0.3;
    const centerX = bounds.width * 0.6;
    const centerY = bounds.height * 0.42;
    const rotX = rotationX * Math.PI / 180;
    const rotY = rotationY * Math.PI / 180;
    let frontIndex = 0;
    let frontZ = -Infinity;

    cards.forEach(({ element }, index) => {
      const phi = Math.acos(-1 + (2 * index + 1) / cards.length);
      const theta = Math.sqrt(cards.length * Math.PI) * phi;
      let x = Math.cos(theta) * Math.sin(phi);
      let y = Math.sin(theta) * Math.sin(phi);
      let z = Math.cos(phi);

      const y1 = y * Math.cos(rotX) - z * Math.sin(rotX);
      const z1 = y * Math.sin(rotX) + z * Math.cos(rotX);
      const x2 = x * Math.cos(rotY) + z1 * Math.sin(rotY);
      const z2 = -x * Math.sin(rotY) + z1 * Math.cos(rotY);
      const scale = 0.62 + (z2 + 1) * 0.3;
      const alpha = 0.32 + (z2 + 1) * 0.34;

      if (z2 > frontZ) {
        frontZ = z2;
        frontIndex = index;
      }

      element.style.transform = `translate3d(${centerX + x2 * radius}px, ${centerY + y1 * radius}px, 0) translate(-50%, -50%) scale(${scale})`;
      element.style.opacity = alpha.toFixed(3);
      element.style.zIndex = String(Math.round((z2 + 1) * 100));
      element.classList.toggle("is-front", z2 > 0.78);
    });

    setActiveItem(frontIndex);
    if (!isDragging) {
      velocityX *= 0.985;
      velocityY *= 0.985;
      rotationX += velocityX;
      rotationY += velocityY;
      if (Math.abs(velocityY) < 0.055) velocityY += 0.002;
    }

    requestAnimationFrame(render);
  };

  stage.addEventListener("pointerdown", (event) => {
    isDragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    stage.setPointerCapture(event.pointerId);
    root.classList.add("is-moving");
  });

  stage.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    velocityY = dx * 0.18;
    velocityX = -dy * 0.18;
    rotationY += velocityY;
    rotationX += velocityX;
    lastX = event.clientX;
    lastY = event.clientY;
  });

  const release = () => {
    isDragging = false;
    root.classList.remove("is-moving");
  };

  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("pointerleave", release);

  render();
})();
