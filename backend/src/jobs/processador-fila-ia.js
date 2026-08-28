"use strict";

// Fila em memória, em processo (docs/adr/0009-processamento-assincrono-em-
// processo.md). Sem Redis/BullMQ no MVP: um array + um worker sequencial já
// resolve o problema real (reagir a cada sincronização quase em tempo real,
// sem bloquear a resposta HTTP de POST /registros/:id/sincronizar).
const registroRepository = require("../repositories/registro.repository");
const propostaAvaliacaoFisicaRepository = require("../repositories/proposta-avaliacao-fisica.repository");
const avaliacaoFisicaRepository = require("../repositories/avaliacaoFisica.repository");
const storageAudio = require("../services/storage-audio.service");
const geminiService = require("../services/ia/gemini.service");
const env = require("../config/env");
const logger = require("../shared/logger");

const { Registro } = registroRepository;

const fila = [];
let processando = false;

function enfileirarRegistro(registroId) {
  if (!fila.includes(registroId)) {
    fila.push(registroId);
  }
  processarProximo();
}

function processarProximo() {
  if (processando) return;
  const registroId = fila.shift();
  if (!registroId) return;

  processando = true;
  processarRegistro(registroId)
    .catch((err) => {
      logger.error({ err, registroId }, "[processador-fila-ia] falha ao processar Registro");
    })
    .finally(() => {
      processando = false;
      if (fila.length) processarProximo();
    });
}

function montarContextoConsolidado(entradas) {
  return entradas
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((entrada) => {
      if (entrada.tipo === "texto") {
        return `- (texto) ${entrada.conteudo_texto}`;
      }
      const texto = entrada.arquivoAudio?.transcricao?.texto;
      return `- (áudio transcrito) ${texto || "[transcrição indisponível]"}`;
    })
    .join("\n");
}

// docs/adr/0019: o interpretador de relato recebe a data do atendimento como
// cabeçalho não-normativo - ajuda a IA a resolver "ontem", "na segunda" ditos
// no relato quando a captura foi feita depois. Não se aplica à avaliação
// física (o interpretador de lá extrai `data_ouvida` só do que foi dito -
// ADR-0018).
function comCabecalhoDeData(contexto, dataAtendimento) {
  if (!dataAtendimento) return contexto;
  return `Data do atendimento: ${dataAtendimento}\n\n${contexto}`;
}

async function transcreverEntradasDeAudio(registroId, entradas) {
  for (const entrada of entradas) {
    if (entrada.tipo !== "audio" || !entrada.arquivoAudio) continue;
    if (entrada.arquivoAudio.transcricao?.status === "concluida") continue;

    try {
      const buffer = await storageAudio.ler(entrada.arquivoAudio.caminho_armazenamento);
      const texto = await geminiService.transcreverAudio({ buffer, mimeType: entrada.arquivoAudio.mime_type });
      await registroRepository.salvarTranscricao(entrada.arquivoAudio.id, { texto, status: "concluida", erro: null });
    } catch (err) {
      await registroRepository.salvarTranscricao(entrada.arquivoAudio.id, { status: "falha", erro: err.message });
      await registroRepository.atualizarStatus(registroId, Registro.STATUS.ERRO_TRANSCRICAO);
      throw err;
    }
  }
}

// docs/adr/0018: Registro `tipo = avaliacao_fisica`. Bifurca depois da
// transcrição - em vez de interpretarRegistro (itens[] livres), roda o
// interpretador do catálogo fechado e grava uma PROPOSTA (nunca dado oficial;
// a avaliacao_fisica só nasce da confirmação humana, via avaliacao-fisica.service).
async function interpretarAvaliacaoFisica(registroId) {
  const registro = await registroRepository.obterParaProcessamento(registroId);
  const contexto = montarContextoConsolidado(registro.entradas);
  const catalogo = await avaliacaoFisicaRepository.listarCatalogo();

  await registroRepository.atualizarStatus(registroId, Registro.STATUS.INTERPRETANDO);
  try {
    const proposta = await geminiService.interpretarAvaliacaoFisica({ contextoConsolidado: contexto, catalogo });
    await propostaAvaliacaoFisicaRepository.salvarProposta(registroId, {
      payload_json: {
        data_ouvida: proposta.dataOuvida,
        medidas: proposta.medidas,
        observacoes: proposta.observacoes
      },
      avisos_json: proposta.naoMapeado,
      status: "concluido",
      erro: null,
      modelo: env.gemini.model
    });
    await registroRepository.atualizarStatus(registroId, Registro.STATUS.AGUARDANDO_REVISAO);
  } catch (err) {
    await propostaAvaliacaoFisicaRepository.salvarProposta(registroId, { status: "falha", erro: err.message });
    await registroRepository.atualizarStatus(registroId, Registro.STATUS.ERRO_INTERPRETACAO);
    throw err;
  }
}

async function interpretarConteudoConsolidado(registroId) {
  const registroAtualizado = await registroRepository.obterParaProcessamento(registroId);
  const contexto = comCabecalhoDeData(
    montarContextoConsolidado(registroAtualizado.entradas),
    registroAtualizado.data_atendimento
  );

  await registroRepository.atualizarStatus(registroId, Registro.STATUS.INTERPRETANDO);
  try {
    const { itens, notaGeral } = await geminiService.interpretarRegistro({ contextoConsolidado: contexto });
    await registroRepository.salvarResultadoIa(registroId, {
      payload_json: { itens, notaGeral },
      status: "concluido",
      erro: null,
      modelo: env.gemini.model
    });
    await registroRepository.atualizarStatus(registroId, Registro.STATUS.AGUARDANDO_REVISAO);
  } catch (err) {
    await registroRepository.salvarResultadoIa(registroId, { status: "falha", erro: err.message });
    await registroRepository.atualizarStatus(registroId, Registro.STATUS.ERRO_INTERPRETACAO);
    throw err;
  }
}

async function processarRegistro(registroId) {
  const registro = await registroRepository.obterParaProcessamento(registroId);
  if (!registro) return;

  await registroRepository.atualizarStatus(registroId, Registro.STATUS.TRANSCREVENDO);
  await transcreverEntradasDeAudio(registroId, registro.entradas);

  // docs/adr/0018 - a transcrição é igual para os dois tipos; só a
  // interpretação bifurca.
  if (registro.tipo === Registro.TIPOS.AVALIACAO_FISICA) {
    await interpretarAvaliacaoFisica(registroId);
  } else {
    await interpretarConteudoConsolidado(registroId);
  }
}

async function reenfileirarRegistrosPendentes() {
  const pendentes = await registroRepository.listarIdsEmProcessamento();
  pendentes.forEach(enfileirarRegistro);
  if (pendentes.length) {
    logger.info({ quantidade: pendentes.length }, "[processador-fila-ia] Registros pendentes reenfileirados na inicialização");
  }
}

module.exports = { enfileirarRegistro, reenfileirarRegistrosPendentes, montarContextoConsolidado, processarRegistro };
