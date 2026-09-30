# ops-union — Plano de Desenvolvimento

Visualização unificada e read-only de recursos Kubernetes (pods, describe, métricas, logs)
agregados de **múltiplos clusters e múltiplos namespaces** ao mesmo tempo, por uma interface web local.

O estado atual inclui a release **v1.6.0**, que organiza os presets locais em Workspaces nomeados,
com persistencia web/desktop, migracao da biblioteca plana legada e portabilidade do Workspace ativo.

## Problema

O trabalho diário exige inspecionar o mesmo tipo de recurso espalhado por vários clusters e
namespaces, hoje via `kubectl` repetido, um context de cada vez:

```
kubectl get pods --context cluster-a -n namespace-a
kubectl get pods --context cluster-b -n namespace-a
```

Falta uma visão única, organizada e fácil, sem trocar de context na mão.

## Objetivo

Uma app **local** (uso pessoal, sem multiusuário) que:

- Recebe uma lista flexível de alvos `(cluster, namespace)`.
- Faz fan-out em paralelo em cada alvo usando o `~/.kube/config` existente.
- Exibe os pods numa visão unificada, com agrupamento configurável (por namespace, por cluster ou flat).
- Permite drill-down num pod: `describe`, métricas (CPU/memória) e logs em streaming.
- É **read-only** no MVP (sem restart, scale, exec ou qualquer mutação).

## Modelo de dados central

A unidade de consulta é o **par (cluster, namespace)**. O front envia uma lista de alvos:

```json
{
  "targets": [
    { "cluster": "cluster-a", "namespace": "namespace-a" },
    { "cluster": "cluster-b", "namespace": "namespace-a" },
    { "cluster": "cluster-b", "namespace": "namespace-b" }
  ]
}
```

Cada item retornado é anotado com `cluster` e `namespace` na origem, então o front pode
agrupar/filtrar por qualquer dimensão sem ambiguidade.

## Stack

- **Backend:** Node + TypeScript, Express, `@kubernetes/client-node`, `ws` (WebSocket para logs).
- **Frontend:** React + Vite + TypeScript.
- **Layout:** monorepo simples (`/backend`, `/frontend`) na raiz do projeto.
- Sem Go (não instalado); Node 25 já disponível localmente.

## API do MVP

```
GET  /api/contexts
     → lista os contexts disponíveis no kubeconfig

POST /api/pods
     body: { targets: [{ cluster, namespace }, ...] }
     → pods de todos os pares, cada um anotado com { cluster, namespace }
       campos: nome, status, ready, restarts, node, idade, containers

GET  /api/pods/:cluster/:namespace/:pod/describe
     → detalhes do pod (equivalente ao describe)

GET  /api/pods/:cluster/:namespace/:pod/metrics
     → CPU/memória via metrics.k8s.io (quando o metrics-server existir no cluster)

WS   /api/pods/:cluster/:namespace/:pod/logs?container=<c>&follow=true&tailLines=500
     → stream de logs do container
```

## Fluxo de dados

```
Browser (React)
   │  POST /api/pods { targets: [{cluster, namespace}...] }
   ▼
Backend (Node)
   ├── task → client(cluster-a, namespace-a) → pods
   ├── task → client(cluster-b, namespace-a) → pods
   └── task → client(cluster-b, namespace-b)  → pods
   ▼  merge; cada item recebe { cluster, namespace }
Browser: visão unificada com agrupamento (namespace | cluster | flat),
         filtros e drill-down → describe / métricas / logs (WebSocket)
```

## Desenvolvimento por partes (fases)

### Fase 0 — Fundação do projeto
- Estrutura do monorepo (`/backend`, `/frontend`).
- Configs de TypeScript, lint, scripts de dev.
- Backend "hello" respondendo em `localhost` e front conectando.
- **Entregável:** `npm run dev` sobe backend + front vazios.

### Fase 1 — Kubeconfig e contexts (backend)
- Carregar `~/.kube/config`, listar contexts.
- Endpoint `GET /api/contexts`.
- Factory de client por context (cache de clients por cluster).
- **Entregável:** `curl /api/contexts` retorna os contexts reais.

