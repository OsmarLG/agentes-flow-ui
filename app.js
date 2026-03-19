const STATUS_CLASS = {
  ok: 'ok',
  running: 'running',
  error: 'error',
  success: 'ok'
};

const CANVAS_SIZE = {
  width: 1200,
  height: 820
};

const NODE_LAYOUT = {
  main: { x: 552, y: 70 },
  dev: { x: 210, y: 265 },
  content: { x: 865, y: 265 },
  ops: { x: 552, y: 450 },
  office: { x: 210, y: 645 },
  'agent-factory': { x: 865, y: 645 }
};

const GRAPH_EDGES = [
  ['main', 'dev'],
  ['main', 'content'],
  ['main', 'ops'],
  ['ops', 'office'],
  ['dev', 'agent-factory'],
  ['content', 'main']
];

const VIEW_LIMITS = {
  minScale: 0.55,
  maxScale: 2.2
};

const viewState = {
  scale: 1,
  x: 0,
  y: 0
};

const pointers = new Map();
let pinchState = null;
let dragState = null;
let selectedAgentId = null;

function normalizeStatus(status) {
  return STATUS_CLASS[status] || 'running';
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
}

function getDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getMidpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function stagePointFromClient(clientX, clientY) {
  const stage = document.getElementById('graph-stage');
  const rect = stage.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
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

  if (!nodes.length) {
    return { minX: 0, minY: 0, maxX: CANVAS_SIZE.width, maxY: CANVAS_SIZE.height };
  }

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
  const stageW = stage.clientWidth;
  const stageH = stage.clientHeight;
  const pad = 36;

  const graphW = bounds.maxX - bounds.minX;
  const graphH = bounds.maxY - bounds.minY;

  const scaleX = (stageW - pad * 2) / graphW;
  const scaleY = (stageH - pad * 2) / graphH;

  const targetScale = Math.max(
    VIEW_LIMITS.minScale,
    Math.min(VIEW_LIMITS.maxScale, Math.min(scaleX, scaleY, 1.05))
  );

  viewState.scale = targetScale;

  const graphCenterX = (bounds.minX + bounds.maxX) / 2;
  const graphCenterY = (bounds.minY + bounds.maxY) / 2;

  viewState.x = stageW / 2 - graphCenterX * targetScale;
  viewState.y = stageH / 2 - graphCenterY * targetScale;

  applyViewTransform();
}

function drawLinks(edges) {
  const svg = document.getElementById('flow-links');
  const nodesLayer = document.getElementById('nodes-layer');

  svg.setAttribute('width', String(CANVAS_SIZE.width));
  svg.setAttribute('height', String(CANVAS_SIZE.height));
  svg.setAttribute('viewBox', `0 0 ${CANVAS_SIZE.width} ${CANVAS_SIZE.height}`);
  svg.innerHTML = '';

  const lookup = Object.fromEntries(
    Array.from(nodesLayer.querySelectorAll('.graph-node')).map((node) => [node.dataset.id, node])
  );

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

function collectInteractions(agentId, data) {
  const direct = data.activityPanel
    .filter((item) => item.agent === agentId)
    .map((item) => ({
      timestamp: item.timestamp,
      text: item.lastInteraction
    }));

  const timelineMentions = data.flowTimeline
    .filter((ev) => ev.message.toLowerCase().includes(agentId.toLowerCase()))
    .map((ev) => ({
      timestamp: ev.timestamp,
      text: ev.message
    }));

  return [...direct, ...timelineMentions]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 4);
}

