// Cliente de calendário econômico — INVESTING.COM
// =============================================================================
// Estratégia primária: Investing.com endpoint AJAX getCalendarFilteredData
//   - Retorna HTML com tabela de eventos parseável por regex
//   - User-Agent + headers de navegador real pra evitar Cloudflare block
//   - Suporte opcional a ScrapingBee se SCRAPINGBEE_API_KEY estiver configurada
//
// Estratégia fallback: ForexFactory (caso Investing bloqueie totalmente)
//
// Cache: 15min entre requests pra reduzir chance de rate limit.
// =============================================================================

import { classifyEvent, calculateBias } from './impactDb.js';

const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = {
  events: null,
  fetchedAt: 0,
  source: null
};

// ============================================================
// ESTRATÉGIA 1+2: INVESTING.COM direto + via ScrapingBee
// ============================================================
// Códigos de país: 5 = USA, 32 = Brazil
// Códigos de importância: 1 = low, 2 = medium, 3 = high
// timeZone=12 = America/Sao_Paulo

const INVESTING_URL = 'https://www.investing.com/economic-calendar/Service/getCalendarFilteredData';

function buildInvestingBody() {
  const params = new URLSearchParams();
  params.append('country[]', '5');   // USA
  params.append('country[]', '32');  // Brazil
  params.append('importance[]', '2');
  params.append('importance[]', '3');
  params.append('timeZone', '12');   // São Paulo
  params.append('timeFilter', 'timeRemain');
  params.append('currentTab', 'thisWeek');
  params.append('limit_from', '0');
  return params.toString();
}

// Headers de navegador real — TENTAR ao máximo parecer com um Chrome legítimo
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': 'https://br.investing.com',
  'Referer': 'https://br.investing.com/economic-calendar/',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'Connection': 'keep-alive'
};

/**
 * Tenta acessar o endpoint AJAX direto do Investing.com.
 */
async function fetchInvestingDirect() {
  const res = await fetch(INVESTING_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: BROWSER_HEADERS,
    body: buildInvestingBody()
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  // Pode vir JSON com { data: '<html>' } OU HTML direto
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    const json = await res.json();
    return json.data || '';
  }
  return await res.text();
}

/**
 * Acessa via ScrapingBee (proxy residencial + bypass Cloudflare).
 * Só funciona se SCRAPINGBEE_API_KEY estiver configurada.
 * https://www.scrapingbee.com/
 */
