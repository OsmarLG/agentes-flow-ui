const STATUS_CLASS = {
  ok: 'ok',
  running: 'running',
  error: 'error',
  success: 'ok'
};

const CANVAS_SIZE = {
  width: 1320,
  height: 920
};

const NODE_LAYOUT = {
  main: { x: 550, y: 72 },
  'elroi-research': { x: 550, y: 228 },
  dev: { x: 225, y: 390 },
  content: { x: 875, y: 390 },
  ops: { x: 550, y: 548 },
  office: { x: 225, y: 706 },
  'agent-factory': { x: 875, y: 706 },
  'elroi-automate': { x: 550, y: 706 }
};

const GRAPH_EDGES = [
  ['main', 'elroi-research'],
  ['elroi-research', 'dev'],
  ['elroi-research', 'content'],
  ['main', 'ops'],
  ['ops', 'office'],
  ['dev', 'agent-factory'],
  ['content', 'main']
];

const VIEW_LIMITS = {
  minScale: 0.55,
  maxScale: 2.2
};

const DEFAULT_POLL_INTERVAL_MS = 5000;
const AUTH_TOKEN_KEY = 'agentes-flow-ui:auth-token';

const viewState = {
  scale: 1,
  x: 0,
  y: 0
};

const pointers = new Map();
let pinchState = null;
let dragState = null;
let selectedAgentId = null;
let currentData = null;
let pollTimer = null;
let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
let firstRender = true;
let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || '';

function setAppNotice(message = '') {
  const notice = document.getElementById('app-notice');
  if (!notice) return;
  notice.hidden = !message;
  notice.textContent = message;
}

function redirectToLogin(message = 'Tu sesión expiró. Vuelve a iniciar sesión.') {
  clearTimeout(pollTimer);
  setAuthToken('');
  setAuthenticatedUI(false);
  setAppNotice(message);
  setLoginFeedback({ error: message, status: '' });
}

const interactionDiagnostics = {
  nodeClicksBound: false,
  controlsBound: false,
  lastNodeClick: '-',
  zoomScale: 1,
  gestureState: 'idle'
};

function normalizeStatus(status) {
  return STATUS_CLASS[status] || 'running';
}

function sourceClass(source) {
  if (source === 'real') return 'source-real';
  if (source === 'mixed') return 'source-mixed';
  if (source === 'unavailable') return 'source-unavailable';
  return 'source-fallback';
}

function sourceLabel(source) {
  if (source === 'real') return 'REAL (OpenClaw)';
  if (source === 'mixed') return 'MIXTO (real + fallback)';
  if (source === 'unavailable') return 'SIN DATOS REALES';
  return 'FALLBACK (mock)';
}

function isDevMode() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || new URLSearchParams(window.location.search).has('dev');
}

function renderDiagnostics() {
  const panel = document.getElementById('binding-diagnostics');
  if (!panel) return;

  panel.hidden = !isDevMode();
  panel.innerHTML = `
    <strong>Diag:</strong>
    <span>nodes:${interactionDiagnostics.nodeClicksBound ? 'ok' : 'off'}</span>
    <span>controls:${interactionDiagnostics.controlsBound ? 'ok' : 'off'}</span>
    <span>zoom:${interactionDiagnostics.zoomScale.toFixed(2)}x</span>
    <span>gesture:${interactionDiagnostics.gestureState}</span>
    <span>last:${interactionDiagnostics.lastNodeClick}</span>
  `;
}

function setAuthenticatedUI(isAuthed) {
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app-shell');
  loginScreen.hidden = isAuthed;
  appShell.hidden = !isAuthed;
  document.body.classList.toggle('auth-locked', !isAuthed);
  document.body.classList.toggle('auth-ready', isAuthed);
}

function setLoginFeedback({ loading = false, status = '', error = '' } = {}) {
  const submitBtn = document.getElementById('login-submit');
  const statusEl = document.getElementById('login-status');
  const errorEl = document.getElementById('login-error');
  const passwordInput = document.getElementById('login-password');
  const identifierInput = document.getElementById('login-identifier');

  submitBtn.disabled = loading;
  passwordInput.disabled = loading;
  identifierInput.disabled = loading;
  submitBtn.textContent = loading ? 'Validando…' : 'Entrar';
  statusEl.textContent = status;
  statusEl.classList.toggle('loading', loading);
  errorEl.textContent = error;
}

