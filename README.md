# WIN MONITOR

Sistema que monitora notícias econômicas de **2 e 3 estrelas** (Brasil e EUA) que impactam o **mini índice (WIN)**, e notifica o operador por **voz** no navegador.

Pensado para ficar rodando o dia inteiro durante o pregão — o operador foca no gráfico, e o sistema fala em voz alta quando algo importante acontece.

---

## ⚡ O que ele faz (resumo)

1. **No início do dia:** carrega toda a agenda de releases 2★ e 3★ do dia
2. **5 minutos antes de cada notícia:** anuncia por voz que ela está chegando
3. **Quando sai o número:** em até 5 segundos calcula a tendência (alta/baixa/neutra) e fala em voz alta
4. **Frase curta e decisória:** *"Non-Farm Payrolls. Saiu 280, esperado 200. Tendência de baixa."*

O operador continua olhando o gráfico — não precisa tirar o olho da tela.

---

## 🎚 Configurações de voz (totalmente customizável)

Botão **CONFIG** no canto superior direito abre painel com:

- **Voz:** lista todas as vozes disponíveis no navegador (masculina/feminina, indicadas com ♂/♀)
- **Velocidade da fala:** 0.5x a 2.0x
- **Tom:** grave a agudo
- **Volume:** 0% a 100%
- **Som de alerta antes da fala:** beep, ding, chime, sino duplo, alerta urgente, "Bloomberg clássico", ou nenhum
- **Botões de teste:** preview do som e da voz antes de salvar

Configurações ficam salvas no navegador — uma vez setado, vale pra sempre.

---

## 🛠 Stack

- Node.js 20 + Express + storage JSON (zero dependência nativa)
- Server-Sent Events (SSE) para tempo real
- Frontend HTML/CSS/JS puro com Web Speech API + WebAudio para sons
- HTTP Basic Auth para acesso restrito
- Docker para deploy fácil em Coolify/VPS

---

## 📋 Watchlist atual

**EUA 3★:** Non-Farm Payrolls, CPI, FOMC, GDP, Core PCE, falas do Powell
**EUA 2★:** PPI, Retail Sales, Jobless Claims, ISM, ADP
**BR 3★:** Copom, IPCA, PIB, Ata do Copom
**BR 2★:** Desemprego, Vendas no varejo, Produção industrial, Focus, Resultado primário

Edite `src/impactDb.js` pra adicionar/remover indicadores.

---

## 🚀 Como usar

### Opção 1: Local (notebook do operador)

```bash
cd win-monitor
npm install
cp .env.example .env
npm start
```

Abra http://localhost:3030 no Chrome/Edge → clique em VOZ ON.

> Sem `AUTH_USER`/`AUTH_PASS` no `.env`, fica em modo aberto (apropriado pra local).

### Opção 2: VPS com Coolify (multi-usuário com link público)

Veja **[DEPLOY.md](./DEPLOY.md)** para o guia passo a passo.

Resumo:
1. Sobe o código no Git
2. Cria a aplicação no Coolify apontando pro repositório
3. Configura variáveis de ambiente (chave API + login)
4. Aponta um domínio com HTTPS
5. Manda o link pro operador acessar

---

## 🔧 Variáveis de ambiente

| Variável | Default | O que faz |
|---|---|---|
| `TE_API_KEY` | `guest:guest` | Chave da TradingEconomics |
| `PORT` | `3030` | Porta do servidor |
| `POLL_INTERVAL_SEC` | `60` | Polling normal |
| `POLL_FAST_SEC` | `5` | Polling rápido perto de eventos |
| `ANNOUNCE_AHEAD_MIN` | `5` | Antecedência do aviso por voz |
| `AUTH_USER` | (vazio) | Usuário para login HTTP Basic |
| `AUTH_PASS` | (vazio) | Senha (se vazia, sem autenticação) |

---

## 📁 Estrutura

```
win-monitor/
├── package.json
├── .env.example
├── Dockerfile               # Para deploy em Coolify/Docker
├── docker-compose.yml       # Para uso standalone com Docker
├── .dockerignore / .gitignore
├── README.md                # Este arquivo
├── DEPLOY.md                # Guia passo a passo de deploy na VPS
├── data/                    # Storage JSON (gerado em runtime)
├── public/
│   └── index.html           # Dashboard + painel de configurações
└── src/
    ├── server.js            # Express + polling adaptativo + SSE + auth
    ├── calendar.js          # Cliente TradingEconomics
    └── impactDb.js          # Watchlist + lógica de tendência
```

---

## ⚠️ Pontos importantes

- **Web Speech API só funciona em HTTPS** (exceto localhost) — por isso o deploy em VPS exige domínio com SSL
- **A voz roda no navegador do operador**, não no servidor — independente de onde está hospedado
- **Browsers exigem interação do usuário** pra liberar áudio — por isso o botão VOZ ON
- **Use Chrome ou Edge** — Firefox/Safari têm Web Speech API com qualidade inferior
- **Chave `guest:guest` da TE tem rate limit baixo** — para uso real, pegue uma chave própria

---

## 🎯 Filosofia do design

A voz fala **curto**. Operador focado no gráfico processa "Saiu 280, esperado 200. Tendência de baixa" em 2 segundos e age. Frase longa atrapalha.

Dashboard é **denso**. Estilo terminal de pregão — preto, monoespaçada, verde/vermelho, sem firulas. Quem opera respeita essa estética.

Sistema **não opera**. Apenas avisa e direciona. Quem decide é o operador.
