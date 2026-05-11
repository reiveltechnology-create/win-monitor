// Cliente de calendário econômico — VERSÃO MULTI-FONTE
// =============================================================================
// Tenta múltiplas fontes em cascata para máxima resiliência:
//   1. Investing.com (fonte principal)
//   2. ForexFactory (fallback)
//
// Cache em memória com TTL de 15 minutos para evitar rate limit.
// =============================================================================

import { classifyEvent, calculateBias } from './impactDb.js';

const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = {
  events: null,
  fetchedAt: 0,
  source: null
};

// ============================================================
// FONTE 1: INVESTING.COM
// ============================================================

const INVESTING_URL = 'https://sbcharts.investing.com/events_calendar/economic_calendar.json';

async function fetchInvestingDotCom() {
  const res = await fetch(INVESTING_URL, {
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Referer': 'https://br.investing.com/economic-calendar/'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parseInvestingCountry(currency) {
  const c = (currency || '').toString().toUpperCase();
  if (c === 'USD' || c === 'US' || c === '5') return 'US';
  if (c === 'BRL' || c === 'BR' || c === 'BRA' || c === '32') return 'BR';
  return null;
}

function parseInvestingStars(importance) {
  if (typeof importance === 'number') return importance;
  const s = String(importance || '').toLowerCase();
  if (s.includes('high') || s === '3') return 3;
  if (s.includes('medium') || s === '2') return 2;
  if (s.includes('low') || s === '1') return 1;
  return 0;
}

function normalizeInvestingEvent(item) {
  const country = parseInvestingCountry(item.country || item.currency || item.country_id);
  if (!country) return null;

  const stars = parseInvestingStars(item.importance || item.priority || item.stars);
  if (stars < 2) return null;

  const eventName = item.event_name || item.event || item.name || item.title || '';
  if (!eventName) return null;

  const datetime = item.datetime || item.date || item.timestamp;
  if (!datetime) return null;

  const countryName = country === 'US' ? 'United States' : 'Brazil';
  const classification = classifyEvent(eventName, countryName);

  const actual = (item.actual != null && item.actual !== '' && item.actual !== '-') ? String(item.actual) : null;
  const forecast = (item.forecast != null && item.forecast !== '' && item.forecast !== '-') ? String(item.forecast) : null;
  const previous = (item.previous != null && item.previous !== '' && item.previous !== '-') ? String(item.previous) : null;

  const biasInfo = calculateBias(actual, forecast, previous, classification);

  return {
    id: `inv_${eventName}_${datetime}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
    datetime: typeof datetime === 'number' ? new Date(datetime * 1000).toISOString() : datetime,
    country,
    countryName,
    event: eventName,
    reference: '',
    stars,
    actual,
    forecast,
    previous,
    unit: item.unit || '',
    bias: biasInfo.bias,
    surprise: biasInfo.surprise,
    magnitude: biasInfo.magnitude,
    direction: classification?.direction || 'neutral',
    typicalRange: classification?.typicalRange || [],
    notes: classification?.notes || '',
    released: actual != null,
    source: 'investing'
  };
}

async function fetchFromInvesting() {
  const data = await fetchInvestingDotCom();

  let items = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === 'object') {
    items = data.data || data.events || data.economic_calendar || data.calendar || [];
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Estrutura inesperada ou vazia');
  }

  const events = [];
  for (const item of items) {
    const norm = normalizeInvestingEvent(item);
    if (norm) events.push(norm);
  }
  return events;
}

// ============================================================
// FONTE 2: FOREXFACTORY (fallback)
// ============================================================

const FF_THIS_WEEK_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FF_NEXT_WEEK_URL = 'https://nfs.faireconomy.media/ff_calendar_nextweek.json';

async function fetchForexFactory(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; WinMonitor/1.0)'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function impactToStars(impact) {
  const i = (impact || '').toLowerCase();
  if (i === 'high') return 3;
  if (i === 'medium') return 2;
  if (i === 'low') return 1;
  return 0;
}

function ffCountryCode(currency) {
  const c = (currency || '').toUpperCase();
  if (c === 'USD') return 'US';
  if (c === 'BRL') return 'BR';
  return null;
}

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

async function fetchFromForexFactory() {
  const events = [];
  try {
    const data = await fetchForexFactory(FF_THIS_WEEK_URL);
    if (Array.isArray(data)) {
      for (const item of data) {
        const norm = normalizeFFEvent(item);
        if (norm) events.push(norm);
      }
    }
  } catch (err) {
    throw new Error(`thisweek: ${err.message}`);
  }
  try {
    const data = await fetchForexFactory(FF_NEXT_WEEK_URL);
    if (Array.isArray(data)) {
      for (const item of data) {
        const norm = normalizeFFEvent(item);
        if (norm) events.push(norm);
      }
    }
  } catch (_) { /* não fatal */ }
  return events;
}

// ============================================================
// ORQUESTRAÇÃO MULTI-FONTE
// ============================================================

export async function fetchTodayAndTomorrow(apiKey /* compat */) {
  const now = Date.now();
  const cacheAge = now - cache.fetchedAt;

  if (cache.events && cacheAge < CACHE_TTL_MS) {
    return filterTodayAndTomorrow(cache.events);
  }

  const sources = [
    { name: 'Investing.com', fn: fetchFromInvesting },
    { name: 'ForexFactory',  fn: fetchFromForexFactory }
  ];

  let lastError = null;
  for (const source of sources) {
    try {
      const events = await source.fn();
      if (events.length > 0) {
        cache = { events, fetchedAt: now, source: source.name };
        console.log(`[CALENDAR] ${source.name}: ${events.length} eventos. Próx. atualização em ${CACHE_TTL_MS / 60000}min.`);
        return filterTodayAndTomorrow(events);
      } else {
        console.log(`[CALENDAR] ${source.name}: 0 eventos, tentando próxima...`);
      }
    } catch (err) {
      lastError = err;
      console.error(`[CALENDAR] ${source.name} falhou:`, err.message);
    }
  }

  if (cache.events) {
    const ageMin = Math.round(cacheAge / 60000);
    console.log(`[CALENDAR] Todas as fontes falharam, usando cache de ${ageMin}min atrás`);
    return filterTodayAndTomorrow(cache.events);
  }

  console.error('[CALENDAR] Sem fonte e sem cache. Último erro:', lastError?.message);
  return [];
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

export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export async function fetchCalendar(dateFrom, dateTo, apiKey) {
  return fetchTodayAndTomorrow(apiKey);
}
