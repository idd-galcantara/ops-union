# Diagnóstico: queda intermitente do WS agregado de logs e HTTP 502 no detalhe do pod

Investigação **read-only** do repositório `ops-flow` (projeto `ops-union`). Nenhum arquivo foi
alterado. Todas as afirmações abaixo estão ancoradas em trechos de código lidos durante a
investigação, com caminho e símbolo citados.

---

## 1. Resposta resumida (TL;DR)

A causa raiz mais provável **não** é um bug exótico de rede: é a **ausência de limite de
concorrência e de backpressure no caminho do WebSocket agregado ao vivo** (`/api/logs`), combinada
com a **ausência de qualquer handler de `uncaughtException`/`unhandledRejection` no bootstrap do
backend**. O caminho de logs ao vivo abre **todas** as streams `follow=true` de uma só vez, sem o
limitador de concorrência que o resto do backend usa, e qualquer erro não tratado numa dessas
streams derruba o processo Node inteiro.

Encadeamento provável do sintoma:

1. O usuário entra em modo Live com Follow sobre 2 targets / 2 pods / 4 containers. O backend abre
   **4 streams de log simultâneas** contra os clusters, sem limite (ver §4 e §5).
2. Sob carga/instabilidade (ou simplesmente ao fechar/trocar o workspace), um erro assíncrono numa
   dessas streams não é capturado por nenhum handler de processo → o Node encerra (`unhandledRejection`
   em `@kubernetes/client-node`/`undici`) **ou** o event loop fica preso processando as 4 streams.
3. O WS agregado cai. O frontend **não reconecta** (confirmado em código e no README) e mostra
   `Could not connect to the aggregate log stream.` / `No log events received yet`.
4. Com o processo backend caído (ou travado), a próxima requisição HTTP `GET .../describe` chega ao
   **proxy do Vite**, que não consegue falar com `127.0.0.1:4000` e responde **HTTP 502 Bad Gateway**.
   É daí que vem o "quebra tudo": o 502 é gerado pelo proxy do Vite, não pelo Express.
5. O backend **não se auto-recupera** no fluxo `npm run dev` (não há supervisor/restart), ficando
   degradado até restart manual — consistente com "nem consigo mais buscar o detalhe dos pods".

As recomendações priorizadas estão na §7.

---

## 2. Topologia e de onde vem o HTTP 502 (Pergunta 2)

O backend Express escuta **direto** em `127.0.0.1:OPS_FLOW_PORT` (default 4000) e o WS compartilha o
mesmo servidor HTTP via `upgrade`.

- `backend/src/config.ts`: `host: '127.0.0.1'`, `port: Number(process.env.OPS_FLOW_PORT ?? 4000)`.
- `backend/src/index.ts`: `createServer(app)` + `attachLogsWebSocket(server, …)` + `server.listen(config.port, config.host, …)`.

O navegador (localhost:5173) fala com um único origin; o **Vite** faz proxy de `/api` e do WebSocket
para o backend:

- `frontend/vite.config.ts`:
  ```ts
  proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true, ws: true } }
  ```

O **502 é emitido pelo proxy do Vite**, confirmado no código empacotado do Vite:

- `node_modules/vite/dist/node/chunks/node.js` (handler de erro do proxy, ~linha 19734):
  ```js
  proxy.on("error", (err, _req, res) => {
    if ("req" in res) {
      config.logger.error(`http proxy error: ${res.req.url}\n${err.stack}`, …);
      if (!res.headersSent && !res.writableEnded) res.writeHead(502, { "Content-Type": "text/plain" }).end();
    } else {
      // caminho WebSocket: sem corpo HTTP, apenas encerra o socket
      config.logger.error(`ws proxy error:\n${err.stack}`, …);
      res.end();
    }
  });
  ```

