// Cliente de calendário econômico — INVESTING.COM (BR + US)
// =============================================================================
// Fonte primária: Investing.com (endpoint AJAX real br.investing.com)
//   - Retorna HTML (tabela com tr.js-event-item)
//   - Parsing por regex (HTML do investing é estável já há anos)
// Fonte fallback: ForexFactory (caso o Investing bloqueie)
//
// Cache: 15min entre requests para evitar rate limit.
// =============================================================================

import { classifyEvent, calculateBias } from './impactDb.js';

const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = {
  events: null,
  fetchedAt: 0,
  source: null
};

// ============================================================
// FONTE 1: INVESTING.COM (endpoint real getCalendarFilteredData)
// ============================================================
// Códigos de país: 5=USA, 32=Brazil
// Códigos de importância: 1=low, 2=medium, 3=high
// timeZone=12 = America/Sao_Paulo

const INVESTING_URL = 'https://www.investing.com/economic-calendar/Service/getCalendarFilteredData';

function buildInvestingBody(timeFilter) {
  const params = new URLSearchParams();
  params.append('country[]', '5');   // United States
  params.append('country[]', '32');  // Brazil
  params.append('importance[]', '2');
  params.append('importance[]', '3');
  params.append('timeZone', '12');   // São Paulo
  params.append('timeFilter', timeFilter);
  params.append('currentTab', timeFilter === 'timeRemain' ? 'today' : 'thisWeek');
  params.append('limit_from', '0');
  return params.toString();
}

async function fetchInvestingHTML(timeFilter) {
  const body = buildInvestingBody(timeFilter);
  const res = await fetch(INVESTING_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': '*/*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Origin': 'https://br.investing.com',
      'Referer': 'https://br.investing.com/economic-calendar/'
    },
    body
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data || '';
}

/**
 * Parser do HTML de eventos do Investing.
 * Cada evento vem em <tr> com classes específicas e atributos data-*.
 */
function parseInvestingHTML(html) {
  if (!html) return [];

  const events = [];

  // Regex pra encontrar cada linha <tr class="...js-event-item...">
  // O HTML é grande, então capturamos cada TR com seus atributos
  const trRegex = /<tr[^>]*?id="eventRowId_(\d+)"[^>]*?data-event-datetime="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;
  let match;

  while ((match = trRegex.exec(html)) !== null) {
    const [, eventId, datetimeStr, content] = match;

    try {
      // País / moeda
      // <td class="flagCur noWrap"><span title="United States" class="ceFlags US">...</span>USD</td>
      const flagMatch = content.match(/<span[^>]*?class="[^"]*?ceFlags\s+([A-Z]{2,3})[^"]*"[^>]*?title="([^"]+)"/);
      const countryCode = flagMatch?.[1] || '';
      const countryTitle = flagMatch?.[2] || '';

      const country = countryCode === 'US' ? 'US'
                    : countryCode === 'BR' ? 'BR'
                    : null;
      if (!country) continue;

      // Importância (estrelas)
      // <td class="left textNum sentiment noWrap" data-img_key="bull3" title="High Volatility Expected">
      // ou <i class="grayFullBullishIcon"></i> x N vezes
      let stars = 0;
      const importanceCell = content.match(/data-img_key="bull(\d)"/);
      if (importanceCell) {
        stars = parseInt(importanceCell[1], 10);
      } else {
        // Conta os ícones de touro preenchidos
        const bullMatches = content.match(/grayFullBullishIcon/g);
        if (bullMatches) stars = bullMatches.length;
      }
      if (stars < 2) continue;

      // Nome do evento
      // <td class="left event"><a href="...">Nome do Evento</a>
      const eventNameMatch = content.match(/<td[^>]*?class="[^"]*?event[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
      let eventName = (eventNameMatch?.[1] || '').replace(/\s+/g, ' ').trim();
      if (!eventName) {
        // Fallback: pega texto direto da td.event
        const eventTextMatch = content.match(/<td[^>]*?class="[^"]*?event[^"]*"[^>]*>([\s\S]*?)<\/td>/);
        if (eventTextMatch) {
          eventName = eventTextMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        }
      }
      if (!eventName) continue;

      // Atual / Forecast / Previous
      // <td class="bold ... act ...">VALOR</td>
      // <td class="fore ...">VALOR</td>
      // <td class="prev ...">VALOR</td>
      const actualMatch = content.match(/<td[^>]*?class="[^"]*?\bact\b[^"]*"[^>]*>([\s\S]*?)<\/td>/);
      const forecastMatch = content.match(/<td[^>]*?class="[^"]*?\bfore\b[^"]*"[^>]*>([\s\S]*?)<\/td>/);
      const previousMatch = content.match(/<td[^>]*?class="[^"]*?\bprev\b[^"]*"[^>]*>([\s\S]*?)<\/td>/);

      const cleanCell = (s) => {
        if (!s) return null;
        const text = s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (!text || text === '-' || text === '—') return null;
        return text;
      };

      const actual = cleanCell(actualMatch?.[1]);
      const forecast = cleanCell(forecastMatch?.[1]);
      const previous = cleanCell(previousMatch?.[1]);

      // datetime vem como "2026-05-12 09:00:00" no timezone do São Paulo (porque mandamos timeZone=12)
      // Vamos converter para ISO com offset -03:00
      const datetimeISO = datetimeStr.includes('T')
        ? datetimeStr
        : datetimeStr.replace(' ', 'T') + '-03:00';

      const countryName = country === 'US' ? 'United States' : 'Brazil';
      const classification = classifyEvent(eventName, countryName);
      const biasInfo = calculateBias(actual, forecast, previous, classification);

      events.push({
        id: `inv_${eventId}`,
        datetime: datetimeISO,
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
        source: 'investing'
      });
    } catch (e) {
      // Ignora linha problemática
      continue;
    }
  }

  return events;
}

async function fetchFromInvesting() {
  // 'thisWeek' traz a semana inteira de uma vez
  const html = await fetchInvestingHTML('thisWeek');
  const events = parseInvestingHTML(html);
  if (events.length === 0) {
    throw new Error('Nenhum evento extraído do HTML (formato pode ter mudado)');
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
// ORQUESTRAÇÃO
// ============================================================

export async function fetchTodayAndTomorrow(apiKey /* compat */) {
  const now = Date.now();
  const cacheAge = now - cache.fetchedAt;

  if (cache.events && cacheAge < CACHE_TTL_MS) {
    return filterUpcoming(cache.events);
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
        return filterUpcoming(events);
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
    return filterUpcoming(cache.events);
  }

  console.error('[CALENDAR] Sem fonte e sem cache. Último erro:', lastError?.message);
  return [];
}

// Retorna todos os eventos a partir do dia atual em diante (até 7 dias)
// O filtro fino (hoje/amanhã/semana) é feito no endpoint /api/events?range=...
function filterUpcoming(allEvents) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
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
