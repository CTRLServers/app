const CardManager = {
  MAX_CARDS: 30,
  _pages: {},

  _storageKey(pageId) {
    return 'ctrl_cards_' + pageId;
  },

  _load(pageId) {
    if (this._pages[pageId]) return this._pages[pageId];
    try {
      const raw = localStorage.getItem(this._storageKey(pageId));
      this._pages[pageId] = raw ? JSON.parse(raw) : { cards: [], styles: {} };
    } catch (e) {
      this._pages[pageId] = { cards: [], styles: {} };
    }
    return this._pages[pageId];
  },

  _save(pageId) {
    try {
      localStorage.setItem(this._storageKey(pageId), JSON.stringify(this._pages[pageId] || { cards: [], styles: {} }));
    } catch (e) {}
  },

  registerCard(pageId, cardId, config) {
    const data = this._load(pageId);
    const existing = data.cards.find(c => c.id === cardId);
    if (existing) {
      Object.assign(existing, config);
      this._save(pageId);
      return true;
    }
    if (data.cards.length >= this.MAX_CARDS) return false;
    data.cards.push({
      id: cardId,
      title: config.title || cardId,
      order: config.order !== undefined ? config.order : data.cards.length,
      render: config.render || (() => ''),
      ...config
    });
    data.cards.sort((a, b) => a.order - b.order);
    this._save(pageId);
    return true;
  },

  removeCard(pageId, cardId) {
    const data = this._load(pageId);
    data.cards = data.cards.filter(c => c.id !== cardId);
    data.cards.forEach((c, i) => c.order = i);
    if (data.styles) delete data.styles[cardId];
    this._save(pageId);
  },

  getCards(pageId) {
    const data = this._load(pageId);
    return (data.cards || []).slice().sort((a, b) => a.order - b.order);
  },

  reorderCards(pageId, cardIds) {
    const data = this._load(pageId);
    cardIds.forEach((id, i) => {
      const card = data.cards.find(c => c.id === id);
      if (card) card.order = i;
    });
    this._save(pageId);
  },

  setCardStyle(pageId, cardId, styles) {
    const data = this._load(pageId);
    if (!data.styles) data.styles = {};
    data.styles[cardId] = { ...(data.styles[cardId] || {}), ...styles };
    this._save(pageId);
  },

  getCardStyle(pageId, cardId) {
    const data = this._load(pageId);
    return (data.styles && data.styles[cardId]) || {};
  },

  resetCardStyle(pageId, cardId) {
    const data = this._load(pageId);
    if (data.styles) delete data.styles[cardId];
    this._save(pageId);
  },

  renderPage(pageId, server) {
    const data = this._load(pageId);
    const cards = (data.cards || []).slice().sort((a, b) => a.order - b.order);

    if (!cards.length) {
      return '<div class="card-manager-empty">No cards.</div>';
    }

    let html = '<div class="card-manager" data-page-id="' + pageId + '">';
    html += '<div class="card-manager-grid">';
    for (const card of cards) {
      const styles = data.styles[card.id] || {};
      const styleStr = this._buildStyleStr(styles);
      html += '<div class="card-manager-card" data-card-id="' + card.id + '" style="' + styleStr + '">';
      html += '<div class="card-content">';
      if (typeof card.render === 'function') {
        html += card.render(server);
      }
      html += '</div></div>';
    }
    html += '</div></div>';
    return html;
  },

  _buildStyleStr(styles) {
    const parts = [];
    if (styles.width) parts.push('width:' + styles.width);
    if (styles.minWidth) parts.push('min-width:' + styles.minWidth);
    if (styles.maxWidth) parts.push('max-width:' + styles.maxWidth);
    if (styles.backgroundColor) parts.push('background-color:' + styles.backgroundColor);
    if (styles.borderColor) parts.push('border-color:' + styles.borderColor);
    if (styles.borderRadius) parts.push('border-radius:' + styles.borderRadius);
    if (styles.padding) parts.push('padding:' + styles.padding);
    if (styles.opacity !== undefined) parts.push('opacity:' + styles.opacity);
    return parts.join(';');
  },

  rerenderPage(pageId) {
    const container = document.getElementById('tabServerPluginPage-' + pageId);
    if (!container) return;
    container.innerHTML = this.renderPage(pageId, App.currentServer);
  },

  initPageEvents(pageId) {}
};
