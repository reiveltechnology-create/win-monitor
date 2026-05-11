// Servidor principal do WIN Monitor
// - Express + storage em arquivo JSON (zero dependência nativa, instala em qualquer máquina)
// - Polling agendado da TradingEconomics
// - Server-Sent Events (SSE) para empurrar updates ao navegador em tempo real

import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { fetchTodayAndTomorrow } from './calendar.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'events.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PORT = parseInt(process.env.PORT || '3030', 10);
const POLL_INTERVAL_SEC = parseInt(process.env.POLL_INTERVAL_SEC || '60', 10);
const POLL_FAST_SEC = parseInt(process.env.POLL_FAST_SEC || '5', 10);
const ANNOUNCE_AHEAD_MIN = parseInt(process.env.ANNOUNCE_AHEAD_MIN || '5', 10);
const TE_API_KEY = process.env.TE_API_KEY || 'guest:guest';

// Autenticação: se AUTH_USER e AUTH_PASS estiverem definidos no .env,
// o sistema exige login. Senão fica aberto (modo dev/local).
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASS = process.env.AUTH_PASS || '';
const AUTH_ENABLED = !!(AUTH_USER && AUTH_PASS);

// Janela em que entramos em modo "polling rápido" (antes e depois do evento)
const FAST_WINDOW_BEFORE_MIN = 30;
const FAST_WINDOW_AFTER_MIN = 5;

// ==================== STORAGE (JSON file) ====================
let store = {};
function loadStore() {
  try {
    if (fs.existsSync(DB_FILE)) {
      store = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[STORE] erro ao carregar, recomeçando vazio:', err.message);
    store = {};
  }
}
function saveStore() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('[STORE] erro ao salvar:', err.message);
  }
}
loadStore();

function pruneOldEvents() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const [id, ev] of Object.entries(store)) {
    if (new Date(ev.datetime).getTime() < cutoff) {
      delete store[id];
      removed++;
    }
  }
  if (removed > 0) {
    saveStore();
    console.log(`[STORE] removidos ${removed} eventos antigos`);
  }
}

// ==================== SSE ====================
const sseClients = new Set();
function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch (_) { /* cliente desconectou */ }
  }
}

// ==================== POLLING ====================
async function pollOnce() {
  try {
    const events = await fetchTodayAndTomorrow(TE_API_KEY);
    const now = new Date();
    const nowISO = now.toISOString();
    let changed = false;

    for (const ev of events) {
      const prev = store[ev.id];
      const wasReleased = prev?.released === true;
      const isReleased = !!ev.released;

      const announcedUpcoming = prev?.announcedUpcoming || false;
      const announcedRelease = prev?.announcedRelease || false;

      store[ev.id] = {
        ...ev,
        announcedUpcoming,
        announcedRelease,
        lastSeen: nowISO
      };
      changed = true;

      if (!wasReleased && isReleased && !announcedRelease) {
        store[ev.id].announcedRelease = true;
        broadcast('release', store[ev.id]);
        console.log(`[RELEASE] ${ev.country} ${ev.event} | ${ev.bias} | actual=${ev.actual} fc=${ev.forecast}`);
      }

      const evTime = new Date(ev.datetime).getTime();
      const minsUntil = (evTime - now.getTime()) / 60000;
      if (!isReleased && minsUntil > 0 && minsUntil <= ANNOUNCE_AHEAD_MIN && !announcedUpcoming) {
        store[ev.id].announcedUpcoming = true;
        broadcast('upcoming', { ...store[ev.id], minutesUntil: Math.round(minsUntil) });
        console.log(`[UPCOMING] ${ev.country} ${ev.event} em ${Math.round(minsUntil)}min`);
      }
    }

    if (changed) saveStore();
    broadcast('refresh', { at: nowISO, count: events.length });
  } catch (err) {
    console.error('[POLL ERROR]', err.message);
    broadcast('error', { message: err.message });
  }
}

// ==================== HTTP ====================
const app = express();
app.use(cors());
app.use(express.json());

// ==================== AUTENTICAÇÃO BÁSICA ====================
// HTTP Basic Auth — simples e suficiente pra acesso restrito.
// Funciona bem com Coolify/proxy reverso por HTTPS.
if (AUTH_ENABLED) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization || '';
    const [scheme, encoded] = auth.split(' ');
    if (scheme !== 'Basic' || !encoded) {
      res.set('WWW-Authenticate', 'Basic realm="WIN Monitor"');
      return res.status(401).send('Acesso restrito');
    }
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const idx = decoded.indexOf(':');
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    if (user !== AUTH_USER || pass !== AUTH_PASS) {
      res.set('WWW-Authenticate', 'Basic realm="WIN Monitor"');
      return res.status(401).send('Credenciais inválidas');
    }
    next();
  });
  console.log('🔒 Autenticação ATIVADA');
} else {
  console.log('⚠️  Autenticação DESATIVADA (modo dev/local)');
}

app.use(express.static(path.join(ROOT, 'public')));

function eventsInRange(fromISO, toISO) {
  return Object.values(store)
    .filter(e => e.datetime >= fromISO && e.datetime < toISO)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
}

app.get('/api/events/today', (req, res) => {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  res.json(eventsInRange(start.toISOString(), end.toISOString()));
});

app.get('/api/events/upcoming', (req, res) => {
  const now = new Date();
  const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  res.json(eventsInRange(now.toISOString(), end.toISOString()));
});

app.post('/api/poll', async (req, res) => {
  await pollOnce();
  res.json({ ok: true });
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ==================== SCHEDULER ADAPTATIVO ====================
// Decide o próximo intervalo: rápido (5s) se há evento iminente OU recém-liberado;
// caso contrário, normal (60s). Isso preserva cota da API mas mantém precisão no momento crítico.
function nextPollDelay() {
  const now = Date.now();
  const events = Object.values(store);

  for (const ev of events) {
    const evTime = new Date(ev.datetime).getTime();
    const diffMin = (evTime - now) / 60000;

    // Evento iminente: até FAST_WINDOW_BEFORE_MIN no futuro
    if (!ev.released && diffMin > 0 && diffMin <= FAST_WINDOW_BEFORE_MIN) {
      return POLL_FAST_SEC * 1000;
    }
    // Evento recém-liberado mas marcador de release ainda pode chegar
    if (diffMin <= 0 && diffMin >= -FAST_WINDOW_AFTER_MIN) {
      return POLL_FAST_SEC * 1000;
    }
  }
  return POLL_INTERVAL_SEC * 1000;
}

async function scheduleLoop() {
  await pollOnce();
  const delay = nextPollDelay();
  setTimeout(scheduleLoop, delay);
}

// ==================== START ====================
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║    WIN MONITOR rodando na porta ${PORT}    ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
  console.log(`Abra: http://localhost:${PORT}`);
  console.log(`Polling adaptativo: ${POLL_FAST_SEC}s perto do evento, ${POLL_INTERVAL_SEC}s ocioso`);
  console.log(`Aviso de voz: ${ANNOUNCE_AHEAD_MIN}min antes\n`);

  pruneOldEvents();
  scheduleLoop();
  cron.schedule('0 3 * * *', pruneOldEvents);
});