### Fase 2 — Fan-out de pods (backend)
- `POST /api/pods` recebe lista de alvos e faz fan-out paralelo.
- Cada pod anotado com `{ cluster, namespace }`; normalização dos campos.
- Tolerância a falha parcial: um alvo que falha não derruba os outros (retorna erro por alvo).
- **Entregável:** `curl` com 2+ alvos retorna pods unificados.

### Fase 3 — Seleção de alvos e tabela unificada (frontend)
- UI para escolher contexts + digitar namespaces e montar a lista de alvos.
- Tabela unificada com colunas Cluster, Namespace, Pod, Status, Ready, Restarts, Idade.
- Agrupamento configurável (por namespace | por cluster | flat) + filtro de texto.
- **Entregável:** visão unificada dos pods de múltiplos alvos na tela.

### Fase 4 — Drill-down: describe e métricas
- `GET .../describe` e `GET .../metrics` no backend.
- Painel de detalhes do pod no front (aba describe + aba métricas).
- Degradação graciosa quando o cluster não tem metrics-server.
- **Entregável:** clicar num pod mostra detalhes e métricas.

### Fase 5 — Logs em streaming
- WebSocket `.../logs` com seleção de container, follow e tailLines.
- Visualizador de logs no front (auto-scroll, pausar, limpar, filtro).
- **Entregável:** logs ao vivo de um container pela interface.

### Fase 6 — Polimento
- Auto-refresh/watch opcional da lista de pods.
- Presets de alvos salvos localmente (ex.: "Example preset = cluster-a + cluster-b").
- Tratamento de erros e estados de loading consistentes.
- **Entregável:** MVP fluido e usável no dia a dia.

### Fase 7 — Workspaces locais (v1.6.0)
- Catalogo versionado com um Workspace ativo por perfil local.
- Migracao idempotente da biblioteca plana de presets para `My Workspace`.
- Escopo de presets, quick access e launchpad pelo Workspace ativo.
- Criacao, renomeacao, alternancia, exclusao, importacao e exportacao do Workspace ativo.
- Persistencia web em `ops-union.workspaces.v1` e persistencia desktop no catalogo versionado
  mantido pelo IPC existente.
- **Entregável:** Workspaces locais portáteis sem alterar a sessão operacional ou executar consultas
  Kubernetes durante a gestão do catálogo.

## Margem de melhoria (pós-MVP)

- Outros recursos: deployments, services, events, configmaps.
- Watch em tempo real (informers) em vez de polling.
- Busca global por label/selector cross-cluster.
- Comparação lado a lado do mesmo recurso entre clusters (diff).
- Exportar describe/logs.
- Ações (restart, scale, exec) — atrás de um toggle explícito e confirmação, quando fizer sentido.

## Restrições e decisões

- **Uso local**: sem autenticação própria; confia no kubeconfig do usuário.
- **Read-only** no MVP: nenhuma operação de mutação é exposta.
- Falha de um alvo é isolada e reportada, nunca quebra a agregação inteira.
- O backend nunca ecoa segredos do kubeconfig; contexts são referenciados por nome.

## Nota de ambiente: cadeia de CA e TLS

Durante a Fase 2 o fan-out falhava em todos os alvos com `UNABLE_TO_GET_ISSUER_CERT`,
embora o `kubectl` funcionasse com o mesmo kubeconfig. Causa raiz:

- Os clusters apresentam **apenas o certificado folha**.
- O `certificate-authority-data` do kubeconfig contém somente a CA **intermediária**
  (ex.: `CN = cluster-a CA`).
- Os emissores acima dela — `SSL Kubernetes CA v1` → `PagPKI Root CA v1` — vivem no
  **trust store do sistema** (`/etc/ssl/certs/ca-certificates.crt`).
- O `@kubernetes/client-node` monta seu agente HTTPS a partir do `caData` apenas, então
  a cadeia ficava incompleta e o handshake falhava.

**Solução aplicada** (`backend/src/kube/caChain.ts`): compor a cadeia completa concatenando
a CA do kubeconfig com o bundle de CAs do sistema, e injetá-la no cluster carregado antes
de criar o client.

Importante:
- A **verificação TLS permanece totalmente ativa** — não usamos `skipTLSVerify` nem
  `NODE_TLS_REJECT_UNAUTHORIZED`.
