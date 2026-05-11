// Cliente de calendário econômico — VERSÃO FONTES GRATUITAS
// =============================================================================
// Fonte primária: ForexFactory (calendário público com horários e impacto)
// Sem necessidade de chave de API, sem custo formal.
//
// Robustez: cache em memória da última resposta bem-sucedida, para o sistema
// continuar mostrando a agenda mesmo se a fonte falhar temporariamente.
// =============================================================================

import { classifyEvent, calculateBias } from './impactDb.js';

const FF_THIS_WEEK_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FF_NEXT_WEEK_URL = 'https://nfs.faireconomy.media/ff_calendar_nextweek.json';

// Cache em memória: { events: [...], fetchedAt: Date, source: 'forexfactory' }
let lastSuccessfulFetch = null;

/**
 * Busca o calendário do ForexFactory com timeout e retry simples.
 */
async function fetchForexFactory(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; WinMonitor/1.0)',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    // Às vezes vem com BOM ou comentários — tenta parsear flexível
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Converte impacto do ForexFactory para estrelas.
 */
function impactToStars(impact) {
  const i = (impact || '').toLowerCase();
  if (i === 'high') return 3;
  if (i === 'medium') return 2;
  if (i === 'low') return 1;
  return 0;
}

/**
 * Mapeia código de moeda do ForexFactory para nosso código de país.
 */
function ffCountryCode(currency) {
  const c = (currency || '').toUpperCase();
  if (c === 'USD') return 'US';
  if (c === 'BRL') return 'BR';
  return null; // outros são ignorados
}

/**
 * Normaliza um item do ForexFactory para o formato interno.
 */
function normalizeFFEvent(item) {
  const country = ffCountryCode(item.country);
  if (!country) return null;

  const stars = impactToStars(item.impact);
  if (stars < 2) return null;

  const eventName = item.title || '';
  if (!eventName) return null;

  const countryName = country === 'US' ? 'United States' : 'Brazil';
  const classification = classifyEvent(eventName, countryName);

  const datetime = item.date;
  if (!datetime) return null;

  const actual = (item.actual != null && item.actual !== '') ? String(item.actual) : null;
  const forecast = (item.forecast != null && item.forecast !== '') ? String(item.forecast) : null;
  const previous = (item.previous != null && item.previous !== '') ? String(item.previous) : null;

  const biasInfo = calculateBias(actual, forecast, previous, classification);

  return {
    id: `ff_${eventName}_${datetime}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
    datetime,
    country,
    countryName,
    event: eventName,
    reference: '',
    stars,
    actual,
    forecast,
    previous,
    unit: '',
    bias: biasInfo.bias,
    surprise: biasInfo.surprise,
    magnitude: biasInfo.magnitude,
    direction: classification?.direction || 'neutral',
    typicalRange: classification?.typicalRange || [],
    notes: classification?.notes || '',
    released: actual != null,
    source: 'forexfactory'
  };
}

/**
 * Função principal — busca o calendário e retorna só hoje + amanhã.
 */
export async function fetchTodayAndTomorrow(apiKey /* mantido por compat, não usado */) {
  const events = [];
  let success = false;

  // 1) Esta semana
  try {
    const data = await fetchForexFactory(FF_THIS_WEEK_URL);
    if (Array.isArray(data)) {
      for (const item of data) {
        const norm = normalizeFFEvent(item);
        if (norm) events.push(norm);
      }
      success = true;
    }
  } catch (err) {
    console.error('[ForexFactory thisweek] Erro:', err.message);
  }

  // 2) Próxima semana (não-fatal)
  try {
    const data = await fetchForexFactory(FF_NEXT_WEEK_URL);
    if (Array.isArray(data)) {
      for (const item of data) {
        const norm = normalizeFFEvent(item);
        if (norm) events.push(norm);
      }
    }
  } catch (err) {
    // Silencioso — não é crítico
  }

  // 3) Se a busca falhou completamente, usa cache anterior se houver
  if (!success && lastSuccessfulFetch) {
    console.log('[CACHE] Usando última resposta válida de', lastSuccessfulFetch.fetchedAt);
    return filterTodayAndTomorrow(lastSuccessfulFetch.events);
  }

  // 4) Se foi sucesso, atualiza o cache
  if (success) {
    lastSuccessfulFetch = {
      events: [...events],
      fetchedAt: new Date().toISOString()
    };
  }

  return filterTodayAndTomorrow(events);
}

function filterTodayAndTomorrow(allEvents) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 48 * 60 * 60 * 1000);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  return allEvents
    .filter(ev => ev.datetime >= startISO && ev.datetime < endISO)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
}

// Compat
export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export async function fetchCalendar(dateFrom, dateTo, apiKey) {
  return fetchTodayAndTomorrow(apiKey);
}
