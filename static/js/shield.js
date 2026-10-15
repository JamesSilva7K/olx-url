// Cyber Shield - Anti-Cópia, Anti-Inspect e Sistema de Efeitos Sonoros HUD
window.CyberShield = (function() {
  let audioCtx = null;
  let shieldActive = true;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Sintetizador de Som Futurista via Web Audio API
  function playSound(type) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(780, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'alert') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.linearRampToValueAtTime(140, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {
      // Audio fallback silent
    }
  }

  // Toast Notification System com Deduplicação Inteligente
  const activeToasts = new Map();

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container || !message) return;

    // Previne repetição em cascata da mesma mensagem em menos de 2.5 segundos
    const now = Date.now();
    const lastSeen = activeToasts.get(message);
    if (lastSeen && (now - lastSeen < 2500)) {
      return;
    }
    activeToasts.set(message, now);

    const toast = document.createElement('div');
    toast.className = `cyber-toast toast-${type}`;

    let iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
      playSound('success');
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
      playSound('alert');
    } else if (type === 'warning') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
      playSound('alert');
    } else {
      playSound('click');
    }

    toast.innerHTML = `
      <span class="toast-icon-wrap">${iconSvg}</span>
      <span class="toast-message-text">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => {
        toast.remove();
        activeToasts.delete(message);
      }, 300);
    }, 4000);
  }

  // Blindagem de Interface: Anti-Cópia e Proteção contra DevTools Probes
  function initProtections() {
    // Bloqueia menu de contexto com clique direito (pode ser ativado/desativado)
    document.addEventListener('contextmenu', (e) => {
      if (shieldActive && !e.target.closest('input, textarea')) {
        e.preventDefault();
        showToast("Blindagem Ativa: Inspeção direta bloqueada pelo protocolo de segurança.", "info");
      }
    });

    // Atalhos restritos (F12, Ctrl+Shift+I, Ctrl+U)
    document.addEventListener('keydown', (e) => {
      if (!shieldActive) return;

      // F12
      if (e.key === 'F12') {
        e.preventDefault();
        showToast("Acesso ao DevTools bloqueado pela blindagem anti-cópia.", "error");
      }
      // Ctrl+Shift+I ou Ctrl+Shift+J ou Ctrl+U
      if ((e.ctrlKey || e.metaKey) && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'U' || e.key === 'u')) {
        e.preventDefault();
        showToast("Comando interceptado pela Blindagem Cibernética.", "error");
      }
    });
  }

  initProtections();

  return {
    playSound: playSound,
    showToast: showToast,
    toggleShield: function() {
      shieldActive = !shieldActive;
      return shieldActive;
    },
    isShieldActive: function() {
      return shieldActive;
    }
  };
})();