async function fetchInvestingViaScrapingBee() {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) {
    throw new Error('SCRAPINGBEE_API_KEY não configurada');
  }

  const targetUrl = INVESTING_URL;
  const body = buildInvestingBody();

  // ScrapingBee POST: passa o URL alvo + headers customizados via query params
  const sbUrl = new URL('https://app.scrapingbee.com/api/v1/');
  sbUrl.searchParams.set('api_key', apiKey);
  sbUrl.searchParams.set('url', targetUrl);
  sbUrl.searchParams.set('render_js', 'false');
  sbUrl.searchParams.set('premium_proxy', 'true');     // proxy residencial
  sbUrl.searchParams.set('country_code', 'br');
  sbUrl.searchParams.set('forward_headers', 'true');

  const res = await fetch(sbUrl.toString(), {
    method: 'POST',
    signal: AbortSignal.timeout(45000),
    headers: {
      ...BROWSER_HEADERS,
      'Spb-Origin': 'https://br.investing.com',
      'Spb-Referer': 'https://br.investing.com/economic-calendar/'
    },
    body
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ScrapingBee HTTP ${res.status}: ${errText.slice(0, 100)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    const json = await res.json();
    return json.data || '';
  }
  return await res.text();
}

/**
 * Parser do HTML de eventos do Investing.com.
 * Cada evento vem como <tr id="eventRowId_XXXXX" data-event-datetime="..." ...>
 */
function parseInvestingHTML(html) {
  if (!html || typeof html !== 'string') return [];

  const events = [];

  // Regex pra encontrar cada <tr> de evento
  const trRegex = /<tr[^>]*?id="eventRowId_(\d+)"[^>]*?data-event-datetime="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;
  let match;

  while ((match = trRegex.exec(html)) !== null) {
    const [, eventId, datetimeStr, content] = match;

    try {
      // País / moeda
      const flagMatch = content.match(/<span[^>]*?class="[^"]*?ceFlags\s+([A-Z]{2,3})[^"]*"/);
      const countryCode = flagMatch?.[1] || '';

      const country = countryCode === 'US' ? 'US'
                    : countryCode === 'BR' ? 'BR'
                    : null;
      if (!country) continue;

      // Importância (estrelas)
      let stars = 0;
      const importanceCell = content.match(/data-img_key="bull(\d)"/);
      if (importanceCell) {
        stars = parseInt(importanceCell[1], 10);
      } else {
        const bullMatches = content.match(/grayFullBullishIcon/g);
        if (bullMatches) stars = bullMatches.length;
      }
      if (stars < 2) continue;

      // Nome do evento
      const eventNameMatch = content.match(/<td[^>]*?class="[^"]*?event[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
      let eventName = (eventNameMatch?.[1] || '').replace(/\s+/g, ' ').trim();
      if (!eventName) {
        const eventTextMatch = content.match(/<td[^>]*?class="[^"]*?event[^"]*"[^>]*>([\s\S]*?)<\/td>/);
        if (eventTextMatch) {
          eventName = eventTextMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        }
      }
      if (!eventName) continue;

      // Actual / Forecast / Previous
      const actualMatch = content.match(/<td[^>]*?class="[^"]*?\bact\b[^"]*"[^>]*>([\s\S]*?)<\/td>/);
      const forecastMatch = content.match(/<td[^>]*?class="[^"]*?\bfore\b[^"]*"[^>]*>([\s\S]*?)<\/td>/);
      const previousMatch = content.match(/<td[^>]*?class="[^"]*?\bprev\b[^"]*"[^>]*>([\s\S]*?)<\/td>/);

      const cleanCell = (s) => {
        if (!s) return null;
        const text = s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
        if (!text || text === '-' || text === '—' || text === '&nbsp;') return null;
        return text;
      };

      const actual = cleanCell(actualMatch?.[1]);
      const forecast = cleanCell(forecastMatch?.[1]);
      const previous = cleanCell(previousMatch?.[1]);

      // datetime "2026-05-12 09:00:00" → ISO com offset -03:00
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
    } catch (_) {
      continue;
    }
  }

  return events;
}

async function fetchFromInvesting() {
  let html;
  let attemptedStrategies = [];

  // Estratégia 1: direto do Investing.com
  try {
    console.log('[CALENDAR] Tentando Investing.com direto...');
    html = await fetchInvestingDirect();
    attemptedStrategies.push('direct');
    if (html && html.length > 1000) {
      const events = parseInvestingHTML(html);
      if (events.length > 0) {
        return { events, strategy: 'direct' };
      }
      console.log('[CALENDAR] Investing direto retornou HTML mas sem eventos extraídos');
    }
  } catch (err) {
    console.error(`[CALENDAR] Investing direto falhou: ${err.message}`);
  }

  // Estratégia 2: via ScrapingBee (se configurado)
  if (process.env.SCRAPINGBEE_API_KEY) {
    try {
      console.log('[CALENDAR] Tentando Investing via ScrapingBee...');
      html = await fetchInvestingViaScrapingBee();
      attemptedStrategies.push('scrapingbee');
      if (html && html.length > 1000) {
        const events = parseInvestingHTML(html);
        if (events.length > 0) {
          return { events, strategy: 'scrapingbee' };
        }
      }
    } catch (err) {
      console.error(`[CALENDAR] Investing via ScrapingBee falhou: ${err.message}`);
    }
  }

  throw new Error(`Todas estratégias Investing falharam (${attemptedStrategies.join(', ') || 'nenhuma tentada'})`);
}

// ============================================================
// FALLBACK: FOREXFACTORY (caso Investing falhe totalmente)
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

  // Investing.com primeiro
  try {
    const { events, strategy } = await fetchFromInvesting();
    cache = { events, fetchedAt: now, source: `investing-${strategy}` };
    console.log(`[CALENDAR] ✅ Investing.com (${strategy}): ${events.length} eventos. Próx em ${CACHE_TTL_MS / 60000}min.`);
    return filterUpcoming(events);
  } catch (err) {
    console.error(`[CALENDAR] ❌ Investing falhou totalmente: ${err.message}`);
  }

  // Fallback: ForexFactory
  try {
    console.log('[CALENDAR] Usando fallback ForexFactory...');
    const events = await fetchFromForexFactory();
    if (events.length > 0) {
      cache = { events, fetchedAt: now, source: 'forexfactory' };
      console.log(`[CALENDAR] ⚠️ Fallback ForexFactory: ${events.length} eventos`);
      return filterUpcoming(events);
    }
  } catch (err) {
    console.error(`[CALENDAR] ForexFactory também falhou: ${err.message}`);
  }

  // Usa cache antigo se houver
  if (cache.events) {
    const ageMin = Math.round(cacheAge / 60000);
    console.log(`[CALENDAR] Todas fontes falharam, usando cache de ${ageMin}min`);
    return filterUpcoming(cache.events);
  }

  console.error('[CALENDAR] SEM FONTE E SEM CACHE');
  return [];
}

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

/**
 * Retorna info sobre a fonte atual em uso (pra UI mostrar status).
 */
export function getSourceInfo() {
  return {
    source: cache.source,
    eventsCount: cache.events ? cache.events.length : 0,
    cacheAgeMs: cache.fetchedAt ? Date.now() - cache.fetchedAt : null,
    scrapingBeeConfigured: !!process.env.SCRAPINGBEE_API_KEY
  };
}
