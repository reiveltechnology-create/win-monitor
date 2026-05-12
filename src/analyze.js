// Análise de impacto via Claude API — 3 modos especializados
// =============================================================================
// O sistema detecta automaticamente em qual momento a análise está sendo
// solicitada e usa o prompt correto:
//
//   1. PRÉ-NOTÍCIA       (evento ainda não ocorreu)
//      → Análise de preparação: cenários esperados, gatilhos, o que monitorar
//
//   2. PÓS-NOTÍCIA SEM DADOS (evento já ocorreu mas API ainda não tem actual)
//      → Análise de reação preliminar: cenários hipotéticos baseados em forecast
//
//   3. PÓS-NOTÍCIA COMPLETA (evento ocorreu e temos actual/forecast/previous)
//      → Análise definitiva: leitura institucional completa com dados reais
//
// Cache é chaveado por eventId + modo, então um evento pode ter cache pré
// E pós ao mesmo tempo.
// =============================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const analysisCache = new Map();

// ============================================================
// DETECÇÃO DE MOMENTO
// ============================================================
function detectMode(ev) {
  const now = Date.now();
  const evTime = new Date(ev.datetime).getTime();
  const hasFullData = ev.actual != null && ev.forecast != null;

  if (evTime > now) {
    return 'pre';            // ainda vai acontecer
  }
  if (hasFullData) {
    return 'post_complete';  // já saiu E temos dados completos
  }
  return 'post_preliminary'; // já saiu mas sem actual ainda
}

// ============================================================
// FORMATTERS
// ============================================================
function fmtTimeUntil(ev) {
  const diffMs = new Date(ev.datetime).getTime() - Date.now();
  if (diffMs <= 0) return 'evento já ocorreu';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `em ${mins} minuto${mins === 1 ? '' : 's'}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `em ${hours} hora${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `em ${days} dia${days === 1 ? '' : 's'}`;
}

function fmtTimeSince(ev) {
  const diffMs = Date.now() - new Date(ev.datetime).getTime();
  if (diffMs <= 0) return 'ainda não ocorreu';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `há ${mins} minuto${mins === 1 ? '' : 's'}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `há ${hours} hora${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `há ${days} dia${days === 1 ? '' : 's'}`;
}

function commonContext(ev) {
  const country = ev.country === 'BR' ? 'Brasil' : 'Estados Unidos';
  const flagEmoji = ev.country === 'BR' ? '🇧🇷' : '🇺🇸';
  const faixa = Array.isArray(ev.typicalRange) && ev.typicalRange.length === 2
    ? `${ev.typicalRange[0]}–${ev.typicalRange[1]} pontos`
    : 'não definida';

  return { country, flagEmoji, faixa };
}

// ============================================================
// PROMPT 1: PRÉ-NOTÍCIA (preparação)
// ============================================================
function buildPromptPre(ev) {
  const { country, flagEmoji, faixa } = commonContext(ev);
  const timeUntil = fmtTimeUntil(ev);
  const evDate = new Date(ev.datetime).toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });

  return `Você é um analista institucional brasileiro veterano de mesa, especialista em day trade do mini índice (WIN). Um indicador econômico importante VAI SAIR ${timeUntil} e o operador precisa se preparar.

CONTEXTO DO EVENTO QUE ESTÁ POR VIR:
- Indicador: ${ev.event}
- País: ${country} ${flagEmoji}
- Data/hora: ${evDate} (${timeUntil})
- Anterior (último publicado): ${ev.previous ?? 'não disponível'}
- Esperado (consenso de mercado): ${ev.forecast ?? 'não disponível'}
- Estrelas de impacto: ${ev.stars}/3
- Natureza do indicador: ${ev.direction} (hawkish_bad = alto é ruim pra bolsa; hawkish_good = alto é bom; dovish_good = baixo é bom; neutral = depende do contexto)
- Faixa típica de impacto no WIN: ${faixa}
- Notas internas: ${ev.notes || 'sem notas'}

INSTRUÇÕES CRÍTICAS:
- A NOTÍCIA AINDA NÃO SAIU. Sua análise é de PREPARAÇÃO, não de reação.
- Responda em PORTUGUÊS BRASILEIRO, tom institucional, decisivo.
- Use o formato EXATO abaixo, com emojis e seções na ordem.
- Foque em: o que monitorar, faixas críticas, cenários condicionais (SE veio acima/abaixo).
- NÃO recomende compra/venda específica.
- Cada seção curta (1-3 linhas), zero verbosidade.

FORMATO DE RESPOSTA (siga LITERALMENTE):

📊 Análise PRÉ-Notícia — Preparação para ${ev.event}

⏰ Momento: ${timeUntil}

🎯 O que o mercado espera
[2-3 bullets ➡️ com expectativa e contexto]

📌 Números de referência
➡️ Consenso: ${ev.forecast ?? 'sem consenso público'}
➡️ Anterior: ${ev.previous ?? 'sem dado anterior'}
➡️ Faixa típica de impacto: ${faixa} no WIN

🚦 Cenários condicionais (o que fazer SE...)

🔴 SE veio ACIMA do consenso
➡️ [reação esperada no WIN]
➡️ [movimento técnico típico]

🟢 SE veio ABAIXO do consenso
➡️ [reação esperada no WIN]
➡️ [movimento técnico típico]

⚪ SE veio EM LINHA com o consenso
➡️ [reação esperada — geralmente lateralização]

🔥 Armadilhas clássicas
[2 bullets sobre padrões típicos: spike inicial, fake breakout, etc]

🎯 O que monitorar nos primeiros 5 minutos pós-release
[3 bullets ➡️ sobre níveis técnicos, volume, dólar, juros]

📊 Impacto esperado por ativo (cenário hawkish)
| Ativo | Reação esperada |
|---|---|
| Mini índice | 🔴 ou 🟢 [direção] |
| Dólar | 🔴 ou 🟢 [direção] |
| Bolsa EUA | 🔴 ou 🟢 [direção] |
| Juros | 🔴 ou 🟢 [direção] |

🎯 Estratégia de preparação
Posicionamento:
➡️ [orientação geral pré-evento, ex: reduzir exposição, ficar de fora, estar pronto pra entrar]
Evitar:
❌ [erros comuns operando perto de notícia]

💬 Leitura sincera
[1 parágrafo: cenário macro, sensibilidade do mercado HOJE, peso desse indicador no contexto atual]`;
}

