/* ==========================================================================
   Pustakam — book catalogue
   Plain JavaScript, no dependencies. Sections:
   1.  Configuration (colours, limits)
   2.  Utilities
   3.  Storage (localStorage, versioned key)
   4.  State
   5.  Categories (created by the owner, never preset)
   6.  Filtering & sorting
   7.  Rendering
   8.  Overlays (focus trap, drawer, dialog, menu)
   9.  Form, category picker & validation
   10. Book actions (save, delete, undo)
   11. Toasts
   12. Backup on this device (CSV download & restore)
   13. Theme
   14. Event handling
   15. Start-up
   ========================================================================== */
(function () {
  'use strict';

  /* 1. Configuration ====================================================== */

  const STORAGE_KEY = 'pustakam_v1';
  const SCHEMA_VERSION = 1;
  const MIN_YEAR = 1400;
  const CURRENT_YEAR = new Date().getFullYear();
  const MAX_CATEGORY_LENGTH = 40;

  // Spine colours handed out, in order, to each new category the owner creates.
  // Muted, medium tones that read well on both the light and dark themes.
  const CATEGORY_COLORS = [
    '#8B5E83', // plum
    '#4F7A8A', // slate teal
    '#B5838D', // dusty rose
    '#A47148', // ochre
    '#3F6E8C', // steel blue
    '#5B7F5E', // sage
    '#C08A3E', // mustard
    '#8C6A4F', // umber
    '#A5675A', // clay
    '#5D6B8A', // indigo grey
    '#9C7A3C', // antique gold
    '#4E8079', // deep teal
    '#7A5F6E', // mauve
    '#B07A5B', // copper
    '#6A7F9C', // denim
    '#6E8B74'  // green grey
  ];

  const TEXT_SORT_KEYS = ['name', 'writer', 'publisher'];
  const SORT_KEYS = ['recent', 'name', 'writer', 'publisher', 'firstEdition', 'thisEdition'];

  /* 2. Utilities ========================================================== */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escape any user text before it goes into innerHTML. */
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
  }

  /** Unique id per book: crypto.randomUUID with a fallback for older browsers. */
  function uid() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  /** Tidy user text: Unicode-normalise (important for Malayalam) and collapse spaces. */
  function cleanText(value) {
    return String(value == null ? '' : value).normalize('NFC').replace(/\s+/g, ' ').trim();
  }

  /** Comparison key: normalised and lower-cased (a no-op for scripts without case). */
  function norm(value) {
    return cleanText(value).toLocaleLowerCase();
  }

  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  const MALAYALAM = /[ഀ-ൿ]/;
  /** Mark Malayalam text so CSS can use the right font settings (no fake italics). */
  function langAttr(text) {
    return MALAYALAM.test(text) ? ' lang="ml"' : '';
  }

  function icon(name, cls) {
    return `<svg class="${cls || 'icon'}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function toYear(value) {
    const n = parseInt(String(value == null ? '' : value).trim(), 10);
    return Number.isInteger(n) && n >= 1000 && n <= 9999 ? n : null;
  }

  function plural(n, one, many) {
    return n === 1 ? one : many;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* 3. Storage ============================================================ */

  const storage = {
    available: false,

    /** Check that localStorage can be written (it throws in some private modes). */
    test() {
      try {
        const k = '__pustakam_test__';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        return true;
      } catch (e) {
        return false;
      }
    },

    load() {
      let raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        // Unreadable data: keep a copy aside so nothing is lost, then start fresh.
        console.warn('Pustakam: saved data could not be read.', e);
        try { if (raw) localStorage.setItem(`${STORAGE_KEY}_unreadable`, raw); } catch (_) { /* ignore */ }
        return null;
      }
    },

    save(data) {
      if (!this.available) return false;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        console.warn('Pustakam: could not save.', e);
        return false;
      }
    }
  };

  /* 4. State ============================================================== */

  const state = {
    books: [],        // { id, name, writer, publisher, firstEdition, thisEdition, category, createdAt, updatedAt }
    categories: [],   // { name, color } — every category the owner has created
    prefs: { theme: 'light', view: 'grid', sortKey: 'recent', sortDir: 'desc', backup: { lastAt: null, changes: 0 } },
    // prefs.backup: when the last CSV backup was downloaded, and how many changes since — see section 12.
    query: '',
    category: 'all',  // normalised category key, or 'all'
    editingId: null,
    lastSignature: ''
  };

  let saveWarningShown = false;

  /** Write everything to localStorage under the single versioned key. */
  function persist() {
    const ok = storage.save({
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      books: state.books,
      categories: state.categories,
      prefs: state.prefs
    });
    if (!ok && storage.available && !saveWarningShown) {
      saveWarningShown = true;
      toast('Could not save — browser storage may be full. Export a backup to be safe.', { tone: 'danger', icon: 'alert', duration: 8000 });
    }
    return ok;
  }

  /**
   * Save after the books themselves changed (add, edit, delete, import).
   * Unlike persist(), this also counts the change for the backup reminder.
   */
  function saveData() {
    state.prefs.backup.changes += 1;
    persist();
    renderBackupStatus();
  }

  /** Turn untrusted data (saved or imported) into a clean book object. */
  function sanitizeBook(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const now = Date.now();
    const book = {
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 64) : uid(),
      name: cleanText(raw.name != null ? raw.name : raw.title),
      writer: cleanText(raw.writer != null ? raw.writer : raw.author),
      publisher: cleanText(raw.publisher),
      firstEdition: toYear(raw.firstEdition != null ? raw.firstEdition : raw.firstEditionYear),
      thisEdition: toYear(raw.thisEdition != null ? raw.thisEdition : raw.thisEditionYear),
      category: cleanText(raw.category).slice(0, MAX_CATEGORY_LENGTH) || 'Uncategorised',
      createdAt: Number(raw.createdAt) || now,
      updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || now
    };
    return book.name ? book : null;
  }

  function sanitizeCategories(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    list.forEach((c) => {
      const name = cleanText(c && typeof c === 'object' ? c.name : c).slice(0, MAX_CATEGORY_LENGTH);
      if (!name || seen.has(norm(name))) return;
      seen.add(norm(name));
      const color = c && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : null;
      out.push({ name, color });
    });
    return out;
  }

  function duplicateKey(b) {
    return `${norm(b.name)}|${norm(b.writer)}|${b.thisEdition}`;
  }

  /* 5. Categories ========================================================= */

  function findCategory(name) {
    const key = norm(name);
    return state.categories.find((c) => norm(c.name) === key) || null;
  }

  /** The next unused colour from the palette (falls back to a stable hash). */
  function nextCategoryColor(name) {
    const used = new Set(state.categories.map((c) => c.color.toLowerCase()));
    return CATEGORY_COLORS.find((c) => !used.has(c.toLowerCase()))
      || CATEGORY_COLORS[hashString(norm(name)) % CATEGORY_COLORS.length];
  }

  /**
   * Make sure a category exists and return its canonical name, so
   * "poetry" typed later matches the "Poetry" created earlier.
   */
  function ensureCategory(name, preferredColor) {
    const clean = cleanText(name).slice(0, MAX_CATEGORY_LENGTH);
    const existing = findCategory(clean);
    if (existing) return existing.name;
    state.categories.push({ name: clean, color: preferredColor || nextCategoryColor(clean) });
    return clean;
  }

  /** Drop categories that no book uses any more (run on start-up only, so Undo keeps colours). */
  function pruneCategories() {
    const used = new Set(state.books.map((b) => norm(b.category)));
    state.categories = state.categories.filter((c) => used.has(norm(c.name)));
  }

  function sortedCategories() {
    return state.categories.slice().sort((a, b) => collator.compare(a.name, b.name));
  }

  function categoryCounts() {
    const counts = new Map();
    state.books.forEach((b) => {
      const key = norm(b.category);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }

  function colorOf(name) {
    const c = findCategory(name);
    return c ? c.color : CATEGORY_COLORS[hashString(norm(name)) % CATEGORY_COLORS.length];
  }

  /* 6. Filtering & sorting ================================================ */

  function sortBooks(list) {
    const { sortKey, sortDir } = state.prefs;
    const dir = sortDir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      let r;
      if (sortKey === 'recent') {
        r = a.createdAt - b.createdAt;
      } else if (TEXT_SORT_KEYS.includes(sortKey)) {
        r = collator.compare(a[sortKey], b[sortKey]);
      } else {
        const av = a[sortKey], bv = b[sortKey];
        if (av == null && bv == null) r = 0;
        else if (av == null) return 1;   // missing years always last
        else if (bv == null) return -1;
        else r = av - bv;
      }
      return r * dir || collator.compare(a.name, b.name);
    });
  }

  function visibleBooks() {
    const terms = norm(state.query).split(' ').filter(Boolean);
    let list = state.books;
    if (state.category !== 'all') list = list.filter((b) => norm(b.category) === state.category);
    if (terms.length) {
      list = list.filter((b) => {
        const haystack = norm(`${b.name} ${b.writer} ${b.publisher}`);
        return terms.every((t) => haystack.includes(t));
      });
    }
    return sortBooks(list);
  }

  /* 7. Rendering ========================================================== */

  const els = {
    content: $('.content'),
    catalogue: $('#catalogue'),
    chips: $('#chips'),
    sideCats: $('#sideCats'),
    sideHint: $('#sideHint'),
    resultCount: $('#resultCount'),
    clearFilters: $('#clearFilters'),
    search: $('#search'),
    sort: $('#sort'),
    sortDir: $('#sortDir'),
    viewBtns: $$('.seg-btn'),
    emptyTpl: $('#emptyTpl'),
    noResultsTpl: $('#noResultsTpl')
  };

  /** Re-render everything that depends on the data. */
  function render(opts) {
    const options = Object.assign({ animate: false, flashId: null }, opts);
    // If the active category no longer has any books, fall back to "All".
    if (state.category !== 'all' && !state.books.some((b) => norm(b.category) === state.category)) {
      state.category = 'all';
    }
    const list = visibleBooks();
    els.content.classList.toggle('is-empty', !state.books.length);
    renderStats();
    renderFilters();
    renderControls();
    renderCount(list.length);
    renderCatalogue(list, options);
  }

  function renderStats() {
    const unique = (key) => new Set(state.books.map((b) => norm(b[key])).filter(Boolean)).size;
    const values = {
      books: state.books.length,
      writers: unique('writer'),
      publishers: unique('publisher'),
      categories: unique('category')
    };
    Object.keys(values).forEach((k) => countTo($(`[data-stat="${k}"]`), values[k]));
  }

  /** Animate a number from its current value to the target. */
  function countTo(el, target) {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = target;
    if (from === target || reducedMotion.matches) { el.textContent = target.toLocaleString(); return; }
    const duration = 700;
    const start = performance.now();
    cancelAnimationFrame(el._raf);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (target - from) * eased).toLocaleString();
      if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  /** Category filters: a list in the sidebar (laptop/desktop) and chips (phone/tablet). */
  function renderFilters() {
    const counts = categoryCounts();
    const used = sortedCategories().filter((c) => counts.get(norm(c.name)));
    const pressed = (key) => String(state.category === key);

    let chips = `<button type="button" class="chip" data-cat="all" aria-pressed="${pressed('all')}">All <span class="chip-count">${state.books.length}</span></button>`;
    let side = `<button type="button" class="side-cat side-cat-all" data-cat="all" aria-pressed="${pressed('all')}">${icon('library')}<span class="side-cat-name">All books</span><span class="side-cat-count">${state.books.length}</span></button>`;

    used.forEach((c) => {
      const key = norm(c.name);
      const n = counts.get(key);
      const label = `<span class="side-cat-name"${langAttr(c.name)}>${esc(c.name)}</span>`;
      chips += `<button type="button" class="chip" data-cat="${esc(key)}" aria-pressed="${pressed(key)}" style="--cat:${c.color}">` +
        `<span class="cat-dot" aria-hidden="true"></span><span${langAttr(c.name)}>${esc(c.name)}</span><span class="chip-count">${n}</span></button>`;
      side += `<button type="button" class="side-cat" data-cat="${esc(key)}" aria-pressed="${pressed(key)}" style="--cat:${c.color}">` +
        `<span class="cat-dot" aria-hidden="true"></span>${label}<span class="side-cat-count">${n}</span></button>`;
    });

    els.chips.innerHTML = chips;
    els.sideCats.innerHTML = side;
    els.sideHint.hidden = used.length > 0;
  }

  function renderControls() {
    const { sortKey, sortDir, view } = state.prefs;
    els.sort.value = sortKey;
    els.sortDir.dataset.dir = sortDir;
    els.sortDir.setAttribute('aria-label', sortDir === 'asc' ? 'Sorted ascending — switch to descending' : 'Sorted descending — switch to ascending');
    els.sortDir.title = sortDir === 'asc' ? 'Ascending' : 'Descending';
    els.viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  }

  function renderCount(shown) {
    const total = state.books.length;
    if (!total) {
      els.resultCount.textContent = 'No books yet';
    } else if (shown === total) {
      els.resultCount.innerHTML = `Showing all <strong>${total}</strong> ${plural(total, 'book', 'books')}`;
    } else {
      els.resultCount.innerHTML = `Showing <strong>${shown}</strong> of <strong>${total}</strong> ${plural(total, 'book', 'books')}`;
    }
    els.clearFilters.hidden = !(state.query || state.category !== 'all');
  }

  function renderCatalogue(list, options) {
    const container = els.catalogue;
    const signature = `${state.prefs.view}|${list.map((b) => b.id).join(',')}`;
    const animate = options.animate && signature !== state.lastSignature;
    state.lastSignature = signature;

    if (!state.books.length) {
      container.replaceChildren(els.emptyTpl.content.cloneNode(true));
      return;
    }
    if (!list.length) {
      const frag = els.noResultsTpl.content.cloneNode(true);
      const text = frag.querySelector('[data-slot="query"]');
      const cat = state.category !== 'all' ? state.categories.find((c) => norm(c.name) === state.category) : null;
      if (state.query) {
        text.innerHTML = `Nothing matches <q>${esc(state.query)}</q>${cat ? ` in ${esc(cat.name)}` : ''}. Try another word, or clear the search and filters.`;
      }
      container.replaceChildren(frag);
      return;
    }

    container.innerHTML = state.prefs.view === 'list'
      ? tableHTML(list, animate)
      : `<div class="book-grid">${list.map((b, i) => cardHTML(b, i, animate)).join('')}</div>`;

    // Re-rendering replaces the buttons, so put keyboard focus somewhere sensible.
    const lostFocus = !document.activeElement || document.activeElement === document.body;
    if (options.flashId) {
      const el = container.querySelector(`[data-id="${CSS.escape(options.flashId)}"]`);
      if (el) {
        el.classList.add('is-flash');
        if (lostFocus) el.querySelector('[data-action="edit"]').focus({ preventScroll: true });
        const r = el.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        }
      }
    } else if (lostFocus) {
      container.focus({ preventScroll: true });
    }
  }

  function yearText(y) {
    return y == null ? '—' : String(y);
  }

  function actionButtons(b) {
    return `<button class="icon-btn" type="button" data-action="edit" aria-label="Edit ${esc(b.name)}" title="Edit">${icon('edit')}</button>` +
      `<button class="icon-btn danger" type="button" data-action="delete" aria-label="Delete ${esc(b.name)}" title="Delete">${icon('trash')}</button>`;
  }

  function categoryPill(b) {
    return `<span class="cat-pill"><span class="cat-dot" aria-hidden="true"></span><span${langAttr(b.category)}>${esc(b.category)}</span></span>`;
  }

  /** Stagger delay is capped so long lists still appear quickly. */
  function animAttrs(i, animate) {
    return animate ? { cls: ' animate-in', style: `;--i:${Math.min(i, 14)}` } : { cls: '', style: '' };
  }

  function cardHTML(b, i, animate) {
    const a = animAttrs(i, animate);
    return `
      <article class="book-card${a.cls}" style="--cat:${colorOf(b.category)}${a.style}" data-id="${esc(b.id)}">
        <div class="book-spine" aria-hidden="true"></div>
        <div class="book-body">
          <div class="book-top">
            ${categoryPill(b)}
            <div class="book-actions">${actionButtons(b)}</div>
          </div>
          <h3 class="book-title"${langAttr(b.name)}>${esc(b.name)}</h3>
          <p class="book-writer"${langAttr(b.writer)}>${esc(b.writer)}</p>
          <p class="book-publisher">${icon('building')}<span${langAttr(b.publisher)}>${esc(b.publisher)}</span></p>
          <div class="book-editions">
            <span class="badge">1st ed. <b>${yearText(b.firstEdition)}</b></span>
            <span class="badge">This ed. <b>${yearText(b.thisEdition)}</b></span>
          </div>
        </div>
      </article>`;
  }

  function tableHTML(list, animate) {
    const { sortKey, sortDir } = state.prefs;
    const th = (key, label) => {
      const sorted = key === sortKey ? ` aria-sort="${sortDir === 'asc' ? 'ascending' : 'descending'}"` : '';
      return `<th scope="col"${sorted}><button type="button" class="th-btn" data-sort="${key}">${label}${icon('chevron', 'icon th-arrow')}</button></th>`;
    };
    const rows = list.map((b, i) => {
      const a = animAttrs(i, animate);
      return `
        <tr class="${a.cls.trim()}" style="--cat:${colorOf(b.category)}${a.style}" data-id="${esc(b.id)}">
          <td class="td-main"><div class="td-title"><span class="cat-dot" aria-hidden="true"></span><strong${langAttr(b.name)}>${esc(b.name)}</strong></div></td>
          <td class="td-writer"${langAttr(b.writer)}><span class="td-label">Writer</span>${esc(b.writer)}</td>
          <td class="td-publisher"${langAttr(b.publisher)}><span class="td-label">Publisher</span>${esc(b.publisher)}</td>
          <td class="td-year"><span class="td-label">1st ed.</span>${yearText(b.firstEdition)}</td>
          <td class="td-year"><span class="td-label">This ed.</span>${yearText(b.thisEdition)}</td>
          <td class="td-cat">${categoryPill(b)}</td>
          <td class="td-actions">${actionButtons(b)}</td>
        </tr>`;
    }).join('');
    return `
      <div class="book-table-wrap">
        <table class="book-table">
          <thead><tr>
            ${th('name', 'Book name')}${th('writer', 'Writer')}${th('publisher', 'Publisher')}
            ${th('firstEdition', '1st ed.')}${th('thisEdition', 'This ed.')}
            <th scope="col"><span class="th-btn">Category</span></th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  /* 8. Overlays (focus trap, drawer, dialog, menu) ======================== */

  const FOCUSABLE = 'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const overlayStack = [];

  function focusables(root) {
    return $$(FOCUSABLE, root).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function lockScroll(lock) {
    const root = document.documentElement;
    if (lock) {
      const gap = window.innerWidth - root.clientWidth;
      root.style.overflow = 'hidden';
      if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    } else {
      root.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  }

  /**
   * Show an overlay, trap focus inside its panel, and remember what to
   * focus again on close. onEscape runs for the Escape key and backdrop clicks.
   */
  function openOverlay(overlay, panel, onEscape, initialFocus) {
    const entry = { overlay, panel, onEscape, returnFocus: document.activeElement };
    if (!overlayStack.length) lockScroll(true);
    overlayStack.push(entry);
    overlay.hidden = false;
    void overlay.offsetWidth; // reflow so the opening transition runs
    overlay.classList.add('is-open');
    requestAnimationFrame(() => {
      const target = initialFocus || focusables(panel)[0] || panel;
      target.focus({ preventScroll: true });
    });
  }

  function closeOverlay(overlay, fallbackFocus) {
    const index = overlayStack.findIndex((e) => e.overlay === overlay);
    if (index === -1) return;
    const [entry] = overlayStack.splice(index, 1);
    overlay.classList.remove('is-open');
    setTimeout(() => { if (!overlay.classList.contains('is-open')) overlay.hidden = true; }, 340);
    if (!overlayStack.length) lockScroll(false);
    const back = entry.returnFocus && document.contains(entry.returnFocus) && entry.returnFocus !== document.body
      ? entry.returnFocus : fallbackFocus;
    if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
  }

  function trapTab(e) {
    const top = overlayStack[overlayStack.length - 1];
    if (!top) return;
    const items = focusables(top.panel);
    if (!items.length) { e.preventDefault(); top.panel.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !top.panel.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !top.panel.contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
  }

  /* --- Drawer --- */
  const drawer = {
    overlay: $('#drawerOverlay'),
    panel: $('#drawer'),
    form: $('#bookForm'),
    title: $('#drawerTitle'),
    eyebrow: $('#drawerEyebrow'),
    saveLabel: $('#saveBtn span'),
    snapshot: ''
  };
  drawer.panel.tabIndex = -1;

  function openDrawer(book) {
    state.editingId = book ? book.id : null;
    drawer.title.textContent = book ? 'Edit book' : 'Add a book';
    drawer.eyebrow.textContent = book ? 'Editing' : 'New entry';
    drawer.saveLabel.textContent = book ? 'Save changes' : 'Save book';
    resetForm(book);
    drawer.snapshot = formSnapshot();
    // On touch screens focus the panel itself so the keyboard doesn't pop up at once.
    const first = finePointer.matches ? $('#f-name') : drawer.panel;
    openOverlay(drawer.overlay, drawer.panel, requestCloseDrawer, first);
  }

  function closeDrawer() {
    closeCombo();
    closeOverlay(drawer.overlay, els.catalogue);
    state.editingId = null;
  }

  /** Ask before throwing away typed changes. */
  async function requestCloseDrawer() {
    if (formSnapshot() !== drawer.snapshot) {
      const discard = await confirmDialog({
        title: 'Discard changes?',
        message: 'What you typed in this form will be lost.',
        icon: 'alert',
        tone: 'danger',
        actions: [
          { label: 'Keep editing', value: false, variant: 'outline', focus: true },
          { label: 'Discard', value: true, variant: 'danger' }
        ]
      });
      if (!discard) return;
    }
    closeDrawer();
  }

  /* --- Dialog --- */
  const dialog = {
    overlay: $('#dialogOverlay'),
    panel: $('#dialog'),
    title: $('#dialogTitle'),
    text: $('#dialogText'),
    icon: $('#dialogIcon'),
    actions: $('#dialogActions'),
    resolve: null
  };

  /**
   * Styled replacement for window.confirm. Resolves with the chosen action's
   * value, or `false` when dismissed. `message` may contain escaped HTML.
   */
  function confirmDialog(cfg) {
    if (dialog.resolve) finishDialog(false);
    dialog.panel.dataset.tone = cfg.tone || 'primary';
    dialog.title.textContent = cfg.title;
    dialog.text.innerHTML = cfg.message;
    dialog.icon.innerHTML = icon(cfg.icon || 'info');
    dialog.actions.innerHTML = '';
    let focusBtn = null;
    cfg.actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-${a.variant || 'outline'}`;
      btn.textContent = a.label;
      btn.addEventListener('click', () => finishDialog(a.value));
      dialog.actions.appendChild(btn);
      if (a.focus) focusBtn = btn;
    });
    return new Promise((resolve) => {
      dialog.resolve = resolve;
      openOverlay(dialog.overlay, dialog.panel, () => finishDialog(false), focusBtn);
    });
  }

  function finishDialog(value) {
    const resolve = dialog.resolve;
    dialog.resolve = null;
    closeOverlay(dialog.overlay, els.catalogue);
    if (resolve) resolve(value);
  }

  /* --- Backup menu --- */
  const menu = { btn: $('#backupBtn'), list: $('#backupList') };

  function setMenu(open, focusFirst) {
    menu.list.hidden = !open;
    menu.btn.setAttribute('aria-expanded', String(open));
    if (open && focusFirst) $$('.menu-item', menu.list)[0].focus();
  }

  /* 9. Form, category picker & validation ================================= */

  const FIELDS = ['name', 'writer', 'publisher', 'firstEdition', 'thisEdition', 'category'];
  const fieldInput = (name) => drawer.form.elements[name];
  const touched = new Set();

  /* --- Category combobox: pick an existing category or type a new one --- */
  const combo = {
    root: $('#categoryCombo'),
    input: $('#f-category'),
    list: $('#categoryList'),
    toggle: $('#categoryToggle'),
    dot: $('#categoryDot'),
    options: [],
    active: -1
  };

  function comboOptions() {
    const text = cleanText(combo.input.value);
    const q = norm(text);
    const counts = categoryCounts();
    let cats = sortedCategories();
    if (q) {
      cats = cats.filter((c) => norm(c.name).includes(q));
      // Names that start with the typed text come first.
      cats.sort((a, b) => Number(!norm(a.name).startsWith(q)) - Number(!norm(b.name).startsWith(q)));
    }
    const options = cats.map((c) => ({ create: false, name: c.name, color: c.color, count: counts.get(norm(c.name)) || 0 }));
    if (q && !findCategory(text)) options.push({ create: true, name: text.slice(0, MAX_CATEGORY_LENGTH) });
    return options;
  }

  function renderCombo() {
    combo.options = comboOptions();
    const current = norm(combo.input.value);
    if (!combo.options.length) {
      combo.list.innerHTML = '<li class="combo-empty" role="presentation">No categories yet — type a name to create your first one.</li>';
      combo.active = -1;
    } else {
      combo.list.innerHTML = combo.options.map((o, i) => {
        const sep = o.create && i > 0 ? '<li class="combo-sep" role="presentation"></li>' : '';
        if (o.create) {
          return `${sep}<li class="combo-option is-create" role="option" id="cat-opt-${i}" data-index="${i}" aria-selected="false">` +
            `${icon('plus')}<span class="combo-option-name">Create “<strong${langAttr(o.name)}>${esc(o.name)}</strong>”</span></li>`;
        }
        return `<li class="combo-option" role="option" id="cat-opt-${i}" data-index="${i}" aria-selected="${norm(o.name) === current}" style="--cat:${o.color}">` +
          `<span class="cat-dot" aria-hidden="true"></span><span class="combo-option-name"${langAttr(o.name)}>${esc(o.name)}</span>` +
          `<span class="combo-option-meta">${o.count} ${plural(o.count, 'book', 'books')}</span></li>`;
      }).join('');
      if (combo.active >= combo.options.length) combo.active = -1;
      if (current) combo.active = 0;
    }
    combo.list.hidden = false;
    combo.root.classList.add('is-open');
    combo.input.setAttribute('aria-expanded', 'true');
    placeCombo();
    setActive(combo.active);
  }

  /** Open the list upwards when there is not enough room below the field. */
  function placeCombo() {
    const area = drawer.form.getBoundingClientRect();
    const field = combo.input.getBoundingClientRect();
    const needed = Math.min(combo.list.scrollHeight, 248) + 12;
    const below = area.bottom - field.bottom;
    const above = field.top - area.top;
    combo.root.classList.toggle('drop-up', below < needed && above > below);
  }

  function openCombo() {
    combo.active = -1;
    renderCombo();
  }

  function closeCombo() {
    combo.list.hidden = true;
    combo.root.classList.remove('is-open');
    combo.input.setAttribute('aria-expanded', 'false');
    combo.input.removeAttribute('aria-activedescendant');
    combo.active = -1;
  }

  function setActive(i) {
    combo.active = i;
    $$('.combo-option', combo.list).forEach((el) => el.classList.toggle('is-active', Number(el.dataset.index) === i));
    if (i >= 0) {
      combo.input.setAttribute('aria-activedescendant', `cat-opt-${i}`);
      const el = $(`#cat-opt-${i}`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    } else {
      combo.input.removeAttribute('aria-activedescendant');
    }
  }

  function chooseOption(i) {
    const o = combo.options[i];
    if (!o) return;
    combo.input.value = o.name;
    closeCombo();
    updateComboDot();
    touched.add('category');
    validateTouched();
  }

  /** Show the category's colour, or the colour a new category will get. */
  function updateComboDot() {
    const text = cleanText(combo.input.value);
    const existing = text ? findCategory(text) : null;
    const color = existing ? existing.color : text ? nextCategoryColor(text) : 'var(--border-strong)';
    combo.dot.style.setProperty('--cat', color);
  }

  /* --- Form --- */
  function resetForm(book) {
    drawer.form.reset();
    touched.clear();
    FIELDS.forEach((f) => showError(f, ''));
    closeCombo();
    if (book) {
      fieldInput('name').value = book.name;
      fieldInput('writer').value = book.writer;
      fieldInput('publisher').value = book.publisher;
      fieldInput('firstEdition').value = book.firstEdition == null ? '' : book.firstEdition;
      fieldInput('thisEdition').value = book.thisEdition == null ? '' : book.thisEdition;
      fieldInput('category').value = book.category;
    }
    updateComboDot();
    drawer.form.scrollTop = 0;
  }

  function readForm() {
    return {
      name: cleanText(fieldInput('name').value),
      writer: cleanText(fieldInput('writer').value),
      publisher: cleanText(fieldInput('publisher').value),
      firstEdition: fieldInput('firstEdition').value.trim(),
      thisEdition: fieldInput('thisEdition').value.trim(),
      category: cleanText(fieldInput('category').value)
    };
  }

  function formSnapshot() {
    return Object.values(readForm()).join('\u0001');
  }

  function yearError(value, label) {
    if (!value) return `Please enter the ${label}.`;
    if (!/^\d{4}$/.test(value)) return 'Use a 4-digit year, like 1998.';
    const y = Number(value);
    if (y < MIN_YEAR || y > CURRENT_YEAR) return `Enter a year between ${MIN_YEAR} and ${CURRENT_YEAR}.`;
    return '';
  }

  /** Returns an error message for one field, or '' when it is valid. */
  function validateField(name, v) {
    switch (name) {
      case 'name': return v.name ? '' : 'Please enter the book name.';
      case 'writer': return v.writer ? '' : 'Please enter the writer.';
      case 'publisher': return v.publisher ? '' : 'Please enter the publisher.';
      case 'firstEdition': return yearError(v.firstEdition, 'first edition year');
      case 'thisEdition': {
        const err = yearError(v.thisEdition, 'year of this edition');
        if (err) return err;
        if (!yearError(v.firstEdition, '') && Number(v.thisEdition) < Number(v.firstEdition)) {
          return `This edition can’t be earlier than the first edition (${v.firstEdition}).`;
        }
        return '';
      }
      case 'category':
        if (!v.category) return 'Choose a category, or type a new one.';
        if (v.category.length > MAX_CATEGORY_LENGTH) return `Keep the category under ${MAX_CATEGORY_LENGTH} characters.`;
        return '';
      default: return '';
    }
  }

  function showError(name, message) {
    const field = drawer.form.querySelector(`[data-field="${name}"]`);
    const input = fieldInput(name);
    field.classList.toggle('has-error', Boolean(message));
    if (message) field.querySelector('.field-error span').textContent = message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function validateTouched() {
    const v = readForm();
    touched.forEach((f) => showError(f, validateField(f, v)));
  }

  /* 10. Book actions ====================================================== */

  function findDuplicate(v, ignoreId) {
    const key = duplicateKey({ name: v.name, writer: v.writer, thisEdition: Number(v.thisEdition) });
    return state.books.find((b) => b.id !== ignoreId && duplicateKey(b) === key);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    closeCombo();
    FIELDS.forEach((f) => touched.add(f));
    const v = readForm();
    const errors = FIELDS.map((f) => [f, validateField(f, v)]);
    errors.forEach(([f, msg]) => showError(f, msg));
    const firstBad = errors.find(([, msg]) => msg);
    if (firstBad) {
      fieldInput(firstBad[0]).focus();
      return;
    }

    const dup = findDuplicate(v, state.editingId);
    if (dup) {
      const go = await confirmDialog({
        title: 'This book may already be listed',
        message: `<strong${langAttr(dup.name)}>${esc(dup.name)}</strong> by ${esc(dup.writer)} (${esc(dup.thisEdition)} edition) is already in your catalogue. Save it anyway?`,
        icon: 'alert',
        actions: [
          { label: 'Cancel', value: false, variant: 'outline', focus: true },
          { label: 'Save anyway', value: true, variant: 'primary' }
        ]
      });
      if (!go) return;
    }

    const isNewCategory = !findCategory(v.category);
    // Capitalise a brand-new category so filters read neatly ("travel" → "Travel").
    if (isNewCategory) v.category = v.category.charAt(0).toLocaleUpperCase() + v.category.slice(1);
    const now = Date.now();
    const data = {
      name: v.name,
      writer: v.writer,
      publisher: v.publisher,
      firstEdition: Number(v.firstEdition),
      thisEdition: Number(v.thisEdition),
      category: ensureCategory(v.category)
    };
    let id = state.editingId;
    const editing = Boolean(id);
    if (editing) {
      const book = state.books.find((b) => b.id === id);
      Object.assign(book, data, { updatedAt: now });
    } else {
      id = uid();
      state.books.push(Object.assign({ id, createdAt: now, updatedAt: now }, data));
    }
    saveData();
    closeDrawer();
    render({ flashId: id });
    const hidden = !visibleBooks().some((b) => b.id === id);
    let msg = editing ? 'Changes saved' : 'Book added';
    if (isNewCategory) msg += ` · new category “${data.category}”`;
    if (hidden) msg += ' — hidden by the current filters';
    toast(msg, { icon: 'check' });
  }

  async function requestDelete(id) {
    const book = state.books.find((b) => b.id === id);
    if (!book) return;
    const ok = await confirmDialog({
      title: 'Delete this book?',
      message: `<strong${langAttr(book.name)}>${esc(book.name)}</strong> by ${esc(book.writer)} will be removed from your catalogue.`,
      icon: 'trash',
      tone: 'danger',
      actions: [
        { label: 'Cancel', value: false, variant: 'outline', focus: true },
        { label: 'Delete', value: true, variant: 'danger' }
      ]
    });
    if (!ok) return;
    const index = state.books.findIndex((b) => b.id === id);
    const [removed] = state.books.splice(index, 1);
    saveData();
    render();
    toast(`Deleted “${removed.name}”`, {
      tone: 'danger',
      icon: 'trash',
      duration: 7000,
      action: {
        label: 'Undo',
        icon: 'undo',
        run() {
          if (state.books.some((b) => b.id === removed.id)) return;
          removed.category = ensureCategory(removed.category);
          state.books.splice(Math.min(index, state.books.length), 0, removed);
          saveData();
          render({ flashId: removed.id });
          toast('Book restored', { icon: 'undo' });
        }
      }
    });
  }

  function setCategoryFilter(key) {
    if (key === state.category) return;
    state.category = key;
    render({ animate: true });
  }

  function clearFilters() {
    state.query = '';
    state.category = 'all';
    els.search.value = '';
    render({ animate: true });
  }

  /* 11. Toasts ============================================================ */

  const toastBox = $('#toasts');

  /** Small notification that slides up from the bottom. */
  function toast(message, opts) {
    const o = Object.assign({ tone: 'success', icon: 'check', duration: 4000, action: null }, opts);
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.tone = o.tone;
    el.innerHTML =
      `<span class="toast-icon">${icon(o.icon)}</span><span class="toast-msg"></span>` +
      (o.action ? `<button type="button" class="toast-action">${o.action.icon ? icon(o.action.icon) : ''}<span></span></button>` : '') +
      `<button type="button" class="icon-btn toast-close" aria-label="Dismiss">${icon('close')}</button>`;
    el.querySelector('.toast-msg').textContent = message;

    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      if (el.classList.contains('is-leaving')) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), reducedMotion.matches ? 0 : 220);
    };
    const arm = () => { clearTimeout(timer); timer = setTimeout(dismiss, o.duration); };

    if (o.action) {
      const btn = el.querySelector('.toast-action');
      btn.querySelector('span').textContent = o.action.label;
      btn.addEventListener('click', () => { dismiss(); o.action.run(); });
    }
    el.querySelector('.toast-close').addEventListener('click', dismiss);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', arm);
    el.addEventListener('focusin', () => clearTimeout(timer));
    el.addEventListener('focusout', arm);

    toastBox.appendChild(el);
    while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
    arm();
  }

  /* 12. Backup on this device (CSV download & restore) ====================
     A backup is a CSV file saved to the device. It opens in Excel or Google
     Sheets (UTF-8 with BOM, so Malayalam shows correctly) and can be loaded
     back with "Restore from backup". The last two columns, "Added on" and
     "ID", let a restore keep the order books were added and skip duplicates. */

  const CSV_COLUMNS = [
    { key: 'name', label: 'Book name', aliases: ['book name', 'name', 'title', 'book', 'book title'] },
    { key: 'writer', label: 'Writer', aliases: ['writer', 'author'] },
    { key: 'publisher', label: 'Publisher', aliases: ['publisher'] },
    { key: 'firstEdition', label: 'First edition year', aliases: ['first edition year', 'first edition', '1st ed.', '1st ed', '1st edition'] },
    { key: 'thisEdition', label: 'This edition year', aliases: ['this edition year', 'this edition', 'this ed.', 'this ed', 'edition year'] },
    { key: 'category', label: 'Category', aliases: ['category', 'genre'] },
    { key: 'createdAt', label: 'Added on', aliases: ['added on', 'added', 'date added'] },
    { key: 'id', label: 'ID', aliases: ['id'] }
  ];

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function dayStamp(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /* --- Writing CSV --- */

  function csvCell(value) {
    let s = String(value == null ? '' : value);
    // Stop spreadsheets from treating a cell as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  }

  function buildCSV() {
    const lines = [CSV_COLUMNS.map((c) => csvCell(c.label)).join(',')];
    sortBooks(state.books).forEach((b) => {
      lines.push([
        b.name, b.writer, b.publisher, b.firstEdition, b.thisEdition, b.category,
        new Date(b.createdAt).toISOString(), b.id
      ].map(csvCell).join(','));
    });
    // UTF-8 BOM so Excel reads Malayalam correctly.
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  function downloadBackup() {
    const n = state.books.length;
    if (!n) {
      toast('Add a book first — there’s nothing to back up yet.', { icon: 'info' });
      return;
    }
    const filename = `pustakam-backup-${dayStamp()}.csv`;
    download(filename, buildCSV(), 'text/csv;charset=utf-8');
    state.prefs.backup = { lastAt: new Date().toISOString(), changes: 0 };
    persist();
    renderBackupStatus();
    toast(`Backup saved as ${filename} · ${n} ${plural(n, 'book', 'books')}`, { icon: 'download', duration: 5000 });
  }

  /* --- Reading CSV --- */

  /** Split CSV text into rows of cells (handles quotes, commas and line breaks inside cells). */
  function parseCSV(text) {
    const src = text.replace(/^﻿/, '');
    // Excel in some regions saves with semicolons or tabs instead of commas.
    const firstLine = src.slice(0, src.search(/\r?\n|$/));
    const count = (ch) => firstLine.split(ch).length - 1;
    const delimiter = [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');

    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') {
          if (src[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === delimiter) {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else {
        cell += ch;
      }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  /** Undo the formula guard added when writing ("'=x" → "=x"). */
  function unguard(value) {
    return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
  }

  /** Turn CSV rows into raw book objects, matching columns by their header names. */
  function rowsToBooks(rows) {
    if (rows.length < 1) return null;
    const header = rows[0].map((h) => norm(h).replace(/\s+/g, ' '));
    const index = {};
    CSV_COLUMNS.forEach((col) => {
      const i = header.findIndex((h) => col.aliases.includes(h));
      if (i !== -1) index[col.key] = i;
    });
    if (index.name == null) return null;
    return rows.slice(1).map((r) => {
      const raw = {};
      Object.keys(index).forEach((key) => { raw[key] = unguard(r[index[key]] == null ? '' : r[index[key]]); });
      if (raw.createdAt) raw.createdAt = Date.parse(raw.createdAt) || undefined;
      if (!raw.id) delete raw.id;
      return raw;
    });
  }

  async function restoreFromFile(file) {
    let rows;
    try {
      rows = parseCSV(await file.text());
    } catch (e) {
      toast('That file could not be read. Choose a Pustakam CSV backup.', { tone: 'danger', icon: 'alert' });
      return;
    }
    const rawBooks = rowsToBooks(rows);
    if (!rawBooks) {
      toast('That file doesn’t look like a Pustakam backup — it needs a “Book name” column.', { tone: 'danger', icon: 'alert', duration: 6000 });
      return;
    }

    // Remember which books arrived without an ID (e.g. a list typed into Excel).
    const withoutId = new Set();
    const books = rawBooks.map((raw) => {
      const b = sanitizeBook(raw);
      if (b && !raw.id) withoutId.add(b);
      return b;
    }).filter(Boolean);
    if (!books.length) {
      toast('No books were found in that file.', { tone: 'danger', icon: 'alert' });
      return;
    }

    let mode = 'replace';
    if (state.books.length) {
      const n = books.length;
      const m = state.books.length;
      mode = await confirmDialog({
        title: `Restore ${n} ${plural(n, 'book', 'books')}`,
        message: `You have <strong>${m}</strong> ${plural(m, 'book', 'books')} on this device. <strong>Merge</strong> adds the books from the file and skips any already listed. <strong>Replace</strong> removes this device’s list first.`,
        icon: 'upload',
        actions: [
          { label: 'Cancel', value: false, variant: 'outline' },
          { label: 'Replace', value: 'replace', variant: 'outline' },
          { label: 'Merge', value: 'merge', variant: 'primary', focus: true }
        ]
      });
      if (!mode) return;
    }

    let added = 0;
    let skipped = 0;
    if (mode === 'replace') {
      const seen = new Set();
      state.books = books.filter((b) => (seen.has(b.id) ? false : seen.add(b.id)));
      state.categories = [];
      added = state.books.length;
    } else {
      // Match by ID; books without one are matched by name + writer + edition.
      const ids = new Set(state.books.map((b) => b.id));
      const keys = new Set(state.books.map(duplicateKey));
      books.forEach((b) => {
        if (ids.has(b.id) || (withoutId.has(b) && keys.has(duplicateKey(b)))) { skipped++; return; }
        ids.add(b.id);
        keys.add(duplicateKey(b));
        state.books.push(b);
        added++;
      });
    }

    state.books.forEach((b) => { b.category = ensureCategory(b.category); });
    pruneCategories();
    saveData();
    // A straight replace means this device now matches the backup file.
    if (mode === 'replace') {
      state.prefs.backup = { lastAt: new Date(file.lastModified || Date.now()).toISOString(), changes: 0 };
      persist();
      renderBackupStatus();
    }
    state.category = 'all';
    render({ animate: true });
    toast(`Restored ${added} ${plural(added, 'book', 'books')}${skipped ? ` · ${skipped} already listed` : ''}`, { icon: 'upload' });
  }

  /* --- Backup reminder (quiet: a dot, the menu and the sidebar card) --- */

  function timeAgo(iso) {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const min = Math.round(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h ago`;
    const days = Math.round(h / 24);
    if (days < 7) return `${days} ${plural(days, 'day', 'days')} ago`;
    return `on ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  function renderBackupStatus() {
    const { lastAt, changes } = state.prefs.backup;
    const hasBooks = state.books.length > 0;
    const due = hasBooks && (!lastAt || changes > 0);
    let title;
    let text;
    let menu;
    if (!hasBooks) {
      title = 'Saved in this browser';
      text = 'Download a backup now and then to keep your books safe.';
      menu = 'Save all books as a CSV file';
    } else if (!lastAt) {
      title = 'No backup yet';
      text = 'Download a CSV backup to keep a copy of your books on this device.';
      menu = 'No backup yet — save a CSV file';
    } else if (changes > 0) {
      title = 'Changes since last backup';
      text = `${changes} ${plural(changes, 'change', 'changes')} since your backup ${timeAgo(lastAt)}.`;
      menu = `Last saved ${timeAgo(lastAt)} · ${changes} ${plural(changes, 'change', 'changes')} since`;
    } else {
      title = 'Backup up to date';
      text = `Last backup ${timeAgo(lastAt)}.`;
      menu = `Up to date · saved ${timeAgo(lastAt)}`;
    }
    $('#backupDot').hidden = !due;
    $('#backupBtn').setAttribute('aria-label', due ? 'Backup — changes not backed up yet' : 'Backup');
    $('#menuBackupText').textContent = menu;
    $('#sideBackup').dataset.state = !hasBooks ? 'none' : due ? 'due' : 'ok';
    $('#sideBackupTitle').textContent = title;
    $('#sideBackupText').textContent = text;
  }

  /* 13. Theme ============================================================= */

  const themeToggle = $('#themeToggle');

  /** Light is the default; the owner's choice is remembered. */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    themeToggle.title = theme === 'dark' ? 'Light theme' : 'Dark theme';
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#161412' : '#FFFFFF';
  }

  /* 14. Event handling ==================================================== */

  function defaultDir(key) {
    return TEXT_SORT_KEYS.includes(key) ? 'asc' : 'desc';
  }

  function setSort(key, dir) {
    state.prefs.sortKey = key;
    state.prefs.sortDir = dir || defaultDir(key);
    persist();
    render({ animate: true });
  }

  function setView(view) {
    if (state.prefs.view === view) return;
    state.prefs.view = view;
    persist();
    render({ animate: true });
  }

  function bindEvents() {
    // Add buttons
    $('#addBtn').addEventListener('click', () => openDrawer(null));
    $('#fab').addEventListener('click', () => openDrawer(null));

    // Catalogue: card / row actions, empty-state buttons, sortable headers
    els.catalogue.addEventListener('click', (e) => {
      const sortEl = e.target.closest('[data-sort]');
      if (sortEl) {
        const key = sortEl.dataset.sort;
        if (key === state.prefs.sortKey) setSort(key, state.prefs.sortDir === 'asc' ? 'desc' : 'asc');
        else setSort(key);
        const again = els.catalogue.querySelector(`[data-sort="${key}"]`);
        if (again) again.focus();
        return;
      }
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      const item = actionEl.closest('[data-id]');
      const book = item && state.books.find((b) => b.id === item.dataset.id);
      if (action === 'edit' && book) openDrawer(book);
      else if (action === 'delete' && book) requestDelete(book.id);
      else if (action === 'add-first') openDrawer(null);
      else if (action === 'clear-filters') clearFilters();
    });

    // Search (lightly debounced)
    let searchTimer;
    els.search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = els.search.value;
        render({ animate: true });
      }, 120);
    });
    els.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.search.value) {
        e.stopPropagation();
        els.search.value = '';
        state.query = '';
        render({ animate: true });
      }
    });

    // Category filters (chips and sidebar share one handler)
    [els.chips, els.sideCats].forEach((box) => {
      box.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        setCategoryFilter(btn.dataset.cat);
        const active = box.querySelector(`[data-cat="${CSS.escape(state.category)}"]`);
        if (active) {
          active.focus({ preventScroll: true });
          if (box === els.chips) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        }
      });
    });

    els.clearFilters.addEventListener('click', clearFilters);

    // Sort & view
    els.sort.addEventListener('change', () => setSort(els.sort.value));
    els.sortDir.addEventListener('click', () => setSort(state.prefs.sortKey, state.prefs.sortDir === 'asc' ? 'desc' : 'asc'));
    els.viewBtns.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

    // Drawer & form
    drawer.overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) requestCloseDrawer();
    });
    drawer.form.addEventListener('submit', handleSubmit);
    drawer.form.addEventListener('focusout', (e) => {
      const name = e.target.name;
      if (FIELDS.includes(name) && e.target.value.trim()) { touched.add(name); validateTouched(); }
    });
    drawer.form.addEventListener('input', (e) => {
      const t = e.target;
      if (t.name === 'firstEdition' || t.name === 'thisEdition') {
        const digits = t.value.replace(/\D/g, '').slice(0, 4);
        if (digits !== t.value) t.value = digits;
        if (t.name === 'firstEdition' && fieldInput('thisEdition').value) touched.add('thisEdition');
      }
      if (touched.size) validateTouched();
    });

    // Category combobox
    combo.input.addEventListener('focus', openCombo);
    combo.input.addEventListener('click', () => { if (combo.list.hidden) openCombo(); });
    combo.input.addEventListener('input', () => { combo.active = -1; renderCombo(); updateComboDot(); });
    combo.input.addEventListener('blur', () => setTimeout(() => {
      if (!combo.root.contains(document.activeElement)) closeCombo();
    }, 0));
    combo.input.addEventListener('keydown', (e) => {
      const open = !combo.list.hidden;
      const n = combo.options.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) openCombo();
        else if (n) setActive((combo.active + 1) % n);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) openCombo();
        else if (n) setActive(combo.active <= 0 ? n - 1 : combo.active - 1);
      } else if (e.key === 'Enter' && open && combo.active >= 0) {
        e.preventDefault();
        chooseOption(combo.active);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();
        closeCombo();
      } else if (e.key === 'Tab' && open) {
        closeCombo();
      }
    });
    // Keep focus in the input while clicking the list or the arrow button.
    combo.list.addEventListener('mousedown', (e) => e.preventDefault());
    combo.list.addEventListener('click', (e) => {
      const li = e.target.closest('.combo-option');
      if (li) chooseOption(Number(li.dataset.index));
    });
    combo.toggle.addEventListener('mousedown', (e) => e.preventDefault());
    combo.toggle.addEventListener('click', () => {
      if (combo.list.hidden) { combo.input.focus(); openCombo(); } else closeCombo();
    });

    // Dialog backdrop
    dialog.overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-dismiss]')) finishDialog(false);
    });

    // Backup menu
    menu.btn.addEventListener('click', () => setMenu(menu.list.hidden, false));
    menu.btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMenu(true, true); }
    });
    menu.list.addEventListener('keydown', (e) => {
      const items = $$('.menu-item', menu.list);
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      if (e.key === 'Tab') setMenu(false);
    });
    menu.list.addEventListener('click', (e) => {
      const item = e.target.closest('[data-action]');
      if (!item) return;
      setMenu(false);
      menu.btn.focus();
      if (item.dataset.action === 'export-csv') downloadBackup();
      if (item.dataset.action === 'import-csv') $('#importFile').click();
    });
    document.addEventListener('click', (e) => {
      if (!menu.list.hidden && !e.target.closest('#backupMenu')) setMenu(false);
    });
    $('#sideBackup [data-action="export-csv"]').addEventListener('click', downloadBackup);
    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) restoreFromFile(file);
    });

    // Theme
    themeToggle.addEventListener('click', () => {
      state.prefs.theme = state.prefs.theme === 'dark' ? 'light' : 'dark';
      persist();
      applyTheme(state.prefs.theme);
    });

    // Global keys: Escape closes overlays/menu, Tab is trapped, "/" focuses search
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!menu.list.hidden) { setMenu(false); menu.btn.focus(); return; }
        const top = overlayStack[overlayStack.length - 1];
        if (top) { e.preventDefault(); top.onEscape(); }
        return;
      }
      if (e.key === 'Tab' && overlayStack.length) { trapTab(e); return; }
      if (e.key === '/' && !overlayStack.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          els.search.focus();
        }
      }
    });

    // Keep data in sync if Pustakam is open in another tab.
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      loadState();
      applyTheme(state.prefs.theme);
      render();
    });
  }

  /* 15. Start-up ========================================================== */

  function loadState() {
    const saved = storage.load();
    if (!saved || typeof saved !== 'object') return;
    const seen = new Set();
    state.books = (Array.isArray(saved.books) ? saved.books : [])
      .map(sanitizeBook)
      .filter((b) => b && !seen.has(b.id) && seen.add(b.id));
    state.categories = [];
    sanitizeCategories(saved.categories).forEach((c) => ensureCategory(c.name, c.color));
    state.books.forEach((b) => { b.category = ensureCategory(b.category); });
    pruneCategories();
    const p = saved.prefs || {};
    state.prefs = {
      theme: p.theme === 'dark' ? 'dark' : 'light',
      view: p.view === 'list' ? 'list' : 'grid',
      sortKey: SORT_KEYS.includes(p.sortKey) ? p.sortKey : 'recent',
      sortDir: p.sortDir === 'asc' ? 'asc' : 'desc',
      backup: {
        lastAt: p.backup && typeof p.backup.lastAt === 'string' && !Number.isNaN(Date.parse(p.backup.lastAt)) ? p.backup.lastAt : null,
        changes: p.backup && Number.isInteger(p.backup.changes) && p.backup.changes > 0 ? p.backup.changes : 0
      }
    };
  }

  function init() {
    storage.available = storage.test();
    if (!storage.available) $('#storageNotice').hidden = false;
    loadState();
    applyTheme(state.prefs.theme);
    bindEvents();
    renderBackupStatus();
    // Keep "x min ago" in the backup reminder fresh.
    setInterval(renderBackupStatus, 60000);
    // Let the skeleton show for a moment so the first paint feels intentional.
    setTimeout(() => render({ animate: true }), reducedMotion.matches ? 0 : 300);
  }

  init();
})();
