// Cliente de calendário econômico — FONTES OFICIAIS
// =============================================================================
// Brasil:
//   - BCB Olinda API (Banco Central) — datas oficiais Copom, Selic, IPCA
//   - Calendário Copom: agenda fixa do ano inteiro
// EUA:
//   - ForexFactory — calendário com forecast/actual/previous
//
// Todas as fontes são gratuitas, sem chave de API, sem rate limit formal.
// Cache de 15min para reduzir requests.
// =============================================================================

import { classifyEvent, calculateBias } from './impactDb.js';

const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = {
  events: null,
  fetchedAt: 0,
  source: null
};

// ============================================================
// FONTE 1: BCB OLINDA (Brasil — calendário macro oficial)
// ============================================================
// API pública sem chave: https://olinda.bcb.gov.br/

const BCB_BASE = 'https://olinda.bcb.gov.br/olinda/servico';

/**
 * Datas oficiais do Copom para o ano corrente.
 * BCB publica o calendário anual de reuniões.
 */
async function fetchCopomCalendar() {
  // O BCB publica o calendário em https://www.bcb.gov.br/controleinflacao/calendarioreunioescopom
  // O JSON está em: /Expectativas/versao/v1/odata/ExpectativasMercadoSelic
  // mas isso é expectativa, não calendário. Em vez disso usamos o endpoint público:
  const year = new Date().getFullYear();
  const url = `${BCB_BASE}/CalendarioMPC/versao/v1/odata/Calendario?$format=json&$filter=year(DataReuniao)%20eq%20${year}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.value || [];
  } catch (err) {
    // Fallback: calendário hardcoded do Copom do ano corrente
    // (BCB anuncia em janeiro, são 8 reuniões por ano)
    return getCopomFallback(year);
  }
}

/**
 * Calendário hardcoded do Copom — usado se a API do BCB não responder.
 * Atualizar manualmente em janeiro de cada ano.
 */
function getCopomFallback(year) {
  // Calendário oficial Copom 2026 (divulgado pelo BCB em jan/2026)
  // Reuniões sempre terça/quarta, decisão divulgada na quarta às 18h30 BRT
  const calendar2026 = [
    { DataReuniao: '2026-01-28T18:30:00-03:00', Reuniao: '273' },
    { DataReuniao: '2026-03-18T18:30:00-03:00', Reuniao: '274' },
    { DataReuniao: '2026-05-06T18:30:00-03:00', Reuniao: '275' },
    { DataReuniao: '2026-06-17T18:30:00-03:00', Reuniao: '276' },
    { DataReuniao: '2026-07-29T18:30:00-03:00', Reuniao: '277' },
    { DataReuniao: '2026-09-16T18:30:00-03:00', Reuniao: '278' },
    { DataReuniao: '2026-10-28T18:30:00-03:00', Reuniao: '279' },
    { DataReuniao: '2026-12-09T18:30:00-03:00', Reuniao: '280' }
  ];
  return calendar2026.filter(r => r.DataReuniao.startsWith(String(year)));
}

/**
 * Calendário de divulgação do IPCA — IBGE divulga aproximadamente
 * todo dia 10 de cada mês (referência ao mês anterior).
 */
function getIPCACalendar(year) {
  // Datas de divulgação do IPCA em 2026 (IBGE divulga sempre por volta do dia 10, 9h)
  // Fonte: https://www.ibge.gov.br/explica/inflacao.php (calendário oficial)
  const calendar2026 = [
    { date: '2026-01-13T09:00:00-03:00', reference: 'dez/2025' },
    { date: '2026-02-11T09:00:00-03:00', reference: 'jan/2026' },
    { date: '2026-03-12T09:00:00-03:00', reference: 'fev/2026' },
    { date: '2026-04-10T09:00:00-03:00', reference: 'mar/2026' },
    { date: '2026-05-12T09:00:00-03:00', reference: 'abr/2026' },
    { date: '2026-06-10T09:00:00-03:00', reference: 'mai/2026' },
    { date: '2026-07-10T09:00:00-03:00', reference: 'jun/2026' },
    { date: '2026-08-12T09:00:00-03:00', reference: 'jul/2026' },
    { date: '2026-09-10T09:00:00-03:00', reference: 'ago/2026' },
    { date: '2026-10-09T09:00:00-03:00', reference: 'set/2026' },
    { date: '2026-11-11T09:00:00-03:00', reference: 'out/2026' },
    { date: '2026-12-10T09:00:00-03:00', reference: 'nov/2026' }
  ];
  return calendar2026.filter(r => r.date.startsWith(String(year)));
}

/**
 * Calendário IPCA-15 (prévia da inflação) — IBGE divulga por volta do dia 22.
 */
function getIPCA15Calendar(year) {
  const calendar2026 = [
    { date: '2026-01-23T09:00:00-03:00', reference: 'jan/2026' },
    { date: '2026-02-25T09:00:00-03:00', reference: 'fev/2026' },
    { date: '2026-03-25T09:00:00-03:00', reference: 'mar/2026' },
    { date: '2026-04-24T09:00:00-03:00', reference: 'abr/2026' },
    { date: '2026-05-26T09:00:00-03:00', reference: 'mai/2026' },
    { date: '2026-06-24T09:00:00-03:00', reference: 'jun/2026' },
    { date: '2026-07-23T09:00:00-03:00', reference: 'jul/2026' },
    { date: '2026-08-25T09:00:00-03:00', reference: 'ago/2026' },
    { date: '2026-09-24T09:00:00-03:00', reference: 'set/2026' },
    { date: '2026-10-23T09:00:00-03:00', reference: 'out/2026' },
    { date: '2026-11-25T09:00:00-03:00', reference: 'nov/2026' },
    { date: '2026-12-19T09:00:00-03:00', reference: 'dez/2026' }
  ];
  return calendar2026.filter(r => r.date.startsWith(String(year)));
}

/**
 * Boletim Focus — BCB divulga toda segunda às 8h25
 */
function getFocusCalendar(year) {
  const events = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const d = new Date(start);
  // Pula para a primeira segunda-feira do ano
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d <= end) {
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T08:25:00-03:00`;
    events.push({ date: iso });
    d.setDate(d.getDate() + 7);
  }
  return events;
}

