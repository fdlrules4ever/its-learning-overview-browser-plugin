// @ts-check
/* itslearning Overzicht — content script.
 * Draait op *.itslearning.com en gebruikt de bestaande inlogsessie (cookies) van de gebruiker.
 * Er gaat geen data naar een andere server: alles wordt in de browser opgehaald en getoond.
 */
(() => {
  "use strict";
  if (window.top !== window || /** @type {any} */ (window).__itsOverzichtLoaded) return;
  /** @type {any} */ (window).__itsOverzichtLoaded = true;

  // ---------------------------------------------------------------- opslag
  const hasChrome = typeof chrome !== "undefined" && !!chrome.storage?.local;
  const memStore = /** @type {Record<string, any>} */ ({});
  const store = {
    /** @param {string} key */
    async get(key) {
      try {
        if (hasChrome) return (await chrome.storage.local.get(key))[key];
      } catch { /* val terug op geheugen */ }
      return memStore[key];
    },
    /** @param {string} key @param {any} value */
    async set(key, value) {
      memStore[key] = value;
      try {
        if (hasChrome) await chrome.storage.local.set({ [key]: value });
      } catch { /* niet fataal */ }
    },
  };
  store.set("lastOrigin", location.origin);

  // ---------------------------------------------------------------- netwerk
  class HttpError extends Error {
    /** @param {number} status @param {string} url */
    constructor(status, url) {
      super(`HTTP ${status} voor ${url.replace(/\?.*/, "")}`);
      this.status = status;
    }
  }
  /** @param {string} url */
  async function getJson(url) {
    const r = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    if (!r.ok) throw new HttpError(r.status, url);
    return r.json();
  }
  /** @param {string} url */
  async function getText(url) {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new HttpError(r.status, url);
    if (/\/(index|login)\.aspx/i.test(r.url)) throw new Error("Niet (meer) ingelogd");
    return r.text();
  }
  /** Voer taken uit met beperkte parallelliteit, zodat we itslearning niet overspoelen.
   * @template T @param {Array<() => Promise<T>>} jobs @param {number} limit @returns {Promise<Array<T|Error>>} */
  async function pool(jobs, limit = 4) {
    const out = /** @type {Array<T|Error>} */ ([]);
    let i = 0;
    async function worker() {
      while (i < jobs.length) {
        const n = i++;
        try { out[n] = await jobs[n](); } catch (e) { out[n] = e instanceof Error ? e : new Error(String(e)); }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
    return out;
  }

  // ---------------------------------------------------------------- hulpfuncties
  const MONTHS = { jan: 0, feb: 1, mrt: 2, maa: 2, apr: 3, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };
  /** "23 sep 2026" → Date (einde van de dag) of null */
  function parseDutchDate(s) {
    const m = /(\d{1,2})\s+([a-z]{3})[a-z.]*\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/i.exec(s || "");
    if (!m) return null;
    const mon = MONTHS[/** @type {keyof typeof MONTHS} */ (m[2].toLowerCase())];
    if (mon === undefined) return null;
    return m[4] ? new Date(+m[3], mon, +m[1], +m[4], +m[5]) : new Date(+m[3], mon, +m[1], 23, 59);
  }
  /** @param {Date} d */
  function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  /** @param {Date} d */
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((+t - +y) / 86400000 + 1) / 7);
  }
  const fmtDay = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });
  const fmtShort = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });
  const DAY = 86400000;
  /** Kalenderdagen optellen (veilig rond zomer-/wintertijd, anders dan +n*24 uur). @param {Date} d @param {number} n */
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  /** Afkortingen in vakcodes → leesbare namen. Onbekende codes worden in hoofdletters getoond
   * en zijn in het overzicht te hernoemen (klik op de vaknaam). */
  const SUBJECTS = {
    ne: "Nederlands", netl: "Nederlands", en: "Engels", entl: "Engels", du: "Duits", dutl: "Duits", fa: "Frans", fatl: "Frans",
    sp: "Spaans", sptl: "Spaans", wi: "Wiskunde", wis: "Wiskunde", ges: "Geschiedenis", gs: "Geschiedenis", ak: "Aardrijkskunde",
    biol: "Biologie", bi: "Biologie", na: "Natuurkunde", sk: "Scheikunde", nask: "NaSk", ec: "Economie", econ: "Economie",
    lo: "Lichamelijke opvoeding", ict: "ICT", inf: "Informatica", kubv: "Beeldende vorming", bv: "Beeldende vorming",
    mu: "Muziek", dr: "Drama", te: "Techniek", la: "Latijn", gr: "Grieks", mm: "Mens & maatschappij", mn: "Mens & natuur",
  };
  /** "1ha-netl-26/27" → { code: "netl", name: "Nederlands" } */
  function prettyCourse(raw) {
    const parts = raw.split(/[-.]/).filter((p) => !/^\d/.test(p) || /[a-z]/i.test(p));
    const code = (raw.match(/^[^-.]+[-.]([^-]+)-/) || [])[1] || parts[1] || raw;
    const key = code.toLowerCase().replace(/^\d+[a-z]*\./, "");
    return { code: key, name: SUBJECTS[/** @type {keyof typeof SUBJECTS} */ (key)] || key.replace(/_/g, " ").toUpperCase() };
  }

  /** Zet itslearning-HTML om naar een veilige DOM-fragment (alleen tekstopmaak en http(s)-links). */
  const ALLOWED = new Set(["P", "BR", "UL", "OL", "LI", "B", "STRONG", "I", "EM", "U", "A", "H1", "H2", "H3", "H4", "SPAN", "DIV", "TABLE", "TBODY", "TR", "TD", "TH"]);
  /** @param {string} html */
  function safeHtml(html) {
    const doc = new DOMParser().parseFromString(html || "", "text/html");
    const frag = document.createDocumentFragment();
    /** @param {Node} src @param {Node} dst */
    const copy = (src, dst) => {
      for (const n of Array.from(src.childNodes)) {
        if (n.nodeType === Node.TEXT_NODE) dst.appendChild(document.createTextNode(n.textContent || ""));
        else if (n.nodeType === Node.ELEMENT_NODE) {
          const el = /** @type {Element} */ (n);
          if (!ALLOWED.has(el.tagName)) { copy(el, dst); continue; }
          const tag = /^H\d$/.test(el.tagName) ? "STRONG" : el.tagName;
          const out = document.createElement(tag);
          if (tag === "A") {
            const href = el.getAttribute("href") || "";
            try {
              const u = new URL(href, location.origin);
              if (u.protocol === "https:" || u.protocol === "http:") { out.setAttribute("href", u.href); out.setAttribute("target", "_blank"); out.setAttribute("rel", "noopener noreferrer"); }
            } catch { /* ongeldige link: alleen tekst */ }
          }
          copy(el, out);
          // Lege alinea's (alleen spaties/&nbsp;/<br>) leveren grote witruimtes op: overslaan.
          if (/^(P|DIV|SPAN|LI|STRONG|B|EM|I|U)$/.test(tag) && !(out.textContent || "").replace(/ /g, " ").trim() && !out.querySelector("a")) continue;
          dst.appendChild(out);
        }
      }
    };
    copy(doc.body, frag);
    return frag;
  }
  /** @param {string} html */
  const plainText = (html) => (new DOMParser().parseFromString(html || "", "text/html").body.textContent || "").replace(/\s+/g, " ").trim();

  /** Kleine DOM-helper. @param {string} tag @param {Record<string, any>|null} [attrs] @param {...any} kids */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // Woorden hoofdletterongevoelig, afkortingen (SO/PO/PTD) alleen in hoofdletters om "so"/"po" in gewone tekst te negeren.
  /** @param {string} s */
  const looksLikeTest = (s) => /\b(toets|proefwerk|overhoring|repetitie|tentamen|presentatie|dictee)/i.test(s || "") || /\b(SO|PO|PTD|PTA)\b/.test(s || "");
  const VACATION_RE = /vakantie|vacaciones|holiday|vacances|ferien/i;

  /** Planner-datums staan rond middernacht in UTC (bv. zo 23:59Z). We rekenen met de kalenderdag uit de string,
   * zodat een plan dat zondag eindigt niet ook in de volgende week opduikt. @param {string} iso */
  const planDay = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };

  // ---------------------------------------------------------------- data ophalen
  /** @typedef {{ id: string, raw: string, name: string, code: string, hasPlans: boolean }} Course */
  /** @typedef {{ id: string|null, name: string, courses: Course[] }} Learner */

  /** Zoek kinderen (ouderaccount) in de huidige pagina, met een fallback op een tweede pagina. */
  async function findChildIds() {
    const grab = (/** @type {string} */ s) => [...new Set([...s.matchAll(/ChildId(?:=|\\u003d|%3d)(\d+)/gi)].map((m) => m[1]))];
    let ids = grab(document.documentElement.innerHTML);
    if (!ids.length) {
      try { ids = grab(await getText("/CourseCards")); } catch { /* geen ouderaccount of niet ingelogd */ }
    }
    return ids;
  }

  /** @param {string} childId @returns {Promise<Learner>} */
  async function loadChild(childId) {
    const html = await getText(`/DashboardMenu.aspx?ChildId=${childId}&LocationID=1&LocationType=Hierarchy&SummaryDashboardType=Parent&Item=l-menu-yourchildren`);
    const doc = new DOMParser().parseFromString(html, "text/html");
    // Kop is "Achternaam, Voornaam"; we tonen de voornaam.
    const title = (doc.querySelector("h1")?.textContent || "").trim();
    const name = title.includes(",") ? title.split(",").slice(1).join(",").trim() : title || `Kind ${childId}`;
    /** @type {Map<string, Course>} */
    const courses = new Map();
    doc.querySelectorAll('a[href*="CourseReports/"], a[href*="/plans/courses/"]').forEach((a) => {
      const href = a.getAttribute("href") || "";
      const id = (href.match(/CourseReports\/(\d+)/) || href.match(/plans\/courses\/(\d+)/) || [])[1];
      if (!id) return;
      const raw = (a.closest("tr")?.querySelector("td")?.textContent || "").trim() || `Vak ${id}`;
      const c = courses.get(id) || { id, raw, ...prettyCourse(raw), hasPlans: false };
      if (/\/plans\/courses\//.test(href)) c.hasPlans = true;
      courses.set(id, c);
    });
    return { id: childId, name, courses: [...courses.values()] };
  }

  /** Leerling-account (geen ChildId): vakken via de REST API. Nog niet getest met een echt leerlingaccount. */
  async function loadSelf() {
    const res = await getJson("/restapi/personal/courses/v2?PageIndex=0&PageSize=100");
    const arr = res.EntityArray || res.entityArray || [];
    const courses = arr.map((/** @type {any} */ c) => {
      const raw = c.Title || c.title || c.CourseCode || `Vak ${c.CourseId}`;
      return { id: String(c.CourseId ?? c.courseId ?? c.Id), raw, ...prettyCourse(raw), hasPlans: true };
    });
    return { id: null, name: "Mijn vakken", courses };
  }

  /** Alle planner-plannen van een vak (huidig/toekomst + verleden + zonder datum). */
  /** Begrens het aantal gelijktijdige verzoeken over alle vakken heen. @param {number} n */
  function limiter(n) {
    let active = 0;
    /** @type {Array<() => void>} */ const queue = [];
    return /** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */ (fn) => new Promise((resolve, reject) => {
      const run = () => { active++; fn().then(resolve, reject).finally(() => { active--; queue.shift()?.(); }); };
      if (active < n) run(); else queue.push(run);
    });
  }
  // De planner-API is snel en kan goed parallel. (Gemeten: ~1,5 s voor 12 vakken bij 8-10 tegelijk.)
  const apiLimit = limiter(8);

  async function loadPlans(courseId, childId) {
    const q = childId ? `&ChildId=${childId}` : "";
    const perKind = await Promise.all(["current", "past", "without-date"].map(async (kind) => {
      const out = [];
      let page = 0, got = 0;
      for (;;) {
        const r = await apiLimit(() => getJson(`/restapi/personal/course/${courseId}/plans/${kind}/v1?PageIndex=${page}&PageSize=100${q}`));
        const list = r.entityArray || r.EntityArray || [];
        got += list.length;
        out.push(...list);
        if (list.length < 100 || got >= (r.total ?? r.Total ?? 0) || page >= 5) break;
        page++;
      }
      return out;
    }));
    return perKind.flat();
  }

  /** Haal het model uit de voortgangsrapportpagina (window.app.model = {...}). */
  function extractModel(html) {
    const k = html.indexOf("window.app.model");
    if (k < 0) return null;
    const i = html.indexOf("{", k);
    let d = 0, j = i, inS = false, esc = false;
    for (; j < html.length; j++) {
      const c = html[j];
      if (inS) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inS = false; continue; }
      if (c === '"') inS = true;
      else if (c === "{") d++;
      else if (c === "}") { d--; if (!d) break; }
    }
    return JSON.parse(html.slice(i, j + 1));
  }

  /** Opdrachten + status uit het 360°-voortgangsrapport (alleen ouderaccount). */
  async function loadReport(courseId, childId) {
    const html = await getText(`/Reports360/CourseReports/${courseId}/IndividualProgressReport/${childId}`);
    const model = extractModel(html);
    if (!model) return [];
    const decode = (/** @type {string} */ s) => new DOMParser().parseFromString(s || "", "text/html").body.textContent || "";
    return (model.CourseElements || [])
      .filter((/** @type {any} */ e) => e.Status && (e.Details || []).some((/** @type {any} */ d) => d.Item1 === "Deadline"))
      .map((/** @type {any} */ e) => {
        const det = Object.fromEntries((e.Details || []).map((/** @type {any} */ d) => [d.Item1, d.Item2]));
        return {
          title: decode(e.Title),
          status: e.Status,
          mandatory: det["Verplicht"] === "Ja",
          deadline: parseDutchDate(det["Deadline"]),
          deadlineText: det["Deadline"],
        };
      });
  }

  // ---------------------------------------------------------------- state
  const state = {
    /** @type {Learner[]} */ learners: [],
    learnerIdx: 0,
    view: "week",
    // In het weekend kijk je vooruit: dan starten we op volgende week.
    weekStart: startOfWeek(new Date(Date.now() + ([0, 6].includes(new Date().getDay()) ? 2 * 86400000 : 0))),
    loading: false,
    /** @type {string|null} */ error: null,
    progress: "",
    /** @type {Record<string, any[]>} */ plans: {},
    /** @type {Record<string, any[]>} */ reports: {},
    /** @type {string[]} */ warnings: [],
    /** @type {Record<string, boolean>} */ done: {},
    /** @type {Record<string, string>} */ names: {},
    loadedAt: /** @type {Date|null} */ (null),
    allPastWeeks: 0,
    refreshing: false,
    reportsPending: false,
    autoOpen: false,
    /** @type {string|null} */ refreshError: null,
  };

  // Versheid: data wordt lokaal gecached en op de achtergrond ververst.
  const FRESH_MS = 10 * 60 * 1000;   // ouder dan dit → automatisch verversen
  const STALE_MS = 60 * 60 * 1000;   // ouder dan dit → oranje waarschuwing in de statusregel
  const CACHE_KEY = `cache:${location.host}`;
  const age = () => (state.loadedAt ? Date.now() - state.loadedAt.getTime() : Infinity);
  const hasData = () => Object.keys(state.plans).some((k) => k.startsWith(`${lkey()}:`));

  /** Alleen de velden bewaren die we tonen (houdt de cache klein). @param {any} p */
  const slimPlan = (p) => ({
    id: p.id, title: p.title, description: p.description, start: p.start, stop: p.stop,
    elements: (p.elements || []).map((/** @type {any} */ e) => ({ id: e.id, title: e.title, typeName: e.typeName, isHomework: e.isHomework, isResource: e.isResource, isCompleted: e.isCompleted, url: e.url })),
  });

  /** Stap 1: planner van alle vakken (snel, parallel). Vakken zonder planner-link slaan we over.
   * @param {Learner} L @param {(msg: string) => void} onProgress */
  async function fetchPlans(L, onProgress) {
    const key = L.id || "self";
    const courses = L.courses.filter((c) => c.hasPlans);
    /** @type {Record<string, any[]>} */ const plans = {};
    /** @type {string[]} */ const warnings = [];
    for (const c of L.courses) plans[`${key}:${c.id}`] = [];
    let n = 0;
    onProgress(`Planning ophalen… 0/${courses.length} vakken`);
    const res = await Promise.all(courses.map(async (c) => {
      try { return await loadPlans(c.id, L.id); }
      catch (e) { return e instanceof Error ? e : new Error(String(e)); }
      finally { onProgress(`Planning ophalen… ${++n}/${courses.length} vakken`); }
    }));
    let failures = 0;
    courses.forEach((c, i) => {
      const p = res[i];
      if (p instanceof Error) {
        if (p instanceof HttpError && p.status === 401) throw p;
        if (!(p instanceof HttpError && p.status === 404)) { warnings.push(`${c.name}: planner niet geladen (${p.message})`); failures++; }
      } else plans[`${key}:${c.id}`] = p.map(slimPlan);
    });
    if (courses.length && failures >= courses.length) throw new Error("Geen enkel vak kon worden geladen");
    return { key, plans, warnings };
  }

  /** Stap 2: opdrachtstatus uit de voortgangsrapporten (alleen ouders). itslearning verwerkt deze
   * pagina's per sessie één voor één, dus meer tegelijk opvragen helpt niet en vertraagt de rest.
   * @param {Learner} L */
  async function fetchReports(L) {
    const key = L.id || "self";
    /** @type {Record<string, any[]>} */ const reports = {};
    /** @type {string[]} */ const warnings = [];
    if (!L.id) return { key, reports, warnings };
    const res = await pool(L.courses.map((c) => () => loadReport(c.id, /** @type {string} */ (L.id))), 2);
    L.courses.forEach((c, i) => {
      const r = res[i];
      if (r instanceof Error) { warnings.push(`${c.name}: opdrachten niet geladen (${r.message})`); reports[`${key}:${c.id}`] = []; }
      else reports[`${key}:${c.id}`] = r || [];
    });
    return { key, reports, warnings };
  }

  /** Laad of ververs alles in twee stappen: eerst de planning (direct zichtbaar), daarna de opdrachten.
   * Met bestaande data gebeurt dit stil: het scherm wordt alleen opnieuw getekend als er iets veranderd is. */
  async function refresh() {
    if (state.loading || state.refreshing) return;
    const silent = hasData();
    if (silent) { state.refreshing = true; updateStatus(); }
    else { state.loading = true; state.error = null; state.progress = "Vakken zoeken…"; render(); }
    try {
      state.done = (await store.get("done")) || {};
      state.names = (await store.get("names")) || {};
      const currentId = learner()?.id;
      const childIds = await findChildIds();
      const learners = childIds.length ? await Promise.all(childIds.map(loadChild)) : [await loadSelf()];
      const idx = Math.max(0, learners.findIndex((x) => x.id === currentId));
      const L = learners[idx];

      // Stap 1: planning
      const p = await fetchPlans(L, (msg) => { if (!silent) { state.progress = msg; render(); } });
      let before = fingerprint(p.key);
      state.learners = learners; state.learnerIdx = idx;
      Object.assign(state.plans, p.plans);
      state.warnings = p.warnings;
      const hadReports = Object.keys(state.reports).some((k) => k.startsWith(`${p.key}:`));
      if (!silent) {
        // Eerste keer laden: planning meteen tonen, opdrachten volgen.
        state.loading = false; state.progress = ""; state.refreshing = true; state.reportsPending = !hadReports;
        render();
      } else if (fingerprint(p.key) !== before) render();

      // Stap 2: opdrachten
      before = fingerprint(p.key);
      const r = await fetchReports(L);
      Object.assign(state.reports, r.reports);
      state.warnings = [...p.warnings, ...r.warnings];
      state.reportsPending = false;
      state.loadedAt = new Date(); state.refreshError = null;
      await saveCache();
      if (!silent || fingerprint(p.key) !== before) render(); else updateStatus();
    } catch (e) {
      const msg = e instanceof HttpError && e.status === 401
        ? "Je bent niet (meer) ingelogd op itslearning. Log opnieuw in."
        : `${e instanceof Error ? e.message : e}`;
      if (hasData() && !state.loading) { state.refreshError = msg; }
      else { state.error = `Laden mislukt: ${msg}`; }
      state.reportsPending = false;
    } finally {
      const wasLoading = state.loading;
      state.loading = false; state.refreshing = false; state.progress = "";
      if (wasLoading || state.error) render(); else updateStatus();
    }
  }
  /** Vingerafdruk om te zien of er echt iets veranderd is. Querystrings worden genegeerd, want
   * afbeeldingen in omschrijvingen krijgen bij elke aanvraag een nieuwe ondertekende URL. @param {string} key */
  const fingerprint = (key) => JSON.stringify([state.learners, pickKey(state.plans, key), pickKey(state.reports, key)],
    (_k, v) => (typeof v === "string" ? v.replace(/\?[^"'\s<>]*/g, "") : v));
  /** @param {Record<string, any>} obj @param {string} key */
  const pickKey = (obj, key) => Object.keys(obj).filter((k) => k.startsWith(`${key}:`)).sort().map((k) => obj[k]);

  async function saveCache() {
    try {
      // chrome.storage kan geen Date-objecten bewaren: deadlines als tekst opslaan.
      const reports = Object.fromEntries(Object.entries(state.reports).map(([k, v]) =>
        [k, v.map((t) => ({ ...t, deadline: t.deadline instanceof Date ? t.deadline.toISOString() : t.deadline }))]));
      await store.set(CACHE_KEY, { savedAt: state.loadedAt?.getTime(), learners: state.learners, learnerIdx: state.learnerIdx, plans: state.plans, reports });
    } catch { /* cache is optioneel */ }
  }
  /** Laat de laatst bekende data direct zien, maar alleen als die bij de ingelogde gebruiker hoort. */
  async function loadCache() {
    const c = await store.get(CACHE_KEY);
    if (!c?.learners?.length) return false;
    const ids = [...new Set([...document.documentElement.innerHTML.matchAll(/ChildId(?:=|\\u003d|%3d)(\d+)/gi)].map((m) => m[1]))];
    const cachedIds = c.learners.map((/** @type {Learner} */ l) => l.id).filter(Boolean);
    if (ids.length ? !cachedIds.every((/** @type {string} */ id) => ids.includes(id)) : cachedIds.length) return false;
    state.learners = c.learners; state.learnerIdx = c.learnerIdx || 0; state.plans = c.plans || {};
    state.reports = Object.fromEntries(Object.entries(c.reports || {}).map(([k, v]) =>
      [k, /** @type {any[]} */ (v).map((t) => ({ ...t, deadline: t.deadline ? new Date(t.deadline) : null }))]));
    state.loadedAt = c.savedAt ? new Date(c.savedAt) : null;
    state.done = (await store.get("done")) || {};
    state.names = (await store.get("names")) || {};
    return true;
  }

  /** Statusregel ("Bijgewerkt 3 min geleden") los bijwerken, zonder het hele scherm opnieuw te tekenen. */
  function statusInfo() {
    if (state.refreshing) return { cls: "busy", text: "Bijwerken…", title: "Gegevens worden op de achtergrond opgehaald" };
    const t = state.loadedAt;
    if (!t) return { cls: "", text: "", title: "" };
    const mins = Math.floor(age() / 60000);
    const when = mins < 1 ? "zojuist" : mins < 60 ? `${mins} min geleden`
      : t.toDateString() === new Date().toDateString() ? `om ${t.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
      : `${fmtDay.format(t)} ${t.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
    if (state.refreshError) return { cls: "warn", text: `Bijwerken mislukt · gegevens van ${when}`, title: state.refreshError };
    return { cls: age() > STALE_MS ? "warn" : "ok", text: `Bijgewerkt ${when}`, title: `Wordt automatisch ververst als de gegevens ouder zijn dan ${FRESH_MS / 60000} minuten` };
  }
  function updateStatus() {
    const el = root?.querySelector(".status");
    if (!el) return;
    const s = statusInfo();
    el.className = `status ${s.cls}`; el.textContent = s.text; el.setAttribute("title", s.title);
    const btn = root?.querySelector(".refresh");
    if (btn) /** @type {HTMLButtonElement} */ (btn).disabled = state.refreshing || state.loading;
  }
  const visible = () => !!host && host.style.display !== "none" && document.visibilityState === "visible";
  /** Ververs automatisch als het overzicht open en zichtbaar is en de data te oud is. */
  function maybeRefresh() { updateStatus(); if (visible() && age() > FRESH_MS) refresh(); }
  setInterval(maybeRefresh, 60 * 1000);
  document.addEventListener("visibilitychange", maybeRefresh);
  window.addEventListener("focus", maybeRefresh);

  const learner = () => state.learners[state.learnerIdx];
  const lkey = () => learner()?.id || "self";
  /** @param {Course} c */
  const courseName = (c) => state.names[c.id] || c.name;

  // ---------------------------------------------------------------- UI
  let host = /** @type {HTMLElement|null} */ (null);
  let root = /** @type {ShadowRoot|null} */ (null);

  function open() {
    if (!host) {
      host = h("div", { id: "its-overzicht-host" });
      root = host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(host);
      document.addEventListener("keydown", onKey, true);
    }
    placeBelowMenu();
    host.style.display = "block";
    document.documentElement.style.overflow = "hidden";
    setMenuSelected(true);
    if (!state.learners.length && !state.loading) {
      loadCache().catch(() => false).then((hit) => { render(); if (!hit || age() > FRESH_MS) refresh(); else updateStatus(); });
    } else { render(); maybeRefresh(); }
  }
  function close() {
    if (host) host.style.display = "none";
    setMenuSelected(false);
    document.documentElement.style.overflow = "";
    if (location.hash === "#its-overzicht") history.replaceState(null, "", location.pathname + location.search);
  }
  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (!host || host.style.display === "none") return;
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (state.view === "week" && e.key === "ArrowLeft" && !(e.target instanceof HTMLInputElement)) shiftWeek(-1);
    else if (state.view === "week" && e.key === "ArrowRight" && !(e.target instanceof HTMLInputElement)) shiftWeek(1);
  }
  /** @param {number} n */
  function shiftWeek(n) { state.weekStart = addDays(state.weekStart, n * 7); render(); }

  /** @param {string} id */
  async function toggleDone(id) {
    if (state.done[id]) delete state.done[id]; else state.done[id] = true;
    await store.set("done", state.done);
    render();
  }
  /** @param {Course} c @param {string} name */
  async function rename(c, name) {
    const v = name.trim();
    if (!v || v === c.name) delete state.names[c.id]; else state.names[c.id] = v;
    await store.set("names", state.names);
    render();
  }

  function render() {
    if (!root) return;
    const scroll = root.querySelector(".body")?.scrollTop || 0;
    // Uitgeklapte onderdelen onthouden, zodat een achtergrondverversing niets dichtklapt.
    const dkey = (/** @type {Element} */ d) => (d.querySelector("summary")?.textContent || "").replace(/\s*\(\d+\)\s*$/, "").trim();
    const openKeys = new Set([...root.querySelectorAll("details[open]")].map(dkey));
    root.replaceChildren(h("style", null, CSS), h("div", { class: "wrap" }, header(), h("div", { class: "body" }, body())));
    if (openKeys.size) root.querySelectorAll("details").forEach((d) => { if (openKeys.has(dkey(d))) d.setAttribute("open", ""); });
    const b = root.querySelector(".body");
    if (b) b.scrollTop = scroll;
  }

  function header() {
    const L = learner();
    const tabs = [["week", "Weekplanning"], ["all", "Totaaloverzicht"], ["tests", "Toetsen"], ["tasks", "Opdrachten"]];
    return h("header", null,
      h("div", { class: "brand" }, h("span", { class: "logo" }, "✓"), h("span", null, "Overzicht"),
        L ? h("span", { class: "who" }, state.learners.length > 1
          ? h("select", { onchange: (/** @type {Event} */ e) => { state.learnerIdx = +(/** @type {HTMLSelectElement} */ (e.target)).value; render(); refresh(); } },
              state.learners.map((x, i) => h("option", { value: i, selected: i === state.learnerIdx }, x.name)))
          : L.name) : null),
      h("nav", null, tabs.map(([k, label]) => h("button", { class: state.view === k ? "tab on" : "tab", onclick: () => { state.view = k; render(); } }, label))),
      h("div", { class: "actions" },
        (() => { const st = statusInfo(); return h("span", { class: `status ${st.cls}`, title: st.title }, st.text); })(),
        h("label", { class: "auto", title: "Open het overzicht automatisch als je itslearning opent" },
          h("input", { type: "checkbox", checked: state.autoOpen, onchange: (/** @type {Event} */ e) => { state.autoOpen = /** @type {HTMLInputElement} */ (e.target).checked; store.set("autoOpen", state.autoOpen); } }),
          "Automatisch openen"),
        h("button", { class: "ghost refresh", title: "Nu verversen", onclick: () => refresh(), disabled: state.loading || state.refreshing }, "↻"),
        h("button", { class: "ghost", title: "Sluiten (Esc)", onclick: close }, "✕")));
  }

  function body() {
    if (state.error) return h("div", { class: "msg err" }, state.error);
    if (state.loading || !learner()) return h("div", { class: "msg" }, h("div", { class: "spin" }), state.progress || "Laden…");
    const warn = state.warnings.length ? h("details", { class: "warn" }, h("summary", null, `${state.warnings.length} melding(en) bij het laden`), h("ul", null, state.warnings.map((w) => h("li", null, w)))) : null;
    const view = state.view === "tests" ? testsView() : state.view === "tasks" ? tasksView() : state.view === "all" ? allView() : weekView();
    return [warn, view];
  }

  /** Plannen per vak met hun vakinfo. */
  function plansFor(/** @type {Course} */ c) { return state.plans[`${lkey()}:${c.id}`] || []; }

  /** @param {any} el @param {any} plan */
  // eslint-disable-next-line no-unused-vars
  function isTest(el, plan) { return el.typeName === "Toets" || looksLikeTest(el.title); }

  /** Plannen van één vak in de week vanaf `ws`, opgesplitst in weekplannen en doorlopende plannen.
   * @param {Course} c @param {Date} ws */
  function plansInWeek(c, ws) {
    const we = new Date(+addDays(ws, 7) - 1);
    const plans = plansFor(c).filter((p) => p.start && p.stop).filter((p) => planDay(p.start) <= we && planDay(p.stop) >= ws);
    const weekly = plans.filter((p) => (+planDay(p.stop) - +planDay(p.start)) / DAY <= 21);
    const longRunning = plans.filter((p) => !weekly.includes(p));
    // Toon een plan als het opdrachten heeft, of tekst/een betekenisvolle titel die geen vakantie is.
    const meaningful = weekly.filter((p) => p.elements?.length ||
      ((plainText(p.description) || (p.title || "").trim().length > 3) && !VACATION_RE.test(`${p.title} ${plainText(p.description)}`.slice(0, 80))));
    return { weekly, longRunning, meaningful };
  }
  const sortedCourses = () => [...learner().courses].sort((a, b) => courseName(a).localeCompare(courseName(b), "nl"));

  function weekView() {
    const ws = state.weekStart;
    const thisWeek = startOfWeek(new Date()).getTime() === ws.getTime();
    const nav = h("div", { class: "weeknav" },
      h("button", { class: "ghost", onclick: () => shiftWeek(-1), title: "Vorige week (←)" }, "‹"),
      h("div", { class: "wk" }, h("strong", null, `Week ${isoWeek(ws)}`), h("span", { class: "muted" }, ` ${fmtShort.format(ws)} – ${fmtShort.format(addDays(ws, 6))}`)),
      h("button", { class: "ghost", onclick: () => shiftWeek(1), title: "Volgende week (→)" }, "›"),
      thisWeek ? h("span", { class: "chip" }, "Deze week") : h("button", { class: "link", onclick: () => { state.weekStart = startOfWeek(new Date()); render(); } }, "Naar deze week"));

    const cards = [], empty = [], longRunning = [];
    let testCount = 0, hwCount = 0;
    for (const c of sortedCourses()) {
      const { weekly, longRunning: lr, meaningful } = plansInWeek(c, ws);
      lr.forEach((p) => longRunning.push({ c, p }));
      if (!meaningful.length) { empty.push({ c, label: weekly[0]?.title?.trim() }); continue; }
      for (const p of meaningful) for (const e of p.elements || []) { if (isTest(e, p)) testCount++; else if (e.isHomework || e.typeName === "Taak" || e.typeName === "Opdracht") hwCount++; }
      cards.push(courseCard(c, meaningful));
    }
    const summary = h("div", { class: "summary" },
      stat(cards.length, "vakken met planning"), stat(hwCount, "taken/opdrachten"), stat(testCount, "toetsen", testCount ? "red" : ""));
    return [nav, summary,
      cards.length ? h("div", { class: "grid" }, cards) : h("div", { class: "msg" }, "Geen planning gevonden voor deze week."),
      empty.length ? h("div", { class: "empty" }, h("span", { class: "muted" }, "Niets gepland: "),
        empty.map(({ c, label }) => h("span", { class: "pill" }, courseName(c), label ? h("span", { class: "muted" }, ` · ${label}`) : null))) : null,
      longRunning.length ? h("details", { class: "long" }, h("summary", null, `Doorlopende informatie (${longRunning.length})`),
        h("div", { class: "grid" }, longRunning.map(({ c, p }) => courseCard(c, [p])))) : null];
  }

  /** @param {number} n @param {string} label @param {string} [tone] */
  function stat(n, label, tone = "") { return h("div", { class: `stat ${tone}` }, h("strong", null, n), h("span", null, label)); }

  /** Bewerkbare vaknaam. @param {Course} c */
  function courseNameEl(c) {
    const nameEl = h("span", { class: "cname", contenteditable: "true", spellcheck: "false", title: `${c.raw} — klik om te hernoemen` }, courseName(c));
    nameEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); /** @type {HTMLElement} */ (e.target).blur(); } e.stopPropagation(); });
    nameEl.addEventListener("blur", () => rename(c, nameEl.textContent || ""));
    return nameEl;
  }
  /** @param {Course} c */
  const plannerLink = (c) => h("a", { class: "open", href: `/plans/courses/${c.id}${learner().id ? `/child/${learner().id}/parent/` : "/"}`, target: "_blank", rel: "noopener", title: "Open planner in itslearning" }, "↗");

  /** Eén plan: titel, omschrijving en items. @param {any} p @param {boolean} showDates */
  function planBlock(p, showDates) {
    const desc = plainText(p.description);
    const d = h("div", { class: "desc" }, safeHtml(p.description));
    return h("section", { class: "plan" },
      h("div", { class: "ptitle" }, h("span", null, (p.title || "").trim()),
        showDates ? h("span", { class: "muted small" }, ` ${fmtShort.format(planDay(p.start))}–${fmtShort.format(planDay(p.stop))}`) : null),
      desc ? (desc.length > 260 ? h("details", { class: "more" }, h("summary", null, desc.slice(0, 200) + "…"), d) : d) : null,
      p.elements?.length ? h("ul", { class: "els" }, p.elements.map((/** @type {any} */ e) => elementRow(e, p))) : null);
  }

  /** @param {Course} c @param {any[]} plans */
  function courseCard(c, plans) {
    return h("article", { class: "card" }, h("div", { class: "chead" }, courseNameEl(c), plannerLink(c)), plans.map((p) => planBlock(p, true)));
  }

  /** Totaaloverzicht: alle weken onder elkaar, per week een lijst vakken (zonder van/tot-datums). */
  function allView() {
    const thisWeek = startOfWeek(new Date());
    const from = addDays(thisWeek, -state.allPastWeeks * 7);
    // Tot en met de laatste week waarin iets gepland staat (max. een jaar vooruit).
    let last = thisWeek.getTime();
    for (const c of learner().courses) for (const p of plansFor(c)) {
      if (p.start && p.stop && (+planDay(p.stop) - +planDay(p.start)) / DAY <= 21) last = Math.max(last, +planDay(p.start));
    }
    last = Math.min(last, +addDays(thisWeek, 52 * 7));
    const weeks = [];
    for (let ws = from; +ws <= last; ws = addDays(ws, 7)) {
      const t = ws.getTime();
      const rows = [], vacation = new Set();
      for (const c of sortedCourses()) {
        const { weekly, meaningful } = plansInWeek(c, ws);
        weekly.filter((p) => !meaningful.includes(p) && VACATION_RE.test(p.title || "")).forEach((p) => vacation.add((p.title || "").trim().split("\n")[0]));
        if (meaningful.length) rows.push(h("div", { class: "arow" },
          h("div", { class: "acourse" }, courseNameEl(c), plannerLink(c)),
          h("div", { class: "acontent" }, meaningful.map((p) => planBlock(p, false)))));
      }
      const isNow = t === thisWeek.getTime();
      const endDay = addDays(ws, 6);
      weeks.push(h("section", { class: `aweek ${isNow ? "now" : ""} ${t < thisWeek.getTime() ? "past" : ""}` },
        h("div", { class: "ahead" }, h("strong", null, `Week ${isoWeek(ws)}`), h("span", { class: "muted" }, ` ${fmtShort.format(ws)} – ${fmtShort.format(endDay)}`),
          isNow ? h("span", { class: "chip" }, "Deze week") : null,
          !rows.length && vacation.size ? h("span", { class: "pill" }, [...vacation][0]) : null),
        rows.length ? h("div", { class: "list" }, rows) : h("p", { class: "muted small apad" }, vacation.size ? "Geen lessen gepland." : "Niets gepland.")));
    }
    return [h("div", { class: "weeknav" },
      h("button", { class: "link", onclick: () => { state.allPastWeeks += 4; render(); } }, "Eerdere weken tonen"),
      state.allPastWeeks ? h("button", { class: "link", onclick: () => { state.allPastWeeks = 0; render(); } }, "Vanaf deze week") : null), weeks];
  }

  /** @param {any} e @param {any} p */
  function elementRow(e, p) {
    const id = `${lkey()}:${e.id}`;
    const test = isTest(e, p);
    const kind = test ? "toets" : e.isHomework ? "huiswerk" : e.isResource ? "bron" : "taak";
    const label = test ? "Toets" : e.isHomework ? "Huiswerk" : e.typeName || "Item";
    const done = !!state.done[id] || e.isCompleted;
    return h("li", { class: `el ${kind} ${done ? "done" : ""}` },
      kind === "bron" ? h("span", { class: "dot" }) : h("input", { type: "checkbox", checked: done, title: "Afvinken (alleen zichtbaar in deze browser)", onchange: () => toggleDone(id) }),
      h("span", { class: `badge ${kind}` }, label),
      e.url ? h("a", { href: e.url, target: "_blank", rel: "noopener" }, e.title) : h("span", null, e.title));
  }

  function testsView() {
    const L = learner();
    const now = startOfWeek(new Date()).getTime();
    const rows = [];
    for (const c of L.courses) for (const p of plansFor(c)) {
      if (!p.start || !p.stop || +planDay(p.stop) < now) continue;
      if ((+planDay(p.stop) - +planDay(p.start)) / DAY > 21) continue;
      const els = (p.elements || []).filter((/** @type {any} */ e) => isTest(e, p));
      if (els.length) els.forEach((/** @type {any} */ e) => rows.push({ c, p, title: e.title, url: e.url }));
      else if (looksLikeTest(p.title)) rows.push({ c, p, title: (p.title || "").trim(), url: null });
    }
    rows.sort((a, b) => +planDay(a.p.start) - +planDay(b.p.start));
    if (!rows.length) return h("div", { class: "msg" }, "Geen toetsen gevonden in de planner.");
    let lastWeek = -1;
    return [h("p", { class: "muted small" }, "Toetsen, PTD's, presentaties en dictees uit de planner, vanaf deze week. Herkend op type en titel, dus controleer het in itslearning."),
      h("div", { class: "list" }, rows.map((r) => {
        const ws = startOfWeek(planDay(r.p.start));
        const wk = isoWeek(ws);
        const head = wk !== lastWeek ? h("div", { class: "lhead" }, `Week ${wk}`, h("span", { class: "muted" }, ` · ${fmtShort.format(ws)}`)) : null;
        lastWeek = wk;
        return [head, h("div", { class: "lrow" }, h("span", { class: "badge toets" }, courseName(r.c)),
          r.url ? h("a", { href: r.url, target: "_blank", rel: "noopener" }, r.title) : h("span", null, r.title),
          h("span", { class: "muted small" }, ` · ${(r.p.title || "").trim()}`))];
      }))];
  }

  function tasksView() {
    const L = learner();
    if (!L.id) return h("div", { class: "msg" }, "Het opdrachtenoverzicht werkt nu alleen met een ouderaccount.");
    if (state.reportsPending) return h("div", { class: "msg" }, h("div", { class: "spin" }), "Opdrachten worden opgehaald… De planning is al te zien in de andere tabbladen.");
    const now = new Date();
    const all = [];
    for (const c of L.courses) for (const t of state.reports[`${lkey()}:${c.id}`] || []) all.push({ c, ...t });
    const late = all.filter((t) => t.status === "Niet voltooid" || (t.status === "Open" && t.deadline && t.deadline < now));
    const upcoming = all.filter((t) => t.status === "Open" && t.deadline && t.deadline >= now).sort((a, b) => a.deadline - b.deadline);
    const noDeadline = all.filter((t) => t.status === "Open" && !t.deadline);
    const completed = all.filter((t) => t.status === "Voltooid").sort((a, b) => courseName(a.c).localeCompare(courseName(b.c), "nl"));
    const doneCount = completed.length;
    /** @param {any} t */
    const row = (t) => h("div", { class: "lrow" }, h("span", { class: "badge" }, courseName(t.c)), h("span", null, t.title),
      t.deadline ? h("span", { class: "muted small" }, ` · deadline ${fmtDay.format(t.deadline)}`) : null,
      t.mandatory ? null : h("span", { class: "muted small" }, " · niet verplicht"));
    return [h("div", { class: "summary" }, stat(late.length, "te laat / niet voltooid", late.length ? "red" : ""), stat(upcoming.length, "met deadline"), stat(noDeadline.length, "open zonder deadline"), stat(doneCount, "voltooid", "green")),
      h("p", { class: "muted small" }, "Status zoals itslearning die bijhoudt. Veel docenten zetten opdrachten zonder deadline klaar die niet ingeleverd hoeven te worden."),
      late.length ? [h("h3", { class: "red" }, "Te laat of niet voltooid"), h("div", { class: "list" }, late.map(row))] : null,
      h("h3", null, "Binnenkort inleveren"), upcoming.length ? h("div", { class: "list" }, upcoming.map(row)) : h("p", { class: "muted" }, "Geen openstaande opdrachten met een deadline."),
      noDeadline.length ? h("details", { class: "long" }, h("summary", null, `Open zonder deadline (${noDeadline.length})`),
        h("div", { class: "list" }, noDeadline.sort((a, b) => courseName(a.c).localeCompare(courseName(b.c), "nl")).map(row))) : null,
      completed.length ? h("details", { class: "long" }, h("summary", null, `Voltooid (${completed.length})`),
        h("div", { class: "list" }, completed.map(row))) : null];
  }

  // ---------------------------------------------------------------- stijl
  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box}
  .wrap{--bg:#f4f5f7;--card:#fff;--ink:#1d2330;--muted:#6b7280;--line:#e3e6eb;--accent:#e8590c;--red:#c92a2a;--redbg:#fff0f0;--green:#2b8a3e;--blue:#1c64b8;--bluebg:#eaf2fc;
    position:fixed;inset:0;top:var(--its-top,0px);z-index:2147483646;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column}
  @media (prefers-color-scheme:dark){.wrap{--bg:#15181e;--card:#1e222a;--ink:#e7e9ee;--muted:#9aa1ad;--line:#2d323c;--redbg:#3a1d1d;--red:#ff8787;--green:#69db7c;--blue:#74b0f5;--bluebg:#1b2a3d}}
  header{display:flex;align-items:center;gap:16px;padding:10px 20px;background:var(--card);border-bottom:1px solid var(--line);flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:16px}
  .logo{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:7px;background:var(--accent);color:#fff;font-size:15px}
  .who{font-weight:500;color:var(--muted)} .who select{font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:6px;padding:2px 6px}
  nav{display:flex;gap:4px;flex:1}
  .tab{font:inherit;border:0;background:transparent;color:var(--muted);padding:6px 12px;border-radius:8px;cursor:pointer}
  .tab.on{background:var(--bg);color:var(--ink);font-weight:600}
  .actions{display:flex;align-items:center;gap:8px}
  button.ghost{font:inherit;font-size:16px;border:1px solid var(--line);background:var(--card);color:var(--ink);width:32px;height:32px;border-radius:8px;cursor:pointer}
  button.ghost:disabled{opacity:.4}
  button.link{font:inherit;border:0;background:none;color:var(--blue);cursor:pointer;text-decoration:underline}
  .body{flex:1;overflow:auto;padding:20px;max-width:1400px;width:100%;margin:0 auto}
  .muted{color:var(--muted)} .small{font-size:12px} .red{color:var(--red)}
  .msg{padding:40px;text-align:center;color:var(--muted)} .msg.err{color:var(--red)}
  .spin{width:28px;height:28px;margin:0 auto 12px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}
  .weeknav{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}.wk{font-size:17px;min-width:200px;text-align:center}
  .chip{background:var(--accent);color:#fff;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:600}
  .summary{display:flex;gap:10px;margin:0 0 16px;flex-wrap:wrap}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 14px;display:flex;align-items:baseline;gap:8px}
  .stat strong{font-size:20px}.stat.red strong{color:var(--red)}.stat.green strong{color:var(--green)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;align-items:start}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .chead{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  .cname{font-weight:700;font-size:15px;outline:none;border-radius:4px;padding:0 2px}.cname:focus{background:var(--bg)}
  .open{color:var(--muted);text-decoration:none;font-size:15px}
  .plan+.plan{border-top:1px dashed var(--line);margin-top:10px;padding-top:10px}
  .ptitle{font-weight:600;margin-bottom:4px}
  .desc{color:var(--ink);font-size:13px}.desc p{margin:4px 0}.desc ul,.desc ol{margin:4px 0;padding-left:20px}
  .desc a,.els a,.lrow a{color:var(--blue)}
  details.more summary{cursor:pointer;font-size:13px;color:var(--ink);list-style:none}details.more summary::after{content:" meer";color:var(--blue)}details.more[open] summary{display:none}
  .els{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:5px}
  .el{display:flex;align-items:center;gap:7px;font-size:13px}.el input{margin:0;accent-color:var(--accent)}
  .el.done a,.el.done>span:last-child{text-decoration:line-through;color:var(--muted)}
  .dot{width:13px;height:13px;display:inline-block}
  .badge{font-size:11px;font-weight:600;border-radius:5px;padding:1px 6px;background:var(--bg);color:var(--muted);white-space:nowrap}
  .badge.toets{background:var(--redbg);color:var(--red)}.badge.huiswerk{background:var(--bluebg);color:var(--blue)}
  .empty{margin:18px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .pill{background:var(--card);border:1px solid var(--line);border-radius:99px;padding:2px 10px;font-size:12px}
  details.long,details.warn{margin-top:18px}details.long>summary,details.warn>summary{cursor:pointer;font-weight:600;margin-bottom:10px}
  details.warn{background:var(--redbg);border-radius:8px;padding:8px 12px;margin:0 0 14px;font-size:13px}
  h3{font-size:15px;margin:18px 0 8px}
  .list{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .lrow{padding:8px 14px;border-top:1px solid var(--line);display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.lrow:first-child{border-top:0}
  .lhead{padding:8px 14px;background:var(--bg);font-weight:700;border-top:1px solid var(--line)}
  .aweek{margin-bottom:22px}.ahead{display:flex;align-items:center;gap:8px;padding:0 2px 8px;font-size:16px;position:sticky;top:0;background:var(--bg);z-index:1;padding-top:6px}
  .aweek.past{opacity:.7}.apad{margin:0 2px}
  .arow{display:grid;grid-template-columns:190px 1fr;gap:16px;padding:12px 14px;border-top:1px solid var(--line)}.arow:first-child{border-top:0}
  .acourse{display:flex;align-items:flex-start;justify-content:space-between;gap:6px}.acontent .plan+.plan{margin-top:8px;padding-top:8px}
  .auto{font-size:12px;color:var(--muted);display:inline-flex;align-items:center;gap:5px;cursor:pointer;user-select:none}.auto input{margin:0;accent-color:var(--accent)}
  .status{font-size:12px;color:var(--muted);display:inline-flex;align-items:center;gap:6px}
  .status::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--line)}
  .status.ok::before{background:var(--green)}.status.warn{color:#b35c00}.status.warn::before{background:#f08c00}
  .status.busy::before{background:var(--accent);animation:pulse 1s ease-in-out infinite}@keyframes pulse{50%{opacity:.25}}
  @media (max-width:600px){.arow{grid-template-columns:1fr;gap:4px}.grid{grid-template-columns:1fr}.body{padding:12px}}
  `;

  // ---------------------------------------------------------------- start
  // ---- Menu-item "Overzicht" in de itslearning-hoofdbalk (naast Vakken, Updates, Groepen, Agenda)
  const MENU_ID = "its-overzicht-menuitem";
  /** @type {Array<{el: Element, cls: string, cur: string|null}>} */ let savedSelection = [];

  function injectMenuItem() {
    const ul = document.querySelector("#MainMenu ul.prom-navigation__items, ul.prom-navigation__items");
    if (!ul) return false;
    if (document.getElementById(MENU_ID)) return true;
    // Zelfde opbouw en classes als de bestaande items, zodat het eruitziet als een gewoon menu-item.
    const a = h("a", { class: "prom-navigation__item", href: "#its-overzicht", "aria-current": "false", title: "Overzicht van alle vakken (extensie)" },
      h("span", { class: "prom-navigation__item--selected-gfx" }),
      h("span", { class: "prom-navigation__item-text prom-navigation__item--selected-text" }, "Overzicht"),
      h("span", { class: "prom-navigation__item--selected-gfx-wide" }));
    a.addEventListener("click", (e) => { e.preventDefault(); if (host && host.style.display !== "none") close(); else open(); });
    ul.appendChild(h("li", { class: "prom-navigation__listitem", id: MENU_ID }, a));
    if (host && host.style.display !== "none") setMenuSelected(true);
    return true;
  }
  /** Markeer "Overzicht" als actief menu-item zolang het overzicht open is. @param {boolean} on */
  function setMenuSelected(on) {
    const mine = document.querySelector(`#${MENU_ID} a`);
    if (on) {
      if (!savedSelection.length) {
        savedSelection = [...document.querySelectorAll("ul.prom-navigation__items a.prom-navigation__item--selected")]
          .filter((el) => el !== mine).map((el) => ({ el, cls: "prom-navigation__item--selected", cur: el.getAttribute("aria-current") }));
        savedSelection.forEach(({ el }) => { el.classList.remove("prom-navigation__item--selected"); el.setAttribute("aria-current", "false"); });
      }
      mine?.classList.add("prom-navigation__item--selected"); mine?.setAttribute("aria-current", "page");
    } else {
      mine?.classList.remove("prom-navigation__item--selected"); mine?.setAttribute("aria-current", "false");
      savedSelection.forEach(({ el, cls, cur }) => { el.classList.add(cls); if (cur) el.setAttribute("aria-current", cur); });
      savedSelection = [];
    }
  }
  /** Laat het overzicht onder de itslearning-menubalk beginnen, zodat het menu bruikbaar blijft. */
  function placeBelowMenu() {
    const bar = document.getElementById("MainMenu");
    const top = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
    host?.style.setProperty("--its-top", `${top}px`);
  }
  window.addEventListener("resize", () => { if (host && host.style.display !== "none") placeBelowMenu(); });

  // De menubalk wordt door itslearning zelf (opnieuw) opgebouwd; blijf het item terugplaatsen.
  let menuTimer = 0;
  new MutationObserver(() => { if (!menuTimer) menuTimer = window.setTimeout(() => { menuTimer = 0; injectMenuItem(); }, 150); })
    .observe(document.body, { childList: true, subtree: true });
  injectMenuItem();

  // Terugval: als er na een paar seconden geen menubalk is (andere pagina-opbouw), toon een zwevende knop.
  setTimeout(() => {
    if (document.getElementById(MENU_ID)) return;
    const fab = h("button", { id: "its-overzicht-fab", title: "Overzicht van alle vakken", onclick: open }, "Overzicht");
    Object.assign(fab.style, {
      position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483645", background: "#e8590c", color: "#fff", border: "0",
      borderRadius: "999px", padding: "10px 18px", font: "600 14px system-ui,sans-serif", boxShadow: "0 4px 14px rgba(0,0,0,.2)", cursor: "pointer",
    });
    document.body.appendChild(fab);
  }, 4000);

  // Automatisch openen: één keer per browsersessie, als de gebruiker dat heeft aangezet.
  store.get("autoOpen").then((v) => {
    state.autoOpen = !!v;
    if (!state.autoOpen) return;
    let first = true;
    try { first = !sessionStorage.getItem("its-overzicht-auto"); sessionStorage.setItem("its-overzicht-auto", "1"); } catch { /* geen sessionStorage */ }
    if (first && location.hash !== "#its-overzicht") open();
  });

  if (hasChrome) {
    chrome.runtime.onMessage.addListener((msg) => { if (msg?.type === "its-overzicht-open") open(); });
  }
  if (location.hash === "#its-overzicht") open();

  // Voor testen in de console.
  /** @type {any} */ (window).__itsOverzicht = { open, close, state, refresh, maybeRefresh, render };
})();
