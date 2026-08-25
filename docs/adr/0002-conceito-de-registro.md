# ADR-0002: Conceito de Registro como unidade de contexto

**Status:** Aceita (2026-08-25)

## Contexto

Durante a validação do protótipo, o conceito era chamado internamente de
"Bloco": um agrupador de entradas de áudio e/ou texto capturadas pelo
personal trainer durante o atendimento de um aluno, que só é processado
pela IA depois de finalizado. O pedido de implementação do MVP renomeia
oficialmente esse conceito para **Registro** e determina que "Bloco" não
seja mais usado em nenhuma nomenclatura nova (UI, código, documentação).

O Registro é o contrato central de todo o fluxo do produto: é a unidade que
o celular cria e sincroniza, é a unidade que a IA interpreta, e é a unidade
que o personal revisa e confirma no desktop.

## Decisão

- **Registro** é a entidade central do domínio: pertence a um `aluno` e a um
  `usuario` (o personal trainer), tem um conjunto ordenado de
  `registro_entrada` (tipo `audio` ou `texto`), e passa por um ciclo de
  vida com estados bem definidos.
- Fluxo de uso: **iniciar Registro → adicionar quantas entradas quiser
  (áudio e/ou texto, em qualquer ordem) → finalizar Registro**. Um Registro
  finalizado é imutável do ponto de vista do personal (não dá para
  adicionar nova entrada depois de finalizado — precisaria abrir um novo
  Registro).
- O `id` do Registro é gerado no cliente (celular) no momento de "iniciar
  registro", não no servidor — isso é o que permite sincronização
  idempotente (ver ADR-0005) e é decidido aqui porque afeta diretamente o
  desenho da entidade.
- **Estados do Registro** são divididos em dois grupos, nunca misturados:
  - *Estados locais* (só existem no dispositivo, nunca chegam ao backend):
    `local` (finalizado offline), `aguardando_sincronizacao`,
    `sincronizando`.
  - *Estados de servidor* (campo `registro.status` no banco):
    `recebido → transcrevendo → interpretando → aguardando_revisao →
    confirmado`, com `erro_transcricao`/`erro_interpretacao` como estados
    de falha retomáveis.
- Cada `registro_entrada` guarda sua posição (`ordem`) dentro do Registro —
  a ordem de captura é preservada e é o que a IA recebe como contexto
  consolidado (ver ADR-0006).
- Uma entrada pode ser removida pelo personal **antes** da finalização
  (requisito da seção 2 do pedido); depois de finalizado, o Registro inteiro
  vira a unidade de sincronização e não é mais editável no cliente.

## Alternativas consideradas

- **Manter o nome "Bloco".** Rejeitada por instrução explícita do pedido —
  "Registro" é o termo de domínio oficial a partir de agora.
- **Cada entrada (áudio/texto) sincronizar e processar individualmente**, em
  vez do Registro como unidade. Rejeitada — o pedido é explícito em que a
  IA deve considerar o Registro como uma unidade de contexto (seção 4);
  processar entradas isoladamente perderia o contexto entre um áudio e o
  texto de correção que vem logo depois, por exemplo.
- **Permitir editar entradas depois de finalizado o Registro.** Rejeitada
  para o MVP — o protótipo já modela finalização como um ponto de corte
  claro, e reabrir um Registro sincronizado (possivelmente já em
  processamento de IA) complicaria o ciclo de status sem necessidade
  comprovada agora.

## Consequências

- Toda a modelagem de dados, endpoints e UI usa "Registro"/"entrada de
  Registro" consistentemente; nenhuma referência a "Bloco" em código ou
  documentação novos.
- O ciclo de status (local vs. servidor) precisa ficar claro para quem
  mexer no código depois — misturar os dois conjuntos de estados no mesmo
  campo seria um erro fácil de cometer.
- Como o `id` nasce no cliente, todo o backend precisa tratar o Registro
  como algo que pode chegar mais de uma vez (reenvio de sincronização) —
  isso vira requisito de design em várias camadas (repository, controller),
  não só na camada de sync.
