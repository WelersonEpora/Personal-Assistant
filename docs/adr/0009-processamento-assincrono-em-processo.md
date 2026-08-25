# ADR-0009: Processamento assíncrono em processo (fila em memória)

**Status:** Aceita (2026-08-25)

## Contexto

Depois que um Registro é sincronizado, ele precisa passar por transcrição
de cada áudio e depois por interpretação (ADR-0006) — chamadas de rede a um
provedor externo (Gemini), potencialmente lentas (múltiplos áudios por
Registro) e sujeitas a falha. Rodar esse pipeline de forma síncrona dentro
da própria requisição HTTP de sincronização arriscaria timeout no cliente e
acoplaria a confirmação de "Registro recebido" ao tempo de resposta da IA.

## Decisão

- `POST /api/v1/registros/:id/sincronizar` grava o Registro (`status =
  recebido`) e responde imediatamente — o pipeline de IA roda **depois**,
  fora do ciclo de request/response.
- **Fila em memória, em processo** (`backend/src/jobs/processador-fila-
  ia.js`): um array/loop simples dentro do próprio processo Node, sem
  dependência externa (Redis, BullMQ, RabbitMQ). Ao sincronizar um
  Registro, ele é enfileirado; um worker interno consome a fila
  sequencialmente, chama o serviço de IA (transcrição de cada áudio,
  depois interpretação) e persiste os resultados, avançando
  `registro.status` a cada etapa.
- Em caso de falha numa chamada ao Gemini, o Registro vai para
  `erro_transcricao`/`erro_interpretacao` e pode ser reprocessado (reenfileirado
  manualmente ou por um endpoint/administração simples) — sem fila de
  dead-letter sofisticada neste MVP.
- Ao reiniciar o processo do backend, Registros que ficaram parados em
  `recebido`/`transcrevendo`/`interpretando` (sem `resultado_ia` concluído)
  são automaticamente reenfileirados na inicialização — evita que um
  restart do servidor "perca" um Registro no meio do pipeline.

## Alternativas consideradas

- **Redis + BullMQ (ou equivalente).** Rejeitada para o MVP — adiciona um
  serviço de infraestrutura inteiro (mais um container, mais uma
  dependência operacional) para um volume de processamento que, na fase
  atual do produto (uso real ainda não iniciado), não justifica a
  complexidade. Fica documentado aqui como caminho natural de evolução se o
  volume de Registros/concorrência crescer a ponto de a fila em memória não
  bastar (perda de fila em restart do processo é o principal risco a
  reavaliar nesse momento).
- **Processar o pipeline de forma síncrona na própria requisição de
  sincronização.** Rejeitada — risco de timeout HTTP em Registros com
  vários áudios, e acoplaria a confiabilidade da sincronização (que precisa
  ser rápida e robusta a rede ruim, ver ADR-0005) à disponibilidade do
  provedor de IA.
- **Cron job externo separado do processo do backend** (ex.: script rodado
  por `cron` do sistema, como alguns jobs do AgroMind). Rejeitada aqui —
  os jobs do AgroMind processam lotes agendados (ex.: "análise diária");
  este pipeline precisa reagir a cada sincronização quase em tempo real,
  o que um worker em processo, acordado por evento, atende melhor que um
  cron de intervalo fixo.

## Consequências

- Nenhuma dependência de infraestrutura nova além do que já existia
  (Postgres); o backend continua sendo um único processo Node no MVP.
- Escalar o backend para múltiplas instâncias exigiria revisar esta decisão
  primeiro (a fila em memória não é compartilhada entre processos) — não é
  um requisito deste MVP, mas fica registrado como limite conhecido.
- O status do Registro (`registro.status`) é a única fonte de verdade sobre
  onde ele está no pipeline — a tela de revisão do desktop e o status de
  sincronização do celular sempre refletem esse campo, nunca um estado
  interno da fila.