- O trust store do sistema é apenas **lido**; nada no ambiente do usuário é alterado.
- Se nenhum bundle do sistema for legível, a CA do kubeconfig é usada como está.

## Nota de ambiente: sidecars nativos (Istio)

O `istio-proxy` é injetado como **init container com `restartPolicy: Always`** (sidecar
nativo, Kubernetes 1.29+). O `kubectl` conta esses sidecars nas colunas `READY` e
`RESTARTS`. A normalização do ops-union faz o mesmo, garantindo paridade com o terminal,
e expõe o sidecar na lista de containers para seleção de logs.

## Nota de escala: paginação de linhas na tabela

Na validação da Fase 3, incluir `namespace-system` entre os alvos trouxe **1339 pods** num
único grupo. Renderizar tudo de uma vez colocaria dezenas de milhares de nós no DOM e
travaria a interface.

A tabela passa a renderizar **100 linhas por grupo**, com ações "Mostrar mais" e
"Mostrar todos" no rodapé de cada grupo. O agrupamento e os contadores continuam
refletindo o total real — nenhum pod é descartado, apenas a renderização é adiada.

## Auditoria read-only (Fase 6)

Auditoria realizada ao fim do MVP, cobrindo os requisitos 6.1, 6.2 e 6.3.

### 6.1 — Somente leitura: **conforme**

Métodos da API Kubernetes efetivamente usados no backend:

| Método | Onde | Tipo |
| --- | --- | --- |
| `listNamespacedPod` | `podsService.ts` | leitura |
| `readNamespacedPod` | `podDetailsService.ts` | leitura |
| `listNamespacedEvent` | `podDetailsService.ts` | leitura |
| `metrics.getPodMetrics` | `podDetailsService.ts` | leitura |
| `log.log` | `logsService.ts` | leitura (stream) |

- Nenhuma chamada a `create*`, `delete*`, `patch*`, `replace*`, `update*` ou `evict*`.
- Do `@kubernetes/client-node` são importados apenas `CoreV1Api`, `KubeConfig`, `Log`
  e `Metrics`. As classes `Exec`, `Attach`, `PortForward` e `Cp` nunca são importadas,
  então não há caminho de código para exec, attach ou port-forward.
- As duas ocorrências de `.exec(` no código são `RegExp.exec` sobre strings, não exec em pod.
- Verificação dinâmica: `DELETE`, `PUT`, `PATCH` e `POST` nas rotas de leitura retornam
  **404** (a rota não existe). `POST /api/pods` existe, mas é uma consulta — recebe a
  lista de alvos no corpo e apenas lê.

### 6.2 — Segredos: **conforme**

- Único `console.log` do backend imprime host e porta, nada mais.
- As 5 respostas da API foram varridas por `BEGIN CERTIFICATE`, `BEGIN PRIVATE`, `caData`,
  `certificate-authority`, `client-key`, `certData`, `keyData`, `bearer`, `authorization`,
  `password` e `audit-id`: **zero ocorrências**.
- `caData` é lido apenas para compor a cadeia de CA em memória; nunca é retornado.
- `safeErrorMessage` impede o vazamento do dump da `ApiException`, que embute o corpo
  cru e todos os headers de resposta. Coberto por teste que falha se um token em
  header aparecer na mensagem.
- `localStorage` armazena o catálogo de Workspaces e seus presets, que guardam apenas nomes de
  cluster/contexto, namespaces e metadados locais de uso; kubeconfig e credenciais ficam fora do
  catálogo e da exportação.

Observação: o describe pode conter a palavra "secret" quando um event do cluster
menciona o **nome** de um Secret (ex.: `ResourceRotationComplete`). É o mesmo texto que
`kubectl describe` exibe — nome de recurso, não conteúdo de segredo.

### 6.3 — Localhost: **conforme**

- `config.ts` fixa `host: '127.0.0.1'`.
- Confirmado no socket em execução: `LISTEN 127.0.0.1:4000` — **não** em `0.0.0.0`,
  portanto não acessível pela rede.
- Sem autenticação própria, por decisão de escopo: a app confia no kubeconfig do
  usuário e roda apenas na máquina dele.
