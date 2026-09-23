# ops-union

> Visao unificada, local e read-only de workloads Kubernetes em multiplos clusters e namespaces.

O **ops-union** reduz a necessidade de repetir comandos `kubectl` trocando de contexto manualmente. A aplicacao permite selecionar varios contextos do kubeconfig, combinar namespaces, consultar os pods em paralelo e investigar cada pod em uma unica interface web.

A unidade de consulta do sistema e o par:

```text
(cluster/contexto, namespace)
```

Cada resultado preserva sua origem. Assim, pods com o mesmo nome em clusters diferentes continuam identificaveis e podem ser agrupados ou filtrados sem ambiguidade.

## O que ele faz

- Lista os contextos disponiveis no kubeconfig do usuario.
- Descobre namespaces nos contextos selecionados.
- Consulta pods em paralelo para varios pares cluster/namespace.
- Isola falhas por alvo: um cluster indisponivel nao impede os demais resultados.
- Exibe uma tabela unificada de pods.
- Agrupa a tabela por namespace, cluster ou em modo plano.
- Filtra por pod, cluster, namespace, status, node ou container.
- Abre um painel de detalhes com informacoes equivalentes a `kubectl describe`.
- Mantem os diagnosticos avancados de terminacao e reinicio recolhidos por padrao, usando o estado
  atual/ultimo estado dos containers e eventos disponiveis do pod.
- Consulta CPU e memoria por container quando o `metrics-server` esta disponivel.
- Transmite logs de containers por WebSocket, com modos Live e History, follow, pausa, filtro e
  auto-scroll.
- Fecha o workspace de logs e limpa selecoes antigas quando Fetch pods, refresh, retry ou um preset
  inicia uma nova consulta; o auto-refresh silencioso preserva o workspace atual.
- Inicia cada novo workspace de logs com **Wrap lines** habilitado, mantendo a alternancia manual
  disponivel para a sessao atual.
- Mantem o Search repetivel: com mudancas pendentes ele confirma o novo rascunho; sem mudancas ele
  inicia uma nova sessao Live ou geracao History.
- Depois de qualquer Search aceito, em Live ou History, incluindo confirmacoes somente de filtros,
  o viewer agenda uma unica chamada a acao existente **Jump to latest** quando os resultados
  iniciais ficam prontos: em Live aguarda linhas renderizadas e, em History, a query inicial. A
  acao respeita Pause e preserva as cargas independentes de janelas History.
- Atualiza a lista manualmente ou em intervalos de 10, 30 ou 60 segundos.
- Persiste presets de alvos localmente: no `localStorage` em modo web e no diretório de dados do
  Electron em modo desktop.
- Permite redimensionar a sidebar e o painel de detalhes.

O projeto e deliberadamente **somente leitura**. Nao existem operacoes de restart, scale, exec, attach, port-forward, create, patch, update ou delete.

## Visao geral

```mermaid
flowchart LR
  Browser[Browser\nReact + Vite] -->|GET /api/contexts| API[Backend local\nExpress + Node]
  Browser -->|POST /api/namespaces| API
  Browser -->|POST /api/pods| API
  Browser -->|GET describe / metrics| API
  Browser <-->|WebSocket logs| API
  API -->|KubeConfig| Kube[Clusters Kubernetes]
  Kube -->|pods, namespaces, metrics, logs| API
```

## Stack

- **Frontend:** React 19, TypeScript, Vite, Zustand e `lucide-react`.
- **Backend:** Node.js, TypeScript, Express, `@kubernetes/client-node` e `ws`.
- **Testes:** test runner nativo do Node via `tsx --test`.
- **Monorepo:** npm workspaces com os pacotes `backend`, `frontend` e `desktop`.
- **Interface:** Manrope para texto, DM Mono para dados tecnicos e temas claro/escuro com acento terracota.

## Downloads

