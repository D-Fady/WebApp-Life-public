// Serveur de Life : connexion Google (un seul compte autorisé) et synchronisation des données.
// Les fichiers du site sont servis directement par Cloudflare ; ce code ne reçoit que /api/* et /auth/*.
import { DurableObject } from 'cloudflare:workers';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.readonly',
];
const SESSION_COOKIE = 'life_session';
// GOOGLE_TEST_BASE : seulement en local (.dev.vars) pour viser un faux serveur Google. Jamais défini sur Cloudflare.
const tokenUrl = (env) => (env.GOOGLE_TEST_BASE || 'https://oauth2.googleapis.com') + '/token';
const calUrl = (env) => (env.GOOGLE_TEST_BASE || 'https://www.googleapis.com') + '/calendar/v3/calendars/primary/events';
// GEMINI_TEST_BASE : seulement en local, pour viser un faux serveur Gemini
const geminiUrl = (env, model) => `${env.GEMINI_TEST_BASE || 'https://generativelanguage.googleapis.com'}/v1beta/models/${model}:generateContent`;
const driveUrl = (env) => (env.GOOGLE_TEST_BASE || 'https://www.googleapis.com') + '/drive/v3/files';
const tasksUrl = (env) => (env.GOOGLE_TEST_BASE || 'https://tasks.googleapis.com') + '/tasks/v1/lists/@default';
const STATE_COOKIE = 'life_oauth_state';
const SESSION_DAYS = 180;
const MAX_BODY = 2_000_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/auth/login') return login(url, env);
      if (url.pathname === '/auth/callback') return await callback(request, url, env);
      if (url.pathname === '/auth/logout') return logout(url);
      if (url.pathname.startsWith('/api/')) return await api(request, url, env);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return json({ error: 'Erreur du serveur' }, 500);
    }
  },
};

/* ---------- stockage : un Durable Object unique (données + jetons Google) ---------- */
export class Store extends DurableObject {
  async getData() {
    return (await this.ctx.storage.get('data')) || { rev: 0, data: null, at: null };
  }
  // N'enregistre que si l'appareil part de la dernière version connue
  async saveData(data, baseRev) {
    const cur = await this.getData();
    if (baseRev !== cur.rev) return { ok: false, ...cur };
    const next = { rev: cur.rev + 1, data, at: Date.now() };
    await this.ctx.storage.put('data', next);
    return { ok: true, rev: next.rev, at: next.at };
  }
  async saveGoogle(tokens) {
    const prev = (await this.ctx.storage.get('google')) || {};
    // Google ne renvoie le refresh_token qu'au premier consentement : on garde l'ancien sinon
    await this.ctx.storage.put('google', { ...prev, ...tokens, refresh_token: tokens.refresh_token || prev.refresh_token });
  }
  async getGoogle() {
    return (await this.ctx.storage.get('google')) || null;
  }
  // Une tâche « Repas » ne doit être importée qu'une fois, même si deux appareils la voient en même temps
  async claimTask(id) {
    const k = 'claimed:' + id;
    if (await this.ctx.storage.get(k)) return false;
    await this.ctx.storage.put(k, Date.now());
    return true;
  }
}
const store = (env) => env.STORE.get(env.STORE.idFromName('main'));

/* ---------- connexion Google ---------- */
function login(url, env) {
  if (!env.GOOGLE_CLIENT_ID) return page('Configuration incomplète', 'Il manque GOOGLE_CLIENT_ID dans les variables et secrets du Worker Cloudflare.', 500);
  const state = randomId();
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (env.ALLOWED_EMAIL) q.set('login_hint', env.ALLOWED_EMAIL);
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, [
    cookie(STATE_COOKIE, state, { maxAge: 600, path: '/auth', url }),
  ]);
}

