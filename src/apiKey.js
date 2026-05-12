// Gerenciador da chave da API Anthropic
// =============================================================================
// A chave pode vir de 2 fontes (em ordem de prioridade):
//   1. Arquivo data/anthropic-key.txt (configurado via UI, persistente)
//   2. Variável de ambiente ANTHROPIC_API_KEY
//
// O arquivo data/anthropic-key.txt fica fora do controle de versão (no volume
// persistente do Coolify) e tem permissão restrita.
// =============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const KEY_FILE = path.join(ROOT, 'data', 'anthropic-key.txt');

/**
 * Retorna a chave atualmente configurada (arquivo > env).
 */
export function getApiKey() {
  try {
    if (fs.existsSync(KEY_FILE)) {
      const stored = fs.readFileSync(KEY_FILE, 'utf8').trim();
      if (stored) return stored;
    }
  } catch (_) {}
  return process.env.ANTHROPIC_API_KEY || '';
}

/**
 * Indica de onde a chave foi carregada (pra UI mostrar status correto).
 */
export function getApiKeySource() {
  try {
    if (fs.existsSync(KEY_FILE)) {
      const stored = fs.readFileSync(KEY_FILE, 'utf8').trim();
      if (stored) return 'file';
    }
  } catch (_) {}
  if (process.env.ANTHROPIC_API_KEY) return 'env';
  return 'none';
}

/**
 * Salva a chave no arquivo. Cria o diretório se preciso.
 * Para remover, passa string vazia.
 */
export function setApiKey(key) {
  const cleanKey = (key || '').trim();
  const dir = path.dirname(KEY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!cleanKey) {
    if (fs.existsSync(KEY_FILE)) fs.unlinkSync(KEY_FILE);
    return { ok: true, removed: true };
  }

  // Valida formato básico (Anthropic keys começam com sk-ant-)
  if (!cleanKey.startsWith('sk-ant-')) {
    return { ok: false, error: 'Formato inválido: chave Anthropic deve começar com "sk-ant-"' };
  }

  fs.writeFileSync(KEY_FILE, cleanKey, { mode: 0o600 });
  return { ok: true, saved: true };
}

/**
 * Mascara a chave pra exibição na UI ("sk-ant-...XYZW").
 */
export function maskApiKey(key) {
  if (!key) return '';
  if (key.length < 14) return '***';
  return `${key.slice(0, 10)}...${key.slice(-4)}`;
}

/**
 * Testa se a chave funciona fazendo uma chamada mínima na API do Claude.
 * Retorna { ok: bool, error?: string, model?: string, latencyMs?: number }.
 */
export async function testApiKey(key) {
  const apiKey = (key || '').trim() || getApiKey();
  if (!apiKey) {
    return { ok: false, error: 'Nenhuma chave configurada' };
  }
  if (!apiKey.startsWith('sk-ant-')) {
    return { ok: false, error: 'Formato inválido: deve começar com "sk-ant-"' };
  }

  const start = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ok' }]
      }),
      signal: AbortSignal.timeout(15000)
    });

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return {
        ok: true,
        model: 'claude-sonnet-4-6',
        latencyMs
      };
    }

    const errText = await res.text();
    let parsed = '';
    try {
      const j = JSON.parse(errText);
      parsed = j.error?.message || errText;
    } catch { parsed = errText; }

    if (res.status === 401) {
      return { ok: false, error: 'Chave inválida ou expirada' };
    }
    if (res.status === 429) {
      return { ok: false, error: 'Rate limit excedido — aguarde alguns minutos' };
    }
    if (res.status === 400 && /credit/i.test(parsed)) {
      return { ok: false, error: 'Conta sem crédito — adicione saldo em console.anthropic.com' };
    }
    return { ok: false, error: `HTTP ${res.status}: ${parsed.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: `Falha de rede: ${err.message}` };
  }
}
