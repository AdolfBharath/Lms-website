(() => {
const stage = document.querySelector("[data-hero-3d]");
const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (stage && motionOK && window.THREE) {
  const { THREE } = window;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.4, 12);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  stage.appendChild(renderer.domElement);

  const root = new THREE.Group();
  scene.add(root);

  scene.add(new THREE.AmbientLight(0xffffff, 1.25));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(-4, 5, 8);
  scene.add(keyLight);

  const aquaLight = new THREE.PointLight(0x17c6b5, 2.4, 18);
  aquaLight.position.set(4, -2, 6);
  scene.add(aquaLight);

  const purpleLight = new THREE.PointLight(0x6654f1, 2.8, 18);
  purpleLight.position.set(-5, 2.5, 5);
  scene.add(purpleLight);

  const colors = {
    purple: new THREE.Color("#6654f1"),
    aqua: new THREE.Color("#17c6b5"),
    yellow: new THREE.Color("#ffc329"),
    ink: new THREE.Color("#171631"),
    pink: new THREE.Color("#ff7fb2"),
  };

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: colors.purple,
    metalness: 0.18,
    roughness: 0.22,
    transparent: true,
    opacity: 0.86,
    emissive: colors.purple,
    emissiveIntensity: 0.08,
  });

  const aquaMaterial = glassMaterial.clone();
  aquaMaterial.color = colors.aqua;
  aquaMaterial.opacity = 0.72;

  const yellowMaterial = new THREE.MeshStandardMaterial({
    color: colors.yellow,
    metalness: 0.12,
    roughness: 0.3,
    transparent: true,
    opacity: 0.9,
    emissive: colors.yellow,
    emissiveIntensity: 0.06,
  });

  const lineMaterial = new THREE.MeshBasicMaterial({
    color: colors.aqua,
    transparent: true,
    opacity: 0.34,
  });

  const makeOrbiter = (mesh, radius, speed, height, phase) => {
    mesh.userData = { radius, speed, height, phase };
    root.add(mesh);
    return mesh;
  };

  const orbiters = [];
  const geometries = [
    new THREE.IcosahedronGeometry(0.46, 1),
    new THREE.OctahedronGeometry(0.5),
    new THREE.TetrahedronGeometry(0.54),
  ];

  for (let i = 0; i < 9; i += 1) {
    const material = [glassMaterial, aquaMaterial, yellowMaterial][i % 3].clone();
    material.opacity = i % 4 === 0 ? 0.38 : material.opacity * 0.68;
    const mesh = new THREE.Mesh(geometries[i % geometries.length], material);
    mesh.scale.setScalar(0.46 + (i % 5) * 0.07);
    orbiters.push(makeOrbiter(
      mesh,
      2.75 + (i % 5) * 0.28,
      0.14 + (i % 6) * 0.018,
      -1.2 + (i % 4) * 0.72,
      i * 0.9
    ));
  }

  const ringGroup = new THREE.Group();
  root.add(ringGroup);

  const rings = [
    { radius: 3.45, tube: 0.01, color: colors.aqua, opacity: 0.24, y: -0.1 },
    { radius: 4.05, tube: 0.008, color: colors.purple, opacity: 0.18, y: 0.15 },
  ].map((item, index) => {
    const material = new THREE.MeshBasicMaterial({
      color: item.color,
      transparent: true,
      opacity: item.opacity,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(item.radius, item.tube, 8, 160), material);
    ring.rotation.x = Math.PI * 0.62;
    ring.rotation.z = index * 0.45;
    ring.position.y = item.y;
    ringGroup.add(ring);
    return ring;
  });

  const ribbon = new THREE.Group();
  root.add(ribbon);
  for (let i = 0; i < 2; i += 1) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.8, -1.4 + i * 0.46, -0.4),
      new THREE.Vector3(-2.2, 1.1 - i * 0.18, 0.8),
      new THREE.Vector3(0.2, -0.9 + i * 0.26, -0.2),
      new THREE.Vector3(2.8, 0.95 - i * 0.18, 0.7),
      new THREE.Vector3(5.0, -1.15 + i * 0.34, -0.3),
    ]);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 96, 0.018 + i * 0.006, 8, false),
      i === 1 ? lineMaterial : lineMaterial.clone()
    );
    tube.material.opacity = 0.12 + i * 0.05;
    ribbon.add(tube);
  }

  const particleGeometry = new THREE.BufferGeometry();
  const particleCount = 58;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 5;
  }
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      color: "#6654f1",
      size: 0.035,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
  );
  root.add(particles);

  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };

  const resize = () => {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    root.position.x = width < 520 ? 0 : 0.45;
    root.scale.setScalar(width < 520 ? 0.58 : 0.86);
  };

  const onPointerMove = (event) => {
    const rect = stage.getBoundingClientRect();
    target.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    target.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };

  let frameId = 0;
  const animationStart = performance.now();

  const animate = () => {
    const elapsed = (performance.now() - animationStart) / 1000;

    pointer.x += (target.x - pointer.x) * 0.06;
    pointer.y += (target.y - pointer.y) * 0.06;

    root.rotation.y = pointer.x * 0.14;
    root.rotation.x = -pointer.y * 0.08;
    ringGroup.rotation.z = elapsed * 0.12;
    ribbon.rotation.y = Math.sin(elapsed * 0.42) * 0.1;
    particles.rotation.y = elapsed * 0.035;

    orbiters.forEach((mesh, index) => {
      const { radius, speed, height, phase } = mesh.userData;
      const angle = elapsed * speed + phase;
      mesh.position.set(
        Math.cos(angle) * radius,
        height + Math.sin(angle * 1.7) * 0.18,
        Math.sin(angle) * 1.1
      );
      mesh.rotation.x = elapsed * (0.35 + index * 0.01);
      mesh.rotation.y = elapsed * (0.28 + index * 0.015);
    });

    rings.forEach((ring, index) => {
      ring.rotation.z += 0.0018 + index * 0.0006;
    });

    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(animate);
  };

  resize();
  animate();

  window.addEventListener("resize", resize);
  stage.closest(".hero")?.addEventListener("pointermove", onPointerMove);
  window.addEventListener("beforeunload", () => {
    window.cancelAnimationFrame(frameId);
    renderer.dispose();
  });
}
})();
