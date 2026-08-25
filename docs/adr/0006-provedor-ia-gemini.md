# ADR-0006: Provedor de IA — Google Gemini para transcrição e interpretação

**Status:** Aceita (2026-08-25)

## Contexto

Depois da sincronização, cada Registro precisa passar por transcrição dos
áudios e, em seguida, interpretação do conteúdo consolidado (áudios
transcritos + textos digitados) em um JSON estruturado (seção 4 do pedido).
Isso exige escolher um provedor de IA — decisão validada explicitamente com
o usuário antes de qualquer implementação, por alterar significativamente o
desenho do backend.

A API de Mensagens da Anthropic (Claude) aceita texto, imagem e PDF como
entrada, mas **não aceita áudio** — não é possível usar Claude sozinho para
transcrição. Usá-lo exigiria um serviço de speech-to-text totalmente à
parte (ex.: OpenAI Whisper API) só para gerar o texto que o Claude depois
interpretaria: dois provedores, duas integrações, dois pontos de falha.

## Decisão

**Google Gemini** (`@google/genai`, a mesma biblioteca já usada no
AgroMind) como único provedor de IA do pipeline, para os dois passos:

1. **Transcrição**: cada `arquivo_audio` do Registro é enviado ao Gemini
   (áudio inline no request) com instrução de transcrever literalmente em
   português — grava-se o resultado em `transcricao.texto`.
2. **Interpretação**: o contexto consolidado do Registro (todas as
   entradas, na ordem original — texto digitado e áudios já transcritos) é
   enviado em uma única chamada ao Gemini, com **saída estruturada**
   (`responseSchema`) pedindo a lista de itens (`label`, `valor`, `obs`,
   `confidence`) e uma nota geral — grava-se em
   `resultado_ia.payload_json`.

O prompt de interpretação inclui, de forma explícita, a instrução de **não
inventar informação que não esteja no texto fornecido** — requisito direto
da seção 4 do pedido ("Não inventar informações que não estejam presentes").

## Alternativas consideradas

- **Claude (Anthropic) para interpretação + Whisper (OpenAI) para
  transcrição.** Rejeitada pelo usuário — exigiria manter credenciais e
  integrações de dois provedores diferentes para cobrir um único pipeline,
  sem ganho compensador em qualidade para este MVP.
- **OpenAI (Whisper + GPT) para os dois passos.** Rejeitada — mesma
  desvantagem de precisar de duas chamadas/dois modelos onde o Gemini
  resolve em um fluxo só, além de divergir do provedor já em uso no
  AgroMind.
- **Um único call multimodal ao Gemini** (áudio bruto direto para
  interpretação, sem gravar a transcrição como passo isolado). Rejeitada —
  o pedido lista explicitamente "transcrição" como uma entidade própria do
  MVP (seção 7) e a tela de revisão do desktop precisa mostrar as
  "entradas originais" (transcrição de cada áudio) separadamente do
  resultado interpretado (seção 6) — manter os dois passos como chamadas
  distintas, cada uma persistida, dá essa rastreabilidade sem custo real
  adicional relevante.

## Consequências

- Uma única variável de ambiente sensível para o pipeline de IA
  (`GEMINI_API_KEY`), um único serviço (`services/ia/gemini.service.js`) a
  manter.
- A qualidade da transcrição e da interpretação depende inteiramente das
  capacidades multimodais do Gemini para português falado em contexto de
  academia/treino — se a qualidade não for suficiente na prática, é uma
  revisão futura desta ADR (não deste MVP).
- Chamadas ao Gemini têm custo e latência; o pipeline roda de forma
  assíncrona depois da sincronização (ver ADR-0009), nunca bloqueando a
  resposta HTTP do endpoint de sincronização.
