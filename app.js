'use strict';

/* =========================================================
   Données : tout est dans localStorage sous une seule clé.
   La V2 remplacera load/save par un backend.
   ========================================================= */
const STORE_KEY = 'life.v1';
const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
// Catégories de cours, modifiables dans l'onglet Cours (« Catégories »).
// folders : débuts de noms de dossiers Drive reconnus. « Autres » reste toujours à la fin.
const DEFAULT_COURSE_TYPES = [
  { id: 'cours', label: 'Cours', color: '#4f7cf7', folders: 'CM, Cours, Amphi' },
  { id: 'td', label: 'TD', color: '#e39a2d', folders: 'TD' },
  { id: 'tp', label: 'TP', color: '#9a6bf0', folders: 'TP' },
  { id: 'exercices', label: 'Exercices', color: '#3fae78', folders: 'Exo, Exercices, Examen, DS, Annale, Contrôle, Partiel' },
];
const OTHER_TYPE = { id: 'autre', label: 'Autres', color: '#8a8a93' };
const courseTypes = () => [...data.courseTypes, OTHER_TYPE];
const typeOf = (id) => courseTypes().find((t) => t.id === id) || OTHER_TYPE;
const typeRank = (id) => { const i = courseTypes().findIndex((t) => t.id === id); return i < 0 ? 99 : i; };
const ACCENTS = [
  { id: 'auto', label: 'Auto (framboise en clair, bleu en sombre)' },
  { id: '#cf4a73', label: 'Framboise' },
  { id: '#0a84ff', label: 'Bleu' },
  { id: '#8e6cf0', label: 'Lavande' },
  { id: '#2fa37a', label: 'Menthe' },
  { id: '#e08a1e', label: 'Ambre' },
  { id: '#5b5b66', label: 'Graphite' },
];
// [fond, halo 1, halo 2] pour chaque mode (mêmes valeurs que styles.css)
const BACKGROUNDS = [
  { id: 'rose', label: 'Rosé', light: ['#faf2f4', '#f4d3dd', '#e6e0f6'], dark: ['#1c1c1e', '#3a2a33', '#262b3d'] },
  { id: 'neutre', label: 'Neutre', light: ['#f4f4f6', '#e4e4ea', '#ebe7f1'], dark: ['#1c1c1e', '#2e2e33', '#2a2a30'] },
  { id: 'bleute', label: 'Bleuté', light: ['#f1f5fb', '#d6e4fa', '#e3e0f7'], dark: ['#1c1c1e', '#1f2d45', '#2a2742'] },
  { id: 'sauge', label: 'Sauge', light: ['#f2f6f1', '#d8e8d6', '#ece8d8'], dark: ['#1c1c1e', '#22332a', '#33302a'] },
];
// Verre : transparence 0–100 % (défaut 40) et flou en px (défaut 20)
const GLASS_DEFAULT = 40, BLUR_DEFAULT = 20;

function emptyData() {
  const days = {};
  for (const d of DAYS) days[d] = { title: '', exercises: [] };
  return {
    version: 1,
    sport: { days },
    events: [],
    todos: [],
    courses: [],
    subjects: [],
    courseMeta: {},
    courseTypes: structuredClone(DEFAULT_COURSE_TYPES),
    nutrition: { goals: { p: 150, l: 70, g: 250 }, entries: [] },
    settings: { voice: true, theme: 'auto', accent: 'auto', bg: 'rose', bgCustom: null, glass: null, blur: null },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyData();
    return mergeDefaults(JSON.parse(raw));
  } catch {
    return emptyData();
  }
}

function mergeDefaults(d) {
  const base = emptyData();
  const out = { ...base, ...d };
  out.sport = { days: { ...base.sport.days, ...(d.sport?.days || {}) } };
  out.nutrition = { goals: { ...base.nutrition.goals, ...(d.nutrition?.goals || {}) }, entries: d.nutrition?.entries || [] };
  out.settings = { ...base.settings, ...(d.settings || {}) };
  if (!Array.isArray(d.courseTypes) || !d.courseTypes.length) out.courseTypes = structuredClone(DEFAULT_COURSE_TYPES);
  // anciennes données : la liste des matières est déduite des cours
  if (!Array.isArray(d.subjects)) out.subjects = [...new Set((out.courses || []).map((c) => c.subject).filter(Boolean))];
  return out;
}

/* Fichiers joints aux cours : IndexedDB (trop gros pour localStorage).
   Ils restent sur l'appareil et ne sont pas dans les exports. */
let fileDbPromise = null;
function fileDb() {
  return fileDbPromise ||= new Promise((res, rej) => {
    const r = indexedDB.open('life-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb(mode, fn) {
  const db = await fileDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}
const putFile = (id, blob) => idb('readwrite', (s) => s.put(blob, id));
const getFile = (id) => idb('readonly', (s) => s.get(id));
const delFile = (id) => idb('readwrite', (s) => s.delete(id)).catch(() => {});

let data = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) {
    alert("Impossible d'enregistrer : " + e.message);
  }
  markDirty();
}

/* =========================================================
   Icônes (SVG en trait, 24×24)
   ========================================================= */
const ICONS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="5.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
  book: '<path d="M4.5 19V5.5A2.5 2.5 0 0 1 7 3h12.5v14H7a2.5 2.5 0 0 0-2.5 2.5v0A2.5 2.5 0 0 0 7 22h12.5"/>',
  leaf: '<path d="M11 20a7 7 0 0 1-1.2-13.9C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2.5 21c0-3 1.9-5.4 5.1-6 2.4-.5 4.9-2 5.9-3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  mic: '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  send: '<path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h3M11 17h9"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="8.5" cy="17" r="2.3"/>',
  play: '<path d="M7.5 4.8v14.4a.8.8 0 0 0 1.2.7l11.5-7.2a.8.8 0 0 0 0-1.4L8.7 4.1a.8.8 0 0 0-1.2.7z" fill="currentColor"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1.3" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.3" fill="currentColor" stroke="none"/>',
  prev: '<path d="M18 5.5v13L9 12z" fill="currentColor"/><path d="M6 5v14"/>',
  next: '<path d="M6 5.5v13l9-6.5z" fill="currentColor"/><path d="M18 5v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  chevL: '<path d="m14.5 6-6 6 6 6"/>',
  chevR: '<path d="m9.5 6 6 6-6 6"/>',
  up: '<path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/>',
  down: '<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="3"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-12.5"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  link: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  tick: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 15.5V4.5M7 9.5l5-5 5 5M5 20h14"/>',
  erase: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-12.5M10 11v5.5M14 11v5.5"/>',
};
const ic = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* =========================================================
   Utilitaires
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const fmtNum = (n) => (Math.round(n * 10) / 10).toLocaleString('fr-FR');

function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
function dayKey(d = new Date()) {
  return DAYS[(d.getDay() + 6) % 7];
}
function fmtLongDate(iso) {
  return parseIso(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtShortDate(iso) {
  return parseIso(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

// "2:00" -> 120, "90" -> 90, "1m30" -> 90, "" -> 0
function parseDur(s) {
  s = String(s ?? '').trim().toLowerCase();
  if (!s) return 0;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s?)?$/);
  if (m && (m[1] || m[2])) return (+m[1] || 0) * 60 + (+m[2] || 0);
  return 0;
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}
function fmtDurWords(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s}` : `${m} min`;
}

function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}
function youtubeStart(url) {
  const m = String(url || '').match(/[?&]t=(\d+)/);
  return m ? +m[1] : 0;
}

/* =========================================================
   Apparence : thème, couleur des boutons, teinte du fond
   ========================================================= */
function applyAppearance() {
  const s = data.settings;
  const root = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') root.dataset.theme = s.theme;
  else delete root.dataset.theme;
  if (s.bg && s.bg !== 'rose' && s.bg !== 'custom') root.dataset.bg = s.bg;
  else delete root.dataset.bg;
  setVar('--accent', s.accent && s.accent !== 'auto' ? s.accent : null);
  setVar('--on-accent', s.accent && s.accent !== 'auto' ? (isLight(s.accent) ? '#1a1a1a' : '#ffffff') : null);

  const mode = isDark() ? 'dark' : 'light';
  const custom = s.bg === 'custom' && s.bgCustom ? s.bgCustom[mode] : null;
  ['--bg', '--blob1', '--blob2'].forEach((v, i) => setVar(v, custom ? custom[i] : null));
  setVar('--ga', s.glass != null ? (0.92 - (s.glass / 100) * 0.85).toFixed(3) : null);
  setVar('--gblur', s.blur != null ? s.blur + 'px' : null);

  const preset = BACKGROUNDS.find((b) => b.id === s.bg) || BACKGROUNDS[0];
  $('meta[name=theme-color]').content = (custom || preset[mode])[0];
}
function setVar(name, value) {
  if (value == null) document.documentElement.style.removeProperty(name);
  else document.documentElement.style.setProperty(name, value);
}
function isDark() {
  const t = data.settings.theme;
  return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
}
function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAppearance);

/* =========================================================
   Formulaire générique dans un <dialog>
   fields: [{ name, label, type, options, placeholder, hint, full, required }]
   opts.deletable : ajoute un bouton Supprimer (renvoie 'delete')
   ========================================================= */
function openForm(title, fields, initial = {}, opts = {}) {
  const dlg = $('#form-dialog');
  const form = $('#form-dialog-form');
  $('#form-dialog-title').textContent = title;
  $('#form-dialog-ok').textContent = opts.okLabel || 'Enregistrer';
  $('#form-dialog-fields').innerHTML = `<div class="field-grid">${fields.map((f) => {
    const v = initial[f.name] ?? f.default ?? '';
    const req = f.required ? 'required' : '';
    let input;
    if (f.type === 'select') {
      input = `<select name="${f.name}">${f.options.map((o) => `<option value="${esc(o.value)}" ${o.value === v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'select-new') {
      // liste + « Nouveau… » qui fait apparaître un champ texte
      input = `<select name="${f.name}">${f.options.map((o) => `<option value="${esc(o.value)}" ${o.value === v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        <option value="__new">${esc(f.newLabel || 'Nouveau…')}</option></select>
        <input type="text" name="${f.name}__new" placeholder="${esc(f.newPlaceholder || '')}" autocomplete="off" style="margin-top:8px" hidden>`;
    } else if (f.type === 'file') {
      input = `<input type="file" name="${f.name}" class="file-input" ${f.accept ? `accept="${f.accept}"` : ''}>`;
    } else if (f.type === 'textarea') {
      input = `<textarea name="${f.name}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
    } else {
      const type = f.type === 'number' ? 'text' : f.type || 'text';
      const extra = f.type === 'number' ? 'inputmode="decimal" autocomplete="off"' : '';
      input = `<input type="${type}" name="${f.name}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${extra} ${req}>`;
    }
    return `<label class="field ${f.full ? 'full' : ''}"><span>${esc(f.label)}</span>${input}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</label>`;
  }).join('')}</div>`;

  const actions = $('.dialog-actions', form);
  actions.querySelector('.del')?.remove();
  if (opts.deletable) {
    actions.insertAdjacentHTML('afterbegin', `<button type="button" class="btn danger del" style="margin-right:auto">${ic('trash', 'sm')}Supprimer</button>`);
  }

  return new Promise((resolve) => {
    const finish = (val) => {
      form.onsubmit = null;
      $('#form-dialog-cancel').onclick = null;
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(val);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const out = {};
      for (const f of fields) {
        const el = form.elements[f.name];
        if (f.type === 'number') out[f.name] = el.value.trim() === '' ? null : Number(el.value.replace(',', '.'));
        else if (f.type === 'file') out[f.name] = el.files[0] || null;
        else if (f.type === 'select-new') out[f.name] = el.value === '__new' ? form.elements[f.name + '__new'].value.trim() : el.value;
        else out[f.name] = el.value.trim();
      }
      finish(out);
    };
    $('#form-dialog-cancel').onclick = () => finish(null);
    const del = $('.del', actions);
    if (del) del.onclick = () => { if (confirm('Supprimer définitivement ?')) finish('delete'); };
    dlg.onclose = () => finish(null);
    for (const f of fields.filter((x) => x.type === 'select-new')) {
      const sel = form.elements[f.name], txt = form.elements[f.name + '__new'];
      sel.onchange = () => {
        txt.hidden = sel.value !== '__new';
        txt.required = !txt.hidden;
        if (!txt.hidden) txt.focus();
      };
    }
    opts.setup?.(form);
    dlg.showModal();
    const first = form.querySelector('input, select, textarea');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
    else document.activeElement?.blur();
  });
}
// Fermer une feuille en touchant le fond
for (const dlg of document.querySelectorAll('dialog')) {
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

/* =========================================================
   Navigation
   ========================================================= */
const VIEWS = {
  today: { title: "Aujourd'hui", render: renderToday },
  sport: { title: 'Sport', render: renderSport },
  agenda: { title: 'Agenda', render: renderAgenda },
  todo: { title: 'Tâches', render: renderTodo },
  courses: { title: 'Cours', render: renderCourses },
  nutrition: { title: 'Nutrition', render: renderNutrition },
};
let current = null;
const ui = {
  sportDay: dayKey(),
  calMonth: isoDate().slice(0, 7),
  calSelected: isoDate(),
  nutriDate: isoDate(),
  courseType: 'all',
  courseSubject: 'all',
  showDoneCourses: false,
  justToggled: null,
};

for (const b of document.querySelectorAll('#tabs button')) b.insertAdjacentHTML('afterbegin', ic(b.dataset.icon));
$('#menu-btn').innerHTML = ic('sliders');
$('#mic-btn').innerHTML = ic('mic');

function moveBubble() {
  const btn = $('#tabs button.active');
  const bubble = $('#tab-bubble');
  if (!btn) return;
  bubble.style.width = btn.offsetWidth + 'px';
  bubble.style.height = btn.offsetHeight + 'px';
  bubble.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
}
window.addEventListener('resize', moveBubble);

function go(view) {
  if (!VIEWS[view]) view = 'today';
  const changed = view !== current;
  current = view;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.view === view);
  moveBubble();
  $('#view-title').textContent = VIEWS[view].title;
  $('#view-sub').textContent = view === 'today' ? fmtLongDate(isoDate()) : '';
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  render();
  if (changed) {
    const main = $('#view');
    main.animate(
      [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
      { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 460, easing: 'cubic-bezier(.34,1.4,.64,1)' },
    );
    window.scrollTo(0, 0);
  }
}
function render() {
  VIEWS[current].render($('#view'));
  ui.justToggled = null;
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (b) go(b.dataset.view);
});

/* =========================================================
   Vue : Aujourd'hui
   ========================================================= */
function renderToday(root) {
  const today = isoDate();
  loadCalendar(today, addDays(today, 30));
  const day = data.sport.days[dayKey()];
  const events = eventsOn(today);
  loadTasks();
  const todos = allTodos().filter((t) => !t.done).sort(sortTodos).slice(0, 6);
  const tot = nutriTotals(today);
  const g = data.nutrition.goals;
  const soon = allCourses()
    .filter((c) => !c.done && c.date && c.date >= today && c.date <= addDays(today, 7))
    .sort((a, b) => a.date.localeCompare(b.date));
  const n = day.exercises.length;
  const est = sessionEstimate(day);

  root.innerHTML = `
    <div class="dash dash-today">
    <div class="col">
    <section class="group">
      <div class="group-head"><h2>${ic('dumbbell')}Séance du ${dayKey()}</h2>
        ${n ? `<button class="btn primary sm" data-act="start">${ic('play', 'sm')}Lancer</button>` : ''}</div>
      ${n
        ? `<p>${day.title ? `<strong>${esc(day.title)}</strong>, ` : ''}<span class="muted">${n} exercice${n > 1 ? 's' : ''}, environ ${fmtDurWords(est)}</span></p>`
        : `<p class="empty">Pas de séance prévue aujourd'hui.</p>`}
    </section>

    <section class="group">
      <div class="group-head"><h2>${ic('calendar')}Rendez-vous</h2><button class="btn tint sm" data-act="add-event">${ic('plus', 'sm')}Ajouter</button></div>
      ${events.length ? events.map(eventRow).join('') : `<p class="empty">Aucun rendez-vous aujourd'hui.</p>`}
    </section>
    </div>

    <div class="col">
    <section class="group">
      <div class="group-head"><h2>${ic('check')}À faire</h2><button class="btn sm" data-go="todo">Tout voir</button></div>
      ${todos.length ? todos.map(todoRow).join('') : `<p class="empty">Aucune tâche en cours.</p>`}
    </section>
    </div>

    <div class="col">
    <section class="group">
      <div class="group-head"><h2>${ic('leaf')}Nutrition</h2><button class="btn sm" data-go="nutrition">Ajouter</button></div>
      <div class="mini-macros">
        ${macroBar('Protéines', 'p', tot.p, g.p)}
        ${macroBar('Lipides', 'l', tot.l, g.l)}
        ${macroBar('Glucides', 'g', tot.g, g.g)}
      </div>
    </section>

    ${soon.length ? `
    <section class="group">
      <div class="group-head"><h2>${ic('book')}Cours de la semaine</h2><button class="btn sm" data-go="courses">Tout voir</button></div>
      ${soon.map(courseRow).join('')}
    </section>` : ''}
    </div>
    </div>
  `;

  root.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-go]')) return go(t.closest('[data-go]').dataset.go);
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'start') return startWorkout(dayKey());
    if (act === 'add-event') { await editEvent(null, today); return render(); }
    if (await handleRowClick(e)) render();
  };
}

/* =========================================================
   Vue : Sport
   ========================================================= */
function exerciseMeta(ex) {
  const parts = [];
  const sets = ex.sets || 1;
  if (ex.duration) parts.push(`${sets > 1 ? sets + ' × ' : ''}${fmtDurWords(ex.duration)}`);
  else if (ex.reps) parts.push(`${sets} × ${ex.reps} rép.`);
  else parts.push(`${sets} série${sets > 1 ? 's' : ''}`);
  if (ex.rest && sets > 1) parts.push(`repos ${fmtDurWords(ex.rest)}`);
  if (ex.restAfter) parts.push(`pause ${fmtDurWords(ex.restAfter)} après`);
  return parts.join(', ');
}

function sessionEstimate(day) {
  // somme des parties chronométrées (les séries en répétitions sont comptées à 45 s)
  let total = 0;
  day.exercises.forEach((ex, i) => {
    const sets = ex.sets || 1;
    total += sets * (ex.duration || 45);
    total += (sets - 1) * (ex.rest || 0);
    if (i < day.exercises.length - 1) total += ex.restAfter || 0;
  });
  return total;
}

function renderSport(root) {
  const today = dayKey();
  const day = data.sport.days[ui.sportDay];
  const n = day.exercises.length;

  root.innerHTML = `
    <div class="chips">
      ${DAYS.map((d) => {
        const c = data.sport.days[d].exercises.length;
        return `<button class="chip ${d === ui.sportDay ? 'active' : ''} ${d === today ? 'today' : ''}" data-day="${d}">${d.slice(0, 3)}${c ? `<span class="count">${c}</span>` : ''}</button>`;
      }).join('')}
    </div>

    <input type="text" class="day-name" id="day-title" placeholder="Nom de la séance du ${ui.sportDay}" value="${esc(day.title)}" aria-label="Nom de la séance">

    <div class="dash dash-split">
    <div class="col">
    ${n ? `
    <section class="group start-card">
      <div class="grow">
        <div style="font-weight:700">${n} exercice${n > 1 ? 's' : ''}</div>
        <div class="meta">Environ ${fmtDurWords(sessionEstimate(day))}</div>
      </div>
      <button class="btn primary" data-act="start">${ic('play', 'sm')}Lancer la séance</button>
    </section>` : ''}

    <section class="group">
      ${n ? day.exercises.map((ex, i) => `
        <details class="exercise" data-id="${ex.id}">
          <summary>
            <span class="ex-num">${i + 1}</span>
            <div class="grow"><div class="ex-name">${esc(ex.name)}</div><div class="ex-meta">${esc(exerciseMeta(ex))}</div></div>
            <span class="chev">${ic('chevR', 'sm')}</span>
          </summary>
          <div class="ex-body">
            <div class="video-slot"></div>
            ${ex.notes ? `<p class="small" style="white-space:pre-wrap;margin-bottom:12px">${esc(ex.notes)}</p>` : ''}
            ${ex.video && !youtubeId(ex.video) ? `<p class="small" style="margin-bottom:12px"><a href="${esc(ex.video)}" target="_blank" rel="noopener">Ouvrir la vidéo</a></p>` : ''}
            <div class="ex-actions">
              <button class="btn sm" data-act="edit">${ic('pencil', 'sm')}Modifier</button>
              <button class="icon-btn" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${ic('up', 'sm')}</button>
              <button class="icon-btn" data-act="down" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre">${ic('down', 'sm')}</button>
              <button class="btn sm" data-act="copy">${ic('copy', 'sm')}Copier vers…</button>
            </div>
          </div>
        </details>`).join('') : `<p class="empty">Aucun exercice le ${ui.sportDay}. Ajoute le premier ci-dessous.</p>`}
      <button class="btn tint block" data-act="add" style="margin-top:10px">${ic('plus', 'sm')}Ajouter un exercice</button>
    </section>
    </div>

    <div class="col wide-only sticky">
    <section class="group">
      <h2 style="margin-bottom:8px">Semaine</h2>
      ${DAYS.map((d) => {
        const dd = data.sport.days[d];
        const c = dd.exercises.length;
        return `<button class="week-row ${d === ui.sportDay ? 'on' : ''} ${d === today ? 'today' : ''}" data-day="${d}">
          <span class="d">${d}</span>
          <span class="grow">${c ? `<span style="font-weight:600">${esc(dd.title || 'Séance')}</span><br><span class="small muted">${c} exercice${c > 1 ? 's' : ''}, environ ${fmtDurWords(sessionEstimate(dd))}</span>` : '<span class="muted">Repos</span>'}</span>
        </button>`;
      }).join('')}
    </section>
    </div>
    </div>
  `;

  $('#day-title', root).onchange = (e) => { day.title = e.target.value.trim(); save(); };

  // La vidéo n'est chargée qu'à l'ouverture de l'exercice
  for (const det of root.querySelectorAll('details.exercise')) {
    det.addEventListener('toggle', () => {
      const slot = $('.video-slot', det);
      const ex = day.exercises.find((x) => x.id === det.dataset.id);
      const id = youtubeId(ex?.video);
      if (det.open && id && !slot.firstChild) {
        const start = youtubeStart(ex.video);
        slot.innerHTML = `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1${start ? '&start=' + start : ''}"
          title="${esc(ex.name)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
      } else if (!det.open) {
        setTimeout(() => { if (!det.open) slot.innerHTML = ''; }, 450); // coupe la lecture après l'animation
      }
    });
  }

  root.onclick = async (e) => {
    const chip = e.target.closest('[data-day]');
    if (chip) { ui.sportDay = chip.dataset.day; return render(); }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'start') return startWorkout(ui.sportDay);
    if (act === 'add') { await editExercise(null); return render(); }
    const id = e.target.closest('details')?.dataset.id;
    const list = day.exercises;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    if (act === 'edit') { await editExercise(list[i]); }
    else if (act === 'up' && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; save(); }
    else if (act === 'down' && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; save(); }
    else if (act === 'copy') {
      const res = await openForm('Copier vers un autre jour', [
        { name: 'day', label: 'Jour', type: 'select', options: DAYS.filter((d) => d !== ui.sportDay).map((d) => ({ value: d, label: d })) },
      ], {}, { okLabel: 'Copier' });
      if (!res) return;
      data.sport.days[res.day].exercises.push({ ...structuredClone(list[i]), id: uid() });
      save();
      return render();
    }
    render();
    if (act === 'up' || act === 'down') {
      const det = root.querySelector(`details[data-id="${id}"]`);
      if (det) det.open = true;
    }
  };
}