Interpretação direta:
- Para `GET /api/pods/:cluster/:namespace/:pod/describe` (uma requisição HTTP comum do
  `PodDetailsPanel`), quando o backend está **indisponível** (crashado, não aceitando conexão —
  `ECONNREFUSED` — ou travado além do timeout), o proxy cai no ramo `"req" in res` e responde
  **`writeHead(502)`**. É exatamente o "HTTP 502" relatado.
- Para o **WebSocket** `/api/logs`, o mesmo erro de upstream cai no ramo `else` e apenas faz
  `res.end()` — ou seja, o socket é encerrado **sem** uma mensagem de erro de aplicação. Por isso o
  viewer vê uma queda "do nada" e cai no handler genérico `socket.onerror`/`socket.onclose` (§6).

Conclusão: a mesma indisponibilidade do backend explica **os dois** sintomas (WS que cai e 502 no
describe). O 502 não é um erro do Express; é o proxy do Vite reportando que não conseguiu alcançar o
backend. O `GET .../describe` em si é barato — ele só falha porque o processo backend não está lá
para respondê-lo.

---

## 3. Falta de rede de segurança no processo backend (crash → indisponibilidade)

`backend/src/index.ts` registra **apenas** `SIGINT`/`SIGTERM` e `server.on('error', …)` (para
`EADDRINUSE`). **Não há** `process.on('uncaughtException', …)` nem `process.on('unhandledRejection', …)`.

Consequência: um erro assíncrono não capturado em qualquer callback de stream de log (ou numa
Promise rejeitada do cliente Kubernetes/undici) **encerra o processo** com o comportamento padrão do
Node para rejeições não tratadas. Isso casa com o relato de que a conexão se perde "do nada" e os
logs "somem": o backend simplesmente morre, o WS fecha, e qualquer HTTP seguinte vira 502 no proxy.

Pontos onde um erro assíncrono pode escapar:
- `backend/src/kube/logsService.ts` — `streamStructuredPodLogs`/`streamPodLogs` usam `PassThrough` e
  `log.log(...).then(controller => …).catch(...)`. Os `.catch` cobrem a falha de **abertura** da
  stream, mas erros emitidos pelo stream do cliente após aberto são tratados via `stream.on('error')`.
  Se o cliente `@kubernetes/client-node` v2 (`^2.0.0`, sobre `undici ^8`) rejeitar uma Promise interna
  do corpo de resposta durante follow, não há garantia de que ela seja capturada aqui.
- Não há `uncaughtException` como último recurso para evitar que isso derrube o processo.

Observação: `@kubernetes/client-node` é `^2.0.0`, que usa `fetch`/`undici` para o streaming de logs.
Streams de corpo abortadas/erradas em undici emitem erros assíncronos; sem handler de processo, uma
rejeição não tratada é fatal por padrão.

---

## 4. Limites de recursos que existem — e onde NÃO são aplicados (Pergunta 4)

### Limites que existem

- `backend/src/resourceLimits.ts`:
  - `MAX_ACTIVE_KUBERNETES_READS = 8` (concorrência de leituras K8s)
  - `MAX_AGGREGATE_TARGETS = 256`, `MAX_CONTEXTS_PER_REQUEST = 32`
  - `MAX_WEBSOCKET_PAYLOAD_BYTES = 512 KiB`
- `backend/src/kube/boundedScheduler.ts`: `mapWithConcurrency(values, limit, worker)` — limitador de
  concorrência real.
- `backend/src/kube/podsService.ts`: a fan-out de pods **usa** o limitador:
  ```ts
  const settled = await mapWithConcurrency(targets, MAX_ACTIVE_KUBERNETES_READS, …)
  ```
- `backend/src/historyLimits.ts` (`DEFAULT_HISTORY_LIMITS`): limites fortes para **History**:
  `maxConcurrentSourceReads: 8`, `maxConcurrentSessions: 2`, `maxInFlightDecodedBytesPerSource: 4 MiB`,
  `maxInFlightDecodedBytesPerSession: 32 MiB`, `ttlMs`, `maxWindowRequestsPerMinute`, etc.
