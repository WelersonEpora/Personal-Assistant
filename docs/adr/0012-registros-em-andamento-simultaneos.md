# ADR-0012: Múltiplos Registros em andamento simultâneos (persistência incremental de entradas)

**Status:** Aceita (2026-08-26)

## Contexto

O personal trainer pode atender várias pessoas na mesma sessão (ex.:
atendimento em família): começa um Registro para um aluno, e antes de
finalizá-lo — ainda faltam outras partes do treino — precisa trocar para
outro aluno, apontar algo para ele, e depois voltar ao primeiro para
continuar de onde parou.

Até aqui o app de captura só permitia **um único Registro em edição por
vez, inteiramente em memória** (`activeRegistro`, em
`frontend/src/views/captura/CapturaView.vue`): a troca de aluno era
bloqueada explicitamente (CSS `.is-locked`) enquanto esse Registro não fosse
finalizado ou descartado, e nem o Registro nem suas entradas (texto, Blob de
áudio) eram gravados no IndexedDB antes da finalização.

A ADR-0004 já havia antecipado, no desenho dos object stores do IndexedDB,
que `registros` guardaria "Registros locais (finalizados ou em edição)" —
mas a implementação nunca chegou a usar esse segundo caso.

## Decisão

- Novo estado **exclusivamente local** de Registro: `em_andamento`,
  adicionado ao grupo de estados locais definido na ADR-0002 (nunca setado
  no servidor, nunca é confundido com o campo `registro.status` do backend,
  que continua só com os estados de servidor já documentados).
- Um Registro passa a ser **persistido no IndexedDB desde "Iniciar
  registro"**, com status `em_andamento`, e cada entrada (texto ou áudio) é
  persistida **incrementalmente**, assim que capturada — metadados no store
  `registros`, Blob de áudio no store `audios` — em vez de só no momento de
  finalizar.
- Isso permite múltiplos Registros `em_andamento` simultâneos, no máximo um
  por aluno. A troca de aluno deixa de ser bloqueada: ao selecionar um aluno
  que já tem um Registro `em_andamento`, o app retoma esse Registro em vez
  de criar um novo.
- O seletor de aluno (`AlunoSheet`) passa a indicar visualmente quais alunos
  têm um Registro em andamento.
- A reprodução de áudio dentro do composer (capacidade já existente,
  baseada em `URL.createObjectURL` sobre o Blob) passa a sobreviver a trocas
  de aluno e a reload de página, porque o Blob está sempre recuperável via
  `obterAudioLocal` — antes só existia enquanto o Registro estivesse em
  memória.
- `ordem` de uma entrada **nunca é reindexada** depois de removida uma
  entrada do meio do Registro (deixa gaps, ex.: 0, 2, 3 após remover a 1) —
  o Blob de áudio já foi persistido sob a `ordem` original no IndexedDB, e
  tanto o backend (`registro-sync.service.js`) quanto a IA
  (`gemini.service.js`) só usam `ordem` como critério relativo de
  ordenação/chave de mapeamento, nunca como sequência contígua. A próxima
  entrada usa sempre o maior `ordem` existente + 1.
- Novo utilitário no IndexedDB: `removerAudioLocal(registroId, ordem)`,
  para remover um único Blob de áudio (antes só existia remoção em lote,
  junto com o Registro inteiro).

## Alternativas consideradas

- **Reutilizar/estender `registro.status` (campo de servidor) com um valor
  "pendente"** para representar o rascunho em edição. Rejeitada — misturaria
  estados locais e de servidor no mesmo campo, violando explicitamente a
  separação decidida na ADR-0002 ("nunca misturados").
- **Manter um único Registro em edição por vez, só relaxando a UI para
  visualizar outros alunos sem editar.** Rejeitada — não resolve o caso de
  uso real (o personal precisa efetivamente adicionar entradas para o
  segundo aluno sem perder o progresso do primeiro).
- **Persistir o Registro só ao trocar de aluno, em vez de a cada entrada.**
  Rejeitada — reintroduz risco de perda de dado se o app for fechado ou
  perder foco por um período longo antes da troca (sessões em família podem
  durar 30-60 minutos), e ainda seria necessário para restaurar a reprodução
  de áudio depois de qualquer navegação.
- **Reindexar `ordem` sequencialmente ao remover uma entrada** (comportamento
  anterior, inofensivo quando os áudios só eram persistidos no fim).
  Rejeitada agora que a persistência é incremental — reindexar depois de o
  Blob já estar salvo sob a `ordem` antiga dessincronizaria a entrada do seu
  áudio, e poderia colidir com uma `ordem` já usada por outra entrada.

## Consequências

- Nenhuma mudança de backend, banco de dados, endpoints ou pipeline de IA —
  mudança inteiramente client-side.
- Escritas no IndexedDB ficam mais frequentes (uma a cada entrada de
  texto/áudio, em vez de uma vez por Registro no final) — aceito como custo
  razoável dado o volume de dados envolvido (metadados pequenos, sem blob
  embutido).
- Nenhum limite de tempo ou expiração automática para Registros
  `em_andamento` esquecidos — decisão explícita de escopo para o MVP; pode
  ser revisitada se isso se mostrar um problema real de uso de
  armazenamento do dispositivo.
- UX de troca de aluno muda: nunca mais bloqueada; um aluno com Registro em
  andamento é sinalizado visualmente no seletor de aluno.
- Um Registro `em_andamento` esquecido de um ciclo de sincronização de fundo
  (poll periódico da ADR-0005 processando OUTRO Registro) pode, por um
  instante, precisar reconstruir a URL de reprodução de algum áudio já
  exibido (o objeto em memória é substituído por uma cópia recém-lida do
  IndexedDB) — o app se autocorrige nesse mesmo instante, sem perda de dado
  nem intervenção do personal; não gera nenhum comportamento visível.