async function editExercise(ex) {
  const res = await openForm(ex ? "Modifier l'exercice" : 'Nouvel exercice', [
    { name: 'name', label: 'Nom', full: true, required: true, placeholder: 'Pompes' },
    { name: 'sets', label: 'Séries', type: 'number', default: 3 },
    { name: 'reps', label: 'Répétitions', placeholder: '12 ou 8-10', hint: 'Vide si chronométré' },
    { name: 'duration', label: "Durée d'une série", placeholder: '0:30', hint: 'Vide si en répétitions' },
    { name: 'rest', label: 'Repos entre séries', placeholder: '2:00' },
    { name: 'restAfter', label: "Pause après l'exercice", placeholder: '2:00', full: true, hint: "Avant de passer à l'exercice suivant" },
    { name: 'video', label: 'Lien YouTube', type: 'url', full: true, placeholder: 'https://youtu.be/…' },
    { name: 'notes', label: 'Notes', type: 'textarea', full: true, placeholder: 'Consignes, charge…' },
  ], ex ? {
    ...ex,
    duration: ex.duration ? fmtDur(ex.duration) : '',
    rest: ex.rest ? fmtDur(ex.rest) : '',
    restAfter: ex.restAfter ? fmtDur(ex.restAfter) : '',
  } : {}, { deletable: !!ex });
  if (!res) return;
  const list = data.sport.days[ui.sportDay].exercises;
  if (res === 'delete') { list.splice(list.indexOf(ex), 1); save(); return; }
  const out = {
    name: res.name,
    sets: Math.max(1, Math.round(res.sets || 1)),
    reps: res.reps,
    duration: parseDur(res.duration),
    rest: parseDur(res.rest),
    restAfter: parseDur(res.restAfter),
    video: res.video,
    notes: res.notes,
  };
  if (ex) Object.assign(ex, out);
  else list.push({ id: uid(), ...out });
  save();
}

/* =========================================================
   Minuteur de séance
   ========================================================= */
const RING_C = 2 * Math.PI * 46;

function buildSteps(day) {
  const steps = [];
  const exs = day.exercises;
  exs.forEach((ex, i) => {
    const sets = ex.sets || 1;
    for (let s = 1; s <= sets; s++) {
      steps.push({ kind: 'work', ex, set: s, sets, duration: ex.duration || 0 });
      const last = s === sets;
      const rest = last ? (i < exs.length - 1 ? ex.restAfter : 0) : ex.rest;
      if (rest) steps.push({ kind: 'rest', duration: rest, after: ex, final: last });
    }
  });
  return steps;
}

let T = null; // état du minuteur en cours

function startWorkout(dk) {
  const day = data.sport.days[dk];
  if (!day.exercises.length) return;
  const steps = buildSteps(day);
  T = { dk, day, steps, i: 0, endAt: 0, remaining: 0, paused: false, tick: null, lastBeep: null, wakeLock: null };
  $('#timer').hidden = false;
  document.body.style.overflow = 'hidden';
  requestWakeLock();
  unlockAudio();
  enterStep(0);
}

function stepLabel(st) {
  if (!st) return 'fin de la séance';
  if (st.kind === 'rest') return `repos ${fmtDurWords(st.duration)}`;
  return `${st.ex.name}${st.sets > 1 ? `, série ${st.set}/${st.sets}` : ''}`;
}

function enterStep(i) {
  clearInterval(T.tick);
  T.i = i;
  const st = T.steps[i];
  if (!st) return finishWorkout();
  T.paused = false;
  T.lastBeep = null;
  if (st.duration) {
    T.remaining = st.duration;
    T.endAt = Date.now() + st.duration * 1000;
    T.tick = setInterval(timerTick, 200);
  }
  if (st.kind === 'rest') {
    speak(`Repos, ${fmtDurWords(st.duration)}. Ensuite : ${stepLabel(T.steps[i + 1])}`);
  } else {
    const what = st.duration ? fmtDurWords(st.duration) : st.ex.reps ? `${st.ex.reps} répétitions` : '';
    speak(`${st.ex.name}${st.sets > 1 ? `, série ${st.set} sur ${st.sets}` : ''}. ${what}`);
  }
  renderTimer();
}

function timerTick() {
  if (!T || T.paused) return;
  const st = T.steps[T.i];
  T.remaining = Math.max(0, (T.endAt - Date.now()) / 1000);
  const left = Math.ceil(T.remaining);
  if (left <= 3 && left > 0 && T.lastBeep !== left) { T.lastBeep = left; beep(660, 0.12); }
  if (T.remaining <= 0) {
    beep(990, 0.35);
    vibrate([200, 100, 200]);
    return enterStep(T.i + 1);
  }
  const clock = $('#timer .timer-clock');
  if (clock) clock.textContent = fmtDur(left);
  const prog = $('#timer .prog');
  if (prog) prog.style.strokeDashoffset = RING_C * (1 - T.remaining / st.duration);
}

function renderTimer() {
  const st = T.steps[T.i];
  const el = $('#timer');
  const next = T.steps[T.i + 1];
  el.classList.toggle('rest', st.kind === 'rest');
  const pct = (T.i / T.steps.length) * 100;
  const offset = st.duration ? RING_C * (1 - T.remaining / st.duration) : 0;
  el.innerHTML = `
    <div class="timer-top">
      <span class="muted small" style="font-weight:600">${esc(T.day.title || 'Séance du ' + T.dk)}, étape ${T.i + 1} sur ${T.steps.length}</span>
      <button class="icon-btn" data-t="voice" aria-label="${data.settings.voice ? 'Couper la voix' : 'Activer la voix'}">${ic(data.settings.voice ? 'volume' : 'mute')}</button>
    </div>
    <div class="timer-progress"><div style="width:${pct}%"></div></div>
    <div class="timer-main">
      <div class="timer-kind">${st.kind === 'rest' ? 'Repos' : st.sets > 1 ? `Série ${st.set} sur ${st.sets}` : 'Exercice'}</div>
      <div class="timer-name">${esc(st.kind === 'rest' ? 'Récupère' : st.ex.name)}</div>
      <div class="ring">
        <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="46"/>
          <circle class="prog" cx="50" cy="50" r="46" stroke-dasharray="${RING_C}" stroke-dashoffset="${st.duration ? offset : 0}"/></svg>
        ${st.duration
          ? `<div class="timer-clock">${fmtDur(Math.ceil(T.remaining))}</div>`
          : `<div class="timer-reps">${esc(st.ex.reps || '–')}<small>répétitions</small></div>`}
      </div>
      <div class="timer-next">Ensuite : ${esc(stepLabel(next))}</div>
    </div>
    <div class="timer-controls">
      <button class="icon-btn" data-t="prev" ${T.i === 0 ? 'disabled' : ''} aria-label="Étape précédente">${ic('prev')}</button>
      ${st.duration
        ? `<button class="btn primary" data-t="pause">${T.paused ? `${ic('play', 'sm')}Reprendre` : `${ic('pause', 'sm')}Pause`}</button>`
        : `<button class="btn primary" data-t="next">${ic('tick', 'sm')}Série faite</button>`}
      <button class="icon-btn" data-t="skip" aria-label="Étape suivante">${ic('next')}</button>
    </div>
    <div class="timer-stop"><button class="btn danger" data-t="stop">Arrêter la séance</button></div>
  `;
}

