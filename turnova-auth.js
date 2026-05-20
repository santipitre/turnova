/* ============================================================
   TURNOVA AUTH + APP — by Pyralis
   ============================================================
   Sistema completo: login PIN + dashboard + vistas operativas
   (Pedidos, Cupos, Turnos, Catálogos) conectadas a Supabase Lumen.

   Schema turnova.* accedido via header Accept-Profile: turnova.

   API pública expuesta en window.TurnovaAuth:
     - init(), logout()
     - getCurrentUser(), getLicencia()
     - switchView('dashboard'|'pedidos'|'cupos'|'turnos'|'catalogos')
   ============================================================ */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://erjdncsnomwymjiaslpx.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_5qeVvqQO26a70lAj8dMXhw_fL_Cdu-2';
  const SESSION_KEY = 'turnova_session';
  const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

  let currentUser = null;
  let currentLicencia = null;
  let currentTenant = null;
  let currentView = 'dashboard';

  // ── SUPABASE HELPERS ──────────────────────────────────────
  function baseHeaders(opts) {
    const h = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    };
    if (opts && opts.profile) h['Accept-Profile'] = opts.profile;
    if (opts && opts.contentProfile) h['Content-Profile'] = opts.contentProfile;
    if (opts && opts.prefer) h['Prefer'] = opts.prefer;
    return h;
  }
  async function sbRpc(fn, args) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: baseHeaders(), body: JSON.stringify(args || {})
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message || ('RPC error: ' + r.status));
    }
    return r.json();
  }
  async function sbQuery(table, qs, opts) {
    const url = SUPABASE_URL + '/rest/v1/' + table + (qs ? '?' + qs : '');
    const r = await fetch(url, { headers: baseHeaders(Object.assign({profile: 'turnova'}, opts || {})) });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message || ('Query error: ' + r.status));
    }
    return r.json();
  }

  // ── SESIÓN ────────────────────────────────────────────────
  function saveSession(user, licencia) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user, licencia, ts: Date.now() }));
  }
  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() - s.ts > SESSION_TIMEOUT_MS) { localStorage.removeItem(SESSION_KEY); return null; }
      return s;
    } catch (e) { localStorage.removeItem(SESSION_KEY); return null; }
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  // ── ESTILOS ───────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('turnova-auth-styles')) return;
    const css = `
    :root {
      --t-bg: #0A0F14; --t-surf: #111922; --t-border: #1F2937;
      --t-text: #F1F5F9; --t-muted: #94A3B8; --t-dim: #64748B;
      --t-accent: #A78BFA; --t-accent-2: #C4B5FD; --t-amber: #F59E0B;
      --t-green: #22C55E; --t-red: #EF4444;
    }
    .turnova-overlay { position: fixed; inset: 0; z-index: 99999; background: var(--t-bg);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--t-text);
      overflow-y: auto; padding: 24px; }
    .turnova-overlay.hidden { display: none; }
    .turnova-overlay::before { content: ''; position: absolute; inset: 0; pointer-events: none;
      background-image: linear-gradient(rgba(167,139,250,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(167,139,250,0.04) 1px, transparent 1px);
      background-size: 80px 80px; }
    .turnova-overlay::after { content: ''; position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(ellipse 600px 500px at center 35%,
        rgba(245,158,11,0.10) 0%, rgba(167,139,250,0.06) 30%, transparent 60%); }
    .turnova-card { position: relative; z-index: 1; background: rgba(17,25,34,0.95);
      border: 0.5px solid var(--t-border); border-radius: 16px; padding: 40px 32px;
      width: 100%; max-width: 420px; backdrop-filter: blur(10px);
      animation: turnovaFadeUp .4s ease; box-shadow: 0 16px 48px rgba(0,0,0,0.4); }
    @keyframes turnovaFadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .turnova-logo { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-bottom: 28px; }
    .turnova-logo svg { filter: drop-shadow(0 0 18px rgba(167,139,250,0.35)); }
    .turnova-wordmark { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: var(--t-text); }
    .turnova-wordmark .o { color: var(--t-amber); font-weight: 600; }
    .turnova-sub { font-size: 10px; letter-spacing: 0.22em; color: var(--t-muted); text-transform: uppercase; font-weight: 500; }
    .turnova-divider { width: 100px; height: 1px; background: linear-gradient(90deg, transparent, var(--t-accent), transparent); margin: 0 auto 24px; }
    .turnova-field { margin-bottom: 14px; }
    .turnova-field label { display: block; font-size: 11px; letter-spacing: 1.5px; color: var(--t-muted); text-transform: uppercase; margin-bottom: 6px; }
    .turnova-field input { width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.03);
      border: 0.5px solid var(--t-border); border-radius: 8px; padding: 11px 14px;
      font-size: 14px; color: var(--t-text); font-family: inherit; outline: none;
      transition: border-color .2s, box-shadow .2s, background .2s; }
    .turnova-field input:focus { border-color: var(--t-accent); background: rgba(167,139,250,0.04); box-shadow: 0 0 0 3px rgba(167,139,250,0.15); }
    .turnova-field input::placeholder { color: #475569; }
    .turnova-btn-primary { width: 100%; box-sizing: border-box; margin-top: 10px; padding: 13px 20px;
      font-family: inherit; font-size: 14px; font-weight: 600; letter-spacing: 0.5px;
      color: var(--t-bg); background: var(--t-accent); border: none; border-radius: 8px;
      cursor: pointer; transition: background .2s, transform .1s, box-shadow .2s;
      box-shadow: 0 4px 16px rgba(167,139,250,0.2); }
    .turnova-btn-primary:hover { background: var(--t-accent-2); transform: translateY(-1px); box-shadow: 0 8px 24px rgba(167,139,250,0.4); }
    .turnova-btn-primary:active { transform: scale(0.98); }
    .turnova-btn-primary:disabled { opacity: .5; cursor: not-allowed; transform: none; }
    .turnova-btn-ghost { background: transparent; border: 0.5px solid var(--t-border);
      color: var(--t-muted); padding: 10px 18px; border-radius: 8px;
      font-family: inherit; font-size: 12px; letter-spacing: 1px; cursor: pointer; transition: all .2s; }
    .turnova-btn-ghost:hover { border-color: var(--t-accent); color: var(--t-accent); }
    .turnova-error { margin-top: 12px; padding: 10px 14px; background: rgba(239,68,68,0.1);
      border: 0.5px solid rgba(239,68,68,0.3); border-radius: 6px;
      color: var(--t-red); font-size: 12px; display: none; }
    .turnova-error.visible { display: block; }
    .turnova-beta-banner { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px;
      background: rgba(167,139,250,0.08); border: 0.5px solid rgba(167,139,250,0.2);
      border-radius: 8px; margin-bottom: 22px; font-size: 12px; line-height: 1.55; color: var(--t-muted); }
    .turnova-beta-banner::before { content: ''; flex-shrink: 0; width: 8px; height: 8px;
      border-radius: 50%; margin-top: 5px; background: var(--t-accent); box-shadow: 0 0 8px var(--t-accent); }
    .turnova-beta-banner strong { color: var(--t-text); }
    .turnova-beta-banner a { color: var(--t-accent); text-decoration: none; }
    .turnova-beta-banner a:hover { text-decoration: underline; }
    .turnova-paywall-icon { width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 50%;
      background: rgba(239,68,68,0.1); border: 0.5px solid rgba(239,68,68,0.3);
      display: flex; align-items: center; justify-content: center; font-size: 28px; }
    .turnova-paywall-title { font-size: 18px; font-weight: 500; color: var(--t-text); text-align: center; margin-bottom: 8px; letter-spacing: 0.5px; }
    .turnova-paywall-msg { font-size: 13px; color: var(--t-muted); text-align: center; line-height: 1.6; margin-bottom: 24px; }

    /* ────────── APP LAYOUT ────────── */
    .turnova-app { position: fixed; inset: 0; z-index: 100; background: var(--t-bg);
      display: grid; grid-template-columns: 240px 1fr; overflow: hidden; color: var(--t-text); }
    .turnova-app::before { content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background-image: linear-gradient(rgba(167,139,250,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(167,139,250,0.03) 1px, transparent 1px);
      background-size: 80px 80px; }
    .turnova-app::after { content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background: radial-gradient(ellipse 800px 600px at 60% 30%, rgba(245,158,11,0.05) 0%, rgba(167,139,250,0.04) 30%, transparent 60%); }
    .turnova-sidebar { position: relative; z-index: 1; background: rgba(14,21,33,0.6);
      border-right: 0.5px solid var(--t-border); padding: 24px 16px; display: flex; flex-direction: column; overflow-y: auto; }
    .turnova-side-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; padding: 0 8px; }
    .turnova-side-brand svg { display: block; }
    .turnova-side-brand .name { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: var(--t-text); line-height: 1; }
    .turnova-side-brand .name .o { color: var(--t-amber); font-weight: 600; }
    .turnova-side-brand .by { display: block; font-size: 9px; letter-spacing: 0.22em; color: var(--t-dim); text-transform: uppercase; margin-top: 3px; }
    .turnova-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .turnova-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border-radius: 8px; font-size: 13px; color: var(--t-muted);
      cursor: pointer; transition: background .15s, color .15s; background: transparent; border: none; text-align: left; font-family: inherit; }
    .turnova-nav-item:hover { background: rgba(167,139,250,0.06); color: var(--t-text); }
    .turnova-nav-item.active { background: rgba(167,139,250,0.12); color: var(--t-accent-2); }
    .turnova-nav-item .icon { width: 18px; display: inline-flex; justify-content: center; font-size: 14px; }
    .turnova-nav-label { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--t-dim); margin: 18px 12px 6px; font-weight: 500; }
    .turnova-side-user { padding: 14px 12px; border-top: 0.5px solid var(--t-border); margin-top: 16px; }
    .turnova-side-user .nm { font-size: 13px; color: var(--t-text); font-weight: 600; }
    .turnova-side-user .rl { font-size: 10px; color: var(--t-muted); letter-spacing: 1.5px; text-transform: uppercase; margin-top: 4px; }
    .turnova-side-user .lic { font-size: 11px; color: var(--t-green); margin-top: 8px; display: flex; align-items: center; gap: 6px; }
    .turnova-side-user .lic::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 6px currentColor; }
    .turnova-side-user .lic.amber { color: var(--t-amber); }
    .turnova-side-user .lic.red { color: var(--t-red); }
    .turnova-side-user button { width: 100%; margin-top: 10px; background: transparent;
      border: 0.5px solid var(--t-border); color: var(--t-muted); padding: 7px;
      border-radius: 6px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase;
      cursor: pointer; transition: all .15s; font-family: inherit; }
    .turnova-side-user button:hover { border-color: var(--t-accent); color: var(--t-accent); }

    .turnova-main { position: relative; z-index: 1; overflow-y: auto; padding: 32px 40px; }
    .turnova-view-head { display: flex; align-items: flex-start; justify-content: space-between;
      padding-bottom: 20px; margin-bottom: 28px; border-bottom: 0.5px solid var(--t-border); gap: 24px; }
    .turnova-view-head .title { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: var(--t-text); margin-bottom: 4px; }
    .turnova-view-head .subtitle { font-size: 13px; color: var(--t-muted); }
    .turnova-tenant-chip { display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 12px; background: rgba(245,158,11,0.08); border: 0.5px solid rgba(245,158,11,0.3);
      border-radius: 6px; font-size: 11px; color: var(--t-amber);
      letter-spacing: 0.5px; flex-shrink: 0; }

    .turnova-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 28px; }
    .turnova-stat { background: rgba(17,25,34,0.6); border: 0.5px solid var(--t-border); border-radius: 12px; padding: 18px 20px; }
    .turnova-stat .label { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--t-dim); margin-bottom: 8px; font-weight: 500; }
    .turnova-stat .value { font-size: 22px; font-weight: 600; color: var(--t-text); letter-spacing: -0.01em; }
    .turnova-stat .value.purple { color: var(--t-accent); }
    .turnova-stat .value.amber { color: var(--t-amber); }
    .turnova-stat .value.green { color: var(--t-green); }
    .turnova-stat .value.red { color: var(--t-red); }
    .turnova-stat .sub { font-size: 12px; color: var(--t-muted); margin-top: 4px; }

    .turnova-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    .turnova-action-card { background: rgba(17,25,34,0.6); border: 0.5px solid var(--t-border);
      border-radius: 12px; padding: 22px; text-align: left; cursor: pointer;
      transition: border-color .2s, transform .15s, box-shadow .2s; display: flex; flex-direction: column;
      font-family: inherit; color: inherit; }
    .turnova-action-card:hover { border-color: rgba(167,139,250,0.4); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(167,139,250,0.1); }
    .turnova-action-card .icon { width: 38px; height: 38px; border-radius: 8px;
      background: rgba(167,139,250,0.1); border: 0.5px solid rgba(167,139,250,0.3);
      display: flex; align-items: center; justify-content: center; font-size: 18px; margin-bottom: 12px; }
    .turnova-action-card h3 { font-size: 15px; font-weight: 600; color: var(--t-text); margin: 0 0 6px; letter-spacing: -0.01em; }
    .turnova-action-card p { font-size: 13px; color: var(--t-muted); line-height: 1.5; margin: 0 0 10px; flex: 1; }
    .turnova-action-card .cta { font-size: 12px; color: var(--t-accent); letter-spacing: 0.04em; font-weight: 500; }

    .turnova-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .turnova-table th { text-align: left; padding: 10px 12px; background: rgba(14,21,33,0.6);
      color: var(--t-muted); font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; font-size: 10px;
      border-bottom: 0.5px solid var(--t-border); }
    .turnova-table td { padding: 12px; border-bottom: 0.5px solid var(--t-border); color: var(--t-text); vertical-align: top; }
    .turnova-table tr:hover td { background: rgba(167,139,250,0.04); }
    .turnova-table .muted { color: var(--t-muted); }
    .turnova-table .mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: 11px; color: var(--t-dim); }
    .turnova-table .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; }
    .turnova-table .badge.pendiente { background: rgba(245,158,11,0.15); color: #FCD34D; }
    .turnova-table .badge.procesando { background: rgba(59,130,246,0.15); color: #60A5FA; }
    .turnova-table .badge.asignado { background: rgba(34,197,94,0.15); color: var(--t-green); }
    .turnova-table .badge.error { background: rgba(239,68,68,0.15); color: var(--t-red); }
    .turnova-table .badge.cancelado { background: rgba(100,116,139,0.15); color: var(--t-dim); }
    .turnova-table .badge.vip { background: rgba(167,139,250,0.18); color: var(--t-accent-2); }
    .turnova-table a { color: var(--t-accent); text-decoration: none; }
    .turnova-table a:hover { text-decoration: underline; }

    .turnova-empty { background: rgba(17,25,34,0.4); border: 0.5px dashed var(--t-border);
      border-radius: 12px; padding: 48px 32px; text-align: center; margin-top: 8px; }
    .turnova-empty .icon { font-size: 36px; margin-bottom: 12px; opacity: 0.6; }
    .turnova-empty h3 { font-size: 16px; font-weight: 600; color: var(--t-text); margin: 0 0 6px; }
    .turnova-empty p { font-size: 13px; color: var(--t-muted); line-height: 1.6; margin: 0 auto; max-width: 480px; }
    .turnova-empty .actions { margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

    .turnova-loading { padding: 40px 20px; text-align: center; color: var(--t-muted); font-size: 13px; }
    .turnova-loading::before { content: ''; display: inline-block; width: 14px; height: 14px;
      border: 2px solid var(--t-border); border-top-color: var(--t-accent);
      border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 10px; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .turnova-table-card { background: rgba(17,25,34,0.6); border: 0.5px solid var(--t-border); border-radius: 12px; overflow: hidden; }

    .turnova-version { position: fixed; bottom: 10px; right: 16px; font-size: 9px; color: #475569; letter-spacing: 2px; z-index: 1; }

    @media (max-width: 720px) {
      .turnova-app { grid-template-columns: 1fr; }
      .turnova-sidebar { display: none; }
      .turnova-main { padding: 20px; }
    }
    `;
    const style = document.createElement('style');
    style.id = 'turnova-auth-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── SVG ───────────────────────────────────────────────────
  const LOGO_SVG = `<svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-label="Turnova by Pyralis">
    <rect x="3" y="3" width="54" height="54" rx="13" fill="#0A0F14" stroke="#1F2937" stroke-width="0.8"/>
    <path d="M14 14 L46 14 M30 14 L30 46" fill="none" stroke="#F1F5F9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="40" cy="34" r="9" fill="none" stroke="#F59E0B" stroke-width="0.6" opacity="0.4"/>
    <circle cx="40" cy="34" r="4" fill="#F59E0B"/>
    <circle cx="40" cy="34" r="1.8" fill="#FEF3C7"/>
  </svg>`;
  const LOGO_SVG_SMALL = `<svg width="34" height="34" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-label="Turnova">
    <rect x="3" y="3" width="54" height="54" rx="13" fill="#0A0F14" stroke="#1F2937" stroke-width="0.8"/>
    <path d="M14 14 L46 14 M30 14 L30 46" fill="none" stroke="#F1F5F9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="40" cy="34" r="9" fill="none" stroke="#F59E0B" stroke-width="0.6" opacity="0.4"/>
    <circle cx="40" cy="34" r="4" fill="#F59E0B"/>
    <circle cx="40" cy="34" r="1.8" fill="#FEF3C7"/>
  </svg>`;

  // ── HELPERS ───────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-AR', {day:'2-digit', month:'2-digit', year:'numeric'}) +
        ' ' + d.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
    } catch(e) { return iso; }
  }
  function fmtPct(v) {
    if (v == null) return '—';
    return Math.round(v * 100) + '%';
  }

  // ── PANTALLA: LOGIN ───────────────────────────────────────
  function renderLoginScreen() {
    removeApp();
    let overlay = document.getElementById('turnova-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'turnova-overlay';
    overlay.className = 'turnova-overlay';
    overlay.innerHTML = `
      <div class="turnova-card">
        <div class="turnova-logo">
          ${LOGO_SVG}
          <div style="text-align:center;">
            <div class="turnova-wordmark">Turn<span class="o">o</span>va</div>
            <div class="turnova-sub">by Pyralis</div>
          </div>
        </div>
        <div class="turnova-divider"></div>
        <div class="turnova-beta-banner">
          <div>
            <strong>Beta privada.</strong>
            Turnova está en lanzamiento controlado. Si recibiste credenciales, ingresá.
            ¿Querés probar? <a href="mailto:hola@pyralis.ar?subject=Quiero%20probar%20Turnova">Solicitá acceso</a>.
          </div>
        </div>
        <form id="turnova-login-form" autocomplete="off">
          <div class="turnova-field">
            <label for="turnova-user">Usuario</label>
            <input type="text" id="turnova-user" placeholder="Ej: SPITRELLA" autocapitalize="characters" required />
          </div>
          <div class="turnova-field">
            <label for="turnova-pin">PIN</label>
            <input type="password" id="turnova-pin" placeholder="4-6 dígitos" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" required />
          </div>
          <button type="submit" class="turnova-btn-primary" id="turnova-submit">Entrar a Turnova</button>
          <div class="turnova-error" id="turnova-error"></div>
        </form>
        <div style="margin-top: 20px; text-align: center; font-size: 12px; color: var(--t-dim);">
          ¿Olvidaste tu PIN? <a href="mailto:hola@pyralis.ar?subject=Reset%20PIN%20Turnova" style="color: var(--t-accent);">Pedir reset</a>
        </div>
      </div>
      <div class="turnova-version">TURNOVA · v1.1 · 2026</div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('turnova-login-form').addEventListener('submit', handleLogin);
    setTimeout(() => document.getElementById('turnova-user').focus(), 100);
  }
  function renderPaywall(nombre) {
    removeApp();
    let overlay = document.getElementById('turnova-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'turnova-overlay';
    overlay.className = 'turnova-overlay';
    overlay.innerHTML = `
      <div class="turnova-card">
        <div class="turnova-paywall-icon">⚠️</div>
        <div class="turnova-paywall-title">Tu licencia expiró</div>
        <div class="turnova-paywall-msg">Hola ${escapeHtml(nombre || '')}.<br>Tu acceso a Turnova no está vigente. Contactanos para renovar.</div>
        <a href="mailto:hola@pyralis.ar?subject=Renovar%20licencia%20Turnova" style="display:block; text-decoration:none;">
          <button class="turnova-btn-primary" type="button">Renovar licencia</button>
        </a>
        <div style="margin-top:14px; text-align:center;">
          <button class="turnova-btn-ghost" type="button" onclick="window.TurnovaAuth.logout()">← Cerrar sesión</button>
        </div>
      </div>
      <div class="turnova-version">TURNOVA · v1.1 · 2026</div>
    `;
    document.body.appendChild(overlay);
  }
  function hideOverlay() {
    const overlay = document.getElementById('turnova-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('turnova-submit');
    const errEl = document.getElementById('turnova-error');
    errEl.classList.remove('visible');
    btn.disabled = true; btn.textContent = 'Verificando…';
    try {
      const username = document.getElementById('turnova-user').value.trim().toUpperCase();
      const pin = document.getElementById('turnova-pin').value.trim();
      if (!username || !pin) throw new Error('Completá usuario y PIN.');
      if (!/^\d{4,6}$/.test(pin)) throw new Error('El PIN debe ser de 4 a 6 dígitos.');

      const userRows = await sbRpc('verificar_pin_turnova', { p_username: username, p_pin: pin });
      if (!userRows || userRows.length === 0) throw new Error('Usuario o PIN incorrecto, o no tenés acceso a Turnova.');
      const user = userRows[0];
      if (user.rol_turnova) user.rol = user.rol_turnova;

      const licRows = await sbRpc('licencia_turnova_activa', { p_usuario_id: user.id });
      const lic = (licRows && licRows[0]) || { vigente: false, plan: null, dias_restantes: 0 };

      currentUser = user; currentLicencia = lic;
      saveSession(user, lic);

      if (!lic.vigente) { renderPaywall(user.nombre); return; }
      await onLoginSuccess();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('visible');
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar a Turnova';
    }
  }

  async function onLoginSuccess() {
    hideOverlay();
    document.body.style.overflow = '';
    // Cargar tenant info
    if (currentUser.tenant_id) {
      try {
        const trows = await sbQuery('tenants', 'id=eq.' + currentUser.tenant_id + '&select=*');
        currentTenant = (trows && trows[0]) || null;
      } catch(e) { currentTenant = null; }
    }
    renderApp();
    switchView('dashboard');
    document.dispatchEvent(new CustomEvent('turnova:auth:ready', {
      detail: { user: currentUser, licencia: currentLicencia, tenant: currentTenant }
    }));
  }

  // ── APP SHELL (sidebar + main) ─────────────────────────────
  function removeApp() {
    const old = document.getElementById('turnova-app');
    if (old) old.remove();
  }
  function renderApp() {
    removeApp();
    const dias = currentLicencia ? (currentLicencia.dias_restantes || 0) : 0;
    const plan = currentLicencia ? currentLicencia.plan : '';
    const isExpiring = dias <= 7 && plan !== 'unlimited';
    const planLabel = plan === 'unlimited' ? 'Unlimited' : (plan === 'pro' ? 'Pro' : (plan === 'trial' ? 'Trial' : (plan || '—')));
    const licClass = plan === 'unlimited' ? '' : (isExpiring ? 'amber' : '');
    const licText = plan === 'unlimited' ? 'Licencia permanente' : (dias + ' días · ' + planLabel);

    const app = document.createElement('div');
    app.id = 'turnova-app';
    app.className = 'turnova-app';
    app.innerHTML = `
      <aside class="turnova-sidebar">
        <div class="turnova-side-brand">
          ${LOGO_SVG_SMALL}
          <div>
            <div class="name">Turn<span class="o">o</span>va</div>
            <div class="by">By Pyralis</div>
          </div>
        </div>
        <nav class="turnova-nav">
          <button class="turnova-nav-item" data-view="dashboard"><span class="icon">⌂</span> Dashboard</button>
          <div class="turnova-nav-label">Operación</div>
          <button class="turnova-nav-item" data-view="pedidos"><span class="icon">📋</span> Pedidos médicos</button>
          <button class="turnova-nav-item" data-view="turnos"><span class="icon">📅</span> Turnos</button>
          <button class="turnova-nav-item" data-view="cupos"><span class="icon">📊</span> Cupos semanales</button>
          <div class="turnova-nav-label">Configuración</div>
          <button class="turnova-nav-item" data-view="catalogos"><span class="icon">🗂️</span> Catálogos</button>
          <button class="turnova-nav-item" data-view="tenant"><span class="icon">🏥</span> Centro</button>
        </nav>
        <div class="turnova-side-user">
          <div class="nm">${escapeHtml(currentUser.nombre || currentUser.username)}</div>
          <div class="rl">${escapeHtml(currentUser.rol || 'usuario')}</div>
          <div class="lic ${licClass}">${licText}</div>
          <button id="turnova-logout-btn">Cerrar sesión</button>
        </div>
      </aside>
      <main class="turnova-main" id="turnova-main"></main>
      <div class="turnova-version">TURNOVA · v1.1 · 2026</div>
    `;
    document.body.appendChild(app);

    document.getElementById('turnova-logout-btn').addEventListener('click', logout);
    app.querySelectorAll('.turnova-nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.turnova-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    const main = document.getElementById('turnova-main');
    if (!main) return;
    if (view === 'dashboard') renderDashboardView(main);
    else if (view === 'pedidos') renderPedidosView(main);
    else if (view === 'turnos') renderTurnosView(main);
    else if (view === 'cupos') renderCuposView(main);
    else if (view === 'catalogos') renderCatalogosView(main);
    else if (view === 'tenant') renderTenantView(main);
  }

  // ── VIEW: DASHBOARD ───────────────────────────────────────
  async function renderDashboardView(main) {
    const firstName = (currentUser.nombre || currentUser.username || '').split(' ')[0];
    const tenantName = currentTenant ? currentTenant.nombre_centro : 'Centro Médico';
    const tenantPlan = currentTenant ? currentTenant.plan : '—';
    const plan = currentLicencia ? currentLicencia.plan : '';
    const planLabel = plan === 'unlimited' ? 'Unlimited' : (plan === 'pro' ? 'Pro' : (plan === 'trial' ? 'Trial' : (plan || '—')));

    main.innerHTML = `
      <div class="turnova-view-head">
        <div>
          <div class="title">Hola, ${escapeHtml(firstName)} 👋</div>
          <div class="subtitle">Bienvenido a Turnova — turnos médicos asignados con IA.</div>
        </div>
        <div class="turnova-tenant-chip">🏥 ${escapeHtml(tenantName)}</div>
      </div>
      <section class="turnova-stats">
        <div class="turnova-stat">
          <div class="label">Pedidos</div>
          <div class="value" id="stat-pedidos">—</div>
          <div class="sub" id="stat-pedidos-sub">cargando…</div>
        </div>
        <div class="turnova-stat">
          <div class="label">Turnos asignados</div>
          <div class="value" id="stat-turnos">—</div>
          <div class="sub" id="stat-turnos-sub">cargando…</div>
        </div>
        <div class="turnova-stat">
          <div class="label">Obras sociales</div>
          <div class="value" id="stat-os">—</div>
          <div class="sub" id="stat-os-sub">cargando…</div>
        </div>
        <div class="turnova-stat">
          <div class="label">Tu licencia</div>
          <div class="value purple">${escapeHtml(planLabel)}</div>
          <div class="sub">${plan === 'unlimited' ? 'Acceso permanente' : ((currentLicencia && currentLicencia.dias_restantes) + ' días')}</div>
        </div>
      </section>
      <h3 style="font-size:13px; letter-spacing:0.1em; text-transform:uppercase; color: var(--t-dim); margin: 8px 0 14px; font-weight:500;">Accesos rápidos</h3>
      <section class="turnova-actions">
        <button class="turnova-action-card" data-go="pedidos">
          <div class="icon">📋</div>
          <h3>Pedidos médicos</h3>
          <p>Listado de pedidos recibidos. Estado, OS detectada, prácticas y confianza IA.</p>
          <span class="cta">Ver pedidos →</span>
        </button>
        <button class="turnova-action-card" data-go="turnos">
          <div class="icon">📅</div>
          <h3>Turnos asignados</h3>
          <p>Turnos asignados por la IA con respeto a cupos VIP / obra social y disponibilidad semanal.</p>
          <span class="cta">Ver turnos →</span>
        </button>
        <button class="turnova-action-card" data-go="cupos">
          <div class="icon">📊</div>
          <h3>Cupos semanales</h3>
          <p>Matriz de cupos por obra social × práctica × día. VIP ≤72hs vs cupos del resto.</p>
          <span class="cta">Configurar cupos →</span>
        </button>
        <button class="turnova-action-card" data-go="catalogos">
          <div class="icon">🗂️</div>
          <h3>Catálogos</h3>
          <p>Obras sociales, especialidades, prácticas. La base de configuración del centro.</p>
          <span class="cta">Ver catálogos →</span>
        </button>
      </section>
    `;
    main.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.go)));

    try {
      const counters = await Promise.all([
        countTable('pedidos_medicos'),
        countTable('turnos'),
        countTable('obras_sociales')
      ]);
      const [pedidosCount, turnosCount, osCount] = counters;
      document.getElementById('stat-pedidos').textContent = pedidosCount;
      document.getElementById('stat-pedidos-sub').textContent = pedidosCount === 0 ? 'Sin pedidos cargados' : 'pedidos totales';
      document.getElementById('stat-turnos').textContent = turnosCount;
      document.getElementById('stat-turnos-sub').textContent = turnosCount === 0 ? 'Sin turnos asignados' : 'turnos asignados';
      document.getElementById('stat-os').textContent = osCount;
      document.getElementById('stat-os-sub').textContent = osCount === 0 ? 'Catálogo vacío' : 'obras sociales activas';
    } catch(e) {
      console.warn('Error cargando stats:', e);
    }
  }

  async function countTable(table) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?select=id', {
      headers: Object.assign(baseHeaders({profile: 'turnova'}), {
        'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0'
      })
    });
    const cr = r.headers.get('content-range') || '';
    const m = cr.match(/\/(\d+|\*)/);
    return m && m[1] !== '*' ? parseInt(m[1], 10) : 0;
  }

  // ── VIEW: PEDIDOS ─────────────────────────────────────────
  async function renderPedidosView(main) {
    main.innerHTML = `
      <div class="turnova-view-head">
        <div>
          <div class="title">Pedidos médicos</div>
          <div class="subtitle">Pedidos recibidos por foto/PDF y procesados con Claude Vision.</div>
        </div>
        <div class="turnova-tenant-chip">🏥 ${escapeHtml(currentTenant ? currentTenant.nombre_centro : '')}</div>
      </div>
      <div id="pedidos-body"><div class="turnova-loading">Cargando pedidos…</div></div>
    `;
    try {
      const rows = await sbQuery('pedidos_medicos',
        'select=*&order=created_at.desc&limit=100');
      const body = document.getElementById('pedidos-body');
      if (!rows || rows.length === 0) {
        body.innerHTML = `
          <div class="turnova-empty">
            <div class="icon">📋</div>
            <h3>Sin pedidos todavía</h3>
            <p>Cuando empieces a recibir pedidos por BOTMAKER o subas un PDF/foto manualmente, los vas a ver acá con la extracción IA (OS, práctica, médico, confianza).</p>
          </div>`;
        return;
      }
      const rowsHtml = rows.map(r => `
        <tr>
          <td class="mono">${escapeHtml((r.id||'').slice(0,8))}</td>
          <td><span class="badge ${escapeHtml(r.estado || 'pendiente')}">${escapeHtml(r.estado || 'pendiente')}</span></td>
          <td>${escapeHtml(r.medico_solicitante || '—')}${r.matricula ? '<div class="muted" style="font-size:11px;margin-top:2px;">MN ' + escapeHtml(r.matricula) + '</div>' : ''}</td>
          <td>${escapeHtml(r.obra_social_detectada || '—')}${r.nro_afiliado_detectado ? '<div class="muted" style="font-size:11px;margin-top:2px;">Afil: ' + escapeHtml(r.nro_afiliado_detectado) + '</div>' : ''}</td>
          <td>${escapeHtml(r.practica_detectada || '—')}</td>
          <td>${r.urgencia === 'vip' ? '<span class="badge vip">VIP</span>' : (r.urgencia === 'urgente' ? '<span class="badge pendiente">URG</span>' : '<span class="muted">—</span>')}</td>
          <td>${fmtPct(r.confianza_ia)}</td>
          <td class="muted">${fmtDate(r.created_at)}</td>
          <td>${r.archivo_url ? '<a href="' + escapeHtml(r.archivo_url) + '" target="_blank" rel="noopener">Ver →</a>' : '<span class="muted">—</span>'}</td>
        </tr>`).join('');
      body.innerHTML = `
        <div class="turnova-table-card">
          <table class="turnova-table">
            <thead><tr>
              <th>ID</th><th>Estado</th><th>Médico</th><th>Obra social</th><th>Práctica</th><th>Urg.</th><th>IA</th><th>Fecha</th><th></th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div style="margin-top:14px; font-size:12px; color: var(--t-muted);">
          Mostrando ${rows.length} pedido(s) más reciente(s). Total ordenado por fecha descendente.
        </div>`;
    } catch(e) {
      document.getElementById('pedidos-body').innerHTML = `
        <div class="turnova-empty">
          <div class="icon">⚠️</div>
          <h3>Error al cargar pedidos</h3>
          <p>${escapeHtml(e.message)}</p>
        </div>`;
    }
  }

  // ── VIEW: TURNOS ──────────────────────────────────────────
  async function renderTurnosView(main) {
    main.innerHTML = `
      <div class="turnova-view-head">
        <div>
          <div class="title">Turnos asignados</div>
          <div class="subtitle">Turnos que ya fueron asignados por la IA, respetando reglas VIP y cupos.</div>
        </div>
        <div class="turnova-tenant-chip">🏥 ${escapeHtml(currentTenant ? currentTenant.nombre_centro : '')}</div>
      </div>
      <div id="turnos-body"><div class="turnova-loading">Cargando turnos…</div></div>
    `;
    try {
      const rows = await sbQuery('turnos', 'select=*&order=fecha_turno.desc&limit=100');
      const body = document.getElementById('turnos-body');
      if (!rows || rows.length === 0) {
        body.innerHTML = `
          <div class="turnova-empty">
            <div class="icon">📅</div>
            <h3>Sin turnos asignados</h3>
            <p>Una vez que tengas cupos configurados y pedidos procesados, la IA va a empezar a asignar turnos respetando: VIP ≤72hs, cupos semanales por obra social, y disponibilidad por práctica/día.</p>
            <div class="actions">
              <button class="turnova-btn-ghost" onclick="window.TurnovaAuth.switchView('cupos')">Configurar cupos primero →</button>
            </div>
          </div>`;
        return;
      }
      const rowsHtml = rows.map(r => `
        <tr>
          <td class="mono">${escapeHtml((r.id||'').slice(0,8))}</td>
          <td><span class="badge ${escapeHtml(r.estado || 'asignado')}">${escapeHtml(r.estado || 'asignado')}</span></td>
          <td>${fmtDate(r.fecha_turno)}</td>
          <td>${escapeHtml(r.hora_turno || '—')}</td>
          <td>${escapeHtml(r.paciente_nombre || '—')}</td>
          <td>${escapeHtml(r.practica_nombre || '—')}</td>
          <td class="muted">${fmtDate(r.created_at)}</td>
        </tr>`).join('');
      body.innerHTML = `
        <div class="turnova-table-card">
          <table class="turnova-table">
            <thead><tr>
              <th>ID</th><th>Estado</th><th>Fecha</th><th>Hora</th><th>Paciente</th><th>Práctica</th><th>Creado</th>
            </tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;
    } catch(e) {
      document.getElementById('turnos-body').innerHTML = `
        <div class="turnova-empty">
          <div class="icon">⚠️</div>
          <h3>Error al cargar turnos</h3>
          <p>${escapeHtml(e.message)}</p>
        </div>`;
    }
  }

  // ── VIEW: CUPOS ───────────────────────────────────────────
  async function renderCuposView(main) {
    main.innerHTML = `
      <div class="turnova-view-head">
        <div>
          <div class="title">Cupos semanales</div>
          <div class="subtitle">Matriz: obra social × práctica × día de la semana. Lo usa la IA para asignar turnos.</div>
        </div>
        <div class="turnova-tenant-chip">🏥 ${escapeHtml(currentTenant ? currentTenant.nombre_centro : '')}</div>
      </div>
      <div id="cupos-body"><div class="turnova-loading">Cargando cupos…</div></div>
    `;
    try {
      const rows = await sbQuery('cupos_semanales', 'select=*&limit=500');
      const body = document.getElementById('cupos-body');
      if (!rows || rows.length === 0) {
        body.innerHTML = `
          <div class="turnova-empty">
            <div class="icon">📊</div>
            <h3>Matriz de cupos vacía</h3>
            <p>La matriz de cupos define cuántos turnos hay disponibles por <strong>obra social</strong>, <strong>práctica</strong> y <strong>día de la semana</strong>. Sin esto la IA no puede asignar turnos automáticamente.</p>
            <p style="margin-top:10px;">Para empezar, cargá tus obras sociales y prácticas en la sección <strong>Catálogos</strong>, luego volvés acá para definir la matriz.</p>
            <div class="actions">
              <button class="turnova-btn-ghost" onclick="window.TurnovaAuth.switchView('catalogos')">Ir a catálogos →</button>
            </div>
          </div>`;
        return;
      }
      const rowsHtml = rows.map(r => `
        <tr>
          <td class="mono">${escapeHtml((r.id||'').slice(0,8))}</td>
          <td>${escapeHtml(r.dia_semana || '—')}</td>
          <td>${r.cupos_disponibles == null ? '—' : r.cupos_disponibles}</td>
          <td>${r.cupos_usados == null ? 0 : r.cupos_usados}</td>
          <td class="muted">${escapeHtml(r.obra_social_id ? r.obra_social_id.slice(0,8) : '—')}</td>
          <td class="muted">${escapeHtml(r.practica_id ? r.practica_id.slice(0,8) : '—')}</td>
        </tr>`).join('');
      body.innerHTML = `
        <div class="turnova-table-card">
          <table class="turnova-table">
            <thead><tr><th>ID</th><th>Día</th><th>Disponibles</th><th>Usados</th><th>OS</th><th>Práctica</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;
    } catch(e) {
      document.getElementById('cupos-body').innerHTML = `
        <div class="turnova-empty">
          <div class="icon">⚠️</div>
          <h3>Error al cargar cupos</h3>
          <p>${escapeHtml(e.message)}</p>
        </div>`;
    }
  }

  // ── VIEW: CATÁLOGOS ───────────────────────────────────────
  async function renderCatalogosView(main) {
    main.innerHTML = `
      <div class="turnova-view-head">
        <div>
          <div class="title">Catálogos</div>
          <div class="subtitle">Obras sociales, especialidades y prácticas configuradas para este centro.</div>
        </div>
        <div class="turnova-tenant-chip">🏥 ${escapeHtml(currentTenant ? currentTenant.nombre_centro : '')}</div>
      </div>
      <div id="cat-body"><div class="turnova-loading">Cargando catálogos…</div></div>
    `;
    try {
      const [os, esp, prac] = await Promise.all([
        sbQuery('obras_sociales', 'select=*&order=nombre.asc&limit=200'),
        sbQuery('especialidades', 'select=*&order=nombre.asc&limit=200'),
        sbQuery('practicas', 'select=*&order=nombre.asc&limit=200')
      ]);
      const body = document.getElementById('cat-body');
      function section(title, items, cols) {
        if (!items || items.length === 0) {
          return '<div class="turnova-table-card" style="margin-bottom:20px;">' +
            '<div style="padding:16px 18px; border-bottom:0.5px solid var(--t-border); font-size:14px; font-weight:600;">' + escapeHtml(title) + '</div>' +
            '<div style="padding:24px; text-align:center; color: var(--t-muted); font-size:13px;">Sin registros cargados.</div>' +
            '</div>';
        }
        const head = '<tr>' + cols.map(c => '<th>' + escapeHtml(c.label) + '</th>').join('') + '</tr>';
        const rows = items.map(it => '<tr>' + cols.map(c => '<td>' + escapeHtml(it[c.key] != null ? it[c.key] : '—') + '</td>').join('') + '</tr>').join('');
        return '<div class="turnova-table-card" style="margin-bottom:20px;">' +
          '<div style="padding:16px 18px; border-bottom:0.5px solid var(--t-border); font-size:14px; font-weight:600;">' + escapeHtml(title) +
          ' <span style="color:var(--t-muted); font-weight:400; font-size:12px;">(' + items.length + ')</span></div>' +
          '<table class="turnova-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>' +
          '</div>';
      }
      body.innerHTML =
        section('Obras sociales', os, [
          {label:'Nombre', key:'nombre'},
          {label:'Código', key:'codigo'},
          {label:'VIP', key:'es_vip'},
          {label:'Activa', key:'activa'}
        ]) +
        section('Especialidades', esp, [
          {label:'Nombre', key:'nombre'},
          {label:'Código', key:'codigo'}
        ]) +
        section('Prácticas', prac, [
          {label:'Nombre', key:'nombre'},
          {label:'Código', key:'codigo'},
          {label:'Duración (min)', key:'duracion_minutos'}
        ]);
    } catch(e) {
      document.getElementById('cat-body').innerHTML = `
        <div class="turnova-empty">
          <div class="icon">⚠️</div>
          <h3>Error al cargar catálogos</h3>
          <p>${escapeHtml(e.message)}</p>
        </div>`;
    }
  }

  // ── VIEW: TENANT ──────────────────────────────────────────
  function renderTenantView(main) {
    if (!currentTenant) {
      main.innerHTML = `
        <div class="turnova-view-head">
          <div><div class="title">Centro</div><div class="subtitle">Información del centro médico activo.</div></div>
        </div>
        <div class="turnova-empty">
          <div class="icon">🏥</div>
          <h3>Sin tenant asociado</h3>
          <p>Tu usuario no tiene un centro médico asociado. Contactá a soporte.</p>
        </div>`;
      return;
    }
    const t = currentTenant;
    main.innerHTML = `
      <div class="turnova-view-head">
        <div>
          <div class="title">${escapeHtml(t.nombre_centro)}</div>
          <div class="subtitle">Información del centro médico activo en tu sesión.</div>
        </div>
        <div class="turnova-tenant-chip">Plan: ${escapeHtml(t.plan || '—')}</div>
      </div>
      <section class="turnova-stats">
        <div class="turnova-stat"><div class="label">Estado</div><div class="value ${t.estado === 'activo' ? 'green' : 'red'}">${escapeHtml(t.estado || '—')}</div></div>
        <div class="turnova-stat"><div class="label">Plan</div><div class="value purple">${escapeHtml((t.plan || '—').toUpperCase())}</div></div>
        <div class="turnova-stat"><div class="label">Timezone</div><div class="value" style="font-size:15px;">${escapeHtml(t.timezone || '—')}</div></div>
        <div class="turnova-stat"><div class="label">CUIT</div><div class="value" style="font-size:15px;">${escapeHtml(t.cuit || 'no cargado')}</div></div>
      </section>
      <div class="turnova-table-card">
        <div style="padding:16px 18px; border-bottom:0.5px solid var(--t-border); font-size:14px; font-weight:600;">Datos completos</div>
        <table class="turnova-table">
          <tbody>
            <tr><td class="muted" style="width:200px;">ID</td><td class="mono">${escapeHtml(t.id)}</td></tr>
            <tr><td class="muted">Centro</td><td>${escapeHtml(t.nombre_centro)}</td></tr>
            <tr><td class="muted">Creado</td><td>${fmtDate(t.created_at)}</td></tr>
            <tr><td class="muted">Última actualización</td><td>${fmtDate(t.updated_at)}</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  // ── LOGOUT ────────────────────────────────────────────────
  function logout() {
    clearSession();
    currentUser = null; currentLicencia = null; currentTenant = null;
    removeApp();
    renderLoginScreen();
  }

  // ── INIT ──────────────────────────────────────────────────
  async function init() {
    injectStyles();
    document.body.style.overflow = 'hidden';
    const saved = loadSession();
    if (!saved) { renderLoginScreen(); return; }
    currentUser = saved.user;
    try {
      const licRows = await sbRpc('licencia_turnova_activa', { p_usuario_id: currentUser.id });
      currentLicencia = (licRows && licRows[0]) || { vigente: false, plan: null, dias_restantes: 0 };
      saveSession(currentUser, currentLicencia);
    } catch (e) {
      currentLicencia = saved.licencia || { vigente: false };
    }
    if (!currentLicencia.vigente) { renderPaywall(currentUser.nombre); return; }
    await onLoginSuccess();
  }

  window.TurnovaAuth = {
    init: init, logout: logout,
    getCurrentUser: () => currentUser,
    getLicencia: () => currentLicencia,
    getTenant: () => currentTenant,
    switchView: switchView
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
   