function renderDetail(agent, data) {
  const detail = document.getElementById('node-detail');
  const status = normalizeStatus(agent.status);
  const interactions = collectInteractions(agent.id, data);

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
      <ul class="detail-list">
        ${agent.keySkills.map((skill) => `<li>${skill}</li>`).join('')}
      </ul>
    </div>
    <div class="detail-block">
      <h4>Últimas interacciones</h4>
      <ul class="detail-list">
        ${interactions.length ? interactions.map((item) => `<li>${item.text}</li>`).join('') : '<li>Sin interacciones recientes</li>'}
      </ul>
    </div>
  `;
}

function renderGraph(data) {
  const layer = document.getElementById('nodes-layer');
  const tpl = document.getElementById('graph-node-template');
  layer.innerHTML = '';

  data.agents.forEach((agent) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const status = normalizeStatus(agent.status);
    const pos = NODE_LAYOUT[agent.id] || { x: 24, y: 24 };

    node.dataset.id = agent.id;
    node.style.left = `${pos.x}px`;
    node.style.top = `${pos.y}px`;

    node.querySelector('.node-name').textContent = agent.name;
    node.querySelector('.node-role').textContent = agent.role;

    const dot = node.querySelector('.status-dot');
    dot.classList.add(`status-${status}`);

    const tools = node.querySelector('.tools-badges');
    agent.keyTools.forEach((tool) => tools.appendChild(createToolBadge(tool)));

    node.addEventListener('click', () => {
      selectedAgentId = agent.id;
      layer.querySelectorAll('.graph-node').forEach((el) => el.classList.remove('active'));
      node.classList.add('active');
      renderDetail(agent, data);
    });

    layer.appendChild(node);
  });

  requestAnimationFrame(() => {
    drawLinks(GRAPH_EDGES);
    fitGraphToStage();
  });
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
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1 && !event.target.closest('.graph-node')) {
      dragState = {
        startX: event.clientX,
        startY: event.clientY,
        originX: viewState.x,
        originY: viewState.y
      };
    }

    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchState = {
        startDistance: getDistance(a, b),
        startScale: viewState.scale,
        midpoint: stagePointFromClient((a.x + b.x) / 2, (a.y + b.y) / 2)
      };
      dragState = null;
    }
  });

  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pinchState && pointers.size >= 2) {
      const [a, b] = Array.from(pointers.values());
      const distance = getDistance(a, b);
      const ratio = distance / pinchState.startDistance;
      const midpoint = getMidpoint(a, b);
      pinchState.midpoint = stagePointFromClient(midpoint.x, midpoint.y);
      setZoomAtPoint(pinchState.startScale * ratio, pinchState.midpoint);
      return;
    }

    if (dragState) {
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      viewState.x = dragState.originX + dx;
      viewState.y = dragState.originY + dy;
      applyViewTransform();
    }
  });

  const endPointer = (event) => {
    pointers.delete(event.pointerId);

    if (pointers.size < 2) {
      pinchState = null;
    }

    if (pointers.size === 0) {
      dragState = null;
    }
  };

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', endPointer);

  zoomInBtn.addEventListener('click', () => {
    const center = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    setZoomAtPoint(viewState.scale * 1.18, center);
  });

  zoomOutBtn.addEventListener('click', () => {
    const center = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    setZoomAtPoint(viewState.scale / 1.18, center);
  });

  zoomResetBtn.addEventListener('click', () => fitGraphToStage());
}

function fixMockFactoryStatus(data) {
  const factory = data.agents.find((a) => a.id === 'agent-factory');
  if (!factory) return;

  const hasRealErrorEvent = data.activityPanel.some(
    (item) => item.agent === 'agent-factory' && normalizeStatus(item.status) === 'error'
  );

  if (!hasRealErrorEvent && normalizeStatus(factory.status) === 'error') {
    factory.status = 'ok';
  }
}

async function init() {
  try {
    const response = await fetch('./data/mock-data.json');
    if (!response.ok) throw new Error('No se pudo cargar mock-data.json');

    const data = await response.json();
    fixMockFactoryStatus(data);
    renderGraph(data);
    setupInteractions();

    const refresh = document.getElementById('last-refresh');
    refresh.textContent = `Actualizado: ${new Date(data.generatedAt).toLocaleString('es-ES')}`;

    window.addEventListener('resize', () => {
      drawLinks(GRAPH_EDGES);
      fitGraphToStage();

      if (selectedAgentId) {
        const active = document.querySelector(`.graph-node[data-id="${selectedAgentId}"]`);
        active?.classList.add('active');
      }
    });
  } catch (error) {
    console.error(error);
    const refresh = document.getElementById('last-refresh');
    refresh.textContent = 'Error cargando datos';
    refresh.style.color = 'var(--error)';
  }
}

init();