async function callback(request, url, env) {
  const params = url.searchParams;
  if (params.get('error')) return page('Connexion annulée', "Google n'a pas donné l'accès. Tu peux réessayer depuis les réglages de l'app.", 400);
  const state = readCookie(request, STATE_COOKIE);
  if (!state || state !== params.get('state')) return page('Connexion expirée', 'Recommence la connexion depuis les réglages de l\'app.', 400);
  if (!env.GOOGLE_CLIENT_SECRET || !env.ALLOWED_EMAIL) return page('Configuration incomplète', 'Il manque les secrets GOOGLE_CLIENT_SECRET ou ALLOWED_EMAIL dans Cloudflare.', 500);

  const res = await fetch(tokenUrl(env), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.get('code') || '',
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.id_token) {
    console.error('token', res.status, tok);
    return page('Connexion impossible', "Google a refusé l'échange. Vérifie l'ID client et le secret dans Cloudflare.", 502);
  }
  // id_token reçu directement de Google en HTTPS : son contenu est fiable sans vérifier la signature
  const claims = JSON.parse(b64urlDecode(tok.id_token.split('.')[1]));
  const email = String(claims.email || '').toLowerCase();
  if (!claims.email_verified || email !== env.ALLOWED_EMAIL.trim().toLowerCase()) {
    return page('Accès refusé', "Ce compte Google n'a pas accès à cette app.", 403);
  }
  await store(env).saveGoogle({
    access_token: tok.access_token,
    expires_at: Date.now() + (tok.expires_in || 0) * 1000,
    refresh_token: tok.refresh_token,
    scope: tok.scope,
    email,
  });
  const session = await signSession({ email, exp: Date.now() + SESSION_DAYS * 864e5 }, env);
  return redirect('/', [
    cookie(SESSION_COOKIE, session, { maxAge: SESSION_DAYS * 86400, path: '/', url }),
    cookie(STATE_COOKIE, '', { maxAge: 0, path: '/auth', url }),
  ]);
}

function logout(url) {
  return redirect('/', [cookie(SESSION_COOKIE, '', { maxAge: 0, path: '/', url })]);
}

/* ---------- API ---------- */
async function api(request, url, env) {
  const user = await readSession(request, env);
  if (!user) return json({ error: 'Non connecté' }, 401);

  if (url.pathname === '/api/me' && request.method === 'GET') {
    const g = await store(env).getGoogle();
    return json({ email: user.email, google: !!g?.refresh_token });
  }

  if (url.pathname === '/api/calendar' || url.pathname.startsWith('/api/calendar/')) {
    return await calendarApi(request, url, env);
  }

  if (url.pathname === '/api/tasks' || url.pathname.startsWith('/api/tasks/')) {
    return await tasksApi(request, url, env);
  }

  if (url.pathname === '/api/drive/courses' && request.method === 'GET') {
    return await driveCourses(url, env);
  }
  if (url.pathname.startsWith('/api/drive/file/') && request.method === 'GET') {
    return await driveFile(url, env);
  }

  if (url.pathname === '/api/assistant' && request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Origine refusée' }, 403);
    return await assistant(request, env);
  }

  if (url.pathname === '/api/data') {
    if (request.method === 'GET') return json(await store(env).getData());
    if (request.method === 'PUT') {
      // la session est en SameSite=Lax ; on vérifie aussi l'origine pour les écritures
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return json({ error: 'Origine refusée' }, 403);
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: 'Données trop volumineuses' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'JSON invalide' }, 400); }
      if (!body || typeof body.data !== 'object' || !Number.isInteger(body.baseRev)) return json({ error: 'Requête invalide' }, 400);
      const r = await store(env).saveData(body.data, body.baseRev);
      return json(r, r.ok ? 200 : 409);
    }
  }
  return json({ error: 'Introuvable' }, 404);
}

