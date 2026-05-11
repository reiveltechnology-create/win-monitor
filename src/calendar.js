// Cliente de calendário econômico — VERSÃO FONTES GRATUITAS
// =============================================================================
// Fonte primária: ForexFactory (calendário público com horários e impacto)
// Sem necessidade de chave de API, sem custo formal.
//
// Robustez: cache em memória com TTL de 15 minutos para respeitar rate limit
// do ForexFactory (HTTP 429). Os dados mudam pouco ao longo do dia mesmo.
// =============================================================================

import { classifyEvent, calculateBias } from './impactDb.js';

const FF_THIS_WEEK_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FF_NEXT_WEEK_URL = 'https://nfs.faireconomy.media/ff_calendar_nextweek.json';

// TTL do cache — só busca de novo após esse intervalo
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

// Cache em memória
let cache = {
  events: null,
  fetchedAt: 0,
  source: null
};

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
 * Usa cache de 15min pra respeitar rate limit do ForexFactory.
 */
export async function fetchTodayAndTomorrow(apiKey /* mantido por compat, não usado */) {
  const now = Date.now();
  const cacheAge = now - cache.fetchedAt;

  // Se cache ainda é válido, retorna dele direto
  if (cache.events && cacheAge < CACHE_TTL_MS) {
    return filterTodayAndTomorrow(cache.events);
  }

  // Cache expirou — busca novo
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
    // Silencioso
  }

  if (success) {
    cache = {
      events: [...events],
      fetchedAt: now,
      source: 'forexfactory'
    };
    console.log(`[CACHE] Atualizado com ${events.length} eventos. Próxima busca em ${CACHE_TTL_MS / 60000}min.`);
    return filterTodayAndTomorrow(events);
  }

  // Busca falhou — se temos cache antigo, ainda usa
  if (cache.events) {
    const ageMin = Math.round(cacheAge / 60000);
    console.log(`[CACHE] Busca falhou, usando cache de ${ageMin}min atrás`);
    return filterTodayAndTomorrow(cache.events);
  }

  // Sem cache e sem dados frescos
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

// Compat
export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export async function fetchCalendar(dateFrom, dateTo, apiKey) {
  return fetchTodayAndTomorrow(apiKey);
}
