// Componente de Dropdown Avançado ("Drop Doll") Customizado Monochrome
window.CyberDropdown = (function() {
  function init(containerSelector, options = {}) {
    const container = document.querySelector(containerSelector);
    if (!container) return null;

    const {
      placeholder = "Selecione uma opção",
      items = [], // [{ value, label, badge, icon }]
      selectedValue = "",
      hasSearch = false,
      searchPlaceholder = "Filtrar opções...",
      onChange = () => {}
    } = options;

    let currentVal = selectedValue || (items.length > 0 ? items[0].value : "");
    let isOpen = false;

    // Constrói a estrutura HTML customizada
    container.classList.add("cyber-dropdown-root");
    container.innerHTML = `
      <div class="cyber-dropdown-trigger" tabindex="0">
        <span class="cyber-dropdown-trigger-text"></span>
        <svg class="cyber-dropdown-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="cyber-dropdown-menu">
        ${hasSearch ? `
          <div class="cyber-dropdown-search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" class="cyber-dropdown-search-input" placeholder="${searchPlaceholder}" autocomplete="off">
          </div>
        ` : ''}
        <div class="cyber-dropdown-list"></div>
      </div>
      <input type="hidden" class="cyber-dropdown-hidden-input" value="${currentVal}">
    `;

    const trigger = container.querySelector(".cyber-dropdown-trigger");
    const triggerText = container.querySelector(".cyber-dropdown-trigger-text");
    const chevron = container.querySelector(".cyber-dropdown-chevron");
    const menu = container.querySelector(".cyber-dropdown-menu");
    const list = container.querySelector(".cyber-dropdown-list");
    const searchInput = container.querySelector(".cyber-dropdown-search-input");
    const hiddenInput = container.querySelector(".cyber-dropdown-hidden-input");

    function renderList(filteredItems) {
      if (filteredItems.length === 0) {
        list.innerHTML = `<div class="cyber-dropdown-empty">Nenhum resultado</div>`;
        return;
      }

      list.innerHTML = filteredItems.map(it => {
        const isSelected = it.value === currentVal;
        return `
          <div class="cyber-dropdown-item ${isSelected ? 'selected' : ''}" data-val="${it.value}">
            <span class="cyber-dropdown-item-label">${it.label}</span>
            ${it.badge ? `<span class="cyber-dropdown-item-badge">${it.badge}</span>` : ''}
            ${isSelected ? `
              <svg class="cyber-dropdown-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            ` : ''}
          </div>
        `;
      }).join('');

      list.querySelectorAll(".cyber-dropdown-item").forEach(el => {
        el.addEventListener("click", () => {
          const val = el.getAttribute("data-val");
          setValue(val);
          close();
          if (window.CyberShield) CyberShield.playSound("click");
        });
      });
    }

    function updateTriggerText() {
      const selected = items.find(it => it.value === currentVal);
      if (selected) {
        triggerText.textContent = selected.label;
      } else {
        triggerText.textContent = placeholder;
      }
    }

    function setValue(val) {
      currentVal = val;
      hiddenInput.value = val;
      updateTriggerText();
      renderList(items);
      onChange(val);
    }

    function open() {
      // Fecha qualquer outro dropdown aberto na página
      document.querySelectorAll(".cyber-dropdown-root.open").forEach(other => {
        if (other !== container) {
          other.classList.remove("open");
          const otherMenu = other.querySelector(".cyber-dropdown-menu");
          if (otherMenu) otherMenu.classList.remove("open-upward");
          const otherGrp = other.closest(".filter-group");
          if (otherGrp) otherGrp.classList.remove("has-open-dropdown");
        }
      });

      isOpen = true;
      container.classList.add("open");

      // Eleva o empilhamento z-index dos contêineres pais
      const group = container.closest(".filter-group");
      if (group) group.classList.add("has-open-dropdown");
      const card = container.closest(".control-glass-card");
      if (card) card.classList.add("has-open-dropdown");

      // Detecção inteligente de espaço na tela (inverte para cima se faltar espaço abaixo)
      if (menu) {
        const triggerRect = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - triggerRect.bottom;
        if (spaceBelow < 280 && triggerRect.top > 280) {
          menu.classList.add("open-upward");
        } else {
          menu.classList.remove("open-upward");
        }
      }

      if (searchInput) {
        searchInput.value = "";
        renderList(items);
        setTimeout(() => searchInput.focus(), 50);
      }
    }

    function close() {
      isOpen = false;
      container.classList.remove("open");
      if (menu) menu.classList.remove("open-upward");

      const group = container.closest(".filter-group");
      if (group) group.classList.remove("has-open-dropdown");
      const card = container.closest(".control-glass-card");
      if (card && !card.querySelector(".cyber-dropdown-root.open")) {
        card.classList.remove("has-open-dropdown");
      }
    }

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isOpen) close(); else open();
    });

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = items.filter(it => 
          it.label.toLowerCase().includes(query) || 
          (it.value && it.value.toLowerCase().includes(query))
        );
        renderList(filtered);
      });
      searchInput.addEventListener("click", (e) => e.stopPropagation());
    }

    // Fecha ao clicar fora
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        close();
      }
    });

    // Tecla Escape para fechar
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen) {
        close();
      }
    });

    // Inicializa valores
    updateTriggerText();
    renderList(items);

    return {
      getValue: () => currentVal,
      setValue: (val) => setValue(val),
      setItems: (newItems, defaultVal) => {
        items.length = 0;
        items.push(...newItems);
        setValue(defaultVal || (items[0] ? items[0].value : ""));
      }
    };
  }

  return { create: init };
})();