$('#timer').addEventListener('click', (e) => {
  const a = e.target.closest('[data-t]')?.dataset.t;
  if (!a || !T) return;
  if (a === 'stop') { if (confirm('Arrêter la séance ?')) closeTimer(); return; }
  if (a === 'close') return closeTimer();
  if (a === 'next' || a === 'skip') return enterStep(T.i + 1);
  if (a === 'prev') return enterStep(Math.max(0, T.i - 1));
  if (a === 'voice') { data.settings.voice = !data.settings.voice; save(); if (!data.settings.voice) speechSynthesis?.cancel(); return renderTimer(); }
  if (a === 'pause') {
    if (T.paused) { T.endAt = Date.now() + T.remaining * 1000; T.paused = false; }
    else { T.remaining = Math.max(0, (T.endAt - Date.now()) / 1000); T.paused = true; }
    renderTimer();
  }
});

function finishWorkout() {
  clearInterval(T.tick);
  speak('Séance terminée. Bravo !');
  vibrate([300, 100, 300, 100, 300]);
  $('#timer').classList.remove('rest');
  $('#timer').innerHTML = `
    <div class="timer-main">
      <div class="ring" style="width:120px">
        <svg viewBox="0 0 100 100"><circle class="prog" cx="50" cy="50" r="46" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/></svg>
        ${ic('tick', 'lg')}
      </div>
      <div class="timer-done">Séance terminée</div>
      <div class="timer-sub">${esc(T.day.title || 'Séance du ' + T.dk)}</div>
    </div>
    <div class="timer-controls"><button class="btn primary" data-t="close">Fermer</button></div>`;
}

function closeTimer() {
  if (!T) return;
  clearInterval(T.tick);
  T.wakeLock?.release?.().catch(() => {});
  speechSynthesis?.cancel();
  T = null;
  $('#timer').hidden = true;
  $('#timer').innerHTML = '';
  document.body.style.overflow = '';
}

async function requestWakeLock() {
  try { if (T && 'wakeLock' in navigator) T.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* refusé */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && T) { requestWakeLock(); timerTick(); }
});

let audioCtx = null;
function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* pas de son */ }
}
function beep(freq, dur) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.frequency.value = freq;
  o.connect(g); g.connect(audioCtx.destination);
  const t = audioCtx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}
