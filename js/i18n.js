const I18n = {
  STORAGE_KEY: 'ctrl_language',
  BASE_LANG: 'en',
  lang: null,
  en: {},
  dict: {},
  ready: null,

  available: [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'it', name: 'Italiano' },
  ],

  getlang() {
    if (this.lang) return this.lang;
    let saved = null;
    try { saved = localStorage.getItem(this.STORAGE_KEY); } catch (e) {}
    this.lang = (saved && this.available.some(l => l.code === saved)) ? saved : this.detect();
    return this.lang;
  },

  detect() {
    try {
      const cand = (navigator.language || this.BASE_LANG).toLowerCase();
      const exact = this.available.find(l => l.code.toLowerCase() === cand);
      if (exact) return exact.code;
      const base = cand.split('-')[0];
      const partial = this.available.find(l => l.code.toLowerCase() === base);
      return partial ? partial.code : this.BASE_LANG;
    } catch (e) {
      return this.BASE_LANG;
    }
  },

  loaddict(code) {
    return new Promise(resolve => {
      const done = data => resolve(data && typeof data === 'object' ? data : {});
      if (window.electronAPI && window.electronAPI.getlocale) {
        window.electronAPI.getlocale(code).then(done).catch(() => done({}));
      } else {
        fetch('locales/' + encodeURIComponent(code) + '.json')
          .then(r => r.ok ? r.json() : {})
          .then(done)
          .catch(() => done({}));
      }
    });
  },

  init() {
    this.getlang();
    this.ready = (async () => {
      await this.loadcustomlocales();
      this.lang = null;
      this.getlang();
      this.en = await this.loaddict(this.BASE_LANG);
      if (this.lang !== this.BASE_LANG) this.dict = await this.loaddict(this.lang);
      document.documentElement.lang = this.lang;
      this.applydom();
    })();
    return this.ready;
  },

  async loadcustomlocales() {
    if (!window.electronAPI || !window.electronAPI.getcustomlocales) return;
    try {
      const list = await window.electronAPI.getcustomlocales();
      if (!Array.isArray(list)) return;
      for (const item of list) {
        if (!item || typeof item.code !== 'string' || !item.code) continue;
        if (this.available.some(l => l.code === item.code)) continue;
        this.available.push({ code: item.code, name: item.name || item.code, custom: true });
      }
    } catch (e) {}
  },

  t(key, vars) {
    let str = this.dict[key] != null ? this.dict[key]
      : (this.en[key] != null ? this.en[key] : key);
    if (vars) {
      for (const k in vars) str = str.split('{' + k + '}').join(String(vars[k]));
    }
    return str;
  },

  setLang(code) {
    if (!this.available.some(l => l.code === code)) return;
    try { localStorage.setItem(this.STORAGE_KEY, code); } catch (e) {}
    this.lang = code;
    window.location.reload();
  },

  applydom() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const value = this.t(el.dataset.i18n);
      const texts = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.nodeValue.trim());
      const target = texts.length ? texts[texts.length - 1] : document.createTextNode(value);
      if (!texts.length) el.appendChild(target);
      target.nodeValue = value;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.setAttribute('title', this.t(el.dataset.i18nTitle));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.setAttribute('placeholder', this.t(el.dataset.i18nPlaceholder));
    });
    this.applynav();
  },

  applynav() {
    const exceptions = {
      minecraft: 'ctrlmanage',
      selfhost: 'monitoring',
    };
    const anchors = document.querySelectorAll('#mainNav a[data-page], #serverNav a[data-server-page]');
    anchors.forEach(a => {
      const id = a.dataset.page || a.dataset.serverPage;
      if (!id) return;
      const label = a.querySelector('span:first-of-type');
      if (label) label.textContent = this.t('nav.' + (exceptions[id] || id));
    });
    const title = document.querySelector('.workspaces-title');
    if (title) title.textContent = this.t('workspaces.title');
  },
};

window.I18n = I18n;
window.t = (key, vars) => I18n.t(key, vars);
I18n.init();
