// Three.js 3D Background - Mesh Cybernético & Partículas Ultra Otimizadas
(function() {
  const canvas = document.getElementById('three-bg-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // Detecção de hardware / baixa potência
  const isLowEnd = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
                   /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 15, 75);

  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: !isLowEnd,
    powerPreference: "low-power"
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isLowEnd ? 1 : 1.5));

  // 1. Cyber Wireframe Terrain Plane (Segmentação adaptada)
  const segments = isLowEnd ? 12 : 20;
  const planeGeo = new THREE.PlaneGeometry(160, 160, segments, segments);
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0x94a3b8,
    wireframe: true,
    transparent: true,
    opacity: 0.09
  });
  const planeMesh = new THREE.Mesh(planeGeo, planeMat);
  planeMesh.rotation.x = -Math.PI / 2.3;
  planeMesh.position.y = -22;
  scene.add(planeMesh);

  // 2. Partículas Estelares (Leves)
  const particleCount = isLowEnd ? 40 : 80;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 140;
    positions[i + 1] = (Math.random() - 0.5) * 80 + 10;
    positions[i + 2] = (Math.random() - 0.5) * 60;

    velocities.push({
      x: (Math.random() - 0.5) * 0.02,
      y: (Math.random() - 0.5) * 0.02,
      z: (Math.random() - 0.5) * 0.02
    });
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 1.8,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending
  });

  const particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);

  // Interatividade suave
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  window.addEventListener('mousemove', (e) => {
    targetX = (e.clientX - window.innerWidth / 2) * 0.01;
    targetY = (e.clientY - window.innerHeight / 2) * 0.01;
  }, { passive: true });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let lastFrameTime = 0;
  const targetFPS = isLowEnd ? 30 : 60;
  const frameInterval = 1000 / targetFPS;

  function animate(timestamp) {
    requestAnimationFrame(animate);

    if (timestamp - lastFrameTime < frameInterval) return;
    lastFrameTime = timestamp;

    // Movimentação lenta e leve das partículas
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

    // Rotação suave da grade sem recalcular vértices por frame
    planeMesh.rotation.z += 0.0004;

    currentX += (targetX - currentX) * 0.05;
    currentY += (targetY - currentY) * 0.05;

    camera.position.x = currentX;
    camera.position.y = 15 - currentY;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
})();
