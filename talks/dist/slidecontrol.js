/* SlideControl 1.0.0 | MIT | protocol 1 | no runtime dependencies */
(function (global) {
  'use strict';
  const attached = new WeakMap();
  const actions = Object.freeze({ LEFT: 'left', RIGHT: 'right', UP: 'up', DOWN: 'down',
    NEXT: 'next', PREVIOUS: 'prev', NEXT_FRAGMENT: 'nextFragment', PREVIOUS_FRAGMENT: 'prevFragment' });
  const events = ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden',
    'overviewshown', 'overviewhidden', 'paused', 'resumed'];
  const uuid = () => global.crypto.randomUUID();
  const integer = (n, min = 0) => Number.isInteger(n) && n >= min && n <= 10000;
  const text = (tag, value) => { const el = document.createElement(tag); el.textContent = value; return el; };
  const editing = target => target instanceof Element &&
    (target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])') || target.isContentEditable);

  function SlideControl(options = {}) {
    let delegate = null;
    const plugin = { id: 'slidecontrol', init(deck) { delegate = attach(deck, options); },
      destroy() { if (delegate) delegate.destroy(); delegate = null; } };
    for (const method of ['enable', 'disable', 'toggle', 'openSetup', 'closeSetup', 'setOwnerCredential',
      'setEndpoint', 'createPairingCode', 'approvePairing', 'revokeDevice', 'getStatus', 'publishState']) {
      plugin[method] = (...args) => delegate && delegate[method](...args);
    }
    plugin.detach = plugin.destroy;
    return plugin;
  }

  function attach(deck, options = {}) {
    if (attached.has(deck)) return attached.get(deck);
    if (!deck || typeof deck.on !== 'function' || typeof deck.next !== 'function') throw new TypeError('A Reveal instance is required.');
    let instanceId = uuid();
    let endpoint = options.endpoint || 'wss://slidecontrol.benterre.com/ws';
    let ownerToken = '', presenterToken = '', sessionId = '', generation = '';
    let enabled = false, destroyed = false, registered = false, epoch = 0, socket = null;
    let retryTimer = null, heartbeat = null, authTimer = null, updateTimer = null, pairTimer = null;
    let revision = 0, retries = 0, lastReceived = 0, phase = 'disabled', error = '';
    let dot = null, panel = null, style = null, previousFocus = null, code = null;
    let devices = [], requests = new Map(), seen = new Map();
    let serverTime = 0, syncStarted = 0, pingStarted = 0;
    const now = () => performance.now();
    const title = () => String(options.title || document.title || 'Presentation').slice(0, 160);
    const suppressed = () => new URLSearchParams(location.search).has('print-pdf') ||
      new URLSearchParams(location.search).has('receiver') ||
      new URLSearchParams(location.search).has('speaker') ||
      (deck.isSpeakerNotes && deck.isSpeakerNotes()) || (deck.isPrintView && deck.isPrintView());

    function validEndpoint(value) {
      const u = new URL(value);
      if (u.username || u.password || u.search || u.hash || u.pathname !== '/ws') throw new Error('Use a WebSocket /ws URL without credentials, query or fragment.');
      if (u.protocol !== 'wss:' && !(options.allowInsecureDevelopment === true && u.protocol === 'ws:')) throw new Error('Secure wss:// is required.');
      return u.href;
    }
    function status() { return { enabled, registered, phase, error, endpoint, instanceId, sessionId, generation, revision,
      devices: devices.map(d => ({ deviceId: d.deviceId, name: d.name, connected: d.connected })) }; }
    function host() { return document.fullscreenElement || document.body; }
    function css() {
      if (style) return;
      style = text('style', '.slidecontrol-dot{position:fixed;top:12px;left:12px;width:14px;height:14px;border:2px solid white;border-radius:50%;padding:0;z-index:2147483646;box-shadow:0 0 0 1px #333;cursor:pointer}.slidecontrol-panel{position:fixed;top:36px;left:12px;width:min(360px,calc(100vw - 48px));max-height:calc(100vh - 64px);overflow:auto;z-index:2147483647;background:#111827;color:#f8fafc;border:1px solid #64748b;border-radius:12px;padding:18px;font:15px/1.45 system-ui,sans-serif;text-align:left;box-shadow:0 6px 32px #0008}.slidecontrol-panel h2{font:600 19px system-ui;margin:0 0 12px}.slidecontrol-panel label{display:block;margin:10px 0 4px}.slidecontrol-panel input{box-sizing:border-box;width:100%;background:#fff;color:#111827;border:1px solid #94a3b8;border-radius:5px;padding:8px;font:inherit}.slidecontrol-panel button{margin:8px 6px 0 0;padding:9px 12px;min-height:36px;border:0;border-radius:6px;background:#e2e8f0;color:#111827;font:inherit;cursor:pointer}.slidecontrol-panel button:disabled{opacity:.5}.slidecontrol-panel p{margin:8px 0;overflow-wrap:anywhere}.slidecontrol-panel .sc-code{font:700 27px monospace;letter-spacing:.15em}.slidecontrol-panel .sc-details{font-size:12px;color:#cbd5e1}@media print{.slidecontrol-dot,.slidecontrol-panel{display:none!important}}');
      document.head.append(style);
    }
    function position() { if (dot) host().append(dot); if (panel) host().append(panel); }
    function renderStatus() {
      if (enabled && !dot) {
        css(); dot = text('button', ''); dot.className = 'slidecontrol-dot'; dot.type = 'button';
        dot.addEventListener('click', openSetup); host().append(dot);
      }
      const label = phase === 'registered' ? 'Remote control ready' : `Remote control: ${error || phase}`;
      if (dot) { dot.style.background = registered ? '#22c55e' : (phase === 'error' ? '#ef4444' : '#f59e0b');
        dot.title = `${label}. Open setup`; dot.setAttribute('aria-label', `${label}. Open setup`); }
      if (panel) {
        panel.querySelector('[data-status]').textContent = label;
        panel.querySelector('[data-identity]').textContent = `Instance ${instanceId}\nSession ${sessionId || 'not registered'}`;
        const codeEl = panel.querySelector('[data-code]');
        codeEl.textContent = code && Date.now() < code.expiresAt ? `${code.code}` : '';
        panel.querySelector('[data-pair]').disabled = !registered;
        panel.querySelector('[data-toggle]').textContent = enabled ? 'Disable remote control' : 'Enable remote control';
        const list = panel.querySelector('[data-devices]'); list.replaceChildren();
        for (const d of devices) { const row = text('p', `${d.name} — ${d.connected ? 'connected' : 'remembered'} `);
          row.append(button('Revoke', () => revokeDevice(d.deviceId))); list.append(row); }
        if (!devices.length) list.append(text('p', 'No approved devices.'));
        const pending = panel.querySelector('[data-requests]'); pending.replaceChildren();
        for (const r of requests.values()) { if (r.expiresAt <= Date.now()) { requests.delete(r.requestId); continue; }
          const row = text('p', `Pair “${r.name}”? `);
          row.append(button('Approve', () => approvePairing(r.requestId, true)), button('Deny', () => approvePairing(r.requestId, false))); pending.append(row); }
      }
    }
    function setPhase(next, message = '') { phase = next; error = message; renderStatus(); }
    function button(label, fn) { const b = text('button', label); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function openSetup() {
      if (destroyed || suppressed()) return;
      if (panel) { panel.querySelector('input').focus(); return; }
      css(); previousFocus = document.activeElement; panel = text('section', ''); panel.className = 'slidecontrol-panel';
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'SlideControl setup');
      panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeSetup(); } });
      panel.append(text('h2', 'SlideControl'));
      const stateEl = text('p', ''); stateEl.dataset.status = ''; stateEl.setAttribute('role', 'status'); panel.append(stateEl);
      const endpointLabel = text('label', 'Relay endpoint'); const endpointInput = document.createElement('input');
      endpointInput.value = endpoint; endpointInput.type = 'url'; endpointInput.autocomplete = 'off'; endpointLabel.append(endpointInput); panel.append(endpointLabel);
      panel.append(button('Save endpoint', () => { try { setEndpoint(endpointInput.value); } catch (_) { setPhase('error', 'Use a valid secure /ws endpoint.'); } }));
      const tokenLabel = text('label', 'Private owner credential (memory only)'); const tokenInput = document.createElement('input');
      tokenInput.type = 'password'; tokenInput.autocomplete = 'off'; tokenInput.spellcheck = false; tokenLabel.append(tokenInput); panel.append(tokenLabel);
      panel.append(button('Authenticate', () => { const token = tokenInput.value; tokenInput.value = ''; setOwnerCredential(token); enable(); }));
      const identity = text('p', ''); identity.dataset.identity = ''; identity.className = 'sc-details'; panel.append(identity);
      const pairing = button('Create pairing code', createPairingCode); pairing.dataset.pair = ''; panel.append(pairing);
      const codeEl = text('p', ''); codeEl.dataset.code = ''; codeEl.className = 'sc-code'; panel.append(codeEl);
      panel.append(text('p', 'Code expires in two minutes. Approve only your device. Pair privately before projecting.'));
      const requestsEl = text('div', ''); requestsEl.dataset.requests = ''; panel.append(requestsEl);
      panel.append(text('h2', 'Approved controllers')); const list = text('div', ''); list.dataset.devices = ''; panel.append(list);
      const toggleButton = button('', toggle); toggleButton.dataset.toggle = ''; panel.append(toggleButton, button('Close', closeSetup));
      host().append(panel); renderStatus(); endpointInput.focus();
      if (registered) send({ type: 'devices.list' });
    }
    function closeSetup() { if (!panel) return; panel.remove(); panel = null;
      if (previousFocus && previousFocus.isConnected && !previousFocus.classList.contains('slidecontrol-dot')) previousFocus.focus();
      else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); previousFocus = null; }
    function setEndpoint(value) { const next = validEndpoint(value); if (next === endpoint) return;
      disable(); endpoint = next; renderStatus(); }
    function setOwnerCredential(value) {
      if (typeof value !== 'string' || value.length < 16 || value.length > 512) { setPhase('error', 'Enter the private owner credential.'); return false; }
      if (registered) send({ type: 'unregister', sessionId, generation });
      if (enabled) stopSocket();
      instanceId = uuid();
      ownerToken = value; presenterToken = ''; sessionId = ''; generation = '';
      if (enabled) connect(); return true;
    }
    function send(body) {
      if (!enabled || !socket || socket.readyState !== WebSocket.OPEN) return false;
      if (socket.bufferedAmount > 65536) { socket.close(1013, 'Backpressure'); return false; }
      socket.send(JSON.stringify({ v: 1, ...body })); return true;
    }
    function stopSocket() {
      epoch++; registered = false;
      clearTimeout(retryTimer); clearTimeout(authTimer); clearTimeout(updateTimer); clearInterval(heartbeat);
      retryTimer = authTimer = updateTimer = heartbeat = null;
      if (socket) { const old = socket; socket = null; old.onopen = old.onmessage = old.onclose = old.onerror = null;
        if (old.readyState < WebSocket.CLOSING) old.close(1000, 'Stopped'); }
    }
    function connect() {
      if (!enabled || destroyed || suppressed()) return;
      if (!ownerToken && !presenterToken) { setPhase('error', 'Authentication required. Open setup.'); return; }
      try { endpoint = validEndpoint(endpoint); } catch (_) { setPhase('error', 'Use a valid secure /ws endpoint.'); return; }
      const mine = ++epoch; registered = false; setPhase('connecting');
      const ws = new WebSocket(endpoint); socket = ws; const current = () => enabled && !destroyed && epoch === mine && socket === ws;
      authTimer = setTimeout(() => { if (current()) ws.close(1000, 'Authentication timeout'); }, 10000);
      ws.onopen = () => { if (!current()) return; setPhase('authenticating'); lastReceived = now();
        send(presenterToken ? { type: 'auth', role: 'presenter', token: presenterToken, sessionId, instanceId } : { type: 'auth', role: 'owner', token: ownerToken }); };
      ws.onmessage = event => {
        if (!current() || typeof event.data !== 'string' || event.data.length > 16384) return;
        let m; try { m = JSON.parse(event.data); } catch (_) { ws.close(1002, 'Invalid protocol'); return; }
        if (!m || m.v !== 1 || typeof m.type !== 'string') { ws.close(1002, 'Invalid protocol'); return; }
        lastReceived = now();
        if (m.type === 'ping') { send({ type: 'pong' }); return; }
        if (m.type === 'pong') { if (Number.isFinite(m.serverTime) && pingStarted) { serverTime = m.serverTime; syncStarted = pingStarted; pingStarted = 0; } return; }
        if (m.type === 'authenticated') { syncStarted = now(); send({ type: 'register', instanceId, title: title() }); return; }
        if (m.type === 'registered') {
          if (typeof m.sessionId !== 'string' || typeof m.generation !== 'string' || typeof m.presenterToken !== 'string') return;
          sessionId = m.sessionId; generation = m.generation; presenterToken = m.presenterToken; ownerToken = '';
          serverTime = Number.isFinite(m.serverTime) ? m.serverTime : Date.now();
          revision = 0; seen.clear(); registered = true; retries = 0; clearTimeout(authTimer); setPhase('registered');
          publishState(); send({ type: 'devices.list' });
          heartbeat = setInterval(() => { if (!current()) return;
            if (now() - lastReceived > 45000) { ws.close(1000, 'Heartbeat timeout'); return; }
            pingStarted = now(); send({ type: 'ping' }); }, 15000); return;
        }
        if (!registered) { if (m.type === 'error') { ownerToken = ''; presenterToken = ''; setPhase('error', 'Authentication failed or session ended. Authenticate again.'); } return; }
        if (m.type === 'command') applyCommand(m);
        else if (m.type === 'state.request') publishState();
        else if (m.type === 'pair.code' && /^\d{8}$/.test(m.code) && Number.isFinite(m.expiresAt)) {
          code = { code: m.code, expiresAt: m.expiresAt }; clearTimeout(pairTimer);
          pairTimer = setTimeout(() => { code = null; renderStatus(); }, Math.max(0, m.expiresAt - Date.now())); renderStatus();
        } else if (m.type === 'pair.requested' && typeof m.requestId === 'string' && typeof m.name === 'string') {
          requests.set(m.requestId, { requestId: m.requestId, name: m.name.slice(0, 80), expiresAt: m.expiresAt });
          if (requests.size > 32) requests.delete(requests.keys().next().value); renderStatus();
        } else if (m.type === 'devices' && Array.isArray(m.devices)) { devices = m.devices.slice(0, 100); renderStatus(); }
        else if (m.type === 'error') { error = `Operation rejected (${String(m.code || 'error').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 60)}).`; renderStatus(); }
      };
      ws.onerror = () => { if (current()) setPhase('error', 'Relay unavailable.'); };
      ws.onclose = () => {
        if (!current()) return; registered = false; socket = null; clearInterval(heartbeat); clearTimeout(authTimer);
        heartbeat = authTimer = null;
        if (!ownerToken && !presenterToken) { setPhase('error', 'Authenticate to connect.'); return; }
        setPhase('reconnecting');
        retryTimer = setTimeout(() => { retryTimer = null; if (enabled && epoch === mine) connect(); },
          Math.min(30000, 500 * 2 ** Math.min(retries++, 6)) * (0.75 + Math.random() * 0.5));
      };
    }
    function snapshot() {
      const ready = !!deck.isReady(); const indices = ready ? deck.getIndices() : { h: 0, v: 0, f: -1 };
      const routes = ready ? deck.availableRoutes() : {}; const fragments = ready ? deck.availableFragments() : {};
      return { revision, title: title(), active: enabled && registered, ready,
        h: indices.h || 0, v: indices.v || 0, f: Number.isInteger(indices.f) ? indices.f : -1,
        slideNumber: ready ? deck.getSlidePastCount() + 1 : 0, totalSlides: ready ? deck.getTotalSlides() : 0,
        progress: ready ? Math.max(0, Math.min(1, deck.getProgress() || 0)) : 0,
        routes: { left: !!routes.left, right: !!routes.right, up: !!routes.top, down: !!routes.bottom },
        fragments: { prev: !!fragments.prev, next: !!fragments.next },
        overview: ready && deck.isOverview(), paused: ready && deck.isPaused() };
    }
    function publishState() { clearTimeout(updateTimer); updateTimer = null;
      if (!enabled || !registered) return null; revision++; const state = snapshot();
      send({ type: 'state', sessionId, generation, state }); return state; }
    function stateChanged() { if (enabled && registered && updateTimer === null) {
      const mine = epoch; updateTimer = setTimeout(() => { updateTimer = null; if (mine === epoch) publishState(); }, 0); } }
    function applyCommand(m) {
      if (!enabled || !registered || m.sessionId !== sessionId || m.generation !== generation) return;
      if (typeof m.id !== 'string' || m.id.length > 64) return;
      const prior = seen.get(m.id); if (prior && now() - prior.at < 60000) { send(prior.result); return; }
      let result = 'rejected';
      const deadlinePassed = !Number.isFinite(m.expiresAt) || !Number.isFinite(m.remainingMs) || m.remainingMs <= 0 ||
        (serverTime + (now() - syncStarted)) >= m.expiresAt;
      if (deadlinePassed) result = 'expired';
      else if (deck.isReady() && !suppressed()) {
        const before = JSON.stringify(deck.getState());
        try {
          if (Object.hasOwn(actions, m.action)) { deck[actions[m.action]](); result = 'applied'; }
          else if (m.action === 'GOTO' && m.target && integer(m.target.h) && integer(m.target.v) && integer(m.target.f, -1)) {
            const slide = deck.getSlide(m.target.h, m.target.v); const actual = slide && deck.getSlides().includes(slide);
            const steps = slide ? [...new Set([...slide.querySelectorAll('.fragment')].map(el => Number(el.getAttribute('data-fragment-index'))))] : [];
            if (actual && (m.target.f === -1 || steps.includes(m.target.f))) { deck.slide(m.target.h, m.target.v, m.target.f); result = 'applied'; }
          }
          if (result === 'applied' && JSON.stringify(deck.getState()) === before) result = 'noop';
        } catch (_) { result = 'rejected'; }
      }
      publishState(); const response = { type: 'command.result', id: m.id, sessionId, generation, status: result, revision };
      seen.set(m.id, { at: now(), result: response });
      while (seen.size > 256) seen.delete(seen.keys().next().value); send(response);
    }
    function online() { if (enabled && !registered) { stopSocket(); connect(); } }
    function enable() {
      if (destroyed || enabled || suppressed()) return;
      enabled = true; retries = 0; events.forEach(e => deck.on(e, stateChanged));
      document.addEventListener('fullscreenchange', position); global.addEventListener('online', online);
      connect(); renderStatus(); if (!ownerToken && !presenterToken && !registered) openSetup();
    }
    function disable() {
      if (registered) send({ type: 'unregister', sessionId, generation });
      enabled = false; stopSocket(); clearTimeout(pairTimer); pairTimer = null;
      events.forEach(e => deck.off(e, stateChanged)); document.removeEventListener('fullscreenchange', position); global.removeEventListener('online', online);
      ownerToken = presenterToken = sessionId = generation = ''; instanceId = uuid(); requests.clear(); seen.clear(); devices = []; code = null;
      if (dot) { dot.remove(); dot = null; } closeSetup(); if (style) { style.remove(); style = null; }
      phase = 'disabled'; error = '';
    }
    function toggle() { if (enabled) disable(); else enable(); }
    function keydown(e) {
      if (destroyed || e.repeat || editing(e.target) || suppressed()) return;
      const root = deck.getRevealElement();
      // On a page with multiple embedded decks, only the focused deck owns shortcuts.
      if (document.querySelectorAll('.reveal').length > 1 && !root.contains(document.activeElement)) return;
      if (e.key === (options.toggleKey || 'F8') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); e.stopPropagation(); if (e.shiftKey) openSetup(); else toggle(); }
    }
    function createPairingCode() { if (registered) send({ type: 'pair.create', sessionId }); }
    function approvePairing(requestId, approve) { if (!requests.has(requestId) || !registered) return;
      send({ type: 'pair.decide', requestId, approve: !!approve }); requests.delete(requestId); renderStatus();
      send({ type: 'devices.list' }); }
    function revokeDevice(deviceId) { if (registered) { send({ type: 'device.revoke', deviceId }); send({ type: 'devices.list' }); } }
    function destroy() { if (destroyed) return; disable(); closeSetup(); if (style) style.remove(); style = null;
      document.removeEventListener('keydown', keydown, true); global.removeEventListener('pagehide', disable); attached.delete(deck); destroyed = true; }
    const api = { enable, disable, toggle, destroy, detach: destroy, openSetup, closeSetup, setEndpoint,
      setOwnerCredential, createPairingCode, approvePairing, revokeDevice, getStatus: status, publishState };
    attached.set(deck, api); document.addEventListener('keydown', keydown, true); global.addEventListener('pagehide', disable);
    return api;
  }
  SlideControl.attach = attach;
  SlideControl.version = '1.0.0';
  global.SlideControl = SlideControl;
})(window);
