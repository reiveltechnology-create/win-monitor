// Análise de impacto via Claude API
// =============================================================================
// Chama a API Messages do Anthropic Claude com prompt estruturado pra gerar
// análise técnica institucional no padrão fixo definido pelo usuário.
// =============================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

// Cache em memória — análises por ID de evento (não chama Claude 2x pra mesmo release)
const analysisCache = new Map();

function buildPrompt(ev) {
  const country = ev.country === 'BR' ? 'Brasil' : 'Estados Unidos';
  const flagEmoji = ev.country === 'BR' ? '🇧🇷' : '🇺🇸';

  return `Você é um analista institucional brasileiro especializado em day trade de mini índice (WIN). Acabou de sair um indicador econômico e o operador precisa de uma leitura RÁPIDA e PROFISSIONAL pra agir no gráfico.

DADOS DO RELEASE:
- Indicador: ${ev.event}
- País: ${country} ${flagEmoji}
- Valor publicado (Actual): ${ev.actual ?? 'não disponível'}
- Esperado (Forecast): ${ev.forecast ?? 'não disponível'}
- Anterior (Previous): ${ev.previous ?? 'não disponível'}
- Estrelas de impacto: ${ev.stars}/3
- Natureza do indicador: ${ev.direction} (hawkish_bad = alto é ruim pra bolsa; hawkish_good = alto é bom; dovish_good = baixo é bom)
- Faixa típica de impacto no WIN: ${Array.isArray(ev.typicalRange) && ev.typicalRange.length === 2 ? `${ev.typicalRange[0]}–${ev.typicalRange[1]} pontos` : 'não definida'}
- Notas internas: ${ev.notes || 'sem notas'}

INSTRUÇÕES:
- Responda em PORTUGUÊS BRASILEIRO, tom institucional/profissional, decisivo.
- Use o formato EXATO abaixo, com os emojis e seções na mesma ordem.
- Seja honesto sobre incertezas mas direto na conclusão.
- NÃO recomende compra/venda específica — apenas leitura de impacto e cenários.
- Não invente dados que não foram fornecidos.
- Cada seção deve ser curta (1-3 linhas), zero verbosidade.

FORMATO DE RESPOSTA (siga LITERALMENTE):

📊 Resumo Técnico do Impacto da Notícia no Mini Índice (WIN)

🔥 Resultado principal:
[1 frase de impacto direto]

${flagEmoji} ${ev.event} — Leitura Profissional
📌 [Campo principal]: [actual] vs [forecast esperado]
➡️ [tradução de uma linha do que isso significa]

🧠 Tradução institucional
[3-4 bullets curtos com 👉 do que o mercado interpreta]

📉 Impacto no Mini Índice
🔴 ou 🟢 Impacto principal:
➡️ [POSITIVO ou NEGATIVO] para bolsa
Porque:
[3-4 linhas com razões]

⚠️ O que esperar no WIN
📌 Movimento mais provável:
[2-3 bullets ➡️]

🔥 Mas atenção (muito importante)
[1-2 linhas sobre padrão típico: spike, armadilha, tendência real]

🎯 Cenários Prováveis
🔴 Cenário principal (mais provável)
➡️ [cenário detalhado]

🟡 Cenário alternativo
➡️ [cenário alternativo]

📌 O detalhe mais importante
[1-2 linhas sobre o foco atual do mercado]

📊 Impacto esperado por ativo
| Ativo | Impacto |
|---|---|
| Mini índice | 🔴 ou 🟢 [direção curta] |
| Dólar | 🔴 ou 🟢 [direção curta] |
| Nasdaq/S&P | 🔴 ou 🟢 [direção curta] |
| Juros EUA | 🔴 ou 🟢 [direção curta] |

🎯 Estratégia profissional hoje
Melhor abordagem:
➡️ [orientação curta]
Evitar:
❌ [o que não fazer]

💬 Leitura sincera
[1 parágrafo conclusivo, honesto, profissional]`;
}

/**
 * Chama a API do Claude para gerar análise estruturada.
 * Retorna {analysis: string, cached: boolean, error?: string}
 */
export async function generateAnalysis(ev, apiKey) {
  if (!apiKey) {
    return { error: 'ANTHROPIC_API_KEY não configurada no servidor' };
  }

  // Cache: se já analisou esse evento, retorna direto
  if (analysisCache.has(ev.id)) {
    return { analysis: analysisCache.get(ev.id), cached: true };
  }

  const prompt = buildPrompt(ev);

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
      console.error('[ANALYZE] Erro API Claude:', res.status, errText);
      return { error: `Claude API retornou ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const analysis = data.content?.[0]?.text || '';
    if (!analysis) {
      return { error: 'Resposta vazia do Claude' };
    }

    analysisCache.set(ev.id, analysis);
    console.log(`[ANALYZE] ${ev.event} (${ev.country}) — análise gerada (${data.usage?.input_tokens || 0}in/${data.usage?.output_tokens || 0}out tokens)`);

    return { analysis, cached: false, usage: data.usage };
  } catch (err) {
    console.error('[ANALYZE] Exceção:', err.message);
    return { error: err.message };
  }
}

/**
 * Limpa cache de uma análise específica (caso operador queira refazer).
 */
export function clearAnalysisCache(eventId) {
  analysisCache.delete(eventId);
}

/**
 * Retorna análise em cache sem chamar a API (pra restaurar ao recarregar UI).
 */
export function getCachedAnalysis(eventId) {
  return analysisCache.get(eventId) || null;
}