A release publicada referenciada por estes links e a **v0.5.1**. A implementacao da especificacao
v1.5.1 esta no checkout atual; esta alteracao nao publica uma nova release. Os
instaladores e pacotes estao disponiveis na pagina de
[releases do GitHub](https://github.com/idd-galcantara/ops-union/releases/tag/v0.5.1).

### Linux

- [AppImage](https://github.com/idd-galcantara/ops-union/releases/download/v0.5.1/ops-union-0.5.1-linux-x86_64.AppImage)
- [Pacote Debian](https://github.com/idd-galcantara/ops-union/releases/download/v0.5.1/ops-union-0.5.1-linux-amd64.deb)

Instrucoes de instalacao e execucao: [guia de release Linux](docs/README-release-linux.md).

### Windows

- [Instalador `.exe`](https://github.com/idd-galcantara/ops-union/releases/download/v0.5.1/ops-union-0.5.1-win-x64.exe)

Instrucoes de instalacao: [guia de release Windows](docs/README-release-windows.md).

### macOS

O empacotamento macOS gera instaladores `.dmg` e `.zip` para Macs Intel (`x64`) e Apple Silicon
arm64`). A release `v0.5.1` inclui os quatro artefatos macOS:

- [DMG Apple Silicon](https://github.com/idd-galcantara/ops-union/releases/download/v0.5.1/ops-union-0.5.1-mac-arm64.dmg)
- [DMG Intel](https://github.com/idd-galcantara/ops-union/releases/download/v0.5.1/ops-union-0.5.1-mac-x64.dmg)
- [ZIP Apple Silicon](https://github.com/idd-galcantara/ops-union/releases/download/v0.5.1/ops-union-0.5.1-mac-arm64.zip)
- [ZIP Intel](https://github.com/idd-galcantara/ops-union/releases/download/v0.5.1/ops-union-0.5.1-mac-x64.zip)

Instrucoes de instalacao: [guia de release macOS](docs/README-release-mac.md).
Instrucoes de empacotamento: [guia de distribuicao](docs/DISTRIBUTION.md).

## Fluxo local

O ops-union tambem pode ser executado localmente sem instalar um pacote desktop. Nesse fluxo, o
frontend roda no Vite, o backend roda em `127.0.0.1` e o kubeconfig continua sendo lido na
maquina do usuario. Isso e util para desenvolvimento, validacao de mudancas e uso temporario.

```bash
npm install
npm run dev
```

Depois, abra <http://localhost:5173>. O frontend encaminha as requisicoes `/api` e o WebSocket
de logs para o backend local em `http://127.0.0.1:4000`. Para abrir a versao desktop a partir do
codigo-fonte, use `npm run dev:desktop`.

## Requisitos

- **Node.js v25.2.1**, versao usada e validada neste ambiente, com npm.
- Acesso aos clusters que serao consultados.
- Um kubeconfig valido no caminho padrao do cliente Kubernetes, normalmente `~/.kube/config`.
- Permissao de leitura para namespaces, pods, eventos, metricas e logs conforme o uso desejado.
- `metrics-server` instalado e acessivel no cluster para exibir metricas. A ausencia dele nao impede a consulta dos pods.

O backend usa o nome do **contexto** do kubeconfig como identificador selecionavel de cluster. A resposta de contextos tambem informa o nome do cluster Kubernetes associado.

Para reproduzir a versao de Node.js usada no desenvolvimento:

```bash
nvm install 25.2.1
nvm use 25.2.1
```

## Ambiente Kubernetes local

O repositorio inclui um ambiente de desenvolvimento com dois clusters kind independentes. Ele usa
`~/.kube/config`, preserva as demais entradas do kubeconfig e cria os contextos `kind-ops-dev` e
`kind-ops-staging`, que o ops-union descobre pelo fluxo normal de leitura do kubeconfig.

### Pre-requisitos

- Docker em execucao e acessivel pelo usuario atual.
- `kubectl` e uma versao recente do `kind` compativel com a imagem Kubernetes v1.37.0.
- Em Linux, para dois clusters kind, `fs.inotify.max_user_instances` deve ser pelo menos `256`.
  Se necessario, ajuste uma vez antes do setup: `sudo sysctl -w fs.inotify.max_user_instances=256`.
- Para executar o ops-union a partir do codigo-fonte, Node.js e npm (veja [Requisitos](#requisitos)).
  O aplicativo Linux ja instalado nao precisa dessas ferramentas.

### Windows

O aplicativo Ops Union funciona no Windows e usa o kubeconfig padrao em
`%USERPROFILE%\.kube\config`. Os scripts deste repositorio sao Bash; a forma recomendada de
executa-los no Windows e usar WSL2 com Docker Desktop.

1. Instale Docker Desktop, habilite a integracao com WSL2 e instale `kubectl` e `kind` na
  distribuicao Ubuntu do WSL.
2. Abra a pasta do repositorio no WSL. Por exemplo, se ela estiver no disco C:

  ```bash
  cd /mnt/c/caminho/para/ops-union
  ```

3. Use o kubeconfig do Windows ao criar os clusters, para que o Ops Union instalado no Windows
  enxergue os contextos. Substitua `SEU_USUARIO` pelo seu usuario do Windows:

  ```bash
  export OPS_UNION_KUBECONFIG="/mnt/c/Users/SEU_USUARIO/.kube/config"
  ./scripts/dev-cluster.sh
  ./scripts/dev-cluster-status.sh
  ```

  O script preserva as demais entradas desse arquivo e adiciona `kind-ops-dev` e
  `kind-ops-staging`.
4. Abra o Ops Union no Windows e selecione `C:\Users\SEU_USUARIO\.kube\config` quando solicitado.

O setup tambem pode ser executado em Git Bash, desde que Docker Desktop, `kubectl` e `kind`
estejam disponiveis no `PATH`. PowerShell e `cmd.exe` nao executam diretamente os arquivos `.sh`.
O limite Linux de `fs.inotify.max_user_instances` nao se aplica ao Windows.

### Criar e verificar os clusters

Na raiz do repositorio:

```bash
./scripts/dev-cluster.sh
./scripts/dev-cluster-status.sh
```

O setup cria dois nos por cluster (control-plane e worker), namespaces `production`, `staging`,
`monitoring` e `payments` em `ops-dev`, e `staging`, `monitoring` e `payments` em `ops-staging`.
Deployments leves de log continuo simulam frontend, API e processamento de pagamentos, com replicas
e quantidades diferentes entre clusters.

Os comandos equivalentes do Kubernetes tambem podem ser executados diretamente:

```bash
kubectl config get-contexts
kubectl --context kind-ops-dev get nodes
kubectl --context kind-ops-dev get pods --all-namespaces
kubectl --context kind-ops-staging get nodes
kubectl --context kind-ops-staging get pods --all-namespaces
```

O setup instala o metrics-server v0.9.0 em cada cluster. Como os certificados locais dos kubelets
kind nao sao emitidos por uma CA confiavel, ele habilita `--kubelet-insecure-tls` **somente nesses
clusters locais**. O script aguarda a inicializacao, mas avisa e continua se as metricas ainda nao
estiverem prontas; tente `kubectl --context kind-ops-dev top pods --all-namespaces` novamente apos
alguns minutos. Sem metrics-server disponivel, o ops-union continua listando e inspecionando pods.

### Usar os clusters no ops-union

Abra o aplicativo Linux instalado pelo menu de aplicativos ou, para uma instalacao `.deb`,
execute `ops-union`. Confirme que o kubeconfig selecionado no painel do aplicativo e
`~/.kube/config`; se o aplicativo lembrar outro arquivo, use **Selecionar kubeconfig** para
escolher esse caminho. Se iniciar pelo terminal com `KUBECONFIG` apontando para outro arquivo e
nao quiser usa-lo, execute `env -u KUBECONFIG ops-union`.

Executar a versao web a partir do codigo-fonte e opcional: use `npm install` e `npm run dev` e
abra <http://localhost:5173>. Em qualquer versao, selecione `kind-ops-dev` e `kind-ops-staging`,
escolha os namespaces existentes nos clusters selecionados e adicione os alvos para consultar os
pods. Abra um pod para conferir o describe e as metricas, e use o visualizador de logs para
observar as mensagens periodicas dos containers.

### Remover os clusters

```bash
./scripts/delete-dev-cluster.sh
```

Isso remove apenas os clusters kind com os nomes `ops-dev` e `ops-staging`; outros clusters e
contextos do usuario nao sao alvo do script.

## Comecando

### 1. Instalar dependencias

Na raiz do repositorio:

```bash
npm install
```

### 2. Iniciar a aplicacao

```bash
npm run dev
```

Esse comando inicia:

- Frontend: <http://localhost:5173>
- Backend: <http://127.0.0.1:4000>

Abra o frontend no navegador. O Vite encaminha `/api` e o WebSocket de logs para o backend local.

Para abrir a versao desktop local, depois de instalar as dependencias:

```bash
npm run dev:desktop
```

Para gerar os artefatos de distribuicao, consulte [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md).

Cada push na branch `main` também aciona o workflow do GitHub Actions que gera os pacotes Linux,
Windows e macOS. Os arquivos ficam disponíveis como artifacts da execução por 14 dias.

Para instalar ou executar uma release pronta, consulte a secao [Downloads](#downloads) e os
guias de release por sistema operacional.

### 3. Fazer a primeira consulta

1. Selecione um ou mais contextos.
2. Escolha ou digite um ou mais namespaces.
3. Adicione os alvos.
4. Clique em **Fetch pods**.
5. Use o agrupamento e o filtro para encontrar o pod desejado.
6. Clique em um pod para abrir `Describe`, `Metrics` e `Logs`.

A consulta e feita para todas as combinacoes selecionadas. Por exemplo, dois clusters e dois namespaces resultam em quatro alvos independentes:

```json
{
  "targets": [
    { "cluster": "cluster-a", "namespace": "namespace-a" },
    { "cluster": "cluster-a", "namespace": "namespace-b" },
    { "cluster": "cluster-b", "namespace": "namespace-a" },
    { "cluster": "cluster-b", "namespace": "namespace-b" }
  ]
}
```

## Comandos

### Na raiz

```bash
npm run dev            # backend + frontend em desenvolvimento
npm run dev:backend    # somente backend
npm run dev:frontend   # somente frontend
npm run build          # build dos tres workspaces
npm run typecheck      # typecheck dos dois workspaces
npm run package:linux  # empacotamento Linux AppImage e .deb
npm run package:win    # empacotamento Windows NSIS
npm run package:mac    # empacotamento macOS x64 e arm64
```

### Backend

```bash
npm run dev --workspace=backend
npm run build --workspace=backend
npm run start --workspace=backend
npm run typecheck --workspace=backend
npm test --workspace=backend
```

O backend gera sua saida compilada em `backend/dist`.

### Frontend

```bash
npm run dev --workspace=frontend
npm run build --workspace=frontend
npm run preview --workspace=frontend
npm run typecheck --workspace=frontend
npm test --workspace=frontend
```

O bundle do frontend e gerado em `frontend/dist`.

## Configuracao

O backend e local por design:

| Variavel | Padrao | Descricao |
| --- | --- | --- |
| `OPS_FLOW_PORT` | `4000` | Porta HTTP e WebSocket do backend |

O host e fixo em `127.0.0.1`, portanto o backend nao fica exposto na rede local por padrao.

Para usar outra porta:

```bash
OPS_FLOW_PORT=4001 npm run dev --workspace=backend
```

Nesse caso, o proxy do Vite tambem precisa apontar para a mesma porta em `frontend/vite.config.ts`.

## API

Todas as rotas abaixo sao locais. O backend nao expoe credenciais, certificados ou tokens do kubeconfig nas respostas.

### Health check

```http
GET /api/health
```

Resposta:

```json
{
  "status": "ok",
  "service": "ops-union-backend",
  "readOnly": true
}
```

### Contextos

```http
GET /api/contexts
```

Retorna os contextos disponiveis no kubeconfig:

```json
{
  "contexts": [
    {
      "name": "cluster-a",
      "cluster": "cluster-example",
      "namespace": "default"
    }
  ]
}
```

### Namespaces

```http
POST /api/namespaces
Content-Type: application/json

{
  "clusters": ["cluster-a", "cluster-b"]
}
```

Resposta consolidada:

```json
{
  "namespaces": [
    {
      "name": "namespace-a",
      "clusters": ["cluster-a", "cluster-b"]
    }
  ],
  "errors": []
}
```

O uso de `POST` aqui existe apenas para transportar a lista de contextos no corpo da requisicao. A operacao continua sendo de leitura.

### Pods

```http
POST /api/pods
Content-Type: application/json

{
  "targets": [
    {
      "cluster": "cluster-a",
      "namespace": "namespace-a"
    }
  ]
}
```

O retorno contem os pods normalizados e erros independentes por alvo:

```json
{
  "pods": [
    {
      "cluster": "cluster-a",
      "namespace": "namespace-a",
      "name": "pod-app-7c8d6f9c6b-x2abc",
      "status": "Running",
      "ready": "2/2",
      "restarts": 0,
      "node": "node-1",
      "ageSeconds": 3600,
      "containers": ["app", "istio-proxy"]
    }
  ],
  "errors": []
}
```

Os sidecars nativos tambem participam da contagem de `ready` e `restarts`, mantendo o resultado alinhado ao comportamento do `kubectl`.

### Describe

```http
GET /api/pods/:cluster/:namespace/:pod/describe
```

Retorna status, node, IP, QoS, service account, containers, imagens, estados, requests, limits, labels, annotations, condicoes e eventos. Se a consulta de eventos falhar, o restante do describe continua disponivel e a resposta informa `eventsError`.

### Metricas

```http
GET /api/pods/:cluster/:namespace/:pod/metrics
```

Consulta `metrics.k8s.io` e retorna CPU e memoria por container. Quando o metrics-server nao existe, ainda nao possui dados ou nao esta acessivel, a resposta usa `available: false` para permitir degradacao graciosa da interface.

### Logs

```text
WS /api/pods/:cluster/:namespace/:pod/logs?container=app&follow=true&tailLines=500
```

Parametros:

- `container`: obrigatorio.
- `follow`: `true` por padrao; use `false` para uma leitura finita.
- `tailLines`: `500` por padrao, limitado a `5000`.

Mensagens enviadas pelo servidor:

```json
{ "type": "started", "container": "app" }
{ "type": "line", "line": "..." }
{ "type": "error", "message": "..." }
{ "type": "end" }
```

Ao fechar a conexao do navegador, o backend interrompe a requisicao de logs no cluster.

### Workspace agregado e historico

O workspace de logs usa o WebSocket agregado `WS /api/logs` para manter um unico transporte para
as fontes confirmadas. O modo inicial e Live, e cada novo workspace inicia com **Wrap lines**
habilitado; o controle pode ser desativado e reativado durante a sessao. Uma consulta explicita de
pods, incluindo Fetch pods, refresh, retry ou aplicacao de preset, fecha o workspace e limpa as
selecoes de logs antes de apresentar o novo resultado. O auto-refresh silencioso preserva o
workspace, o filtro local e os detalhes atuais. O modo History precisa ser escolhido e aplicado pelo
botao **Search**; ele usa uma unica captura finita com os limites tecnicos configurados. O Search
permanece habilitado quando o workspace esta ocioso: mudancas pendentes sao confirmadas, e uma
ativacao sem mudancas repete a operacao. Em Live isso substitui a sessao agregada e resolve faixas
relativas no momento da ativacao; em History isso cria uma nova geracao. Enquanto a operacao esta
ocupada, novas ativacoes sao bloqueadas, mas os controles de rascunho continuam editaveis.

No modo History, o backend faz uma leitura finita `follow=false` por tupla exata
`(cluster, namespace, pod, container)`, grava um snapshot temporario NDJSON com indice de linha,
offset e timestamp, e entrega somente janelas limitadas para a virtualizacao. Kubernetes nao e
tratado como uma fonte paginada: nao ha reread implicito para buscar outra pagina, e `--previous`
fica fora do escopo padrao.

Os estados de fonte incluem `queued`, `reading`, `indexing`, `ready`, `partial`, `failed` e
`cancelled`; a sessao tambem informa limites e pode terminar como completa, parcial, falha,
cancelada ou expirada. Os limites de snapshot, janela, frame, sessoes, leituras concorrentes,
taxa de requests, TTL e limpeza sao aplicados no backend.

Ao chegar ao fim historico, a acao explicita **Start one new live session** fecha a sessao finita
e inicia uma nova sessao Live agregada. A fronteira historica permanece indicada enquanto a nova
sessao conecta. A ausencia de teste interativo de navegador/Electron e as verificacoes ainda nao
realizadas de rotacao/reinicio e retry de limpeza permanecem limitacoes conhecidas.

## Arquitetura do codigo

```text
ops-union/
├── backend/
│   └── src/
│       ├── app.ts                 # Express e registro das rotas
│       ├── config.ts              # Host e porta locais
│       ├── index.ts               # Bootstrap HTTP + WebSocket
│       ├── logsWebSocket.ts       # Upgrade e ciclo de vida dos logs
│       ├── routes/                # Contextos, namespaces e pods
│       └── kube/
│           ├── kubeconfig.ts      # Contextos e cache de clientes
│           ├── namespacesService.ts
│           ├── podsService.ts
│           ├── podDetailsService.ts
│           ├── logsService.ts
│           ├── normalizePod.ts
│           ├── parseTargets.ts
│           └── caChain.ts         # Cadeia TLS completa
├── frontend/
│   └── src/
│       ├── App.tsx                # Shell, health check e layout
│       ├── api.ts                 # Cliente REST e URL WebSocket
│       ├── store.ts               # Estado global Zustand
│       ├── types.ts               # Contratos do frontend
│       ├── podPresentation.ts     # Filtro, agrupamento e ordenacao
│       ├── presets.ts             # Persistência de presets web e desktop
│       └── components/
│           ├── TargetSelector.tsx
│           ├── PodTable.tsx
│           ├── PodDetailsPanel.tsx
│           └── LogViewer.tsx
├── docs/
│   ├── DESIGN-SYSTEM.md
│   ├── DISTRIBUTION.md
│   ├── PLAN.md
│   ├── README-release-linux.md
│   ├── README-release-mac.md
│   ├── README-release-windows.md
│   ├── TECH-DEFINITION.md
│   └── VERSIONING-AND-RELEASE.md
├── specs/                         # Especificacoes do produto
├── package.json                   # Workspaces e scripts da raiz
└── package-lock.json
```

### Fluxo de dados

1. O frontend carrega os contextos com `GET /api/contexts`.
2. A selecao de clusters dispara a descoberta de namespaces.
3. O frontend monta a matriz de alvos `(cluster, namespace)`.
4. O backend cria ou reutiliza clientes Kubernetes por contexto.
5. Cada alvo e consultado em paralelo.
6. Pods bem-sucedidos sao normalizados e anotados com sua origem.
7. Falhas ficam associadas ao alvo correspondente e nao descartam os demais resultados.
8. O painel do pod consulta describe/metricas sob demanda e abre um WebSocket para logs.

## TLS e cadeia de certificados

Alguns clusters podem fornecer no kubeconfig apenas uma CA intermediaria. Para manter o mesmo funcionamento do `kubectl`, o backend pode compor a cadeia concatenando a CA do kubeconfig com um bundle de CAs do sistema, como:

- `/etc/ssl/certs/ca-certificates.crt`
- `/etc/pki/tls/certs/ca-bundle.crt`

A verificacao TLS continua ativa. O projeto nao usa `skipTLSVerify` nem `NODE_TLS_REJECT_UNAUTHORIZED`, e o trust store do sistema e apenas lido em memoria.

## Seguranca e limites de escopo

- O backend escuta somente em localhost.
- O acesso aos clusters usa as credenciais e permissoes do kubeconfig do usuario.
- Nao ha autenticacao propria nem multiusuario.
- Credenciais, certificados, tokens e headers de autenticacao nao sao retornados nem registrados.
- Erros da API Kubernetes sao sanitizados antes de chegar ao cliente.
- Presets armazenam somente nomes de contextos/clusters e namespaces. No modo web, ficam no
  `localStorage`; no modo desktop, ficam em `presets.json` no diretório de dados do Electron.
- A aplicacao nao oferece nenhuma rota de mutacao do Kubernetes.

Esse modelo e adequado para uso pessoal/local. Ele nao deve ser tratado como um servico multiusuario ou publicado diretamente na rede.

## Testes e qualidade

Os comandos abaixo executam as verificacoes principais:

```bash
npm test --workspace=backend
npm test --workspace=frontend
npm run typecheck
npm run build
```

A validacao da versao 1.3.2 registrada inclui **193 testes**: 88 no backend e 105 no frontend.
Os typechecks do backend e frontend, o build do frontend e `git diff --check` tambem passaram. Os
testes verificam, entre outros pontos:

- normalizacao de pods e status;
- parsing e validacao de alvos;
- cadeia de CA;
- isolamento de falhas por cluster/namespace;
- sugestoes e alcance de namespaces;
- agrupamento, ordenacao, filtro e severidade de pods;
- conversao de unidades de CPU e memoria;
- presets e persistencia local;
- destaque de texto em logs;
- fechamento do workspace em consultas explicitas, preservacao no auto-refresh silencioso e estado
  inicial de Wrap lines;
- confirmacao e repeticao do Search, incluindo isolamento do rascunho durante uma operacao ocupada;
- aquisicao historica finita, snapshots NDJSON, indices, limites, cancelamento, TTL, janelas e geracoes obsoletas;
- redimensionamento dos paineis.

Nao ha lint configurado no momento, nem uma suite end-to-end que abra o navegador ou o Electron.

## Limitacoes conhecidas

- Depende de um kubeconfig valido e de acesso de rede aos clusters.
- Metricas dependem do `metrics-server` e podem nao estar disponiveis.
- Nao ha retry, timeout ou circuit breaker explicito para chamadas Kubernetes.
- O visualizador de logs nao reconecta automaticamente.
- Durante a pausa do visualizador, as linhas recebidas sao descartadas; o buffer mantem no maximo 5.000 linhas.
- A validacao headless cobriu a launchpad em desktop, mobile e escala 2x, sem overflow horizontal visivel. A interacao de navegador/Electron para reset, auto-refresh, retry, presets, transporte obsoleto e linhas longas agrupadas nao foi concluida porque o alvo CDP ficou obsoleto; nao ha ferramenta de screen reader disponivel. Rotacao/reinicio de containers, falhas de retry de limpeza e limpeza apos restart do desktop tambem permanecem sem verificacao ao vivo.
- Os limites de memoria decodificada em voo estao implementados e cobertos por testes: 4 MiB por fonte e 32 MiB por sessao. Nao foi executado um profiler de RSS, portanto esses limites nao sao uma medicao de RSS.
- A validacao read-only de QA cobriu fan-out de pods, falha parcial, describe, metricas, evento `started` do WebSocket agregado e health `readOnly: true` nos contextos disponiveis; nenhuma mutacao, packaging, commit ou release foi executada. A identidade do cluster possui algumas permissoes capazes de mutacao, portanto a protecao read-only continua sendo aplicada pela aplicacao.
- Presets e larguras de paineis ficam apenas no navegador atual.
- Nao ha validacao runtime de schema alem das validacoes implementadas nas rotas.
- O modo de producao precisa de um servidor/reverse proxy que entregue o frontend e encaminhe `/api` e WebSocket para o backend; o proxy automatico descrito acima e configurado apenas no servidor de desenvolvimento do Vite.

## Evolucoes possiveis

- Suporte a deployments, services, events e configmaps.
- Watch ou informers para atualizacao em tempo real.
- Busca por labels/selectors entre clusters.
- Comparacao lado a lado do mesmo recurso em clusters diferentes.
- Exportacao de describe e logs.
- Acoes de escrita atras de permissao explicita e confirmacao, caso o escopo do produto mude.

## Documentacao adicional

- [Plano de desenvolvimento](docs/PLAN.md)
- [Design system](docs/DESIGN-SYSTEM.md)
- [Especificacoes](specs/)
