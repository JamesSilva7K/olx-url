// 3D Holographic Scanner - Three.js Loading Effect
window.Scanner3D = (function() {
  let isInitialized = false;
  let scene, camera, renderer, icosahedron, outerCube, scanRing, animId;
  const overlay = document.getElementById('scanner-3d-overlay');
  const canvas = document.getElementById('scanner-canvas');
  const hudText = document.getElementById('scanner-hud-text');
  const telemetry = document.getElementById('scanner-telemetry-log');

  function init() {
    if (!canvas || typeof THREE === 'undefined') return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 14;

    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(280, 280);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Inner wireframe icosahedron
    const icoGeo = new THREE.IcosahedronGeometry(3.2, 1);
    const icoMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    });
    icosahedron = new THREE.Mesh(icoGeo, icoMat);
    scene.add(icosahedron);

    // Outer wireframe box
    const boxGeo = new THREE.BoxGeometry(5.2, 5.2, 5.2);
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });
    outerCube = new THREE.Mesh(boxGeo, boxMat);
    scene.add(outerCube);

    // Scanning laser ring
    const ringGeo = new THREE.RingGeometry(3.5, 3.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    scanRing = new THREE.Mesh(ringGeo, ringMat);
    scanRing.rotation.x = Math.PI / 2;
    scene.add(scanRing);

    isInitialized = true;
  }

  let ringDirection = 1;
  function animate() {
    animId = requestAnimationFrame(animate);

    if (icosahedron) {
      icosahedron.rotation.x += 0.015;
      icosahedron.rotation.y += 0.02;
    }

    if (outerCube) {
      outerCube.rotation.x -= 0.008;
      outerCube.rotation.y -= 0.01;
    }

    if (scanRing) {
      scanRing.position.y += 0.07 * ringDirection;
      if (scanRing.position.y > 3) ringDirection = -1;
      if (scanRing.position.y < -3) ringDirection = 1;
      scanRing.rotation.z += 0.03;
    }

    renderer.render(scene, camera);
  }

  const telemetrySteps = [
    "Inicializando túnel seguro ScraperAPI...",
    "Rotacionando Proxy Residencial Brasileiro...",
    "Bypassing Cloudflare & Akamai WAF...",
    "Extraindo anúncios 100% autênticos da OLX...",
    "Analisando Microdados Schema.org e Vendedores...",
    "Calculando Mediana e Desvio Padrão de Mercado...",
    "Auditando flags de risco e autenticidade...",
    "Finalizando validação com Blindagem Ativa..."
  ];

  let stepInterval = null;

  return {
    show: function(title = "CONSULTANDO OLX BRASIL...") {
      if (!isInitialized) init();
      if (overlay) overlay.classList.add('active');
      if (hudText) hudText.textContent = title;

      let stepIdx = 0;
      if (telemetry) telemetry.textContent = telemetrySteps[0];

      clearInterval(stepInterval);
      stepInterval = setInterval(() => {
        stepIdx = (stepIdx + 1) % telemetrySteps.length;
        if (telemetry) telemetry.textContent = telemetrySteps[stepIdx];
      }, 700);

      cancelAnimationFrame(animId);
      animate();
    },

    hide: function() {
      if (overlay) overlay.classList.remove('active');
      clearInterval(stepInterval);
      cancelAnimationFrame(animId);
    }
  };
})();
