/* ============================================================
   TURNOVA AUTH — by Pyralis
   ============================================================
   Sistema de login + control de licencias para Turnova.
   Comparte el proyecto Supabase con Lumen y Dictom.

   Dependencias en app.html:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="turnova-auth.js"></script>

   API pública expuesta en window.TurnovaAuth:
     - init()                 → arranca el overlay de login al cargar
     - logout()               → cierra sesión
     - getCurrentUser()       → { id, username, nombre, rol, tenant_id, tenant_nombre }
     - getLicencia()          → { vigente, plan, dias_restantes, fecha_fin }
   ============================================================ */
(function () {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────
  const SUPABASE_URL = 'https://erjdncsnomwymjiaslpx.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_5qeVvqQO26a70lAj8dMXhw_fL_Cdu-2';
  const SESSION_KEY = 'turnova_session';
  const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 horas

  // ── ESTADO ────────────────────────────────────────────────
  let currentUser = null;
  let currentLicencia = null;

  // ── HEADERS ───────────────────────────────────────────────
  function sbHeaders() {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  async function sbRpc(fn, args) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify(args || {})
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message || ('RPC error: ' + r.status));
    }
    return r.json();
  }

  // ── SESIÓN ────────────────────────────────────────────────
  function saveSession(user, licencia) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      user: user,
      licencia: licencia,
      ts: Date.now()
    }));
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() - s.ts > SESSION_TIMEOUT_MS) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ── ESTILOS DEL OVERLAY ───────────────────────────────────
  function injectStyles() {
    if (document.getElementById('turnova-auth-styles')) return;
    const css = `
    .turnova-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: #0A0F14;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #F1F5F9;
      overflow-y: auto;
      padding: 24px;
    }
    .turnova-overlay.hidden { display: none; }
    .turnova-overlay::before {
      content: ''; position: absolute; inset: 0; pointer-events: none;
      background-image:
        linear-gradient(rgba(167, 139, 250, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(167, 139, 250, 0.04) 1px, transparent 1px);
      background-size: 80px 80px;
    }
    .turnova-overlay::after {
      content: ''; position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(
        ellipse 600px 500px at center 35%,
        rgba(245, 158, 11, 0.10) 0%,
        rgba(167, 139, 250, 0.06) 30%,
        transparent 60%
      );
    }
    .turnova-card {
      position: relative; z-index: 1;
      background: rgba(17, 25, 34, 0.95);
      border: 0.5px solid #1F2937;
      border-radius: 16px;
      padding: 40px 32px;
      width: 100%; max-width: 420px;
      backdrop-filter: blur(10px);
      animation: turnovaFadeUp .4s ease;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
    }
    @keyframes turnovaFadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .turnova-logo {
      display: flex; flex-direction: column; align-items: center;
      gap: 14px; margin-bottom: 28px;
    }
    .turnova-logo svg { filter: drop-shadow(0 0 18px rgba(167, 139, 250, 0.35)); }
    .turnova-wordmark {
      font-size: 28px; font-weight: 700; letter-spacing: -0.02em;
      color: #F1F5F9;
    }
    .turnova-wordmark .o { color: #F59E0B; font-weight: 600; }
    .turnova-sub {
      font-size: 10px; letter-spacing: 0.22em; color: #94A3B8;
      text-transform: uppercase; font-weight: 500;
    }
    .turnova-divider {
      width: 100px; height: 1px;
      background: linear-gradient(90deg, transparent, #A78BFA, transparent);
      margin: 0 auto 24px;
    }
    .turnova-field { margin-bottom: 14px; }
    .turnova-field label {
      display: block;
      font-size: 11px; letter-spacing: 1.5px;
      color: #94A3B8; text-transform: uppercase;
      margin-bottom: 6px;
    }
    .turnova-field input {
      width: 100%; box-sizing: border-box;
      background: rgba(255, 255, 255, 0.03);
      border: 0.5px solid #1F2937;
      border-radius: 8px;
      padding: 11px 14px;
      font-size: 14px; color: #F1F5F9;
      font-family: inherit;
      outline: none;
      transition: border-color .2s, box-shadow .2s, background .2s;
    }
    .turnova-field input:focus {
      border-color: #A78BFA;
      background: rgba(167, 139, 250, 0.04);
      box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.15);
    }
    .turnova-field input::placeholder { color: #475569; }
    .turnova-btn-primary {
      width: 100%; box-sizing: border-box;
      margin-top: 10px;
      padding: 13px 20px;
      font-family: inherit; font-size: 14px;
      font-weight: 600; letter-spacing: 0.5px;
      color: #0A0F14;
      background: #A78BFA;
      border: none; border-radius: 8px;
      cursor: pointer;
      transition: background .2s, transform .1s, box-shadow .2s;
      box-shadow: 0 4px 16px rgba(167, 139, 250, 0.2);
    }
    .turnova-btn-primary:hover { background: #C4B5FD; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(167, 139, 250, 0.4); }
    .turnova-btn-primary:active { transform: scale(0.98); }
    .turnova-btn-primary:disabled { opacity: .5; cursor: not-allowed; transform: none; }
    .turnova-btn-ghost {
      background: transparent;
      border: 0.5px solid #1F2937;
      color: #94A3B8;
      padding: 10px 18px;
      border-radius: 8px;
      font-family: inherit; font-size: 12px;
      letter-spacing: 1px;
      cursor: pointer;
      transition: all .2s;
    }
    .turnova-btn-ghost:hover { border-color: #A78BFA; color: #A78BFA; }
    .turnova-error {
      margin-top: 12px; padding: 10px 14px;
      background: rgba(239,68,68,0.1);
      border: 0.5px solid rgba(239,68,68,0.3);
      border-radius: 6px;
      color: #EF4444; font-size: 12px;
      display: none;
    }
    .turnova-error.visible { display: block; }
    .turnova-beta-banner {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 12px 14px;
      background: rgba(167, 139, 250, 0.08);
      border: 0.5px solid rgba(167, 139, 250, 0.2);
      border-radius: 8px;
      margin-bottom: 22px;
      font-size: 12px; line-height: 1.55;
      color: #94A3B8;
    }
    .turnova-beta-banner::before {
      content: ''; flex-shrink: 0;
      width: 8px; height: 8px; border-radius: 50%; margin-top: 5px;
      background: #A78BFA;
      box-shadow: 0 0 8px #A78BFA;
    }
    .turnova-beta-banner strong { color: #F1F5F9; }
    .turnova-beta-banner a { color: #A78BFA; text-decoration: none; }
    .turnova-beta-banner a:hover { text-decoration: underline; }
    .turnova-paywall-icon {
      width: 64px; height: 64px;
      margin: 0 auto 16px;
      border-radius: 50%;
      background: rgba(239,68,68,0.1);
      border: 0.5px solid rgba(239,68,68,0.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 28px;
    }
    .turnova-paywall-title {
      font-size: 18px; font-weight: 500;
      color: #F1F5F9; text-align: center;
      margin-bottom: 8px; letter-spacing: 0.5px;
    }
    .turnova-paywall-msg {
      font-size: 13px; color: #94A3B8;
      text-align: center; line-height: 1.6;
      margin-bottom: 24px;
    }
    .turnova-dash-wrap {
      position: fixed; inset: 0; z-index: 100;
      background: #0A0F14;
      overflow-y: auto;
      padding: 32px 24px;
    }
    .turnova-dash-wrap::before {
      content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background-image:
        linear-gradient(rgba(167, 139, 250, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(167, 139, 250, 0.04) 1px, transparent 1px);
      background-size: 80px 80px;
    }
    .turnova-dash-wrap::after {
      content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background: radial-gradient(
        ellipse 600px 500px at center 20%,
        rgba(245, 158, 11, 0.08) 0%,
        rgba(167, 139, 250, 0.05) 30%,
        transparent 60%
      );
    }
    .turnova-dash {
      position: relative; z-index: 1;
      max-width: 980px; margin: 0 auto;
    }
    .turnova-dash-header {
      display: flex; align-items: center; justify-content: space-between;
      padding-bottom: 24px; margin-bottom: 32px;
      border-bottom: 0.5px solid #1F2937;
    }
    .turnova-dash-brand { display: flex; align-items: center; gap: 14px; }
    .turnova-dash-brand svg { display: block; }
    .turnova-dash-brand .name {
      font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
      color: #F1F5F9; line-height: 1;
    }
    .turnova-dash-brand .name .o { color: #F59E0B; font-weight: 600; }
    .turnova-dash-brand .by {
      display: block; font-size: 10px; letter-spacing: 0.22em;
      color: #64748B; text-transform: uppercase; margin-top: 4px;
    }
    .turnova-welcome { margin-bottom: 36px; }
    .turnova-welcome h1 {
      font-size: 32px; font-weight: 700; letter-spacing: -0.02em;
      color: #F1F5F9; margin-bottom: 8px;
    }
    .turnova-welcome p { font-size: 15px; color: #94A3B8; line-height: 1.5; }
    .turnova-welcome .wave {
      display: inline-block; animation: wave 1.4s ease-in-out;
      transform-origin: 70% 70%;
    }
    @keyframes wave {
      0%, 100% { transform: rotate(0); }
      25% { transform: rotate(20deg); }
      75% { transform: rotate(-12deg); }
    }
    .turnova-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .turnova-stat {
      background: rgba(17, 25, 34, 0.6);
      border: 0.5px solid #1F2937;
      border-radius: 12px;
      padding: 20px;
    }
    .turnova-stat .label {
      font-size: 10px; letter-spacing: 0.18em;
      text-transform: uppercase; color: #64748B;
      margin-bottom: 8px; font-weight: 500;
    }
    .turnova-stat .value {
      font-size: 22px; font-weight: 600;
      color: #F1F5F9; letter-spacing: -0.01em;
    }
    .turnova-stat .value.purple { color: #A78BFA; }
    .turnova-stat .value.amber { color: #F59E0B; }
    .turnova-stat .value.green { color: #22C55E; }
    .turnova-stat .sub { font-size: 12px; color: #94A3B8; margin-top: 4px; }
    .turnova-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .turnova-action-card {
      background: rgba(17, 25, 34, 0.6);
      border: 0.5px solid #1F2937;
      border-radius: 12px;
      padding: 24px;
      text-align: left;
      cursor: pointer;
      transition: border-color .2s, transform .15s, box-shadow .2s;
      display: flex; flex-direction: column;
    }
    .turnova-action-card:hover {
      border-color: rgba(167, 139, 250, 0.4);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(167, 139, 250, 0.1);
    }
    .turnova-action-card .icon {
      width: 40px; height: 40px;
      border-radius: 8px;
      background: rgba(167, 139, 250, 0.1);
      border: 0.5px solid rgba(167, 139, 250, 0.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; margin-bottom: 14px;
    }
    .turnova-action-card h3 {
      font-size: 15px; font-weight: 600;
      color: #F1F5F9; margin-bottom: 6px;
      letter-spacing: -0.01em;
    }
    .turnova-action-card p {
      font-size: 13px; color: #94A3B8;
      line-height: 1.5; margin-bottom: 12px; flex: 1;
    }
    .turnova-action-card .cta {
      font-size: 12px; color: #A78BFA;
      letter-spacing: 0.04em; font-weight: 500;
    }
    .turnova-info-box {
      background: rgba(167, 139, 250, 0.04);
      border: 0.5px solid rgba(167, 139, 250, 0.15);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 24px;
      font-size: 13px; line-height: 1.6; color: #94A3B8;
    }
    .turnova-info-box strong { color: #F1F5F9; }
    .turnova-info-box code { color: #C4B5FD; background: rgba(167,139,250,0.08); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
    .turnova-user-chip {
      display: inline-flex; align-items: center; gap: 10px;
      padding: 7px 14px;
      background: rgba(167, 139, 250, 0.08);
      border: 0.5px solid rgba(167, 139, 250, 0.3);
      border-radius: 8px;
      font-size: 12px; color: #C4B5FD;
      cursor: pointer;
      transition: background .2s, border-color .2s;
      position: relative;
    }
    .turnova-user-chip:hover { background: rgba(167, 139, 250, 0.15); border-color: rgba(167, 139, 250, 0.5); }
    .turnova-user-chip .dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #22C55E;
      box-shadow: 0 0 6px #22C55E;
    }
    .turnova-user-chip.expiring .dot { background: #F59E0B; box-shadow: 0 0 6px #F59E0B; }
    .turnova-user-menu {
      position: absolute; top: calc(100% + 6px); right: 0;
      background: #0E1521;
      border: 0.5px solid #1F2937;
      border-radius: 10px;
      padding: 8px;
      min-width: 240px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      z-index: 100;
      display: none;
    }
    .turnova-user-menu.open { display: block; }
    .turnova-user-menu button {
      display: block; width: 100%; text-align: left;
      padding: 9px 12px;
      background: transparent; border: none;
      color: #F1F5F9; font-size: 13px;
      font-family: inherit;
      cursor: pointer; border-radius: 6px;
      transition: background .15s, color .15s;
    }
    .turnova-user-menu button:hover { background: rgba(167, 139, 250, 0.1); color: #C4B5FD; }
    .turnova-user-menu .menu-info {
      padding: 10px 12px; border-bottom: 0.5px solid #1F2937;
      margin-bottom: 6px;
    }
    .turnova-user-menu .menu-info .nm { font-size: 14px; color: #F1F5F9; font-weight: 600; }
    .turnova-user-menu .menu-info .rl { font-size: 11px; color: #94A3B8; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; }
    .turnova-user-menu .menu-info .tn { font-size: 12px; color: #64748B; margin-top: 6px; }
    .turnova-user-menu .menu-info .lic { font-size: 11px; color: #94A3B8; margin-top: 6px; }
    .turnova-user-menu .menu-info .lic.green { color: #22C55E; }
    .turnova-user-menu .menu-info .lic.amber { color: #FCD34D; }
    .turnova-user-menu .menu-info .lic.red { color: #EF4444; }
    .turnova-version {
      position: fixed; bottom: 16px; left: 50%;
      transform: translateX(-50%);
      font-size: 10px; color: #475569;
      letter-spacing: 2px; z-index: 1;
    }
    `;
    const style = document.createElement('style');
    style.id = 'turnova-auth-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── SVG LOGO ──────────────────────────────────────────────
  const LOGO_SVG = `
    <svg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-label="Turnova by Pyralis">
      <rect x="3" y="3" width="54" height="54" rx="13" fill="#0A0F14" stroke="#1F2937" stroke-width="0.8"/>
      <path d="M14 14 L46 14 M30 14 L30 46" fill="none" stroke="#F1F5F9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="40" cy="34" r="9" fill="none" stroke="#F59E0B" stroke-width="0.6" opacity="0.4"/>
      <circle cx="40" cy="34" r="4" fill="#F59E0B"/>
      <circle cx="40" cy="34" r="1.8" fill="#FEF3C7"/>
    </svg>`;

  const LOGO_SVG_SMALL = `
    <svg width="40" height="40" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-label="Turnova">
      <rect x="3" y="3" width="54" height="54" rx="13" fill="#0A0F14" stroke="#1F2937" stroke-width="0.8"/>
      <path d="M14 14 L46 14 M30 14 L30 46" fill="none" stroke="#F1F5F9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="40" cy="34" r="9" fill="none" stroke="#F59E0B" stroke-width="0.6" opacity="0.4"/>
      <circle cx="40" cy="34" r="4" fill="#F59E0B"/>
      <circle cx="40" cy="34" r="1.8" fill="#FEF3C7"/>
    </svg>`;

  // ── PANTALLA: LOGIN ──────────────────────────────────────
  function renderLoginScreen() {
    removeDashboard();
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

        <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #64748B;">
          ¿Olvidaste tu PIN? <a href="mailto:hola@pyralis.ar?subject=Reset%20PIN%20Turnova" style="color: #A78BFA;">Pedir reset</a>
        </div>
      </div>
      <div class="turnova-version">TURNOVA · v1.0 · 2026</div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('turnova-login-form').addEventListener('submit', handleLogin);
    setTimeout(() => document.getElementById('turnova-user').focus(), 100);
  }

  // ── PANTALLA: PAYWALL ─────────────────────────────────────
  function renderPaywall(nombre) {
    removeDashboard();
    let overlay = document.getElementById('turnova-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'turnova-overlay';
    overlay.className = 'turnova-overlay';
    overlay.innerHTML = `
      <div class="turnova-card">
        <div class="turnova-paywall-icon">⚠️</div>
        <div class="turnova-paywall-title">Tu licencia expiró</div>
        <div class="turnova-paywall-msg">
          Hola ${escapeHtml(nombre || '')}.<br>
          Tu acceso a Turnova no está vigente. Contactanos para renovar.
        </div>
        <a href="mailto:hola@pyralis.ar?subject=Renovar%20licencia%20Turnova"
           style="display:block; text-decoration:none;">
          <button class="turnova-btn-primary" type="button">Renovar licencia</button>
        </a>
        <div style="margin-top:14px; text-align:center;">
          <button class="turnova-btn-ghost" type="button" onclick="window.TurnovaAuth.logout()">
            ← Cerrar sesión
          </button>
        </div>
      </div>
      <div class="turnova-version">TURNOVA · v1.0 · 2026</div>
    `;
    document.body.appendChild(overlay);
  }

  function hideOverlay() {
    const overlay = document.getElementById('turnova-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  // ── HANDLER LOGIN ─────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('turnova-submit');
    const errEl = document.getElementById('turnova-error');
    errEl.classList.remove('visible');
    btn.disabled = true;
    btn.textContent = 'Verificando…';

    try {
      const username = document.getElementById('turnova-user').value.trim().toUpperCase();
      const pin = document.getElementById('turnova-pin').value.trim();
      if (!username || !pin) throw new Error('Completá usuario y PIN.');
      if (!/^\d{4,6}$/.test(pin)) throw new Error('El PIN debe ser de 4 a 6 dígitos.');

      const userRows = await sbRpc('verificar_pin_turnova', { p_username: username, p_pin: pin });
      if (!userRows || userRows.length === 0) {
        throw new Error('Usuario o PIN incorrecto, o no tenés acceso a Turnova.');
      }
      const user = userRows[0];
      // rol_turnova viene del perfil turnova.profiles; rol es el rol Lumen general
      if (user.rol_turnova) user.rol = user.rol_turnova;

      const licRows = await sbRpc('licencia_turnova_activa', { p_usuario_id: user.id });
      const lic = (licRows && licRows[0]) || { vigente: false, plan: null, dias_restantes: 0 };

      currentUser = user;
      currentLicencia = lic;
      saveSession(user, lic);

      if (!lic.vigente) {
        renderPaywall(user.nombre);
        return;
      }

      onLoginSuccess();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.add('visible');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar a Turnova';
    }
  }

  function onLoginSuccess() {
    hideOverlay();
    document.body.style.overflow = '';
    renderDashboard();
    document.dispatchEvent(new CustomEvent('turnova:auth:ready', {
      detail: { user: currentUser, licencia: currentLicencia }
    }));
  }

  function removeDashboard() {
    const old = document.getElementById('turnova-dashboard');
    if (old) old.remove();
  }

  function renderDashboard() {
    removeDashboard();

    const dias = currentLicencia ? (currentLicencia.dias_restantes || 0) : 0;
    const plan = currentLicencia ? currentLicencia.plan : '';
    const planLabel = plan === 'unlimited' ? 'Unlimited'
      : (plan === 'pro' ? 'Pro' : (plan === 'trial' ? 'Trial' : (plan || '—')));
    const isExpiring = dias <= 7 && plan !== 'unlimited';
    const licClass = plan === 'unlimited' ? 'green' : (isExpiring ? 'amber' : 'green');
    const licText = plan === 'unlimited' ? 'Licencia permanente' : (dias + ' días · ' + planLabel);

    const tenantNombre = currentUser.tenant_nombre || 'Centro Médico';
    const firstName = (currentUser.nombre || currentUser.username || '').split(' ')[0];

    const dash = document.createElement('div');
    dash.id = 'turnova-dashboard';
    dash.className = 'turnova-dash-wrap';
    dash.innerHTML = `
      <div class="turnova-dash">
        <header class="turnova-dash-header">
          <div class="turnova-dash-brand">
            ${LOGO_SVG_SMALL}
            <div>
              <div class="name">Turn<span class="o">o</span>va</div>
              <div class="by">By Pyralis</div>
            </div>
          </div>
          <div style="position: relative; display: inline-block;">
            <div class="turnova-user-chip ${isExpiring ? 'expiring' : ''}" id="turnova-chip">
              <span class="dot"></span>
              <span>${escapeHtml(currentUser.nombre || currentUser.username)}</span>
            </div>
            <div class="turnova-user-menu" id="turnova-menu">
              <div class="menu-info">
                <div class="nm">${escapeHtml(currentUser.nombre || currentUser.username)}</div>
                <div class="rl">${escapeHtml(currentUser.rol || 'usuario')} · ${escapeHtml(currentUser.username)}</div>
                <div class="tn">${escapeHtml(tenantNombre)}</div>
                <div class="lic ${licClass}">${licText}</div>
              </div>
              <button id="turnova-menu-logout">Cerrar sesión</button>
            </div>
          </div>
        </header>

        <section class="turnova-welcome">
          <h1>Hola, ${escapeHtml(firstName)} <span class="wave">👋</span></h1>
          <p>Bienvenido a Turnova — turnos médicos asignados con IA. Esta es tu central de control.</p>
        </section>

        <section class="turnova-stats">
          <div class="turnova-stat">
            <div class="label">Tenant</div>
            <div class="value">${escapeHtml(tenantNombre)}</div>
            <div class="sub">Centro activo</div>
          </div>
          <div class="turnova-stat">
            <div class="label">Tu rol</div>
            <div class="value purple">${escapeHtml((currentUser.rol || 'usuario').toUpperCase())}</div>
            <div class="sub">${escapeHtml(currentUser.username)}</div>
          </div>
          <div class="turnova-stat">
            <div class="label">Licencia</div>
            <div class="value ${plan === 'unlimited' ? 'green' : (isExpiring ? 'amber' : 'green')}">${planLabel}</div>
            <div class="sub">${plan === 'unlimited' ? 'Acceso permanente' : (dias + ' días restantes')}</div>
          </div>
          <div class="turnova-stat">
            <div class="label">Estado del sistema</div>
            <div class="value green">● Operativo</div>
            <div class="sub">Supabase + IA conectados</div>
          </div>
        </section>

        <section class="turnova-actions">
          <div class="turnova-action-card" id="action-app">
            <div class="icon">⚡</div>
            <h3>Abrir app Turnova</h3>
            <p>Acceso al dashboard operativo: subir pedidos médicos, asignar turnos con IA, gestionar cupos y obras sociales.</p>
            <span class="cta">Entrar al sistema operativo →</span>
          </div>
          <div class="turnova-action-card" id="action-pedidos">
            <div class="icon">📋</div>
            <h3>Pedidos médicos</h3>
            <p>Subí pedidos por foto o PDF. La IA Claude Vision extrae OS, prácticas y datos del paciente con 95%+ de precisión.</p>
            <span class="cta">Procesar pedidos →</span>
          </div>
          <div class="turnova-action-card" id="action-cupos">
            <div class="icon">📊</div>
            <h3>Cupos & Obras Sociales</h3>
            <p>Configurá la matriz semanal de cupos por obra social y práctica. VIP ≤72hs vs cupos semanales para el resto.</p>
            <span class="cta">Gestionar cupos →</span>
          </div>
          <div class="turnova-action-card" id="action-landing">
            <div class="icon">🌐</div>
            <h3>Sitio público</h3>
            <p>Volver a la landing pública de Turnova: pricing, demo, casos de uso y solicitud de acceso para nuevos clientes.</p>
            <span class="cta">Ver landing →</span>
          </div>
        </section>

        <div class="turnova-info-box">
          <strong>Beta privada activa.</strong> El sistema operativo completo (Next.js + Supabase Lumen) está en migración final.
          Mientras tanto, esta sesión confirma tu identidad y licencia vigente.
          Próximamente: deploy completo a <code>app.turnova.health</code>.
        </div>
      </div>
      <div class="turnova-version">TURNOVA · v1.0 · 2026</div>
    `;
    document.body.appendChild(dash);

    const chip = document.getElementById('turnova-chip');
    const menu = document.getElementById('turnova-menu');
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click', () => menu.classList.remove('open'));

    document.getElementById('turnova-menu-logout').addEventListener('click', logout);

    const openOperativo = () => {
      alert('El sistema operativo Next.js completo está en deploy final. Mientras tanto corre en localhost:3000 (modo desarrollo).\n\nTu sesión Turnova está confirmada como ' + currentUser.username + ' (' + (currentUser.rol || 'usuario') + ') con licencia ' + planLabel + '.');
    };
    document.getElementById('action-app').addEventListener('click', openOperativo);
    document.getElementById('action-pedidos').addEventListener('click', openOperativo);
    document.getElementById('action-cupos').addEventListener('click', openOperativo);
    document.getElementById('action-landing').addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }

  function logout() {
    clearSession();
    currentUser = null;
    currentLicencia = null;
    removeDashboard();
    renderLoginScreen();
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function init() {
    injectStyles();
    document.body.style.overflow = 'hidden';

    const saved = loadSession();
    if (!saved) {
      renderLoginScreen();
      return;
    }

    currentUser = saved.user;
    try {
      const licRows = await sbRpc('licencia_turnova_activa', { p_usuario_id: currentUser.id });
      currentLicencia = (licRows && licRows[0]) || { vigente: false, plan: null, dias_restantes: 0 };
      saveSession(currentUser, currentLicencia);
    } catch (e) {
      currentLicencia = saved.licencia || { vigente: false };
    }

    if (!currentLicencia.vigente) {
      renderPaywall(currentUser.nombre);
      return;
    }
    onLoginSuccess();
  }

  window.TurnovaAuth = {
    init: init,
    logout: logout,
    getCurrentUser: () => currentUser,
    getLicencia: () => currentLicencia
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
