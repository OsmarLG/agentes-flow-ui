const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const app = express();
const PORT = Number(process.env.PORT || 8080);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

const WEB_ROOT = __dirname;
const MOCK_DATA_PATH = path.join(__dirname, 'data', 'mock-data.json');

const ID_ALIAS = {
  main: 'main',
  dev: 'dev',
  content: 'content',
  ops: 'ops',
  office: 'office',
  'agent-factory': 'agent-factory',
  'elroi-dev': 'dev',
  'elroi-content': 'content',
  'elroi-ops': 'ops',
  'elroi-office': 'office',
  'elroi-agent-factory': 'agent-factory'
};

function normalizeId(raw = '') {
  if (ID_ALIAS[raw]) return ID_ALIAS[raw];
  const lower = String(raw).toLowerCase();
  if (ID_ALIAS[lower]) return ID_ALIAS[lower];
  return raw;
}

async function readMockData() {
  const raw = await fs.readFile(MOCK_DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function pickStatus(agent) {
  if (agent.isDefault) return 'running';
  if (typeof agent.bindings === 'number' && agent.bindings > 0) return 'running';
  return 'ok';
}

function buildFallbackTools(agent) {
  const tools = [];
  if (agent.model) tools.push(agent.model.split('/').slice(-1)[0]);
  if (agent.workspace) tools.push('workspace');
  if (agent.bindings > 0) tools.push(`bindings:${agent.bindings}`);
  return tools.length ? tools : ['agent'];
}

async function loadAgentsPayload() {
  const [mock, cli] = await Promise.all([
    readMockData(),
    execFileAsync(OPENCLAW_BIN, ['agents', 'list', '--json'], { timeout: 7000, maxBuffer: 1024 * 1024 * 4 })
  ]);

  const listed = JSON.parse(cli.stdout || '[]');
  const mockById = new Map((mock.agents || []).map((a) => [a.id, a]));

  const agents = listed.map((raw) => {
    const id = normalizeId(raw.id || raw.name || raw.identityName || 'agent');
    const base = mockById.get(id);
    return {
      id,
      name: raw.identityName || raw.name || base?.name || raw.id,
      role: base?.role || `Agente ${id}`,
      keySkills: base?.keySkills || ['coordination', 'execution'],
      keyTools: base?.keyTools || buildFallbackTools(raw),
      status: pickStatus(raw),
      _sourceId: raw.id
    };
  });

  const activityPanel = agents.map((agent) => ({
    agent: agent.id,
    lastInteraction: `Detectado desde OpenClaw (${agent._sourceId})`,
    timestamp: new Date().toISOString(),
    status: agent.status
  }));

  return {
    generatedAt: new Date().toISOString(),
    pollIntervalMs: POLL_INTERVAL_MS,
    source: 'openclaw agents list --json',
    agents: agents.map(({ _sourceId, ...agent }) => agent),
    flowTimeline: mock.flowTimeline || [],
    activityPanel
  };
}

app.use(express.static(WEB_ROOT));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString(), pollIntervalMs: POLL_INTERVAL_MS });
});

app.get('/api/agents', async (_req, res) => {
  try {
    const payload = await loadAgentsPayload();
    res.json(payload);
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: 'No se pudo leer openclaw agents list --json',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`agentes-flow-ui server listening on http://localhost:${PORT}`);
});
