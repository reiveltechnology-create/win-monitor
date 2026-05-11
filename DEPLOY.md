# 🚀 Deploy do WIN Monitor na VPS com Coolify

Guia passo a passo pra colocar o sistema rodando na sua VPS Linux com Coolify e disponibilizar um link para o operador acessar.

---

## Pré-requisitos

- [x] VPS Ubuntu 22.04 com Coolify instalado e funcionando
- [x] Um domínio ou subdomínio apontando pra VPS (ex: `winmonitor.reivel.com.br`)
- [x] Chave da API TradingEconomics (recomendado conta paga para uso real)

---

## Passo 1: Subir o código para um repositório Git

Coolify faz deploy a partir de Git (GitHub, GitLab, Gitea, etc).

```bash
cd win-monitor
git init
git add .
git commit -m "Versão inicial do WIN Monitor"

# Substitua pela URL do seu repositório
git remote add origin git@github.com:reivel/win-monitor.git
git push -u origin main
```

> Se preferir, o Coolify também aceita deploy via Docker Image — basta buildar e enviar pra um registry. Mas Git é mais simples pra iterar.

---

## Passo 2: Criar a aplicação no Coolify

1. Acesse o painel do Coolify
2. **+ New Resource** → **Application**
3. Escolha **Public Repository** (ou private, conforme sua config)
4. Cole a URL do repositório
5. Branch: `main`
6. **Build Pack:** `Dockerfile` (Coolify detecta automaticamente)
7. **Port:** `3030`

---

## Passo 3: Configurar variáveis de ambiente

No painel da aplicação no Coolify, vá em **Environment Variables** e adicione:

| Variável | Valor | Observação |
|---|---|---|
| `TE_API_KEY` | `xxxxxxx:xxxxxxx` | Sua chave da TradingEconomics |
| `PORT` | `3030` | Porta interna do container |
| `POLL_INTERVAL_SEC` | `60` | Polling normal |
| `POLL_FAST_SEC` | `5` | Polling rápido perto de eventos |
| `ANNOUNCE_AHEAD_MIN` | `5` | Aviso 5min antes |
| `AUTH_USER` | `operador` | Usuário do login |
| `AUTH_PASS` | `senha-forte-aqui` | Senha forte (mínimo 16 chars) |

> ⚠️ **NÃO USE** a chave `guest:guest` em produção — tem rate limit baixíssimo e vai bloquear o sistema. Pegue uma chave em https://tradingeconomics.com/api/

---

## Passo 4: Configurar domínio e HTTPS

1. No Coolify, na aba **Domains** da aplicação:
2. Adicione: `https://winmonitor.seudominio.com.br`
3. Coolify gera certificado Let's Encrypt automaticamente

> 🔒 **HTTPS é obrigatório** para a Web Speech API funcionar fora de localhost. Sem certificado SSL, a voz não vai funcionar no navegador do operador.

---

## Passo 5: Configurar volume persistente

Pra que o histórico de eventos não se perca a cada redeploy:

1. Na aba **Persistent Storages** da aplicação:
2. Adicione um volume:
   - **Mount Path:** `/app/data`
   - **Name:** `win-monitor-data`

---

## Passo 6: Deploy

Clique em **Deploy** no Coolify. Vai:

1. Clonar o repositório
2. Buildar a imagem Docker
3. Subir o container
4. Configurar HTTPS via Let's Encrypt
5. Expor no domínio configurado

Em 1-2 minutos, o operador já pode acessar: `https://winmonitor.seudominio.com.br`

---

## Passo 7: Instruções para o operador

Mande pra ele essas instruções curtas:

```
🎯 WIN MONITOR — Como usar

1. Acesse: https://winmonitor.seudominio.com.br
2. Faça login com as credenciais que enviei
3. Clique no botão "VOZ OFF" no canto superior direito
   (ele vai virar "VOZ ON" verde)
4. (Opcional) Clique em "CONFIG" para ajustar:
   - Voz (masculina/feminina)
   - Velocidade da fala
   - Tom (grave/agudo)
   - Volume
   - Som de alerta antes da fala
5. Deixe a aba aberta no Chrome ou Edge

⚠️ IMPORTANTE:
- Use Chrome ou Edge (Firefox tem voz inferior)
- Não feche a aba durante o pregão
- Configure o som UMA VEZ — fica salvo pra sempre

A voz vai falar automaticamente:
✓ 5 minutos antes de cada notícia 2★ ou 3★
✓ Logo que o número é divulgado, com a tendência (alta/baixa/neutra)
```

---

## Atualizando o sistema

Quando você fizer melhorias:

```bash
cd win-monitor
git add .
git commit -m "Descrição da melhoria"
git push
```

No Coolify, ou:
- Clica em **Redeploy** (manual)
- Ou ativa **Auto Deploy** nas configurações pra que cada push do git suba sozinho

O operador só precisa apertar **F5** no navegador pra pegar a versão nova.

---

## Monitoramento e logs

No Coolify, aba **Logs** da aplicação você acompanha:

- `[POLL]` — cada chamada na API
- `[RELEASE]` — quando saiu uma notícia
- `[UPCOMING]` — quando avisou um evento iminente
- `[POLL ERROR]` — falhas (rate limit, rede, etc)

---

## Custos estimados (mensal)

| Item | Custo |
|---|---|
| VPS (você já tem) | ~R$ 50-150 |
| Domínio (se já não tem) | ~R$ 40/ano = R$ 3-4/mês |
| TradingEconomics API (free tier) | R$ 0 (com limitações) |
| TradingEconomics API (Starter) | ~US$ 30/mês = R$ 150 |
| **Total estimado** | **R$ 50-300/mês** |

Para revenda multiusuário, vale a pena o plano pago da TE.

---

## Troubleshooting rápido

**A voz não fala no navegador do operador**
- Verifique se está acessando via `https://` (não `http://`)
- Chrome ou Edge (Firefox/Safari têm Web Speech API instável)
- Clicou em "VOZ ON" pelo menos uma vez? (browser exige interação pra liberar áudio)

**O operador vê a tela vazia ("sem eventos")**
- Pode ser final de semana / feriado (sem release econômico)
- Pode ser fora do horário (1h da manhã)
- Confira logs no Coolify: chave de API funcionando?

**Erro 403 nos logs**
- Chave da TradingEconomics inválida ou expirada
- Ou estourou o rate limit do plano free

**Container reinicia sozinho**
- Verifique RAM da VPS (mínimo 1GB livre)
- Healthcheck pode estar falhando — confira logs

---

## Roadmap sugerido (futuras melhorias)

Quando esse núcleo estiver maduro e validado:

1. **Login por usuário individual** (hoje é login único compartilhado)
2. **Dashboard de uso** — quantos releases já anunciou, taxa de acerto da tendência
3. **Histórico navegável** — buscar releases passados, comparar com movimento real do WIN
4. **Calibração automática** — sistema aprende a faixa típica de cada indicador com base no histórico
5. **Integração com IAgência** — autenticação unificada se virar produto Reivel
6. **Notificação push mobile** — operador pode estar longe do PC e receber alerta no celular