/* ---------- accès Google (jeton renouvelé automatiquement) ---------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const RECONNECT = 'Reconnecte ton compte Google dans les réglages de l\'app.';

async function googleToken(env, force = false) {
  const s = store(env);
  const g = await s.getGoogle();
  if (!g?.refresh_token) throw new HttpError(409, RECONNECT);
  if (!force && g.access_token && g.expires_at > Date.now() + 60_000) return g.access_token;
  const res = await fetch(tokenUrl(env), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: g.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const tok = await res.json();
  if (!res.ok) {
    console.error('refresh', res.status, tok);
    throw new HttpError(409, RECONNECT); // accès retiré ou expiré
  }
  await s.saveGoogle({ access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in || 0) * 1000 });
  return tok.access_token;
}

// Appel à une API Google ; réessaie une fois avec un jeton neuf si Google répond 401
async function google(env, apiUrl, init = {}) {
  for (const force of [false, true]) {
    const token = await googleToken(env, force);
    const res = await fetch(apiUrl, {
      ...init,
      headers: { ...(init.headers || {}), authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    });
    if (res.status === 401 && !force) continue;
    if (res.status === 403) {
      const err = await res.clone().json().catch(() => ({}));
      const reason = err.error?.errors?.[0]?.reason || err.error?.status || '';
      console.error('google 403', apiUrl, reason);
      // permission manquante (scope non accordé) : il faut reconnecter ; sinon (quota…) on laisse passer l'erreur
      if (/insufficientPermissions|PERMISSION_DENIED|forbidden/i.test(reason)) throw new HttpError(409, RECONNECT);
    }
    return res;
  }
}

/* ---------- Google Agenda (agenda principal) ---------- */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

