const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

loadEnvFile(path.join(__dirname, '.env.local'));

const app = express();
const PORT = Number(process.env.PORT || 8080);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/root/.openclaw';
const AUTH_API_URL = String(process.env.AUTH_API_URL || 'https://auth.openclaw.elroi.cloud').replace(/\/$/, '');
const AUTH_LOGIN = String(process.env.AUTH_LOGIN || process.env.INITIAL_ADMIN_USERNAME || 'admin');
const AUTH_DEVICE_NAME = String(process.env.AUTH_DEVICE_NAME || 'agentes-flow-ui');
const AUTH_TOKEN_TTL_MS = Number(process.env.AUTH_TOKEN_TTL_MS || 1000 * 60 * 60 * 8);

const WEB_ROOT = __dirname;
const MOCK_DATA_PATH = path.join(__dirname, 'data', 'mock-data.json');
const CONFIG_AUDIT_LOG = path.join(OPENCLAW_HOME, 'logs', 'config-audit.jsonl');
const AGENTS_DIR = path.join(OPENCLAW_HOME, 'agents');

const sessions = new Map();

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
  'elroi-agent-factory': 'agent-factory',
  'elroi-research': 'elroi-research',
  research: 'elroi-research'
};

function loadEnvFile(filePath) {
  try {
    const raw = fssync.readFileSync(filePath, 'utf8');
    raw.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const sep = trimmed.indexOf('=');
      if (sep <= 0) return;
      const key = trimmed.slice(0, sep).trim();
      let value = trimmed.slice(sep + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch {
    // optional file
  }
}

function normalizeId(raw = '') {
  if (ID_ALIAS[raw]) return ID_ALIAS[raw];
  const lower = String(raw).toLowerCase();
  if (ID_ALIAS[lower]) return ID_ALIAS[lower];
  return raw;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, sess] of sessions.entries()) {
    if (sess.expiresAt <= now) sessions.delete(token);
  }
}

function requireAuth(req, res, next) {
  cleanupSessions();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  const found = sessions.get(token);
  if (!found || found.expiresAt <= Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  req.auth = found;
  next();
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

async function listOpenClawAgents() {
  try {
    const cli = await execFileAsync(OPENCLAW_BIN, ['agents', 'list', '--json'], {
      timeout: 7000,
      maxBuffer: 1024 * 1024 * 4
    });
    const listed = JSON.parse(cli.stdout || '[]');
    return {
      source: 'real',
      agents: listed.map((raw) => ({
        id: normalizeId(raw.id || raw.name || raw.identityName || 'agent'),
        sourceId: raw.id,
        name: raw.identityName || raw.name || raw.id,
        status: pickStatus(raw),
        raw
      }))
    };
  } catch {
    return { source: 'fallback', agents: [] };
  }
}

async function loadAgentsPayload() {
  const [mock, listedResult] = await Promise.all([readMockData(), listOpenClawAgents()]);
  const listed = listedResult.agents;
  const mockById = new Map((mock.agents || []).map((a) => [a.id, a]));

  const agentsFromCli = listed.map((item) => {
    const base = mockById.get(item.id);
    return {
      id: item.id,
      name: item.name || base?.name || item.sourceId,
      role: base?.role || `Agente ${item.id}`,
      keySkills: base?.keySkills || ['coordination', 'execution'],
      keyTools: base?.keyTools || buildFallbackTools(item.raw),
      status: item.status,
      _sourceId: item.sourceId,
      source: 'real'
    };
  });

  const agents = agentsFromCli.length
    ? agentsFromCli
    : (mock.agents || []).map((agent) => ({ ...agent, source: 'fallback', _sourceId: agent.id }));

  const activityPanel = agents.map((agent) => ({
    agent: agent.id,
    lastInteraction: agentsFromCli.length
      ? `Detectado desde OpenClaw (${agent._sourceId})`
      : `Actividad inferida por fallback mock (${agent._sourceId})`,
    timestamp: new Date().toISOString(),
    status: agent.status,
    source: agentsFromCli.length ? 'real' : 'fallback'
  }));

  return {
    generatedAt: new Date().toISOString(),
    pollIntervalMs: POLL_INTERVAL_MS,
    source: agentsFromCli.length ? 'openclaw agents list --json' : 'fallback mock-data.json',
    agents: agents.map(({ _sourceId, ...agent }) => agent),
    flowTimeline: mock.flowTimeline || [],
    activityPanel
  };
}

function extractAgentIdFromSessionKey(sessionKey = '') {
  const parts = String(sessionKey).split(':');
  if (parts[0] !== 'agent' || !parts[1]) return null;
  return normalizeId(parts[1]);
}

function fallbackActivityFromMock(mock, agents, limitPerAgent) {
  const general = (mock.flowTimeline || []).slice(-8).reverse().map((ev) => ({
    timestamp: ev.timestamp,
    message: ev.message,
    source: 'fallback'
  }));

  const byAgent = {};
  for (const agent of agents) {
    byAgent[agent.id] = (mock.activityPanel || [])
      .filter((entry) => entry.agent === agent.id)
      .slice(0, limitPerAgent)
      .map((entry) => ({
        timestamp: entry.timestamp,
        message: entry.lastInteraction,
        status: entry.status,
        source: 'fallback'
      }));
  }

  return {
    general,
    byAgent,
    sourceSummary: { general: 'fallback', byAgent: 'fallback' }
  };
}

async function readRecentSessionActivity(limitPerAgent = 5) {
  const resultByAgent = {};
  const general = [];

  let agentDirs = [];
  try {
    agentDirs = await fs.readdir(AGENTS_DIR, { withFileTypes: true });
  } catch {
    return { general, byAgent: resultByAgent };
  }

  for (const dir of agentDirs) {
    if (!dir.isDirectory()) continue;
    const sessionsPath = path.join(AGENTS_DIR, dir.name, 'sessions', 'sessions.json');
    let raw;
    try {
      raw = await fs.readFile(sessionsPath, 'utf8');
    } catch {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    for (const [sessionKey, meta] of Object.entries(parsed || {})) {
      const agentId = extractAgentIdFromSessionKey(sessionKey) || normalizeId(dir.name);
      const ts = Number(meta.updatedAt || 0);
      if (!ts) continue;

      const event = {
        timestamp: new Date(ts).toISOString(),
        message: `Sesión activa/reciente: ${sessionKey}`,
        source: 'real'
      };

      if (!resultByAgent[agentId]) resultByAgent[agentId] = [];
      resultByAgent[agentId].push(event);
      general.push({ ...event, agent: agentId });
    }
  }

  for (const [agentId, events] of Object.entries(resultByAgent)) {
    resultByAgent[agentId] = events
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limitPerAgent);
  }

  general.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return {
    general: general.slice(0, 20),
    byAgent: resultByAgent
  };
}

async function readConfigAuditEvents(limit = 6) {
  try {
    const raw = await fs.readFile(CONFIG_AUDIT_LOG, 'utf8');
    const lines = raw.trim().split('\n').slice(-40);
    const events = [];

    for (const line of lines.reverse()) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        events.push({
          timestamp: entry.timestamp || new Date().toISOString(),
          message: `Config audit: ${entry.event || 'change'}${entry.path ? ` · ${entry.path}` : ''}`,
          source: 'real'
        });
      } catch {
        // ignore bad line
      }
      if (events.length >= limit) break;
    }

    return events;
  } catch {
    return [];
  }
}