// ============================================================
// PROMPT 2: PÓS-NOTÍCIA SEM DADOS (reação preliminar)
// ============================================================
function buildPromptPostPreliminary(ev) {
  const { country, flagEmoji, faixa } = commonContext(ev);
  const timeSince = fmtTimeSince(ev);

  return `Você é um analista institucional brasileiro de mesa, especialista em day trade do mini índice (WIN). Um indicador econômico foi divulgado ${timeSince}, mas o valor exato ainda não chegou via APIs. O operador precisa de uma leitura PRELIMINAR pra agir.

DADOS DISPONÍVEIS:
- Indicador: ${ev.event}
- País: ${country} ${flagEmoji}
- Saiu ${timeSince}
- Anterior (último publicado): ${ev.previous ?? 'não disponível'}
- Esperado (consenso de mercado): ${ev.forecast ?? 'não disponível'}
- Valor publicado (Actual): ainda não disponível
- Estrelas de impacto: ${ev.stars}/3
- Natureza do indicador: ${ev.direction}
- Faixa típica de impacto no WIN: ${faixa}
- Notas internas: ${ev.notes || 'sem notas'}

INSTRUÇÕES CRÍTICAS:
- O VALOR ATUAL NÃO ESTÁ DISPONÍVEL ainda — não invente número.
- Faça análise CONDICIONAL: "se veio X, espera-se Y".
- Use a reação observada no GRÁFICO como referência primária — o operador deve estar olhando o WIN.
- Responda em PORTUGUÊS BRASILEIRO, tom institucional, decisivo, honesto sobre incerteza.
- Use o formato EXATO abaixo.

FORMATO DE RESPOSTA (siga LITERALMENTE):

📊 Análise PRELIMINAR — ${ev.event}

⏱ Notícia saiu ${timeSince}, dado oficial ainda não chegou na API

🔥 Como ler o mercado AGORA
[2-3 bullets ➡️ orientando o operador a usar o próprio gráfico do WIN como leitura primária — movimento já reagiu]

📌 Referências esperadas
➡️ Consenso era: ${ev.forecast ?? 'sem consenso público'}
➡️ Valor anterior: ${ev.previous ?? 'sem dado anterior'}

🚦 Interprete o movimento do WIN assim:

🔴 SE o WIN está CAINDO forte agora
➡️ [provavelmente o dado veio em direção desfavorável — explicar qual]

🟢 SE o WIN está SUBINDO forte agora
➡️ [provavelmente o dado veio em direção favorável — explicar qual]

⚪ SE o WIN está LATERAL
➡️ [dado veio em linha ou mercado já tinha precificado]

🔥 Armadilhas neste momento
[2 bullets sobre: spike inicial enganoso, busca de liquidez, false breakout antes da tendência real]

🎯 Próximos minutos
[2-3 bullets ➡️ sobre o que monitorar: tempo gráfico, volume, fluxo institucional, dólar]

📊 Impacto típico esperado
| Cenário | Movimento no WIN |
|---|---|
| Hawkish (dado ruim pra bolsa) | 🔴 queda de ${faixa} |
| Dovish (dado bom pra bolsa) | 🟢 alta de ${faixa} |
| Em linha | ⚪ lateralização |

🎯 Estratégia agora
Melhor abordagem:
➡️ [orientação: confirmar com gráfico, esperar 5min, vender repique de armadilha, etc]
Evitar:
❌ [perseguir movimento sem confirmação, entrar em spike inicial]

💬 Leitura sincera
[1 parágrafo: honesto sobre não termos o número, dando orientação prática de como agir com o que se tem]`;
}