- `backend/src/historySourcePump.ts`: o pump de History **respeita** a concorrência:
  ```ts
  while (!this.cancelRequested && this.activeReads < this.limits.maxConcurrentSourceReads) { … this.startSource(next); }
  ```
  e aplica backpressure por bytes em disco/por fonte/por sessão.
- `backend/src/logsProtocol.ts`: `MAX_LOG_SOURCES = 50`; limites de linhas/bytes por fonte e totais
  (`DEFAULT_LOG_LIMITS`, `MAX_LOG_LIMITS`).

### Onde o limite NÃO é aplicado (lacuna central)

O caminho **Live agregado** (`/api/logs` modo subscribe) **não** usa `mapWithConcurrency` nem
nenhum teto de leituras simultâneas. Em `backend/src/logsSubscription.ts`,
`startLogSubscription(...)` inicia **todas** as fontes de uma vez:

```ts
for (const state of states) {
  emit({ type: 'sourceStarted', source: state.source, counters: … });
}
for (const state of states) startSource(state);   // <-- abre TODAS as streams juntas
```

- Não há `maxConcurrentSourceReads` análogo ao History.
- Com `MAX_LOG_SOURCES = 50`, um único cliente pode pedir **50 streams `follow=true` simultâneas**
  por conexão WS, cada uma mantendo uma conexão HTTP aberta contra o cluster. Não há teto de
  streams por processo nem por conexão.
- Os limites de `DEFAULT_LOG_LIMITS` são de **conteúdo** (linhas/bytes acumulados), não de
  **concorrência de I/O**. Eles param uma fonte quando ela já emitiu muito, mas não limitam quantas
  streams abrem ao mesmo tempo nem fazem backpressure de rede/handles.
- Não há limite global de conexões WS agregadas simultâneas: cada upgrade em
  `backend/src/logsWebSocket.ts` cria um `handleAggregateLogSocket` independente, e cada um pode
  abrir até 50 streams. N abas/reaberturas multiplicam isso.

Resumo da assimetria: **History é defensivo (concorrência + bytes em voo limitados); Live é
irrestrito.** O cenário do usuário (Live + Follow) cai justamente no caminho sem proteção.

---

## 5. Encerramento das streams `follow=true` (Pergunta 3)

O encerramento determinístico **existe no caminho feliz**, mas há riscos de acúmulo nas bordas.

Caminho de cancelamento (bom):
- `backend/src/logsWebSocket.ts`, `handleAggregateLogSocket`: registra
  `ws.on('close', cancelOwnedSession)` e `ws.on('error', cancelOwnedSession)`, e
  `cancelOwnedSession()` chama `subscription?.cancel()`.
- `backend/src/logsSubscription.ts`, `cancel()`: marca `cancelled = true` e chama
  `state.handle?.stop()` em cada fonte.
- `backend/src/kube/logsService.ts`, `streamStructuredPodLogs`/`streamPodLogs`: `stop()` faz
  `abort?.abort()` + `stream.destroy()`, e trata o caso de o cliente desconectar **durante** o setup
  (`if (stopped) controller.abort()` dentro do `.then`). O endpoint de log por-pod
  (`handleLogSocket`) tem o mesmo cuidado com `stopRequested`.

Riscos de acúmulo / não determinismo:
1. **Se o processo cai (§3), nada disso roda.** As 4+ streams abertas contra os clusters ficam órfãs
   até o SO/undici reciclar os sockets. Em crashes repetidos, há janelas de acúmulo.
2. **Dependência do evento `close`/`error` do `ws`.** O cancelamento das streams upstream depende
   inteiramente de o socket do navegador emitir `close`/`error`. Se o WS cair por um caminho que não
   dispare esses eventos de forma limpa (ex.: socket encerrado pelo proxy via `res.end()` no ramo WS
   — §2), o encerramento ainda depende do `ws` detectar a queda. Não há **heartbeat/ping-pong** nem
   timeout de inatividade no servidor (`WebSocketServer` é criado sem `ping` periódico em
   `attachLogsWebSocket`), então uma conexão "meio-morta" pode manter streams `follow` vivas.