function vibrate(p) { try { navigator.vibrate?.(p); } catch { /* */ } }
function speak(text) {
  if (!data.settings.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  speechSynthesis.speak(u);
}

/* =========================================================
   Vue : Agenda
   ========================================================= */
/* Google Agenda : quand le compte est connecté, les rendez-vous viennent de l'agenda
   principal (cache local pour le hors ligne). data.events ne garde que les rendez-vous
   créés dans l'app avant la connexion. */
const GCAL_KEY = 'life.gcal';
const GCAL = { enabled: false, events: new Map(), loaded: new Map(), loading: new Map(), error: null };
try { for (const e of JSON.parse(localStorage.getItem(GCAL_KEY))?.events || []) GCAL.events.set(e.id, e); } catch { /* */ }
function saveGcalCache() {
  try { localStorage.setItem(GCAL_KEY, JSON.stringify({ events: [...GCAL.events.values()] })); } catch { /* */ }
}

// Événement Google -> format de l'app (dates et heures locales)
function fromGoogle(it) {
  const s = it.start || {}, e = it.end || {};
  const base = {
    id: it.id, source: 'google', title: it.summary || '(Sans titre)', place: it.location || '', link: it.htmlLink,
    note: (it.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(),
  };
  if (s.date) {
    const last = addDays(e.date || s.date, -1); // la fin d'un jour entier est exclusive chez Google
    return { ...base, date: s.date, endDate: last < s.date ? s.date : last, time: '', end: '' };
  }
  const st = new Date(s.dateTime), en = new Date(e.dateTime || s.dateTime);
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = isoDate(st), lastDay = isoDate(new Date(Math.max(st.getTime(), en.getTime() - 1)));
  return { ...base, date: day, endDate: lastDay, time: hm(st), end: hm(en) };
}

async function gcalRequest(method, id, body) {
  let r;
  try {
    r = await fetch('/api/calendar' + (id ? '/' + encodeURIComponent(id) : ''), {
      method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('pas de connexion internet');
  }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `erreur ${r.status}`);
  return out;
}

// Charge les rendez-vous Google entre deux dates (incluses). Ne recharge pas avant 2 min sauf force.
function loadCalendar(from, to, force = false) {
  if (!GCAL.enabled) return Promise.resolve();
  const key = from + '_' + to;
  if (GCAL.loading.has(key)) return GCAL.loading.get(key);
  const t = GCAL.loaded.get(key);
  if (!force && t && Date.now() - t < 120000) return Promise.resolve();
  const p = (async () => {
    const q = new URLSearchParams({ timeMin: parseIso(from).toISOString(), timeMax: parseIso(addDays(to, 1)).toISOString() });
    try {
      const r = await fetch('/api/calendar?' + q, { credentials: 'same-origin', cache: 'no-store' });
      const out = await r.json();
      if (!r.ok) {
        GCAL.error = out.error || 'Google Agenda ne répond pas.';
      } else {
        for (const [id, e] of GCAL.events) if (e.date <= to && (e.endDate || e.date) >= from) GCAL.events.delete(id);
        for (const it of out.items) { const e = fromGoogle(it); GCAL.events.set(e.id, e); }
        GCAL.error = null;
        saveGcalCache();
      }
    } catch {
      // hors ligne : on garde le cache
    }
    GCAL.loaded.set(key, Date.now());
    GCAL.loading.delete(key);
    if (!T && (current === 'today' || current === 'agenda')) render();
  })();
  GCAL.loading.set(key, p);
  return p;
}

const allEvents = () => [...data.events, ...(GCAL.enabled ? GCAL.events.values() : [])];

function eventsOn(iso) {
  return allEvents()
    .filter((e) => e.date === iso || (e.endDate && e.date <= iso && iso <= e.endDate))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

// Proposé une fois après la connexion : copier les rendez-vous de l'app dans Google Agenda
async function migrateLocalEvents() {
  if (!GCAL.enabled || !data.events.length || data.settings.keepLocalEvents) return;
  const n = data.events.length;
  const ok = confirm(`Tu as ${n} rendez-vous enregistré${n > 1 ? 's' : ''} dans l'app avant la connexion à Google Agenda. Les copier dans ton Google Agenda ?\n\nAnnuler : les laisser seulement dans l'app.`);
  if (!ok) { data.settings.keepLocalEvents = true; save(); return; }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const ev of [...data.events]) {
    try {
      const e = fromGoogle(await gcalRequest('POST', null, { ...ev, tz }));
      GCAL.events.set(e.id, e);
      data.events = data.events.filter((x) => x !== ev);
    } catch (err) {
      alert(`« ${ev.title} » n'a pas pu être copié : ${err.message}. Il reste dans l'app.`);
      break;
    }
  }
  saveGcalCache();
  save();
  render();
}

function eventRow(ev) {
  return `<div class="item" data-kind="${ev.source === 'google' ? 'gevent' : 'event'}" data-id="${esc(ev.id)}">
    <div class="item-time">${esc(ev.time || 'Journée')}</div>
    <div class="grow">
      <div class="item-title">${esc(ev.title)}</div>
      ${ev.end || ev.place ? `<div class="item-sub">${ev.end ? `jusqu'à ${esc(ev.end)}` : ''}${ev.place ? `${ic('pin', 'sm')}${esc(ev.place)}` : ''}</div>` : ''}
      ${ev.note ? `<div class="item-sub" style="white-space:pre-wrap">${esc(ev.note)}</div>` : ''}
    </div>
    <button class="icon-btn" data-row="edit" aria-label="Modifier">${ic('pencil', 'sm')}</button>
  </div>`;
}

async function editEvent(ev, date) {
  const res = await openForm(ev ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous', [
    { name: 'title', label: 'Titre', full: true, required: true, placeholder: 'Dentiste' },
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'time', label: 'Heure', type: 'time' },
    { name: 'place', label: 'Lieu' },
    { name: 'end', label: 'Fin', type: 'time' },
    { name: 'note', label: 'Note', type: 'textarea', full: true },
  ], ev || { date }, { deletable: !!ev });
  if (!res) return;
  if (GCAL.enabled && (!ev || ev.source === 'google')) {
    // connecté : le rendez-vous est enregistré directement dans Google Agenda
    try {
      if (res === 'delete') {
        await gcalRequest('DELETE', ev.id);
        GCAL.events.delete(ev.id);
      } else {
        const e = fromGoogle(await gcalRequest(ev ? 'PATCH' : 'POST', ev?.id, { ...res, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));
        if (ev) GCAL.events.delete(ev.id);
        GCAL.events.set(e.id, e);
      }
      saveGcalCache();
    } catch (err) {
      alert(`Google Agenda n'a pas enregistré ce changement : ${err.message}.`);
    }
    return;
  }
  if (res === 'delete') { data.events = data.events.filter((x) => x !== ev); save(); return; }
  if (ev) Object.assign(ev, res);
  else data.events.push({ id: uid(), ...res });
  save();
}

function renderAgenda(root) {
  const [y, m] = ui.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const today = isoDate();
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(isoDate(new Date(y, m - 1, 1 - startOffset + i)));
  // on coupe la dernière ligne si elle est entièrement dans le mois suivant
  while (cells.length > 35 && cells[cells.length - 7].slice(0, 7) !== ui.calMonth) cells.splice(-7);

  loadCalendar(cells[0], cells[cells.length - 1]);
  const evDays = new Set();
  for (const e of allEvents()) {
    // rendez-vous sur plusieurs jours : un point chaque jour (limité à 60 jours)
    for (let d = e.date, i = 0; d <= (e.endDate || e.date) && i < 60; d = addDays(d, 1), i++) evDays.add(d);
  }
  const courseDays = new Set(allCourses().filter((c) => c.date && !c.done).map((c) => c.date));
  const sel = ui.calSelected;
  const dayCourses = allCourses().filter((c) => c.date === sel);

  root.innerHTML = `
    <div class="dash dash-split dash-agenda">
    <div class="col">
    <section class="group">
      <div class="cal-head">
        <button class="icon-btn" data-cal="-1" aria-label="Mois précédent">${ic('chevL')}</button>
        <h2>${first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
        <button class="icon-btn" data-cal="1" aria-label="Mois suivant">${ic('chevR')}</button>
      </div>
      <div class="cal-grid">
        ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells.map((iso) => `<button class="cal-day ${iso.slice(0, 7) !== ui.calMonth ? 'other' : ''} ${iso === today ? 'today' : ''} ${iso === sel ? 'selected' : ''}" data-date="${iso}">
          ${+iso.slice(8)}
          <span class="cal-dots">${evDays.has(iso) ? '<i></i>' : ''}${courseDays.has(iso) ? '<i class="course"></i>' : ''}</span>
        </button>`).join('')}
      </div>
      ${sel !== today ? `<div class="row" style="justify-content:center;margin-top:8px"><button class="btn sm" data-act="today">Revenir à aujourd'hui</button></div>` : ''}
    </section>
    </div>

    <div class="col sticky">
    <section class="group">
      <div class="group-head"><h2 style="text-transform:capitalize">${fmtLongDate(sel)}</h2>
        <button class="btn primary sm" data-act="add">${ic('plus', 'sm')}Rendez-vous</button></div>
      ${GCAL.error ? `<p class="hint" style="color:var(--danger);margin:0 0 8px">${esc(GCAL.error)}</p>` : ''}
      ${eventsOn(sel).map(eventRow).join('') || `<p class="empty">Aucun rendez-vous ce jour-là.</p>`}
      ${dayCourses.length ? `<h3 style="margin:14px 0 4px">Cours et rendus</h3>${dayCourses.map(courseRow).join('')}` : ''}
    </section>
    </div>
    </div>
  `;

  root.onclick = async (e) => {
    const nav = e.target.closest('[data-cal]');
    if (nav) {
      ui.calMonth = isoDate(new Date(y, m - 1 + Number(nav.dataset.cal), 1)).slice(0, 7);
      return render();
    }
    const day = e.target.closest('[data-date]');
    if (day) {
      ui.calSelected = day.dataset.date;
      ui.calMonth = day.dataset.date.slice(0, 7);
      return render();
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'today') { ui.calSelected = today; ui.calMonth = today.slice(0, 7); return render(); }
    if (act === 'add') { await editEvent(null, sel); return render(); }
    if (await handleRowClick(e)) render();
  };
}

/* =========================================================
   Vue : Tâches
   ========================================================= */
/* Google Tasks : quand le compte est connecté, la to-do list est la liste « Mes tâches ».
   Les tâches qui commencent par « Repas » (dictées à la montre) partent dans Nutrition.
   data.todos ne garde que les tâches créées dans l'app avant la connexion. */
const GTASKS_KEY = 'life.gtasks';
const GTASKS = { enabled: false, items: new Map(), loadedAt: 0, loading: null, error: null };
try { for (const t of JSON.parse(localStorage.getItem(GTASKS_KEY))?.items || []) GTASKS.items.set(t.id, t); } catch { /* */ }
function saveTasksCache() {
  try { localStorage.setItem(GTASKS_KEY, JSON.stringify({ items: [...GTASKS.items.values()] })); } catch { /* */ }
}
const MEAL_RE = /^\s*repas\b[\s:,.-]*/i;

function fromGTask(t) {
  return {
    id: t.id, source: 'google', text: t.title || '', due: t.due ? t.due.slice(0, 10) : '',
    done: t.status === 'completed', doneAt: t.completed ? Date.parse(t.completed) : null,
    created: t.updated ? Date.parse(t.updated) : 0,
  };
}

async function tasksRequest(method, path, body) {
  let r;
  try {
    r = await fetch('/api/tasks' + (path ? '/' + path : ''), {
      method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('pas de connexion internet');
  }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `erreur ${r.status}`);
  return out;
}

// Recharge « Mes tâches » (au plus une fois par minute sauf force) et importe les repas
function loadTasks(force = false) {
  if (!GTASKS.enabled) return Promise.resolve();
  if (GTASKS.loading) return GTASKS.loading;
  if (!force && Date.now() - GTASKS.loadedAt < 60000) return Promise.resolve();
  GTASKS.loading = (async () => {
    try {
      const r = await fetch('/api/tasks', { credentials: 'same-origin', cache: 'no-store' });
      const out = await r.json();
      if (!r.ok) GTASKS.error = out.error || 'Google Tasks ne répond pas.';
      else {
        GTASKS.items = new Map(out.items.filter((t) => t.title).map((t) => [t.id, fromGTask(t)]));
        GTASKS.error = null;
        await importMeals();
        saveTasksCache();
      }
    } catch {
      // hors ligne : on garde le cache
    }
    GTASKS.loadedAt = Date.now();
    GTASKS.loading = null;
    if (!T && ['today', 'todo', 'nutrition'].includes(current)) render();
  })();
  return GTASKS.loading;
}

// « 30 g de protéines de cacahuètes » -> { p: 30, label: 'Cacahuètes' }
function parseMeal(text) {
  let rest = ' ' + text.replace(MEAL_RE, '') + ' ';
  const out = { p: 0, l: 0, g: 0 };
  const KEYS = [['p', 'prot[ée]ines?'], ['l', 'lipides?|graisses?|mati[èe]res? grasses?'], ['g', 'glucides?|sucres?']];
  const NUM = '(\\d+(?:[.,]\\d+)?)\\s*(?:g|gr|grammes?)\\b';
  for (const [k, words] of KEYS) {
    // « 30 g de protéines » ou « protéines 30 g »
    const a = new RegExp(`${NUM}\\s*(?:de\\s+|d['’]\\s*)?(?:${words})`, 'i');
    const b = new RegExp(`(?:${words})\\s*:?\\s*${NUM}`, 'i');
    const m = rest.match(a) || rest.match(b);
    if (m) {
      out[k] = Number(m[1].replace(',', '.'));
      rest = rest.replace(m[0], ' ');
    }
  }
  let label = rest
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;.]*(?:(?:et|de|des|du|avec|pour)\s+|d['’]\s*|,\s*)+/i, '')
    .replace(/(?:\s+(?:et|de|des|du|avec|d['’])|\s*,)+[\s,;.]*$/i, '')
    .trim();
  label = label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Repas';
  return { ...out, label, pending: !out.p && !out.l && !out.g };
}

// Les tâches « Repas … » deviennent des aliments ; le serveur garantit un seul import par tâche
async function importMeals() {
  const meals = [...GTASKS.items.values()].filter((t) => !t.done && MEAL_RE.test(t.text));
  let added = 0;
  for (const t of meals) {
    try {
      const r = await tasksRequest('POST', encodeURIComponent(t.id) + '/claim');
      GTASKS.items.delete(t.id);
      if (!r.claimed || data.nutrition.entries.some((e) => e.gtask === t.id)) continue;
      const m = parseMeal(t.text);
      data.nutrition.entries.push({ id: uid(), date: isoDate(new Date(t.created || Date.now())), label: m.label, p: m.p, l: m.l, g: m.g, pending: m.pending, via: 'montre', gtask: t.id, said: t.text });
      added++;
    } catch {
      break; // hors ligne : on réessaiera
    }
  }
  if (added) save();
}

const allTodos = () => [...data.todos, ...(GTASKS.enabled ? [...GTASKS.items.values()].filter((t) => !MEAL_RE.test(t.text)) : [])];

// Proposé une fois après la connexion : copier les tâches de l'app dans Google Tasks
async function migrateLocalTodos() {
  if (!GTASKS.enabled || !data.todos.length || data.settings.keepLocalTodos) return;
  const n = data.todos.length;
  const ok = confirm(`Tu as ${n} tâche${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''} dans l'app avant la connexion à Google Tasks. Les copier dans « Mes tâches » ?\n\nAnnuler : les laisser seulement dans l'app.`);
  if (!ok) { data.settings.keepLocalTodos = true; save(); return; }
  for (const t of [...data.todos]) {
    try {
      const g = fromGTask(await tasksRequest('POST', null, { text: t.text, due: t.due || '', done: !!t.done }));
      GTASKS.items.set(g.id, g);
      data.todos = data.todos.filter((x) => x !== t);
    } catch (err) {
      alert(`« ${t.text} » n'a pas pu être copiée : ${err.message}. Elle reste dans l'app.`);
      break;
    }
  }
  saveTasksCache();
  save();
  render();
}

function sortTodos(a, b) {
  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due) return -1;
  if (b.due) return 1;
  return (a.created || 0) - (b.created || 0);
}

// La case ne « pop » que si on vient de la cocher (pas à chaque rendu)
const checkAttrs = (o) => `${o.done ? 'checked' : ''} style="${o.done && ui.justToggled !== o.id ? 'animation:none' : ''}"`;

function todoRow(t) {
  const late = t.due && !t.done && t.due < isoDate();
  return `<div class="item" data-kind="${t.source === 'google' ? 'gtask' : 'todo'}" data-id="${esc(t.id)}">
    <input type="checkbox" class="check" data-row="toggle" ${checkAttrs(t)} aria-label="Fait">
    <div class="grow">
      <div class="${t.done ? 'done-text' : ''}">${esc(t.text)}</div>
      ${t.due ? `<div class="due ${late ? 'late' : ''}">${late ? 'En retard, ' : ''}${fmtShortDate(t.due)}</div>` : ''}
    </div>
    <button class="icon-btn" data-row="edit" aria-label="Modifier">${ic('pencil', 'sm')}</button>
  </div>`;
}

async function editTodo(t) {
  const res = await openForm('Modifier la tâche', [
    { name: 'text', label: 'Tâche', full: true, required: true },
    { name: 'due', label: 'Échéance', type: 'date', full: true },
  ], t, { deletable: true });
  if (!res) return;
  if (t.source === 'google') {
    try {
      if (res === 'delete') {
        await tasksRequest('DELETE', encodeURIComponent(t.id));
        GTASKS.items.delete(t.id);
      } else {
        const g = fromGTask(await tasksRequest('PATCH', encodeURIComponent(t.id), { text: res.text, due: res.due }));
        GTASKS.items.set(g.id, g);
      }
      saveTasksCache();
    } catch (err) {
      alert(`Google Tasks n'a pas enregistré ce changement : ${err.message}.`);
    }
    return;
  }
  if (res === 'delete') data.todos = data.todos.filter((x) => x !== t);
  else Object.assign(t, { text: res.text, due: res.due });
  save();
}

function renderTodo(root) {
  loadTasks();
  const list = allTodos();
  const open = list.filter((t) => !t.done).sort(sortTodos);
  const done = list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  root.innerHTML = `
    <div class="dash dash-even">
    <div class="col">
    <form class="group quick-add" id="todo-form">
      <input type="text" name="text" placeholder="Nouvelle tâche" required class="grow" autocomplete="off">
      <input type="date" name="due" aria-label="Échéance">
      <button class="btn primary" aria-label="Ajouter la tâche">${ic('plus', 'sm')}</button>
    </form>
    ${GTASKS.error ? `<p class="hint" style="color:var(--danger);margin:-4px 4px 12px">${esc(GTASKS.error)}</p>` : ''}
    <section class="group">
      ${open.map(todoRow).join('') || `<p class="empty">Aucune tâche en cours. Écris-en une au-dessus.</p>`}
    </section>
    </div>
    <div class="col">
    ${done.length ? `
    <div class="section-label row"><span class="grow">Faites (${done.length})</span>
      <button class="btn sm danger" data-act="clear">Effacer</button></div>
    <section class="group">${done.map(todoRow).join('')}</section>` : `
    <section class="group wide-only"><h2>Faites</h2><p class="empty">Les tâches cochées apparaîtront ici.</p></section>`}
    </div>
    </div>
  `;
  $('#todo-form', root).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const t = { text: f.text.value.trim(), due: f.due.value };
    if (GTASKS.enabled) {
      try {
        const g = fromGTask(await tasksRequest('POST', null, t));
        GTASKS.items.set(g.id, g);
        saveTasksCache();
      } catch (err) {
        return alert(`Google Tasks n'a pas ajouté la tâche : ${err.message}.`);
      }
    } else {
      data.todos.push({ id: uid(), ...t, done: false, created: Date.now() });
      save();
    }
    render();
    $('#todo-form input[name=text]').focus();
  };
  root.onclick = async (e) => {
    if (e.target.closest('[data-act="clear"]')) {
      if (!confirm('Effacer toutes les tâches faites ?')) return;
      data.todos = data.todos.filter((t) => !t.done);
      save();
      if (GTASKS.enabled && [...GTASKS.items.values()].some((t) => t.done)) {
        try {
          await tasksRequest('POST', 'clear');
          for (const [id, t] of GTASKS.items) if (t.done) GTASKS.items.delete(id);
          saveTasksCache();
        } catch (err) {
          alert(`Google Tasks n'a pas effacé les tâches faites : ${err.message}.`);
        }
      }
      return render();
    }
    if (await handleRowClick(e)) render();
  };
}

/* =========================================================
   Vue : Cours
   ========================================================= */
/* Google Drive : le dossier de cours (« Cours » par défaut) range l'onglet Cours tout seul.
   Arborescence attendue : <dossier>/<Matière>/<CM|TD|TP|…>/fichiers.
   Ce qu'on ajoute dans l'app (fait, date, notes, titre) va dans data.courseMeta[idFichier]. */
const DRIVE_KEY = 'life.drive';
const DRIVE = { enabled: false, raw: [], items: [], at: 0, loading: null, error: null };
try { const c = JSON.parse(localStorage.getItem(DRIVE_KEY)); if (c?.raw) { DRIVE.raw = c.raw; DRIVE.root = c.root; } } catch { /* */ }

// Nom du sous-dossier -> catégorie dont un mot-clé commence le nom (le plus long gagne), sinon null
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function typeFromFolder(name) {
  const n = norm(name);
  let best = null, len = 0;
  for (const t of data.courseTypes) {
    for (const k of String(t.folders || '').split(',').map(norm).filter(Boolean)) {
      if (n.startsWith(k) && k.length > len) { best = t.id; len = k.length; }
    }
  }
  return best;
}

// Seuls les documents sont affichés : pas le code, les exécutables ni les images des dossiers de TP
const DOC_EXT = /\.(pdf|docx?|pptx?|xlsx?)$/i;
const DOC_MIME = /^application\/vnd\.google-apps\.(document|presentation|spreadsheet)$/;
// Chaque sous-dossier du dossier de cours est affiché comme une « matière » (y compris « À trier », « Perso »…).
function fromDriveFile(f) {
  const [subject, typeFolder, ...rest] = f.path;
  if (!subject) return null; // fichiers posés à la racine du dossier de cours : ignorés
  if (!DOC_EXT.test(f.name) && !DOC_MIME.test(f.mimeType || '')) return null;
  // fichier posé directement dans le dossier (sans sous-dossier CM, TD, TP…) : « Autres »
  let type = OTHER_TYPE.id, sub = [];
  if (typeFolder !== undefined) {
    const t = typeFromFolder(typeFolder);
    if (t) { type = t; sub = rest; } else { type = 'autre'; sub = [typeFolder, ...rest]; }
  }
  return { id: f.id, source: 'drive', subject, type, folder: sub.join(' / '), name: f.name, title: titleFromName(f.name), link: f.link, modified: f.modified };
}

function loadDrive(force = false) {
  if (!DRIVE.enabled) return Promise.resolve();
  if (DRIVE.loading) return DRIVE.loading;
  if (!force && Date.now() - DRIVE.at < 300000) return Promise.resolve();
  DRIVE.loading = (async () => {
    try {
      const root = data.settings.driveRoot || 'Cours';
      const r = await fetch('/api/drive/courses?root=' + encodeURIComponent(root), { credentials: 'same-origin', cache: 'no-store' });
      const out = await r.json();
      if (!r.ok) DRIVE.error = out.error || 'Google Drive ne répond pas.';
      else {
        DRIVE.raw = out.files;
        DRIVE.root = out.root.name;
        refreshDriveItems();
        DRIVE.error = null;
        try { localStorage.setItem(DRIVE_KEY, JSON.stringify({ raw: DRIVE.raw, root: DRIVE.root })); } catch { /* */ }
      }
    } catch {
      // hors ligne : on garde le cache
    }
    DRIVE.at = Date.now();
    DRIVE.loading = null;
    if (!T && ['courses', 'today', 'agenda'].includes(current)) render();
  })();
  return DRIVE.loading;
}

// Recalcule les éléments (catégories, filtre) depuis la liste brute du Drive
function refreshDriveItems() {
  DRIVE.items = (DRIVE.raw || []).map(fromDriveFile).filter(Boolean);
}

const withMeta = (it) => {
  const m = data.courseMeta[it.id] || {};
  return { ...it, title: m.title || it.title, done: !!m.done, date: m.date || '', notes: m.notes || '' };
};
const allCourses = () => [...data.courses, ...(DRIVE.enabled ? DRIVE.items.map(withMeta) : [])];

async function editDriveCourse(c) {
  const original = DRIVE.items.find((x) => x.id === c.id);
  const res = await openForm('Modifier', [
    { name: 'title', label: 'Titre', full: true, required: true, hint: `Fichier Drive : ${c.name}` },
    { name: 'date', label: 'Date de la séance ou du rendu', type: 'date', full: true },
    { name: 'notes', label: 'Notes', type: 'textarea', full: true },
  ], c);
  if (!res) return;
  const m = data.courseMeta[c.id] || {};
  data.courseMeta[c.id] = { ...m, title: original && res.title === original.title ? undefined : res.title, date: res.date, notes: res.notes };
  save();
}

async function changeDriveRoot() {
  const res = await openForm('Dossier de cours sur Drive', [
    { name: 'root', label: 'Nom du dossier', full: true, required: true, hint: 'Il doit contenir un dossier par matière, avec dedans CM, TD ou TP.' },
  ], { root: data.settings.driveRoot || 'Cours' }, { okLabel: 'Utiliser ce dossier' });
  if (!res) return;
  data.settings.driveRoot = res.root;
  save();
  DRIVE.items = [];
  await loadDrive(true);
}

function courseRow(c) {
  const type = typeOf(c.type);
  const drive = c.source === 'drive';
  return `<div class="item" data-kind="${drive ? 'dcourse' : 'course'}" data-id="${esc(c.id)}">
    <input type="checkbox" class="check" data-row="toggle" ${checkAttrs(c)} aria-label="Fait">
    <div class="grow">
      <div class="row" style="align-items:flex-start"><span class="course-type" style="--c:${esc(type.color)}">${esc(type.label)}</span>
        <span class="item-title ${c.done ? 'done-text' : ''}">${esc(c.title)}</span></div>
      <div class="item-sub" style="margin-top:3px">${[c.folder && esc(c.folder), c.date && fmtShortDate(c.date)].filter(Boolean).join(', ') || (drive ? '' : esc(c.subject || ''))}</div>
      ${drive ? `<div class="small row" style="margin-top:4px;gap:14px">
        <a href="#" data-preview="${esc(c.id)}" class="row" style="display:inline-flex;gap:5px">${ic('eye', 'sm')}Aperçu</a>
        ${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener" class="row" style="display:inline-flex;gap:5px">${ic('link', 'sm')}Ouvrir dans Drive</a>` : ''}</div>` : ''}
      ${c.fileId ? `<div class="small" style="margin-top:4px"><a href="#" data-open-file="${c.id}" class="row" style="display:inline-flex;gap:5px">${ic('book', 'sm')}${esc(c.fileName || 'Ouvrir le fichier')}</a></div>` : ''}
      ${!drive && c.link ? `<div class="small" style="margin-top:4px"><a href="${esc(c.link)}" target="_blank" rel="noopener" class="row" style="display:inline-flex;gap:5px">${ic('link', 'sm')}Ouvrir le lien</a></div>` : ''}
      ${c.notes ? `<div class="item-sub" style="white-space:pre-wrap;margin-top:4px">${esc(c.notes)}</div>` : ''}
    </div>
    <button class="icon-btn" data-row="edit" aria-label="Modifier">${ic('pencil', 'sm')}</button>
  </div>`;
}

// liste des matières + celles déjà utilisées par des cours (données importées, anciennes versions)
const sortedSubjects = () => [...new Set([...data.subjects, ...data.courses.map((c) => c.subject).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'fr'));
// + les matières lues sur le Drive (pour le filtre et le formulaire)
const allSubjects = () => [...new Set([...sortedSubjects(), ...(DRIVE.enabled ? DRIVE.items.map((c) => c.subject) : [])])].sort((a, b) => a.localeCompare(b, 'fr'));

// "TD3_integrales-v2.pdf" -> "TD3 integrales-v2"
function titleFromName(name) {
  const s = String(name).replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Nom de fichier à la fin d'un lien, seulement s'il a une extension (.pdf…)
function nameFromUrl(u) {
  try {
    const last = decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || '');
    return /\.[a-z0-9]{2,5}$/i.test(last) ? last : null;
  } catch { return null; }
}

async function editCourse(c) {
  const preSubject = ui.courseSubject !== 'all' && ui.courseSubject !== '__none' ? ui.courseSubject : (allSubjects()[0] || '');
  const res = await openForm(c ? 'Modifier' : 'Ajouter un cours, TD ou TP', [
    { name: 'type', label: 'Catégorie', type: 'select', options: courseTypes().map((t) => ({ value: t.id, label: t.label })) },
    { name: 'subject', label: 'Matière', type: 'select-new',
      options: [{ value: '', label: 'Sans matière' }, ...allSubjects().map((s) => ({ value: s, label: s }))],
      newLabel: 'Nouvelle matière…', newPlaceholder: 'Nom de la matière' },
    { name: 'file', label: 'Document', type: 'file', full: true,
      hint: c?.fileName ? `Actuel : ${c.fileName}. Choisis un autre fichier pour le remplacer.` : 'PDF, image… Il est gardé sur cet appareil.' },
    { name: 'link', label: 'Ou un lien', type: 'url', full: true, placeholder: 'Drive, Moodle…' },
    { name: 'title', label: 'Titre', full: true, required: true, placeholder: 'Rempli avec le nom du document', hint: 'Modifiable à tout moment' },
    { name: 'date', label: 'Date de la séance ou du rendu', type: 'date', full: true },
    { name: 'notes', label: 'Notes', type: 'textarea', full: true },
  ], c || { type: ui.courseType !== 'all' ? ui.courseType : courseTypes()[0].id, subject: preSubject }, {
    deletable: !!c,
    setup(form) {
      // le titre suit le nom du document tant qu'on ne l'a pas réécrit à la main
      let auto = c?.fileName ? titleFromName(c.fileName) : null;
      const follow = (name) => {
        if (!name) return;
        const t = form.elements.title;
        if (t.value.trim() === '' || t.value === auto) t.value = auto = titleFromName(name);
      };
      form.elements.file.onchange = () => follow(form.elements.file.files[0]?.name);
      form.elements.link.oninput = () => follow(nameFromUrl(form.elements.link.value));
    },
  });
  if (!res) return;
  if (res === 'delete') {
    if (c.fileId) delFile(c.fileId);
    data.courses = data.courses.filter((x) => x !== c);
    save();
    return;
  }
  if (res.subject && !data.subjects.includes(res.subject)) data.subjects.push(res.subject);
  const file = res.file;
  delete res.file;
  const target = c || { id: uid(), done: false, created: Date.now() };
  Object.assign(target, res);
  if (file) {
    const id = uid();
    try {
      await putFile(id, file);
      if (target.fileId) delFile(target.fileId);
      Object.assign(target, { fileId: id, fileName: file.name, fileType: file.type, fileSize: file.size });
    } catch (e) {
      alert("Le fichier n'a pas pu être enregistré : " + e.message);
    }
  }
  if (!c) data.courses.push(target);
  save();
}

// Ouvre un fichier joint (n'importe quelle vue)
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-open-file]');
  if (!a) return;
  e.preventDefault();
  const c = data.courses.find((x) => x.id === a.dataset.openFile);
  const blob = c?.fileId ? await getFile(c.fileId).catch(() => null) : null;
  if (!blob) return alert("Ce fichier n'est pas sur cet appareil. Joins-le à nouveau depuis « Modifier ».");
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  if (!/^(application\/pdf|image\/|text\/)/.test(blob.type)) link.download = c.fileName || 'document';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

// Feuille de gestion des matières
function manageSubjects() {
  const dlg = $('#sheet-dialog');
  const body = $('#sheet-body');
  const count = (s) => data.courses.filter((c) => c.subject === s).length;
  const draw = () => {
    const list = sortedSubjects();
    body.innerHTML = `
      <h2>Matières</h2>
      <form class="quick-add" id="subj-add" style="margin-bottom:10px">
        <input type="text" name="n" placeholder="Nouvelle matière" required class="grow" autocomplete="off">
        <button class="btn primary" aria-label="Ajouter la matière">${ic('plus', 'sm')}</button>
      </form>
      ${list.map((s) => `<div class="item" style="align-items:center">
        <input type="text" value="${esc(s)}" data-rename="${esc(s)}" class="grow" aria-label="Nom de la matière">
        <span class="small muted" style="min-width:64px;text-align:right">${count(s)} élément${count(s) > 1 ? 's' : ''}</span>
        <button class="icon-btn" data-del-subj="${esc(s)}" aria-label="Supprimer ${esc(s)}" style="margin:0">${ic('trash', 'sm')}</button>
      </div>`).join('') || `<p class="empty">Aucune matière. Ajoute la première au-dessus.</p>`}
      <div class="dialog-actions" style="margin-top:16px"><button class="btn primary" data-close>Terminé</button></div>`;
    $('#subj-add', body).onsubmit = (e) => {
      e.preventDefault();
      const n = e.target.n.value.trim();
      if (n && !sortedSubjects().includes(n)) { data.subjects.push(n); save(); }
      draw();
      $('#subj-add input', body).focus();
    };
  };
  body.onchange = (e) => {
    const old = e.target.dataset.rename;
    if (old == null) return;
    const n = e.target.value.trim();
    if (!n || n === old || sortedSubjects().includes(n)) { e.target.value = old; return; }
    const i = data.subjects.indexOf(old);
    if (i < 0) data.subjects.push(n); else data.subjects[i] = n;
    for (const c of data.courses) if (c.subject === old) c.subject = n;
    if (ui.courseSubject === old) ui.courseSubject = n;
    save();
    draw();
  };
  body.onclick = (e) => {
    if (e.target.closest('[data-close]')) return dlg.close();
    const del = e.target.closest('[data-del-subj]');
    if (!del) return;
    const s = del.dataset.delSubj, n = count(s);
    if (!confirm(`Supprimer la matière « ${s} » ?${n ? ` Ses ${n} élément${n > 1 ? 's' : ''} passeront en « Sans matière ».` : ''}`)) return;
    data.subjects = data.subjects.filter((x) => x !== s);
    for (const c of data.courses) if (c.subject === s) c.subject = '';
    save();
    draw();
  };
  dlg.onclose = () => { dlg.onclose = null; render(); };
  draw();
  dlg.showModal();
}

// Feuille « Catégories » : nom, couleur, dossiers Drive reconnus, ordre
function manageTypes() {
  const dlg = $('#sheet-dialog');
  const body = $('#sheet-body');
  const changed = () => { save(); refreshDriveItems(); };
  const draw = () => {
    const list = data.courseTypes;
    body.innerHTML = `
      <h2>Catégories</h2>
      <p class="hint" style="margin:-8px 2px 14px">Un dossier de ton Drive dont le nom commence par un des mots indiqués est rangé dans la catégorie. Sépare les mots par des virgules.</p>
      ${list.map((t, i) => `<div class="cat-row" data-i="${i}">
        <input type="color" value="${esc(t.color)}" data-f="color" aria-label="Couleur de ${esc(t.label)}">
        <div class="grow">
          <input type="text" value="${esc(t.label)}" data-f="label" aria-label="Nom" placeholder="Nom">
          <input type="text" value="${esc(t.folders || '')}" data-f="folders" aria-label="Dossiers reconnus" placeholder="Dossiers : Oral, Soutenance…" class="cat-folders">
        </div>
        <div class="cat-actions">
          <button class="icon-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${ic('up', 'sm')}</button>
          <button class="icon-btn" data-del-type="${i}" aria-label="Supprimer ${esc(t.label)}">${ic('trash', 'sm')}</button>
        </div>
      </div>`).join('')}
      <div class="cat-row" style="opacity:.7">
        <span class="course-type" style="--c:${OTHER_TYPE.color};align-self:center">Autres</span>
        <div class="grow small muted" style="align-self:center">Tout ce qui n'entre dans aucune catégorie.</div>
      </div>
      <form id="type-add" class="cat-add">
        <input type="text" name="label" placeholder="Nouvelle catégorie (ex. Oral)" required autocomplete="off">
        <input type="text" name="folders" placeholder="Dossiers reconnus (ex. Oral, Soutenance)" autocomplete="off">
        <button class="btn primary">${ic('plus', 'sm')}Ajouter</button>
      </form>
      <div class="dialog-actions" style="margin-top:16px"><button class="btn primary" data-close>Terminé</button></div>`;
    $('#type-add', body).onsubmit = (e) => {
      e.preventDefault();
      const label = e.target.label.value.trim();
      if (!label) return;
      const palette = ['#e0567f', '#14a3b8', '#d4a017', '#7c5cff', '#2fa37a', '#ef7d32'];
      data.courseTypes.push({
        id: norm(label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + uid().slice(-4),
        label, folders: e.target.folders.value.trim() || label, color: palette[data.courseTypes.length % palette.length],
      });
      changed();
      draw();
    };
  };
  body.onchange = (e) => {
    const row = e.target.closest('[data-i]');
    const f = e.target.dataset.f;
    if (!row || !f) return;
    const t = data.courseTypes[+row.dataset.i];
    const v = e.target.value.trim();
    if (f === 'label' && !v) { e.target.value = t.label; return; }
    t[f] = v;
    changed();
  };
  body.onclick = (e) => {
    if (e.target.closest('[data-close]')) return dlg.close();
    const up = e.target.closest('[data-up]');
    if (up) {
      const i = +up.dataset.up;
      [data.courseTypes[i - 1], data.courseTypes[i]] = [data.courseTypes[i], data.courseTypes[i - 1]];
      changed();
      return draw();
    }
    const del = e.target.closest('[data-del-type]');
    if (del) {
      const t = data.courseTypes[+del.dataset.delType];
      if (!confirm(`Supprimer la catégorie « ${t.label} » ? Ses éléments passeront dans « Autres ».`)) return;
      data.courseTypes = data.courseTypes.filter((x) => x !== t);
      for (const c of data.courses) if (c.type === t.id) c.type = OTHER_TYPE.id;
      if (ui.courseType === t.id) ui.courseType = 'all';
      changed();
      draw();
    }
  };
  dlg.onclose = () => { dlg.onclose = null; render(); };
  draw();
  dlg.showModal();
}

/* Aperçu des documents : les PDF passent par le serveur et pdf.js (marche partout, même
   sur Android) ; Word, PowerPoint, Excel et Google Docs utilisent l'aperçu de Google Drive. */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';
let pdfjsPromise = null;
let viewerToken = 0;
function loadPdfJs() {
  return pdfjsPromise ||= import(PDFJS + 'pdf.min.mjs').then((lib) => {
    // le worker vient d'un autre domaine : on le lance via un petit module local qui l'importe
    const src = URL.createObjectURL(new Blob([`import "${PDFJS}pdf.worker.min.mjs";`], { type: 'text/javascript' }));
    lib.GlobalWorkerOptions.workerPort = new Worker(src, { type: 'module' });
    return lib;
  });
}

async function openPreview(c) {
  const v = $('#viewer');
  const token = ++viewerToken;
  const isPdf = /\.pdf$/i.test(c.name || '');
  v.hidden = false;
  document.body.style.overflow = 'hidden';
  if (!history.state?.viewer) history.pushState({ viewer: true }, '');
  v.innerHTML = `
    <div class="viewer-top">
      <button class="icon-btn" data-v="close" aria-label="Fermer l'aperçu">${ic('chevL')}</button>
      <div class="grow viewer-title">${esc(c.title)}<div class="small muted">${esc([c.subject, c.folder].filter(Boolean).join(', '))}</div></div>
      ${c.link ? `<a class="btn sm" href="${esc(c.link)}" target="_blank" rel="noopener">${ic('link', 'sm')}Drive</a>` : ''}
    </div>
    <div class="viewer-body ${isPdf ? '' : 'frame'}" id="viewer-body">
      ${isPdf ? '<p class="viewer-msg">Chargement du document…</p>'
        : `<iframe src="https://drive.google.com/file/d/${encodeURIComponent(c.id)}/preview" title="${esc(c.title)}" allow="autoplay; fullscreen"></iframe>`}
    </div>`;
  if (!isPdf) return;
  const body = $('#viewer-body');
  try {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ url: '/api/drive/file/' + encodeURIComponent(c.id), withCredentials: true }).promise;
    if (token !== viewerToken) return;
    const first = await doc.getPage(1);
    const ratio = first.getViewport({ scale: 1 }).height / first.getViewport({ scale: 1 }).width;
    body.innerHTML = Array.from({ length: doc.numPages }, (_, i) => `<div class="pdf-page" data-n="${i + 1}" style="aspect-ratio:1/${ratio}"></div>`).join('');
    // les pages ne sont dessinées qu'à l'approche de l'écran
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        renderPdfPage(doc, en.target, token);
      }
    }, { root: body, rootMargin: '800px 0px' });
    body.querySelectorAll('.pdf-page').forEach((el) => io.observe(el));
  } catch (err) {
    if (token !== viewerToken) return;
    body.innerHTML = `<p class="viewer-msg">Impossible d'afficher ce document (${esc(err.message || 'erreur')}).<br>
      ${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">Ouvrir dans Drive</a>` : ''}</p>`;
  }
}

async function renderPdfPage(doc, el, token) {
  const page = await doc.getPage(+el.dataset.n);
  if (token !== viewerToken) return;
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: (el.clientWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  el.appendChild(canvas);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
}

function closePreview(fromHistory = false) {
  const v = $('#viewer');
  if (v.hidden) return;
  viewerToken++;
  v.hidden = true;
  v.innerHTML = '';
  document.body.style.overflow = '';
  if (!fromHistory && history.state?.viewer) history.back();
}
$('#viewer').addEventListener('click', (e) => { if (e.target.closest('[data-v="close"]')) closePreview(); });
window.addEventListener('popstate', () => closePreview(true));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePreview(); });
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-preview]');
  if (!a) return;
  e.preventDefault();
  const it = DRIVE.items.find((x) => x.id === a.dataset.preview);
  if (it) openPreview(withMeta(it));
});

function renderCourses(root) {
  loadDrive();
  const all = allCourses();
  const subjects = allSubjects();
  const hasNone = all.some((c) => !c.subject);
  if (ui.courseSubject !== 'all' && ui.courseSubject !== '__none' && !subjects.includes(ui.courseSubject)) ui.courseSubject = 'all';
  const list = all.filter((c) =>
    (ui.courseType === 'all' || c.type === ui.courseType) &&
    (ui.courseSubject === 'all' || (ui.courseSubject === '__none' ? !c.subject : c.subject === ui.courseSubject)) &&
    (ui.showDoneCourses || !c.done));
  const groups = {};
  for (const c of list) (groups[c.subject || 'Sans matière'] ||= []).push(c);
  // par type (CM, TD, TP…), puis sous-dossier, puis titre (« TD 2 » avant « TD 10 »)
  const cmp = (a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
  for (const g of Object.values(groups)) {
    g.sort((a, b) => typeRank(a.type) - typeRank(b.type) || cmp(a.folder || '', b.folder || '') || cmp(a.title, b.title));
  }
  const doneCount = all.filter((c) => c.done).length;

  root.innerHTML = `
    ${DRIVE.enabled ? `
    <div class="drive-bar">
      <span class="grow small">${ic('book', 'sm')} Dossier Drive <strong>${esc(data.settings.driveRoot || 'Cours')}</strong>${DRIVE.loading ? '<span class="muted">, lecture…</span>' : DRIVE.items.length ? `<span class="muted">, ${DRIVE.items.length} fichiers</span>` : ''}</span>
      <button class="btn sm" data-act="drive-refresh">Actualiser</button>
      <button class="btn sm" data-act="drive-root">Changer</button>
    </div>
    ${DRIVE.error ? `<p class="hint" style="color:var(--danger);margin:0 4px 12px">${esc(DRIVE.error)}</p>` : ''}` : ''}
    <div class="chips">
      <button class="chip ${ui.courseType === 'all' ? 'active' : ''}" data-type="all">Tout</button>
      ${courseTypes().map((t) => `<button class="chip ${ui.courseType === t.id ? 'active' : ''}" data-type="${esc(t.id)}" style="text-transform:none">${esc(t.label)}</button>`).join('')}
      <button class="chip" data-act="types" style="text-transform:none">${ic('sliders', 'sm')} Catégories</button>
    </div>
    <div class="row" style="margin-bottom:6px">
      <select id="subject-filter" class="grow" aria-label="Matière">
        <option value="all">Toutes les matières</option>
        ${subjects.map((s) => `<option value="${esc(s)}" ${s === ui.courseSubject ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        ${hasNone ? `<option value="__none" ${ui.courseSubject === '__none' ? 'selected' : ''}>Sans matière</option>` : ''}
      </select>
      <button class="btn" data-act="subjects">Matières</button>
      <button class="btn primary" data-act="add">${ic('plus', 'sm')}Ajouter</button>
    </div>
    ${Object.keys(groups).length ? `<div class="dash dash-courses">${Object.keys(groups).sort((a, b) => a.localeCompare(b, 'fr')).map((s) => `
      <div class="col">
      <div class="section-label">${esc(s)}</div>
      <section class="group">${groups[s].map(courseRow).join('')}</section>
      </div>`).join('')}</div>`
      : `<section class="group" style="margin-top:14px"><p class="empty">Rien ici pour l'instant. Ajoute un cours, un TD ou un TP.</p></section>`}
    ${doneCount ? `<button class="btn sm" data-act="toggle-done">${ui.showDoneCourses ? 'Masquer' : 'Afficher'} les éléments faits (${doneCount})</button>` : ''}
  `;
  $('#subject-filter', root).onchange = (e) => { ui.courseSubject = e.target.value; render(); };
  root.onclick = async (e) => {
    const chip = e.target.closest('[data-type]');
    if (chip) { ui.courseType = chip.dataset.type; return render(); }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'add') { await editCourse(null); return render(); }
    if (act === 'subjects') return manageSubjects();
    if (act === 'types') return manageTypes();
    if (act === 'drive-refresh') { DRIVE.at = 0; render(); return loadDrive(true); }
    if (act === 'drive-root') return changeDriveRoot();
    if (act === 'toggle-done') { ui.showDoneCourses = !ui.showDoneCourses; return render(); }
    if (await handleRowClick(e)) render();
  };
}

/* Clics communs sur les lignes (rdv, tâches, cours) utilisées dans plusieurs vues.
   Renvoie true s'il faut redessiner. */
async function handleRowClick(e) {
  const btn = e.target.closest('[data-row]');
  const row = e.target.closest('[data-kind]');
  if (!btn || !row) return false;
  const { kind, id } = row.dataset;
  const coll = kind === 'gevent' ? [...GCAL.events.values()] : kind === 'gtask' ? [...GTASKS.items.values()]
    : kind === 'dcourse' ? allCourses().filter((c) => c.source === 'drive')
    : { event: data.events, todo: data.todos, course: data.courses }[kind];
  const obj = coll.find((x) => x.id === id);
  if (!obj) return false;
  if (btn.dataset.row === 'toggle') {
    obj.done = btn.checked;
    obj.doneAt = obj.done ? Date.now() : null;
    if (kind === 'gtask') {
      // affichage immédiat, puis envoi à Google ; on annule si ça échoue
      tasksRequest('PATCH', encodeURIComponent(id), { done: obj.done })
        .then((g) => { GTASKS.items.set(g.id, fromGTask(g)); saveTasksCache(); })
        .catch((err) => {
          obj.done = !obj.done;
          alert(`Google Tasks n'a pas enregistré ce changement : ${err.message}.`);
          render();
        });
    } else if (kind === 'dcourse') {
      data.courseMeta[id] = { ...(data.courseMeta[id] || {}), done: obj.done };
      save();
    } else save();
    if (obj.done) {
      // laisse le temps de voir la case se cocher avant que la ligne change de place
      ui.justToggled = id;
      await new Promise((r) => setTimeout(r, 380));
    }
    return true;
  }
  if (btn.dataset.row === 'edit') {
    if (kind === 'event' || kind === 'gevent') await editEvent(obj);
    if (kind === 'todo' || kind === 'gtask') await editTodo(obj);
    if (kind === 'course') await editCourse(obj);
    if (kind === 'dcourse') await editDriveCourse(obj);
    return true;
  }
  return false;
}

/* =========================================================
   Vue : Nutrition
   ========================================================= */
const kcalOf = (p, l, g) => Math.round(p * 4 + l * 9 + g * 4);

function nutriTotals(iso) {
  const t = { p: 0, l: 0, g: 0 };
  for (const e of data.nutrition.entries) if (e.date === iso) { t.p += e.p || 0; t.l += e.l || 0; t.g += e.g || 0; }
  return t;
}

function macroBar(label, key, val, goal) {
  const pct = goal ? Math.min(100, (val / goal) * 100) : 0;
  const over = goal && val > goal * 1.1;
  return `<div class="macro">
    <div class="macro-head"><span>${label}</span><span class="macro-nums">${fmtNum(val)} / ${goal} g</span></div>
    <div class="bar ${key} ${over ? 'over' : ''}"><div style="width:${pct}%"></div></div>
  </div>`;
}

// Respect de l'objectif : ±10 % sur chaque macro
function dayStatus(t, g) {
  const keys = ['p', 'l', 'g'];
  if (keys.every((k) => !t[k])) return { cls: 'muted', txt: '–' };
  if (keys.some((k) => t[k] > g[k] * 1.1)) return { cls: 'st-high', txt: 'Dépassé' };
  if (keys.some((k) => t[k] < g[k] * 0.9)) return { cls: 'st-low', txt: 'En dessous' };
  return { cls: 'st-ok', txt: 'Respecté' };
}

function renderNutrition(root) {
  const d = ui.nutriDate;
  const g = data.nutrition.goals;
  const t = nutriTotals(d);
  const entries = data.nutrition.entries.filter((e) => e.date === d);
  const recent = [];
  const seen = new Set();
  for (let i = data.nutrition.entries.length - 1; i >= 0 && recent.length < 8; i--) {
    const e = data.nutrition.entries[i];
    const k = `${e.label}|${e.p}|${e.l}|${e.g}`;
    if (e.label && !e.pending && (e.p || e.l || e.g) && !seen.has(k)) { seen.add(k); recent.push(e); }
  }
  const hist = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(isoDate(), -i);
    const tt = nutriTotals(day);
    hist.push({ day, ...tt, st: dayStatus(tt, g) });
  }

  root.innerHTML = `
    <div class="date-nav">
      <button class="icon-btn" data-nav="-1" aria-label="Jour précédent">${ic('chevL')}</button>
      <strong>${d === isoDate() ? "Aujourd'hui" : fmtLongDate(d)}</strong>
      <button class="icon-btn" data-nav="1" aria-label="Jour suivant">${ic('chevR')}</button>
    </div>

    <div class="dash dash-even">
    <div class="col">
    <section class="group">
      <div class="group-head" style="align-items:flex-start">
        <div><div class="kcal">${kcalOf(t.p, t.l, t.g).toLocaleString('fr-FR')}<small>kcal</small></div>
          <div class="small muted" style="margin-top:4px;font-weight:600">sur ${kcalOf(g.p, g.l, g.g).toLocaleString('fr-FR')} kcal visées</div></div>
        <button class="btn sm" data-act="goals">Objectifs</button>
      </div>
      ${macroBar('Protéines', 'p', t.p, g.p)}
      ${macroBar('Lipides', 'l', t.l, g.l)}
      ${macroBar('Glucides', 'g', t.g, g.g)}
    </section>

    <section class="group">
      <h2 style="margin-bottom:12px">Ajouter un aliment</h2>
      <form id="macro-form" class="macro-add">
        <input class="full" type="text" name="label" placeholder="Cacahuètes, 30 g" autocomplete="off">
        <input type="text" name="p" placeholder="Prot. (g)" inputmode="decimal" autocomplete="off">
        <input type="text" name="l" placeholder="Lip. (g)" inputmode="decimal" autocomplete="off">
        <input type="text" name="g" placeholder="Gluc. (g)" inputmode="decimal" autocomplete="off">
        <button class="btn primary full" style="padding:12px">${ic('plus', 'sm')}Ajouter</button>
      </form>
      ${recent.length ? `<div class="small muted" style="margin:14px 0 8px;font-weight:600">Récents</div>
      <div class="chips" style="flex-wrap:wrap;margin-bottom:0">${recent.map((e, i) => `<button class="chip" data-recent="${i}" style="text-transform:none">${esc(e.label)}</button>`).join('')}</div>` : ''}
    </section>
    </div>

    <div class="col">

    <section class="group">
      <h2 style="margin-bottom:8px">Repas du jour</h2>
      ${entries.map((e) => `<div class="item" style="align-items:center">
        <button class="grow entry-btn" data-edit-entry="${e.id}">
          <span class="item-title">${esc(e.label || 'Sans nom')}</span>
          ${e.pending ? '<span class="tag-pending">À compléter</span>' : ''}${e.via === 'montre' ? '<span class="tag-via">Montre</span>' : ''}
        </button>
        <span class="macro-nums">P ${fmtNum(e.p || 0)}  L ${fmtNum(e.l || 0)}  G ${fmtNum(e.g || 0)}</span>
        <button class="icon-btn" data-del="${e.id}" aria-label="Supprimer" style="margin:0">${ic('x', 'sm')}</button>
      </div>`).join('') || `<p class="empty">Rien de noté ce jour-là.</p>`}
      ${GTASKS.enabled ? `<p class="hint" style="margin-top:10px">À la montre : « Ajoute la tâche repas 30 g de protéines de cacahuètes ».</p>` : ''}
    </section>

    <section class="group">
      <h2 style="margin-bottom:8px">7 derniers jours</h2>
      <table class="history">
        <tr><th>Jour</th><th>P</th><th>L</th><th>G</th><th>kcal</th><th>Diète</th></tr>
        ${hist.map((h) => `<tr>
          <td>${h.day === isoDate() ? "Aujourd'hui" : fmtShortDate(h.day)}</td>
          <td>${Math.round(h.p)}</td><td>${Math.round(h.l)}</td><td>${Math.round(h.g)}</td>
          <td>${kcalOf(h.p, h.l, h.g)}</td><td class="${h.st.cls}">${h.st.txt}</td></tr>`).join('')}
      </table>
      <p class="hint" style="margin-top:8px">Respecté : chaque macro à 10 % près de l'objectif.</p>
    </section>
    </div>
    </div>
  `;

  $('#macro-form', root).onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const num = (v) => (v === '' ? 0 : Number(String(v).replace(',', '.')) || 0);
    const entry = { id: uid(), date: d, label: f.label.value.trim(), p: num(f.p.value), l: num(f.l.value), g: num(f.g.value) };
    if (!entry.p && !entry.l && !entry.g) return;
    data.nutrition.entries.push(entry);
    save();
    render();
  };

  root.onclick = async (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { ui.nutriDate = addDays(d, Number(nav.dataset.nav)); return render(); }
    const del = e.target.closest('[data-del]');
    if (del) { data.nutrition.entries = data.nutrition.entries.filter((x) => x.id !== del.dataset.del); save(); return render(); }
    const ed = e.target.closest('[data-edit-entry]');
    if (ed) {
      const entry = data.nutrition.entries.find((x) => x.id === ed.dataset.editEntry);
      if (!entry) return;
      const res = await openForm("Modifier l'aliment", [
        { name: 'label', label: 'Aliment', full: true, required: true },
        { name: 'p', label: 'Protéines (g)', type: 'number' },
        { name: 'l', label: 'Lipides (g)', type: 'number' },
        { name: 'g', label: 'Glucides (g)', type: 'number', full: true, hint: entry.said ? `Dicté : « ${entry.said} »` : '' },
      ], entry);
      if (!res) return;
      Object.assign(entry, { label: res.label, p: res.p || 0, l: res.l || 0, g: res.g || 0 });
      entry.pending = !entry.p && !entry.l && !entry.g;
      save();
      return render();
    }
    const rec = e.target.closest('[data-recent]');
    if (rec) {
      const r = recent[+rec.dataset.recent];
      data.nutrition.entries.push({ id: uid(), date: d, label: r.label, p: r.p, l: r.l, g: r.g });
      save();
      return render();
    }
    if (e.target.closest('[data-act="goals"]')) {
      const res = await openForm('Objectifs par jour', [
        { name: 'p', label: 'Protéines (g)', type: 'number', required: true },
        { name: 'l', label: 'Lipides (g)', type: 'number', required: true },
        { name: 'g', label: 'Glucides (g)', type: 'number', required: true, full: true },
      ], g);
      if (!res) return;
      data.nutrition.goals = { p: res.p || 0, l: res.l || 0, g: res.g || 0 };
      save();
      render();
    }
  };
}