// ============================================================
// PROMPT 3: PÓS-NOTÍCIA COMPLETA (análise definitiva)
// ============================================================
function buildPromptPostComplete(ev) {
  const { country, flagEmoji, faixa } = commonContext(ev);
  const timeSince = fmtTimeSince(ev);

  return `Você é um analista institucional brasileiro veterano de mesa, especialista em day trade do mini índice (WIN). O indicador foi divulgado ${timeSince} e temos os dados completos. O operador precisa de uma leitura DEFINITIVA pra agir no gráfico.

DADOS COMPLETOS DO RELEASE:
- Indicador: ${ev.event}
- País: ${country} ${flagEmoji}
- Saiu ${timeSince}
- Valor publicado (Actual): ${ev.actual}
- Esperado (Forecast): ${ev.forecast ?? 'não disponível'}
- Anterior (Previous): ${ev.previous ?? 'não disponível'}
- Estrelas de impacto: ${ev.stars}/3
- Natureza do indicador: ${ev.direction} (hawkish_bad = alto é ruim pra bolsa; hawkish_good = alto é bom; dovish_good = baixo é bom)
- Faixa típica de impacto no WIN: ${faixa}
- Notas internas: ${ev.notes || 'sem notas'}

INSTRUÇÕES CRÍTICAS:
- Responda em PORTUGUÊS BRASILEIRO, tom institucional, decisivo.
- Use o formato EXATO abaixo, com emojis e seções na ordem.
- Compare ACTUAL vs FORECAST: essa é a surpresa que move o mercado.
- Seja honesto sobre incertezas mas DIRETO na conclusão.
- NÃO recomende compra/venda específica.
- Cada seção curta (1-3 linhas).

FORMATO DE RESPOSTA (siga LITERALMENTE):

📊 Resumo Técnico do Impacto da Notícia no Mini Índice (WIN)

🔥 Resultado principal:
[1 frase com o veredito: o dado veio MAIS/MENOS [forte/fraco] que o esperado, e isso é positivo/negativo/neutro pra bolsa]

${flagEmoji} ${ev.event} — Leitura Profissional
📌 ${ev.event}
${ev.actual} vs ${ev.forecast ?? 'sem consenso'} esperado
➡️ [tradução de uma linha do que isso significa em termos econômicos]
${ev.previous ? `📌 Anterior: ${ev.previous} → mudança: [calcular se acelerou ou desacelerou]` : ''}

🧠 Tradução institucional
[3-4 bullets curtos com 👉 do que o mercado interpreta — citar Fed/Copom se relevante]

📉 Impacto no Mini Índice
🔴 ou 🟢 Impacto principal:
➡️ [POSITIVO ou NEGATIVO] para bolsa
Porque:
[3-4 linhas com razões macro]

⚠️ O que esperar no WIN
📌 Movimento mais provável:
➡️ [direção + magnitude esperada em pontos]
➡️ [horizonte: primeiros minutos, primeira hora, dia inteiro]
➡️ [níveis técnicos relevantes se aplicável]

🔥 Mas atenção (muito importante)
[1-2 linhas sobre padrão típico: spike inicial, armadilha, busca de liquidez antes da tendência real]

🎯 Cenários Prováveis
🔴 Cenário principal (mais provável)
➡️ [cenário detalhado com narrativa de movimento]

🟡 Cenário alternativo
➡️ [cenário alternativo, geralmente squeeze contrário antes da tendência]

📌 O detalhe mais importante
[1-2 linhas sobre o foco atual do mercado: inflação, juros, emprego, geopolítica]

📊 Impacto esperado por ativo
| Ativo | Impacto |
|---|---|
| Mini índice | 🔴 ou 🟢 [direção e magnitude] |
| Dólar | 🔴 ou 🟢 [direção] |
| Bolsa EUA (Nasdaq/S&P) | 🔴 ou 🟢 [direção] |
| Juros longos | 🔴 ou 🟢 [direção] |

🎯 Estratégia profissional hoje
Melhor abordagem:
➡️ [orientação curta, ex: vender repiques, comprar correções, ficar de fora]
Evitar:
❌ [erros comuns: comprar topo pós-notícia, entrar no primeiro candle]

💬 Leitura sincera
[1 parágrafo conclusivo, honesto, profissional. Mencione contexto macro atual e como esse dado se encaixa no quadro maior]`;
}