function setAuthToken(token) {
  authToken = token || '';
  if (authToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

async function apiFetch(url, options = {}) {
  const latestStoredToken = localStorage.getItem(AUTH_TOKEN_KEY) || '';
  if (!authToken && latestStoredToken) authToken = latestStoredToken;

  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });

  if (response.status === 401) {
    redirectToLogin('Sesión expirada o no autorizada. Inicia sesión para continuar.');
    throw new Error('No autenticado');
  }

  return response;
}

function createToolBadge(tool) {
  const badge = document.createElement('span');
  badge.className = 'tool-badge';
  badge.textContent = tool;
  return badge;
}

function applyViewTransform() {
  const viewport = document.getElementById('graph-viewport');
  viewport.style.transform = `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`;
  interactionDiagnostics.zoomScale = viewState.scale;
  renderDiagnostics();
}

function getDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getMidpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function stagePointFromClient(clientX, clientY) {
  const stage = document.getElementById('graph-stage');
  const rect = stage.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function setZoomAtPoint(nextScale, anchor) {
  const clamped = Math.max(VIEW_LIMITS.minScale, Math.min(VIEW_LIMITS.maxScale, nextScale));
  const prevScale = viewState.scale;
  if (Math.abs(clamped - prevScale) < 0.0001) return;

  const worldX = (anchor.x - viewState.x) / prevScale;
  const worldY = (anchor.y - viewState.y) / prevScale;

  viewState.scale = clamped;
  viewState.x = anchor.x - worldX * clamped;
  viewState.y = anchor.y - worldY * clamped;
  applyViewTransform();
}

function getGraphBounds() {
  const layer = document.getElementById('nodes-layer');
  const nodes = Array.from(layer.querySelectorAll('.graph-node'));
  if (!nodes.length) return { minX: 0, minY: 0, maxX: CANVAS_SIZE.width, maxY: CANVAS_SIZE.height };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const x = node.offsetLeft;
    const y = node.offsetTop;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });

  return { minX, minY, maxX, maxY };
}

function fitGraphToStage() {
  const stage = document.getElementById('graph-stage');
  const bounds = getGraphBounds();
  const pad = 36;
  const graphW = bounds.maxX - bounds.minX;
  const graphH = bounds.maxY - bounds.minY;
  const scaleX = (stage.clientWidth - pad * 2) / graphW;
  const scaleY = (stage.clientHeight - pad * 2) / graphH;
  const targetScale = Math.max(VIEW_LIMITS.minScale, Math.min(VIEW_LIMITS.maxScale, Math.min(scaleX, scaleY, 1.05)));

  viewState.scale = targetScale;
  const graphCenterX = (bounds.minX + bounds.maxX) / 2;
  const graphCenterY = (bounds.minY + bounds.maxY) / 2;
  viewState.x = stage.clientWidth / 2 - graphCenterX * targetScale;
  viewState.y = stage.clientHeight / 2 - graphCenterY * targetScale;
  applyViewTransform();
}

function resolveEdges(agents = []) {
  const ids = new Set((agents || []).map((agent) => agent.id));
  return GRAPH_EDGES.filter(([from, to]) => ids.has(from) && ids.has(to));
}

