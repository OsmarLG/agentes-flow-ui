const STATUS_CLASS = {
  ok: 'ok',
  running: 'running',
  error: 'error',
  success: 'ok'
};

const NODE_LAYOUT = {
  main: { x: 46, y: 40 },
  dev: { x: 18, y: 210 },
  content: { x: 74, y: 210 },
  ops: { x: 46, y: 360 },
  office: { x: 18, y: 520 },
  'agent-factory': { x: 74, y: 520 }
};

const GRAPH_EDGES = [
  ['main', 'dev'],
  ['main', 'content'],
  ['main', 'ops'],
  ['ops', 'office'],
  ['dev', 'agent-factory'],
  ['content', 'main']
];

function normalizeStatus(status) {
  return STATUS_CLASS[status] || 'running';
}

function createToolBadge(tool) {
  const badge = document.createElement('span');
  badge.className = 'tool-badge';
  badge.textContent = tool;
  return badge;
}

function drawLinks(edges) {
  const svg = document.getElementById('flow-links');
  const stage = document.getElementById('graph-stage');
  const nodesLayer = document.getElementById('nodes-layer');
  const bounds = stage.getBoundingClientRect();

  svg.setAttribute('width', String(bounds.width));
  svg.setAttribute('height', String(bounds.height));
  svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
  svg.innerHTML = '';

  const lookup = Object.fromEntries(
    Array.from(nodesLayer.querySelectorAll('.graph-node')).map((node) => [node.dataset.id, node])
  );

  edges.forEach(([from, to], index) => {
    const fromEl = lookup[from];
    const toEl = lookup[to];
    if (!fromEl || !toEl) return;

    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();

    const x1 = a.left - bounds.left + a.width / 2;
    const y1 = a.top - bounds.top + a.height / 2;
    const x2 = b.left - bounds.left + b.width / 2;
    const y2 = b.top - bounds.top + b.height / 2;

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
    const pos = NODE_LAYOUT[agent.id] || { x: 10, y: 10 };

    node.dataset.id = agent.id;
    node.style.left = `${pos.x}%`;
    node.style.top = `${pos.y}px`;

    node.querySelector('.node-name').textContent = agent.name;
    node.querySelector('.node-role').textContent = agent.role;

    const dot = node.querySelector('.status-dot');
    dot.classList.add(`status-${status}`);

    const tools = node.querySelector('.tools-badges');
    agent.keyTools.forEach((tool) => tools.appendChild(createToolBadge(tool)));

    node.addEventListener('click', () => {
      layer.querySelectorAll('.graph-node').forEach((el) => el.classList.remove('active'));
      node.classList.add('active');
      renderDetail(agent, data);
    });

    layer.appendChild(node);
  });

  requestAnimationFrame(() => drawLinks(GRAPH_EDGES));
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

    const refresh = document.getElementById('last-refresh');
    refresh.textContent = `Actualizado: ${new Date(data.generatedAt).toLocaleString('es-ES')}`;

    window.addEventListener('resize', () => drawLinks(GRAPH_EDGES));
  } catch (error) {
    console.error(error);
    const refresh = document.getElementById('last-refresh');
    refresh.textContent = 'Error cargando datos';
    refresh.style.color = 'var(--error)';
  }
}

init();
