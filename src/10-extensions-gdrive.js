  // ============================================================================
  // 18. EXTENSIONS GOODNOTES : DOSSIERS, IMAGES, FENÊTRE DE ZOOM & GOOGLE DRIVE
  // ============================================================================

  function openMoveNotebookModal(nbOrItems) {
    const modal = document.getElementById('modalMoveNotebook');
    const select = document.getElementById('selectTargetFolder');
    if (!modal || !select || !nbOrItems) return;
    const items = Array.isArray(nbOrItems)
      ? nbOrItems
      : (nbOrItems.type ? [nbOrItems] : [{ type: 'nb', id: nbOrItems.id }]);
    state.movingItems = items;
    state.movingNotebookId = items.length === 1 && items[0].type === 'nb' ? items[0].id : null;
    const movingFolderIds = new Set(items.filter((x) => x.type === 'fld').map((x) => x.id));
    select.innerHTML = `<option value="">📁 Documents (Racine)</option>`;
    (state.folders || []).filter((f) => !f.trashedAt).forEach((f) => {
      for (const fid of movingFolderIds) {
        if (isFolderDescendant(f.id, fid)) return;
      }
      const pathLabel = getFolderPath(f.id).map((x) => x.name).join(' › ');
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `📁 ${pathLabel}`;
      if (items.length === 1 && items[0].type === 'nb') {
        const nb = state.notebooks.find((n) => n.id === items[0].id);
        if (nb && (nb.folderId || '') === f.id) opt.selected = true;
      } else if (items.length === 1 && items[0].type === 'fld') {
        const fld = (state.folders || []).find((x) => x.id === items[0].id);
        if (fld && (fld.parentId || '') === f.id) opt.selected = true;
      }
      select.appendChild(opt);
    });
    modal.classList.remove('hidden');
  }

  function insertImageToActivePage(dataUrl, naturalW = 320, naturalH = 220) {
    const page = getActivePage();
    if (!page || !dataUrl) return;
    const rect = dom.canvasViewport.getBoundingClientRect();
    const center = screenToWorld(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
    const maxW = 380;
    const scale = naturalW > maxW ? maxW / naturalW : 1;
    const w = Math.max(80, Math.round(naturalW * scale));
    const h = Math.max(60, Math.round(naturalH * scale));
    if (!Array.isArray(page.images)) page.images = [];
    pushHistorySnapshot(page);
    page.images.push({
      id: createUid('img'),
      x: Math.round(center.x - w * 0.5),
      y: Math.round(center.y - h * 0.5),
      width: w,
      height: h,
      src: dataUrl,
      origSrc: dataUrl
    });
    renderWorldTextCards();
    scheduleSaveActivePage(page);
    showToast('Image ajoutée sur la page !');
  }

  function readFileAsImageAndInsert(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result;
      const img = new Image();
      img.onload = () => insertImageToActivePage(src, img.naturalWidth || 320, img.naturalHeight || 220);
      img.onerror = () => insertImageToActivePage(src, 320, 220);
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  // --- Sauvegarde & Restauration Google Drive (Local Drive Desktop + Drive API v3) ---
  function buildFullBackupPayload() {
    const allPages = [];
    for (const list of state.pagesByNotebook.values()) {
      for (const p of list) allPages.push(p);
    }
    return {
      format: 'plume-studio-goodnotes-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      folders: state.folders || [],
      notebooks: state.notebooks || [],
      pages: allPages,
      // Fiches de révision (images + planification) : champ facultatif, ignoré par les anciennes versions
      flashcards: (typeof flashcardStore !== 'undefined' && Array.isArray(flashcardStore.cards)) ? flashcardStore.cards : []
    };
  }

  async function restoreFullBackupPayload(data) {
    if (!data || !Array.isArray(data.notebooks) || !Array.isArray(data.pages)) {
      throw new Error('Format de sauvegarde invalide.');
    }
    if (Array.isArray(data.folders)) {
      state.folders = data.folders;
      await db.saveFolders(state.folders);
    }
    for (const nb of data.notebooks) await db.saveNotebook(nb);
    for (const pg of data.pages) await db.savePage(pg);
    if (Array.isArray(data.flashcards) && data.flashcards.length > 0) {
      for (const card of data.flashcards) { if (card && card.id) await db.saveFlashcard(card); }
      if (typeof reloadFlashcards === 'function') await reloadFlashcards();
    }
    await loadFromIndexedDB();
    showToast('Sauvegarde restaurée avec succès !');
  }

  // --- Réseau : détection de la connexion et indicateur « hors connexion » ---
  // InkFlow fonctionne hors ligne ; seules les fonctions Google Drive ont besoin du réseau.
  // L'indicateur reste discret : visible hors connexion quand un compte Google est relié,
  // et toujours quand une action est refusée faute de connexion.
  const netState = {
    online: !(typeof navigator !== 'undefined' && navigator && navigator.onLine === false),
    unreachable: false,
    alertUntil: 0,
    alertTimer: null,
    recoveredTimer: null,
    probeTimer: null,
    listeners: new Set()
  };

  function isNetworkAvailable() {
    return netState.online && !netState.unreachable;
  }

  function isNetworkFailure(err) {
    if (!err) return false;
    if (err.code === 'NETWORK') return true;
    const msg = String((err && err.message) || err);
    if (/^Réseau indisponible/i.test(msg)) return true;
    return err.name === 'TypeError' && /fetch|network|load failed/i.test(msg);
  }

  function createNetworkError(actionLabel) {
    const err = new Error(`${actionLabel || 'Cette action'} nécessite une connexion Internet.`);
    err.code = 'NETWORK';
    err.handled = true;
    return err;
  }

  function onNetworkChange(fn) {
    if (typeof fn === 'function') netState.listeners.add(fn);
  }

  function shouldShowPersistentOfflinePill() {
    return Boolean(state.gdriveRefreshToken || state.gdriveAccessToken);
  }

  function renderNetworkIndicator(mode = null, detail = '') {
    const pill = document.getElementById('netStatusPill');
    if (!pill) return;
    const title = document.getElementById('netStatusTitle');
    const det = document.getElementById('netStatusDetail');
    const available = isNetworkAvailable();
    const now = Date.now();
    if (mode === 'alert') {
      clearTimeout(netState.alertTimer);
      netState.alertUntil = now + 5000;
      netState.alertTimer = setTimeout(() => {
        netState.alertUntil = 0;
        renderNetworkIndicator();
      }, 5000);
    }
    clearTimeout(netState.recoveredTimer);
    pill.classList.remove('is-alert', 'is-recovered', 'is-offline');

    if (mode === 'recovered') {
      netState.alertUntil = 0;
      pill.classList.remove('hidden');
      pill.classList.add('is-recovered');
      if (title) title.textContent = 'Connexion rétablie';
      if (det) det.textContent = '';
      netState.recoveredTimer = setTimeout(() => {
        pill.classList.remove('is-recovered');
        pill.classList.add('hidden');
      }, 2600);
      return;
    }

    const alerting = netState.alertUntil > now;
    if (available && !alerting) {
      pill.classList.add('hidden');
      return;
    }
    if (!alerting && !shouldShowPersistentOfflinePill()) {
      pill.classList.add('hidden');
      return;
    }
    pill.classList.remove('hidden');
    pill.classList.add('is-offline');
    if (title) title.textContent = netState.online ? 'Réseau injoignable' : 'Hors connexion';
    if (det) det.textContent = alerting ? detail || (det.textContent || '') : '';
    if (mode === 'alert') {
      void pill.offsetWidth; // relance l'animation d'alerte à chaque refus
      pill.classList.add('is-alert');
    } else if (alerting) {
      pill.classList.add('is-alert');
    }
  }

  function syncNetworkDependentControls() {
    const off = !isNetworkAvailable();
    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('[data-needs-network]').forEach((el) => {
        el.classList.toggle('needs-network-off', off);
        if (off) el.setAttribute('aria-disabled', 'true');
        else if (typeof el.removeAttribute === 'function') el.removeAttribute('aria-disabled');
      });
    }
    ['gdriveOfflineBanner', 'drivePickerOfflineBanner'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !off);
    });
  }

  function scheduleNetworkProbe() {
    clearTimeout(netState.probeTimer);
    if (!netState.online || !netState.unreachable || typeof fetch !== 'function') return;
    netState.probeTimer = setTimeout(async () => {
      try {
        // Réponse opaque : seule compte la joignabilité, pas le contenu
        await fetch('https://www.googleapis.com/drive/v3/about', { method: 'GET', mode: 'no-cors', cache: 'no-store' });
        setNetworkState({ unreachable: false });
      } catch (_) {
        scheduleNetworkProbe();
      }
    }, 15000);
  }

  function setNetworkState(next = {}) {
    const wasAvailable = isNetworkAvailable();
    if (typeof next.online === 'boolean') netState.online = next.online;
    if (typeof next.unreachable === 'boolean') netState.unreachable = next.unreachable;
    if (!netState.online) netState.unreachable = false;
    const available = isNetworkAvailable();
    if (wasAvailable !== available) {
      renderNetworkIndicator(available ? 'recovered' : null);
      netState.listeners.forEach((fn) => {
        try { fn(available); } catch (_) {}
      });
    }
    syncNetworkDependentControls();
    scheduleNetworkProbe();
    return available;
  }

  function notifyNetworkRequired(actionLabel) {
    const label = actionLabel || 'Cette action';
    renderNetworkIndicator('alert', `${label} impossible`);
    showToast(`${label} : connexion Internet requise.`, 'error', 'network-required');
  }

  function requireNetwork(actionLabel) {
    if (isNetworkAvailable()) return true;
    notifyNetworkRequired(actionLabel);
    return false;
  }

  function reportNetworkFailure(actionLabel) {
    if (netState.online) setNetworkState({ unreachable: true });
    notifyNetworkRequired(actionLabel);
  }

  function initNetworkIndicator() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', () => setNetworkState({ online: true, unreachable: false }));
      window.addEventListener('offline', () => setNetworkState({ online: false }));
    }
    renderNetworkIndicator();
    syncNetworkDependentControls();
  }

  // --- Compte Google : liaison OAuth « application de bureau » (code + PKCE) ---
  // Sous Tauri, la redirection loopback et l'échange du code passent par Rust
  // (`gdrive_oauth_*`). Dans un navigateur servi en localhost, une fenêtre
  // surgissante revient sur `oauth-callback.html` et l'échange se fait en JS.
  const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
  const GDRIVE_API = 'https://www.googleapis.com/drive/v3';
  const GDRIVE_KEYS = {
    clientId: 'inkflow_gdrive_client_id',
    clientSecret: 'inkflow_gdrive_client_secret',
    token: 'inkflow_gdrive_token',
    tokenExp: 'inkflow_gdrive_token_exp',
    refresh: 'inkflow_gdrive_refresh',
    account: 'inkflow_gdrive_account',
    auto: 'inkflow_gdrive_auto'
  };
  let gdriveRefreshPromise = null;
  let gdriveBrowserLinkAbort = null;
  // Incrémenté à chaque liaison ou déliaison : un renouvellement lancé avant est alors ignoré
  let gdriveSessionGen = 0;

  function readLocalSetting(key) {
    try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }

  function writeLocalSetting(key, value) {
    try {
      if (value === null || value === undefined || value === '') {
        if (typeof localStorage.removeItem === 'function') localStorage.removeItem(key);
        else localStorage.setItem(key, '');
      } else {
        localStorage.setItem(key, String(value));
      }
    } catch (_) {}
  }

  function hasTauriInvoke() {
    return typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function';
  }

  function loadGdriveSession() {
    state.gdriveClientId = readLocalSetting(GDRIVE_KEYS.clientId);
    state.gdriveClientSecret = readLocalSetting(GDRIVE_KEYS.clientSecret);
    state.gdriveAccessToken = readLocalSetting(GDRIVE_KEYS.token);
    state.gdriveTokenExpiresAt = Number(readLocalSetting(GDRIVE_KEYS.tokenExp)) || 0;
    state.gdriveRefreshToken = readLocalSetting(GDRIVE_KEYS.refresh);
    state.gdriveAutoBackup = readLocalSetting(GDRIVE_KEYS.auto) === 'true';
    try {
      state.gdriveAccount = JSON.parse(readLocalSetting(GDRIVE_KEYS.account) || 'null');
    } catch (_) {
      state.gdriveAccount = null;
    }
  }

  function isGdriveLinked() {
    return Boolean(state.gdriveRefreshToken || state.gdriveAccessToken);
  }

  function storeGdriveTokens(tok) {
    if (!tok || !tok.access_token) throw new Error('Réponse Google sans jeton d’accès.');
    const ttl = Number(tok.expires_in) > 0 ? Number(tok.expires_in) : 3600;
    state.gdriveAccessToken = String(tok.access_token);
    state.gdriveTokenExpiresAt = Date.now() + Math.max(60, ttl - 60) * 1000;
    if (tok.refresh_token) state.gdriveRefreshToken = String(tok.refresh_token);
    writeLocalSetting(GDRIVE_KEYS.token, state.gdriveAccessToken);
    writeLocalSetting(GDRIVE_KEYS.tokenExp, state.gdriveTokenExpiresAt);
    writeLocalSetting(GDRIVE_KEYS.refresh, state.gdriveRefreshToken);
  }

  function clearGdriveSession() {
    gdriveSessionGen++;
    state.gdriveAccessToken = '';
    state.gdriveTokenExpiresAt = 0;
    state.gdriveRefreshToken = '';
    state.gdriveAccount = null;
    gdriveRefreshPromise = null;
    [GDRIVE_KEYS.token, GDRIVE_KEYS.tokenExp, GDRIVE_KEYS.refresh, GDRIVE_KEYS.account].forEach((k) => writeLocalSetting(k, ''));
  }

  function createGdriveAuthError(message) {
    const err = new Error(message);
    err.code = 'GDRIVE_AUTH';
    return err;
  }

  function base64UrlEncodeBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomUrlSafeString(byteLength = 48) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64UrlEncodeBytes(bytes);
  }

  async function computePkceChallenge(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64UrlEncodeBytes(new Uint8Array(digest));
  }

  function buildGdriveAuthUrl({ clientId, redirectUri, codeChallenge, stateParam, scope = GDRIVE_SCOPE }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: stateParam,
      access_type: 'offline',
      prompt: 'consent'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async function gdriveTokenRequest(params) {
    let res;
    try {
      res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString()
      });
    } catch (_) {
      const err = new Error('Réseau indisponible : Google est injoignable.');
      err.code = 'NETWORK';
      throw err;
    }
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const code = data.error || res.status;
      const desc = data.error_description ? ` : ${data.error_description}` : '';
      throw new Error(`Google a refusé la demande (${code}${desc})`);
    }
    return data;
  }

  async function gdriveLinkViaBrowserPopup(clientId, clientSecret) {
    const loc = window.location || {};
    const host = String(loc.hostname || '').toLowerCase();
    if (!/^https?:$/.test(loc.protocol || '') || !['localhost', '127.0.0.1', '[::1]'].includes(host)) {
      throw new Error('Dans un navigateur, la liaison ne fonctionne que depuis http://localhost. Utilisez l’application InkFlow pour Windows.');
    }
    const redirectUri = new URL('oauth-callback.html', loc.href).href;
    const verifier = randomUrlSafeString(48);
    const codeChallenge = await computePkceChallenge(verifier);
    const stateParam = `inkflow-${randomUrlSafeString(18)}`;
    const authUrl = buildGdriveAuthUrl({ clientId, redirectUri, codeChallenge, stateParam });
    const popup = window.open(authUrl, 'inkflow_gdrive_auth', 'width=520,height=680');
    if (!popup) throw new Error('Fenêtre de connexion bloquée : autorisez les fenêtres surgissantes pour localhost.');

    const code = await new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const finish = (fn, value) => {
        clearInterval(timer);
        gdriveBrowserLinkAbort = null;
        try { popup.close(); } catch (_) {}
        fn(value);
      };
      const timer = setInterval(() => {
        if (popup.closed) {
          finish(reject, new Error('Liaison annulée.'));
          return;
        }
        if (Date.now() - startedAt > 300000) {
          finish(reject, new Error('Délai de connexion dépassé. Réessayez.'));
          return;
        }
        let href = '';
        try { href = String(popup.location.href || ''); } catch (_) { return; }
        const cleanRedirect = redirectUri.replace(/\.html$/, '');
        if (!href.startsWith(redirectUri) && !href.startsWith(`${cleanRedirect}?`)) return;
        const params = new URL(href).searchParams;
        if (params.get('state') !== stateParam) {
          finish(reject, new Error('Réponse Google invalide (state).'));
        } else if (params.get('error')) {
          const e = params.get('error');
          finish(reject, new Error(e === 'access_denied' ? 'Connexion refusée dans Google.' : `Erreur Google : ${e}`));
        } else if (params.get('code')) {
          finish(resolve, params.get('code'));
        }
      }, 300);
      gdriveBrowserLinkAbort = () => finish(reject, new Error('Liaison annulée.'));
    });

    const body = {
      code,
      client_id: clientId,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    };
    if (clientSecret) body.client_secret = clientSecret;
    return gdriveTokenRequest(body);
  }

  function readGdriveCredentialInputs() {
    const idInput = document.getElementById('inputGdriveClientId');
    const secretInput = document.getElementById('inputGdriveClientSecret');
    const id = String((idInput && idInput.value) || '').trim();
    const secret = String((secretInput && secretInput.value) || '').trim();
    if (id !== state.gdriveClientId) {
      state.gdriveClientId = id;
      writeLocalSetting(GDRIVE_KEYS.clientId, id);
    }
    if (secret !== state.gdriveClientSecret) {
      state.gdriveClientSecret = secret;
      writeLocalSetting(GDRIVE_KEYS.clientSecret, secret);
    }
  }

  async function gdriveLinkAccount() {
    if (state.gdriveLinking) return;
    if (!requireNetwork('Relier un compte Google')) return;
    readGdriveCredentialInputs();
    if (!state.gdriveClientId) {
      const details = document.getElementById('gdriveSetupDetails');
      if (details) details.open = true;
      const input = document.getElementById('inputGdriveClientId');
      if (input) input.focus();
      showToast('Renseignez d’abord l’ID client OAuth (une seule fois).', 'error');
      return;
    }
    state.gdriveLinking = true;
    renderGdriveAccountUi();
    try {
      let tok;
      if (hasTauriInvoke()) {
        tok = await window.__TAURI__.core.invoke('gdrive_oauth_link', {
          clientId: state.gdriveClientId,
          clientSecret: state.gdriveClientSecret || null,
          scope: GDRIVE_SCOPE
        });
      } else {
        tok = await gdriveLinkViaBrowserPopup(state.gdriveClientId, state.gdriveClientSecret);
      }
      gdriveSessionGen++;
      storeGdriveTokens(tok);
      state.gdriveLinking = false;
      renderGdriveAccountUi();
      renderNetworkIndicator();
      showToast('Compte Google relié.');
      try { await refreshGdriveAccountInfo(); } catch (_) {}
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (isNetworkFailure(err)) reportNetworkFailure('Relier un compte Google');
      else if (!/annulée/i.test(msg)) showToast(msg, 'error');
    } finally {
      state.gdriveLinking = false;
      gdriveBrowserLinkAbort = null;
      renderGdriveAccountUi();
    }
  }

  async function gdriveCancelLink() {
    if (gdriveBrowserLinkAbort) gdriveBrowserLinkAbort();
    if (hasTauriInvoke()) {
      try { await window.__TAURI__.core.invoke('gdrive_oauth_cancel'); } catch (_) {}
    }
  }

  function gdriveUseManualToken() {
    const input = document.getElementById('inputGdriveManualToken');
    const val = String((input && input.value) || '').trim();
    if (!/^ya29\./.test(val)) {
      showToast('Collez un jeton d’accès Google (il commence par ya29.).', 'error');
      return;
    }
    clearGdriveSession();
    storeGdriveTokens({ access_token: val, expires_in: 3600 });
    if (input) input.value = '';
    renderGdriveAccountUi();
    renderNetworkIndicator();
    showToast('Jeton temporaire enregistré (valable environ une heure).');
    refreshGdriveAccountInfo().catch(() => {});
  }

  async function getGdriveAccessToken(forceRefresh = false) {
    const fresh = state.gdriveAccessToken && (!state.gdriveTokenExpiresAt || Date.now() < state.gdriveTokenExpiresAt);
    if (!forceRefresh && fresh) return state.gdriveAccessToken;
    if (!state.gdriveRefreshToken) {
      // Jeton collé à la main ou ancien jeton : on laisse Google trancher (401 → déliaison)
      if (!forceRefresh && state.gdriveAccessToken) return state.gdriveAccessToken;
      clearGdriveSession();
      renderGdriveAccountUi();
      renderNetworkIndicator();
      throw createGdriveAuthError('La session Google a expiré. Reliez à nouveau votre compte.');
    }
    if (!gdriveRefreshPromise) {
      const gen = gdriveSessionGen;
      const stale = () => gen !== gdriveSessionGen;
      gdriveRefreshPromise = (async () => {
        try {
          let tok;
          if (hasTauriInvoke()) {
            tok = await window.__TAURI__.core.invoke('gdrive_oauth_refresh', {
              clientId: state.gdriveClientId,
              clientSecret: state.gdriveClientSecret || null,
              refreshToken: state.gdriveRefreshToken
            });
          } else {
            const body = { grant_type: 'refresh_token', refresh_token: state.gdriveRefreshToken, client_id: state.gdriveClientId };
            if (state.gdriveClientSecret) body.client_secret = state.gdriveClientSecret;
            tok = await gdriveTokenRequest(body);
          }
          if (stale()) throw createGdriveAuthError('Le compte Google a changé pendant l’opération.');
          storeGdriveTokens(tok);
          return state.gdriveAccessToken;
        } catch (err) {
          if (stale()) throw (err && err.code === 'GDRIVE_AUTH' ? err : createGdriveAuthError('Le compte Google a changé pendant l’opération.'));
          if (/invalid_grant/.test(String((err && err.message) || err))) {
            clearGdriveSession();
            renderGdriveAccountUi();
            throw createGdriveAuthError('Google a retiré l’accès à InkFlow. Reliez à nouveau votre compte.');
          }
          throw err;
        } finally {
          if (!stale()) gdriveRefreshPromise = null;
        }
      })();
    }
    return gdriveRefreshPromise;
  }

  async function gdriveFetch(url, options = {}, actionLabel = 'Google Drive', { quiet = false } = {}) {
    if (!isGdriveLinked()) throw createGdriveAuthError('Aucun compte Google relié.');
    const failNetwork = () => {
      if (quiet) {
        if (netState.online) setNetworkState({ unreachable: true });
      } else {
        reportNetworkFailure(actionLabel);
      }
      return createNetworkError(actionLabel);
    };
    if (!isNetworkAvailable()) {
      if (!quiet) notifyNetworkRequired(actionLabel);
      throw createNetworkError(actionLabel);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      let token;
      try {
        token = await getGdriveAccessToken(attempt > 0);
      } catch (err) {
        if (isNetworkFailure(err)) throw failNetwork();
        throw err;
      }
      let res;
      try {
        res = await fetch(url, {
          ...options,
          headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
        });
      } catch (_) {
        throw failNetwork();
      }
      if (netState.unreachable) setNetworkState({ unreachable: false });
      if (res.status === 401 && attempt === 0) continue;
      if (res.status === 401) {
        clearGdriveSession();
        renderGdriveAccountUi();
        throw createGdriveAuthError('Session Google expirée. Reliez à nouveau votre compte.');
      }
      if (!res.ok) {
        let detail = '';
        try {
          const j = await res.json();
          detail = (j && j.error && j.error.message) || '';
        } catch (_) {}
        throw new Error(`Google Drive (${res.status})${detail ? ` : ${detail}` : ''}`);
      }
      return res;
    }
    throw createGdriveAuthError('Session Google expirée. Reliez à nouveau votre compte.');
  }

  function reportGdriveError(err, fallbackLabel = 'Google Drive') {
    if (!err || err.handled) return;
    showToast(`${fallbackLabel} : ${(err && err.message) || err}`, 'error');
  }

  async function refreshGdriveAccountInfo() {
    const res = await gdriveFetch(`${GDRIVE_API}/about?fields=${encodeURIComponent('user(displayName,emailAddress,photoLink),storageQuota(limit,usage)')}`, {}, 'Compte Google');
    const data = await res.json();
    const user = data.user || {};
    const quota = data.storageQuota || {};
    state.gdriveAccount = {
      name: user.displayName || '',
      email: user.emailAddress || '',
      photo: user.photoLink || '',
      usage: Number(quota.usage) || 0,
      limit: Number(quota.limit) || 0
    };
    writeLocalSetting(GDRIVE_KEYS.account, JSON.stringify(state.gdriveAccount));
    renderGdriveAccountUi();
    return state.gdriveAccount;
  }

  async function gdriveUnlink() {
    const token = state.gdriveRefreshToken || state.gdriveAccessToken;
    clearGdriveSession();
    renderGdriveAccountUi();
    renderNetworkIndicator();
    showToast('Compte Google délié.');
    if (!token || !isNetworkAvailable()) return;
    try {
      if (hasTauriInvoke()) {
        await window.__TAURI__.core.invoke('gdrive_oauth_revoke', { token });
      } else {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }).toString()
        });
      }
    } catch (_) {
      // Révocation au mieux : le jeton local est déjà oublié
    }
  }

  function formatDriveBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '';
    const units = ['octets', 'Ko', 'Mo', 'Go', 'To'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    const digits = i === 0 || v >= 100 ? 0 : 1;
    return `${v.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} ${units[i]}`;
  }

  function formatDriveDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function updateGdriveStatusUi(text, connected = false) {
    const txt = document.getElementById('gdriveStatusText');
    const dot = document.getElementById('gdriveStatusDot');
    const banner = document.getElementById('gdriveStatusBanner');
    if (txt) txt.textContent = text;
    if (dot) dot.style.background = connected ? '#16a34a' : '#94a3b8';
    if (banner && banner.classList) banner.classList.toggle('is-connected', Boolean(connected));
  }

  function renderGdriveAccountUi() {
    const linked = isGdriveLinked();
    const linking = Boolean(state.gdriveLinking);
    const show = (id, visible) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !visible);
    };
    show('gdriveStateUnlinked', !linked && !linking);
    show('gdriveStateLinking', linking);
    show('gdriveStateLinked', linked && !linking);

    const acc = state.gdriveAccount || {};
    const label = acc.name || acc.email || 'Compte Google';
    const nameEl = document.getElementById('gdriveAccountName');
    const emailEl = document.getElementById('gdriveAccountEmail');
    if (nameEl) nameEl.textContent = state.gdriveRefreshToken ? label : `${label} (jeton temporaire)`;
    if (emailEl) emailEl.textContent = acc.name && acc.email ? acc.email : '';

    const avatar = document.getElementById('gdriveAccountAvatar');
    if (avatar) {
      const initial = (label.trim()[0] || 'G').toUpperCase();
      avatar.textContent = initial;
      if (acc.photo && typeof document.createElement === 'function') {
        const img = document.createElement('img');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => { avatar.textContent = initial; };
        img.src = acc.photo;
        avatar.textContent = '';
        avatar.appendChild(img);
      }
    }

    const quotaWrap = document.getElementById('gdriveQuotaWrap');
    if (quotaWrap) {
      const hasQuota = acc.limit > 0;
      quotaWrap.classList.toggle('hidden', !hasQuota);
      if (hasQuota) {
        const pct = Math.min(100, Math.round((acc.usage / acc.limit) * 100));
        const fill = document.getElementById('gdriveQuotaFill');
        if (fill) fill.style.width = `${pct}%`;
        const qt = document.getElementById('gdriveQuotaText');
        if (qt) qt.textContent = `${formatDriveBytes(acc.usage) || '0 Ko'} utilisés sur ${formatDriveBytes(acc.limit)}`;
      }
    }

    const setupState = document.getElementById('gdriveSetupState');
    if (setupState) setupState.textContent = state.gdriveClientId ? 'renseignés' : 'à renseigner une fois';

    const pickerAccount = document.getElementById('drivePickerAccount');
    if (pickerAccount) pickerAccount.textContent = acc.email || '';

    if (!state.gdriveLocalDirHandle) {
      if (linking) updateGdriveStatusUi('Connexion à Google en cours…', false);
      else if (linked) {
        const when = state.gdriveLastSyncAt
          ? ` · sauvegarde à ${new Date(state.gdriveLastSyncAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
          : '';
        updateGdriveStatusUi(`Relié à ${acc.email || 'Google Drive'}${when}`, true);
      } else {
        updateGdriveStatusUi('Aucun compte Google relié', false);
      }
    }
    syncNetworkDependentControls();
  }

  async function syncToLocalDriveFolderNow() {
    if (!state.gdriveLocalDirHandle) {
      showToast('Choisissez d’abord un dossier Google Drive local.');
      return;
    }
    try {
      const payload = JSON.stringify(buildFullBackupPayload());
      const latestHandle = await state.gdriveLocalDirHandle.getFileHandle('inkflow-backup-latest.plume.json', { create: true });
      const writable = await latestHandle.createWritable();
      await writable.write(payload);
      await writable.close();
      state.gdriveLastSyncAt = Date.now();
      const timeStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      updateGdriveStatusUi(`Dossier Drive synchronisé (${state.gdriveLocalDirHandle.name}) — Dernière sauvegarde à ${timeStr}`, true);
      showToast('Sauvegardé dans le dossier Google Drive !');
    } catch (err) {
      showToast(`Erreur sauvegarde dossier Drive : ${err.message || err}`);
    }
  }

  async function ensureGdriveBackupFolderId(actionLabel, fetchOpts = {}) {
    const q = encodeURIComponent("name='Inkflow Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'me' in owners");
    const listRes = await gdriveFetch(`${GDRIVE_API}/files?q=${q}&fields=files(id,name)`, {}, actionLabel, fetchOpts);
    const listData = await listRes.json();
    if (listData.files && listData.files.length > 0) return listData.files[0].id;

    const createRes = await gdriveFetch(`${GDRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Inkflow Backups', mimeType: 'application/vnd.google-apps.folder' })
    }, actionLabel, fetchOpts);
    const created = await createRes.json();
    return created.id;
  }

  let gdrivePendingAutoBackup = false;

  async function backupToGoogleDriveApiNow(options = {}) {
    const auto = Boolean(options.auto);
    const actionLabel = 'Sauvegarde Google Drive';
    if (!isGdriveLinked()) {
      if (!auto) showToast('Reliez d’abord un compte Google.', 'error');
      return false;
    }
    if (auto && !isNetworkAvailable()) {
      gdrivePendingAutoBackup = true;
      return false;
    }
    try {
      updateGdriveStatusUi('Sauvegarde sur Google Drive en cours…', true);
      const folderId = await ensureGdriveBackupFolderId(actionLabel, { quiet: auto });
      const fileName = `inkflow-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.plume.json`;
      const metadata = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const bodyJson = JSON.stringify(buildFullBackupPayload());
      const boundary = '-------inkflow314159265';
      const multipartBody =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${bodyJson}\r\n--${boundary}--`;
      await gdriveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartBody
      }, actionLabel, { quiet: auto });
      state.gdriveLastSyncAt = Date.now();
      gdrivePendingAutoBackup = false;
      renderGdriveAccountUi();
      if (!auto) showToast(`Sauvegardé sur Google Drive (${fileName}).`);
      return true;
    } catch (err) {
      renderGdriveAccountUi();
      if (err && err.code === 'NETWORK') {
        gdrivePendingAutoBackup = true;
        return false;
      }
      if (!auto) reportGdriveError(err, 'Sauvegarde Google Drive');
      return false;
    }
  }

  async function listGoogleDriveBackups() {
    const listEl = document.getElementById('gdriveBackupsList');
    if (!isGdriveLinked()) {
      showToast('Reliez d’abord un compte Google.', 'error');
      return;
    }
    if (!requireNetwork('Historique Google Drive')) return;
    const setNote = (text, isError = false) => {
      if (!listEl) return;
      listEl.innerHTML = '';
      const note = document.createElement('div');
      note.className = `gdrive-backups-note${isError ? ' is-error' : ''}`;
      note.textContent = text;
      listEl.appendChild(note);
    };
    setNote('Chargement…');
    try {
      const folderId = await ensureGdriveBackupFolderId('Historique Google Drive');
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const res = await gdriveFetch(`${GDRIVE_API}/files?q=${q}&orderBy=modifiedTime desc&pageSize=12&fields=files(id,name,modifiedTime,size)`, {}, 'Historique Google Drive');
      const data = await res.json();
      const files = data.files || [];
      if (!listEl) return;
      if (files.length === 0) {
        setNote('Aucune sauvegarde dans Inkflow Backups.');
        return;
      }
      listEl.innerHTML = '';
      files.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'gn-gdrive-backup-row';
        const label = document.createElement('span');
        const meta = [formatDriveDate(f.modifiedTime), formatDriveBytes(f.size)].filter(Boolean).join(' · ');
        label.textContent = meta ? `${f.name} (${meta})` : f.name;
        const btn = document.createElement('button');
        btn.className = 'btn-small-action';
        btn.type = 'button';
        btn.textContent = 'Restaurer';
        btn.addEventListener('click', async () => {
          try {
            const dl = await gdriveFetch(`${GDRIVE_API}/files/${encodeURIComponent(f.id)}?alt=media`, {}, 'Restauration Google Drive');
            const json = await dl.json();
            await restoreFullBackupPayload(json);
            const modal = document.getElementById('modalGoogleDrive');
            if (modal) modal.classList.add('hidden');
          } catch (e2) {
            reportGdriveError(e2, 'Restauration');
          }
        });
        row.appendChild(label);
        row.appendChild(btn);
        listEl.appendChild(row);
      });
    } catch (err) {
      if (err && err.code === 'NETWORK') setNote('Hors connexion : historique indisponible.', true);
      else setNote(String((err && err.message) || err), true);
    }
  }

  // --- Sélecteur visuel de fichiers Google Drive ---
  const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
  const DRIVE_SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
  const DRIVE_EXPORTABLE_LABELS = {
    'application/vnd.google-apps.document': 'Doc Google',
    'application/vnd.google-apps.presentation': 'Slides Google',
    'application/vnd.google-apps.spreadsheet': 'Sheets Google',
    'application/vnd.google-apps.drawing': 'Dessin Google'
  };
  const DRIVE_VIEW_LABELS = { root: 'Mon Drive', recent: 'Récents', starred: 'Suivis', shared: 'Partagés avec moi' };
  const DRIVE_KIND_LABELS = { pdf: 'PDF', image: 'Image', gdoc: 'Doc Google', backup: 'Sauvegarde InkFlow' };
  const DRIVE_KIND_GLYPHS = {
    pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>',
    gdoc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>',
    backup: '<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>'
  };

  const drivePicker = {
    mode: 'import', // 'import' | 'target' | 'target-folder'
    view: 'root',
    stack: [],
    filter: 'all',
    search: '',
    items: [],
    nextPageToken: null,
    selected: new Map(),
    loadSeq: 0,
    loading: false,
    importing: false,
    error: '',
    needsReload: false,
    searchTimer: null,
    onTargetSelect: null,
    defaultTargetFileName: ''
  };

  function sanitizeDriveNotebookFilename(rawName, fallbackTitle = 'Cahier') {
    let base = String(rawName || '').trim();
    if (!base) base = String(fallbackTitle || 'Cahier').trim() || 'Cahier';
    base = base.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim();
    if (!/\.json$/i.test(base)) {
      base = `${base}.inkflow.json`;
    }
    return base;
  }

  function getDrivePickerBreadcrumbPath() {
    if (!Array.isArray(drivePicker.stack) || drivePicker.stack.length === 0) {
      return DRIVE_VIEW_LABELS[drivePicker.view] || 'Mon Drive';
    }
    return drivePicker.stack.map((s) => s.name).join(' / ');
  }

  function getDriveImportKind(mime, name = '') {
    const m = String(mime || '').toLowerCase();
    const n = String(name || '');
    if (m === 'application/pdf') return 'pdf';
    if (/^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/.test(m)) return 'image';
    if (DRIVE_EXPORTABLE_LABELS[m]) return 'gdoc';
    if (/\.plume\.json$/i.test(n)) return 'backup';
    if (m === 'application/json' && /^inkflow-backup/i.test(n)) return 'backup';
    if ((m === 'application/octet-stream' || !m) && /\.pdf$/i.test(n)) return 'pdf';
    return null;
  }

  function escapeDriveQueryValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function getDriveCurrentFolderId() {
    const top = drivePicker.stack[drivePicker.stack.length - 1];
    return top ? top.id : null;
  }

  function buildDriveListQuery({ view = 'root', folderId = null, filter = 'all', search = '' } = {}) {
    const clauses = ['trashed = false'];
    const text = String(search || '').trim();
    if (text) {
      clauses.push(`name contains '${escapeDriveQueryValue(text)}'`);
    } else if (folderId) {
      clauses.push(`'${escapeDriveQueryValue(folderId)}' in parents`);
    } else if (view === 'starred') {
      clauses.push('starred = true');
    } else if (view === 'shared') {
      clauses.push('sharedWithMe = true');
    }
    const allowFolders = Boolean(text || folderId || view !== 'recent');
    const types = [];
    if (filter === 'all' || filter === 'pdf') types.push("mimeType = 'application/pdf'");
    if (filter === 'all' || filter === 'image') types.push("mimeType contains 'image/'");
    if (filter === 'all' || filter === 'gdoc') Object.keys(DRIVE_EXPORTABLE_LABELS).forEach((m) => types.push(`mimeType = '${m}'`));
    if (filter === 'all' || filter === 'backup') types.push("mimeType = 'application/json'");
    types.push(`mimeType = '${DRIVE_SHORTCUT_MIME}'`);
    if (allowFolders) types.push(`mimeType = '${DRIVE_FOLDER_MIME}'`);
    clauses.push(`(${types.join(' or ')})`);
    return clauses.join(' and ');
  }

  function getDriveOrderBy({ view = 'root', folderId = null, search = '' } = {}) {
    if (String(search || '').trim()) return 'folder,modifiedTime desc';
    if (!folderId && view === 'recent') return 'recency desc';
    if (!folderId && view === 'shared') return 'sharedWithMeTime desc';
    return 'folder,name_natural';
  }

  function normalizeDriveItem(raw, filter = 'all') {
    if (!raw || !raw.id) return null;
    let mime = raw.mimeType;
    let id = raw.id;
    const isShortcut = mime === DRIVE_SHORTCUT_MIME;
    if (isShortcut) {
      if (!raw.shortcutDetails || !raw.shortcutDetails.targetId) return null;
      mime = raw.shortcutDetails.targetMimeType;
      id = raw.shortcutDetails.targetId;
    }
    const name = String(raw.name || 'Sans titre');
    if (mime === DRIVE_FOLDER_MIME) return { id, name, isFolder: true, isShortcut };
    if (drivePicker.mode === 'target-folder') return null;
    let kind = getDriveImportKind(mime, name);
    if (!kind && drivePicker.mode === 'target' && (mime === 'application/json' || /\.json$/i.test(name))) {
      kind = 'backup';
    }
    if (!kind) return null;
    if (filter !== 'all' && filter !== kind) return null;
    return {
      id,
      name,
      mime,
      kind,
      isFolder: false,
      isShortcut,
      size: Number(raw.size) || 0,
      modifiedTime: raw.modifiedTime || '',
      thumbnailLink: isShortcut ? '' : (raw.thumbnailLink || '')
    };
  }

  function makeDriveGlyph(kind, size = 28) {
    const span = document.createElement('span');
    span.className = 'drive-glyph';
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DRIVE_KIND_GLYPHS[kind] || DRIVE_KIND_GLYPHS.pdf}</svg>`;
    return span;
  }

  function openDrivePicker(options = {}) {
    const modal = document.getElementById('modalDrivePicker');
    if (!modal) return;
    if (!isGdriveLinked()) {
      openCloudBackupModal('api');
      showToast('Reliez d’abord un compte Google pour parcourir Drive.', 'error');
      return;
    }
    drivePicker.mode = options.mode || 'import';
    drivePicker.onTargetSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
    drivePicker.view = 'root';
    if (options.initialFolderId && options.initialFolderId !== 'root') {
      const crumbs = String(options.initialFolderPath || 'Dossier choisi').split(' / ').filter(Boolean);
      const leafName = crumbs[crumbs.length - 1] || 'Dossier choisi';
      drivePicker.stack = [
        { id: 'root', name: DRIVE_VIEW_LABELS.root },
        { id: options.initialFolderId, name: leafName }
      ];
    } else {
      drivePicker.stack = [{ id: 'root', name: DRIVE_VIEW_LABELS.root }];
    }
    drivePicker.filter = drivePicker.mode === 'import' ? (options.filter || 'all') : 'backup';
    drivePicker.search = '';
    drivePicker.items = [];
    drivePicker.nextPageToken = null;
    drivePicker.selected.clear();
    drivePicker.error = '';
    drivePicker.openedFrom = options.from || null;
    drivePicker.defaultTargetFileName = sanitizeDriveNotebookFilename(options.defaultFileName || '', options.notebookTitle || 'Cahier');
    const search = document.getElementById('drivePickerSearch');
    if (search) search.value = '';
    const fnInput = document.getElementById('driveTargetFilenameInput');
    if (fnInput) fnInput.value = drivePicker.defaultTargetFileName;
    const titleEl = document.getElementById('drivePickerTitle');
    if (titleEl) {
      if (drivePicker.mode === 'target') titleEl.textContent = options.pickerTitle || 'Choisir le fichier Google Drive du cahier';
      else if (drivePicker.mode === 'target-folder') titleEl.textContent = options.pickerTitle || 'Choisir le dossier Google Drive par défaut';
      else titleEl.textContent = 'Importer depuis Google Drive';
    }
    const filterWrap = document.getElementById('drivePickerFilterChips');
    if (filterWrap) filterWrap.classList.toggle('hidden', drivePicker.mode !== 'import');
    const newFldBtn = document.getElementById('btnDrivePickerNewFolder');
    if (newFldBtn) newFldBtn.classList.toggle('hidden', drivePicker.mode === 'import');
    const fnWrap = document.getElementById('driveTargetFilenameWrap');
    if (fnWrap) fnWrap.classList.toggle('hidden', drivePicker.mode !== 'target');
    syncDrivePickerChrome();
    modal.classList.remove('hidden');
    renderGdriveAccountUi();
    if (!isNetworkAvailable()) {
      drivePicker.needsReload = true;
      notifyNetworkRequired('Parcourir Google Drive');
      renderDrivePickerGrid();
      renderDrivePickerFooter();
      return;
    }
    loadDrivePickerItems();
  }

  function openDriveTargetPicker(options = {}) {
    return openDrivePicker({
      ...options,
      mode: options.folderOnly ? 'target-folder' : 'target'
    });
  }

  async function createNewFolderInDrivePicker() {
    if (!requireNetwork('Créer un dossier Google Drive')) return null;
    const rawName = typeof window.prompt === 'function' ? window.prompt('Nom du nouveau dossier Google Drive :', 'Mes cahiers InkFlow') : '';
    const cleanName = String(rawName || '').trim();
    if (!cleanName) return null;
    const parentId = getDriveCurrentFolderId() || 'root';
    try {
      const body = {
        name: cleanName,
        mimeType: DRIVE_FOLDER_MIME
      };
      if (parentId && parentId !== 'root') body.parents = [parentId];
      const res = await gdriveFetch(`${GDRIVE_API}/files?fields=id,name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }, 'Créer un dossier Google Drive');
      const created = await res.json();
      if (created && created.id) {
        drivePicker.view = 'root';
        drivePicker.stack = drivePicker.stack.concat([{ id: created.id, name: created.name || cleanName }]);
        reloadDrivePicker();
        showToast(`Dossier Drive « ${created.name || cleanName} » créé.`);
        return created;
      }
    } catch (err) {
      reportGdriveError(err, 'Création dossier Drive');
    }
    return null;
  }

  function confirmDriveTargetPickerSelection() {
    const cb = drivePicker.onTargetSelect;
    const folderId = getDriveCurrentFolderId() || 'root';
    const folderPath = getDrivePickerBreadcrumbPath();
    if (drivePicker.mode === 'target-folder') {
      const result = { folderId, folderPath };
      closeDrivePicker();
      if (typeof cb === 'function') cb(result);
      return;
    }
    const sel = Array.from(drivePicker.selected.values());
    let target;
    if (sel.length > 0 && !sel[0].isFolder) {
      target = {
        mode: 'file',
        fileId: sel[0].id,
        fileName: sel[0].name,
        folderId,
        folderPath
      };
    } else {
      const fnInput = document.getElementById('driveTargetFilenameInput');
      const fileName = sanitizeDriveNotebookFilename(fnInput ? fnInput.value : '', drivePicker.defaultTargetFileName);
      target = {
        mode: 'folder',
        fileId: null,
        fileName,
        folderId,
        folderPath
      };
    }
    closeDrivePicker();
    if (typeof cb === 'function') cb(target);
  }

  function closeDrivePicker() {
    if (drivePicker.importing) {
      showToast('Import en cours depuis Google Drive…', 'info', 'drive-importing');
      return;
    }
    const modal = document.getElementById('modalDrivePicker');
    if (modal) modal.classList.add('hidden');
    drivePicker.loadSeq++;
    drivePicker.loading = false;
    clearTimeout(drivePicker.searchTimer);
  }

  function isDrivePickerOpen() {
    const modal = document.getElementById('modalDrivePicker');
    return Boolean(modal && !modal.classList.contains('hidden'));
  }

  function syncDrivePickerChrome() {
    if (typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('#modalDrivePicker [data-drive-view]').forEach((btn) => {
        const active = btn.dataset.driveView === drivePicker.view;
        btn.classList.toggle('active', active);
        if (active) btn.setAttribute('aria-current', 'true');
        else if (typeof btn.removeAttribute === 'function') btn.removeAttribute('aria-current');
      });
      document.querySelectorAll('#modalDrivePicker [data-drive-filter]').forEach((chip) => {
        const active = chip.dataset.driveFilter === drivePicker.filter;
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    }
    renderDriveBreadcrumb();
  }

  function renderDriveBreadcrumb() {
    const el = document.getElementById('drivePickerBreadcrumb');
    if (!el) return;
    el.innerHTML = '';
    const text = drivePicker.search.trim();
    if (text) {
      const span = document.createElement('span');
      span.className = 'drive-crumb is-current';
      span.textContent = `Résultats pour « ${text} »`;
      el.appendChild(span);
      return;
    }
    const crumbs = [];
    if (drivePicker.view !== 'root') crumbs.push({ label: DRIVE_VIEW_LABELS[drivePicker.view], depth: 0 });
    drivePicker.stack.forEach((f, i) => crumbs.push({ label: f.name, depth: drivePicker.view === 'root' ? i + 1 : i + 1 }));
    crumbs.forEach((c, i) => {
      const last = i === crumbs.length - 1;
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'drive-crumb-sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
        el.appendChild(sep);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `drive-crumb${last ? ' is-current' : ''}`;
      btn.textContent = c.label;
      if (last) btn.disabled = true;
      else {
        btn.addEventListener('click', () => {
          drivePicker.stack = drivePicker.stack.slice(0, c.depth);
          if (drivePicker.view === 'root' && drivePicker.stack.length === 0) drivePicker.stack = [{ id: 'root', name: DRIVE_VIEW_LABELS.root }];
          reloadDrivePicker();
        });
      }
      el.appendChild(btn);
    });
  }

  function reloadDrivePicker() {
    drivePicker.items = [];
    drivePicker.nextPageToken = null;
    drivePicker.error = '';
    syncDrivePickerChrome();
    const scroll = document.getElementById('drivePickerScroll');
    if (scroll) scroll.scrollTop = 0;
    loadDrivePickerItems();
  }

  async function loadDrivePickerItems({ append = false } = {}) {
    if (!isNetworkAvailable()) {
      drivePicker.needsReload = true;
      renderDrivePickerGrid();
      return;
    }
    const seq = ++drivePicker.loadSeq;
    drivePicker.loading = true;
    drivePicker.error = '';
    drivePicker.needsReload = false;
    if (!append) drivePicker.items = [];
    renderDrivePickerGrid();
    const folderId = getDriveCurrentFolderId();
    const ctx = { view: drivePicker.view, folderId, filter: drivePicker.filter, search: drivePicker.search };
    const params = new URLSearchParams({
      q: buildDriveListQuery(ctx),
      orderBy: getDriveOrderBy(ctx),
      pageSize: '60',
      spaces: 'drive',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,thumbnailLink,shortcutDetails(targetId,targetMimeType))'
    });
    if (append && drivePicker.nextPageToken) params.set('pageToken', drivePicker.nextPageToken);
    try {
      const res = await gdriveFetch(`${GDRIVE_API}/files?${params.toString()}`, {}, 'Parcourir Google Drive');
      const data = await res.json();
      if (seq !== drivePicker.loadSeq) return;
      const fresh = (data.files || []).map((f) => normalizeDriveItem(f, drivePicker.filter)).filter(Boolean);
      const known = new Set(drivePicker.items.map((it) => it.id));
      drivePicker.items = drivePicker.items.concat(fresh.filter((it) => !known.has(it.id)));
      drivePicker.nextPageToken = data.nextPageToken || null;
    } catch (err) {
      if (seq !== drivePicker.loadSeq) return;
      if (err && err.code === 'NETWORK') drivePicker.needsReload = true;
      else drivePicker.error = String((err && err.message) || err);
      if (err && err.code === 'GDRIVE_AUTH') {
        showToast(err.message, 'error');
        closeDrivePicker();
        openCloudBackupModal('api');
      }
    } finally {
      if (seq === drivePicker.loadSeq) {
        drivePicker.loading = false;
        renderDrivePickerGrid();
      }
    }
  }

  function renderDrivePickerGrid() {
    const grid = document.getElementById('drivePickerGrid');
    const empty = document.getElementById('drivePickerEmpty');
    const more = document.getElementById('btnDrivePickerMore');
    if (!grid) return;
    grid.innerHTML = '';
    const items = drivePicker.items;
    const folders = items.filter((it) => it.isFolder);
    const files = items.filter((it) => !it.isFolder);

    if (folders.length) {
      const head = document.createElement('div');
      head.className = 'drive-section-label';
      head.textContent = 'Dossiers';
      grid.appendChild(head);
      folders.forEach((folder) => grid.appendChild(createDriveFolderTile(folder)));
    }
    if (files.length) {
      const head = document.createElement('div');
      head.className = 'drive-section-label';
      head.textContent = 'Fichiers';
      grid.appendChild(head);
      files.forEach((file) => grid.appendChild(createDriveFileCard(file)));
    }
    if (drivePicker.loading) {
      const count = items.length ? 4 : 8;
      for (let i = 0; i < count; i++) {
        const sk = document.createElement('div');
        sk.className = 'drive-card is-skeleton';
        sk.setAttribute('aria-hidden', 'true');
        grid.appendChild(sk);
      }
    }

    if (empty) {
      let title = '';
      let sub = '';
      let retry = false;
      if (!drivePicker.loading && !items.length) {
        if (!isNetworkAvailable() || drivePicker.needsReload) {
          title = 'Hors connexion';
          sub = 'La liste de vos fichiers s’affichera dès le retour du réseau.';
        } else if (drivePicker.error) {
          title = 'Impossible de charger Google Drive';
          sub = drivePicker.error;
          retry = true;
        } else {
          title = drivePicker.search.trim() ? 'Aucun résultat' : 'Rien à importer ici';
          sub = 'InkFlow importe les PDF, les images, les documents Google (convertis en PDF) et les sauvegardes InkFlow.';
        }
      }
      empty.classList.toggle('hidden', !title);
      empty.innerHTML = '';
      if (title) {
        const t = document.createElement('div');
        t.className = 'drive-empty-title';
        t.textContent = title;
        const s = document.createElement('div');
        s.className = 'drive-empty-sub';
        s.textContent = sub;
        empty.appendChild(t);
        empty.appendChild(s);
        if (retry) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cloud-btn-secondary';
          b.textContent = 'Réessayer';
          b.addEventListener('click', () => reloadDrivePicker());
          empty.appendChild(b);
        }
      }
    }
    if (more) more.classList.toggle('hidden', !drivePicker.nextPageToken || drivePicker.loading);
    renderDrivePickerFooter();
  }

  function createDriveFolderTile(folder) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'drive-folder-tile';
    btn.title = folder.name;
    btn.appendChild(makeDriveGlyph('folder', 18));
    const name = document.createElement('span');
    name.className = 'drive-folder-name';
    name.textContent = folder.name;
    btn.appendChild(name);
    btn.addEventListener('click', () => {
      if (drivePicker.search.trim()) {
        drivePicker.search = '';
        const input = document.getElementById('drivePickerSearch');
        if (input) input.value = '';
        drivePicker.view = 'root';
        drivePicker.stack = [{ id: 'root', name: DRIVE_VIEW_LABELS.root }];
      }
      drivePicker.stack = drivePicker.stack.concat([{ id: folder.id, name: folder.name }]);
      reloadDrivePicker();
    });
    return btn;
  }

  function createDriveFileCard(file) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'drive-card';
    card.setAttribute('role', 'option');
    const selected = drivePicker.selected.has(file.id);
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-selected', selected ? 'true' : 'false');
    card.title = `${file.name}\nDouble-clic pour importer directement`;

    const thumb = document.createElement('span');
    thumb.className = `drive-thumb kind-${file.kind}`;
    const glyph = makeDriveGlyph(file.kind === 'gdoc' ? 'gdoc' : file.kind, 30);
    thumb.appendChild(glyph);
    if (file.thumbnailLink) {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => thumb.classList.add('has-image');
      img.onerror = () => img.remove();
      img.src = file.thumbnailLink;
      thumb.appendChild(img);
    }
    const badge = document.createElement('span');
    badge.className = 'drive-kind-badge';
    badge.textContent = file.kind === 'gdoc' ? (DRIVE_EXPORTABLE_LABELS[file.mime] || 'Doc Google') : DRIVE_KIND_LABELS[file.kind];
    thumb.appendChild(badge);
    const check = document.createElement('span');
    check.className = 'drive-check';
    check.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DRIVE_KIND_GLYPHS.check}</svg>`;
    thumb.appendChild(check);
    card.appendChild(thumb);

    const meta = document.createElement('span');
    meta.className = 'drive-card-meta';
    const name = document.createElement('span');
    name.className = 'drive-card-name';
    name.textContent = file.name;
    const sub = document.createElement('span');
    sub.className = 'drive-card-sub';
    sub.textContent = [formatDriveDate(file.modifiedTime), formatDriveBytes(file.size)].filter(Boolean).join(' · ');
    meta.appendChild(name);
    meta.appendChild(sub);
    card.appendChild(meta);

    card.addEventListener('click', () => {
      if (drivePicker.importing) return;
      if (drivePicker.mode === 'target') {
        const wasSel = drivePicker.selected.has(file.id);
        drivePicker.selected.clear();
        if (typeof document.querySelectorAll === 'function') {
          document.querySelectorAll('#drivePickerGrid .drive-card.is-selected').forEach((el) => {
            el.classList.remove('is-selected');
            el.setAttribute('aria-selected', 'false');
          });
        }
        if (!wasSel) {
          drivePicker.selected.set(file.id, file);
          card.classList.add('is-selected');
          card.setAttribute('aria-selected', 'true');
        }
        renderDrivePickerFooter();
        return;
      }
      if (drivePicker.selected.has(file.id)) drivePicker.selected.delete(file.id);
      else drivePicker.selected.set(file.id, file);
      const isSel = drivePicker.selected.has(file.id);
      card.classList.toggle('is-selected', isSel);
      card.setAttribute('aria-selected', isSel ? 'true' : 'false');
      renderDrivePickerFooter();
    });
    card.addEventListener('dblclick', () => {
      if (drivePicker.importing) return;
      if (drivePicker.mode === 'target') {
        drivePicker.selected.clear();
        drivePicker.selected.set(file.id, file);
        confirmDriveTargetPickerSelection();
        return;
      }
      if (file.kind === 'backup') return;
      drivePicker.selected.clear();
      drivePicker.selected.set(file.id, file);
      importSelectedDriveFiles();
    });
    return card;
  }

  function renderDrivePickerFooter(progressText = '') {
    const sel = Array.from(drivePicker.selected.values());
    const label = document.getElementById('drivePickerSelection');
    const btn = document.getElementById('btnDrivePickerImport');
    const targetWrap = document.getElementById('drivePdfTargetWrap');
    const fnWrap = document.getElementById('driveTargetFilenameWrap');

    if (drivePicker.mode === 'target' || drivePicker.mode === 'target-folder') {
      const folderPath = getDrivePickerBreadcrumbPath();
      if (targetWrap) targetWrap.classList.add('hidden');
      if (drivePicker.mode === 'target-folder') {
        if (fnWrap) fnWrap.classList.add('hidden');
        if (label) label.textContent = `Dossier ciblé : ${folderPath}`;
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Choisir ce dossier';
        }
      } else if (sel.length > 0) {
        if (fnWrap) fnWrap.classList.add('hidden');
        if (label) label.textContent = `Fichier Drive existant : « ${sel[0].name} »`;
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Cibler ce fichier';
        }
      } else {
        if (fnWrap) fnWrap.classList.remove('hidden');
        if (label) label.textContent = `Dossier : ${folderPath}`;
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Enregistrer ici';
        }
      }
      syncNetworkDependentControls();
      return;
    }

    if (fnWrap) fnWrap.classList.add('hidden');
    if (label) {
      if (progressText) label.textContent = progressText;
      else if (!sel.length) label.textContent = 'Sélectionnez un ou plusieurs fichiers';
      else {
        const total = sel.reduce((acc, f) => acc + (f.size || 0), 0);
        const sizeTxt = formatDriveBytes(total);
        label.textContent = `${sel.length} fichier${sel.length > 1 ? 's' : ''} sélectionné${sel.length > 1 ? 's' : ''}${sizeTxt ? ` · ${sizeTxt}` : ''}`;
      }
    }
    if (btn) {
      btn.disabled = !sel.length || drivePicker.importing;
      btn.textContent = drivePicker.importing ? 'Import…' : (sel.length > 1 ? `Importer (${sel.length})` : 'Importer');
    }
    if (targetWrap) targetWrap.classList.toggle('hidden', !sel.some((f) => f.kind === 'pdf' || f.kind === 'gdoc'));
    syncNetworkDependentControls();
  }

  async function confirmDriveBackupRestore(name) {
    const msg = `Restaurer la sauvegarde « ${name} » ? Les cahiers et pages de même identifiant seront remplacés.`;
    try {
      if (window.__TAURI__ && window.__TAURI__.dialog && typeof window.__TAURI__.dialog.confirm === 'function') {
        return Boolean(await window.__TAURI__.dialog.confirm(msg, { title: 'InkFlow', kind: 'warning' }));
      }
      return typeof window.confirm === 'function' ? Boolean(window.confirm(msg)) : false;
    } catch (_) {
      return false;
    }
  }

  async function importOneDriveFile(file, pdfMode) {
    const label = 'Importer depuis Google Drive';
    if (file.kind === 'gdoc') {
      const res = await gdriveFetch(`${GDRIVE_API}/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('application/pdf')}`, {}, label);
      const buf = await res.arrayBuffer();
      const ok = await paidImportPdf(buf, `${file.name}.pdf`, pdfMode);
      return ok ? 'done' : 'stopped';
    }
    const res = await gdriveFetch(`${GDRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`, {}, label);
    if (file.kind === 'pdf') {
      const buf = await res.arrayBuffer();
      const name = /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`;
      const ok = await paidImportPdf(buf, name, pdfMode);
      return ok ? 'done' : 'stopped';
    }
    if (file.kind === 'image') {
      const blob = await res.blob();
      const imageFile = new File([blob], file.name, { type: file.mime || blob.type || 'image/png' });
      readFileAsImageAndInsert(imageFile);
      return 'done';
    }
    if (file.kind === 'backup') {
      if (!(await confirmDriveBackupRestore(file.name))) return 'skipped';
      const json = await res.json();
      await restoreFullBackupPayload(json);
      return 'done';
    }
    return 'skipped';
  }

  async function importSelectedDriveFiles() {
    if (drivePicker.importing) return;
    const files = Array.from(drivePicker.selected.values());
    if (!files.length) return;
    if (!requireNetwork('Importer depuis Google Drive')) return;
    const targetSelect = document.getElementById('drivePdfTarget');
    const pdfMode = targetSelect && targetSelect.value === 'current-notebook' ? 'current-notebook' : 'new-notebook';
    drivePicker.importing = true;
    let done = 0;
    let stopped = false;
    let stoppedAt = -1;
    const failures = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      renderDrivePickerFooter(`Import ${i + 1}/${files.length} : ${file.name}`);
      try {
        const result = await importOneDriveFile(file, pdfMode);
        if (result === 'done') done++;
        if (result === 'stopped') { stopped = true; stoppedAt = i; break; }
      } catch (err) {
        if (err && err.code === 'NETWORK') { stopped = true; break; }
        if (err && err.code === 'GDRIVE_AUTH') { failures.push(err.message); stopped = true; break; }
        failures.push(`${file.name} : ${(err && err.message) || err}`);
      }
    }
    drivePicker.importing = false;
    drivePicker.selected.clear();
    if (done > 0 || stopped) {
      closeDrivePicker();
      if (done > 0) {
        const pdfModal = document.getElementById('modalImportPdf');
        if (pdfModal && !pdfModal.classList.contains('hidden')) closeImportPdfModal();
        const cloudModal = document.getElementById('modalGoogleDrive');
        if (cloudModal) cloudModal.classList.add('hidden');
        showToast(`${done} fichier${done > 1 ? 's' : ''} importé${done > 1 ? 's' : ''} depuis Google Drive.`);
      }
      const left = stoppedAt >= 0 ? files.length - stoppedAt : 0;
      if (left > 0) showToast(`${left} fichier${left > 1 ? 's' : ''} non importé${left > 1 ? 's' : ''} (jetons insuffisants).`, 'error', 'drive-import-left');
    } else {
      renderDrivePickerGrid();
    }
    if (failures.length) {
      const extra = failures.length > 1 ? ` (+${failures.length - 1} autre${failures.length > 2 ? 's' : ''})` : '';
      showToast(`Import impossible — ${failures[0]}${extra}`, 'error');
    }
  }

  function openCloudBackupModal(tab = null) {
    const modal = document.getElementById('modalGoogleDrive');
    if (!modal) return;
    if (tab && typeof setCloudBackupTabRef === 'function') setCloudBackupTabRef(tab);
    renderGdriveAccountUi();
    modal.classList.remove('hidden');
    if (isGdriveLinked() && !(state.gdriveAccount && state.gdriveAccount.email) && isNetworkAvailable()) {
      refreshGdriveAccountInfo().catch(() => {});
    }
  }
  let setCloudBackupTabRef = null;

  function openFolderCustomizeModal(existingFolder = null) {
    const modal = document.getElementById('modalFolderCustomize');
    const titleEl = document.getElementById('modalFolderCustomizeTitle');
    const nameInput = document.getElementById('inputFolderCustomizeName');
    if (!modal || !nameInput) {
      openRenameModal(
        existingFolder ? 'Renommer le dossier' : 'Nouveau dossier',
        existingFolder ? existingFolder.name : 'Nouveau dossier',
        (name) => {
          if (existingFolder) {
            existingFolder.name = name;
          } else {
            const palette = ['#0072ce', '#7c3aed', '#0d9488', '#d97706', '#e11d48', '#2563eb'];
            state.folders.push({
              id: createUid('fld'),
              name,
              parentId: state.currentFolderId || null,
              color: palette[state.folders.length % palette.length],
              icon: 'folder',
              starred: false,
              createdAt: Date.now()
            });
          }
          db.saveFolders(state.folders);
          renderNotebooksSidebar();
        }
      );
      return;
    }

    state.editingFolderId = existingFolder ? existingFolder.id : null;
    state.folderModalColor = existingFolder ? (existingFolder.color || '#0072ce') : '#0072ce';
    state.folderModalIcon = existingFolder ? (existingFolder.icon || 'folder') : 'folder';
    if (titleEl) titleEl.textContent = existingFolder ? 'Personnaliser le dossier' : 'Nouveau dossier';
    nameInput.value = existingFolder ? existingFolder.name : 'Nouveau dossier';

    document.querySelectorAll('#folderColorSwatches [data-folder-color]').forEach((sw) => {
      sw.classList.toggle('active', sw.dataset.folderColor.toLowerCase() === state.folderModalColor.toLowerCase());
    });
    document.querySelectorAll('#folderSymbolPills [data-folder-icon]').forEach((pill) => {
      pill.classList.toggle('active', pill.dataset.folderIcon === state.folderModalIcon);
    });

    modal.classList.remove('hidden');
    setTimeout(() => { nameInput.focus(); nameInput.select(); }, 20);
  }

  function closeFolderCustomizeModal() {
    const modal = document.getElementById('modalFolderCustomize');
    if (modal) modal.classList.add('hidden');
    state.editingFolderId = null;
  }

  // ============================================================================
  // 18. PAGE PLEIN ÉCRAN : GESTIONNAIRE DE FICHIERS GOODNOTES 6 (#gnFilesPage)
  // Architecture calquée sur GoodNotes for Windows 2.4.6 (analysé via REA)
  // ============================================================================

  let draggedFilesItem = null; // { type: 'nb' | 'fld', id: string }

  function closeGnFilesMenus() {
    const newMenu = document.getElementById('gnFilesNewMenu');
    const ctxMenu = document.getElementById('gnFilesContextMenu');
    if (newMenu) newMenu.classList.add('hidden');
    if (ctxMenu) ctxMenu.classList.add('hidden');
  }

  function positionGnFilesPopover(popoverEl, anchorRectOrPoint) {
    if (!popoverEl) return;
    popoverEl.classList.remove('hidden');
    const vw = typeof window !== 'undefined' ? (window.innerWidth || 1280) : 1280;
    const vh = typeof window !== 'undefined' ? (window.innerHeight || 800) : 800;
    const pw = popoverEl.offsetWidth || 252;
    const ph = popoverEl.offsetHeight || 240;
    let left = anchorRectOrPoint.left ?? anchorRectOrPoint.x ?? 120;
    let top = (anchorRectOrPoint.bottom !== undefined ? anchorRectOrPoint.bottom + 6 : (anchorRectOrPoint.y ?? 120));
    if (left + pw > vw - 14) left = Math.max(14, vw - pw - 14);
    if (top + ph > vh - 14) top = Math.max(14, (anchorRectOrPoint.top ?? top) - ph - 6);
    popoverEl.style.left = `${Math.round(left)}px`;
    popoverEl.style.top = `${Math.round(top)}px`;
  }

  function openGnFilesNewMenu(anchorEl) {
    const newMenu = document.getElementById('gnFilesNewMenu');
    const ctxMenu = document.getElementById('gnFilesContextMenu');
    if (ctxMenu) ctxMenu.classList.add('hidden');
    if (!newMenu) return;
    const rect = anchorEl && typeof anchorEl.getBoundingClientRect === 'function'
      ? anchorEl.getBoundingClientRect()
      : { left: 280, bottom: 110, top: 80 };
    positionGnFilesPopover(newMenu, rect);
  }

  function openGnFilesContextMenu(itemType, item, anchorPoint) {
    const ctxMenu = document.getElementById('gnFilesContextMenu');
    const newMenu = document.getElementById('gnFilesNewMenu');
    if (newMenu) newMenu.classList.add('hidden');
    if (!ctxMenu || !item) return;

    const isTrashed = Boolean(item.trashedAt);
    const entries = [];
    if (itemType === 'fld') {
      if (isTrashed) {
        entries.push({ act: 'restore', label: 'Restaurer le dossier' });
        entries.push({ sep: true });
        entries.push({ act: 'purge', label: 'Supprimer définitivement', danger: true });
      } else {
        entries.push({ act: 'open', label: 'Ouvrir le dossier' });
        entries.push({ act: 'drive-folder', label: 'Dossier Google Drive par défaut…' });
        entries.push({ act: 'customize', label: 'Couleur & symbole...' });
        entries.push({ act: 'rename', label: 'Renommer' });
        entries.push({ act: 'star', label: item.starred ? 'Retirer des favoris' : 'Ajouter aux favoris' });
        entries.push({ act: 'move', label: 'Déplacer vers...' });
        entries.push({ sep: true });
        entries.push({ act: 'trash', label: 'Mettre à la corbeille', danger: true });
      }
    } else {
      if (isTrashed) {
        entries.push({ act: 'restore', label: 'Restaurer le cahier' });
        entries.push({ sep: true });
        entries.push({ act: 'purge', label: 'Supprimer définitivement', danger: true });
      } else {
        entries.push({ act: 'open', label: 'Ouvrir le cahier' });
        entries.push({ act: 'drive-target', label: 'Fichier Google Drive…' });
        entries.push({ act: 'rename', label: 'Renommer' });
        entries.push({ act: 'duplicate', label: 'Dupliquer' });
        entries.push({ act: 'move', label: 'Déplacer vers...' });
        entries.push({ act: 'star', label: item.starred ? 'Retirer des favoris' : 'Ajouter aux favoris' });
        entries.push({ sep: true });
        entries.push({ act: 'trash', label: 'Mettre à la corbeille', danger: true });
      }
    }

    ctxMenu.innerHTML = entries.map((entry) => {
      if (entry.sep) return '<div class="gn-files-menu-sep"></div>';
      return `<button class="gn-files-menu-item${entry.danger ? ' danger' : ''}" type="button" data-ctx-act="${entry.act}">${escapeHtml(entry.label)}</button>`;
    }).join('');

    ctxMenu.querySelectorAll('[data-ctx-act]').forEach((btn) => {
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const act = btn.dataset.ctxAct;
        closeGnFilesMenus();
        if (itemType === 'fld') {
          if (act === 'open') {
            state.filesPageTab = 'all';
            state.currentFolderId = item.id;
            renderNotebooksSidebar();
          } else if (act === 'drive-folder') {
            if (typeof promptFolderDefaultDriveTarget === 'function') promptFolderDefaultDriveTarget(item);
          } else if (act === 'customize') {
            openFolderCustomizeModal(item);
          } else if (act === 'rename') {
            openRenameModal('Renommer le dossier', item.name, (val) => {
              item.name = val;
              item.updatedAt = Date.now();
              db.saveFolders(state.folders);
              renderNotebooksSidebar();
            });
          } else if (act === 'star') {
            item.starred = !item.starred;
            item.updatedAt = Date.now();
            db.saveFolders(state.folders);
            renderNotebooksSidebar();
          } else if (act === 'move') {
            openMoveNotebookModal({ type: 'fld', id: item.id });
          } else if (act === 'trash') {
            await moveFolderToTrash(item.id);
          } else if (act === 'restore') {
            await restoreFolderFromTrash(item.id);
          } else if (act === 'purge') {
            await deleteFolderPermanently(item.id);
          }
        } else {
          if (act === 'open') {
            selectNotebook(item.id);
            closeFilesPage();
          } else if (act === 'drive-target') {
            if (typeof promptNotebookDriveTarget === 'function') promptNotebookDriveTarget(item);
          } else if (act === 'rename') {
            openRenameModal('Renommer le cahier', item.title, (val) => {
              item.title = val;
              item.updatedAt = Date.now();
              db.saveNotebook(item);
              renderNotebooksSidebar();
              updateBreadcrumbs();
            });
          } else if (act === 'duplicate') {
            await duplicateNotebookById(item.id);
          } else if (act === 'move') {
            openMoveNotebookModal({ type: 'nb', id: item.id });
          } else if (act === 'star') {
            item.starred = !item.starred;
            item.updatedAt = Date.now();
            db.saveNotebook(item);
            renderNotebooksSidebar();
          } else if (act === 'trash') {
            await moveNotebookToTrash(item.id);
          } else if (act === 'restore') {
            await restoreNotebookFromTrash(item.id);
          } else if (act === 'purge') {
            await deleteNotebookById(item.id);
          }
        }
      });
    });

    positionGnFilesPopover(ctxMenu, anchorPoint);
  }

  function getGnFilesVisibleData() {
    const tab = state.filesPageTab || 'all';
    const search = (state.sidebarSearch || '').trim().toLowerCase();
    const favFilter = state.filesPageFavFilter || 'any';
    const sortBy = state.notebookSortBy || 'date_desc';

    const sortFoldersFn = (a, b) => {
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' });
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '', 'fr', { sensitivity: 'base' });
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    };
    const sortNotebooksFn = (a, b) => {
      if (tab === 'recents' || sortBy === 'date_desc') {
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      }
      if (sortBy === 'name_asc') return (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' });
      if (sortBy === 'name_desc') return (b.title || '').localeCompare(a.title || '', 'fr', { sensitivity: 'base' });
      if (sortBy === 'type') {
        const aPdf = a.isPdfNotebook || a.pdfId ? 1 : 0;
        const bPdf = b.isPdfNotebook || b.pdfId ? 1 : 0;
        if (bPdf !== aPdf) return bPdf - aPdf;
        return (a.title || '').localeCompare(b.title || '', 'fr', { sensitivity: 'base' });
      }
      return 0;
    };

    const folders = (state.folders || []).filter((f) => {
      const isTrashed = Boolean(f.trashedAt);
      if (tab === 'trash') return isTrashed && (!search || (f.name || '').toLowerCase().includes(search));
      if (isTrashed) return false;
      if (tab === 'recents') return false;
      if (tab === 'favorites') {
        if (favFilter === 'document') return false;
        return Boolean(f.starred) && (!search || (f.name || '').toLowerCase().includes(search));
      }
      if (search) return (f.name || '').toLowerCase().includes(search);
      return (f.parentId || null) === (state.currentFolderId || null);
    }).sort(sortFoldersFn);

    const notebooks = (state.notebooks || []).filter((nb) => {
      const isTrashed = Boolean(nb.trashedAt);
      if (tab === 'trash') return isTrashed && (!search || (nb.title || '').toLowerCase().includes(search));
      if (isTrashed) return false;
      if (tab === 'favorites') {
        if (favFilter === 'folder') return false;
        return Boolean(nb.starred) && (!search || (nb.title || '').toLowerCase().includes(search));
      }
      if (tab === 'recents') {
        return !search || (nb.title || '').toLowerCase().includes(search);
      }
      if (search) return (nb.title || '').toLowerCase().includes(search);
      return (nb.folderId || null) === (state.currentFolderId || null);
    }).sort(sortNotebooksFn);

    return { tab, search, folders, notebooks };
  }

  function renderGnFilesPage() {
    const pageEl = document.getElementById('gnFilesPage');
    const contentEl = document.getElementById('gnFilesContent');
    if (!pageEl || !contentEl) return;

    const { tab, search, folders, notebooks } = getGnFilesVisibleData();
    const isTrash = tab === 'trash';
    const isFavorites = tab === 'favorites';
    const isRecents = tab === 'recents';
    const isGrid = (state.filesPageViewMode || 'grid') === 'grid';

    // 1. Sidebar active tab & badges
    document.querySelectorAll('#gnFilesSidebarNav [data-files-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filesTab === tab);
    });
    const activeDocsCount = (state.notebooks || []).filter((n) => !n.trashedAt).length;
    const favCount = (state.notebooks || []).filter((n) => !n.trashedAt && n.starred).length +
      (state.folders || []).filter((f) => !f.trashedAt && f.starred).length;
    const trashCount = (state.notebooks || []).filter((n) => Boolean(n.trashedAt)).length +
      (state.folders || []).filter((f) => Boolean(f.trashedAt)).length;

    const badgeDocs = document.getElementById('gnFilesBadgeDocs');
    const badgeFav = document.getElementById('gnFilesBadgeFav');
    const badgeTrash = document.getElementById('gnFilesBadgeTrash');
    if (badgeDocs) badgeDocs.textContent = String(activeDocsCount);
    if (badgeFav) badgeFav.textContent = String(favCount);
    if (badgeTrash) badgeTrash.textContent = String(trashCount);

    const activeNb = getActiveNotebook();
    const activeNbLabel = document.getElementById('gnFilesActiveNbName');
    if (activeNbLabel) activeNbLabel.textContent = activeNb ? activeNb.title : 'Cahier actif';

    // 2. Breadcrumbs & Back button (GoodNotes top-bar-breadcrumbs)
    const backBtn = document.getElementById('btnGnFilesBack');
    const crumbsEl = document.getElementById('gnFilesBreadcrumbs');
    const showSubfolder = tab === 'all' && Boolean(state.currentFolderId) && !search;
    if (backBtn) backBtn.classList.toggle('hidden', !showSubfolder);

    if (crumbsEl) {
      if (tab === 'all') {
        const chain = showSubfolder ? getFolderPath(state.currentFolderId) : [];
        const parts = [{ id: '', label: 'Documents', isCurrent: chain.length === 0 }];
        chain.forEach((f, idx) => parts.push({ id: f.id, label: f.name, isCurrent: idx === chain.length - 1 }));
        crumbsEl.innerHTML = parts.map((p, idx) => {
          const sep = idx > 0 ? '<span class="gn-files-crumb-sep">›</span>' : '';
          return `${sep}<button class="gn-files-crumb${p.isCurrent ? ' current' : ''}" type="button" data-gn-crumb="${p.id}">${escapeHtml(p.label)}</button>`;
        }).join('');
        crumbsEl.querySelectorAll('[data-gn-crumb]').forEach((b) => {
          b.addEventListener('click', () => {
            const targetId = b.dataset.gnCrumb || null;
            if (targetId === (state.currentFolderId || null)) return;
            state.currentFolderId = targetId;
            renderNotebooksSidebar();
          });
          b.addEventListener('dragover', (ev) => {
            if (!draggedFilesItem) return;
            ev.preventDefault();
            b.classList.add('drag-over');
          });
          b.addEventListener('dragleave', () => b.classList.remove('drag-over'));
          b.addEventListener('drop', (ev) => {
            ev.preventDefault();
            b.classList.remove('drag-over');
            if (!draggedFilesItem) return;
            const targetId = b.dataset.gnCrumb || null;
            if (draggedFilesItem.type === 'nb') moveNotebookToFolder(draggedFilesItem.id, targetId);
            else if (draggedFilesItem.type === 'fld') moveFolderToParent(draggedFilesItem.id, targetId);
            draggedFilesItem = null;
          });
        });
      } else {
        const titles = { recents: 'Récents', favorites: 'Favoris', trash: 'Corbeille' };
        crumbsEl.innerHTML = `<span class="gn-files-crumb current">${titles[tab] || 'Documents'}</span>`;
      }
    }

    // 3. Header controls sync
    const searchInput = document.getElementById('gnFilesSearchInput');
    const searchClear = document.getElementById('btnGnFilesSearchClear');
    if (searchInput && searchInput.value !== (state.sidebarSearch || '')) {
      searchInput.value = state.sidebarSearch || '';
    }
    if (searchClear) searchClear.classList.toggle('hidden', !search);

    const sortSel = document.getElementById('gnFilesSortSelect');
    if (sortSel) sortSel.value = state.notebookSortBy || 'date_desc';

    const gridBtn = document.getElementById('btnGnFilesViewGrid');
    const listBtn = document.getElementById('btnGnFilesViewList');
    if (gridBtn) gridBtn.classList.toggle('active', isGrid);
    if (listBtn) listBtn.classList.toggle('active', !isGrid);

    const selModeBtn = document.getElementById('btnGnFilesSelectMode');
    if (selModeBtn) {
      selModeBtn.classList.toggle('active', Boolean(state.filesPageSelectMode));
      if (typeof selModeBtn.setAttribute === 'function') {
        selModeBtn.setAttribute('aria-pressed', state.filesPageSelectMode ? 'true' : 'false');
      }
    }

    const topNewBtn = document.getElementById('btnGnFilesTopNew');
    if (topNewBtn) topNewBtn.classList.toggle('hidden', isTrash);

    // 4. Contextual subbars
    const favBar = document.getElementById('gnFilesFavFilterBar');
    if (favBar) {
      favBar.classList.toggle('hidden', !isFavorites);
      favBar.querySelectorAll('[data-fav-filter]').forEach((p) => {
        p.classList.toggle('active', p.dataset.favFilter === (state.filesPageFavFilter || 'any'));
      });
    }

    const selBar = document.getElementById('gnFilesSelectionBar');
    if (selBar) {
      selBar.classList.toggle('hidden', !state.filesPageSelectMode);
      const count = state.filesPageSelectedIds.size;
      const selCountEl = document.getElementById('gnFilesSelCount');
      if (selCountEl) selCountEl.textContent = `${count} sélectionné${count > 1 ? 's' : ''}`;
      const dupBtn = document.getElementById('btnGnFilesSelDuplicate');
      const starBtn = document.getElementById('btnGnFilesSelStar');
      const moveBtn = document.getElementById('btnGnFilesSelMove');
      const trashBtn = document.getElementById('btnGnFilesSelTrash');
      if (dupBtn) dupBtn.classList.toggle('hidden', isTrash);
      if (starBtn) starBtn.classList.toggle('hidden', isTrash);
      if (moveBtn) moveBtn.textContent = isTrash ? 'Restaurer' : 'Déplacer';
      if (trashBtn) trashBtn.textContent = isTrash ? 'Supprimer' : 'Corbeille';
    }

    const trashBar = document.getElementById('gnFilesTrashBar');
    if (trashBar) {
      trashBar.classList.toggle('hidden', !isTrash || trashCount === 0);
      const sumEl = document.getElementById('gnFilesTrashSummary');
      if (sumEl) {
        sumEl.textContent = `${trashCount} élément${trashCount > 1 ? 's' : ''} dans la corbeille — cliquez sur un élément pour le restaurer.`;
      }
    }

    // 5. Render Grid or List content
    contentEl.className = `gn-files-content ${isGrid ? 'mode-grid' : 'mode-list'}`;
    contentEl.innerHTML = '';

    // GoodNotes dashed "+ Nouveau" card as first tile in Grid mode (Documents tab)
    if (isGrid && tab === 'all' && !search && !state.filesPageSelectMode) {
      const newCard = document.createElement('button');
      newCard.type = 'button';
      newCard.className = 'gn-file-new-card';
      newCard.innerHTML = `
        <div class="gn-file-new-visual">
          <span class="gn-file-new-plus">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </span>
          <span class="gn-file-new-label">Nouveau...</span>
        </div>
      `;
      newCard.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openGnFilesNewMenu(newCard);
      });
      contentEl.appendChild(newCard);
    }

    const toggleSelectKey = (key) => {
      if (state.filesPageSelectedIds.has(key)) state.filesPageSelectedIds.delete(key);
      else state.filesPageSelectedIds.add(key);
      renderGnFilesPage();
    };

    // Render Folders
    folders.forEach((folder) => {
      const key = `fld:${folder.id}`;
      const isSelected = state.filesPageSelectedIds.has(key);
      const counts = getFolderItemCounts(folder.id);
      const countText = formatFolderItemCountLabel(counts);
      const color = folder.color || '#0072ce';
      const iconSvg = getFolderIconSvg(folder.icon || 'folder');
      const el = document.createElement('div');
      el.className = `${isGrid ? 'gn-file-card' : 'gn-file-row'} gn-file-folder${isSelected ? ' selected' : ''}`;
      el.draggable = !isTrash && !state.filesPageSelectMode;

      if (isGrid) {
        el.innerHTML = `
          ${state.filesPageSelectMode ? `<span class="gn-card-check">${isSelected ? '✓' : ''}</span>` : ''}
          ${!isTrash ? `<button class="gn-card-star-btn${folder.starred ? ' starred' : ''}" type="button" data-f-act="star" title="Favori">${folder.starred ? '★' : '☆'}</button>` : ''}
          <div class="gn-folder-visual">
            <div class="gn-folder-shape" style="--gn-folder-color:${escapeHtml(color)}">
              <span class="gn-folder-watermark">${iconSvg}</span>
            </div>
          </div>
          <div class="gn-card-footer">
            <div class="gn-card-meta">
              <div class="gn-card-title" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</div>
              <div class="gn-card-sub">${escapeHtml(countText)}</div>
            </div>
            <button class="gn-card-more-btn" type="button" data-f-act="more" title="Options">⋯</button>
          </div>
        `;
      } else {
        el.innerHTML = `
          ${state.filesPageSelectMode ? `<span class="gn-card-check" style="position:static;">${isSelected ? '✓' : ''}</span>` : ''}
          <div class="gn-row-icon" style="background:${escapeHtml(color)}">${iconSvg}</div>
          <div class="gn-row-main">
            <div class="gn-card-title">${escapeHtml(folder.name)}</div>
            <div class="gn-card-sub">${escapeHtml(countText)}</div>
          </div>
          <span class="gn-row-date">${escapeHtml(formatCompactDate(folder.updatedAt || folder.createdAt))}</span>
          <div class="gn-row-actions">
            ${!isTrash ? `<button class="gn-card-more-btn" type="button" data-f-act="star" style="color:${folder.starred ? '#f59e0b' : ''}" title="Favori">${folder.starred ? '★' : '☆'}</button>` : ''}
            <button class="gn-card-more-btn" type="button" data-f-act="more" title="Options">⋯</button>
          </div>
        `;
      }

      if (!isTrash) {
        el.addEventListener('dragstart', (ev) => {
          draggedFilesItem = { type: 'fld', id: folder.id };
          el.classList.add('dragging');
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = 'move';
            try { ev.dataTransfer.setData('text/plain', key); } catch (_) {}
          }
        });
        el.addEventListener('dragend', () => {
          draggedFilesItem = null;
          el.classList.remove('dragging');
        });
        el.addEventListener('dragover', (ev) => {
          if (!draggedFilesItem) return;
          if (draggedFilesItem.type === 'fld' && isFolderDescendant(folder.id, draggedFilesItem.id)) return;
          ev.preventDefault();
          el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', (ev) => {
          ev.preventDefault();
          el.classList.remove('drag-over');
          if (!draggedFilesItem) return;
          if (draggedFilesItem.type === 'nb') moveNotebookToFolder(draggedFilesItem.id, folder.id);
          else if (draggedFilesItem.type === 'fld') moveFolderToParent(draggedFilesItem.id, folder.id);
          draggedFilesItem = null;
        });
      }

      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        openGnFilesContextMenu('fld', folder, { x: ev.clientX, y: ev.clientY });
      });

      el.addEventListener('click', (ev) => {
        const actBtn = ev.target.closest('[data-f-act]');
        if (actBtn) {
          ev.stopPropagation();
          if (actBtn.dataset.fAct === 'star') {
            folder.starred = !folder.starred;
            folder.updatedAt = Date.now();
            db.saveFolders(state.folders);
            renderNotebooksSidebar();
          } else if (actBtn.dataset.fAct === 'more') {
            openGnFilesContextMenu('fld', folder, actBtn.getBoundingClientRect());
          }
          return;
        }
        if (state.filesPageSelectMode) {
          toggleSelectKey(key);
          return;
        }
        if (isTrash) {
          restoreFolderFromTrash(folder.id);
          return;
        }
        state.filesPageTab = 'all';
        state.currentFolderId = folder.id;
        renderNotebooksSidebar();
      });

      contentEl.appendChild(el);
    });

    // Render Notebooks
    notebooks.forEach((nb) => {
      const key = `nb:${nb.id}`;
      const isSelected = state.filesPageSelectedIds.has(key);
      const pages = state.pagesByNotebook.get(nb.id) || [];
      const firstPage = pages[0] || null;
      const thumbSrc = firstPage && firstPage.thumbnail && firstPage.thumbnail.startsWith('data:image/')
        ? firstPage.thumbnail
        : '';
      const cover = nb.cover || '#0072ce';
      const paperLabel = PAPER_TYPE_LABELS[firstPage?.paperType] || 'Notes';
      const isPdf = Boolean(nb.isPdfNotebook || nb.pdfId);
      const isActiveNb = nb.id === state.activeNotebookId && !isTrash;
      const dateStr = formatCompactDate(nb.updatedAt || nb.createdAt);
      const pagesLabel = `${pages.length} page${pages.length > 1 ? 's' : ''}`;

      const el = document.createElement('div');
      el.className = `${isGrid ? 'gn-file-card' : 'gn-file-row'} gn-file-notebook${isSelected ? ' selected' : ''}`;
      el.draggable = !isTrash && !state.filesPageSelectMode;

      if (isGrid) {
        el.innerHTML = `
          ${state.filesPageSelectMode ? `<span class="gn-card-check">${isSelected ? '✓' : ''}</span>` : ''}
          ${!isTrash ? `<button class="gn-card-star-btn${nb.starred ? ' starred' : ''}" type="button" data-nb-act="star" title="Favori">${nb.starred ? '★' : '☆'}</button>` : ''}
          <div class="gn-nb-visual${thumbSrc ? ' has-thumb' : ''}" style="--gn-nb-cover:${escapeHtml(cover)}">
            ${thumbSrc
              ? `<img class="gn-nb-thumb-img" src="${thumbSrc}" alt="" loading="lazy" />`
              : `<div class="gn-nb-cover-stripe">${escapeHtml(nb.title)}</div>`}
            <div class="gn-nb-pill-row">
              ${isActiveNb ? '<span class="gn-nb-pill active-pill">Ouvert</span>' : ''}
              ${isPdf ? '<span class="gn-nb-pill pdf-pill">PDF</span>' : `<span class="gn-nb-pill">${escapeHtml(paperLabel)}</span>`}
            </div>
          </div>
          <div class="gn-card-footer">
            <div class="gn-card-meta">
              <div class="gn-card-title" title="${escapeHtml(nb.title)}">${escapeHtml(nb.title)}</div>
              <div class="gn-card-sub">${escapeHtml([dateStr, pagesLabel].filter(Boolean).join(' • '))}</div>
            </div>
            <button class="gn-card-more-btn" type="button" data-nb-act="more" title="Options">⋯</button>
          </div>
        `;
      } else {
        el.innerHTML = `
          ${state.filesPageSelectMode ? `<span class="gn-card-check" style="position:static;">${isSelected ? '✓' : ''}</span>` : ''}
          <div class="gn-row-icon" style="background:${escapeHtml(cover)}">
            ${thumbSrc ? `<img src="${thumbSrc}" alt="" loading="lazy" />` : '<span>📓</span>'}
          </div>
          <div class="gn-row-main">
            <div class="gn-card-title">${escapeHtml(nb.title)}${isActiveNb ? ' • Ouvert' : ''}</div>
            <div class="gn-card-sub">${escapeHtml(isPdf ? 'PDF annoté' : paperLabel)}</div>
          </div>
          <span class="gn-row-count">${escapeHtml(pagesLabel)}</span>
          <span class="gn-row-date">${escapeHtml(dateStr)}</span>
          <div class="gn-row-actions">
            ${!isTrash ? `<button class="gn-card-more-btn" type="button" data-nb-act="star" style="color:${nb.starred ? '#f59e0b' : ''}" title="Favori">${nb.starred ? '★' : '☆'}</button>` : ''}
            <button class="gn-card-more-btn" type="button" data-nb-act="more" title="Options">⋯</button>
          </div>
        `;
      }

      if (!isTrash) {
        el.addEventListener('dragstart', (ev) => {
          draggedFilesItem = { type: 'nb', id: nb.id };
          el.classList.add('dragging');
          if (ev.dataTransfer) {
            ev.dataTransfer.effectAllowed = 'move';
            try { ev.dataTransfer.setData('text/plain', key); } catch (_) {}
          }
        });
        el.addEventListener('dragend', () => {
          draggedFilesItem = null;
          el.classList.remove('dragging');
        });
      }

      el.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        openGnFilesContextMenu('nb', nb, { x: ev.clientX, y: ev.clientY });
      });

      el.addEventListener('click', (ev) => {
        const actBtn = ev.target.closest('[data-nb-act]');
        if (actBtn) {
          ev.stopPropagation();
          if (actBtn.dataset.nbAct === 'star') {
            nb.starred = !nb.starred;
            nb.updatedAt = Date.now();
            db.saveNotebook(nb);
            renderNotebooksSidebar();
          } else if (actBtn.dataset.nbAct === 'more') {
            openGnFilesContextMenu('nb', nb, actBtn.getBoundingClientRect());
          }
          return;
        }
        if (state.filesPageSelectMode) {
          toggleSelectKey(key);
          return;
        }
        if (isTrash) {
          restoreNotebookFromTrash(nb.id);
          return;
        }
        selectNotebook(nb.id);
        closeFilesPage();
      });

      contentEl.appendChild(el);
    });

    // Empty state
    if (folders.length === 0 && notebooks.length === 0 && !(isGrid && tab === 'all' && !search && !state.filesPageSelectMode)) {
      const empty = document.createElement('div');
      empty.className = 'gn-files-empty';
      const emptyTitle = isTrash
        ? 'La corbeille est vide'
        : (isFavorites ? 'Aucun favori pour le moment' : (search ? `Aucun résultat pour « ${search} »` : 'Ce dossier est vide'));
      const emptySub = isTrash
        ? 'Les cahiers et dossiers supprimés apparaîtront ici.'
        : (isFavorites ? 'Cliquez sur l’étoile ☆ d’un cahier ou d’un dossier pour le retrouver ici.' : 'Créez un cahier, un dossier ou importez un PDF.');
      empty.innerHTML = `<div class="gn-files-empty-title">${escapeHtml(emptyTitle)}</div><div>${escapeHtml(emptySub)}</div>`;
      contentEl.appendChild(empty);
    }
  }
