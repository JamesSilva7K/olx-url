// Biblioteca de Avatares Vetoriais de Alta Definição (100% Monochrome Cyberpunk / Operador)
window.CyberAvatars = (function() {
  function toUri(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.trim());
  }

  const rawAvatars = [
    {
      id: "operator_phantom",
      name: "Operador Fantasma",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g1" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#222632"/><stop offset="100%" stop-color="#0a0c10"/></radialGradient></defs><circle cx="60" cy="60" r="56" fill="url(#g1)" stroke="rgba(255,255,255,0.4)" stroke-width="2.5"/><circle cx="60" cy="48" r="18" fill="#ffffff"/><path d="M30 96 C32 74 88 74 90 96" fill="#ffffff"/><circle cx="53" cy="46" r="3.2" fill="#0c0e14"/><circle cx="67" cy="46" r="3.2" fill="#0c0e14"/><path d="M52 56 Q60 62 68 56" stroke="#0c0e14" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`
    },
    {
      id: "delta_illuminati",
      name: "Delta Sentinel",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g2" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#242836"/><stop offset="100%" stop-color="#090b0e"/></radialGradient></defs><circle cx="60" cy="60" r="56" fill="url(#g2)" stroke="rgba(255,255,255,0.4)" stroke-width="2.5"/><polygon points="60,24 94,80 26,80" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linejoin="round"/><polygon points="60,38 82,74 38,74" fill="#ffffff"/><circle cx="60" cy="59" r="6" fill="#0c0e14"/><path d="M22 96 Q60 84 98 96" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`
    },
    {
      id: "cyber_droid",
      name: "Androide Cyber",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g3" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#202430"/><stop offset="100%" stop-color="#08090d"/></radialGradient></defs><circle cx="60" cy="60" r="56" fill="url(#g3)" stroke="rgba(255,255,255,0.4)" stroke-width="2.5"/><line x1="60" y1="20" x2="60" y2="34" stroke="#ffffff" stroke-width="4"/><circle cx="60" cy="18" r="4.5" fill="#ffffff"/><rect x="33" y="34" width="54" height="42" rx="10" fill="#ffffff"/><rect x="25" y="46" width="6" height="18" rx="3" fill="#ffffff"/><rect x="89" y="46" width="6" height="18" rx="3" fill="#ffffff"/><circle cx="48" cy="50" r="5.5" fill="#0c0e14"/><circle cx="72" cy="50" r="5.5" fill="#0c0e14"/><path d="M46 63 Q60 70 74 63" stroke="#0c0e14" stroke-width="3.5" stroke-linecap="round" fill="none"/><path d="M28 98 C36 84 84 84 92 98" fill="#ffffff"/></svg>`
    },
    {
      id: "crypto_wolf",
      name: "Lobo da Rede / Shogun",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g4" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#1e2430"/><stop offset="100%" stop-color="#06080d"/></radialGradient></defs><circle cx="60" cy="60" r="56" fill="url(#g4)" stroke="#ffffff" stroke-width="3"/><polygon points="60,20 90,44 82,82 60,100 38,82 30,44" fill="#ffffff"/><polygon points="60,32 78,50 60,86 42,50" fill="#0c0e14"/><circle cx="52" cy="52" r="3.8" fill="#ffffff"/><circle cx="68" cy="52" r="3.8" fill="#ffffff"/></svg>`
    },
    {
      id: "orbital_pilot",
      name: "Piloto Orbital",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g5" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#222736"/><stop offset="100%" stop-color="#080a0f"/></radialGradient></defs><circle cx="60" cy="60" r="56" fill="url(#g5)" stroke="rgba(255,255,255,0.4)" stroke-width="2.5"/><circle cx="60" cy="48" r="22" fill="#ffffff"/><line x1="60" y1="18" x2="60" y2="26" stroke="#ffffff" stroke-width="4"/><circle cx="60" cy="16" r="3.5" fill="#ffffff"/><rect x="40" y="44" width="40" height="9" rx="4.5" fill="#0c0e14"/><path d="M22 96 C30 76 90 76 98 96" fill="#ffffff"/></svg>`
    },
    {
      id: "matrix_hex",
      name: "Hexágono Guardião",
      rawSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g6" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#1c202a"/><stop offset="100%" stop-color="#07080b"/></radialGradient></defs><circle cx="60" cy="60" r="56" fill="url(#g6)" stroke="rgba(255,255,255,0.4)" stroke-width="2.5"/><polygon points="60,22 92,41 92,79 60,98 28,79 28,41" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linejoin="round"/><circle cx="60" cy="60" r="13" fill="#ffffff"/><circle cx="60" cy="60" r="5" fill="#0c0e14"/></svg>`
    }
  ];

  const avatars = rawAvatars.map(a => ({
    id: a.id,
    name: a.name,
    svg: toUri(a.rawSvg)
  }));

  const defaultAvatar = avatars[3].svg; // Default para Lobo da Rede / Shogun (idêntico à imagem 2)

  return {
    list: avatars,
    defaultAvatar: defaultAvatar,
    getById: function(id) {
      const found = avatars.find(a => a.id === id);
      return found ? found.svg : defaultAvatar;
    }
  };
})();
