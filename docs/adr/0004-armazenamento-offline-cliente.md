# ADR-0004: Armazenamento offline no cliente (IndexedDB, sem transcrição local)

**Status:** Aceita (2026-08-25)

## Contexto

O local de trabalho do personal trainer pode não ter internet (seção 3 do
pedido). O app de captura precisa funcionar inteiramente offline: abrir,
selecionar aluno, iniciar Registro, gravar áudio, adicionar texto, finalizar
— tudo isso sem qualquer chamada de rede — e manter os dados guardados no
dispositivo até que a sincronização seja possível.

## Decisão

- **IndexedDB** como armazenamento local (via uma camada fina, `src/offline/
  db.js`, usando a lib `idb` para uma API baseada em Promises em vez da API
  de callbacks nativa). `localStorage` foi descartado por não suportar
  Blobs nem volume de dados relevante; Cache Storage (API de Service
  Worker) é para respostas HTTP, não para o modelo de dados da aplicação.
- Object stores:
  - `alunos` — cache local da lista de alunos do personal autenticado (para
    seleção offline), atualizado a cada sincronização bem-sucedida.
  - `registros` — Registros locais (finalizados ou em edição) com suas
    `entradas` embutidas (metadados: tipo, ordem, conteúdo de texto ou
    referência ao áudio, duração) e o status local
    (`local`/`aguardando_sincronizacao`/`sincronizando`/`sincronizado`).
  - `audios` — o **Blob de áudio bruto** de cada entrada de áudio, guardado
    separado dos metadados (Blobs grandes não devem inflar o registro
    principal), referenciado pelo id da entrada.
- **Nenhuma transcrição acontece no dispositivo.** O áudio é armazenado tal
  como gravado (`MediaRecorder`, formato `audio/webm;codecs=opus` quando
  suportado); a transcrição só acontece na nuvem, depois da sincronização
  (ver ADR-0006). Essa é uma restrição explícita do pedido, não só uma
  escolha de simplicidade.
- Um Registro e suas entradas permanecem no IndexedDB até a confirmação de
  que a sincronização foi bem-sucedida — só então (ou depois de um período
  de retenção curto, para permitir reenvio em caso de falha silenciosa) o
  Blob de áudio local pode ser removido. Os metadados do Registro
  permanecem localmente até o modelo de fila (ADR-0005) decidir que também
  podem ser limpos.

## Alternativas consideradas

- **Transcrição local no dispositivo** (ex.: um modelo Whisper rodando no
  navegador/WASM). Rejeitada explicitamente pelo pedido para este MVP — a
  transcrição é responsabilidade exclusiva da nuvem.
- **Depender só de `localStorage`/`sessionStorage`.** Rejeitada — não
  suporta Blobs binários (áudio precisaria virar base64, inflando ~33% o
  tamanho e o custo de I/O) e tem limite de armazenamento muito menor que
  IndexedDB.
- **Guardar o Blob de áudio dentro do mesmo registro do IndexedDB** (em vez
  de um object store separado). Rejeitada — misturar payload binário grande
  com os metadados do Registro tornaria consultas e listagens (tela
  ociosa, lista de registros recentes) mais lentas sem necessidade, já que
  essas telas não precisam do conteúdo do áudio, só de metadados.

## Consequências

- O app de captura funciona 100% offline para todo o fluxo descrito na
  seção 2 do pedido — nenhuma tela depende de rede para abrir ou operar.
- A UI de captura nunca mostra transcrição para um Registro ainda não
  sincronizado (mesmo comportamento do protótipo, que já reflete isso:
  `transcricao: null` para entradas locais).
- Perda de dados por fechamento do navegador/app é mitigada (IndexedDB
  sobrevive a reload), mas não por desinstalação do app ou limpeza de dados
  do navegador — risco aceito para o MVP, sem backup de áudio fora do
  dispositivo antes da sincronização.
