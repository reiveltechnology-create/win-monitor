// Cliente da API TradingEconomics - calendário econômico
// Docs: https://docs.tradingeconomics.com/economic_calendar/
//
// A chave 'guest:guest' funciona com dados limitados (apenas alguns países).
// Para uso sério, registrar em https://tradingeconomics.com/api/ (free tier disponível).

import { classifyEvent, calculateBias } from './impactDb.js';

const TE_BASE = 'https://api.tradingeconomics.com';

/**
 * Busca o calendário econômico para BR e US numa janela de datas.
 * @param {string} dateFrom YYYY-MM-DD
 * @param {string} dateTo   YYYY-MM-DD
 * @returns {Promise<Array>} eventos normalizados e classificados
 */
export async function fetchCalendar(dateFrom, dateTo, apiKey = 'guest:guest') {
  const countries = 'united states,brazil';
  const url = `${TE_BASE}/calendar/country/${encodeURIComponent(countries)}` +
              `?d1=${dateFrom}&d2=${dateTo}&c=${apiKey}&f=json`;

  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    throw new Error(`TradingEconomics API ${res.status}: ${await res.text()}`);
  }
  const raw = await res.json();
  if (!Array.isArray(raw)) {
    throw new Error('Resposta inesperada da API: ' + JSON.stringify(raw).slice(0, 200));
  }

  return raw.map(normalizeEvent).filter(Boolean);
}

/**
 * Normaliza o objeto da API para o formato interno.
 * Filtra apenas eventos que casam com nossa base (2 ou 3 estrelas mapeados).
 */
function normalizeEvent(item) {
  // Campos típicos da TE: Date, Country, Category, Event, Reference, Importance,
  // Actual, Forecast, Previous, Unit, CalendarId
  const eventName = item.Event || item.Category || '';
  const country = item.Country || '';

  const classification = classifyEvent(eventName, country);
  if (!classification) return null; // não está na nossa watchlist

  // TradingEconomics usa Importance: 1 (low), 2 (medium), 3 (high)
  // A gente respeita o que vem da API, mas se não vier, usa o que está na nossa DB
  const apiImportance = parseInt(item.Importance, 10);
  const stars = !isNaN(apiImportance) ? apiImportance : classification.stars;

  // Filtro principal: só 2 e 3 estrelas
  if (stars < 2) return null;

  const biasInfo = calculateBias(
    item.Actual,
    item.Forecast,
    item.Previous,
    classification
  );

  return {
    id: String(item.CalendarId || `${item.Date}_${eventName}`),
    datetime: item.Date, // ISO string em UTC
    country: classification.country,
    countryName: country,
    event: eventName,
    reference: item.Reference || '',
    stars,
    actual: item.Actual ?? null,
    forecast: item.Forecast ?? null,
    previous: item.Previous ?? null,
    unit: item.Unit || '',
    bias: biasInfo.bias,
    surprise: biasInfo.surprise,
    magnitude: biasInfo.magnitude,
    direction: classification.direction,
    typicalRange: classification.typicalRange,
    notes: classification.notes,
    released: item.Actual != null && item.Actual !== ''
  };
}

/**
 * Helper: formata YYYY-MM-DD a partir de Date.
 */
export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Busca eventos para hoje e amanhã (cobre o pregão atual + agenda do dia seguinte).
 */
export async function fetchTodayAndTomorrow(apiKey) {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return fetchCalendar(formatDate(today), formatDate(tomorrow), apiKey);
}
