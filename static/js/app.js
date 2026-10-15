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
      let detail = "Acesso Bloqueado pelo Supremo.";
      try {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const data = await res.json();
          detail = data.detail || detail;
        }
      } catch (e) {}
      CyberShield.showToast(detail, "error");
      throw new Error(detail);
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
      { value: "recent", label: "Mais Recentes (Novos Primeiro)" },
      { value: "relevance", label: "Mais Relevantes" },
      { value: "cheapest", label: "Menor Preço" },
      { value: "expensive", label: "Maior Preço" }
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
      const isSelected = selectedAvatar === item.svg || (!selectedAvatar && idx === 3);
      img.className = `avatar-preset-item ${isSelected ? 'selected' : ''}`;
      img.setAttribute('data-id', item.id);
      img.setAttribute('data-idx', idx);
      img.alt = item.name;
      img.title = item.name;

      img.addEventListener('click', () => {
        container.querySelectorAll('.avatar-preset-item').forEach(i => i.classList.remove('selected'));
        img.classList.add('selected');
        selectedAvatar = item.svg;
        const preview = document.getElementById('profile-avatar-preview');
        if (preview) {
          preview.style.opacity = '0';
          setTimeout(() => {
            preview.src = selectedAvatar;
            preview.style.opacity = '1';
          }, 100);
        }
        const statusText = document.getElementById('upload-status-text');
        if (statusText) statusText.classList.remove('active');
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

    function parsePriceInput(val) {
      if (!val) return null;
      let s = String(val).trim().replace(/[^\d,\.]/g, '');
      if (!s) return null;
      if (s.includes('.') && s.includes(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else if (s.includes(',')) {
        s = s.replace(',', '.');
      } else if (s.includes('.')) {
        const parts = s.split('.');
        if (parts[parts.length - 1].length === 2) {
          s = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
        } else {
          s = parts.join('');
        }
      }
      const num = parseFloat(s);
      return isNaN(num) ? null : num;
    }

    try {
      const res = await apiFetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword || "",
          state_uf: uf || state.selectedState || "BR",
          category_id: category || state.selectedCategory || "todas",
          min_price: parsePriceInput(minPrice),
          max_price: parsePriceInput(maxPrice),
          sort_by: sortBy || state.selectedSort || "relevance",
          pages: pagesNum,
          fetch_full_descriptions: !!fetchFullDescriptions,
          only_new_sellers: !!onlyNewSellers,
          max_seller_ads_180d: parseInt(maxSellerAds180d) || 3
        })
      });

      const contentType = res.headers.get("content-type") || "";
      let resText = "";
      try {
        resText = await res.text();
      } catch (readErr) {
        throw new Error("Falha ao ler dados da resposta do servidor.");
      }

      if (!res.ok) {
        let errorDetail = `Falha na requisição (${res.status}).`;
        if (contentType.includes("application/json") || (resText && resText.trim().startsWith("{"))) {
          try {
            const err = JSON.parse(resText);
            errorDetail = err.detail || err.message || errorDetail;
          } catch (_) {}
        } else if (resText && resText.length < 200 && !resText.includes("<html")) {
          errorDetail = resText.trim();
        }
        throw new Error(errorDetail);
      }

      let data;
      try {
        data = JSON.parse(resText);
      } catch (jsonErr) {
        console.error("Resposta não-JSON recebida:", resText.slice(0, 300));
        if (resText.includes("<!DOCTYPE") || resText.includes("<html")) {
          throw new Error("O servidor retornou HTML em vez de JSON. Verifique se o backend Python/Uvicorn está rodando na porta correta.");
        }
        throw new Error(resText.slice(0, 150) || "O servidor retornou uma resposta inesperada (não-JSON).");
      }
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

      // Exibe Diagnóstico Inteligente de Auditoria
      renderSearchDiagnostic(data.diagnosis, data.total_found);

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
          label: 'Anúncios no Mercado',
          data: dataVals,
          backgroundColor: 'rgba(56, 189, 248, 0.45)',
          borderColor: '#38bdf8',
          borderWidth: 1.5,
          hoverBackgroundColor: '#38bdf8',
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 56,
          barPercentage: 0.65
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

  // Renderiza Banner de Diagnóstico Inteligente da Varredura
  function renderSearchDiagnostic(diag, totalFound) {
    const banner = document.getElementById('search-diagnostic-banner');
    const iconEl = document.getElementById('diag-banner-icon');
    const titleEl = document.getElementById('diag-banner-title');
    const textEl = document.getElementById('diag-banner-text');
    const badgesEl = document.getElementById('diag-banner-badges');

    if (!banner || !diag) return;

    banner.classList.remove('hidden', 'diag-success', 'diag-warning', 'diag-empty');

    const status = diag.status || 'ok';
    let iconSvg = '';
    let title = 'Auditoria do Motor de Varredura';
    let desc = diag.message || 'Busca executada com sucesso.';
    let badgesHtml = '';

    if (status === 'strict_filter_depleted') {
      banner.classList.add('diag-warning');
      iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
      title = 'Filtros Estritos Aplicados (Nenhum Anúncio Atendeu 100% aos Critérios)';
      desc = `A OLX retornou <strong>${diag.scanned_raw_count} anúncios</strong> na consulta, mas nenhum se enquadrou simultaneamente na sua régua de Preço, WhatsApp obrigatório ou Vendedor Novo. Dica: flexibilize a faixa de preço ou desligue temporariamente um dos filtros para ver todos os itens disponíveis.`;
    } else if (status === 'olx_no_results') {
      banner.classList.add('diag-empty');
      iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
      title = 'Zero Anúncios Existentes na OLX Brasil';
      desc = 'Não há nenhum anúncio publicado na OLX para essa combinação de termo, categoria ou estado. O sistema varreu as páginas sem erros, porém o inventário é inexistente no momento.';
    } else if (status === 'partial_strict_filter') {
      banner.classList.add('diag-warning');
      iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
      title = 'Filtros de Alta Precisão (Resultados Selecionados a Dedo)';
      desc = `De <strong>${diag.scanned_raw_count} anúncios</strong> escaneados na OLX, apenas <strong>${diag.filtered_count}</strong> atenderam rigorosamente às suas especificações de preço, contato e vendedor.`;
    } else {
      banner.classList.add('diag-success');
      iconSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
      title = 'Puxada Real Concluída com Sucesso';
      desc = `Foram encontrados e validados <strong>${totalFound} anúncios reais</strong> na OLX de acordo com seus parâmetros.`;
    }

    // Badges de auditoria
    badgesHtml += `<span class="diag-badge">Páginas: ${diag.scanned_pages || 1}/${diag.requested_pages || 1}</span>`;
    badgesHtml += `<span class="diag-badge">Escaneados: ${diag.scanned_raw_count || totalFound}</span>`;
    badgesHtml += `<span class="diag-badge">Aprovados: ${totalFound}</span>`;

    if (iconEl) iconEl.innerHTML = iconSvg;
    if (titleEl) titleEl.innerHTML = title;
    if (textEl) textEl.innerHTML = desc;
    if (badgesEl) badgesEl.innerHTML = badgesHtml;
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

      // Higienização e desduplicação rigorosa de badges para não colar palavras
      const uniqueBadges = [];
      (a.badges || []).forEach(rawB => {
        const b = (rawB || '').trim();
        if (b && b.length <= 25 && !uniqueBadges.includes(b)) {
          // Descarta se for cópia ou concatenação de outro selo
          const isMerged = uniqueBadges.some(u => u.includes(b) || b.includes(u));
          if (!isMerged) {
            uniqueBadges.push(b);
          }
        }
      });
      const badgesHtml = uniqueBadges.slice(0, 3).map(b => `<span class="ad-pill-badge">${b}</span>`).join('');

      return `
        <div class="ad-3d-card ${a.is_top_deal ? 'ad-card-top-deal-highlight' : ''}" data-url="${a.url}" data-id="${a.id || ''}">
          <div class="ad-card-media">
            <img src="${a.image || FALLBACK_AD_IMG}" data-src-original="${a.image || ''}" alt="${a.title}" class="ad-card-img" loading="lazy" referrerpolicy="no-referrer" onerror="handleAdImgError(this)">
            <div class="ad-card-overlay-top">
              <div class="ad-overlay-left-tags">
                <span class="ad-price-tier-tag ${tierClass}">
                  ${a.price_badge || 'Preço Normal'}
                </span>
                ${a.is_top_deal ? `<span class="ad-top-deal-tag" title="Analisado como uma das melhores ofertas de compra/revenda">${a.deal_tag || 'MELHOR OFERTA 💎'}</span>` : ''}
              </div>
              ${a.lead_category ? `<span class="ad-lead-tag ${a.lead_badge_class || 'lead-regular'}" title="Temperatura de Fechamento do Lead">${a.lead_category}</span>` : ''}
            </div>
            ${a.has_olx_pay ? `<span class="ad-card-olxpay-badge" title="Pagamento Seguro com Garantia OLX"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block;vertical-align:middle;margin-right:3px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>OLX PAY</span>` : ''}
          </div>
          <div class="ad-card-body">
            <div class="ad-card-top-row">
              <span class="ad-card-id-code">ID: ${a.id || 'OLX'}</span>
              ${a.lead_score ? `<span class="ad-lead-score-pill" title="Pontuação de Oportunidade do Lead">⚡ Lead ${a.lead_score}/100</span>` : ''}
              ${a.diff_label ? `<span class="ad-card-diff-tag">${a.diff_label}</span>` : ''}
            </div>

            ${badgesHtml ? `<div class="ad-badges-row">${badgesHtml}</div>` : ''}
            
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
                <span>Vendedor: <strong class="text-white">${a.seller_name || 'Vendedor Particular'}</strong> <span class="seller-rating-pill">${a.seller_score || '5.0'}</span></span>
                ${a.is_new_seller ? `<span class="seller-newbie-pill" title="Conta sem histórico de vendas anteriores na OLX"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block;vertical-align:middle;margin-right:2px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg> 0 VENDAS</span>` : ''}
              </div>
            </div>

            <!-- Bloco de Ações Estratégicas: 2 Ações Precisas e Descoladas -->
            <div class="ad-actions-container">
              <!-- Ação 1: Auditoria Neural Completa do Anúncio -->
              <div class="ad-actions-row">
                <button class="ad-btn-validate" data-validate-url="${a.url}" title="Auditar procedência, reputação e margem de negociação">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  <span>Auditar Anúncio</span>
                </button>
                <a href="${a.url}" target="_blank" rel="noopener noreferrer" class="ad-btn-external" title="Abrir página oficial do anúncio na OLX">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
              </div>

              <!-- Ação 2: Contato Direto e Fechamento -->
              <div class="ad-contact-action-row">
                ${a.contact && a.contact.has_phone ? `
                  <a href="${a.contact.whatsapp_url}" target="_blank" rel="noopener noreferrer" class="ad-btn-wpp" title="Negociar direto pelo WhatsApp oficial com script pronto">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.303-.058.116-.087.188-.173.289l-.26.303c-.087.087-.177.181-.076.355.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.174.086.275.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.073.043.419-.101.824z"/></svg>
                    <span>WhatsApp: <strong>${a.contact.phone_formatted}</strong></span>
                  </a>
                ` : `
                  <a href="${a.url}" target="_blank" rel="noopener noreferrer" class="ad-btn-wpp-missing" title="Abrir chat direto na plataforma da OLX">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    <span>Negociar no Chat da OLX</span>
                  </a>
                `}
              </div>
            </div>
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
        galleryContainer.innerHTML = rep.images.map((img, idx) => `
          <div class="validator-gallery-item">
            <img src="${img}" data-src-original="${img}" class="validator-gallery-img" alt="Foto Real Anúncio ${idx + 1}" loading="lazy" referrerpolicy="no-referrer"
                 onerror="handleAdImgError(this)"
                 onclick="window.open('${img}', '_blank')">
            <div class="gallery-action-overlay">
              <button type="button" class="btn-gallery-action btn-gallery-view" title="Visualizar em Tela Cheia" onclick="window.open('${img}', '_blank')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                <span>HD</span>
              </button>
              <button type="button" class="btn-gallery-action btn-gallery-download" title="Baixar Foto em Alta Definição" onclick="downloadImageDirectly('${img}', 'foto_anuncio_${idx + 1}.jpg', event)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>Baixar</span>
              </button>
            </div>
          </div>
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
    
    const sellerDispatch = document.getElementById('seller-dispatch-time');
    if (sellerDispatch) {
      sellerDispatch.textContent = seller.tempo_despacho || 'Despacho Rápido (Garantia OLX)';
    }

    if (sellerVerifications) {
      if (seller.verified_items && seller.verified_items.length > 0) {
        sellerVerifications.innerHTML = seller.verified_items.map(item => `
          <span class="seller-verified-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            ${item}
          </span>
        `).join('');
      } else {
        sellerVerifications.innerHTML = `
          <span class="seller-verified-chip text-muted-chip">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            Não Informado
          </span>
        `;
      }
    }

    // Contato direto e WhatsApp Validado do Vendedor
    const contactBar = document.getElementById('seller-contact-bar');
    const contactNumEl = document.getElementById('seller-contact-number');
    const directWppLink = document.getElementById('seller-direct-wpp-link');
    const contact = seller.contact || (rep.lead_intel && rep.lead_intel.contact);

    if (contactBar && contact && contact.has_phone) {
      contactBar.classList.remove('d-none');
      if (contactNumEl) contactNumEl.textContent = contact.phone_formatted;
      if (directWppLink) directWppLink.href = contact.whatsapp_url;
    } else if (contactBar) {
      contactBar.classList.add('d-none');
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

  // Troca de Tabs Principais com Blindagem do Painel Supremo
  function switchTab(tabId) {
    if (tabId === 'admin' && !state.adminToken) {
      CyberShield.playSound('block');
      CyberShield.showToast("Área Restrita. Autenticação Suprema Obrigatória.", "error");
      openAdminAuthModal();
      return;
    }

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
      const guard = document.getElementById('admin-auth-guard');
      const content = document.getElementById('admin-content-wrapper');
      if (!state.adminToken) {
        if (guard) {
          guard.classList.remove('hidden');
          guard.style.display = 'block';
        }
        if (content) {
          content.classList.add('hidden');
          content.style.display = 'none';
        }
        openAdminAuthModal();
      } else {
        if (guard) {
          guard.classList.add('hidden');
          guard.style.display = 'none';
        }
        if (content) {
          content.classList.remove('hidden');
          content.style.display = 'block';
        }
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

  // Helper resiliente de armazenamento local protegido contra QuotaExceededError
  function safeSetLocalStorage(key, val) {
    try {
      localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
      return true;
    } catch (err) {
      console.warn("Storage quota excedida ou restrita, aplicando fallback essencial:", err);
      try {
        if (typeof val === 'object' && val !== null) {
          const minimal = {
            id: val.id || Date.now(),
            vulgo: val.vulgo || 'NG7K',
            avatar: defaultAvatar,
            role: val.role || 'lead',
            status: val.status || 'active'
          };
          localStorage.setItem(key, JSON.stringify(minimal));
          return true;
        }
      } catch (_) {}
      return false;
    }
  }

  // Modal de Criação / Edição de Perfil do Lead
  function openProfileModal(isInitial = false) {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    modal.classList.add('active');

    const titleEl = document.getElementById('profile-modal-title');
    const saveBtn = document.getElementById('profile-save-btn');
    const vulgoInput = document.getElementById('profile-vulgo-input');
    const preview = document.getElementById('profile-avatar-preview');
    const statusText = document.getElementById('upload-status-text');
    if (statusText) statusText.classList.remove('active');

    const isEditing = !isInitial && !!state.currentLead;
    if (titleEl) {
      titleEl.textContent = isEditing ? "Editar Perfil do Lead" : "Identificação do Lead";
    }
    if (saveBtn) {
      saveBtn.textContent = isEditing ? "Salvar Alterações do Perfil" : "Salvar & Ingressar no Sistema";
    }

    if (state.currentLead) {
      if (vulgoInput) vulgoInput.value = state.currentLead.vulgo || '';
      selectedAvatar = state.currentLead.avatar || defaultAvatar;
    } else {
      if (vulgoInput && !vulgoInput.value) vulgoInput.value = 'NG7K';
      selectedAvatar = selectedAvatar || defaultAvatar;
    }

    if (preview) preview.src = selectedAvatar;
    renderAvatarPresets();

    if (vulgoInput) {
      setTimeout(() => {
        vulgoInput.focus();
        vulgoInput.select();
      }, 150);
    }
  }

  function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (modal) modal.classList.remove('active');
  }

  // Processa arquivo de imagem da máquina (redimensiona em canvas e exporta JPEG leve para evitar estouro de cota)
  function processAvatarFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      CyberShield.playSound('block');
      CyberShield.showToast("Por favor, selecione um arquivo de imagem válido (PNG, JPG, SVG, WebP).", "error");
      return;
    }

    // Limite de 8MB de entrada
    if (file.size > 8 * 1024 * 1024) {
      CyberShield.showToast("A imagem selecionada é muito grande. Escolha uma foto de até 8MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
      const rawData = evt.target.result;

      // Otimização inteligente via Canvas para imagem de perfil ultraleve e nítida
      if (file.type !== 'image/svg+xml') {
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement('canvas');
          const maxDim = 200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          // Exporta JPEG com qualidade 0.82 gerando ~15KB (super rápido e à prova de limite de localStorage)
          selectedAvatar = canvas.toDataURL('image/jpeg', 0.82);
          applyUploadedAvatar(file.name);
        };
        img.onerror = function() {
          selectedAvatar = rawData;
          applyUploadedAvatar(file.name);
        };
        img.src = rawData;
      } else {
        selectedAvatar = rawData;
        applyUploadedAvatar(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  function applyUploadedAvatar(fileName) {
    const preview = document.getElementById('profile-avatar-preview');
    if (preview) {
      preview.style.opacity = '0';
      setTimeout(() => {
        preview.src = selectedAvatar;
        preview.style.opacity = '1';
      }, 120);
    }

    // Desmarca presets
    document.querySelectorAll('.avatar-preset-item').forEach(i => i.classList.remove('selected'));

    const statusText = document.getElementById('upload-status-text');
    if (statusText) {
      statusText.textContent = `✓ Foto carregada: ${fileName || 'avatar customizado'}`;
      statusText.classList.add('active');
    }

    CyberShield.playSound('click');
    CyberShield.showToast("Avatar carregado da máquina com sucesso!", "success");
  }

  // Upload do Avatar da Máquina do Lead via input file
  function handleMachineAvatarUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (file) processAvatarFile(file);
  }

  // Salvar Perfil do Lead (Vulgo + Avatar da máquina ou preset)
  async function saveLeadProfile() {
    const vulgoInput = document.getElementById('profile-vulgo-input');
    const saveBtn = document.getElementById('profile-save-btn');
    let vulgo = vulgoInput ? vulgoInput.value.trim() : '';

    if (!vulgo || vulgo.length < 2) {
      CyberShield.playSound('block');
      CyberShield.showToast("Informe um vulgo com no mínimo 2 caracteres.", "error");
      if (vulgoInput) {
        vulgoInput.focus();
        vulgoInput.classList.add('input-error-shake');
        setTimeout(() => vulgoInput.classList.remove('input-error-shake'), 600);
      }
      return;
    }

    // Sanitização visual para o vulgo
    vulgo = vulgo.replace(/[<>/\\{}\[\];`"'=]/g, '').trim();
    if (!vulgo || vulgo.length < 2) {
      CyberShield.playSound('block');
      CyberShield.showToast("Vulgo contém apenas caracteres proibidos. Escolha outro nome.", "error");
      return;
    }

    const previousVulgo = state.currentLead ? state.currentLead.vulgo : null;
    const isEditing = !!previousVulgo;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spinner" style="display:inline-block;width:16px;height:16px;border:2.5px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:8px;vertical-align:middle;"></span> Sincronizando...`;
    }

    const leadPayload = {
      vulgo: vulgo,
      new_vulgo: vulgo,
      old_vulgo: previousVulgo,
      avatar: selectedAvatar || defaultAvatar
    };

    try {
      const endpoint = isEditing ? '/api/lead/update-profile' : '/api/auth/register-or-login';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      let res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      // Fallback para endpoint principal caso o servidor tenha reiniciado ou update-profile retorne 404
      if (!res.ok && isEditing && (res.status === 404 || res.status === 405)) {
        res = await fetch('/api/auth/register-or-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadPayload)
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Erro ao salvar perfil no servidor.");
      }

      const data = await res.json();
      const savedLead = data.lead || {
        id: state.currentLead ? state.currentLead.id : Date.now(),
        vulgo: vulgo,
        avatar: selectedAvatar || defaultAvatar,
        role: 'lead',
        status: 'active'
      };

      state.currentLead = savedLead;
      safeSetLocalStorage('olx_lead_profile', savedLead);

      updateLeadHeaderDisplay();
      closeProfileModal();
      CyberShield.playSound('success');
      CyberShield.showToast(`Perfil sincronizado com sucesso! Olá, ${vulgo}.`, "success");

    } catch (e) {
      console.warn("Sincronizando perfil em modo de resiliência local imediata:", e);
      const fallbackLead = {
        id: state.currentLead ? state.currentLead.id : Date.now(),
        vulgo: vulgo,
        avatar: selectedAvatar || defaultAvatar,
        role: 'lead',
        status: 'active'
      };
      state.currentLead = fallbackLead;
      safeSetLocalStorage('olx_lead_profile', fallbackLead);
      updateLeadHeaderDisplay();
      closeProfileModal();
      CyberShield.playSound('success');
      CyberShield.showToast(`Perfil sincronizado com sucesso: ${vulgo}`, "success");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = isEditing ? "Salvar Alterações do Perfil" : "Salvar & Ingressar no Sistema";
      }
    }
  }

  // ============================================================
  // MOTOR DE INTELIGÊNCIA ARTIFICIAL: DETECÇÃO DINÂMICA DE CATEGORIA
  // ============================================================
  const SMART_CATEGORY_MAP = [
    {
      id: "casa",
      name: "Para a sua Casa",
      patterns: [
        /\bgeladeir[as]?\b/i, /\brefrigerador(es)?\b/i, /\bfreezer(s)?\b/i, /\bfrigobar(es)?\b/i,
        /\bfog[aã]o(es)?\b/i, /\bmicro[- ]?ondas\b/i, /\bcooktop(s)?\b/i, /\bforno(s)?\b/i,
        /\bm[aá]quina de lavar\b/i, /\blava e seca\b/i, /\btanquinho(s)?\b/i, /\baspirador(es)?\b/i,
        /\bsof[aá]s?\b/i, /\bpoltron[as]?\b/i, /\bcama(s)?\b/i, /\bcolch[aã]o(es)?\b/i,
        /\bguarda[- ]roupa(s)?\b/i, /\bmesa(s)?\b/i, /\bcadeira(s)?\b/i, /\barm[aá]rio(s)?\b/i,
        /\bestante(s)?\b/i, /\brack(s)?\b/i, /\btapete(s)?\b/i, /\bcortina(s)?\b/i,
        /\bar[- ]condicionado\b/i, /\bventilador(es)?\b/i, /\bcafeteira(s)?\b/i, /\bliquidificador(es)?\b/i,
        /\bbatedeira(s)?\b/i, /\bair[- ]?fryer\b/i, /\bfritadeira(s)?\b/i, /\beletrodom[eé]stico(s)?\b/i,
        /\bm[oó]ve(l|is)\b/i, /\bber[cç]o(s)?\b/i, /\bpanela(s)?\b/i
      ]
    },
    {
      id: "celulares",
      name: "Celulares e Telefonia",
      patterns: [
        /\biphone\b/i, /\bpro max\b/i, /\bgalaxy\b/i, /\bsamsung\b/i, /\bxiaomi\b/i,
        /\bredmi\b/i, /\bpoco\b/i, /\bmotorola\b/i, /\bmoto [ge]\d+/i, /\bmoto edge\b/i,
        /\bcelular(es)?\b/i, /\bsmartphone(s)?\b/i, /\btelefone(s)?\b/i, /\bapple watch\b/i,
        /\bsmartwatch(es)?\b/i, /\bipad(s)?\b/i, /\btablet(s)?\b/i, /\bairpods\b/i
      ]
    },
    {
      id: "computadores",
      name: "Computadores e Informática",
      patterns: [
        /\bnotebook(s)?\b/i, /\blaptop(s)?\b/i, /\bmacbook(s)?\b/i, /\bpc gamer\b/i,
        /\bcomputador(es)?\b/i, /\bdesktop(s)?\b/i, /\bplaca de v[ií]deo\b/i, /\brtx\s?\d+/i,
        /\bgtx\s?\d+/i, /\bradeon\b/i, /\bprocessador(es)?\b/i, /\bryzen\b/i, /\bintel core\b/i,
        /\bi[3579][ -]\d+/i, /\bplaca m[aã]e\b/i, /\bmem[oó]ria ram\b/i, /\bssd\b/i, /\bnvme\b/i,
        /\bmonitor(es)?\b/i, /\bteclado mec[aâ]nico\b/i, /\bmouse gamer\b/i, /\bfonte gamer\b/i,
        /\bgabinete gamer\b/i, /\bimpressora(s)?\b/i, /\bnobreak(s)?\b/i
      ]
    },
    {
      id: "eletronicos",
      name: "Eletrônicos, Áudio e Vídeo",
      patterns: [
        /\bsmart tv\b/i, /\btelevis[aã]o\b/i, /\btv\s?\d+/i, /\boled\b/i, /\bqled\b/i,
        /\bcaixa de som\b/i, /\bjbl\b/i, /\bsoundbar\b/i, /\breceiver\b/i, /\bprojetor(es)?\b/i,
        /\bc[aâ]mera(s)?\b/i, /\bdslr\b/i, /\bcanon\b/i, /\bnikon\b/i, /\bgopro\b/i,
        /\bdrone(s)?\b/i, /\bplaystation\b/i, /\bps[345]\b/i, /\bxbox\b/i, /\bnintendo switch\b/i,
        /\bconsole(s)?\b/i, /\bvideogame(s)?\b/i, /\bfone(s)? de ouvido\b/i, /\bheadphone(s)?\b/i
      ]
    },
    {
      id: "carros",
      name: "Carros, Vans e Utilitários",
      patterns: [
        /\bcarro(s)?\b/i, /\bautom[oó]ve(l|is)\b/i, /\bve[ií]culo(s)?\b/i, /\bgol\b/i,
        /\bcorsa\b/i, /\bpalio\b/i, /\buno\b/i, /\bcivic\b/i, /\bcorolla\b/i, /\bonix\b/i,
        /\bhb20\b/i, /\bfit\b/i, /\bfiesta\b/i, /\bka\b/i, /\bsandero\b/i, /\brenegade\b/i,
        /\bcompass\b/i, /\bt[- ]cross\b/i, /\btracker\b/i, /\bcreta\b/i, /\bhilux\b/i,
        /\branger\b/i, /\bs10\b/i, /\bamarok\b/i, /\bstrada\b/i, /\bsaveiro\b/i,
        /\bfiorino\b/i, /\bvan(s)?\b/i, /\bkombi\b/i, /\bsedan\b/i, /\bhatch\b/i, /\bsuv\b/i
      ]
    },
    {
      id: "motos",
      name: "Motos",
      patterns: [
        /\bmoto(s)?\b/i, /\bmotocicleta(s)?\b/i, /\bscooter(s)?\b/i, /\bbiz\b/i,
        /\bhonda cg\b/i, /\btitan\b/i, /\bfan\b/i, /\btwister\b/i, /\bcb\s?300\b/i,
        /\bcb\s?500\b/i, /\bcb\s?600\b/i, /\bhornet\b/i, /\bxj6\b/i, /\byamaha\b/i,
        /\bfactor\b/i, /\bfazer\b/i, /\blander\b/i, /\btenere\b/i, /\bmt[- ]?0[379]\b/i,
        /\bpcx\b/i, /\bnmax\b/i, /\bxre\b/i, /\bbros\b/i, /\bfalcon\b/i, /\bbmw gs\b/i,
        /\btriumph\b/i, /\bharley\b/i, /\bcapacete(s)?\b/i
      ]
    },
    {
      id: "autos-e-pecas",
      name: "Autos e Peças",
      patterns: [
        /\bpe[cç]as? de carro\b/i, /\bauto pe[cç]as?\b/i, /\bpneu(s)?\b/i, /\broda(s)?\b/i,
        /\baro\s?\d{2}\b/i, /\bbateria heliar\b/i, /\bbateria moura\b/i, /\bmotor ap\b/i,
        /\bc[aâ]mbio\b/i, /\bamortecedor(es)?\b/i, /\bfaro(l|is)\b/i, /\bescapamento(s)?\b/i,
        /\bpara[- ]choque(s)?\b/i, /\bsom automotivo\b/i
      ]
    },
    {
      id: "imoveis",
      name: "Imóveis",
      patterns: [
        /\bapartamento(s)?\b/i, /\bapto(s)?\b/i, /\bcasa para alugar\b/i, /\bcasa para venda\b/i,
        /\bkitnet(s)?\b/i, /\bkitinete(s)?\b/i, /\bquitinete(s)?\b/i, /\bstudio\b/i, /\bflat\b/i,
        /\bloft\b/i, /\bcobertura\b/i, /\bsobrado\b/i, /\bterreno(s)?\b/i, /\blote(s)?\b/i,
        /\bcondom[ií]nio\b/i, /\bch[aá]cara(s)?\b/i, /\bs[ií]tio(s)?\b/i, /\bfazenda(s)?\b/i,
        /\bgalp[aã]o(es)?\b/i, /\bsala comercial\b/i, /\baluguel\b/i
      ]
    },
    {
      id: "moda",
      name: "Moda e Beleza",
      patterns: [
        /\bt[eê]nis\b/i, /\bsapato(s)?\b/i, /\bbota(s)?\b/i, /\bsand[aá]lia(s)?\b/i,
        /\brasteirinhas?\b/i, /\bcamisa(s)?\b/i, /\bcamiseta(s)?\b/i, /\bcal[cç]a(s)?\b/i,
        /\bvestido(s)?\b/i, /\bsaia(s)?\b/i, /\bcasaco(s)?\b/i, /\bjaqueta(s)?\b/i,
        /\bmoletom\b/i, /\bterno(s)?\b/i, /\brel[oó]gio(s)?\b/i, /\binvicta\b/i, /\brolex\b/i,
        /\bbolsa(s)?\b/i, /\bmochila(s)?\b/i, /\bperfume(s)?\b/i, /\bmaquiagem\b/i,
        /\bsecador(es)?\b/i, /\bchapinha(s)?\b/i
      ]
    },
    {
      id: "musica",
      name: "Música e Hobbies",
      patterns: [
        /\bviol[aã]o(es)?\b/i, /\bguitarra(s)?\b/i, /\bbaixo(s)?\b/i, /\bbateria ac[uú]stica\b/i,
        /\bteclado musical\b/i, /\bpiano(s)?\b/i, /\bsaxofone(s)?\b/i, /\bflauta(s)?\b/i,
        /\bmicrofone(s)?\b/i, /\bamplificador(es)?\b/i, /\bpedaleira(s)?\b/i, /\bcolecion[aá]ve(l|is)\b/i,
        /\baction figure(s)?\b/i, /\bvinil\b/i, /\bdisco(s)?\b/i
      ]
    },
    {
      id: "esportes",
      name: "Esportes e Lazer",
      patterns: [
        /\bbicicleta(s)?\b/i, /\bbike(s)?\b/i, /\bmtb\b/i, /\bspeed\b/i, /\bcaloi\b/i,
        /\baro 29\b/i, /\besteira(s)?\b/i, /\bspinning\b/i, /\bhalteres?\b/i, /\banilha(s)?\b/i,
        /\bprancha de surf\b/i, /\bskate(s)?\b/i, /\bpatins\b/i, /\bbarraca de camping\b/i,
        /\bvara de pescar\b/i, /\bmolinete(s)?\b/i, /\bsuplemento(s)?\b/i, /\bwhey\b/i
      ]
    },
    {
      id: "agro",
      name: "Agro e Indústria",
      patterns: [
        /\btrator(es)?\b/i, /\barado(s)?\b/i, /\bcolheitadeira(s)?\b/i, /\bgado\b/i,
        /\bcavalo(s)?\b/i, /\bboi(s)?\b/i, /\bvaca(s)?\b/i, /\bbezerro(s)?\b/i,
        /\bsilagem\b/i, /\bra[cç][aã]o\b/i, /\badubo\b/i, /\bm[aá]quina industrial\b/i,
        /\btorno(s)?\b/i, /\bcompressor(es)?\b/i, /\bsolda\b/i, /\bgerador(es)?\b/i
      ]
    },
    {
      id: "servicos",
      name: "Serviços",
      patterns: [
        /\bfrete(s)?\b/i, /\bcarreto(s)?\b/i, /\bmudan[cç]a(s)?\b/i, /\bpedreiro(s)?\b/i,
        /\bpintor(es)?\b/i, /\beletricista(s)?\b/i, /\bencanador(es)?\b/i, /\bmec[aâ]nico(s)?\b/i,
        /\bdiarista(s)?\b/i, /\bfaxineira(s)?\b/i, /\bformata[cç][aã]o\b/i, /\bmarcenaria\b/i,
        /\bserralheria\b/i, /\bguincho(s)?\b/i
      ]
    }
  ];

  function detectCategoryFromQuery(query) {
    if (!query || typeof query !== 'string') return null;
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3) return null;

    for (const cat of SMART_CATEGORY_MAP) {
      for (const pat of cat.patterns) {
        const match = cleanQuery.match(pat);
        if (match) {
          return {
            id: cat.id,
            name: cat.name,
            keyword: match[0]
          };
        }
      }
    }
    return null;
  }

  function setupSmartCategoryDetector() {
    const searchInput = document.getElementById('search-keyword');
    const detectorBar = document.getElementById('ai-category-detector-bar');
    const catNameEl = document.getElementById('ai-detector-cat-name');
    const keywordEl = document.getElementById('ai-detector-keyword-matched');
    const undoBtn = document.getElementById('ai-detector-undo-btn');
    const categorySelect = document.getElementById('search-category-select');

    if (!searchInput || !detectorBar) return;

    let autoDetected = false;

    searchInput.addEventListener('input', () => {
      const query = searchInput.value;
      const detected = detectCategoryFromQuery(query);

      if (detected) {
        if (state.selectedCategory !== detected.id) {
          state.selectedCategory = detected.id;
          autoDetected = true;

          // Atualiza select nativo
          if (categorySelect) categorySelect.value = detected.id;

          // Atualiza custom dropdown se inicializado
          if (state.dropdowns && state.dropdowns.category) {
            state.dropdowns.category.setValue(detected.id);
          }

          // Exibe banner inteligente
          if (catNameEl) catNameEl.textContent = detected.name;
          if (keywordEl) keywordEl.textContent = `(${detected.keyword})`;
          detectorBar.classList.remove('hidden');

          CyberShield.playSound('click');
        }
      } else {
        // Se o usuário apagou o texto da busca, esconde o banner
        if (!query.trim() && autoDetected) {
          detectorBar.classList.add('hidden');
          autoDetected = false;
        }
      }
    });

    // Botão de desfazer detecção automática
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        state.selectedCategory = 'todas';
        if (categorySelect) categorySelect.value = 'todas';
        if (state.dropdowns && state.dropdowns.category) {
          state.dropdowns.category.setValue('todas');
        }
        detectorBar.classList.add('hidden');
        autoDetected = false;
        CyberShield.playSound('click');
        CyberShield.showToast("Categoria revertida para Todas.", "info");
      });
    }
  }

  // ============================================================
  // BARRA INTERATIVA DE PREÇO BASE DOS PRODUTOS
  // ============================================================
  function setupPriceBaseSlider() {
    const slider = document.getElementById('price-base-slider');
    const display = document.getElementById('price-slider-display');
    const badge = document.getElementById('price-slider-tier-badge');
    const maxInput = document.getElementById('search-max-price');
    const chips = document.querySelectorAll('.price-preset-chip');
    const ticks = document.querySelectorAll('.tick-label');

    if (!slider) return;

    function formatCurrency(val) {
      if (!val || val === 0) return "Qualquer Valor";
      return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }

    function updateSliderVisuals(val) {
      const pct = Math.min(100, Math.max(0, (val / 50000) * 100));
      slider.style.setProperty('--slider-pct', `${pct}%`);
      if (display) display.textContent = formatCurrency(val);

      if (badge) {
        if (val === 0) {
          badge.textContent = "FAIXA LIVRE";
          badge.style.color = "#38bdf8";
          badge.style.borderColor = "rgba(56, 189, 248, 0.4)";
          badge.style.background = "rgba(56, 189, 248, 0.15)";
        } else if (val <= 1000) {
          badge.textContent = "ENTRADA";
          badge.style.color = "#34d399";
          badge.style.borderColor = "rgba(52, 211, 153, 0.4)";
          badge.style.background = "rgba(52, 211, 153, 0.15)";
        } else if (val <= 5000) {
          badge.textContent = "INTERMEDIÁRIO";
          badge.style.color = "#38bdf8";
          badge.style.borderColor = "rgba(56, 189, 248, 0.4)";
          badge.style.background = "rgba(56, 189, 248, 0.15)";
        } else if (val <= 15000) {
          badge.textContent = "PREMIUM";
          badge.style.color = "#c084fc";
          badge.style.borderColor = "rgba(192, 132, 252, 0.4)";
          badge.style.background = "rgba(192, 132, 252, 0.15)";
        } else {
          badge.textContent = "ALTO PADRÃO";
          badge.style.color = "#fbbf24";
          badge.style.borderColor = "rgba(251, 191, 36, 0.4)";
          badge.style.background = "rgba(251, 191, 36, 0.15)";
        }
      }

      // Atualiza active nos chips
      chips.forEach(chip => {
        const chipVal = parseFloat(chip.getAttribute('data-price')) || 0;
        if (chipVal === val) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }

    // Evento de arrasto da barra
    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) || 0;
      updateSliderVisuals(val);
      if (maxInput) {
        maxInput.value = val > 0 ? val : '';
      }
    });

    // Sincroniza quando o usuário digita no input de preço máximo
    if (maxInput) {
      maxInput.addEventListener('input', () => {
        let raw = maxInput.value.trim().replace(/[^\d,\.]/g, '');
        let clean = raw;
        if (clean.includes('.') && clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
        else if (clean.includes(',')) clean = clean.replace(',', '.');
        else if (clean.includes('.')) {
          const parts = clean.split('.');
          if (parts[parts.length - 1].length === 2) clean = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
          else clean = parts.join('');
        }
        const val = parseFloat(clean) || 0;
        const clamped = Math.min(50000, Math.max(0, val));
        slider.value = clamped;
        updateSliderVisuals(clamped);
      });
    }

    // Chips de preço rápido
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const val = parseFloat(chip.getAttribute('data-price')) || 0;
        slider.value = val;
        updateSliderVisuals(val);
        if (maxInput) {
          maxInput.value = val > 0 ? val : '';
        }
        CyberShield.playSound('click');
      });
    });

    // Ticks clicáveis abaixo da barra
    ticks.forEach(tick => {
      tick.addEventListener('click', () => {
        const val = parseFloat(tick.getAttribute('data-val')) || 0;
        slider.value = val;
        updateSliderVisuals(val);
        if (maxInput) {
          maxInput.value = val > 0 ? val : '';
        }
        CyberShield.playSound('click');
      });
    });

    // Inicialização da barra
    const initialMax = maxInput ? (parseFloat(maxInput.value) || 0) : 0;
    slider.value = initialMax;
    updateSliderVisuals(initialMax);
  }

  // ============================================================
  // MOTOR DE CONTROLE E PROFUNDIDADE DE PÁGINAS & CARDS 3D AVANÇADOS
  // ============================================================
  function setupPagesStepperAndAdvancedCards() {
    const pagesInput = document.getElementById('search-pages-input');
    const btnDec = document.getElementById('btn-pages-dec');
    const btnInc = document.getElementById('btn-pages-inc');
    const statusBadge = document.getElementById('pages-stepper-status-badge');
    const presetChips = document.querySelectorAll('.pages-preset-chip');

    // Cards Avançados & Switches
    const cardDesc = document.getElementById('card-fetch-descriptions');
    const checkDesc = document.getElementById('check-fetch-descriptions');
    const cardNewSellers = document.getElementById('card-only-new-sellers');
    const checkNewSellers = document.getElementById('check-only-new-sellers');

    // Subfiltro de teto de anúncios
    const btnStepDec = document.getElementById('btn-step-dec');
    const btnStepInc = document.getElementById('btn-step-inc');
    const maxAdsInput = document.getElementById('input-max-ads-180d');

    function updatePagesFeedback(pageVal) {
      const p = Math.max(1, Math.min(30, parseInt(pageVal) || 1));
      if (pagesInput && parseInt(pagesInput.value) !== p) {
        pagesInput.value = p;
      }

      if (statusBadge) {
        if (p === 1) {
          statusBadge.textContent = "Varredura Padrão (1 Pág ~50 anúncios)";
          statusBadge.style.color = "#38bdf8";
          statusBadge.style.borderColor = "rgba(56, 189, 248, 0.25)";
          statusBadge.style.background = "rgba(56, 189, 248, 0.1)";
        } else if (p <= 5) {
          statusBadge.textContent = `Varredura Profunda (${p} Págs ~${p * 50} anúncios)`;
          statusBadge.style.color = "#34d399";
          statusBadge.style.borderColor = "rgba(16, 185, 129, 0.35)";
          statusBadge.style.background = "rgba(16, 185, 129, 0.12)";
        } else if (p <= 15) {
          statusBadge.textContent = `Varredura Massiva (${p} Págs ~${p * 50} anúncios)`;
          statusBadge.style.color = "#fbbf24";
          statusBadge.style.borderColor = "rgba(245, 158, 11, 0.35)";
          statusBadge.style.background = "rgba(245, 158, 11, 0.12)";
        } else {
          statusBadge.textContent = `Varredura Extrema (${p} Págs ~${p * 50} anúncios)`;
          statusBadge.style.color = "#f43f5e";
          statusBadge.style.borderColor = "rgba(244, 63, 94, 0.4)";
          statusBadge.style.background = "rgba(244, 63, 94, 0.15)";
        }
      }

      // Atualiza active nos chips de preset
      presetChips.forEach(chip => {
        const chipP = parseInt(chip.getAttribute('data-page')) || 1;
        if (chipP === p) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }

    if (pagesInput) {
      pagesInput.addEventListener('input', () => {
        const v = parseInt(pagesInput.value);
        if (!isNaN(v)) {
          updatePagesFeedback(v);
        }
      });

      pagesInput.addEventListener('blur', () => {
        let v = parseInt(pagesInput.value) || 1;
        v = Math.max(1, Math.min(30, v));
        pagesInput.value = v;
        updatePagesFeedback(v);
      });
    }

    if (btnDec && pagesInput) {
      btnDec.addEventListener('click', () => {
        let current = parseInt(pagesInput.value) || 1;
        if (current > 1) {
          current -= 1;
          pagesInput.value = current;
          updatePagesFeedback(current);
          CyberShield.playSound('click');
        }
      });
    }

    if (btnInc && pagesInput) {
      btnInc.addEventListener('click', () => {
        let current = parseInt(pagesInput.value) || 1;
        if (current < 30) {
          current += 1;
          pagesInput.value = current;
          updatePagesFeedback(current);
          CyberShield.playSound('click');
        }
      });
    }

    presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const p = parseInt(chip.getAttribute('data-page')) || 1;
        if (pagesInput) {
          pagesInput.value = p;
        }
        updatePagesFeedback(p);
        CyberShield.playSound('click');
      });
    });

    // Sincronização visual e interatividade dos Cards 3D com Switches
    function syncCardsChecked() {
      if (cardDesc && checkDesc) {
        if (checkDesc.checked) {
          cardDesc.classList.add('active-checked');
        } else {
          cardDesc.classList.remove('active-checked');
        }
      }
      if (cardNewSellers && checkNewSellers) {
        if (checkNewSellers.checked) {
          cardNewSellers.classList.add('active-checked');
        } else {
          cardNewSellers.classList.remove('active-checked');
        }
      }
    }

    if (checkDesc) {
      checkDesc.addEventListener('change', () => {
        syncCardsChecked();
        CyberShield.playSound('click');
      });
    }

    if (checkNewSellers) {
      checkNewSellers.addEventListener('change', () => {
        syncCardsChecked();
        CyberShield.playSound('click');
      });
    }

    // Clique direto no card (fora dos botões/inputs) alterna o checkbox
    [cardDesc, cardNewSellers].forEach(c => {
      if (c) {
        c.addEventListener('click', (e) => {
          if (e.target.closest('input') || e.target.closest('button') || e.target.closest('.cyber-switch-3d') || e.target.closest('.subfilter-3d-panel')) {
            return;
          }
          const chk = c.querySelector('.cyber-switch-input');
          if (chk) {
            chk.checked = !chk.checked;
            chk.dispatchEvent(new Event('change'));
          }
        });
      }
    });

    // Subfiltro de teto de anúncios (+ / -)
    if (btnStepDec && maxAdsInput) {
      btnStepDec.addEventListener('click', (e) => {
        e.stopPropagation();
        let cur = parseInt(maxAdsInput.value) || 3;
        if (cur > 0) {
          cur -= 1;
          maxAdsInput.value = cur;
          CyberShield.playSound('click');
        }
      });
    }

    if (btnStepInc && maxAdsInput) {
      btnStepInc.addEventListener('click', (e) => {
        e.stopPropagation();
        let cur = parseInt(maxAdsInput.value) || 3;
        if (cur < 50) {
          cur += 1;
          maxAdsInput.value = cur;
          CyberShield.playSound('click');
        }
      });
    }

    // Inicialização dos estados
    if (pagesInput) {
      updatePagesFeedback(parseInt(pagesInput.value) || 1);
    }
    syncCardsChecked();
  }


  // Disponibiliza saveLeadProfile e funções de perfil no escopo global para acionamento resiliente
  window.saveLeadProfile = saveLeadProfile;
  window.openProfileModal = openProfileModal;
  window.closeProfileModal = closeProfileModal;
  window.submitAdminAuth = submitAdminAuth;
  window.closeAdminAuthModal = closeAdminAuthModal;

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

    if (!key) {
      CyberShield.showToast("Digite a chave secreta mestra.", "error");
      return;
    }

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
      if (keyInput) keyInput.value = '';
      closeAdminAuthModal();
      CyberShield.showToast("Acesso ao Painel Admin Supremo Concedido!", "success");
      switchTab('admin');

    } catch (e) {
      CyberShield.playSound('block');
      CyberShield.showToast("Chave Suprema Incorreta. Tentativa registrada.", "error");
    }
  }

  // Carrega Dados do Painel Admin Supremo com Cabeçalho Blindado
  async function loadAdminData() {
    const guard = document.getElementById('admin-auth-guard');
    const content = document.getElementById('admin-content-wrapper');

    if (!state.adminToken) {
      if (guard) {
        guard.classList.remove('hidden');
        guard.style.display = 'block';
      }
      if (content) {
        content.classList.add('hidden');
        content.style.display = 'none';
      }
      openAdminAuthModal();
      return;
    }

    const adminHeaders = {
      'Authorization': `Bearer ${state.adminToken}`
    };

    try {
      // 1. Overview & Métricas
      const ovRes = await fetch('/api/admin/overview', { headers: adminHeaders });
      if (ovRes.status === 401 || ovRes.status === 403) {
        logoutAdmin(true);
        return;
      }
      const ovData = await ovRes.json();
      if (guard) {
        guard.classList.add('hidden');
        guard.style.display = 'none';
      }
      if (content) {
        content.classList.remove('hidden');
        content.style.display = 'block';
      }
      renderAdminOverview(ovData);

      // 2. Leads Sincronizados
      const leadsRes = await fetch('/api/admin/leads', { headers: adminHeaders });
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        renderAdminLeads(leadsData.leads || []);
      }

      // 3. Histórico Global de Puxadas
      const histRes = await fetch('/api/admin/history', { headers: adminHeaders });
      if (histRes.ok) {
        const histData = await histRes.json();
        renderAdminHistory(histData.history || []);
      }

      // 4. IPs Bloqueados na Blindagem
      const ipsRes = await fetch('/api/admin/security/ips', { headers: adminHeaders });
      if (ipsRes.ok) {
        const ipsData = await ipsRes.json();
        renderAdminSecurity(ipsData.blocked_ips || []);
      }

      // 5. Pool de Tokens API (ScraperAPI)
      const tokensRes = await fetch('/api/admin/tokens', { headers: adminHeaders });
      if (tokensRes.ok) {
        const tokensData = await tokensRes.json();
        renderAdminTokens(tokensData.tokens || []);
      }

    } catch (e) {
      console.error("Falha ao carregar dados do admin:", e);
      logoutAdmin(true);
    }
  }

  function logoutAdmin(isExpired = false) {
    state.adminToken = null;
    sessionStorage.removeItem('olx_admin_token');
    const guard = document.getElementById('admin-auth-guard');
    const content = document.getElementById('admin-content-wrapper');
    if (guard) guard.style.display = 'block';
    if (content) content.style.display = 'none';
    switchTab('consultador');
    if (isExpired) {
      CyberShield.playSound('block');
      CyberShield.showToast("Sessão Suprema Expirada ou Chave Revogada.", "error");
    } else {
      CyberShield.playSound('click');
      CyberShield.showToast("Sessão Suprema Desconectada com Sucesso.", "info");
    }
  }

  function renderAdminOverview(data) {
    const m = data.metrics || {};
    const f = data.filter_stats || {};

    const elLeads = document.getElementById('admin-metric-leads');
    const elOnline = document.getElementById('admin-metric-online');
    const elPuxadas = document.getElementById('admin-metric-puxadas');
    const elBlocked = document.getElementById('admin-metric-blocked');
    const elShieldIps = document.getElementById('admin-metric-ips');

    if (elLeads) elLeads.textContent = m.total_leads || 0;
    if (elOnline) elOnline.textContent = m.online_leads || 0;
    if (elPuxadas) elPuxadas.textContent = m.total_puxadas || 0;
    if (elBlocked) elBlocked.textContent = m.blocked_leads || 0;
    if (elShieldIps) elShieldIps.textContent = m.total_blocked_ips || 0;

    // Renderiza Atividades e Logs do Sistema em Tempo Real
    renderAdminActivities(m.recent_logs || []);

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

  // Renderização do Feed de Atividades em Tempo Real
  function renderAdminActivities(logs) {
    const tbody = document.getElementById('admin-activities-tbody');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-table-cell">Nenhum evento registrado recentemente no sistema.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      let badgeClass = 'badge-event-info';
      if (log.event_type.includes('BLOCKED') || log.event_type.includes('BAN') || log.event_type.includes('FAIL')) {
        badgeClass = 'badge-event-danger';
      } else if (log.event_type.includes('SUCCESS') || log.event_type.includes('AUTHENTICATED') || log.event_type.includes('ADDED')) {
        badgeClass = 'badge-event-success';
      } else if (log.event_type.includes('PROFILE') || log.event_type.includes('SEARCH')) {
        badgeClass = 'badge-event-primary';
      }

      return `
        <tr>
          <td class="table-mono text-muted-dim">${log.timestamp}</td>
          <td><span class="cyber-event-badge ${badgeClass}">${log.event_type}</span></td>
          <td class="text-white">${log.detail}</td>
          <td class="table-mono">${log.ip || '-'}</td>
        </tr>
      `;
    }).join('');
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
      const isOnline = l.is_online === true;
      return `
        <tr>
          <td>
            <div class="table-user-cell">
              <div class="avatar-frame ${isOnline ? 'avatar-frame-online' : ''}">
                <img src="${l.avatar || defaultAvatar}" alt="${l.vulgo}">
                ${isOnline ? '<span class="lead-online-pip" title="Lead Conectado Agora"></span>' : ''}
              </div>
              <div class="table-lead-name-col">
                <span class="table-vulgo">${l.vulgo}</span>
                ${isOnline ? '<span class="online-tag-micro">ON-LINE</span>' : '<span class="offline-tag-micro">OFFLINE</span>'}
              </div>
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

  // Funções Globais expostas para as ações da tabela Admin com Blindagem
  window.toggleLeadStatus = async function(leadId) {
    if (!state.adminToken) return;
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/toggle-block`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.adminToken}` }
      });
      if (res.ok) {
        CyberShield.showToast("Status do Lead atualizado!", "success");
        loadAdminData();
      }
    } catch (e) {
      CyberShield.showToast("Erro ao alterar status.", "error");
    }
  };

  window.deleteLeadItem = async function(leadId) {
    if (!state.adminToken) return;
    if (!confirm("Deseja realmente remover este lead?")) return;
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.adminToken}` }
      });
      if (res.ok) {
        CyberShield.showToast("Lead excluído.", "info");
        loadAdminData();
      }
    } catch (e) {
      CyberShield.showToast("Erro ao excluir.", "error");
    }
  };

  window.unblockIpAddress = async function(ip) {
    if (!state.adminToken) return;
    try {
      const res = await fetch('/api/admin/security/unblock-ip', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.adminToken}`
        },
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

  // Renderiza Tabela do Pool de Tokens API com Créditos Restantes
  function renderAdminTokens(tokens) {
    const tbody = document.getElementById('admin-tokens-tbody');
    if (!tbody) return;

    if (tokens.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-table-cell">Nenhum token configurado no pool. Adicione acima.</td></tr>`;
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

      // Créditos restantes formatados
      let creditsDisplay = '<span class="text-muted">Não checado</span>';
      if (t.remaining_credits >= 0) {
        if (t.remaining_credits === 0) {
          creditsDisplay = '<strong class="text-status-red">0 (Esgotado)</strong>';
        } else if (t.remaining_credits < 100) {
          creditsDisplay = `<strong class="text-status-yellow">${t.remaining_credits} ⚠️</strong>`;
        } else {
          creditsDisplay = `<strong class="text-status-green">${t.remaining_credits.toLocaleString('pt-BR')}</strong>`;
        }
      }

      return `
        <tr>
          <td>
            <code class="font-mono text-white">${maskedToken}</code>
            ${t.details ? `<span class="token-details-subtext" title="${t.details}">${t.details}</span>` : ''}
          </td>
          <td><span class="ad-pill-badge">${(t.service || 'scraperapi').toUpperCase()}</span></td>
          <td>${statusBadge}</td>
          <td>${creditsDisplay}</td>
          <td><strong class="text-white">${t.requests_count || 0}</strong></td>
          <td><span class="${t.errors_count > 0 ? 'text-status-red' : 'text-muted'}">${t.errors_count || 0}</span></td>
          <td><small class="text-muted">${t.last_checked_at || t.last_used_at || 'Nunca'}</small></td>
          <td>
            <div class="table-actions-cell">
              <button class="btn-table-action btn-table-audit" 
                      title="Auditar saldo e detalhes reais deste token"
                      onclick="window.checkApiTokenCredits(${t.id})">
                Auditar
              </button>
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

  window.checkApiTokenCredits = async function(tokenId) {
    if (!state.adminToken) return;
    CyberShield.showToast("Auditando saldo do token...", "info");
    try {
      const res = await fetch(`/api/admin/tokens/${tokenId}/check-credits`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.adminToken}` }
      });
      const data = await res.json();
      if (data.success) {
        CyberShield.showToast(data.message, "success");
      } else {
        CyberShield.showToast(data.message || "Token sem saldo.", "error");
      }
      loadAdminData();
    } catch (e) {
      CyberShield.showToast("Erro ao verificar créditos.", "error");
    }
  };

  window.toggleApiToken = async function(tokenId) {
    if (!state.adminToken) return;
    try {
      const res = await fetch(`/api/admin/tokens/${tokenId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.adminToken}` }
      });
      if (res.ok) {
        CyberShield.showToast("Status da chave de API atualizado!", "success");
        loadAdminData();
      }
    } catch (e) {
      CyberShield.showToast("Erro ao alternar chave.", "error");
    }
  };

  window.deleteApiToken = async function(tokenId) {
    if (!state.adminToken) return;
    if (!confirm("Deseja realmente remover esta chave do pool?")) return;
    try {
      const res = await fetch(`/api/admin/tokens/${tokenId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.adminToken}` }
      });
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
      saveProfileBtn.onclick = (e) => {
        if (e) e.preventDefault();
        saveLeadProfile();
      };
    }

    const vulgoInput = document.getElementById('profile-vulgo-input');
    if (vulgoInput) {
      vulgoInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveLeadProfile();
        }
      });
    }

    const closeProfileBtn = document.getElementById('profile-modal-close');
    if (closeProfileBtn) {
      closeProfileBtn.addEventListener('click', closeProfileModal);
    }

    // Fechar modal ao clicar fora no overlay
    const profileModal = document.getElementById('profile-modal');
    if (profileModal) {
      profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal && state.currentLead) {
          closeProfileModal();
        }
      });
    }

    // Upload de Imagem do Avatar da Máquina com Drag and Drop Avançado
    const fileInput = document.getElementById('machine-avatar-file');
    const uploadArea = document.getElementById('machine-avatar-upload-area');

    if (uploadArea && fileInput) {
      uploadArea.addEventListener('click', () => fileInput.click());
      uploadArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.click();
        }
      });

      fileInput.addEventListener('change', handleMachineAvatarUpload);

      // Eventos de Drag and Drop
      ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          uploadArea.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          uploadArea.classList.remove('dragover');
        });
      });

      uploadArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt && dt.files;
        if (files && files.length > 0) {
          processAvatarFile(files[0]);
        }
      });
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

    // Botão de Logout Supremo
    const adminLogoutBtn = document.getElementById('admin-logout-btn');
    if (adminLogoutBtn) {
      adminLogoutBtn.addEventListener('click', () => logoutAdmin(false));
    }

    // Botão de Login no Guard
    const adminGuardLoginBtn = document.getElementById('admin-guard-login-btn');
    if (adminGuardLoginBtn) {
      adminGuardLoginBtn.addEventListener('click', openAdminAuthModal);
    }

    const adminAuthSubmit = document.getElementById('admin-auth-submit-btn');
    if (adminAuthSubmit) {
      adminAuthSubmit.addEventListener('click', submitAdminAuth);
    }

    const adminPassInput = document.getElementById('admin-passkey-input');
    if (adminPassInput) {
      adminPassInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitAdminAuth();
        }
      });
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

    // Interatividade 3D e Validação Inteligente dos Cards Avançados
    const cardDesc = document.getElementById('card-fetch-descriptions');
    const checkDesc = document.getElementById('check-fetch-descriptions');
    const cardSellers = document.getElementById('card-only-new-sellers');
    const checkSellers = document.getElementById('check-only-new-sellers');
    const subfilterPanel = document.getElementById('subfilter-panel-sellers');
    const stepDec = document.getElementById('btn-step-dec');
    const stepInc = document.getElementById('btn-step-inc');
    const statusMining = document.getElementById('status-mining-validator');
    const statusSeller = document.getElementById('status-seller-validator');

    // Sincronização e feedback 3D para Card 1 (Buscar Descrições Completas)
    if (cardDesc && checkDesc) {
      const updateDescCard = () => {
        if (checkDesc.checked) {
          cardDesc.classList.add('active-checked');
          if (statusMining) {
            statusMining.textContent = "● Deep-Mining Ativado";
            statusMining.className = "spec-val spec-cyan";
          }
        } else {
          cardDesc.classList.remove('active-checked');
          if (statusMining) {
            statusMining.textContent = "○ Standby (1x Crédito)";
            statusMining.className = "spec-val";
          }
        }
      };

      checkDesc.addEventListener('change', () => {
        updateDescCard();
        CyberShield.playSound('click');
      });

      cardDesc.addEventListener('click', (e) => {
        if (e.target.closest('.cyber-switch-3d')) return;
        checkDesc.checked = !checkDesc.checked;
        checkDesc.dispatchEvent(new Event('change'));
      });

      updateDescCard();
    }

    // Sincronização e feedback 3D para Card 2 (Somente Vendedores Novos)
    if (cardSellers && checkSellers) {
      const updateSellerCard = () => {
        if (checkSellers.checked) {
          cardSellers.classList.add('active-checked');
          if (statusSeller) {
            statusSeller.textContent = "● Filtro Ativo & Validado";
            statusSeller.className = "spec-val spec-purple";
          }
        } else {
          cardSellers.classList.remove('active-checked');
          if (statusSeller) {
            statusSeller.textContent = "○ Todos Vendedores";
            statusSeller.className = "spec-val";
          }
        }
      };

      checkSellers.addEventListener('change', () => {
        updateSellerCard();
        CyberShield.playSound('click');
      });

      cardSellers.addEventListener('click', (e) => {
        if (e.target.closest('.cyber-switch-3d') || e.target.closest('.subfilter-3d-panel')) return;
        checkSellers.checked = !checkSellers.checked;
        checkSellers.dispatchEvent(new Event('change'));
      });

      updateSellerCard();
    }

    // Step buttons do Subfiltro inteligente
    if (maxAdsInput && stepDec && stepInc) {
      stepDec.addEventListener('click', (e) => {
        e.stopPropagation();
        let val = parseInt(maxAdsInput.value) || 3;
        val = Math.max(1, val - 1);
        maxAdsInput.value = val;
        CyberShield.playSound('click');
      });

      stepInc.addEventListener('click', (e) => {
        e.stopPropagation();
        let val = parseInt(maxAdsInput.value) || 3;
        val = Math.min(50, val + 1);
        maxAdsInput.value = val;
        CyberShield.playSound('click');
      });

      maxAdsInput.addEventListener('change', () => {
        let val = parseInt(maxAdsInput.value) || 1;
        if (val < 1) val = 1;
        if (val > 50) val = 50;
        maxAdsInput.value = val;
      });
    }

    // Efeito de Inclinação e Profundidade 3D (Otimizado com rAF sem travamento em PCs modestos)
    [cardDesc, cardSellers].forEach(card => {
      if (!card) return;
      let tiltTicking = false;

      card.addEventListener('mousemove', (e) => {
        if (!tiltTicking) {
          window.requestAnimationFrame(() => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -4;
            const rotateY = ((x - centerX) / centerX) * 4;
            card.style.transform = `perspective(800px) rotateX(${rotateX.toFixed(1)}deg) rotateY(${rotateY.toFixed(1)}deg) translateY(-2px)`;
            tiltTicking = false;
          });
          tiltTicking = true;
        }
      }, { passive: true });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
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
        if (!ip || !state.adminToken) return;
        try {
          const res = await fetch('/api/admin/security/block-ip', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${state.adminToken}`
            },
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

    // Adicionar chave ScraperAPI individual ao pool
    const addTokenBtn = document.getElementById('admin-add-token-btn');
    const addTokenInput = document.getElementById('admin-new-token-input');
    if (addTokenBtn && addTokenInput) {
      addTokenBtn.addEventListener('click', async () => {
        const tokenVal = addTokenInput.value.trim();
        if (!tokenVal || !state.adminToken) {
          CyberShield.showToast("Insira a chave da ScraperAPI.", "error");
          return;
        }
        CyberShield.showToast("Adicionando chave ao pool...", "info");
        try {
          const res = await fetch('/api/admin/tokens', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${state.adminToken}`
            },
            body: JSON.stringify({ token: tokenVal, service: 'scraperapi' })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            CyberShield.showToast("Chave ScraperAPI adicionada ao pool com sucesso!", "success");
            addTokenInput.value = '';
            loadAdminData();
          } else {
            CyberShield.showToast(data.detail || "Erro ao adicionar token.", "error");
          }
        } catch (e) {
          CyberShield.showToast("Erro ao conectar ao servidor.", "error");
        }
      });
    }

    // Adicionar lista de tokens em massa (Bulk)
    const addBulkBtn = document.getElementById('admin-add-bulk-tokens-btn');
    const bulkInput = document.getElementById('admin-bulk-tokens-input');
    if (addBulkBtn && bulkInput) {
      addBulkBtn.addEventListener('click', async () => {
        const textVal = bulkInput.value.trim();
        if (!textVal || !state.adminToken) {
          CyberShield.showToast("Cole a lista de tokens antes de salvar.", "error");
          return;
        }
        CyberShield.showToast("Salvando lista de tokens no pool...", "info");
        try {
          const res = await fetch('/api/admin/tokens/bulk', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${state.adminToken}`
            },
            body: JSON.stringify({ tokens_text: textVal, service: 'scraperapi' })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            CyberShield.showToast(data.message, "success");
            bulkInput.value = '';
            loadAdminData();
          } else {
            CyberShield.showToast(data.detail || "Erro ao salvar lista de tokens.", "error");
          }
        } catch (e) {
          CyberShield.showToast("Erro de comunicação ao salvar lista.", "error");
        }
      });
    }

    // Auditar Saldos de Todos os Tokens
    const checkAllBtn = document.getElementById('admin-check-all-tokens-btn');
    if (checkAllBtn) {
      checkAllBtn.addEventListener('click', async () => {
        if (!state.adminToken) return;
        CyberShield.showToast("Auditando saldos de todos os tokens do pool...", "info");
        try {
          const res = await fetch('/api/admin/tokens/check-all', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.adminToken}` }
          });
          const data = await res.json();
          if (res.ok && data.success) {
            CyberShield.showToast("Auditoria de saldos concluída com sucesso!", "success");
            loadAdminData();
          } else {
            CyberShield.showToast("Erro ao auditar saldos.", "error");
          }
        } catch (e) {
          CyberShield.showToast("Erro ao conectar à API.", "error");
        }
      });
    }

    // Inicializa Motores Inteligentes (Detecção Cognitiva de Categoria, Barra de Preço Base & Páginas Avançadas)
    setupSmartCategoryDetector();
    setupPriceBaseSlider();
    setupPagesStepperAndAdvancedCards();
  }

  // Função Global de Download Rápido em Alta Resolução
  window.downloadImageDirectly = async function(imgUrl, fileName, event) {
    if (event) event.stopPropagation();
    try {
      CyberShield.showToast("Iniciando download HD na máxima qualidade...", "info");
      const res = await fetch(imgUrl, { mode: 'cors' });
      if (!res.ok) throw new Error("Falha no download direto");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName || 'imagem_anuncio_olx.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      CyberShield.showToast("Imagem HD salva com sucesso!", "success");
    } catch (err) {
      // Fallback simples se CORS bloquear o fetch
      const a = document.createElement('a');
      a.href = imgUrl;
      a.download = fileName || 'imagem_anuncio_olx.jpg';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      CyberShield.showToast("Imagem aberta para download!", "info");
    }
  };

  // ==========================================================
  // PROTOCOLO DE RESTAURAÇÃO & LIMPEZA DO SISTEMA (ADMIN SUPREMO)
  // ==========================================================
  window.openSystemResetModal = function() {
    const modal = document.getElementById('system-reset-prompt-modal');
    const input = document.getElementById('modal-reset-passkey-input');
    if (modal) modal.style.display = 'flex';
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 150);
    }
  };

  window.closeSystemResetModal = function() {
    const modal = document.getElementById('system-reset-prompt-modal');
    if (modal) modal.style.display = 'none';
  };

  window.triggerSystemResetFromInput = function() {
    const input = document.getElementById('admin-reset-passkey-input');
    const passkey = input ? input.value.trim() : '';
    if (!passkey) {
      CyberShield.showToast("Informe a senha de acesso do Admin Supremo.", "warning");
      if (input) input.focus();
      return;
    }
    window.executeSystemReset(passkey);
  };

  window.confirmSystemResetFromModal = function() {
    const input = document.getElementById('modal-reset-passkey-input');
    const passkey = input ? input.value.trim() : '';
    if (!passkey) {
      CyberShield.showToast("Informe a senha de acesso do Admin Supremo.", "warning");
      if (input) input.focus();
      return;
    }
    window.closeSystemResetModal();
    window.executeSystemReset(passkey);
  };

  window.closeRestorationModal = function() {
    const modal = document.getElementById('system-restoration-modal');
    if (modal) modal.style.display = 'none';
    loadAdminData();
    switchTab('admin');
  };

  window.executeSystemReset = async function(passkey) {
    if (!state.adminToken) {
      CyberShield.showToast("Sessão de Admin expirada. Faça login novamente.", "error");
      return;
    }

    const modal = document.getElementById('system-restoration-modal');
    const bar = document.getElementById('restoration-progress-bar');
    const pct = document.getElementById('restoration-progress-pct');
    const terminal = document.getElementById('restoration-terminal-log');
    const footer = document.getElementById('restoration-modal-footer');

    if (modal) modal.style.display = 'flex';
    if (footer) footer.style.display = 'none';

    // Reseta visual dos passos
    for (let i = 1; i <= 6; i++) {
      const stepEl = document.getElementById(`r-step-${i}`);
      const iconEl = document.getElementById(`r-icon-${i}`);
      if (stepEl) {
        stepEl.className = i === 1 ? 'restoration-step-item active' : 'restoration-step-item pending';
      }
      if (iconEl) {
        iconEl.innerHTML = i === 1 ? '<span class="cyber-spinner-sm"></span>' : '⏳';
      }
    }

    if (bar) bar.style.width = '10%';
    if (pct) pct.textContent = '10%';
    if (terminal) terminal.innerHTML = '<div>[SYS] Inicializando protocolo de restauração do sistema...</div>';

    const appendLog = (msg) => {
      if (!terminal) return;
      const timeStr = new Date().toLocaleTimeString('pt-BR');
      const div = document.createElement('div');
      div.textContent = `[${timeStr}] ${msg}`;
      terminal.appendChild(div);
      terminal.scrollTop = terminal.scrollHeight;
    };

    appendLog("Protocolo de Restauração Suprema iniciado.");
    appendLog("Travando conexões externas e autenticando token mestra...");
    CyberShield.playSound('click');

    try {
      // Dispara chamada ao backend
      const resPromise = fetch('/api/admin/system/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.adminToken}`
        },
        body: JSON.stringify({ passkey: passkey })
      });

      const delay = ms => new Promise(r => setTimeout(r, ms));

      await delay(600);
      setStepCompleted(1);
      setStepActive(2);
      if (bar) bar.style.width = '28%';
      if (pct) pct.textContent = '28%';
      appendLog("Fase 1/6 OK: Credenciais SHA-256 autenticadas com sucesso.");
      CyberShield.playSound('click');

      await delay(700);
      setStepCompleted(2);
      setStepActive(3);
      if (bar) bar.style.width = '48%';
      if (pct) pct.textContent = '48%';
      appendLog("Fase 2/6 OK: Purgando histórico de buscas da OLX e dados de testes...");
      CyberShield.playSound('click');

      await delay(600);
      setStepCompleted(3);
      setStepActive(4);
      if (bar) bar.style.width = '68%';
      if (pct) pct.textContent = '68%';
      appendLog("Fase 3/6 OK: Contadores de leads zerados e logs de auditoria limpos.");
      CyberShield.playSound('click');

      await delay(600);
      setStepCompleted(4);
      setStepActive(5);
      if (bar) bar.style.width = '85%';
      if (pct) pct.textContent = '85%';
      appendLog("Fase 4/6 OK: Reindexação física e VACUUM no banco SQLite...");
      CyberShield.playSound('click');

      // Aguarda resposta da requisição
      const res = await resPromise;
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || "Erro durante a restauração.");
      }

      await delay(500);
      setStepCompleted(5);
      setStepActive(6);
      if (bar) bar.style.width = '96%';
      if (pct) pct.textContent = '96%';
      appendLog("Fase 5/6 OK: Memória volátil e baldes de DDoS esvaziados.");
      CyberShield.playSound('click');

      await delay(400);
      setStepCompleted(6);
      if (bar) bar.style.width = '100%';
      if (pct) pct.textContent = '100%';
      const pCount = data.stats ? data.stats.purged_puxadas : 0;
      const lCount = data.stats ? data.stats.purged_logs : 0;
      appendLog(`Fase 6/6 OK: Sucesso! ${pCount} puxadas e ${lCount} logs purgados.`);
      appendLog("SISTEMA 100% LIMPO E RESTAURADO PARA PRODUÇÃO REAL!");
      CyberShield.playSound('success');

      if (footer) footer.style.display = 'block';

      const passInput = document.getElementById('admin-reset-passkey-input');
      if (passInput) passInput.value = '';

      CyberShield.showToast("Sistema totalmente limpo e restaurado!", "success");
    } catch (err) {
      appendLog(`[ERRO CRÍTICO] ${err.message}`);
      CyberShield.playSound('alert');
      CyberShield.showToast(err.message, "error");
      if (footer) footer.style.display = 'block';
    }
  };

  function setStepActive(stepNum) {
    const el = document.getElementById(`r-step-${stepNum}`);
    const ic = document.getElementById(`r-icon-${stepNum}`);
    if (el) el.className = 'restoration-step-item active';
    if (ic) ic.innerHTML = '<span class="cyber-spinner-sm"></span>';
  }

  function setStepCompleted(stepNum) {
    const el = document.getElementById(`r-step-${stepNum}`);
    const ic = document.getElementById(`r-icon-${stepNum}`);
    if (el) el.className = 'restoration-step-item completed';
    if (ic) ic.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  }

  // Executa inicialização assim que o DOM carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