/**
 * Busca a expectativa Focus mais recente pra cada indicador.
 * O Focus publica expectativa MENSAL do IPCA — exatamente o que precisamos
 * pra comparar com o release do IBGE (que também é mensal).
 */
async function fetchLatestFocusExpectations() {
  const out = { ipcaMensal: null, ipcaAnual: null, selic: null };

  // Expectativa MENSAL do IPCA (próxima divulgação)
  // Usa ExpectativasMercadoTop5Mensais que dá direto a mediana dos top 5 analistas
  try {
    const nowYear = new Date().getFullYear();
    const nowMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const dataRef = `${nowMonth}/${nowYear}`;
    const url = `${BCB_BASE}/Expectativas/versao/v1/odata/ExpectativasMercadoTop5Mensais?$top=20&$orderby=Data%20desc&$format=json&$filter=Indicador%20eq%20%27IPCA%27%20and%20DataReferencia%20eq%20%27${encodeURIComponent(dataRef)}%27`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const json = await res.json();
      const current = json.value?.[0];
      if (current) out.ipcaMensal = current.Mediana;
    }
  } catch (_) {}

  // Expectativa ANUAL (acumulado 12 meses) também pra contexto
  try {
    const nowYear = new Date().getFullYear();
    const url = `${BCB_BASE}/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=10&$orderby=Data%20desc&$format=json&$filter=Indicador%20eq%20%27IPCA%27%20and%20DataReferencia%20eq%20%27${nowYear}%27`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const json = await res.json();
      const current = json.value?.[0];
      if (current) out.ipcaAnual = current.Mediana;
    }
  } catch (_) {}

  // Expectativa da Selic
  try {
    const nowYear = new Date().getFullYear();
    const url = `${BCB_BASE}/Expectativas/versao/v1/odata/ExpectativasMercadoSelic?$top=10&$orderby=Data%20desc&$format=json&$filter=DataReferencia%20eq%20%27${nowYear}%27`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const json = await res.json();
      const current = json.value?.[0];
      if (current) out.selic = current.Mediana;
    }
  } catch (_) {}

  return out;
}

/**
 * Busca o último valor publicado para preencher "previous".
 *  - Selic anual: série SGS 432
 *  - IPCA mensal: série SGS 433 (TAXA mensal, comparável com o release)
 *  - IPCA acumulado 12m: série SGS 13522 (pra contexto)
 */
async function fetchLatestBCBData() {
  const out = { selic: null, ipcaMensal: null, ipcaAnual: null };

  // Selic
  try {
    const r = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' }
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data[0]) out.selic = data[0].valor;
    }
  } catch (_) {}

  // IPCA mensal — série 433 (esse é o que sai mensalmente e é o que o operador compara)
  try {
    const r = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json', {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' }
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data[0]) out.ipcaMensal = data[0].valor;
    }
  } catch (_) {}

  // IPCA acumulado 12 meses — série 13522 (pra contexto)
  try {
    const r = await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json', {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' }
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data[0]) out.ipcaAnual = data[0].valor;
    }
  } catch (_) {}

  return out;
}

/**
 * Constrói os eventos brasileiros a partir dos calendários + dados reais.
 */