async function calendarApi(request, url, env) {
  try {
    const id = url.pathname.split('/')[3];
    const CAL = calUrl(env);
    if (request.method === 'GET' && !id) {
      const timeMin = url.searchParams.get('timeMin'), timeMax = url.searchParams.get('timeMax');
      if (!timeMin || !timeMax) return json({ error: 'timeMin et timeMax requis' }, 400);
      const items = [];
      let pageToken = '';
      do {
        const q = new URLSearchParams({
          timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '2500',
          fields: 'nextPageToken,items(id,status,summary,location,description,start,end,htmlLink)',
        });
        if (pageToken) q.set('pageToken', pageToken);
        const res = await google(env, `${CAL}?${q}`);
        const body = await res.json();
        if (!res.ok) return json({ error: body.error?.message || 'Erreur Google Agenda' }, 502);
        items.push(...(body.items || []).filter((e) => e.status !== 'cancelled'));
        pageToken = body.nextPageToken || '';
      } while (pageToken);
      return json({ items });
    }

    if (request.method === 'DELETE' && id) {
      const res = await google(env, `${CAL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 410) return json({ error: 'Suppression refusée par Google Agenda' }, 502);
      return json({ ok: true });
    }

    if ((request.method === 'POST' && !id) || (request.method === 'PATCH' && id)) {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return json({ error: 'Origine refusée' }, 403);
      const ev = await request.json().catch(() => null);
      const body = toGoogleEvent(ev, !!id);
      if (!body) return json({ error: 'Rendez-vous invalide' }, 400);
      const res = await google(env, id ? `${CAL}/${encodeURIComponent(id)}` : CAL, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok) return json({ error: out.error?.message || 'Erreur Google Agenda' }, 502);
      return json(out);
    }
    return json({ error: 'Introuvable' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, reconnect: e.status === 409 }, e.status);
    throw e;
  }
}

// Champs de l'app -> événement Google. Sans heure = journée entière.
function toGoogleEvent(ev, isPatch) {
  if (!ev || typeof ev.title !== 'string' || !ev.title.trim() || !DATE_RE.test(ev.date || '')) return null;
  const tz = typeof ev.tz === 'string' && ev.tz.length < 64 ? ev.tz : 'Europe/Paris';
  const out = {
    summary: ev.title.trim().slice(0, 300),
    location: String(ev.place || '').slice(0, 300),
    description: String(ev.note || '').slice(0, 4000),
  };
  if (TIME_RE.test(ev.time || '')) {
    const end = TIME_RE.test(ev.end || '') && ev.end > ev.time ? ev.end : addHour(ev.time);
    const endDate = end === '24:00' ? nextDay(ev.date) : ev.date;
    out.start = { dateTime: `${ev.date}T${ev.time}:00`, timeZone: tz };
    out.end = { dateTime: `${endDate}T${end === '24:00' ? '00:00' : end}:00`, timeZone: tz };
  } else {
    out.start = { date: ev.date };
    out.end = { date: nextDay(ev.date) };
  }
  // en modification, null efface l'ancien format (rendez-vous avec heure <-> journée entière)
  if (isPatch) {
    for (const k of ['start', 'end']) {
      if (out[k].date) Object.assign(out[k], { dateTime: null, timeZone: null });
      else out[k].date = null;
    }
  }
  return out;
}
function addHour(t) {
  const [h, m] = t.split(':').map(Number);
  return h >= 23 ? '24:00' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function nextDay(d) {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

/* ---------- Assistant vocal : Gemini transforme la phrase en actions pour l'app ---------- */
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const ASSISTANT_TOOLS = [{
  functionDeclarations: [
    {
      name: 'add_meal',
      description: "Ajoute au suivi nutritionnel un aliment ou un repas que l'utilisateur a mangé. Si les macros ne sont pas données, estime-les pour la quantité dite à partir de valeurs nutritionnelles courantes. Un appel par aliment.",
      parameters: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING', description: 'Aliment et quantité, ex. « Poulet, 200 g »' },
          protein_g: { type: 'NUMBER', description: 'Protéines en grammes' },
          fat_g: { type: 'NUMBER', description: 'Lipides en grammes' },
          carbs_g: { type: 'NUMBER', description: 'Glucides en grammes' },
          estimated: { type: 'BOOLEAN', description: "true si les macros sont estimées et non dites par l'utilisateur" },
          date: { type: 'STRING', description: "Date du repas AAAA-MM-JJ, seulement si ce n'est pas aujourd'hui" },
        },
        required: ['label', 'protein_g', 'fat_g', 'carbs_g'],
      },
    },
    {
      name: 'add_event',
      description: "Ajoute un rendez-vous à l'agenda de l'utilisateur.",
      parameters: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          date: { type: 'STRING', description: 'AAAA-MM-JJ' },
          time: { type: 'STRING', description: 'Heure de début HH:MM (absente si journée entière)' },
          end: { type: 'STRING', description: 'Heure de fin HH:MM si dite' },
          place: { type: 'STRING' },
          note: { type: 'STRING' },
        },
        required: ['title', 'date'],
      },
    },
    {
      name: 'add_task',
      description: "Ajoute une tâche à la to-do list de l'utilisateur.",
      parameters: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          due: { type: 'STRING', description: "Échéance AAAA-MM-JJ si dite" },
        },
        required: ['text'],
      },
    },
    {
      name: 'start_workout',
      description: "Lance le minuteur de la séance de sport prévue un jour de la semaine (« lance la séance de mardi », « lance mon entraînement »).",
      parameters: {
        type: 'OBJECT',
        properties: { day: { type: 'STRING', enum: DAY_NAMES } },
        required: ['day'],
      },
    },
  ],
}];

async function assistant(request, env) {
  if (!env.GEMINI_API_KEY) return json({ error: 'La clé Gemini (GEMINI_API_KEY) manque dans Cloudflare.' }, 500);
  const body = await request.json().catch(() => null);
  const text = String(body?.text || '').trim().slice(0, 1000);
  if (!text) return json({ error: 'Phrase vide' }, 400);
  const c = body.context || {};
  const clip = (v, n) => String(v ?? '').slice(0, n);
  const sessions = DAY_NAMES.map((d) => `- ${d} : ${clip(c.sessions?.[d], 200) || 'repos'}`).join('\n');
  const system = [
    "Tu es l'assistant de « Life », le tableau de bord personnel de l'utilisateur (sport, agenda, tâches, nutrition).",
    `Nous sommes le ${clip(c.dateLong, 60)} (${clip(c.date, 10)}), il est ${clip(c.time, 5)}, fuseau ${clip(c.tz, 60)}. Aujourd'hui = ${clip(c.today, 10)}.`,
    'Programme de sport de la semaine :',
    sessions,
    '',
    "Règles : utilise les fonctions pour chaque ajout ou pour lancer une séance, plusieurs si besoin. Convertis les dates relatives (demain, jeudi, la semaine prochaine…) en AAAA-MM-JJ, toujours dans le futur proche pour un rendez-vous. « Lance ma séance » sans jour = aujourd'hui.",
    "Nutrition : comprends la phrase telle qu'elle est dite, sans format imposé. Pour un plat composé (quiche, salade, gratin…), fais un seul add_meal pour le plat entier : déduis sa composition des ingrédients cités, puis calcule les macros de la quantité mangée. Si la quantité est floue (« deux parts », « une assiette », « un bol »), estime un poids réaliste (une part de quiche ≈ 150 g) et mets-le dans label, ex. « Quiche carottes, épinards, chèvre, 2 parts (≈ 300 g) ». Des aliments séparés (« du poulet et du riz ») = un appel par aliment. Si les macros ne sont pas dites, estime-les toujours (jamais 0 par défaut, jamais de refus) et mets estimated à true.",
    "Réponds toujours en français, en une phrase courte, au tutoiement. Si la demande est ambiguë ou ne correspond à aucune fonction, réponds sans appeler de fonction (question courte ou réponse simple).",
  ].join('\n');

  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    tools: ASSISTANT_TOOLS,
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    // pas de température basse : Google la déconseille pour Gemini 3 (boucles sur les demandes complexes)
  });
  // modèle configuré, puis modèles gratuits de secours (quota séparé par modèle) si l'un est
  // inconnu (404), à court de quota (429), en panne (5xx) ou renvoie une réponse vide
  const fallbacks = (env.GEMINI_FALLBACKS || 'gemini-flash-latest,gemini-flash-lite-latest').split(',').map((m) => m.trim()).filter(Boolean);
  const models = [...new Set([env.GEMINI_MODEL || 'gemini-3.8-flash', ...fallbacks])];
  let res, out, parts = [], empty = '';
  for (const model of models) {
    res = await fetch(geminiUrl(env, model), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: payload,
    });
    out = await res.json().catch(() => ({}));
    if (res.ok) {
      parts = (out.candidates?.[0]?.content?.parts || []).filter((p) => p.functionCall || (p.text && !p.thought));
      if (parts.length) break;
      empty = out.candidates?.[0]?.finishReason || out.promptFeedback?.blockReason || 'réponse vide';
      console.error('gemini', model, 'vide', empty);
      continue;
    }
    console.error('gemini', model, res.status, JSON.stringify(out).slice(0, 500));
    if (res.status !== 404 && res.status !== 429 && res.status < 500) break;
  }
  if (!parts.length) {
    if (res.ok) return json({ error: `Gemini n'a pas su traiter la demande (${empty}). Reformule-la autrement.` }, 502);
    const detail = String(out.error?.message || '').slice(0, 200);
    const msg = res.status === 429 ? 'Limite Gemini atteinte sur tous les modèles, réessaie plus tard.'
      : res.status === 400 || res.status === 403 ? 'Gemini a refusé la demande (clé invalide ?).'
      : res.status === 503 ? 'Gemini est surchargé, réessaie dans un moment.'
      : 'Gemini ne répond pas.';
    return json({ error: `${msg} (${res.status}${detail ? ` : ${detail}` : ''})` }, 502);
  }
  return json({
    calls: parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} })),
    text: parts.filter((p) => p.text).map((p) => p.text).join(' ').trim(),
  });
}

