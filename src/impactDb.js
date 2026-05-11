// Base de conhecimento: impacto histórico de cada indicador econômico no mini índice (WIN)
// Classificação de impacto compatível com o padrão "estrelas" do Investing.com:
//   3 estrelas = HIGH    (alto impacto, move o mercado de forma significativa)
//   2 estrelas = MEDIUM  (impacto moderado, atenção necessária)
//   1 estrela  = LOW     (baixo impacto, geralmente ignorado)
//
// Cada entrada contém:
//   - keywords: termos para casar com o nome do evento vindo da API
//   - country: BR ou US (foco do sistema)
//   - stars: 2 ou 3 (filtramos só esses)
//   - direction: como interpretar surpresa (acima do esperado bom ou ruim pro WIN?)
//      "hawkish_bad"   = dado forte/inflacionário é RUIM pro WIN (Fed/BC pode subir juros)
//      "hawkish_good"  = dado forte é BOM pro WIN (atividade econômica saudável)
//      "dovish_good"   = dado fraco é BOM pro WIN (juros podem cair)
//      "neutral"       = depende do contexto, sem viés direcional automático
//   - typicalRange: faixa típica de movimento em pontos do WIN logo após o release
//   - notes: contexto rápido para o operador

export const IMPACT_DB = [
  // ==================== ESTADOS UNIDOS (3 estrelas) ====================
  {
    keywords: ['non-farm payrolls', 'nonfarm payrolls', 'nfp', 'payroll'],
    country: 'US',
    stars: 3,
    direction: 'hawkish_bad',
    typicalRange: [200, 600],
    notes: 'Payroll forte = Fed mantém juros altos = pressão baixista no WIN. Sai 1ª sexta do mês, 9h30 BRT.'
  },
  {
    keywords: ['cpi', 'consumer price index'],
    country: 'US',
    stars: 3,
    direction: 'hawkish_bad',
    typicalRange: [150, 500],
    notes: 'CPI acima do esperado = inflação persistente = ruim pro WIN. Core CPI tem peso ainda maior.'
  },
  {
    keywords: ['fomc', 'fed interest rate', 'federal funds rate', 'fed rate decision'],
    country: 'US',
    stars: 3,
    direction: 'hawkish_bad',
    typicalRange: [300, 1000],
    notes: 'Decisão do Fed. Comunicado e coletiva do Powell movem ainda mais que a decisão em si.'
  },
  {
    keywords: ['ppi', 'producer price index'],
    country: 'US',
    stars: 2,
    direction: 'hawkish_bad',
    typicalRange: [100, 300],
    notes: 'Inflação ao produtor, antecede o CPI. Reação menor mas relevante.'
  },
  {
    keywords: ['retail sales'],
    country: 'US',
    stars: 2,
    direction: 'hawkish_good',
    typicalRange: [100, 250],
    notes: 'Vendas no varejo fortes = economia americana saudável = bom pro WIN (em geral).'
  },
  {
    keywords: ['gdp', 'gross domestic product'],
    country: 'US',
    stars: 3,
    direction: 'hawkish_good',
    typicalRange: [200, 400],
    notes: 'PIB americano. Forte = soft landing = bom. Fraco = recessão = ruim pro risco global.'
  },
  {
    keywords: ['unemployment rate', 'jobless claims', 'initial jobless'],
    country: 'US',
    stars: 2,
    direction: 'dovish_good',
    typicalRange: [80, 200],
    notes: 'Desemprego subindo = Fed pode cortar = bom pro WIN. Jobless claims sai semanalmente (5ª).'
  },
  {
    keywords: ['ism manufacturing', 'ism services', 'pmi'],
    country: 'US',
    stars: 2,
    direction: 'hawkish_good',
    typicalRange: [100, 250],
    notes: 'Índice de atividade. Acima de 50 expande, abaixo contrai. Forte = bom pro risco.'
  },
  {
    keywords: ['core pce', 'pce price index', 'personal consumption expenditures'],
    country: 'US',
    stars: 3,
    direction: 'hawkish_bad',
    typicalRange: [150, 400],
    notes: 'Inflação preferida do Fed. Acima do esperado = hawkish = ruim pro WIN.'
  },
  {
    keywords: ['adp employment', 'adp non-farm'],
    country: 'US',
    stars: 2,
    direction: 'hawkish_bad',
    typicalRange: [80, 200],
    notes: 'Sai 2 dias antes do payroll, dá pista do número oficial.'
  },
  {
    keywords: ['fed chair', 'powell speech', 'fed speaks', 'jackson hole'],
    country: 'US',
    stars: 3,
    direction: 'neutral',
    typicalRange: [200, 800],
    notes: 'Falas do Powell movem muito. Atenção ao tom: hawkish derruba, dovish sobe.'
  },

  // ==================== BRASIL (3 estrelas) ====================
  {
    keywords: ['copom', 'selic interest rate', 'taxa selic', 'interest rate decision'],
    country: 'BR',
    stars: 3,
    direction: 'dovish_good',
    typicalRange: [400, 1200],
    notes: 'Decisão do Copom. Corte = bom pro WIN, manutenção/alta = ruim. Comunicado importa muito.'
  },
  {
    keywords: ['ipca', 'inflation rate', 'mid-month inflation', 'ipca-15'],
    country: 'BR',
    stars: 3,
    direction: 'hawkish_bad',
    typicalRange: [200, 600],
    notes: 'IPCA acima do esperado = BC pode adiar cortes = ruim pro WIN.'
  },
  {
    keywords: ['gdp', 'pib brasil', 'brazilian gdp'],
    country: 'BR',
    stars: 3,
    direction: 'hawkish_good',
    typicalRange: [150, 400],
    notes: 'PIB brasileiro. Crescimento forte tende a beneficiar o índice.'
  },
  {
    keywords: ['unemployment', 'taxa de desemprego', 'pnad'],
    country: 'BR',
    stars: 2,
    direction: 'neutral',
    typicalRange: [100, 250],
    notes: 'Desemprego no Brasil. Impacto moderado, mais relevante em viradas de ciclo.'
  },
  {
    keywords: ['retail sales', 'vendas no varejo'],
    country: 'BR',
    stars: 2,
    direction: 'hawkish_good',
    typicalRange: [80, 200],
    notes: 'Atividade do varejo brasileiro. Forte = bom para empresas listadas.'
  },
  {
    keywords: ['industrial production', 'produção industrial'],
    country: 'BR',
    stars: 2,
    direction: 'hawkish_good',
    typicalRange: [80, 200],
    notes: 'Produção industrial brasileira. Indicador de atividade real.'
  },
  {
    keywords: ['focus', 'boletim focus', 'market expectations'],
    country: 'BR',
    stars: 2,
    direction: 'neutral',
    typicalRange: [50, 150],
    notes: 'Relatório Focus do BCB. Sai toda 2ª de manhã. Move quando há revisão grande.'
  },
  {
    keywords: ['copom minutes', 'ata do copom'],
    country: 'BR',
    stars: 3,
    direction: 'neutral',
    typicalRange: [200, 600],
    notes: 'Ata do Copom (3ª seguinte à reunião). Tom hawkish/dovish move o WIN.'
  },
  {
    keywords: ['fiscal', 'primary balance', 'resultado primário'],
    country: 'BR',
    stars: 2,
    direction: 'neutral',
    typicalRange: [100, 300],
    notes: 'Risco fiscal é tema dominante. Surpresas negativas pesam muito.'
  }
];