// ============================================================
// ORQUESTRAÇÃO
// ============================================================
function getCacheKey(eventId, mode) {
  return `${eventId}::${mode}`;
}

/**
 * Chama a API do Claude para gerar análise estruturada.
 * O modo é detectado automaticamente baseado no estado do evento.
 */
export async function generateAnalysis(ev, apiKey) {
  if (!apiKey) {
    return { error: 'ANTHROPIC_API_KEY não configurada no servidor' };
  }

  const mode = detectMode(ev);
  const cacheKey = getCacheKey(ev.id, mode);

  // Cache: se já analisou esse evento neste modo, retorna direto
  if (analysisCache.has(cacheKey)) {
    return {
      analysis: analysisCache.get(cacheKey),
      cached: true,
      mode
    };
  }

  let prompt;
  switch (mode) {
    case 'pre':              prompt = buildPromptPre(ev); break;
    case 'post_preliminary': prompt = buildPromptPostPreliminary(ev); break;
    case 'post_complete':    prompt = buildPromptPostComplete(ev); break;
    default:                 prompt = buildPromptPostComplete(ev);
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[ANALYZE] Erro API Claude:', res.status, errText.slice(0, 300));
      return { error: `Claude API retornou ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const analysis = data.content?.[0]?.text || '';
    if (!analysis) {
      return { error: 'Resposta vazia do Claude' };
    }

    analysisCache.set(cacheKey, analysis);
    console.log(`[ANALYZE] ${ev.event} (${ev.country}) modo=${mode} — gerada (${data.usage?.input_tokens || 0}in/${data.usage?.output_tokens || 0}out)`);

    return { analysis, cached: false, mode, usage: data.usage };
  } catch (err) {
    console.error('[ANALYZE] Exceção:', err.message);
    return { error: err.message };
  }
}

/**
 * Limpa cache. Se mode não for passado, limpa todos os modos do evento.
 */
export function clearAnalysisCache(eventId, mode = null) {
  if (mode) {
    analysisCache.delete(getCacheKey(eventId, mode));
  } else {
    for (const key of Array.from(analysisCache.keys())) {
      if (key.startsWith(eventId + '::')) analysisCache.delete(key);
    }
  }
}

/**
 * Retorna análise em cache pra um evento. Tenta o modo atual primeiro.
 * Se não tiver, retorna qualquer análise disponível pra esse evento.
 */
export function getCachedAnalysis(eventId, mode = null) {
  if (mode) {
    return analysisCache.get(getCacheKey(eventId, mode)) || null;
  }
  for (const key of analysisCache.keys()) {
    if (key.startsWith(eventId + '::')) {
      return analysisCache.get(key);
    }
  }
  return null;
}

/**
 * Detecta o modo atual de um evento (exportado pra UI saber qual rótulo mostrar).
 */
export function getMode(ev) {
  return detectMode(ev);
}