/* ---------- Google Drive : dossier de cours (lecture seule) ---------- */
const FOLDER = 'application/vnd.google-apps.folder';
const MAX_DEPTH = 6;

async function driveList(env, q) {
  const files = [];
  let pageToken = '';
  do {
    const p = new URLSearchParams({
      q, pageSize: '1000', orderBy: 'name',
      fields: 'nextPageToken,files(id,name,mimeType,parents,webViewLink,modifiedTime)',
    });
    if (pageToken) p.set('pageToken', pageToken);
    const res = await google(env, `${driveUrl(env)}?${p}`);
    const body = await res.json();
    if (!res.ok) throw new HttpError(502, body.error?.message || 'Erreur Google Drive');
    files.push(...(body.files || []));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return files;
}

// Arborescence du dossier : un appel groupé par niveau (25 dossiers par requête) pour rester sous la limite d'appels du Worker
async function driveCourses(url, env) {
  try {
    const name = (url.searchParams.get('root') || 'BUT2').trim();
    if (!name || name.length > 200) return json({ error: 'Nom de dossier invalide' }, 400);
    // échappement des requêtes Drive : \ devient \\ et ' devient \'
    const quoted = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    // d'abord à la racine de « Mon Drive », sinon n'importe où (ex. sauvegarde « Ordinateurs »)
    const base = `name = '${quoted}' and mimeType = '${FOLDER}' and trashed = false`;
    let roots = await driveList(env, `${base} and 'root' in parents`);
    if (!roots.length) roots = await driveList(env, base);
    if (!roots.length) return json({ error: `Dossier « ${name} » introuvable dans « Mon Drive ».` }, 404);
    const root = roots[0];
    const paths = new Map([[root.id, []]]);
    const files = [];
    let level = [root.id];
    for (let depth = 0; depth < MAX_DEPTH && level.length; depth++) {
      const next = [];
      for (let i = 0; i < level.length; i += 25) {
        const ids = level.slice(i, i + 25);
        const q = `(${ids.map((id) => `'${id}' in parents`).join(' or ')}) and trashed = false`;
        for (const f of await driveList(env, q)) {
          const parent = (f.parents || []).find((p) => paths.has(p));
          if (parent === undefined) continue;
          const path = paths.get(parent);
          if (f.mimeType === FOLDER) {
            if (!paths.has(f.id)) { paths.set(f.id, [...path, f.name]); next.push(f.id); }
          } else {
            files.push({ id: f.id, name: f.name, mimeType: f.mimeType, link: f.webViewLink, modified: f.modifiedTime, path });
          }
        }
      }
      level = next;
      if (files.length > 5000) break;
    }
    return json({ root: { id: root.id, name: root.name }, files });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, reconnect: e.status === 409 }, e.status);
    throw e;
  }
}

