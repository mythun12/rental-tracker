/* ══════════════════════════════════════════════════════════
   DRIVE.JS — Google Auth & Drive API
   Paste your values for GOOGLE_CLIENT_ID and SHARED_FOLDER_ID
══════════════════════════════════════════════════════════ */

const GOOGLE_CLIENT_ID  = '700900134806-rt7i161neau18ljjg3afsgl8l1c6opcr.apps.googleusercontent.com';   // ← paste here
const SHARED_FOLDER_ID  = '1CR2VMSu_HA_KLXBKk-w8mrfDRNunRd4Z';   // ← paste here
const FILE_NAME         = 'rental-tracker-data.json';
const SCOPES            = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILES_URL   = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL  = 'https://www.googleapis.com/upload/drive/v3/files';

window.Drive = (() => {
  let tokenClient   = null;
  let accessToken   = null;
  let tokenExpiry   = 0;
  let currentUser   = null;
  let _onSignedIn   = null;
  let _onSignedOut  = null;

  /* ─── Public API ──────────────────────────────────────── */

  function init(onSignedIn, onSignedOut) {
    _onSignedIn  = onSignedIn;
    _onSignedOut = onSignedOut;
    waitForGIS();
  }

  function signIn() {
    if (!tokenClient) { console.error('GIS not ready'); return; }
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  }

  function signOut() {
    if (accessToken) {
      try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (_) {}
    }
    _clearSession();
    if (_onSignedOut) _onSignedOut();
  }

  function getCurrentUser() { return currentUser; }
  function isSignedIn()     { return !!accessToken && Date.now() < tokenExpiry; }

  /* ─── Load data from Drive ────────────────────────────── */
  async function loadData() {
    const file = await _findFile();
    if (!file) return null;

    const resp = await _apiGet(
      `${DRIVE_FILES_URL}/${file.id}?alt=media&supportsAllDrives=true`
    );
    const text = await resp.text();
    try { return JSON.parse(text); }
    catch (e) { throw new Error('Could not parse data file: ' + e.message); }
  }

  /* ─── Save data to Drive (read-before-write) ──────────── */
  async function saveData(localData) {
    // Read current version first to avoid overwriting concurrent edits
    let serverData = null;
    try { serverData = await loadData(); } catch (_) {}

    let merged = localData;
    if (serverData) {
      merged = _mergeData(serverData, localData);
    }

    // Stamp author and timestamp
    const user = getCurrentUser();
    merged.lastUpdatedBy = user ? user.name : 'Unknown';
    merged.lastUpdatedAt = new Date().toISOString();

    const body = JSON.stringify(merged, null, 2);
    const file = await _findFile();

    if (file) {
      await _apiRequest(
        `${DRIVE_UPLOAD_URL}/${file.id}?uploadType=media&supportsAllDrives=true`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }
      );
    } else {
      await _createFile(body);
    }

    return merged;
  }

  /* ─── Internal helpers ────────────────────────────────── */

  function waitForGIS() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      _initTokenClient();
    } else {
      // GIS script loads asynchronously — poll briefly
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          clearInterval(interval);
          _initTokenClient();
        } else if (attempts > 50) {
          clearInterval(interval);
          console.error('Google Identity Services failed to load.');
        }
      }, 200);
    }
  }

  function _initTokenClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope:     SCOPES,
      callback:  _handleTokenResponse,
      error_callback: (err) => {
        console.warn('GIS error:', err);
        if (_onSignedOut) _onSignedOut();
      }
    });

    // Attempt silent re-auth if user was previously signed in
    const savedEmail = localStorage.getItem('rt_user_email');
    if (savedEmail) {
      tokenClient.requestAccessToken({ prompt: '', hint: savedEmail });
    }
  }

  function _handleTokenResponse(response) {
    if (response.error) {
      console.warn('Token error:', response.error);
      _clearSession();
      if (_onSignedOut) _onSignedOut();
      return;
    }
    accessToken  = response.access_token;
    tokenExpiry  = Date.now() + (Number(response.expires_in) * 1000);

    _fetchUserInfo().then(user => {
      currentUser = user;
      localStorage.setItem('rt_user_email', user.email || '');
      if (_onSignedIn) _onSignedIn(user);
    }).catch(err => {
      console.error('Could not fetch user info:', err);
      // Still proceed — treat as signed in without user info
      currentUser = { name: 'User', email: '' };
      if (_onSignedIn) _onSignedIn(currentUser);
    });
  }

  async function _fetchUserInfo() {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!resp.ok) throw new Error('userinfo failed: ' + resp.status);
    return resp.json();
  }

  function _clearSession() {
    accessToken  = null;
    tokenExpiry  = 0;
    currentUser  = null;
    localStorage.removeItem('rt_user_email');
  }

  async function _ensureToken() {
    if (accessToken && Date.now() < tokenExpiry - 60_000) return; // still valid
    // Token expired — try silent refresh
    await new Promise((resolve, reject) => {
      const originalCb = tokenClient.callback;
      tokenClient.callback = (response) => {
        tokenClient.callback = originalCb;
        if (response.error) { reject(new Error('Token refresh failed: ' + response.error)); return; }
        accessToken = response.access_token;
        tokenExpiry = Date.now() + (Number(response.expires_in) * 1000);
        resolve();
      };
      const savedEmail = localStorage.getItem('rt_user_email');
      tokenClient.requestAccessToken({ prompt: '', hint: savedEmail || undefined });
    });
  }

  async function _apiRequest(url, options = {}) {
    await _ensureToken();
    const resp = await fetch(url, {
      ...options,
      headers: { 'Authorization': `Bearer ${accessToken}`, ...(options.headers || {}) }
    });
    if (!resp.ok) {
      const msg = await resp.text().catch(() => resp.statusText);
      throw new Error(`Drive API ${resp.status}: ${msg}`);
    }
    return resp;
  }

  async function _apiGet(url) {
    return _apiRequest(url, { method: 'GET' });
  }

  async function _findFile() {
    const q = encodeURIComponent(
      `name='${FILE_NAME}' and '${SHARED_FOLDER_ID}' in parents and trashed=false`
    );
    const resp = await _apiGet(
      `${DRIVE_FILES_URL}?q=${q}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`
    );
    const data = await resp.json();
    return (data.files && data.files.length > 0) ? data.files[0] : null;
  }

  async function _createFile(content) {
    const boundary = 'rt_boundary_x7z';
    const metadata = JSON.stringify({ name: FILE_NAME, parents: [SHARED_FOLDER_ID] });
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      content,
      `--${boundary}--`
    ].join('\r\n');

    return _apiRequest(
      `${DRIVE_UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true`,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
    );
  }

  /* ─── Merge: updated properties take precedence ────────── */
  function _mergeData(server, local) {
    const byId = {};
    (server.properties || []).forEach(p => { byId[p.id] = p; });
    (local.properties  || []).forEach(p => { byId[p.id] = p; }); // local wins

    return {
      ...server,
      ...local,
      properties: Object.values(byId)
    };
  }

  return { init, signIn, signOut, getCurrentUser, isSignedIn, loadData, saveData };
})();
