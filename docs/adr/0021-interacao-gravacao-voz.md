# ADR-0021: Interação de gravação de voz (segurar + travar, estilo WhatsApp)

**Status:** Aceita e implementada (2026-08-31)

> Não altera a ADR-0004 (áudio bruto continua o único artefato do dispositivo,
> nenhuma transcrição local), a ADR-0006, a ADR-0007 nem a ADR-0018. Muda apenas
> a **interação de captura** do áudio no composer da tela `/captura`.

## Contexto

Até aqui o microfone do composer (`CapturaView.vue`) era **só push-to-talk**:
`@pointerdown` começava a gravar, `@pointerup` / `@pointerleave` paravam. Dois
problemas:

1. **Avaliação física com as mãos ocupadas.** O personal segura fita métrica /
   adipômetro com as duas mãos e precisa ditar a medida. Não dá para manter um
   dedo no botão o tempo todo — e `@pointerleave` parando a gravação faz perder
   o fim da fala se o dedo escorrega.
2. **Familiaridade.** O usuário-alvo já usa WhatsApp o dia inteiro. Replicar
   aquela interação elimina curva de aprendizado.

Foi avaliado também o risco de **gravação esquecida ligada** (áudio de dezenas
de minutos → custo de transcrição no Gemini + ruído para a IA). O WhatsApp não
trata isso (sem teto, sem parada por silêncio, sem aviso); aqui queremos um
degrau a mais.

## Decisão

### Interação (só toque; mouse tem caminho próprio)

- **Segurar** o microfone → grava (`micEstado = 'segurando'`). A barra do
  composer vira vermelha com ponto piscando, cronômetro e a dica
  "Solte p/ enviar · arraste ↑ trava". Um trilho com cadeado aparece acima do
  botão.
- **Soltar sem arrastar** → encerra e **adiciona o áudio como entrada**.
- **Arrastar o dedo ↑** além de `LIMIAR_TRAVAR_PX` (56 px) → **trava**
  (`micEstado = 'travado'`): pode soltar o dedo, a gravação continua. A barra
  passa a mostrar onda animada + cronômetro, com **lixeira** (descartar) à
  esquerda e **pausar/retomar** + **enviar** à direita.
- **Pausar/retomar** (só no modo travado): `MediaRecorder.pause()/resume()`
  nativos — o Blob final continua contínuo, sem o trecho pausado. O cronômetro
  desconta o tempo parado (`criarRelogioGravacao` soma só os segmentos ativos),
  então o aviso de 3 min e a `duracaoSegundos` da entrada usam tempo ativo. O
  botão some se o navegador não expõe `pause` (`suportaPausa`).
- **Toque < 400 ms** (`DURACAO_MINIMA_MS`) → descarta (esbarrão no botão).
- **Mouse** (desktop, só não pode quebrar): o `pointerdown` já entra em
  `'travado'` — segurar o botão do mouse para gravar é ruim no desktop.
- **Teclado**: Enter/Espaço no microfone inicia direto em `'travado'` (o gesto
  de arraste é inacessível; travado é tudo botão).

**Cortado de propósito** o "arrastar ← para cancelar" do WhatsApp antigo: hoje
some rápido demais para ser descoberto, e a lixeira do modo travado já cobre o
cancelamento. Descartar continua também no botão "Descartar" do registro
inteiro.

Um `suprimirCliqueAte` (janela de ~600 ms, `@click.capture` na `.composer-row`)
engole o clique-fantasma que o navegador sintetiza ao soltar o dedo logo depois
de travar / ao clicar com o mouse — senão o mesmo gesto que começa dispararia
"enviar".

### Aviso de gravação longa (item 1 de 3)

Aos **3 min** (`AVISO_GRAVACAO_LONGA_MS`), em qualquer um dos modos: a barra
fica **âmbar**, o texto vira "Gravação longa (3 min)" e um `navigator.vibrate(30)`
avisa sem exigir olhar a tela. **Não bloqueia, não corta, não salva** — só
informa.

**Ficaram para depois** (mesma ADR, não implementados):
- **Item 2** — teto rígido (~8 min) com **auto-salvamento**: para sozinho, o
  áudio vira entrada, toast "gravação encerrada — toque no microfone para
  continuar". Não é destrutivo (cada áudio é uma entrada e o pipeline concatena
  na ordem).
- **Item 3** — escalonamento visual do aviso entre 3 e 8 min.
- Onda de áudio **real** (amplitude via `AnalyserNode`) e preview antes de
  enviar. A onda do modo travado hoje é decorativa.

### Onde fica

- `frontend/src/utils/gravacaoVoz.js` — helpers puros e testados
  (`resolverGesto`, `progressoTravar`, `estadoDuracao`, `formatarCronometro`,
  `criarRelogioGravacao` + constantes).
- `frontend/src/views/captura/CapturaView.vue` — máquina de estados
  (`idle | segurando | travado`) + `gravacaoPausada`, handlers de pointer com
  `setPointerCapture`, o novo template do composer e a região `aria-live`.
- `frontend/src/assets/mobile.css` — trilho do cadeado, ponto piscando, onda,
  botões lixeira/pausa, estado âmbar, `@media (prefers-reduced-motion: reduce)`.
- `frontend/src/offline/recorder.js` — +`pausar()` / `retomar()`
  (`MediaRecorder.pause/resume`).

Vale para os dois tipos de Registro (`atendimento` e `avaliacao_fisica`) —
é o mesmo composer, um único `criarGravador()`.

## Alternativas consideradas

- **Toque-para-travar (tap = trava, segurar = push-to-talk).** Zero arraste,
  ótimo para mãos ocupadas, mas não é o WhatsApp — o usuário-alvo teria que
  reaprender. Rejeitada a pedido do product owner (familiaridade > economia de
  gesto).
- **Só toggle (tocar inicia / tocar para).** Mais simples, resolve as mãos
  ocupadas, mas perde o push-to-talk rápido para uma nota curta e, de novo,
  diverge do WhatsApp.
- **Modal "toque para continuar" ao passar de 5 min.** Interrompe o ditado real
  no pior momento (mãos na fita). Trocado pelo aviso passivo + (futuro) teto com
  auto-salvamento, que protege o mesmo cenário sem bloquear.
- **Slide ← para cancelar** (WhatsApp clássico). Cortado: baixa descoberta, a
  lixeira do modo travado resolve.

## Consequências

- A gravação de voz agora tem **três estados** (`micEstado`) + `gravacaoPausada`
  em vez de um booleano; qualquer mudança no composer precisa considerar isso.
- A duração da gravação deixou de ser `Date.now() - inicio` e passou pelo
  `criarRelogioGravacao` (soma só segmentos ativos) — quem precisar do tempo da
  gravação usa `relogioGravacao.decorridoMs()`, nunca um timestamp cru.
- `setPointerCapture` passa a ser dependência da interação (suportado em todos os
  navegadores-alvo do PWA; degradação: sem captura o gesto ainda funciona, só
  fica menos tolerante ao dedo saindo do botão).
- O gesto de arraste é **inacessível** por natureza — mitigado: modo travado é
  100% botão, teclado inicia travado, `aria-live` narra as transições.
- O aviso de 3 min é só visual/háptico; **não há garantia** contra o áudio
  gigante até o item 2 existir.
- `prefers-reduced-motion` ganhou o primeiro bloco de tratamento do projeto
  (piscar do ponto e onda viram estáticos).