// Contenu d'un fichier (PDF pour l'aperçu), transmis tel quel sans le garder en mémoire
async function driveFile(url, env) {
  try {
    const id = decodeURIComponent(url.pathname.split('/')[4] || '');
    if (!/^[\w-]{1,200}$/.test(id)) return json({ error: 'Fichier invalide' }, 400);
    const res = await google(env, `${driveUrl(env)}/${encodeURIComponent(id)}?alt=media`);
    if (!res.ok) return json({ error: res.status === 404 ? 'Fichier introuvable' : 'Google Drive a refusé' }, res.status === 404 ? 404 : 502);
    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') || 'application/octet-stream',
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, reconnect: e.status === 409 }, e.status);
    throw e;
  }
}

/* ---------- Google Tasks (liste par défaut « Mes tâches ») ---------- */
async function tasksApi(request, url, env) {
  try {
    const [, , , id, action] = url.pathname.split('/');
    const LIST = tasksUrl(env);
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return json({ error: 'Origine refusée' }, 403);
    }

    if (request.method === 'GET' && !id) {
      const items = [];
      let pageToken = '';
      do {
        const q = new URLSearchParams({
          showCompleted: 'true', showHidden: 'false', maxResults: '100',
          fields: 'nextPageToken,items(id,title,notes,status,due,completed,updated,deleted)',
        });
        if (pageToken) q.set('pageToken', pageToken);
        const res = await google(env, `${LIST}/tasks?${q}`);
        const body = await res.json();
        if (!res.ok) return json({ error: body.error?.message || 'Erreur Google Tasks' }, 502);
        items.push(...(body.items || []).filter((t) => !t.deleted));
        pageToken = body.nextPageToken || '';
      } while (pageToken && items.length < 2000);
      return json({ items });
    }

    // Efface de la liste les tâches terminées
    if (request.method === 'POST' && id === 'clear') {
      const res = await google(env, `${LIST}/clear`, { method: 'POST' });
      if (!res.ok) return json({ error: 'Google Tasks a refusé' }, 502);
      return json({ ok: true });
    }

    // Réserve puis retire une tâche « Repas » : claimed=false si un autre appareil l'a déjà prise
    if (request.method === 'POST' && id && action === 'claim') {
      if (!(await store(env).claimTask(id))) return json({ claimed: false });
      const res = await google(env, `${LIST}/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404 && res.status !== 410) console.error('claim delete', res.status);
      return json({ claimed: true });
    }

    if (request.method === 'DELETE' && id) {
      const res = await google(env, `${LIST}/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404 && res.status !== 410) return json({ error: 'Suppression refusée par Google Tasks' }, 502);
      return json({ ok: true });
    }

    if ((request.method === 'POST' && !id) || (request.method === 'PATCH' && id && !action)) {
      const t = await request.json().catch(() => null);
      const body = toGoogleTask(t, !!id);
      if (!body) return json({ error: 'Tâche invalide' }, 400);
      const res = await google(env, id ? `${LIST}/tasks/${encodeURIComponent(id)}` : `${LIST}/tasks`, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok) return json({ error: out.error?.message || 'Erreur Google Tasks' }, 502);
      return json(out);
    }
    return json({ error: 'Introuvable' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, reconnect: e.status === 409 }, e.status);
    throw e;
  }
}