/* =========================================================
   Réglages : apparence + données
   ========================================================= */
function renderSettings() {
  const s = data.settings;
  const custom = s.accent !== 'auto' && !ACCENTS.some((a) => a.id === s.accent);
  const mode = isDark() ? 'dark' : 'light';
  $('#settings-body').innerHTML = `
    <h2>Réglages</h2>
    ${SYNC.available ? `
    <div class="set-block">
      <h3>Compte</h3>
      ${SYNC.email ? `
        <div class="account">
          <div class="grow"><div style="font-weight:700">${esc(SYNC.email)}</div>
            <div class="small muted" id="sync-status">${syncLabel()}</div></div>
          <a class="btn sm" href="/auth/logout">Se déconnecter</a>
        </div>` : `
        <p class="hint" style="margin:-4px 0 10px 2px">Connecte-toi pour retrouver tes données sur tous tes appareils.</p>
        <a class="btn primary block" href="/auth/login">Se connecter avec Google</a>`}
    </div>` : ''}
    <div class="set-block">
      <h3>Thème</h3>
      <div class="seg">
        ${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => `<button data-theme-set="${v}" class="${s.theme === v ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="set-block">
      <h3>Couleur des boutons</h3>
      <div class="swatches">
        ${ACCENTS.map((a) => `<button class="swatch ${a.id === 'auto' ? 'auto' : ''} ${s.accent === a.id ? 'on' : ''}" data-accent="${a.id}"
            ${a.id !== 'auto' ? `style="background:${a.id}"` : ''} aria-label="${a.label}" title="${a.label}"></button>`).join('')}
        <label class="swatch custom ${custom ? 'on' : ''}" title="Couleur au choix" ${custom ? `style="background:${s.accent}"` : ''}>
          <input type="color" id="accent-custom" value="${custom ? s.accent : '#cf4a73'}" aria-label="Couleur au choix">
        </label>
      </div>
    </div>
    <div class="set-block">
      <h3>Fond</h3>
      <div class="bg-swatches five">
        ${BACKGROUNDS.map((b) => {
          const [bg, b1, b2] = b[mode];
          return `<button class="bg-swatch ${s.bg === b.id ? 'on' : ''}" data-bg-set="${b.id}"><i style="background:radial-gradient(circle at 20% 20%, ${b1}, transparent 70%), radial-gradient(circle at 85% 90%, ${b2}, transparent 70%), ${bg}"></i>${b.label}</button>`;
        }).join('')}
        <button class="bg-swatch perso ${s.bg === 'custom' ? 'on' : ''}" data-bg-set="custom"><i></i>Perso</button>
      </div>
      ${s.bg === 'custom' && s.bgCustom ? `
      <div class="custom-colors">
        ${['Fond', 'Halo 1', 'Halo 2'].map((l, i) => `<label class="color-field"><input type="color" data-custom-bg="${i}" value="${s.bgCustom[mode][i]}">${l}</label>`).join('')}
      </div>
      <p class="hint">Ces couleurs s'appliquent au mode ${mode === 'dark' ? 'sombre' : 'clair'}. Passe dans l'autre mode pour régler ses propres couleurs.</p>` : ''}
    </div>
    <div class="set-block">
      <div class="row" style="margin-bottom:10px"><h3 class="grow" style="margin:0 0 0 2px">Verre</h3>
        ${s.glass != null || s.blur != null ? `<button class="btn sm" data-glass-reset>Par défaut</button>` : ''}</div>
      <label class="slider">Transparence<output id="glass-out">${s.glass ?? GLASS_DEFAULT} %</output>
        <input type="range" min="0" max="100" step="1" data-range="glass" value="${s.glass ?? GLASS_DEFAULT}"></label>
      <label class="slider">Flou<output id="blur-out">${s.blur ?? BLUR_DEFAULT} px</output>
        <input type="range" min="0" max="40" step="1" data-range="blur" value="${s.blur ?? BLUR_DEFAULT}"></label>
    </div>
    <div class="set-block">
      <h3>Données</h3>
      <p class="hint" style="margin:-4px 0 10px 2px">${SYNC.email ? 'Elles sont enregistrées sur cet appareil et synchronisées avec ton compte.' : 'Elles sont enregistrées sur cet appareil uniquement.'}</p>
      <div class="data-actions">
        <button class="btn" data-data="export">${ic('download', 'sm')}Exporter</button>
        <button class="btn" data-data="import">${ic('upload', 'sm')}Importer une sauvegarde</button>
        <button class="btn danger" data-data="reset">${ic('erase', 'sm')}Tout effacer</button>
      </div>
    </div>
    <div class="dialog-actions" style="margin-top:20px"><button class="btn primary" data-close>Terminé</button></div>
  `;
}

// Réglages continus (couleurs, curseurs) : on applique en direct sans redessiner la feuille
$('#settings-body').addEventListener('input', (e) => {
  const s = data.settings;
  const t = e.target;
  if (t.id === 'accent-custom') s.accent = t.value;
  else if (t.dataset.customBg) s.bgCustom[isDark() ? 'dark' : 'light'][+t.dataset.customBg] = t.value;
  else if (t.dataset.range === 'glass') { s.glass = +t.value; $('#glass-out').textContent = t.value + ' %'; }
  else if (t.dataset.range === 'blur') { s.blur = +t.value; $('#blur-out').textContent = t.value + ' px'; }
  else return;
  applyAppearance();
});
$('#settings-body').addEventListener('change', (e) => {
  const sec = e.target.dataset.sec;
  if (sec) {
    if (sec === 'all') ui.exportSel = new Set(e.target.checked ? SECTIONS.map((s) => s.id) : []);
    else if (e.target.checked) ui.exportSel.add(sec);
    else ui.exportSel.delete(sec);
    return renderExport();
  }
  save();
  if (e.target.id === 'accent-custom' || e.target.dataset.range) renderSettings();
});

$('#menu-btn').onclick = () => {
  renderSettings();
  $('#settings-dialog').showModal();
};

$('#settings-body').addEventListener('click', (e) => {
  const s = data.settings;
  const t = e.target.closest('button');
  if (!t) return;
  if (t.hasAttribute('data-close')) return $('#settings-dialog').close();
  if (t.hasAttribute('data-back')) return renderSettings();
  if (t.dataset.fmt) { ui.exportFmt = t.dataset.fmt; return renderExport(); }
  if (t.dataset.exp) return doExport(t.dataset.exp, t);
  if (t.dataset.themeSet) s.theme = t.dataset.themeSet;
  else if (t.dataset.accent) s.accent = t.dataset.accent;
  else if (t.dataset.bgSet) {
    if (t.dataset.bgSet === 'custom' && !s.bgCustom) {
      // on part du fond actuel pour que le changement soit doux
      const from = BACKGROUNDS.find((b) => b.id === s.bg) || BACKGROUNDS[0];
      s.bgCustom = { light: [...from.light], dark: [...from.dark] };
    }
    s.bg = t.dataset.bgSet;
  }
  else if (t.hasAttribute('data-glass-reset')) { s.glass = null; s.blur = null; }
  else if (t.dataset.data) return dataAction(t.dataset.data);
  else return;
  save();
  applyAppearance();
  renderSettings();
});

function dataAction(action) {
  if (action === 'export') {
    renderExport();
  } else if (action === 'import') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      try {
        const parsed = JSON.parse(await input.files[0].text());
        if (Array.isArray(parsed.sections)) {
          // sauvegarde partielle : on ne remplace que les parties exportées
          const names = SECTIONS.filter((s) => parsed.sections.includes(s.id)).map((s) => s.label);
          if (!confirm(`Remplacer ces parties par la sauvegarde : ${names.join(', ')} ?`)) return;
          const base = emptyData();
          for (const id of parsed.sections) {
            for (const key of SECTION_KEYS[id] || []) data[key] = parsed[key] ?? base[key];
          }
          if (parsed.settings) data.settings = parsed.settings;
          data = mergeDefaults(data);
        } else {
          if (!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
          data = mergeDefaults(parsed);
        }
        save();
        applyAppearance();
        $('#settings-dialog').close();
        render();
      } catch (e) {
        alert("Ce fichier n'est pas une sauvegarde valide : " + e.message);
      }
    };
    input.click();
  } else if (action === 'reset') {
    if (!confirm('Effacer toutes les données ? Pense à exporter une sauvegarde avant.')) return;
    idb('readwrite', (s) => s.clear()).catch(() => {});
    data = emptyData();
    save();
    applyAppearance();
    $('#settings-dialog').close();
    render();
  }
}

/* =========================================================
   Export : choix des parties, format IA (Markdown) ou sauvegarde (JSON)
   ========================================================= */
const SECTIONS = [
  { id: 'sport', label: 'Sport' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'todo', label: 'Tâches' },
  { id: 'courses', label: 'Cours' },
  { id: 'nutrition', label: 'Nutrition' },
];
const SECTION_KEYS = { sport: ['sport'], agenda: ['events'], todo: ['todos'], courses: ['courses', 'subjects', 'courseMeta', 'courseTypes'], nutrition: ['nutrition'] };
ui.exportSel = new Set(SECTIONS.map((s) => s.id));
ui.exportFmt = 'ai';

function sectionCount(id) {
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  if (id === 'sport') return plural(DAYS.filter((d) => data.sport.days[d].exercises.length).length, 'séance');
  if (id === 'agenda') return plural(allEvents().length, 'rendez-vous').replace(/vouss$/, 'vous');
  if (id === 'todo') return plural(allTodos().length, 'tâche');
  if (id === 'courses') return plural(allCourses().length, 'élément');
  return plural(data.nutrition.entries.length, 'aliment');
}

function renderExport() {
  const sel = ui.exportSel, fmt = ui.exportFmt;
  const all = SECTIONS.every((s) => sel.has(s.id));
  const none = sel.size === 0;
  $('#settings-body').innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <button class="icon-btn" data-back aria-label="Retour aux réglages" style="margin-left:-8px">${ic('chevL')}</button>
      <h2 style="margin:0">Exporter</h2>
    </div>
    <div class="set-block">
      <h3>Données à inclure</h3>
      <div class="opt-list">
        <label class="opt"><input type="checkbox" class="check" data-sec="all" ${all ? 'checked' : ''} style="animation:none"><span class="grow">Tout</span></label>
        ${SECTIONS.map((s) => `<label class="opt"><input type="checkbox" class="check" data-sec="${s.id}" ${sel.has(s.id) ? 'checked' : ''} style="animation:none">
          <span class="grow">${s.label}</span><span class="small muted">${sectionCount(s.id)}</span></label>`).join('')}
      </div>
    </div>
    <div class="set-block">
      <h3>Format</h3>
      <div class="seg">
        <button data-fmt="ai" class="${fmt === 'ai' ? 'on' : ''}">Pour une IA</button>
        <button data-fmt="json" class="${fmt === 'json' ? 'on' : ''}">Sauvegarde</button>
      </div>
      <p class="hint" style="margin-top:8px">${fmt === 'ai'
        ? "Un texte clair (.md) que Gemini ou une autre IA comprend directement, avec tableaux, unités et bilans. Copie-le et colle-le dans la conversation, ou envoie le fichier."
        : "Un fichier .json pour restaurer tes données ici ou sur un autre appareil. À l'import, seules les parties exportées sont remplacées. Les fichiers joints aux cours ne sont pas inclus."}</p>
    </div>
    <div class="dialog-actions" style="margin-top:20px">
      ${fmt === 'ai' ? `<button class="btn" data-exp="copy" ${none ? 'disabled' : ''}>${ic('copy', 'sm')}Copier le texte</button>` : ''}
      <button class="btn primary" data-exp="download" ${none ? 'disabled' : ''}>${ic('download', 'sm')}Télécharger</button>
    </div>
  `;
}

