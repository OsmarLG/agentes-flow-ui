const STATUS_CLASS = {
  running: 'running',
  success: 'success',
  error: 'error'
};

function formatRelativeTime(isoTime) {
  const now = new Date();
  const then = new Date(isoTime);
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'justo ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} d`;
}

function statusLabel(status) {
  if (status === 'running') return 'running';
  if (status === 'success') return 'success';
  if (status === 'error') return 'error';
  return status;
}

function renderAgents(agents) {
  const grid = document.getElementById('agents-grid');
  const tpl = document.getElementById('agent-card-template');
  grid.innerHTML = '';

  agents.forEach((agent) => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.agent-name').textContent = agent.name;
    node.querySelector('.agent-role').textContent = agent.role;

    const badge = node.querySelector('.status-badge');
    const cls = STATUS_CLASS[agent.status] || 'running';
    badge.textContent = statusLabel(agent.status);
    badge.classList.add(`status-${cls}`);

    const skillsList = node.querySelector('.skills-list');
    agent.keySkills.forEach((skill) => {
      const li = document.createElement('li');
      li.textContent = skill;
      skillsList.appendChild(li);
    });

    const toolsList = node.querySelector('.tools-list');
    agent.keyTools.forEach((tool) => {
      const li = document.createElement('li');
      li.textContent = tool;
      toolsList.appendChild(li);
    });

    grid.appendChild(node);
  });
}

function renderTimeline(events) {
  const list = document.getElementById('timeline');
  const tpl = document.getElementById('timeline-item-template');
  list.innerHTML = '';

  events
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .forEach((event) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector('.timeline-type').textContent = event.type;
      node.querySelector('.timeline-time').textContent = new Date(event.timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
      });
      node.querySelector('.timeline-text').textContent = event.message;
      list.appendChild(node);
    });
}

function renderActivity(activity) {
  const list = document.getElementById('activity-list');
  const tpl = document.getElementById('activity-item-template');
  list.innerHTML = '';

  activity.forEach((item) => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.activity-agent').textContent = item.agent;
    node.querySelector('.activity-last').textContent = item.lastInteraction;

    const status = node.querySelector('.activity-status');
    const cls = STATUS_CLASS[item.status] || 'running';
    status.textContent = statusLabel(item.status);
    status.classList.add(`activity-${cls}`);

    const relative = node.querySelector('.activity-relative');
    relative.textContent = formatRelativeTime(item.timestamp);
    relative.dateTime = item.timestamp;

    list.appendChild(node);
  });
}

async function init() {
  try {
    const response = await fetch('./data/mock-data.json');
    if (!response.ok) throw new Error('No se pudo cargar mock-data.json');

    const data = await response.json();
    renderAgents(data.agents);
    renderTimeline(data.flowTimeline);
    renderActivity(data.activityPanel);

    const refresh = document.getElementById('last-refresh');
    refresh.textContent = `Actualizado: ${new Date(data.generatedAt).toLocaleString('es-ES')}`;
  } catch (error) {
    console.error(error);
    const refresh = document.getElementById('last-refresh');
    refresh.textContent = 'Error cargando datos';
    refresh.style.color = 'var(--error)';
  }
}

init();
