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

  // Toast Notification System
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'cyber-toast';

    let icon = '⚡';
    if (type === 'success') {
      icon = '🛡️';
      playSound('success');
    } else if (type === 'error') {
      icon = '⚠️';
      playSound('alert');
    } else {
      playSound('click');
    }

    toast.innerHTML = `<span style="font-size: 1.1rem;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
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