// Champs de l'app -> tâche Google. L'échéance Google n'a pas d'heure (minuit UTC).
function toGoogleTask(t, isPatch) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  if (t.text !== undefined) {
    if (typeof t.text !== 'string' || !t.text.trim()) return null;
    out.title = t.text.trim().slice(0, 1000);
  } else if (!isPatch) return null;
  if (t.due !== undefined) {
    if (t.due && !DATE_RE.test(t.due)) return null;
    if (t.due) out.due = `${t.due}T00:00:00.000Z`;
    else if (isPatch) out.due = null;
  }
  if (t.done !== undefined) {
    out.status = t.done ? 'completed' : 'needsAction';
    if (!t.done && isPatch) out.completed = null;
  }
  return out;
}

/* ---------- session signée (HMAC) ---------- */
async function hmacKey(env) {
  // clé dérivée du secret Google : pas de secret supplémentaire à configurer
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('life-session:' + env.GOOGLE_CLIENT_SECRET));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signSession(payload, env) {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}
async function readSession(request, env) {
  const v = readCookie(request, SESSION_COOKIE);
  if (!v || !env.GOOGLE_CLIENT_SECRET) return null;
  const [body, sig] = v.split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), b64urlBytes(sig), new TextEncoder().encode(body));
  if (!ok) return null;
  const p = JSON.parse(b64urlDecode(body));
  if (!p.exp || p.exp < Date.now()) return null;
  if (env.ALLOWED_EMAIL && p.email !== env.ALLOWED_EMAIL.trim().toLowerCase()) return null;
  return p;
}

/* ---------- utilitaires ---------- */
function randomId() {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(24)));
}
function b64urlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlBytes(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
function b64urlDecode(str) {
  return new TextDecoder().decode(b64urlBytes(str));
}
function readCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function cookie(name, value, { maxAge, path, url }) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=${path}; HttpOnly; SameSite=Lax${secure}`;
}
function redirect(location, cookies = []) {
  const h = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function page(title, text, status) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – Life</title><link rel="stylesheet" href="/styles.css"></head>
<body><div class="backdrop" aria-hidden="true"><i></i><i></i></div><header class="topbar"><div><div class="sub">Life</div><h1>${esc(title)}</h1></div></header>
<main><section class="group"><p>${esc(text)}</p><p style="margin-top:12px"><a href="/">Retour à l'app</a></p></section></main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
