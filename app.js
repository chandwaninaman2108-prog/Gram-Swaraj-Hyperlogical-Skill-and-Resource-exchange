/**
 * Gram Swaraj Hub - app.js
 * Data storage, card rendering, telemetry, and live filtering.
 * Depends on the element IDs defined in index.html.
 */

(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. DATA
   * ------------------------------------------------------------------ */

  /** Starter data, used only on first run (when nothing is saved in localStorage yet). */
  const SEED_RESOURCES = [
    { id: 1, title: 'Cordless Power Drill',        category: 'Tools',          owner: 'Anita Verma', status: 'Available', date: '2026-10-24' },
    { id: 2, title: 'Engineering Mathematics Set', category: 'Study Material', owner: 'Rohan Sahu',  status: 'Claimed',   date: '2026-10-21' },
    { id: 3, title: 'Arduino Uno Starter Kit',     category: 'Lab Hardware',   owner: 'Meera Joshi', status: 'Available', date: '2026-10-27' },
    { id: 4, title: 'Python Tutoring (1 hr/wk)',   category: 'Skills',         owner: 'Karan Patel', status: 'Claimed',   date: '2026-10-18' }
  ];

  /* ---------- localStorage persistence ---------- */

  /** Bump the version suffix if the item shape ever changes. */
  const STORAGE_KEY = 'gramSwaraj.resources.v1';

  const CATEGORIES = ['Tools', 'Study Material', 'Lab Hardware', 'Skills'];
  const STATUSES   = ['Available', 'Claimed'];

  /** Guard against corrupted or hand-edited storage: keep only well-formed items. */
  function isValidResource(r) {
    return (
      r && typeof r === 'object' &&
      Number.isFinite(r.id) &&
      typeof r.title === 'string' && r.title.trim() !== '' &&
      typeof r.owner === 'string' &&
      CATEGORIES.includes(r.category) &&
      STATUSES.includes(r.status) &&
      typeof r.date === 'string'
    );
  }

  /** Save the full list. Fails quietly if storage is blocked or full (e.g. private mode). */
  function saveResources() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resources));
    } catch (err) {
      console.warn('Gram Swaraj: could not save to localStorage.', err);
    }
  }

  /**
   * Load saved items. Falls back to the seed data on first run
   * or if the saved value cannot be parsed.
   */
  function loadResources() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(isValidResource);
      }
    } catch (err) {
      console.warn('Gram Swaraj: saved data was unreadable, using starter data.', err);
    }
    return SEED_RESOURCES.map((r) => ({ ...r }));
  }

  /** The live, mutable list the whole app works from. */
  const resources = loadResources();

  /**
   * Estimated kg of CO₂ avoided each time a shared item is claimed
   * instead of someone buying a new one. Rough, illustrative values.
   */
  const CO2_PER_EXCHANGE_KG = {
    'Tools': 12,
    'Study Material': 3,
    'Lab Hardware': 20,
    'Skills': 1.5
  };

  /** Current filter state, shared by search and category handlers. */
  const filters = { query: '', category: 'All' };

  /* ------------------------------------------------------------------ *
   * 2. DOM REFERENCES
   * ------------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);

  const grid            = $('resourceGrid');
  const searchInput     = $('searchInput');
  const filterContainer = $('filterContainer');
  const statTotal       = $('statTotal');
  const statActive      = $('statActive');
  const statSavings     = $('statSavings');

  const modal           = $('resourceModal');
  const openModalBtn    = $('openModalBtn');
  const closeModalBtn   = $('closeModalBtn');
  const form            = $('resourceForm');

  /* ------------------------------------------------------------------ *
   * 3. HELPERS
   * ------------------------------------------------------------------ */

  /** Escape user-provided text before injecting it into innerHTML. */
  function escapeHTML(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  /** Format an ISO date (YYYY-MM-DD) as e.g. "24 Oct 2026". */
  function formatDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Tailwind classes for the category tag. */
  const CATEGORY_STYLES = {
    'Tools':          'bg-amber-500/10 text-amber-300 border-amber-500/30',
    'Study Material': 'bg-sky-500/10 text-sky-300 border-sky-500/30',
    'Lab Hardware':   'bg-violet-500/10 text-violet-300 border-violet-500/30',
    'Skills':         'bg-rose-500/10 text-rose-300 border-rose-500/30'
  };

  /** Tailwind classes for the status badge: green = Available, slate = Claimed. */
  const STATUS_STYLES = {
    'Available': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    'Claimed':   'bg-slate-700 text-slate-300 border-slate-600'
  };

  /* ------------------------------------------------------------------ *
   * 4. RENDERING
   * ------------------------------------------------------------------ */

  /** Build the HTML string for a single resource card. */
  function createCard(item) {
    const isAvailable = item.status === 'Available';
    const categoryClass = CATEGORY_STYLES[item.category] || 'bg-slate-700 text-slate-300 border-slate-600';

    const buttonClass = isAvailable
      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
      : 'bg-slate-700 text-slate-400 cursor-not-allowed';

    return `
      <article class="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-4">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium px-2.5 py-1 rounded-full border ${categoryClass}">
            ${escapeHTML(item.category)}
          </span>
          <span class="text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_STYLES[item.status]}">
            ${escapeHTML(item.status)}
          </span>
        </div>

        <div class="flex-1">
          <h3 class="text-lg font-semibold text-white leading-snug">${escapeHTML(item.title)}</h3>
          <p class="text-sm text-slate-400 mt-1">Shared by ${escapeHTML(item.owner)}</p>
          <p class="text-xs text-slate-500 mt-1">Listed ${formatDate(item.date)}</p>
        </div>

        <button id="claimBtn-${item.id}" type="button" data-id="${item.id}"
          ${isAvailable ? '' : 'disabled'}
          class="w-full rounded-lg font-semibold px-4 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${buttonClass}">
          ${isAvailable ? 'Claim this' : 'Already claimed'}
        </button>
      </article>
    `;
  }

  /** Empty-state card shown when no items match the current filters. */
  function createEmptyState() {
    return `
      <div class="col-span-full text-center bg-slate-800 border border-dashed border-slate-700 rounded-xl py-12 px-6">
        <p class="text-slate-200 font-medium">No resources match your search.</p>
        <p class="text-slate-400 text-sm mt-1">Try a different keyword or category, or share something yourself.</p>
      </div>
    `;
  }

  /** Replace the contents of #resourceGrid with cards for the given items. */
  function renderGrid(items) {
    grid.innerHTML = items.length
      ? items.map(createCard).join('')
      : createEmptyState();
  }

  /* ------------------------------------------------------------------ *
   * 5. TELEMETRY
   * ------------------------------------------------------------------ */

  /**
   * Update the three stat counters from the full dataset (not the filtered view).
   *  - Total: every shared item
   *  - Active: items still Available
   *  - Savings: estimated kg CO₂ avoided by items that were claimed (reused)
   */
  function updateStats() {
    const total     = resources.length;
    const available = resources.filter((r) => r.status === 'Available').length;
    const savedKg   = resources
      .filter((r) => r.status === 'Claimed')
      .reduce((sum, r) => sum + (CO2_PER_EXCHANGE_KG[r.category] || 0), 0);

    statTotal.textContent   = total;
    statActive.textContent  = available;
    statSavings.textContent = `${Number.isInteger(savedKg) ? savedKg : savedKg.toFixed(1)} kg`;
  }

  /* ------------------------------------------------------------------ *
   * 6. FILTERING
   * ------------------------------------------------------------------ */

  /** Apply the current search query and category, then re-render. */
  function applyFilters() {
    const q = filters.query.trim().toLowerCase();

    const visible = resources.filter((item) => {
      const matchesCategory = filters.category === 'All' || item.category === filters.category;
      const matchesQuery =
        !q || item.title.toLowerCase().includes(q) || item.owner.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });

    renderGrid(visible);
  }

  /** Visually mark the selected pill as active; reset the others. */
  function setActivePill(activeBtn) {
    const ACTIVE   = ['bg-emerald-500', 'text-slate-900', 'border-emerald-500'];
    const INACTIVE = ['bg-slate-800', 'text-slate-300', 'border-slate-700'];

    filterContainer.querySelectorAll('.filter-pill').forEach((btn) => {
      const isActive = btn === activeBtn;
      btn.classList.remove(...(isActive ? INACTIVE : ACTIVE));
      btn.classList.add(...(isActive ? ACTIVE : INACTIVE));
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  /* ------------------------------------------------------------------ *
   * 7. ACTIONS
   * ------------------------------------------------------------------ */

  /** Mark a resource as Claimed, then refresh the grid and stats. */
  function claimResource(id) {
    const item = resources.find((r) => r.id === id);
    if (!item || item.status === 'Claimed') return;

    item.status = 'Claimed';
    saveResources();
    updateStats();
    applyFilters();
  }

  /** Clear search text and category so a newly added card is never hidden by a filter. */
  function resetFilters() {
    filters.query = '';
    filters.category = 'All';
    searchInput.value = '';
    setActivePill(filterContainer.querySelector('[data-category="All"]'));
  }

  /** Add a new resource (used by both the modal and the bottom form) and save it. */
  function addResource({ title, category, owner }) {
    const nextId = resources.reduce((max, r) => Math.max(max, r.id), 0) + 1;

    resources.unshift({
      id: nextId,
      title,
      category,
      owner,
      status: 'Available',
      date: new Date().toISOString().slice(0, 10)
    });

    saveResources();
    resetFilters();
    updateStats();
    applyFilters();
  }

  /* ------------------------------------------------------------------ *
   * 8. MODAL
   * ------------------------------------------------------------------ */

  function openModal() {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    $('itemTitle').focus();
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    form.reset();
    openModalBtn.focus();
  }

  /* ------------------------------------------------------------------ *
   * 9. EVENT WIRING
   * ------------------------------------------------------------------ */

  function bindEvents() {
    // Live search: runs on every keystroke.
    searchInput.addEventListener('input', (e) => {
      filters.query = e.target.value;
      applyFilters();
    });

    // Category pills: one delegated listener on the container.
    filterContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      filters.category = pill.dataset.category;
      setActivePill(pill);
      applyFilters();
    });

    // Claim buttons: delegated, because cards are re-rendered often.
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-id]');
      if (btn) claimResource(Number(btn.dataset.id));
    });

    // Modal open/close.
    openModalBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });

    // Modal form submit.
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      addResource({
        title:    $('itemTitle').value.trim(),
        category: $('itemCategory').value,
        owner:    $('itemOwner').value.trim()
      });
      closeModal();
    });
  }

  /* ------------------------------------------------------------------ *
   * 9b. BOTTOM-OF-PAGE FORM
   * ------------------------------------------------------------------ */

  /** Inject a simple "add an item" form below the grid and wire its submit handler. */
  function mountInlineForm() {
    const fieldClass =
      'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 ' +
      'placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500';

    const options = CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('');

    grid.closest('main').insertAdjacentHTML('afterend', `
      <section id="quickAddSection" aria-labelledby="quickAddHeading"
        class="mt-12 bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 id="quickAddHeading" class="text-lg font-semibold text-white">Add an item to the exchange</h2>
        <p class="text-sm text-slate-400 mt-1">
          Listings are saved in this browser, so they are still here after you refresh.
        </p>

        <form id="quickAddForm" class="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label for="quickTitle" class="block text-sm font-medium text-slate-300 mb-1">Item name</label>
            <input id="quickTitle" type="text" maxlength="80" required
              placeholder="e.g. Soldering iron" class="${fieldClass}" />
          </div>
          <div>
            <label for="quickCategory" class="block text-sm font-medium text-slate-300 mb-1">Category</label>
            <select id="quickCategory" class="${fieldClass}">${options}</select>
          </div>
          <div>
            <label for="quickOwner" class="block text-sm font-medium text-slate-300 mb-1">Your name</label>
            <input id="quickOwner" type="text" maxlength="60" required
              placeholder="e.g. Anita Verma" class="${fieldClass}" />
          </div>
          <button type="submit"
            class="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold px-4 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
            Add item
          </button>
        </form>

        <p id="quickAddMsg" class="text-sm mt-3 min-h-[1.25rem]" role="status" aria-live="polite"></p>
      </section>
    `);

    const quickForm = $('quickAddForm');
    const quickMsg  = $('quickAddMsg');

    quickForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const title    = $('quickTitle').value.trim();
      const category = $('quickCategory').value;
      const owner    = $('quickOwner').value.trim();

      // Whitespace-only input passes the native "required" check, so check again.
      if (!title || !owner) {
        quickMsg.className = 'text-sm mt-3 min-h-[1.25rem] text-amber-300';
        quickMsg.textContent = 'Enter both an item name and your name.';
        return;
      }

      addResource({ title, category, owner });

      quickForm.reset();
      quickMsg.className = 'text-sm mt-3 min-h-[1.25rem] text-emerald-300';
      quickMsg.textContent = `"${title}" was added to the grid.`;
      $('quickTitle').focus();
    });
  }

  /* ------------------------------------------------------------------ *
   * 10. INIT
   * ------------------------------------------------------------------ */

  function init() {
    mountInlineForm();
    bindEvents();
    updateStats();

    // Keep the HTML skeleton visible briefly to simulate loading, then render.
    setTimeout(() => renderGrid(resources), 600);
  }

  init();
})();