function downloadText(text, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function doExport(kind, btn) {
  const secs = SECTIONS.map((s) => s.id).filter((id) => ui.exportSel.has(id));
  if (!secs.length) return;
  const all = secs.length === SECTIONS.length;
  const suffix = all ? '' : '-' + secs.join('-');
  if (ui.exportFmt === 'json') {
    const out = { app: 'Life', version: 1, exported: new Date().toISOString(), sections: secs };
    for (const id of secs) for (const key of SECTION_KEYS[id]) out[key] = data[key];
    if (all) out.settings = data.settings;
    return downloadText(JSON.stringify(out, null, 2), `life-sauvegarde-${isoDate()}${suffix}.json`, 'application/json');
  }
  if (GCAL.enabled && secs.includes('agenda')) await loadCalendar(addDays(isoDate(), -30), addDays(isoDate(), 90), true);
  const md = exportMarkdown(secs);
  if (kind === 'copy') {
    try {
      await navigator.clipboard.writeText(md);
      btn.innerHTML = `${ic('tick', 'sm')}Copié`;
    } catch {
      btn.textContent = 'Copie impossible, télécharge le fichier';
    }
    setTimeout(() => { if (btn.isConnected) btn.innerHTML = `${ic('copy', 'sm')}Copier le texte`; }, 1800);
    return;
  }
  downloadText(md, `life-${isoDate()}${suffix}.md`, 'text/markdown');
}

// Texte Markdown pensé pour être lu par une IA : titres explicites, tableaux, unités, bilans calculés
function exportMarkdown(secs) {
  const L = [];
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim() || '–';
  const row = (cells) => `| ${cells.map(cell).join(' | ')} |`;
  const table = (head, rows) => [row(head), `|${head.map(() => '---').join('|')}|`, ...rows.map(row)];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fullDate = (iso) => parseIso(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const today = isoDate();
  const labels = SECTIONS.filter((s) => secs.includes(s.id)).map((s) => s.label.toLowerCase());

  L.push('# Mes données Life', '');
  L.push(`Export de mon tableau de bord personnel, fait le ${fmtLongDate(today)} ${today.slice(0, 4)}. Parties incluses : ${labels.join(', ')}.`);
  L.push('Unités : durées en minutes et secondes, macronutriments en grammes, énergie calculée avec 4 kcal/g pour les protéines et les glucides et 9 kcal/g pour les lipides.', '');

  if (secs.includes('sport')) {
    L.push('## Programme de sport (semaine type)', '');
    for (const d of DAYS) {
      const day = data.sport.days[d];
      if (!day.exercises.length) { L.push(`### ${cap(d)} : repos`, ''); continue; }
      L.push(`### ${cap(d)}${day.title ? ` : ${day.title}` : ''}`, '');
      L.push(`Durée estimée : environ ${fmtDurWords(sessionEstimate(day))} (séries en répétitions comptées 45 s).`, '');
      L.push(...table(
        ['#', 'Exercice', 'Séries', 'Répétitions', "Durée d'une série", 'Repos entre séries', "Pause après l'exercice", 'Notes', 'Vidéo'],
        day.exercises.map((ex, i) => [i + 1, ex.name, ex.sets || 1, ex.reps, ex.duration ? fmtDur(ex.duration) : '', ex.rest ? fmtDur(ex.rest) : '', ex.restAfter ? fmtDur(ex.restAfter) : '', ex.notes, ex.video]),
      ), '');
    }
  }

  if (secs.includes('nutrition')) {
    const g = data.nutrition.goals;
    L.push('## Nutrition', '');
    L.push(`Objectifs par jour : protéines ${g.p} g, lipides ${g.l} g, glucides ${g.g} g, soit ${kcalOf(g.p, g.l, g.g)} kcal. « Respecté » signifie que chaque macro est à 10 % près de l'objectif.`, '');
    const dates = [...new Set(data.nutrition.entries.map((e) => e.date))].sort().reverse();
    if (!dates.length) L.push('Aucun aliment noté.', '');
    else {
      L.push('### Bilan par jour', '');
      L.push(...table(['Date', 'Protéines (g)', 'Lipides (g)', 'Glucides (g)', 'kcal', 'Objectif'],
        dates.map((d) => { const t = nutriTotals(d); return [fullDate(d), fmtNum(t.p), fmtNum(t.l), fmtNum(t.g), kcalOf(t.p, t.l, t.g), dayStatus(t, g).txt]; })), '');
      L.push('### Détail des aliments', '');
      for (const d of dates) {
        L.push(`**${fullDate(d)}**`, '');
        for (const e of data.nutrition.entries.filter((x) => x.date === d)) {
          L.push(`- ${e.label || 'Sans nom'} : protéines ${fmtNum(e.p || 0)} g, lipides ${fmtNum(e.l || 0)} g, glucides ${fmtNum(e.g || 0)} g`);
        }
        L.push('');
      }
    }
  }

  if (secs.includes('agenda')) {
    const evs = allEvents().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    const head = ['Date', 'Heure', 'Fin', 'Titre', 'Lieu', 'Note'];
    const r = (e) => [fullDate(e.date), e.time || 'Journée', e.end, e.title, e.place, e.note];
    L.push('## Agenda', '');
    if (GCAL.enabled) L.push(`Rendez-vous de Google Agenda (agenda principal) du ${fullDate(addDays(today, -30))} au ${fullDate(addDays(today, 90))}.`, '');
    const next = evs.filter((e) => e.date >= today), past = evs.filter((e) => e.date < today).reverse();
    L.push('### À venir', '', ...(next.length ? table(head, next.map(r)) : ['Aucun rendez-vous à venir.']), '');
    if (past.length) L.push('### Passés', '', ...table(head, past.map(r)), '');
  }

  if (secs.includes('todo')) {
    L.push('## Tâches', '');
    const open = allTodos().filter((t) => !t.done).sort(sortTodos), done = allTodos().filter((t) => t.done);
    L.push('### En cours', '');
    L.push(...(open.length ? open.map((t) => `- [ ] ${t.text}${t.due ? ` (échéance : ${fullDate(t.due)}${t.due < today ? ', en retard' : ''})` : ''}`) : ['Aucune.']), '');
    if (done.length) L.push('### Faites', '', ...done.map((t) => `- [x] ${t.text}`), '');
  }

  if (secs.includes('courses')) {
    L.push('## Cours, TD et TP', '');
    const groups = {};
    for (const c of allCourses()) (groups[c.subject || 'Sans matière'] ||= []).push(c);
    const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'fr'));
    if (!names.length) L.push('Aucun élément.', '');
    for (const s of names) {
      L.push(`### ${s}`, '');
      L.push(...table(['Type', 'Titre', 'Date', 'Statut', 'Document', 'Notes'],
        groups[s].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).map((c) => [
          typeOf(c.type).label, c.title, c.date ? fullDate(c.date) : '',
          c.done ? 'Fait' : 'À faire', c.source === 'drive' ? `Drive : ${[c.folder, c.name].filter(Boolean).join(' / ')}` : [c.fileName && `fichier ${c.fileName}`, c.link].filter(Boolean).join(', '), c.notes,
        ])), '');
    }
    const empty = sortedSubjects().filter((s) => !groups[s]);
    if (empty.length) L.push(`Matières sans élément pour l'instant : ${empty.join(', ')}.`, '');
  }

  return L.join('\n');
}

