// Three.js 3D Background - Mesh Cybernético & Partículas Otimizadas
(function() {
  const canvas = document.getElementById('three-bg-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 15, 75);

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

  // 1. Cyber Wireframe Terrain Plane (Grade 3D Flutuante no fundo)
  const planeGeo = new THREE.PlaneGeometry(160, 160, 24, 24);
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0x94a3b8,
    wireframe: true,
    transparent: true,
    opacity: 0.12
  });
  const planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.rotation.x = -Math.PI / 2.3;
  planeMesh.position.y = -22;
  scene.add(planeMesh);

  // Guarda posições originais dos vértices para ondulação
  const originalZ = [];
  const planePos = planeGeo.attributes.position;
  for (let i = 0; i < planePos.count; i++) {
    originalZ.push(planePos.getZ(i));
  }

  // 2. Partículas Estelares
  const particleCount = 140;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 140;
    positions[i + 1] = (Math.random() - 0.5) * 80 + 10;
    positions[i + 2] = (Math.random() - 0.5) * 60;

    velocities.push({
      x: (Math.random() - 0.5) * 0.03,
      y: (Math.random() - 0.5) * 0.03,
      z: (Math.random() - 0.5) * 0.03
    });
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2.0,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending
  });

  const particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);

  // Interatividade Mouse & Touch para Celulares
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  window.addEventListener('mousemove', (e) => {
    targetX = (e.clientX - window.innerWidth / 2) * 0.015;
    targetY = (e.clientY - window.innerHeight / 2) * 0.015;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      targetX = (e.touches[0].clientX - window.innerWidth / 2) * 0.015;
      targetY = (e.touches[0].clientY - window.innerHeight / 2) * 0.015;
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // Ondulação suave da grade
    for (let i = 0; i < planePos.count; i++) {
      const u = planePos.getX(i);
      const v = planePos.getY(i);
      const wave = Math.sin(u * 0.1 + elapsedTime * 1.2) * Math.cos(v * 0.1 + elapsedTime * 1.2) * 3.5;
      planePos.setZ(i, originalZ[i] + wave);
    }
    planePos.needsUpdate = true;

    // Partículas flutuantes
    const pos = geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      pos[idx] += velocities[i].x;
      pos[idx + 1] += velocities[i].y;
      pos[idx + 2] += velocities[i].z;

      if (Math.abs(pos[idx]) > 70) velocities[i].x *= -1;
      if (Math.abs(pos[idx + 1]) > 40) velocities[i].y *= -1;
      if (Math.abs(pos[idx + 2]) > 30) velocities[i].z *= -1;
    }
    geometry.attributes.position.needsUpdate = true;

    // Rotação suave e amortecimento de câmera
    currentX += (targetX - currentX) * 0.05;
    currentY += (targetY - currentY) * 0.05;

    camera.position.x = currentX;
    camera.position.y = 15 - currentY;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  animate();
})();