3. **Sem timeout na própria stream de log.** `streamStructuredPodLogs` com `follow:true` não tem
   timeout nem deadline; ela vive enquanto o upstream mantiver o corpo aberto. Combinado com a
   ausência de limite de concorrência (§4), o acúmulo é plausível sob reconexões/trocas de workspace
   repetidas.

Conclusão: no fechamento **limpo** do WS, as streams são encerradas de forma determinística. O risco
real de acúmulo está nos cenários de **crash do processo** e de **conexões meio-mortas sem
heartbeat**.

---

## 6. Comportamento do frontend: sem reconexão (Perguntas 1 e 5)

O viewer **não reconecta** — confirmado em código e no README ("O visualizador de logs não reconecta
automaticamente").

- `frontend/src/components/LogViewer.tsx`:
  - Abre a conexão com `const socket = new WebSocket(aggregateLogsUrl())`.
  - `socket.onerror`: define exatamente `setError('Could not connect to the aggregate log stream.')`
    e `setState('error')` — **nenhuma** tentativa de reconectar.
  - `socket.onclose`: finaliza a operação e vai para `'ended'`/`'error'`, sem reabrir.
  - O efeito só reabre quando mudam as dependências (`applied.*`, `selectedSources`, `sessionAttempt`)
    — ou seja, só por **ação do usuário**, não automaticamente.
- A mensagem `No log events received yet` e `0 of 0 retained / 0 emitted` são o estado vazio quando o
  WS cai antes de qualquer linha chegar.
- `frontend/src/api.ts` → `aggregateLogsUrl()` monta `ws(s)://<host>/api/logs`, que passa pelo proxy
  do Vite (§2).

Sobre auto-recuperação (Pergunta 5): **não há**. O backend não reinicia sozinho no fluxo
`npm run dev` (não há supervisor/`--watch`/PM2 descrito), e o frontend não reconecta o WS. Portanto,
após a falha, o estado permanece degradado — WS caído **e** 502 no describe — até **restart manual**
do backend. Isso é totalmente consistente com "quebra tudo … nem consigo nem buscar o detalhe dos
pods".

`PodDetailsPanel` (`frontend/src/components/PodDetailsPanel.tsx`) dispara
`fetchPodDescribe`/`fetchPodMetrics` via `Promise.allSettled`; quando o backend está fora, ambas
rejeitam e o `messageOf(reason)` exibe o `HTTP 502` vindo de `errorFrom` em `api.ts`
(`new Error(\`HTTP ${res.status}\`)`).

---

## 7. Recomendações priorizadas (sem implementar nada agora)

Prioridade **P0 — estancar o crash e o "quebra tudo"**

1. **Isolar falha: adicionar handlers de processo no backend.** Em `backend/src/index.ts`, tratar
   `process.on('uncaughtException', …)` e `process.on('unhandledRejection', …)` para logar e **não**
   derrubar o processo por um erro de uma única stream de log. Isso sozinho já evita que o WS de logs
   leve embora o HTTP de describe/metrics (os dois sintomas compartilham a mesma causa: processo
   indisponível). É a correção de maior impacto e menor risco.
2. **Garantir que describe/details não dependam da saúde do WS de logs.** Como são o mesmo processo,
   o item (1) já desacopla na prática. Opcionalmente, considerar supervisão do backend em dev
   (restart automático) para encurtar a janela de 502.

Prioridade **P1 — remover a causa da sobrecarga no caminho Live**

3. **Aplicar limite de concorrência no WS agregado ao vivo.** Em
   `backend/src/logsSubscription.ts`, trocar o `for (const state of states) startSource(state)` por um
   agendamento limitado (reusar `mapWithConcurrency`/padrão do `HistorySourcePump`, com um
   `maxConcurrentSourceReads` análogo). Simetria com History, que já faz isso corretamente.
4. **Backpressure/teto de recursos para Live.** Introduzir limites de streams simultâneas **por
   conexão** e **por processo**, e um teto de bytes em voo (espelhando
   `maxInFlightDecodedBytesPerSource`/`PerSession` do History). Reavaliar `MAX_LOG_SOURCES = 50` como
   teto de concorrência real, não só de contagem.

Prioridade **P2 — robustez de conexão e encerramento**

5. **Heartbeat/ping-pong + timeout de inatividade no `WebSocketServer`** (`backend/src/logsWebSocket.ts`)
   para detectar conexões meio-mortas e encerrar streams `follow` órfãs de forma determinística,
   fechando o risco de acúmulo descrito em §5.
6. **Timeout/deadline opcional nas streams `follow`** em `backend/src/kube/logsService.ts`, para que
   uma stream presa não viva indefinidamente consumindo um handle.
7. **Reconexão automática do viewer** (`frontend/src/components/LogViewer.tsx`): backoff exponencial
   no `socket.onclose`/`onerror` em vez de ir direto para `'error'`, com indicação de "reconectando".
   Resolve a parte do sintoma "os logs somem e não voltam" sem depender de ação do usuário.
8. **Mensageria de erro mais clara no 502**: no frontend, distinguir "backend indisponível" (502 do
   proxy) de erros de aplicação, orientando o restart quando apropriado.

Impacto esperado: P0 elimina o "quebra tudo" (describe/metrics param de retornar 502 porque o
processo deixa de cair). P1 remove a pressão que provavelmente dispara a falha sob 2 targets em
paralelo + Live/Follow. P2 fecha os cenários residuais de conexão meio-morta, acúmulo de streams e
ausência de reconexão.

---

## 8. Evidência consolidada (arquivo → símbolo)

- `frontend/vite.config.ts` → proxy `/api` com `ws:true` para `127.0.0.1:4000`.
- `node_modules/vite/dist/node/chunks/node.js` (~19734–19740) → `proxy.on("error")` →
  `res.writeHead(502)` para HTTP; `res.end()` para WS. **Origem do 502.**
- `backend/src/index.ts` → sem `uncaughtException`/`unhandledRejection`; sem auto-restart.
- `backend/src/logsSubscription.ts` → `startLogSubscription`: `for … startSource(state)` abre todas
  as fontes sem limite de concorrência; `cancel()`/`stopForAggregate` encerram no caminho limpo.
- `backend/src/kube/logsService.ts` → `streamStructuredPodLogs`/`streamPodLogs`: `follow` sem
  timeout; `stop()` com `abort()`/`destroy()`; sem heartbeat.
- `backend/src/kube/podsService.ts` → `getPods` usa `mapWithConcurrency(..., MAX_ACTIVE_KUBERNETES_READS)`
  (contraste: Live não usa).
- `backend/src/historySourcePump.ts` / `backend/src/historyLimits.ts` → concorrência e bytes em voo
  limitados (modelo a espelhar no Live).
- `backend/src/resourceLimits.ts` → `MAX_ACTIVE_KUBERNETES_READS = 8` (não aplicado ao Live).
- `backend/src/logsProtocol.ts` → `MAX_LOG_SOURCES = 50`, limites de conteúdo (não de concorrência).
- `backend/src/logsWebSocket.ts` → `handleAggregateLogSocket` com `ws.on('close'/'error', cancelOwnedSession)`;
  `WebSocketServer` sem ping periódico.
- `frontend/src/components/LogViewer.tsx` → `socket.onerror` define
  `'Could not connect to the aggregate log stream.'`; sem reconexão.
- `frontend/src/components/PodDetailsPanel.tsx` + `frontend/src/api.ts` → describe/metrics via
  `Promise.allSettled`; `errorFrom` gera `HTTP 502` exibido no painel.

> Conteúdo de fontes externas (código empacotado do Vite em `node_modules`) foi parafraseado e os
> trechos citados são curtos, apenas para localizar a evidência.