async function fetchFromBR() {
  const year = new Date().getFullYear();
  const events = [];

  // Busca dados reais em paralelo
  const [copom, latest, focus] = await Promise.all([
    fetchCopomCalendar(),
    fetchLatestBCBData(),
    fetchLatestFocusExpectations()
  ]);

  // === COPOM (3 estrelas) ===
  for (const reuniao of copom) {
    const datetime = reuniao.DataReuniao || reuniao.date;
    if (!datetime) continue;
    const eventName = 'Copom Interest Rate Decision';
    const classification = classifyEvent(eventName, 'Brazil');
    events.push({
      id: `bcb_copom_${datetime}`,
      datetime,
      country: 'BR',
      countryName: 'Brazil',
      event: 'Decisão Copom (Taxa Selic)',
      reference: reuniao.Reuniao ? `Reunião ${reuniao.Reuniao}` : '',
      stars: 3,
      actual: null,
      forecast: null,
      previous: latest.selic ? `${latest.selic}%` : null,
      unit: '',
      bias: 'PENDING',
      surprise: 0,
      magnitude: 'unknown',
      direction: classification?.direction || 'dovish_good',
      typicalRange: classification?.typicalRange || [400, 1200],
      notes: 'Decisão do Copom. Corte = bom pro WIN, manutenção/alta = ruim. Comunicado importa muito.',
      released: false,
      source: 'bcb'
    });
  }

  // === IPCA (3 estrelas) ===
  for (const item of getIPCACalendar(year)) {
    const classification = classifyEvent('IPCA Inflation Rate YoY', 'Brazil');
    events.push({
      id: `ibge_ipca_${item.date}`,
      datetime: item.date,
      country: 'BR',
      countryName: 'Brazil',
      event: 'IPCA (Inflação Mensal)',
      reference: item.reference,
      stars: 3,
      actual: null,
      forecast: focus.ipcaMensal != null ? `${focus.ipcaMensal}%` : null,
      previous: latest.ipcaMensal != null ? `${latest.ipcaMensal}%` : null,
      unit: '',
      bias: 'PENDING',
      surprise: 0,
      magnitude: 'unknown',
      direction: classification?.direction || 'hawkish_bad',
      typicalRange: classification?.typicalRange || [200, 600],
      notes: 'IPCA acima do esperado = BC pode adiar cortes = ruim pro WIN.',
      released: false,
      source: 'ibge'
    });
  }

  // === IPCA-15 (2 estrelas) ===
  for (const item of getIPCA15Calendar(year)) {
    events.push({
      id: `ibge_ipca15_${item.date}`,
      datetime: item.date,
      country: 'BR',
      countryName: 'Brazil',
      event: 'IPCA-15 (Prévia da Inflação)',
      reference: item.reference,
      stars: 2,
      actual: null,
      forecast: null,
      previous: null,
      unit: '',
      bias: 'PENDING',
      surprise: 0,
      magnitude: 'unknown',
      direction: 'hawkish_bad',
      typicalRange: [100, 300],
      notes: 'Prévia do IPCA. Movimenta menos mas serve de termômetro pra a inflação cheia.',
      released: false,
      source: 'ibge'
    });
  }

  // === BOLETIM FOCUS (2 estrelas, semanal segunda 8h25) ===
  for (const item of getFocusCalendar(year)) {
    events.push({
      id: `bcb_focus_${item.date}`,
      datetime: item.date,
      country: 'BR',
      countryName: 'Brazil',
      event: 'Boletim Focus',
      reference: 'Expectativas do mercado',
      stars: 2,
      actual: null,
      forecast: null,
      previous: null,
      unit: '',
      bias: 'PENDING',
      surprise: 0,
      magnitude: 'unknown',
      direction: 'neutral',
      typicalRange: [50, 150],
      notes: 'Relatório Focus do BCB. Move quando há revisão grande nas expectativas.',
      released: false,
      source: 'bcb'
    });
  }

  return events;
}

// ============================================================
// FONTE 2: FOREXFACTORY (EUA)
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

async function fetchFromUS() {
  const events = [];
  try {
    const data = await fetchForexFactory(FF_THIS_WEEK_URL);
    if (Array.isArray(data)) {
      for (const item of data) {
        const norm = normalizeFFEvent(item);
        // Filtra só EUA (o BR vem do BCB+IBGE)
        if (norm && norm.country === 'US') events.push(norm);
      }
    }
  } catch (err) {
    console.error('[ForexFactory thisweek] Erro:', err.message);
  }
  try {
    const data = await fetchForexFactory(FF_NEXT_WEEK_URL);
    if (Array.isArray(data)) {
      for (const item of data) {
        const norm = normalizeFFEvent(item);
        if (norm && norm.country === 'US') events.push(norm);
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

  let allEvents = [];

  // Brasil: BCB + IBGE em paralelo, com fallback de hardcoded
  try {
    const brEvents = await fetchFromBR();
    allEvents.push(...brEvents);
    console.log(`[CALENDAR] BR (BCB+IBGE): ${brEvents.length} eventos`);
  } catch (err) {
    console.error('[CALENDAR] BR falhou:', err.message);
  }

  // EUA: ForexFactory
  try {
    const usEvents = await fetchFromUS();
    allEvents.push(...usEvents);
    console.log(`[CALENDAR] US (ForexFactory): ${usEvents.length} eventos`);
  } catch (err) {
    console.error('[CALENDAR] US falhou:', err.message);
  }

  if (allEvents.length > 0) {
    cache = { events: allEvents, fetchedAt: now, source: 'bcb+ibge+forexfactory' };
    console.log(`[CALENDAR] TOTAL: ${allEvents.length} eventos. Próx. atualização em ${CACHE_TTL_MS / 60000}min.`);
    return filterUpcoming(allEvents);
  }

  if (cache.events) {
    console.log('[CALENDAR] Falha total, usando cache antigo');
    return filterUpcoming(cache.events);
  }

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
