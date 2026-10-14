// Biblioteca de Avatares Vetoriais de Alta Definição (100% Monochrome Cyberpunk / Operador)
window.CyberAvatars = (function() {
  function toUri(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.trim());
  }

  const rawAvatars = [
    {
      id: "operator_phantom",
      name: "Operador Fantasma",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1d24"/><stop offset="100%" stop-color="#060709"/></linearGradient></defs><circle cx="60" cy="60" r="58" fill="url(#g1)" stroke="#ffffff" stroke-width="2.5"/><circle cx="60" cy="46" r="22" fill="#ffffff"/><path d="M28 98 C32 72 88 72 92 98 Z" fill="#ffffff"/><circle cx="52" cy="45" r="4" fill="#000000"/><circle cx="68" cy="45" r="4" fill="#000000"/><rect x="44" y="54" width="32" height="4" rx="2" fill="#000000"/></svg>`
    },
    {
      id: "cyber_ninja",
      name: "Cyber Shinobi",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#27272a"/><stop offset="100%" stop-color="#09090b"/></linearGradient></defs><circle cx="60" cy="60" r="58" fill="url(#g2)" stroke="#cbd5e1" stroke-width="2.5"/><polygon points="60,18 96,82 24,82" fill="#ffffff"/><polygon points="60,34 84,76 36,76" fill="#09090b"/><circle cx="60" cy="58" r="7" fill="#ffffff"/><path d="M20 102 C35 88 85 88 100 102 Z" fill="#ffffff"/></svg>`
    },
    {
      id: "neural_bot",
      name: "Androide V5",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#18181b"/><stop offset="100%" stop-color="#000000"/></linearGradient></defs><circle cx="60" cy="60" r="58" fill="url(#g3)" stroke="#ffffff" stroke-width="2.5"/><rect x="34" y="32" width="52" height="46" rx="12" fill="#ffffff"/><circle cx="48" cy="50" r="5" fill="#000000"/><circle cx="72" cy="50" r="5" fill="#000000"/><line x1="44" y1="64" x2="76" y2="64" stroke="#000000" stroke-width="4" stroke-linecap="round"/><line x1="60" y1="18" x2="60" y2="32" stroke="#ffffff" stroke-width="4"/><circle cx="60" cy="16" r="4" fill="#ffffff"/><path d="M26 104 C34 86 86 86 94 104 Z" fill="#ffffff"/></svg>`
    },
    {
      id: "crypto_wolf",
      name: "Lobo da Rede",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#020617"/></linearGradient></defs><circle cx="60" cy="60" r="58" fill="url(#g4)" stroke="#e2e8f0" stroke-width="2.5"/><polygon points="60,22 88,44 82,78 60,98 38,78 32,44" fill="#ffffff"/><polygon points="60,34 76,50 60,82 44,50" fill="#000000"/><circle cx="52" cy="52" r="3.5" fill="#ffffff"/><circle cx="68" cy="52" r="3.5" fill="#ffffff"/></svg>`
    },
    {
      id: "agent_supremo",
      name: "Comandante Alfa",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g5" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#27272a"/><stop offset="100%" stop-color="#09090b"/></linearGradient></defs><circle cx="60" cy="60" r="58" fill="url(#g5)" stroke="#ffffff" stroke-width="2.5"/><circle cx="60" cy="48" r="20" fill="#ffffff"/><path d="M22 102 C30 76 90 76 98 102 Z" fill="#ffffff"/><rect x="42" y="44" width="36" height="8" rx="4" fill="#000000"/><line x1="60" y1="20" x2="60" y2="28" stroke="#ffffff" stroke-width="3"/></svg>`
    },
    {
      id: "matrix_sentinel",
      name: "Sentinela Cyber",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g6" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#111827"/><stop offset="100%" stop-color="#030712"/></linearGradient></defs><circle cx="60" cy="60" r="58" fill="url(#g6)" stroke="#94a3b8" stroke-width="2.5"/><path d="M60 22 L92 42 L92 78 L60 98 L28 78 L28 42 Z" fill="none" stroke="#ffffff" stroke-width="4"/><circle cx="60" cy="60" r="14" fill="#ffffff"/><circle cx="60" cy="60" r="5" fill="#000000"/></svg>`
    }
  ];

  const avatars = rawAvatars.map(a => ({
    id: a.id,
    name: a.name,
    svg: toUri(a.rawSvg)
  }));

  const defaultAvatar = avatars[0].svg;

  return {
    list: avatars,
    defaultAvatar: defaultAvatar,
    getById: function(id) {
      const found = avatars.find(a => a.id === id);
      return found ? found.svg : defaultAvatar;
    }
  };
})();
