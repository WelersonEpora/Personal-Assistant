# ADR-0005: Estratégia de sincronização (fila própria, sem Background Sync)

**Status:** Aceita (2026-08-25)

## Contexto

Quando a conexão volta, os Registros finalizados offline precisam ser
enviados ao servidor de forma confiável, evitando perda de dados,
duplicação, envio parcial e processamento duplicado (seção 3 do pedido). O
pedido também autoriza explicitamente não depender da Background Sync API
do navegador, preferindo uma estratégia própria mais previsível.

## Decisão

- **Fila local baseada no próprio object store `registros` do IndexedDB**
  (ADR-0004): qualquer Registro com status local `aguardando_sincronizacao`
  é, por definição, um item pendente da fila — não existe uma fila separada
  duplicando essa informação.
- **Motor de sincronização em `src/offline/syncQueue.js`**, ativo enquanto o
  app está aberto: dispara ao evento `online`, ao carregar o app, e em um
  intervalo curto de verificação (poll leve, sem custo de rede quando não
  há pendências). Processa um Registro pendente por vez, sequencialmente,
  para não competir por banda com gravações em andamento.
- **Requisição única por Registro**: `POST /api/v1/registros/:id/sincronizar`
  como `multipart/form-data` — um campo JSON com os metadados (título,
  aluno, entradas com tipo/ordem/conteúdo de texto) e um arquivo por
  entrada de áudio, nomeado pela ordem/id da entrada. O Registro inteiro
  sincroniza como uma unidade atômica (reforça o conceito da ADR-0002: o
  Registro é a unidade de contexto).
- **Idempotência pelo `registro.id`** gerado no cliente (ADR-0002): o
  endpoint faz upsert — se o Registro já existe no servidor, a requisição é
  um no-op seguro (retorna o estado atual, não recria nada). `registro_
  entrada` tem restrição de unicidade em `(registro_id, ordem)`; arquivo de
  áudio só é gravado em disco se ainda não existir para aquela entrada.
  Isso cobre reenvio por timeout de rede, retry automático e o usuário
  reabrindo o app no meio de uma sincronização.
- **Confirmação de sucesso só depois de resposta 2xx do servidor** — o
  status local só muda para `sincronizado` (e o Blob de áudio local só é
  elegível para limpeza) depois que o servidor confirma recebimento. Falha
  de rede mantém o Registro em `aguardando_sincronizacao` para nova
  tentativa.
- **Retry com backoff simples** (intervalos crescentes, com teto) em caso de
  falha — sem fila de dead-letter neste MVP; um Registro que falhar
  repetidamente continua visível como pendente na UI (banner de status de
  sincronização do protótipo já cobre essa comunicação).

## Alternativas consideradas

- **Background Sync API do navegador.** Rejeitada por decisão explícita do
  pedido — suporte inconsistente entre navegadores/plataformas (em
  particular iOS Safari) tornaria o comportamento menos previsível que uma
  fila própria controlada pelo app.
- **Sincronizar cada entrada individualmente**, em vez do Registro inteiro.
  Rejeitada — quebraria a atomicidade do Registro como unidade de contexto
  (ADR-0002) e multiplicaria o número de requisições e de pontos de falha
  parcial (ex.: 2 de 3 áudios enviados, Registro num estado intermediário
  ambíguo).
- **IDs gerados no servidor.** Rejeitada — exigiria uma primeira
  requisição só para obter um ID antes mesmo de começar a gravar offline,
  o que não é possível sem rede; o UUID gerado no cliente resolve isso e já
  é o padrão usado no AgroMind (ADR-0002 de lá) para geração de UUID na
  aplicação.

## Consequências

- Nenhuma dependência de infraestrutura de push/Background Sync — a
  sincronização só avança enquanto o app está aberto (aba ativa ou PWA em
  primeiro plano). Aceito para o MVP; um Registro finalizado com o app
  fechado só sincroniza na próxima vez que o app for aberto com conexão.
- O backend precisa tratar todo `POST .../sincronizar` como potencialmente
  repetido — isso é requisito de design no controller/service de
  sincronização, testado explicitamente (ver seção de testes do plano).
- A UI de status de sincronização (banner no protótipo) reflete o estado
  real da fila local, não um valor otimista.
