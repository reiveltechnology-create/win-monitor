# WIN MONITOR — Versão Fontes Gratuitas

Sistema que monitora notícias econômicas de **2 e 3 estrelas** (Brasil e EUA) que impactam o **mini índice (WIN)**, e notifica o operador por **voz** no navegador.

**Esta versão usa fontes públicas gratuitas (ForexFactory).** Não requer chave de API paga.

---

## ⚡ O que ele faz

1. **No início do dia:** carrega toda a agenda de releases 2★ e 3★ do dia
2. **5 minutos antes de cada notícia:** anuncia por voz que ela está chegando
3. **Quando sai o número:** em até 5 segundos calcula a tendência (alta/baixa/neutra) e fala em voz alta
4. **Frase curta e decisória:** *"Non-Farm Payrolls. Saiu 280, esperado 200. Tendência de baixa."*

---

## 🎚 Configurações de voz

Botão **CONFIG** no canto superior direito abre painel com:
- Voz (lista todas as disponíveis, masculina/feminina marcadas com ♂/♀)
- Velocidade da fala (0.5x a 2.0x)
- Tom (grave a agudo)
- Volume (0% a 100%)
- Som de alerta antes da fala (beep, ding, chime, sino duplo, alerta urgente, Bloomberg clássico, ou nenhum)

Configurações salvas no navegador — uma vez setado, vale pra sempre.

---

## 🛠 Stack

- Node.js 20 + Express + storage JSON
- ForexFactory (fonte de calendário gratuita)
- Server-Sent Events (SSE) para tempo real
- Frontend HTML/CSS/JS puro + Web Speech API + WebAudio
- HTTP Basic Auth para acesso restrito
- Docker para deploy fácil em Coolify/VPS

---

## 🚀 Como usar

### Variáveis de ambiente

| Variável | Default | O que faz |
|---|---|---|
| `PORT` | `3030` | Porta do servidor |
| `POLL_INTERVAL_SEC` | `60` | Polling normal |
| `POLL_FAST_SEC` | `5` | Polling rápido perto de eventos |
| `ANNOUNCE_AHEAD_MIN` | `5` | Antecedência do aviso por voz |
| `AUTH_USER` | (vazio) | Usuário para login HTTP Basic |
| `AUTH_PASS` | (vazio) | Senha (vazio = sem autenticação) |

### Deploy em VPS (Coolify)

1. Sobe o código no Git
2. Cria a aplicação no Coolify apontando pro repositório
3. Configura variáveis de ambiente (login + senha)
4. Aponta um domínio com HTTPS
5. Manda o link pro operador acessar

### Rodar localmente

```bash
npm install
cp .env.example .env
npm start
```

Abre http://localhost:3030 no Chrome/Edge.

---

## 📋 Watchlist atual

**EUA 3★:** Non-Farm Payrolls, CPI, FOMC, GDP, Core PCE, falas do Powell
**EUA 2★:** PPI, Retail Sales, Jobless Claims, ISM, ADP
**BR 3★:** Copom, IPCA, PIB, Ata do Copom
**BR 2★:** Desemprego, Vendas no varejo, Produção industrial, Focus

Edite `src/impactDb.js` pra adicionar/remover indicadores.

---

## 📁 Estrutura

```
win-monitor/
├── package.json
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── .dockerignore / .gitignore
├── README.md
├── public/
│   └── index.html           # Dashboard + painel de configurações
└── src/
    ├── server.js            # Express + polling + SSE + auth + healthcheck
    ├── calendar.js          # Cliente ForexFactory
    └── impactDb.js          # Watchlist + lógica de tendência
```

---

## ⚠️ Pontos importantes

- **Web Speech API só funciona em HTTPS** (exceto localhost)
- **A voz roda no navegador do operador**, não no servidor
- **Browsers exigem interação do usuário** pra liberar áudio — botão VOZ ON
- **Use Chrome ou Edge** — qualidade da voz pt-BR é superior
- **ForexFactory é uma fonte pública** — em caso de problema temporário, o sistema usa cache da última resposta válida