/**
 * Classifica um evento da API com base no nome e país.
 * Retorna o registro do IMPACT_DB que melhor casa, ou null.
 */
export function classifyEvent(eventName, country) {
  if (!eventName) return null;
  const name = eventName.toLowerCase();
  const cc = (country || '').toUpperCase();

  // Normaliza país (TradingEconomics usa "United States", "Brazil", etc)
  const normalized = cc.includes('UNITED STATES') || cc === 'US' ? 'US'
                   : cc.includes('BRAZIL') || cc === 'BR' ? 'BR'
                   : cc;

  // Tenta casar pelo conjunto de keywords mais específico primeiro
  const matches = IMPACT_DB
    .filter(entry => entry.country === normalized)
    .filter(entry => entry.keywords.some(kw => name.includes(kw)))
    .sort((a, b) => {
      // Prioriza match com keyword mais longa (mais específica)
      const aLen = Math.max(...a.keywords.filter(k => name.includes(k)).map(k => k.length));
      const bLen = Math.max(...b.keywords.filter(k => name.includes(k)).map(k => k.length));
      return bLen - aLen;
    });

  return matches[0] || null;
}

/**
 * Calcula o viés direcional dado o "actual" vs "forecast" e o tipo do evento.
 * Retorna: { bias: 'BULLISH'|'BEARISH'|'NEUTRAL', surprise: number, magnitude: 'small'|'medium'|'large' }
 */
export function calculateBias(actual, forecast, previous, classification) {
  if (actual == null || forecast == null) {
    return { bias: 'PENDING', surprise: 0, magnitude: 'unknown' };
  }

  const a = parseFloat(actual);
  const f = parseFloat(forecast);
  if (isNaN(a) || isNaN(f)) return { bias: 'PENDING', surprise: 0, magnitude: 'unknown' };

  // Surpresa percentual (com proteção pra forecast = 0)
  const surprisePct = f === 0 ? (a - f) * 100 : ((a - f) / Math.abs(f)) * 100;
  const absSurprise = Math.abs(surprisePct);

  let magnitude = 'small';
  if (absSurprise >= 20) magnitude = 'large';
  else if (absSurprise >= 5) magnitude = 'medium';

  let bias = 'NEUTRAL';
  const above = a > f;

  switch (classification?.direction) {
    case 'hawkish_bad':
      // Dado acima do esperado = hawkish = ruim pro WIN
      bias = above ? 'BEARISH' : 'BULLISH';
      break;
    case 'hawkish_good':
      // Dado acima do esperado = atividade forte = bom pro WIN
      bias = above ? 'BULLISH' : 'BEARISH';
      break;
    case 'dovish_good':
      // Dado abaixo do esperado = dovish = bom pro WIN
      bias = above ? 'BEARISH' : 'BULLISH';
      break;
    default:
      bias = 'NEUTRAL';
  }

  // Surpresa muito pequena = neutro independente do viés
  if (magnitude === 'small' && absSurprise < 1) bias = 'NEUTRAL';

  return { bias, surprise: surprisePct, magnitude };
}