/* =========================================================
   Synchronisation avec le serveur (V2)
   Le serveur garde une version numérotée (rev). Chaque appareil retient la
   dernière rev qu'il connaît et s'il a des changements non envoyés (dirty).
   Hors ligne ou sans connexion, l'app marche comme avant en local.
   ========================================================= */
const SYNC_KEY = 'life.sync';
const SYNC = { available: false, email: null, state: 'off', at: null, pushing: false, timer: null, started: false };

function syncMeta() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || { rev: null, dirty: false }; } catch { return { rev: null, dirty: false }; }
}
function setSyncMeta(m) {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(m)); } catch { /* */ }
}
function markDirty() {
  const m = syncMeta();
  if (!m.dirty) setSyncMeta({ ...m, dirty: true });
  if (SYNC.email) {
    clearTimeout(SYNC.timer);
    SYNC.timer = setTimeout(pushData, 1500);
  }
}
function setSyncState(state) {
  SYNC.state = state;
  if (state === 'ok') SYNC.at = new Date();
  const el = $('#sync-status');
  if (el) el.textContent = syncLabel();
}
function syncLabel() {
  if (SYNC.state === 'ok') return `Synchronisé à ${SYNC.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  if (SYNC.state === 'saving') return 'Envoi en cours…';
  if (SYNC.state === 'offline') return 'Hors ligne. Les changements partiront au retour du réseau.';
  if (SYNC.state === 'error') return 'La synchronisation a échoué. Nouvel essai dans une minute.';
  return 'Connexion au serveur…';
}
const hasContent = (d) =>
  DAYS.some((k) => d.sport.days[k].exercises.length) || d.events.length || d.todos.length || d.courses.length || d.nutrition.entries.length;

// Remplace les données locales par celles du serveur
function adoptServer(srv) {
  data = mergeDefaults(srv.data);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* */ }
  setSyncMeta({ rev: srv.rev, dirty: false });
  applyAppearance();
  if (!T) render();
  setSyncState('ok');
}
// Garde une copie des données locales avant de les remplacer en cas de conflit
function backupLocal() {
  try { localStorage.setItem('life.backup-conflit', JSON.stringify({ at: new Date().toISOString(), data })); } catch { /* */ }
}

async function syncInit() {
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { SYNC.available = true; return; }
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return; // pas de serveur (test local)
    SYNC.available = true;
    const me = await r.json();
    SYNC.email = me.email;
    $('#mic-btn').hidden = false;
    GCAL.enabled = !!me.google;
    GTASKS.enabled = !!me.google;
    DRIVE.enabled = !!me.google;
    if (DRIVE.enabled) refreshDriveItems(); // depuis le cache, avant le prochain chargement
  } catch {
    return; // hors ligne : on reste en local
  }
  await pullData();
  if (GCAL.enabled) {
    render();
    await migrateLocalEvents();
    await loadTasks(true);
    await migrateLocalTodos();
    loadDrive(true);
  }
  if (!SYNC.started) {
    SYNC.started = true;
    setInterval(() => { if (syncMeta().dirty) pushData(); else pullData(); loadTasks(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullData(); });
    window.addEventListener('online', () => pullData());
  }
}

async function pullData() {
  if (!SYNC.email || SYNC.pushing) return;
  let srv;
  try {
    const r = await fetch('/api/data', { credentials: 'same-origin', cache: 'no-store' });
    if (r.status === 401) { SYNC.email = null; return; }
    srv = await r.json();
  } catch {
    return setSyncState('offline');
  }
  const meta = syncMeta();
  if (srv.rev === meta.rev) return meta.dirty ? pushData() : setSyncState('ok');
  // compte vide (ou sans contenu) : on y envoie les données de cet appareil
  if (!srv.data || (!hasContent(mergeDefaults(srv.data)) && hasContent(data))) return pushData(srv.rev);

  if (meta.rev == null && hasContent(data)) {
    // premier branchement d'un appareil qui a déjà ses propres données
    const useServer = confirm(
      'Ton compte contient déjà des données, venues d\'un autre appareil.\n\n' +
      'OK : utiliser celles du compte sur cet appareil (les données actuelles d\'ici seront remplacées, une copie est gardée).\n' +
      'Annuler : garder celles de cet appareil et remplacer celles du compte.');
    if (!useServer) return pushData(srv.rev);
    backupLocal();
    return adoptServer(srv);
  }
  if (meta.dirty) {
    // changements des deux côtés : le compte l'emporte, la version locale est sauvegardée
    backupLocal();
    adoptServer(srv);
    return alert("Des changements faits sur un autre appareil ont remplacé ceux d'ici, qui n'avaient pas encore été envoyés. Une copie des données d'ici est gardée sur cet appareil.");
  }
  adoptServer(srv);
}

// baseRev forcé : on écrase la version du compte (choix explicite ou compte vide)
async function pushData(forceBase) {
  if (!SYNC.email || SYNC.pushing) return;
  clearTimeout(SYNC.timer);
  SYNC.pushing = true;
  setSyncState('saving');
  const meta = syncMeta();
  const sent = JSON.stringify(data);
  try {
    const r = await fetch('/api/data', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: JSON.parse(sent), baseRev: forceBase ?? meta.rev ?? 0 }),
    });
    const res = await r.json();
    SYNC.pushing = false;
    if (r.ok) {
      // modifié pendant l'envoi : on garde dirty et on renverra
      const changed = JSON.stringify(data) !== sent;
      setSyncMeta({ rev: res.rev, dirty: changed });
      setSyncState('ok');
      if (changed) SYNC.timer = setTimeout(pushData, 1500);
      return;
    }
    if (r.status === 409) {
      backupLocal();
      adoptServer(res);
      return alert("Les données ont été modifiées sur un autre appareil entre-temps. C'est cette version qui est gardée ; une copie des données d'ici est conservée sur cet appareil.");
    }
    if (r.status === 401) SYNC.email = null;
    setSyncState('error');
  } catch {
    SYNC.pushing = false;
    setSyncState('offline');
  }
}

/* =========================================================
   Assistant vocal : la phrase (dictée ou tapée) part au serveur, qui demande à
   Gemini de la traduire en actions ; l'app exécute ces actions ici.
   ========================================================= */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const AS = { rec: null, listening: false, busy: false, results: [] };

function assistantContext() {
  const now = new Date();
  const sessions = {};
  for (const d of DAYS) {
    const day = data.sport.days[d];
    if (day.exercises.length) sessions[d] = `${day.title || 'Séance'} (${day.exercises.map((e) => e.name).join(', ')})`;
  }
  return {
    today: dayKey(now), date: isoDate(now), dateLong: fmtLongDate(isoDate(now)) + ' ' + now.getFullYear(),
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, sessions,
  };
}

function renderAssistant(state = {}) {
  const { transcript = '', status = '', error = '' } = state;
  $('#assistant-body').innerHTML = `
    <div class="row" style="margin-bottom:6px"><h2 class="grow" style="margin:0">Assistant</h2>
      <button class="icon-btn" data-as="close" aria-label="Fermer">${ic('x')}</button></div>
    <div class="as-center">
      <button class="mic-big ${AS.listening ? 'on' : ''}" data-as="mic" aria-label="${AS.listening ? 'Arrêter l\u2019écoute' : 'Parler'}" ${SpeechRec ? '' : 'disabled'}>${ic('mic', 'lg')}</button>
      <div class="as-transcript">${esc(transcript) || (SpeechRec ? '<span class="muted">Appuie sur le micro et parle.</span>' : '<span class="muted">La dictée n\u2019est pas disponible dans ce navigateur : écris ta demande.</span>')}</div>
      <div class="as-status ${error ? 'err' : ''}">${esc(error || status)}</div>
    </div>
    ${AS.results.length ? `<section class="as-results">${AS.results.map((r) => `
      <div class="item" style="align-items:center"><span class="as-dot ${r.ok ? 'ok' : 'ko'}">${ic(r.ok ? 'tick' : 'x', 'sm')}</span>
        <div class="grow">${esc(r.text)}</div></div>`).join('')}</section>` : ''}
    <form class="quick-add" id="as-form" style="margin-top:14px">
      <input type="text" name="q" class="grow" placeholder="Ou écris ta demande…" autocomplete="off">
      <button class="btn primary" aria-label="Envoyer" ${AS.busy ? 'disabled' : ''}>${ic('send', 'sm')}</button>
    </form>
    <p class="hint" style="margin-top:10px">Exemples : « 200 g de poulet et un bol de riz », « rendez-vous dentiste jeudi à 14 h », « ajoute la tâche réviser les maths pour lundi », « lance la séance de mardi ».</p>`;
  $('#as-form').onsubmit = (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q) askAssistant(q);
  };
}

function openAssistant() {
  AS.results = [];
  renderAssistant();
  $('#assistant-dialog').showModal();
  if (SpeechRec) startListening();
}

function startListening() {
  if (!SpeechRec || AS.busy) return;
  stopListening();
  const rec = new SpeechRec();
  rec.lang = 'fr-FR';
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (const r of e.results) (r.isFinal ? (finalText = r[0].transcript) : (interim += r[0].transcript));
    renderAssistant({ transcript: finalText || interim, status: 'Je t\u2019écoute…' });
  };
  rec.onerror = (e) => {
    AS.listening = false;
    const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
      ? 'Le micro est bloqué : autorise-le pour ce site dans les réglages du navigateur.'
      : e.error === 'no-speech' ? 'Je n\u2019ai rien entendu. Réessaie ou écris ta demande.' : `Dictée impossible (${e.error}).`;
    renderAssistant({ error: msg });
  };
  rec.onend = () => {
    AS.listening = false;
    AS.rec = null;
    if (finalText.trim()) askAssistant(finalText.trim());
    else if (!AS.busy) renderAssistant({ transcript: '', status: '' });
  };
  AS.rec = rec;
  AS.listening = true;
  renderAssistant({ status: 'Je t\u2019écoute…' });
  try { rec.start(); } catch { AS.listening = false; renderAssistant({ error: 'Impossible de démarrer la dictée.' }); }
}
function stopListening() {
  if (AS.rec) { try { AS.rec.abort(); } catch { /* */ } AS.rec = null; }
  AS.listening = false;
}

async function askAssistant(text) {
  if (AS.busy) return;
  AS.busy = true;
  stopListening();
  renderAssistant({ transcript: text, status: 'Je réfléchis…' });
  let out;
  try {
    const r = await fetch('/api/assistant', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, context: assistantContext() }),
    });
    out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.error || `erreur ${r.status}`);
  } catch (err) {
    AS.busy = false;
    return renderAssistant({ transcript: text, error: err.message === 'Failed to fetch' ? 'Pas de connexion internet.' : err.message });
  }
  const done = [];
  let workout = null;
  for (const c of out.calls || []) {
    if (c.name === 'start_workout') { workout = c.args.day; continue; }
    done.push(await runAssistantCall(c));
  }
  if (workout) {
    const day = DAYS.includes(workout) ? workout : dayKey();
    if (data.sport.days[day].exercises.length) done.push({ ok: true, text: `Séance du ${day} lancée`, start: day });
    else done.push({ ok: false, text: `Il n'y a pas de séance prévue le ${day}.` });
  }
  if (!done.length && out.text) done.push({ ok: true, text: out.text });
  AS.results = done;
  AS.busy = false;
  save();
  if (!T) render();
  renderAssistant({ transcript: text, status: done.some((d) => !d.ok) ? '' : 'C\u2019est fait.' });
  const toStart = done.find((d) => d.start);
  speak(out.text || done.map((d) => d.text).join('. '));
  if (toStart) {
    // on ferme l'assistant et on lance le minuteur après l'annonce
    setTimeout(() => { $('#assistant-dialog').close(); startWorkout(toStart.start); }, 900);
  }
}

const validDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '');
const validTime = (s) => (/^\d{2}:\d{2}$/.test(s || '') ? s : '');
const grams = (v) => Math.max(0, Math.round((Number(v) || 0) * 10) / 10);

// Exécute une action proposée par Gemini et renvoie une ligne de compte rendu
async function runAssistantCall({ name, args = {} }) {
  try {
    if (name === 'add_meal') {
      const e = {
        id: uid(), date: validDate(args.date) || isoDate(), label: String(args.label || 'Repas').slice(0, 120),
        p: grams(args.protein_g), l: grams(args.fat_g), g: grams(args.carbs_g), via: 'micro', estimated: !!args.estimated,
      };
      e.pending = !e.p && !e.l && !e.g;
      data.nutrition.entries.push(e);
      return { ok: true, text: `Nutrition : ${e.label} (P ${fmtNum(e.p)} g, L ${fmtNum(e.l)} g, G ${fmtNum(e.g)} g${e.estimated ? ', estimé' : ''})` };
    }
    if (name === 'add_event') {
      const ev = {
        title: String(args.title || '').slice(0, 200), date: validDate(args.date), time: validTime(args.time),
        end: validTime(args.end), place: String(args.place || '').slice(0, 200), note: String(args.note || '').slice(0, 1000),
      };
      if (!ev.title || !ev.date) return { ok: false, text: 'Rendez-vous incomplet (titre ou date manquant).' };
      if (GCAL.enabled) {
        const g = fromGoogle(await gcalRequest('POST', null, { ...ev, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }));
        GCAL.events.set(g.id, g);
        saveGcalCache();
      } else data.events.push({ id: uid(), ...ev });
      return { ok: true, text: `Agenda : ${ev.title}, ${fmtLongDate(ev.date)}${ev.time ? ' à ' + ev.time.replace(':', ' h ') : ''}` };
    }
    if (name === 'add_task') {
      const t = { text: String(args.text || '').slice(0, 500), due: validDate(args.due) };
      if (!t.text) return { ok: false, text: 'Tâche vide.' };
      if (GTASKS.enabled) {
        const g = fromGTask(await tasksRequest('POST', null, t));
        GTASKS.items.set(g.id, g);
        saveTasksCache();
      } else data.todos.push({ id: uid(), ...t, done: false, created: Date.now() });
      return { ok: true, text: `Tâche : ${t.text}${t.due ? ' (pour le ' + fmtShortDate(t.due) + ')' : ''}` };
    }
    return { ok: false, text: `Action inconnue : ${name}` };
  } catch (err) {
    return { ok: false, text: `Échec (${err.message}).` };
  }
}

$('#mic-btn').onclick = openAssistant;
$('#assistant-body').addEventListener('click', (e) => {
  const a = e.target.closest('[data-as]')?.dataset.as;
  if (a === 'close') $('#assistant-dialog').close();
  if (a === 'mic') (AS.listening ? stopListening() : startListening());
  if (a === 'mic' && !AS.listening) renderAssistant();
});
$('#assistant-dialog').addEventListener('close', stopListening);

/* =========================================================
   Démarrage
   ========================================================= */
window.addEventListener('hashchange', () => go(location.hash.slice(1)));
// Données modifiées dans un autre onglet
window.addEventListener('storage', (e) => { if (e.key === STORE_KEY) { data = load(); applyAppearance(); if (!T) render(); } });

applyAppearance();
go(location.hash.slice(1) || 'today');
syncInit();
// la police peut changer la largeur des onglets une fois chargée
document.fonts?.ready.then(moveBubble);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