function drawLinks(edges) {
  const svg = document.getElementById('flow-links');
  const nodesLayer = document.getElementById('nodes-layer');
  svg.setAttribute('width', String(CANVAS_SIZE.width));
  svg.setAttribute('height', String(CANVAS_SIZE.height));
  svg.setAttribute('viewBox', `0 0 ${CANVAS_SIZE.width} ${CANVAS_SIZE.height}`);
  svg.innerHTML = '';

  const lookup = Object.fromEntries(Array.from(nodesLayer.querySelectorAll('.graph-node')).map((n) => [n.dataset.id, n]));
  edges.forEach(([from, to], index) => {
    const fromEl = lookup[from];
    const toEl = lookup[to];
    if (!fromEl || !toEl) return;

    const x1 = fromEl.offsetLeft + fromEl.offsetWidth / 2;
    const y1 = fromEl.offsetTop + fromEl.offsetHeight / 2;
    const x2 = toEl.offsetLeft + toEl.offsetWidth / 2;
    const y2 = toEl.offsetTop + toEl.offsetHeight / 2;

    const curve = Math.max(45, Math.abs(y2 - y1) * 0.45);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${y1 + curve}, ${x2} ${y2 - curve}, ${x2} ${y2}`);
    path.setAttribute('class', `graph-link ${index === edges.length - 1 ? 'back' : ''}`);
    svg.appendChild(path);
  });
}

function collectInteractions(agentId, data, activityData) {
  const direct = (data.activityPanel || [])
    .filter((item) => item.agent === agentId)
    .map((item) => ({ timestamp: item.timestamp, text: item.lastInteraction }));

  const timelineMentions = (data.flowTimeline || [])
    .filter((ev) => String(ev.message || '').toLowerCase().includes(agentId.toLowerCase()))
    .map((ev) => ({ timestamp: ev.timestamp, text: ev.message }));

  const backendActivity = (activityData.byAgent?.[agentId] || []).map((item) => ({
    timestamp: item.timestamp,
    text: `${item.message} (${sourceLabel(item.source)})`
  }));

  return [...backendActivity, ...direct, ...timelineMentions]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 4);
}

function renderDetail(agent, data, activityData) {
  const detail = document.getElementById('node-detail');
  const status = normalizeStatus(agent.status);
  const interactions = collectInteractions(agent.id, data, activityData);

  detail.classList.remove('empty');
  detail.innerHTML = `
    <div class="detail-header">
      <h3>${agent.name}</h3>
      <span class="status-pill ${status}">${status}</span>
    </div>
    <div class="detail-block">
      <h4>Rol</h4>
      <p>${agent.role}</p>
    </div>
    <div class="detail-block">
      <h4>Habilidades</h4>
      <ul class="detail-list">${(agent.keySkills || []).map((skill) => `<li>${skill}</li>`).join('')}</ul>
    </div>
    <div class="detail-block">
      <h4>Últimas interacciones</h4>
      <ul class="detail-list">
        ${interactions.length ? interactions.map((item) => `<li>${item.text}</li>`).join('') : '<li>Sin interacciones recientes</li>'}
      </ul>
    </div>
  `;
}

function renderGraph(data, activityData, { fit = false } = {}) {
  const layer = document.getElementById('nodes-layer');
  const tpl = document.getElementById('graph-node-template');
  layer.innerHTML = '';

  const edges = resolveEdges(data.agents || []);
  interactionDiagnostics.nodeClicksBound = false;

  data.agents.forEach((agent) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const status = normalizeStatus(agent.status);
    const pos = NODE_LAYOUT[agent.id] || { x: 24, y: 24 };

    node.dataset.id = agent.id;
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;
    node.querySelector('.node-name').textContent = agent.name;
    node.querySelector('.node-role').textContent = agent.role;
    node.querySelector('.status-dot').classList.add(`status-${status}`);

    const tools = node.querySelector('.tools-badges');
    (agent.keyTools || []).forEach((tool) => tools.appendChild(createToolBadge(tool)));

    node.addEventListener('click', () => {
      selectedAgentId = agent.id;
      interactionDiagnostics.lastNodeClick = agent.id;
      layer.querySelectorAll('.graph-node').forEach((el) => el.classList.remove('active'));
      node.classList.add('active');
      renderDetail(agent, data, activityData);
      renderDiagnostics();
    });

    interactionDiagnostics.nodeClicksBound = true;
    layer.appendChild(node);
  });

  requestAnimationFrame(() => {
    drawLinks(edges);
    if (fit) fitGraphToStage();
    if (selectedAgentId) {
      const activeNode = layer.querySelector(`.graph-node[data-id="${selectedAgentId}"]`);
      const selectedAgent = (data.agents || []).find((a) => a.id === selectedAgentId);
      if (activeNode && selectedAgent) {
        activeNode.classList.add('active');
        renderDetail(selectedAgent, data, activityData);
      }
    }
  });
}

function renderGeneralActivity(activityData) {
  const list = document.getElementById('general-activity-list');
  const sourceChip = document.getElementById('general-activity-source');
  const source = activityData.sourceSummary?.general || 'fallback';
  sourceChip.className = `chip source-chip ${sourceClass(source)}`;
  sourceChip.textContent = `Origen: ${sourceLabel(source)}`;

  const items = activityData.general || [];
  list.innerHTML = items.length
    ? items
        .slice(0, 8)
        .map(
          (item) => `<li><span class="activity-meta">${new Date(item.timestamp).toLocaleString('es-ES')} · ${sourceLabel(item.source)}</span><span>${item.agent ? `[${item.agent}] ` : ''}${item.message}</span></li>`
        )
        .join('')
    : source === 'unavailable'
      ? '<li>Sin actividad real disponible.</li>'
      : '<li>Sin actividad reciente.</li>';
}

function renderPerAgentActivity(activityData) {
  const wrap = document.getElementById('per-agent-activity');
  const sourceChip = document.getElementById('per-agent-activity-source');
  const source = activityData.sourceSummary?.byAgent || 'fallback';
  sourceChip.className = `chip source-chip ${sourceClass(source)}`;
  sourceChip.textContent = `Origen: ${sourceLabel(source)}`;

  const html = Object.entries(activityData.byAgent || {})
    .map(([agentId, events]) => {
      const body = (events || []).length
        ? events
            .map(
              (ev) => `<li><span class="activity-meta">${new Date(ev.timestamp).toLocaleString('es-ES')} · ${sourceLabel(ev.source)}</span><span>${ev.message}</span></li>`
            )
            .join('')
        : '<li>Sin actividad.</li>';
      return `<section class="agent-activity-card"><h4>${agentId}</h4><ul class="detail-list">${body}</ul></section>`;
    })
    .join('');

  wrap.innerHTML = html || '<p class="muted">Sin actividad por agente.</p>';
}

function updateRefreshChip({ ok, generatedAt, message }) {
  const refresh = document.getElementById('last-refresh');
  refresh.classList.remove('chip-live', 'chip-stale', 'chip-offline');
  if (ok) {
    refresh.classList.add('chip-live');
    refresh.textContent = `LIVE · ${new Date(generatedAt).toLocaleString('es-ES')}`;
    return;
  }
  refresh.classList.add('chip-offline');
  refresh.textContent = message || 'stale/offline';
}

function setupInteractions() {
  const stage = document.getElementById('graph-stage');
  const zoomInBtn = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  const zoomResetBtn = document.getElementById('zoom-reset');

  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    const anchor = stagePointFromClient(event.clientX, event.clientY);
    const factor = Math.exp(-event.deltaY * 0.0015);
    setZoomAtPoint(viewState.scale * factor, anchor);
  }, { passive: false });

  stage.addEventListener('pointerdown', (event) => {
    const isInteractiveTarget = Boolean(event.target.closest('.graph-node, .graph-controls, .zoom-btn'));
    if (isInteractiveTarget) {
      interactionDiagnostics.gestureState = 'node/control interaction';
      renderDiagnostics();
      return;
    }

    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      dragState = { startX: event.clientX, startY: event.clientY, originX: viewState.x, originY: viewState.y };
      interactionDiagnostics.gestureState = 'drag';
    }

    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchState = {
        startDistance: getDistance(a, b),
        startScale: viewState.scale,
        midpoint: stagePointFromClient((a.x + b.x) / 2, (a.y + b.y) / 2)
      };
      dragState = null;
      interactionDiagnostics.gestureState = 'pinch';
    }
    renderDiagnostics();
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pinchState && pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const ratio = getDistance(a, b) / pinchState.startDistance;
      const midpoint = getMidpoint(a, b);
      setZoomAtPoint(pinchState.startScale * ratio, stagePointFromClient(midpoint.x, midpoint.y));
      return;
    }

    if (dragState) {
      viewState.x = dragState.originX + (event.clientX - dragState.startX);
      viewState.y = dragState.originY + (event.clientY - dragState.startY);
      applyViewTransform();
    }
  });

  const endPointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchState = null;
    if (pointers.size === 0) {
      dragState = null;
      interactionDiagnostics.gestureState = 'idle';
      renderDiagnostics();
    }
  };

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', endPointer);

  [zoomInBtn, zoomOutBtn, zoomResetBtn].forEach((btn) => {
    btn.addEventListener('pointerdown', (event) => event.stopPropagation());
  });

  zoomInBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    setZoomAtPoint(viewState.scale * 1.18, { x: stage.clientWidth / 2, y: stage.clientHeight / 2 });
  });
  zoomOutBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    setZoomAtPoint(viewState.scale / 1.18, { x: stage.clientWidth / 2, y: stage.clientHeight / 2 });
  });
  zoomResetBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    fitGraphToStage();
  });

  interactionDiagnostics.controlsBound = true;
  renderDiagnostics();
}

async function parseApiError(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);
  if (payload?.error || payload?.details) {
    const reason = payload.reason ? ` (${payload.reason})` : '';
    const details = payload.details ? ` · ${payload.details}` : '';
    return new Error(`${payload.error || fallbackMessage}${reason}${details}`);
  }
  return new Error(`${fallbackMessage} (${response.status})`);
}

async function loadAgents() {
  const response = await apiFetch('/api/agents');
  if (!response.ok) throw await parseApiError(response, 'API /api/agents no disponible');
  return response.json();
}

async function loadActivity() {
  const response = await apiFetch('/api/activity?limitPerAgent=5');
  if (!response.ok) throw await parseApiError(response, 'API /api/activity no disponible');
  return response.json();
}

async function refreshData() {
  try {
    const [data, activityData] = await Promise.all([loadAgents(), loadActivity()]);
    pollIntervalMs = Number(data.pollIntervalMs) > 0 ? Number(data.pollIntervalMs) : pollIntervalMs;
    currentData = data;
    renderGraph(data, activityData, { fit: firstRender });
    renderGeneralActivity(activityData);
    renderPerAgentActivity(activityData);
    firstRender = false;
    updateRefreshChip({ ok: true, generatedAt: data.generatedAt });

    if (!Array.isArray(data.agents) || data.agents.length === 0) {
      setAppNotice('No hay agentes para mostrar. Verifica la fuente OpenClaw (agents list --json), auth y configuración del servidor.');
    } else {
      setAppNotice('');
    }
  } catch (error) {
    console.error(error);
    const message = String(error?.message || '');
    if (message.toLowerCase().includes('no autenticado')) {
      updateRefreshChip({ ok: false, message: 'sesión expirada' });
      return;
    }
    updateRefreshChip({ ok: false, message: 'stale/offline · API no disponible' });
    if (message.includes('OPENCLAW_SOURCE_UNAVAILABLE')) {
      setAppNotice('Sin datos reales: falló la fuente OpenClaw en backend (openclaw agents list --json). Revisa PATH/permisos/configuración del servicio.');
    } else {
      setAppNotice(`No se pudo actualizar el dashboard: ${message || 'error desconocido'}`);
    }
  } finally {
    clearTimeout(pollTimer);
    if (authToken) pollTimer = setTimeout(refreshData, pollIntervalMs || DEFAULT_POLL_INTERVAL_MS);
  }
}

async function checkSession() {
  if (!authToken) return false;
  try {
    const response = await apiFetch('/api/session');
    return response.ok;
  } catch {
    return false;
  }
}

function setupAuth() {
  const form = document.getElementById('login-form');
  const input = document.getElementById('login-password');
  const identifierInput = document.getElementById('login-identifier');
  const logoutBtn = document.getElementById('logout-btn');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setLoginFeedback({ loading: true, status: 'Validando acceso…', error: '' });

    try {
      const login = identifierInput.value.trim();
      const password = input.value;
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.token) {
        setLoginFeedback({ error: payload.error || 'Contraseña incorrecta o sesión no válida' });
        return;
      }

      setAuthToken(payload.token);
      input.value = '';
      identifierInput.value = '';
      setAppNotice('');
      setLoginFeedback({ status: 'Acceso concedido. Cargando dashboard…' });
      setAuthenticatedUI(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await refreshData();
      setLoginFeedback();
    } catch {
      setLoginFeedback({ error: 'No fue posible iniciar sesión. Intenta de nuevo.' });
    } finally {
      const stillOnLogin = !authToken;
      if (stillOnLogin) setLoginFeedback({});
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearTimeout(pollTimer);
    setAuthToken('');
    setAuthenticatedUI(false);
    setAppNotice('');
    setLoginFeedback({ status: 'Sesión cerrada.' });
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
}

async function init() {
  setAuthenticatedUI(false);
  setupInteractions();
  setupAuth();
  renderDiagnostics();

  window.addEventListener('resize', () => {
    drawLinks(resolveEdges(currentData?.agents || []));
    if (firstRender) fitGraphToStage();
  });

  const authed = await checkSession();
  setAuthenticatedUI(authed);
  if (authed) {
    setAppNotice('');
    await refreshData();
  } else {
    setLoginFeedback({ status: 'Inicia sesión para ver el dashboard en vivo.' });
  }
}

init();
