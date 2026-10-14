// Aplicação Principal - OLX Brasil Consultador & Validador Supremo
(function() {
  // Estado Global
  const state = {
    currentLead: JSON.parse(localStorage.getItem('olx_lead_profile') || 'null'),
    adminToken: sessionStorage.getItem('olx_admin_token') || null,
    states: [],
    categories: [],
    chartInstance: null,
    activeTab: 'consultador',
    adminActiveSubtab: 'leads',
    selectedState: 'BR',
    selectedCategory: 'todas',
    selectedSort: 'recent',
    dropdowns: {},
    rawAds: [],
    currentFilteredAds: [],
    quickFilterText: '',
    quickFilterChip: 'all',
    quickSort: 'default'
  };

  const defaultAvatar = (window.CyberAvatars && window.CyberAvatars.defaultAvatar) ? window.CyberAvatars.defaultAvatar : "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#111317"/><circle cx="50" cy="38" r="18" fill="#ffffff"/><path d="M25 82 C25 62, 75 62, 75 82" fill="#ffffff"/></svg>');
  let selectedAvatar = (state.currentLead && state.currentLead.avatar) ? state.currentLead.avatar : defaultAvatar;

  // Fallback seguro de imagem codificado em URI (sem aspas simples que quebram JS inline)
  const FALLBACK_AD_IMG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250"><rect width="400" height="250" fill="#0e1015"/><path d="M160 140 L190 100 L220 130 L250 85 L290 140 Z" fill="#222630"/><circle cx="180" cy="85" r="12" fill="#222630"/><text x="200" y="180" fill="#64748b" font-family="sans-serif" font-size="14" text-anchor="middle">IMAGEM REAL OLX</text></svg>');

  // Tratador global de falha de carregamento de imagem com rotação para o proxy seguro
  window.handleAdImgError = function(img) {
    if (!img) return;
    const original = img.dataset.srcOriginal || img.src;
    if (!img.dataset.proxied && original && (original.includes('img.olx.com.br') || original.includes('olx.com.br'))) {
      img.dataset.proxied = 'true';
      img.src = '/api/image-proxy?url=' + encodeURIComponent(original);
    } else {
      img.onerror = null;
      img.src = FALLBACK_AD_IMG;
    }
  };

  // Helpers de Requisição com Headers de Segurança
  async function apiFetch(endpoint, options = {}) {
    options.headers = options.headers || {};
    if (state.currentLead && state.currentLead.vulgo) {
      options.headers['X-Lead-Vulgo'] = state.currentLead.vulgo;
    }
    const res = await fetch(endpoint, options);
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      CyberShield.showToast(data.detail || "Acesso Bloqueado pelo Supremo.", "error");
      throw new Error(data.detail || "Bloqueado");
    }
    return res;
  }

  // Inicialização do Sistema
  async function init() {
    setupEventListeners();
    renderAvatarPresets();
    await loadConfig();

    if (!state.currentLead) {
      openProfileModal(true);
    } else {
      updateLeadHeaderDisplay();
      // Executa busca inicial real
      runSearch("iphone", state.selectedState, state.selectedCategory, null, null, state.selectedSort);
    }
  }

  // Lista nativa embutida para inicialização instantânea e à prova de falhas
  const DEFAULT_STATES = [
    { uf: "BR", name: "Brasil (Todo o País)" },
    { uf: "SP", name: "São Paulo" },
    { uf: "RJ", name: "Rio de Janeiro" },
    { uf: "MG", name: "Minas Gerais" },
    { uf: "PR", name: "Paraná" },
    { uf: "RS", name: "Rio de Grande do Sul" },
    { uf: "SC", name: "Santa Catarina" },
    { uf: "BA", name: "Bahia" },
    { uf: "PE", name: "Pernambuco" },
    { uf: "CE", name: "Ceará" },
    { uf: "DF", name: "Distrito Federal" },
    { uf: "GO", name: "Goiás" },
    { uf: "ES", name: "Espírito Santo" },
    { uf: "PA", name: "Pará" },
    { uf: "AM", name: "Amazonas" },
    { uf: "MT", name: "Mato Grosso" },
    { uf: "MS", name: "Mato Grosso do Sul" }
  ];

  const DEFAULT_CATEGORIES = [
    { id: "todas", name: "Todas as Categorias" },
    { id: "autos-e-pecas", name: "Autos e Peças" },
    { id: "carros", name: "Carros, Vans e Utilitários" },
    { id: "motos", name: "Motos" },
    { id: "imoveis", name: "Imóveis" },
    { id: "celulares", name: "Celulares e Telefonia" },
    { id: "computadores", name: "Computadores e Informática" },
    { id: "eletronicos", name: "Eletrônicos, Áudio e Vídeo" },
    { id: "casa", name: "Para a sua Casa" },
    { id: "moda", name: "Moda e Beleza" },
    { id: "musica", name: "Música e Hobbies" },
    { id: "servicos", name: "Serviços" }
  ];

  // Carrega Estados e Categorias da API e inicializa os Dropdowns Customizados
  async function loadConfig() {
    // 1. Inicialização síncrona imediata com dados default para nunca ficar em branco
    renderDropdowns(DEFAULT_STATES, DEFAULT_CATEGORIES);

    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        if (data.states && data.states.length) {
          state.states = data.states;
          state.categories = data.categories;
          renderDropdowns(state.states, state.categories);
        }
      }
    } catch (e) {
      console.warn("Usando configurações embutidas offline para estados/categorias:", e);
    }
  }

  function renderDropdowns(statesList, categoriesList) {
    state.states = statesList;
    state.categories = categoriesList;

    // 1. Inicializa Dropdown de Estados (UF)
    const stateItems = statesList.map(s => ({
      value: s.uf,
      label: s.uf === "BR" ? "Brasil (Todo o País)" : `${s.name} (${s.uf})`,
      badge: s.uf
    }));

    state.dropdowns.state = CyberDropdown.create("#dropdown-state-container", {
      placeholder: "Selecione o Estado",
      items: stateItems,
      selectedValue: state.selectedState || "BR",
      hasSearch: true,
      searchPlaceholder: "Buscar Estado por nome ou UF...",
      onChange: (val) => {
        state.selectedState = val;
      }
    });

    // 2. Inicializa Dropdown de Categorias
    const catItems = categoriesList.map(c => ({
      value: c.id,
      label: c.name,
      badge: ""
    }));

    state.dropdowns.category = CyberDropdown.create("#dropdown-category-container", {
      placeholder: "Selecione a Categoria",
      items: catItems,
      selectedValue: state.selectedCategory || "todas",
      hasSearch: true,
      searchPlaceholder: "Filtrar categorias...",
      onChange: (val) => {
        state.selectedCategory = val;
      }
    });

    // 3. Inicializa Dropdown de Ordenação
    const sortItems = [
      { value: "recent", label: "⏱️ Mais Recentes (Novos Primeiro)" },
      { value: "relevance", label: "Mais Relevantes" },
      { value: "cheapest", label: "💰 Menor Preço" },
      { value: "expensive", label: "💎 Maior Preço" }
    ];

    state.dropdowns.sort = CyberDropdown.create("#dropdown-sort-container", {
      placeholder: "Ordenar por...",
      items: sortItems,
      selectedValue: state.selectedSort || "recent",
      hasSearch: false,
      onChange: (val) => {
        state.selectedSort = val;
      }
    });
  }

  // Renderiza opções de avatar no modal de perfil usando a biblioteca vetorial
  function renderAvatarPresets() {
    const container = document.getElementById('avatar-preset-container');
    if (!container || !window.CyberAvatars) return;

    container.innerHTML = '';
    const list = window.CyberAvatars.list;

    list.forEach((item, idx) => {
      const img = document.createElement('img');
      img.src = item.svg;
      img.className = `avatar-preset-item ${idx === 0 ? 'selected' : ''}`;
      img.setAttribute('data-idx', idx);
      img.alt = item.name;
      img.title = item.name;

      img.addEventListener('click', () => {
        container.querySelectorAll('.avatar-preset-item').forEach(i => i.classList.remove('selected'));
        img.classList.add('selected');
        selectedAvatar = item.svg;
        const preview = document.getElementById('profile-avatar-preview');
        if (preview) preview.src = selectedAvatar;
        CyberShield.playSound('click');
      });

      container.appendChild(img);
    });
  }

  // Atualiza exibição do lead logado no cabeçalho
  function updateLeadHeaderDisplay() {
    if (!state.currentLead) return;
    const imgEl = document.getElementById('header-lead-avatar');
    const nameEl = document.getElementById('header-lead-vulgo');
    if (imgEl) imgEl.src = state.currentLead.avatar || defaultAvatar;
    if (nameEl) nameEl.textContent = state.currentLead.vulgo;

    // Atualiza tab de perfil também
    const myVulgo = document.getElementById('my-profile-vulgo');
    const myAvatar = document.getElementById('my-profile-avatar');
    if (myVulgo) myVulgo.textContent = state.currentLead.vulgo;
    if (myAvatar) myAvatar.src = state.currentLead.avatar || defaultAvatar;
  }

  // Execução de Busca Real na OLX Brasil
  async function runSearch(keyword, uf, category, minPrice, maxPrice, sortBy, pages, fetchFullDescriptions, onlyNewSellers, maxSellerAds180d) {
    if (!state.currentLead) {
      openProfileModal(true);
      return;
    }

    const pagesNum = Math.max(1, Math.min(30, parseInt(pages) || 1));
    let loadingMsg = "CONSULTANDO ANÚNCIOS REAIS OLX...";
    if (pagesNum > 1 && fetchFullDescriptions) {
      loadingMsg = `EXTRAINDO ${pagesNum} PÁGINAS & ENRIQUECENDO LEADS...`;
    } else if (pagesNum > 1) {
      loadingMsg = `VARRENDO ${pagesNum} PÁGINAS DA OLX...`;
    } else if (fetchFullDescriptions) {
      loadingMsg = "BUSCANDO DESCRIÇÕES COMPLETAS & CONTATOS...";
    } else if (onlyNewSellers) {
      loadingMsg = "FILTRANDO APENAS VENDEDORES NOVOS (0 VENDAS)...";
    }

    Scanner3D.show(loadingMsg);
    CyberShield.playSound('click');

    try {
      const res = await apiFetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword || "",
          state_uf: uf || state.selectedState || "BR",
          category_id: category || state.selectedCategory || "todas",
          min_price: minPrice ? parseFloat(minPrice) : null,
          max_price: maxPrice ? parseFloat(maxPrice) : null,
          sort_by: sortBy || state.selectedSort || "relevance",
          pages: pagesNum,
          fetch_full_descriptions: !!fetchFullDescriptions,
          only_new_sellers: !!onlyNewSellers,
          max_seller_ads_180d: parseInt(maxSellerAds180d) || 3
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Falha na busca.");
      }

      const data = await res.json();
      Scanner3D.hide();
      CyberShield.showToast(`Puxada concluída! ${data.total_found} anúncios reais encontrados.`, "success");

      // Guarda os anúncios reais no estado para filtragem e ordenação instantâneas
      state.rawAds = data.ads || [];
      state.quickFilterText = '';
      state.quickFilterChip = 'all';
      state.quickSort = 'default';

      // Atualiza HUD de Métricas
      renderHUD(data.stats, data.total_found);

      // Atualiza Gráfico de Preços
      renderPriceChart(data.stats.distribution);

      // Exibe e atualiza a Barra de Controle & Filtros Rápidos
      setupQuickControlBar(state.rawAds);

      // Aplica filtros e renderiza o Grid
      applyQuickFilters();

    } catch (e) {
      Scanner3D.hide();
      CyberShield.showToast(e.message || "Erro ao consultar OLX Brasil.", "error");
    }
  }

  // Renderiza HUD de Métricas (Preço Médio, Menor, Maior, Total)
  function renderHUD(stats, totalFound) {
    const fmt = (v) => v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00';

    const avgEl = document.getElementById('hud-avg-price');
    const minEl = document.getElementById('hud-min-price');
    const maxEl = document.getElementById('hud-max-price');
    const totalEl = document.getElementById('hud-total-ads');

    if (avgEl) avgEl.textContent = fmt(stats.average);
    if (minEl) minEl.textContent = fmt(stats.min);
    if (maxEl) maxEl.textContent = fmt(stats.max);
    if (totalEl) totalEl.textContent = totalFound;
  }

  // Gráfico de Distribuição com Chart.js em Tema Monochrome
  function renderPriceChart(distribution) {
    const ctx = document.getElementById('price-dist-chart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (state.chartInstance) {
      state.chartInstance.destroy();
    }

    const labels = (distribution || []).map(d => d.range);
    const dataVals = (distribution || []).map(d => d.count);

    state.chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Anúncios na Faixa',
          data: dataVals,
          backgroundColor: 'rgba(255, 255, 255, 0.75)',
          hoverBackgroundColor: '#ffffff',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0a0c10',
            borderColor: 'rgba(255,255,255,0.2)',
            borderWidth: 1,
            titleColor: '#fff',
            bodyColor: '#cbd5e1',
            padding: 10,
            displayColors: false
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 11 }, precision: 0 }
          }
        }
      }
    });
  }

  // Configura a Barra de Controle & Filtros Rápidos
  function setupQuickControlBar(ads) {
    const bar = document.getElementById('ads-quick-control-bar');
    if (!bar) return;

    if (!ads || ads.length === 0) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'block';

    // Atualiza os contadores dos chips
    const countAll = ads.length;
    const countWpp = ads.filter(a => a.contact && a.contact.has_phone).length;
    const countOpp = ads.filter(a => a.price_tier === 'oportunidade' || a.price_tier === 'alerta_baixo').length;
    const countPay = ads.filter(a => a.has_olx_pay).length;
    const countSeller = ads.filter(a => (a.seller_score && parseFloat(a.seller_score) >= 4.8) || (a.seller_name && !a.seller_name.includes('Particular'))).length;

    const elAll = document.getElementById('count-chip-all');
    const elWpp = document.getElementById('count-chip-wpp');
    const elOpp = document.getElementById('count-chip-opp');
    const elPay = document.getElementById('count-chip-pay');
    const elSeller = document.getElementById('count-chip-seller');

    if (elAll) elAll.textContent = countAll;
    if (elWpp) elWpp.textContent = countWpp;
    if (elOpp) elOpp.textContent = countOpp;
    if (elPay) elPay.textContent = countPay;
    if (elSeller) elSeller.textContent = countSeller;

    // Reseta campo de texto e select
    const quickInput = document.getElementById('quick-filter-input');
    const clearBtn = document.getElementById('quick-filter-clear-btn');
    const sortSelect = document.getElementById('quick-sort-select');

    if (quickInput) quickInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (sortSelect) sortSelect.value = 'default';

    // Reseta chip ativo para "all"
    document.querySelectorAll('.quick-chip-btn').forEach(b => {
      if (b.getAttribute('data-filter') === 'all') {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  // Aplica os filtros em memória sobre state.rawAds (Instantâneo, Zero Latência)
  function applyQuickFilters() {
    let result = [...state.rawAds];

    // 1. Filtro por chip
    if (state.quickFilterChip === 'wpp') {
      result = result.filter(a => a.contact && a.contact.has_phone);
    } else if (state.quickFilterChip === 'opportunity') {
      result = result.filter(a => a.price_tier === 'oportunidade' || a.price_tier === 'alerta_baixo');
    } else if (state.quickFilterChip === 'olxpay') {
      result = result.filter(a => a.has_olx_pay);
    } else if (state.quickFilterChip === 'top-seller') {
      result = result.filter(a => (a.seller_score && parseFloat(a.seller_score) >= 4.8) || (a.seller_name && !a.seller_name.includes('Particular')));
    }

    // 2. Filtro textual
    if (state.quickFilterText && state.quickFilterText.trim()) {
      const q = state.quickFilterText.toLowerCase().trim();
      result = result.filter(a => {
        const titleMatch = (a.title || '').toLowerCase().includes(q);
        const locMatch = (a.location || '').toLowerCase().includes(q);
        const sellerMatch = (a.seller_name || '').toLowerCase().includes(q);
        const descMatch = (a.description || '').toLowerCase().includes(q);
        return titleMatch || locMatch || sellerMatch || descMatch;
      });
    }

    // 3. Ordenação
    if (state.quickSort === 'cheapest') {
      result.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (state.quickSort === 'expensive') {
      result.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (state.quickSort === 'discount') {
      result.sort((a, b) => (a.diff_pct || 0) - (b.diff_pct || 0));
    } else if (state.quickSort === 'recent') {
      result.sort((a, b) => {
        const ta = a.date_timestamp || 0;
        const tb = b.date_timestamp || 0;
        if (ta && tb && ta !== tb) return tb - ta;
        const da = (a.date || '').toLowerCase();
        const db = (b.date || '').toLowerCase();
        if (da.includes('hoje') && !db.includes('hoje')) return -1;
        if (!da.includes('hoje') && db.includes('hoje')) return 1;
        return 0;
      });
    }

    state.currentFilteredAds = result;

    // Atualiza indicador de contagem
    const indicator = document.getElementById('quick-count-indicator');
    if (indicator) {
      indicator.textContent = `Exibindo ${result.length} de ${state.rawAds.length} anúncios`;
    }

    renderAdsGrid(result);
  }

  // Renderiza Grid de Anúncios Reais Bem Estruturado & Blindado
  function renderAdsGrid(ads) {
    const container = document.getElementById('ads-container');
    if (!container) return;

    if (!ads || ads.length === 0) {
      container.innerHTML = `
        <div class="empty-results-box">
          <div class="empty-results-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
          <p class="empty-results-title">Nenhum anúncio localizado para esses filtros.</p>
          <p class="empty-results-desc">Tente alterar o termo no filtro rápido ou selecione o chip "Todos".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = ads.map(a => {
      const priceFmt = a.price ? `R$ ${a.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sob Consulta';
      const tierClass = `tag-${a.price_tier || 'medio'}`;

      // Badges
      const badgesHtml = (a.badges || []).slice(0, 3).map(b => `<span class="ad-pill-badge">${b}</span>`).join('');

      return `
        <div class="ad-3d-card" data-url="${a.url}" data-id="${a.id || ''}">
          <div class="ad-card-media">
            <img src="${a.image || FALLBACK_AD_IMG}" data-src-original="${a.image || ''}" alt="${a.title}" class="ad-card-img" loading="lazy" referrerpolicy="no-referrer" onerror="handleAdImgError(this)">
            <span class="ad-price-tier-tag ${tierClass}">
              ${a.price_tier === 'oportunidade' ? '💎 ' : a.price_tier === 'alerta_baixo' ? '⚠️ ' : ''}${a.price_badge || 'Preço Normal'}
            </span>
            ${a.has_olx_pay ? `<span class="ad-card-olxpay-badge" title="Pagamento Seguro com Garantia OLX">🛡️ OLX PAY</span>` : ''}
          </div>
          <div class="ad-card-body">
            <div class="ad-card-top-row">
              <span class="ad-card-id-code">ID: ${a.id || 'OLX'}</span>
              ${a.diff_label ? `<span class="ad-card-diff-tag">${a.diff_label}</span>` : ''}
            </div>

            <div class="ad-badges-row">${badgesHtml}</div>
            
            <h3 class="ad-card-title" title="${a.title}">
              <a href="${a.url}" target="_blank" rel="noopener noreferrer" class="ad-card-title-link">${a.title}</a>
            </h3>

            <div class="ad-price-section">
              <div class="ad-price-display">${priceFmt}</div>
              ${a.installments ? `<div class="ad-installment-info"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg> ${a.installments}</div>` : ''}
            </div>

            ${a.description ? `
              <div class="ad-card-description-box">
                <p class="ad-card-description-text">${a.description}</p>
              </div>
            ` : ''}

            <div class="ad-meta-info">
              <div class="ad-meta-row" title="Localização do anúncio">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                <span class="truncate">${a.location}</span>
              </div>
              <div class="ad-meta-row" title="Data da publicação">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>${a.date}</span>
              </div>
              <div class="ad-meta-row ad-seller-badge-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                <span>Vendedor: <strong class="text-white">${a.seller_name || 'Vendedor Particular'}</strong> <span class="seller-rating-pill">${a.seller_score || '5.0 ★'}</span></span>
                ${a.is_new_seller ? `<span class="seller-newbie-pill" title="Conta sem histórico de vendas anteriores na OLX">🌱 0 VENDAS</span>` : ''}
              </div>
            </div>

            <div class="ad-actions-row">
              <button class="ad-btn-validate" data-validate-url="${a.url}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                Auditar Anúncio
              </button>
              <a href="${a.url}" target="_blank" rel="noopener noreferrer" class="ad-btn-external" title="Abrir anúncio original na OLX Brasil">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </div>
            ${a.contact && a.contact.has_phone ? `
              <a href="${a.contact.whatsapp_url}" target="_blank" rel="noopener noreferrer" class="ad-btn-wpp" title="Negociar direto pelo WhatsApp oficial">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.087-.177.181-.076.355.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.174.086.275.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.073.043.419-.101.824z"/></svg>
                WhatsApp: ${a.contact.phone_formatted}
              </a>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Listener para botões de "Auditar Anúncio"
    container.querySelectorAll('.ad-btn-validate').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = btn.getAttribute('data-validate-url');
        switchTab('validador');
        const urlInput = document.getElementById('validator-url-input');
        if (urlInput) urlInput.value = url;
        runAdValidation(url);
      });
    });
  }

  // Validador de Anúncio Individual
  async function runAdValidation(adUrl) {
    if (!adUrl) return;

    Scanner3D.show("AUDITANDO ANÚNCIO OLX BRASIL...");
    CyberShield.playSound('click');

    try {
      const res = await apiFetch('/api/validate-ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_url: adUrl })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Falha na auditoria.");
      }

      const data = await res.json();
      Scanner3D.hide();
      CyberShield.showToast("Análise de autenticidade concluída com sucesso!", "success");

      renderValidationReport(data.report);

    } catch (e) {
      Scanner3D.hide();
      CyberShield.showToast(e.message || "Erro ao validar anúncio.", "error");
    }
  }

  // Renderiza Relatório do Validador de Anúncio
  function renderValidationReport(rep) {
    const card = document.getElementById('validator-result-card');
    if (!card) return;
    card.style.display = 'block';

    const scoreNum = document.getElementById('report-score-num');
    const verdictTag = document.getElementById('report-verdict-tag');
    const titleEl = document.getElementById('report-title');
    const priceEl = document.getElementById('report-price');
    const locEl = document.getElementById('report-location');
    const descEl = document.getElementById('report-desc');
    const redFlagsList = document.getElementById('report-red-flags');
    const posFlagsList = document.getElementById('report-pos-flags');
    const galleryContainer = document.getElementById('report-gallery');

    if (scoreNum) {
      scoreNum.textContent = rep.risk_score;
      scoreNum.className = `score-number ${rep.verdict_color}`;
    }

    if (verdictTag) {
      verdictTag.textContent = rep.verdict;
      verdictTag.className = `verdict-tag ${rep.verdict_color}`;
    }

    if (titleEl) titleEl.textContent = rep.title;
    if (priceEl) priceEl.textContent = rep.price_formatted;
    if (locEl) locEl.textContent = rep.location;
    if (descEl) descEl.textContent = rep.description;

    if (redFlagsList) {
      if (rep.red_flags.length === 0) {
        redFlagsList.innerHTML = `<div class="flag-item text-status-green">✓ Nenhuma anomalia crítica detectada.</div>`;
      } else {
        redFlagsList.innerHTML = rep.red_flags.map(f => `
          <div class="flag-item">
            <span class="flag-bullet-red">✕</span>
            <span>${f}</span>
          </div>
        `).join('');
      }
    }

    if (posFlagsList) {
      posFlagsList.innerHTML = rep.positive_flags.map(f => `
        <div class="flag-item">
          <span class="flag-bullet-green">✓</span>
          <span>${f}</span>
        </div>
      `).join('');
    }

    if (galleryContainer) {
      if (rep.images && rep.images.length > 0) {
        galleryContainer.innerHTML = rep.images.map(img => `
          <img src="${img}" data-src-original="${img}" class="validator-gallery-img" alt="Foto Real Anúncio" loading="lazy" referrerpolicy="no-referrer"
               onerror="handleAdImgError(this)"
               onclick="window.open('${img}', '_blank')">
        `).join('');
      } else {
        galleryContainer.innerHTML = `<span class="text-muted">Nenhuma imagem adicional extraída.</span>`;
      }
    }

    // Renderização dos Dados Reais do Vendedor / Anunciante OLX
    const seller = rep.seller_info || {};
    const sellerCardName = document.getElementById('seller-card-name');
    const sellerProTag = document.getElementById('seller-pro-tag');
    const sellerSubmeta = document.getElementById('seller-card-submeta');
    const sellerCompletedSales = document.getElementById('seller-completed-sales');
    const sellerCancelledSales = document.getElementById('seller-cancelled-sales');
    const sellerVerifications = document.getElementById('seller-verifications');

    if (sellerCardName) sellerCardName.textContent = seller.name || 'Anunciante OLX';
    if (sellerProTag) {
      if (seller.is_pro) {
        sellerProTag.classList.remove('d-none');
      } else {
        sellerProTag.classList.add('d-none');
      }
    }
    if (sellerSubmeta) {
      let submeta = rep.location || 'Brasil';
      if (seller.ddd) submeta += ` • DDD (${seller.ddd})`;
      sellerSubmeta.textContent = submeta;
    }
    if (sellerCompletedSales) sellerCompletedSales.textContent = seller.completed_sales || '0';
    if (sellerCancelledSales) sellerCancelledSales.textContent = seller.cancelled_sales || '0';
    if (sellerVerifications) {
      if (seller.verified_items && seller.verified_items.length > 0) {
        sellerVerifications.textContent = seller.verified_items.join(' • ');
      } else {
        sellerVerifications.textContent = 'Conta Verificada pela Plataforma';
      }
    }

    // Renderização da Inteligência Neural do Lead & Google Gemini IA
    const aiSection = document.getElementById('report-ai-intelligence-section');
    if (aiSection) {
      const intel = rep.lead_intel;
      const gemini = rep.gemini_diagnosis;

      if (intel || gemini) {
        aiSection.classList.remove('d-none');
        
        let html = `
          <div class="ai-intel-header-row">
            <div class="ai-intel-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              <span>INTELIGÊNCIA NEURAL DO LEAD & MERCADO</span>
            </div>
            <span class="ai-gemini-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              GEMINI IA ACTIVE
            </span>
          </div>
        `;

        if (intel) {
          html += `
            <div class="lead-temp-box">
              <div>
                <span class="lead-temp-score-tag ${intel.lead_badge_class || 'lead-regular'}">${intel.lead_category || 'LEAD REGULAR'}</span>
              </div>
              <div class="text-sm">
                <strong>Temperatura do Lead:</strong> Score ${intel.lead_score || 50}/100 • <span>${intel.price_verdict || 'Análise de Preço'}</span>
              </div>
            </div>
          `;

          if (intel.contact && intel.contact.has_phone) {
            html += `
              <a href="${intel.contact.whatsapp_url}" target="_blank" rel="noopener noreferrer" class="direct-wpp-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.087-.177.181-.076.355.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.174.086.275.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.073.043.419-.101.824z"/></svg>
                Chamar Vendedor no WhatsApp (${intel.contact.phone_formatted})
              </a>
            `;
          }

          if (intel.negotiation_script) {
            html += `
              <div class="negotiation-script-card">
                <div class="script-header-row">
                  <span class="script-label">Script de Negociação Pronto (WhatsApp / Chat)</span>
                  <button type="button" class="copy-script-btn" id="btn-copy-script">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copiar Script
                  </button>
                </div>
                <div class="script-text-box" id="script-text-content">${intel.negotiation_script}</div>
                <div class="tactical-tip-box">
                  <strong>💡 Dica Tática de Abordagem:</strong> ${intel.tactical_tip || ''}
                </div>
              </div>
            `;
          }
        }

        if (gemini) {
          html += `
            <div class="ai-gemini-card">
              <div class="ai-gemini-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                <span>Diagnóstico Executivo Gemini IA</span>
              </div>
              <div class="ai-gemini-content">${gemini}</div>
            </div>
          `;
        }

        aiSection.innerHTML = html;

        // Listener para copiar script
        const copyBtn = document.getElementById('btn-copy-script');
        if (copyBtn) {
          copyBtn.addEventListener('click', () => {
            const scriptText = document.getElementById('script-text-content')?.textContent || '';
            if (scriptText) {
              navigator.clipboard.writeText(scriptText).then(() => {
                CyberShield.playSound('click');
                CyberShield.showToast("Script de negociação copiado!", "success");
              });
            }
          });
        }
      } else {
        aiSection.classList.add('d-none');
        aiSection.innerHTML = '';
      }
    }

    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Troca de Tabs Principais
  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.nav-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tabId}`);
    });

    if (tabId === 'perfil') {
      loadMyHistory();
    } else if (tabId === 'admin') {
      if (!state.adminToken) {
        openAdminAuthModal();
      } else {
        loadAdminData();
      }
    }

    CyberShield.playSound('click');
  }

  // Carrega histórico pessoal do lead
  async function loadMyHistory() {
    try {
      const res = await apiFetch('/api/lead/my-history');
      const data = await res.json();
      const container = document.getElementById('my-history-list');
      if (!container) return;

      if (!data.history || data.history.length === 0) {
        container.innerHTML = `<p class="text-center-muted">Você ainda não realizou consultas registradas.</p>`;
        return;
      }

      container.innerHTML = `
        <table class="cyber-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Termo / Anúncio</th>
              <th>UF</th>
              <th>Preço Médio</th>
              <th>Data & Hora</th>
            </tr>
          </thead>
          <tbody>
            ${data.history.map(h => `
              <tr>
                <td><span class="table-status-pill pill-active">${h.tipo.toUpperCase()}</span></td>
                <td><strong>${h.termo || h.ad_title || h.ad_url || '-'}</strong></td>
                <td>${h.uf || 'BR'}</td>
                <td>R$ ${(h.preco_medio || h.ad_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>${h.timestamp}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      console.error(e);
    }
  }

  // Modal de Criação / Edição de Perfil do Lead
  function openProfileModal(isInitial = false) {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    modal.classList.add('active');

    const vulgoInput = document.getElementById('profile-vulgo-input');
    const preview = document.getElementById('profile-avatar-preview');

    if (state.currentLead) {
      if (vulgoInput) vulgoInput.value = state.currentLead.vulgo;
      if (preview) preview.src = state.currentLead.avatar || defaultAvatar;
      selectedAvatar = state.currentLead.avatar || defaultAvatar;
    } else {
      if (vulgoInput) vulgoInput.value = '';
      if (preview) preview.src = selectedAvatar || defaultAvatar;
    }
  }

  function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.remove('active');
  }

  // Salvar Perfil do Lead (Vulgo + Avatar da máquina ou preset)
  async function saveLeadProfile() {
    const vulgoInput = document.getElementById('profile-vulgo-input');
    const vulgo = vulgoInput ? vulgoInput.value.trim() : '';

    if (!vulgo || vulgo.length < 2) {
      CyberShield.showToast("Informe um vulgo com no mínimo 2 caracteres.", "error");
      return;
    }

    try {
      const res = await fetch('/api/auth/register-or-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vulgo: vulgo,
          avatar: selectedAvatar || defaultAvatar
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Erro ao salvar perfil.");
      }

      const data = await res.json();
      state.currentLead = data.lead;
      localStorage.setItem('olx_lead_profile', JSON.stringify(data.lead));

      updateLeadHeaderDisplay();
      closeProfileModal();
      CyberShield.showToast(`Perfil sincronizado! Bem-vindo, ${vulgo}.`, "success");

    } catch (e) {
      CyberShield.showToast(e.message, "error");
    }
  }

  // Upload do Avatar da Máquina do Lead via FileReader (Base64)
  function handleMachineAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      CyberShield.showToast("Por favor, selecione um arquivo de imagem válido.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
      selectedAvatar = evt.target.result;
      const preview = document.getElementById('profile-avatar-preview');
      if (preview) preview.src = selectedAvatar;

      // Desmarca os presets
      document.querySelectorAll('.avatar-preset-item').forEach(i => i.classList.remove('selected'));
      CyberShield.showToast("Avatar anexado da sua máquina com sucesso!", "success");
    };
    reader.readAsDataURL(file);
  }

  // Autenticação do Admin Supremo
  function openAdminAuthModal() {
    const modal = document.getElementById('admin-auth-modal');
    if (modal) modal.classList.add('active');
  }

  function closeAdminAuthModal() {
    const modal = document.getElementById('admin-auth-modal');
    if (modal) modal.classList.remove('active');
  }

  async function submitAdminAuth() {
    const keyInput = document.getElementById('admin-passkey-input');
    const key = keyInput ? keyInput.value.trim() : '';

    if (!key) return;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey: key })
      });

      if (!res.ok) {
        throw new Error("Chave Inválida.");
      }

      const data = await res.json();
      state.adminToken = data.admin_token;
      sessionStorage.setItem('olx_admin_token', data.admin_token);
      closeAdminAuthModal();
      CyberShield.showToast("Acesso ao Painel Admin Supremo Concedido!", "success");
      loadAdminData();

    } catch (e) {
      CyberShield.showToast("Chave Suprema Incorreta. Tentativa registrada.", "error");
    }
  }

  // Carrega Dados do Painel Admin Supremo
  async function loadAdminData() {
    try {
      // 1. Overview & Métricas
      const ovRes = await fetch('/api/admin/overview');
      const ovData = await ovRes.json();
      renderAdminOverview(ovData);

      // 2. Leads Sincronizados
      const leadsRes = await fetch('/api/admin/leads');
      const leadsData = await leadsRes.json();
      renderAdminLeads(leadsData.leads || []);

      // 3. Histórico Global de Puxadas
      const histRes = await fetch('/api/admin/history');
      const histData = await histRes.json();
      renderAdminHistory(histData.history || []);

      // 4. IPs Bloqueados na Blindagem
      const ipsRes = await fetch('/api/admin/security/ips');
      const ipsData = await ipsRes.json();
      renderAdminSecurity(ipsData.blocked_ips || []);

      // 5. Pool de Tokens API (ScraperAPI)
      const tokensRes = await fetch('/api/admin/tokens');
      const tokensData = await tokensRes.json();
      renderAdminTokens(tokensData.tokens || []);

    } catch (e) {
      console.error(e);
    }
  }

  function renderAdminOverview(data) {
    const m = data.metrics || {};
    const f = data.filter_stats || {};

    const elLeads = document.getElementById('admin-metric-leads');
    const elPuxadas = document.getElementById('admin-metric-puxadas');
    const elBlocked = document.getElementById('admin-metric-blocked');
    const elShieldIps = document.getElementById('admin-metric-ips');

    if (elLeads) elLeads.textContent = m.total_leads || 0;
    if (elPuxadas) elPuxadas.textContent = m.total_puxadas || 0;
    if (elBlocked) elBlocked.textContent = m.blocked_leads || 0;
    if (elShieldIps) elShieldIps.textContent = m.total_blocked_ips || 0;

    // Estatísticas de Filtros (Top UFs e Categorias)
    const ufBox = document.getElementById('admin-top-ufs');
    if (ufBox && f.top_ufs) {
      ufBox.innerHTML = f.top_ufs.map(u => `
        <div class="admin-stat-row">
          <span>${u.uf}</span>
          <span class="fw-bold-white">${u.count} puxadas</span>
        </div>
      `).join('');
    }

    const catBox = document.getElementById('admin-top-cats');
    if (catBox && f.top_categories) {
      catBox.innerHTML = f.top_categories.map(c => `
        <div class="admin-stat-row">
          <span>${c.categoria}</span>
          <span class="fw-bold-white">${c.count} consultas</span>
        </div>
      `).join('');
    }
  }

  // Tabela Viva de Leads Sincronizados
  function renderAdminLeads(leads) {
    const tbody = document.getElementById('admin-leads-tbody');
    if (!tbody) return;

    if (leads.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-table-cell">Nenhum lead cadastrado ainda.</td></tr>`;
      return;
    }

    tbody.innerHTML = leads.map(l => {
      const isBlocked = l.status === 'blocked';
      return `
        <tr>
          <td>
            <div class="table-user-cell">
              <div class="avatar-frame">
                <img src="${l.avatar || defaultAvatar}" alt="${l.vulgo}">
              </div>
              <span class="table-vulgo">${l.vulgo}</span>
            </div>
          </td>
          <td>${l.created_at}</td>
          <td>${l.last_login}</td>
          <td>${l.ip_address || '127.0.0.1'}</td>
          <td><strong class="text-white">${l.total_queries}</strong></td>
          <td>
            <span class="table-status-pill ${isBlocked ? 'pill-blocked' : 'pill-active'}">
              ${isBlocked ? 'BLOQUEADO' : 'ATIVO'}
            </span>
          </td>
          <td>
            <div class="table-actions-cell">
              <button class="btn-table-action ${isBlocked ? 'btn-unblock' : 'btn-block-toggle'}" 
                      onclick="window.toggleLeadStatus(${l.id})">
                ${isBlocked ? 'Desbloquear' : 'Bloquear'}
              </button>
              <button class="btn-table-action btn-table-delete" 
                      onclick="window.deleteLeadItem(${l.id})">
                Excluir
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Tabela de Histórico Global de Puxadas
  function renderAdminHistory(history) {
    const tbody = document.getElementById('admin-history-tbody');
    if (!tbody) return;

    if (history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-table-cell">Nenhuma puxada registrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = history.map(h => `
      <tr>
        <td><strong>${h.vulgo}</strong></td>
        <td><span class="table-status-pill pill-active">${h.tipo.toUpperCase()}</span></td>
        <td>${h.termo || h.ad_title || h.ad_url || '-'}</td>
        <td>${h.uf || 'BR'} • ${h.categoria || 'todas'}</td>
        <td>R$ ${(h.preco_medio || h.ad_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        <td>${h.timestamp}</td>
      </tr>
    `).join('');
  }

  // Blindagem & IPs
  function renderAdminSecurity(ips) {
    const tbody = document.getElementById('admin-ips-tbody');
    if (!tbody) return;

    if (ips.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-table-cell">Nenhum IP bloqueado no momento.</td></tr>`;
      return;
    }

    tbody.innerHTML = ips.map(ip => `
      <tr>
        <td><strong class="text-status-red">${ip.ip}</strong></td>
        <td>${ip.reason}</td>
        <td>${ip.blocked_at}</td>
        <td>
          <button class="btn-table-action btn-unblock" onclick="window.unblockIpAddress('${ip.ip}')">
            Desbloquear IP
          </button>
        </td>
      </tr>
    `).join('');
  }

  // Funções Globais expostas para as ações da tabela Admin
  window.toggleLeadStatus = async function(leadId) {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/toggle-block`, { method: 'POST' });
      if (res.ok) {
        CyberShield.showToast("Status do Lead atualizado!", "success");
        loadAdminData();
      }
    } catch (e) {
      CyberShield.showToast("Erro ao alterar status.", "error");
    }
  };

  window.deleteLeadItem = async function(leadId) {
    if (!confirm("Deseja realmente remover este lead?")) return;
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, { method: 'DELETE' });
      if (res.ok) {
        CyberShield.showToast("Lead excluído.", "info");
        loadAdminData();
      }
    } catch (e) {
      CyberShield.showToast("Erro ao excluir.", "error");
    }
  };

  window.unblockIpAddress = async function(ip) {
    try {
      const res = await fetch('/api/admin/security/unblock-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: ip })
      });
      if (res.ok) {
        CyberShield.showToast(`IP ${ip} liberado!`, "success");
        loadAdminData();
      }
    } catch (e) {
      CyberShield.showToast("Erro ao liberar IP.", "error");
    }
  };

  // Renderiza Tabela do Pool de Tokens API
  function renderAdminTokens(tokens) {
    const tbody = document.getElementById('admin-tokens-tbody');
    if (!tbody) return;

    if (tokens.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-table-cell">Nenhum token configurado no pool.</td></tr>`;
      return;
    }

    tbody.innerHTML = tokens.map(t => {
      const isExhausted = t.status === 'exhausted';
      const isActive = t.is_active === 1;
      const maskedToken = t.token.length > 10 ? `${t.token.substring(0, 8)}••••••••••••${t.token.substring(t.token.length - 4)}` : t.token;

      let statusBadge = '<span class="table-status-pill pill-active">PRONTO</span>';
      if (!isActive) {
        statusBadge = '<span class="table-status-pill pill-blocked">DESATIVADO</span>';
      } else if (isExhausted) {
        statusBadge = '<span class="table-status-pill pill-blocked">ESGOTADO</span>';
      }

      return `
        <tr>
          <td><code class="font-mono text-white">${maskedToken}</code></td>
          <td><span class="ad-pill-badge">${t.service.toUpperCase()}</span></td>
          <td>${statusBadge}</td>
          <td><strong class="text-white">${t.requests_count}</strong></td>
          <td><span class="${t.errors_count > 0 ? 'text-status-red' : 'text-muted'}">${t.errors_count}</span></td>
          <td>${t.last_used_at || 'Nunca'}</td>
          <td>
            <div class="table-actions-cell">
              <button class="btn-table-action ${isActive ? 'btn-block-toggle' : 'btn-unblock'}" 
                      onclick="window.toggleApiToken(${t.id})">
                ${isActive ? 'Desativar' : 'Ativar'}
              </button>
              <button class="btn-table-action btn-table-delete" 
                      onclick="window.deleteApiToken(${t.id})">
                Remover
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.toggleApiToken = async function(tokenId) {
    try {
      const res = await fetch(`/api/admin/tokens/${tokenId}/toggle`, { method: 'POST' });
      if (res.ok) {
        CyberShield.showToast("Status da chave de API atualizado!", "success");
        loadAdminData();
      }
    } catch (e) {
      CyberShield.showToast("Erro ao alternar chave.", "error");
    }
  };

  window.deleteApiToken = async function(tokenId) {
    if (!confirm("Deseja realmente remover esta chave do pool?")) return;
    try {
      const res = await fetch(`/api/admin/tokens/${tokenId}`, { method: 'DELETE' });
      if (res.ok) {
        CyberShield.showToast("Chave removida do pool.", "info");
        loadAdminData();
      }
    } catch (e) {
      CyberShield.showToast("Erro ao remover chave.", "error");
    }
  };

  // Setup dos Listeners de Eventos
  function setupEventListeners() {
    // Abas de Navegação Principal
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab);
      });
    });

    // Subtabs do Admin
    document.querySelectorAll('.admin-subnav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-subnav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sub = btn.getAttribute('data-sub');
        document.querySelectorAll('.admin-subtab-pane').forEach(p => {
          p.style.display = p.id === `admin-sub-${sub}` ? 'block' : 'none';
        });
        CyberShield.playSound('click');
      });
    });

    // Formulário de Busca Principal
    const searchBtn = document.getElementById('search-submit-btn');
    const searchInput = document.getElementById('search-keyword');
    const minPriceInput = document.getElementById('search-min-price');
    const maxPriceInput = document.getElementById('search-max-price');
    const pagesInput = document.getElementById('search-pages-input');
    const descCheck = document.getElementById('check-fetch-descriptions');
    const newSellersCheck = document.getElementById('check-only-new-sellers');
    const maxAdsInput = document.getElementById('input-max-ads-180d');

    const triggerSearch = () => {
      runSearch(
        searchInput ? searchInput.value : '',
        state.selectedState,
        state.selectedCategory,
        minPriceInput ? minPriceInput.value : '',
        maxPriceInput ? maxPriceInput.value : '',
        state.selectedSort,
        pagesInput ? pagesInput.value : 1,
        descCheck ? descCheck.checked : false,
        newSellersCheck ? newSellersCheck.checked : false,
        maxAdsInput ? maxAdsInput.value : 3
      );
    };

    if (searchBtn) {
      searchBtn.addEventListener('click', triggerSearch);
    }

    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') triggerSearch();
      });
    }

    // Listeners da Barra de Controle & Filtros Rápidos dos Anúncios
    const quickInput = document.getElementById('quick-filter-input');
    const quickClearBtn = document.getElementById('quick-filter-clear-btn');
    const quickSortSelect = document.getElementById('quick-sort-select');

    if (quickInput) {
      quickInput.addEventListener('input', (e) => {
        state.quickFilterText = e.target.value;
        if (quickClearBtn) {
          quickClearBtn.style.display = state.quickFilterText ? 'block' : 'none';
        }
        applyQuickFilters();
      });
    }

    if (quickClearBtn) {
      quickClearBtn.addEventListener('click', () => {
        if (quickInput) quickInput.value = '';
        state.quickFilterText = '';
        quickClearBtn.style.display = 'none';
        applyQuickFilters();
        if (quickInput) quickInput.focus();
      });
    }

    if (quickSortSelect) {
      quickSortSelect.addEventListener('change', (e) => {
        state.quickSort = e.target.value;
        applyQuickFilters();
      });
    }

    document.querySelectorAll('.quick-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.quick-chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.quickFilterChip = btn.getAttribute('data-filter') || 'all';
        CyberShield.playSound('click');
        applyQuickFilters();
      });
    });

    // Formulário do Validador de Anúncio Individual
    const validateBtn = document.getElementById('validator-submit-btn');
    const validateInput = document.getElementById('validator-url-input');

    if (validateBtn) {
      validateBtn.addEventListener('click', () => {
        const url = validateInput.value.trim();
        if (!url) {
          CyberShield.showToast("Cole a URL ou código do anúncio OLX.", "error");
          return;
        }
        runAdValidation(url);
      });
    }

    if (validateInput) {
      validateInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (validateBtn) validateBtn.click();
        }
      });
    }

    // Abertura do Perfil pelo cabeçalho
    const profileBtn = document.getElementById('header-profile-btn');
    if (profileBtn) {
      profileBtn.addEventListener('click', () => openProfileModal(false));
    }

    const saveProfileBtn = document.getElementById('profile-save-btn');
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener('click', saveLeadProfile);
    }

    const closeProfileBtn = document.getElementById('profile-modal-close');
    if (closeProfileBtn) {
      closeProfileBtn.addEventListener('click', closeProfileModal);
    }

    // Upload de Imagem do Avatar da Máquina
    const fileInput = document.getElementById('machine-avatar-file');
    const uploadArea = document.getElementById('machine-avatar-upload-area');

    if (uploadArea && fileInput) {
      uploadArea.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', handleMachineAvatarUpload);
    }

    // Admin Trigger & Auth
    const adminTrigger = document.getElementById('admin-login-trigger');
    if (adminTrigger) {
      adminTrigger.addEventListener('click', () => {
        if (state.adminToken) {
          switchTab('admin');
        } else {
          openAdminAuthModal();
        }
      });
    }

    const adminAuthSubmit = document.getElementById('admin-auth-submit-btn');
    if (adminAuthSubmit) {
      adminAuthSubmit.addEventListener('click', submitAdminAuth);
    }

    const adminAuthClose = document.getElementById('admin-auth-modal-close');
    if (adminAuthClose) {
      adminAuthClose.addEventListener('click', closeAdminAuthModal);
    }

    // Fechamento de modais ao clicar no fundo escuro (overlay)
    document.querySelectorAll('.cyber-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Tecla Escape para fechar qualquer modal ativo
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.cyber-modal-overlay.active').forEach(overlay => {
          overlay.classList.remove('active');
        });
      }
    });

    // Bloqueio manual de IP no admin
    const manualIpBtn = document.getElementById('admin-block-ip-btn');
    const manualIpInput = document.getElementById('admin-manual-ip-input');
    if (manualIpBtn && manualIpInput) {
      manualIpBtn.addEventListener('click', async () => {
        const ip = manualIpInput.value.trim();
        if (!ip) return;
        try {
          const res = await fetch('/api/admin/security/block-ip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: ip, reason: "Bloqueio manual supremo" })
          });
          if (res.ok) {
            CyberShield.showToast(`IP ${ip} bloqueado pela blindagem!`, "success");
            manualIpInput.value = '';
            loadAdminData();
          }
        } catch (e) {
          CyberShield.showToast("Erro ao bloquear IP.", "error");
        }
      });
    }

    // Adicionar chave ScraperAPI ao pool
    const addTokenBtn = document.getElementById('admin-add-token-btn');
    const addTokenInput = document.getElementById('admin-new-token-input');
    if (addTokenBtn && addTokenInput) {
      addTokenBtn.addEventListener('click', async () => {
        const tokenVal = addTokenInput.value.trim();
        if (!tokenVal) {
          CyberShield.showToast("Insira a chave da ScraperAPI.", "error");
          return;
        }
        try {
          const res = await fetch('/api/admin/tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tokenVal, service: 'scraperapi' })
          });
          if (res.ok) {
            CyberShield.showToast("Chave ScraperAPI adicionada ao pool com sucesso!", "success");
            addTokenInput.value = '';
            loadAdminData();
          } else {
            const err = await res.json();
            CyberShield.showToast(err.detail || "Erro ao adicionar token.", "error");
          }
        } catch (e) {
          CyberShield.showToast("Erro ao conectar ao servidor.", "error");
        }
      });
    }
  }

  // Executa inicialização assim que o DOM carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