async function loadActivityPayload(limitPerAgent = 5) {
  const [mock, agentsPayload, sessionsActivity, configEvents] = await Promise.all([
    readMockData(),
    loadAgentsPayload(),
    readRecentSessionActivity(limitPerAgent),
    readConfigAuditEvents()
  ]);

  const agents = agentsPayload.agents || [];
  const fallback = fallbackActivityFromMock(mock, agents, limitPerAgent);

  const general = [...sessionsActivity.general, ...configEvents]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 20);

  const byAgent = {};
  for (const agent of agents) {
    const realEvents = (sessionsActivity.byAgent[agent.id] || []).slice(0, limitPerAgent);
    const fallbackEvents = (fallback.byAgent[agent.id] || []).slice(0, Math.max(0, limitPerAgent - realEvents.length));
    byAgent[agent.id] = [...realEvents, ...fallbackEvents].slice(0, limitPerAgent);
  }

  const mergedGeneral = general.length
    ? [...general, ...fallback.general.slice(0, Math.max(0, 8 - general.length))].slice(0, 20)
    : fallback.general;

  const generalSource = general.length ? (mergedGeneral.some((e) => e.source === 'fallback') ? 'mixed' : 'real') : 'fallback';
  const hasRealByAgent = Object.values(byAgent).some((events) => events.some((e) => e.source === 'real'));
  const hasFallbackByAgent = Object.values(byAgent).some((events) => events.some((e) => e.source === 'fallback'));
  const byAgentSource = hasRealByAgent && hasFallbackByAgent ? 'mixed' : hasRealByAgent ? 'real' : 'fallback';

  return {
    generatedAt: new Date().toISOString(),
    pollIntervalMs: POLL_INTERVAL_MS,
    sourceSummary: {
      general: generalSource,
      byAgent: byAgentSource
    },
    general: mergedGeneral,
    byAgent,
    limitPerAgent
  };
}

app.use(express.json());
app.use(express.static(WEB_ROOT));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString(), pollIntervalMs: POLL_INTERVAL_MS });
});

async function verifyAgainstAuthApi(password) {
  if (!AUTH_API_URL) return { ok: false, reason: 'AUTH_API_URL no configurada' };

  try {
    const response = await fetch(`${AUTH_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        login: AUTH_LOGIN,
        password,
        device_name: AUTH_DEVICE_NAME
      })
    });

    if (!response.ok) {
      return { ok: false, reason: `auth-api status ${response.status}` };
    }

    const payload = await response.json().catch(() => ({}));
    const accessToken = payload?.data?.access_token;
    return { ok: Boolean(accessToken), token: accessToken, payload };
  } catch (error) {
    return { ok: false, reason: error.message || 'auth-api unreachable' };
  }
}

app.post('/api/login', async (req, res) => {
  const { password } = req.body || {};

  const authApiCheck = await verifyAgainstAuthApi(password);

  if (!authApiCheck.ok) {
    return res.status(401).json({ ok: false, error: 'Credenciales inválidas', details: authApiCheck.reason });
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + AUTH_TOKEN_TTL_MS;
  sessions.set(token, {
    createdAt: Date.now(),
    expiresAt,
    upstreamAuth: 'agents-auth-api'
  });

  return res.json({
    ok: true,
    token,
    expiresAt,
    ttlMs: AUTH_TOKEN_TTL_MS,
    authSource: 'agents-auth-api'
  });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/session', requireAuth, (_req, res) => {
  res.json({ ok: true, authenticated: true });
});

app.get('/api/agents', requireAuth, async (_req, res) => {
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

app.get('/api/activity', requireAuth, async (req, res) => {
  const limitPerAgent = Math.max(1, Math.min(20, Number(req.query.limitPerAgent || 5)));
  try {
    const payload = await loadActivityPayload(limitPerAgent);
    res.json(payload);
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: 'No se pudo cargar actividad',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`agentes-flow-ui server listening on http://localhost:${PORT}`);
});
