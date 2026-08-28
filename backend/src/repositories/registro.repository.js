"use strict";

const {
  sequelize,
  Registro,
  RegistroEntrada,
  ArquivoAudio,
  Transcricao,
  ResultadoIa,
  Validacao,
  PropostaAvaliacaoFisica,
  AvaliacaoFisica,
  Aluno
} = require("../models");

const INCLUDE_ENTRADAS_COMPLETO = {
  model: RegistroEntrada,
  as: "entradas",
  include: [
    {
      model: ArquivoAudio,
      as: "arquivoAudio",
      include: [{ model: Transcricao, as: "transcricao" }]
    }
  ]
};

// docs/adr/0005-estrategia-sincronizacao.md: idempotência pelo id gerado no
// cliente - se o Registro já existe, devolve o existente sem sobrescrever
// nada (reenvio seguro). "criado" avisa o chamador se é a 1a vez que este
// Registro chega ao servidor (só nesse caso ele deve entrar na fila de IA).
async function obterOuCriarRegistro(
  { id, usuarioId, equipeId, alunoId, titulo, iniciadoEm, dataAtendimento, tipo },
  transaction
) {
  const [registro, criado] = await Registro.findOrCreate({
    where: { id },
    // `tipo` e `data_atendimento` só entram no INSERT da 1a vez (docs/adr/0018
    // e 0019 - `data_atendimento` é imutável no cliente após a finalização;
    // só o desktop a altera depois). Reenvio devolve o Registro existente sem
    // tocar em nada.
    defaults: {
      usuario_id: usuarioId,
      equipe_id: equipeId,
      aluno_id: alunoId,
      titulo: titulo || null,
      iniciado_em: iniciadoEm,
      data_atendimento: dataAtendimento || new Date(iniciadoEm).toISOString().slice(0, 10),
      tipo: tipo || "atendimento"
    },
    transaction
  });
  return { registro, criado };
}

// Unicidade (registro_id, ordem) no banco garante que reenviar a mesma
// entrada nunca duplica - findOrCreate só insere na 1a vez.
async function obterOuCriarEntrada({ registroId, ordem, tipo, conteudoTexto, duracaoSegundos }, transaction) {
  const [entrada] = await RegistroEntrada.findOrCreate({
    where: { registro_id: registroId, ordem },
    defaults: { tipo, conteudo_texto: conteudoTexto ?? null, duracao_segundos: duracaoSegundos ?? null },
    transaction
  });
  return entrada;
}

async function entradaTemArquivoAudio(entradaId, transaction) {
  const existente = await ArquivoAudio.findOne({ where: { registro_entrada_id: entradaId }, transaction });
  return Boolean(existente);
}

async function criarArquivoAudio({ registroEntradaId, caminhoArmazenamento, mimeType, tamanhoBytes }, transaction) {
  return ArquivoAudio.create(
    { registro_entrada_id: registroEntradaId, caminho_armazenamento: caminhoArmazenamento, mime_type: mimeType, tamanho_bytes: tamanhoBytes },
    { transaction }
  );
}

// Lista "leve": entradas só com tipo/ordem (sem áudio/transcrição - a tela
// de Relatos só precisa contar 🎙️/⌨️ por Registro) + validação (quando
// confirmado, alimenta a tela de Histórico sem uma 2a chamada por linha).
function listarPorEquipe({ equipeId, status }) {
  return Registro.findAll({
    where: { equipe_id: equipeId, deletado_em: null, ...(status ? { status } : {}) },
    include: [
      { model: Aluno, as: "aluno", attributes: ["id", "nome"] },
      { model: RegistroEntrada, as: "entradas", attributes: ["id", "tipo", "ordem"] },
      { model: Validacao, as: "validacao", attributes: ["id", "confirmado_em", "payload_confirmado_json"] }
    ],
    order: [["created_at", "DESC"]]
  });
}

function obterDetalhado(id) {
  return Registro.findOne({
    where: { id, deletado_em: null },
    include: [
      { model: Aluno, as: "aluno", attributes: ["id", "nome"] },
      INCLUDE_ENTRADAS_COMPLETO,
      { model: ResultadoIa, as: "resultadoIa" },
      { model: Validacao, as: "validacao" },
      // docs/adr/0018 - só preenchidos para tipo = avaliacao_fisica.
      { model: PropostaAvaliacaoFisica, as: "propostaAvaliacaoFisica" },
      { model: AvaliacaoFisica, as: "avaliacaoFisica" }
    ]
  });
}

// Fetch leve (sem includes) usado só para checar posse/status antes de
// excluir - não precisa carregar entradas/resultadoIa/validacao inteiros.
function obterPorIdEquipe({ id, equipeId }) {
  return Registro.findOne({ where: { id, equipe_id: equipeId, deletado_em: null } });
}

// Soft-delete (docs/adr/0007): a checagem de "não confirmado" é
// responsabilidade do service, não daqui - este método só marca.
function marcarComoExcluido({ id, equipeId }) {
  return Registro.update({ deletado_em: new Date() }, { where: { id, equipe_id: equipeId, deletado_em: null } });
}

function obterParaProcessamento(id) {
  return Registro.findByPk(id, { include: [INCLUDE_ENTRADAS_COMPLETO] });
}

function atualizarStatus(registroId, status) {
  return Registro.update({ status }, { where: { id: registroId } });
}

async function salvarTranscricao(arquivoAudioId, dados) {
  const [transcricao] = await Transcricao.findOrCreate({
    where: { arquivo_audio_id: arquivoAudioId },
    defaults: { provedor: "gemini" }
  });
  return transcricao.update(dados);
}

async function salvarResultadoIa(registroId, dados) {
  const [resultado] = await ResultadoIa.findOrCreate({
    where: { registro_id: registroId },
    defaults: { provedor: "gemini" }
  });
  return resultado.update(dados);
}

// Registros que ficaram parados no meio do pipeline (ex.: restart do
// processo) - reenfileirados na inicialização (docs/adr/0009).
function listarIdsEmProcessamento() {
  return Registro.findAll({
    where: { status: [Registro.STATUS.RECEBIDO, Registro.STATUS.TRANSCREVENDO, Registro.STATUS.INTERPRETANDO] },
    attributes: ["id"]
  }).then((linhas) => linhas.map((linha) => linha.id));
}

// Checa posse (equipe_id do Registro dono da entrada) antes de liberar o
// arquivo de áudio - docs/adr/0010, escopo por equipe via docs/adr/0011.
function obterEntradaAudioAutorizada({ equipeId, registroId, entradaId }) {
  return RegistroEntrada.findOne({
    where: { id: entradaId, registro_id: registroId },
    include: [
      { model: ArquivoAudio, as: "arquivoAudio" },
      { model: Registro, as: "registro", attributes: [], where: { equipe_id: equipeId, deletado_em: null } }
    ]
  });
}

module.exports = {
  sequelize,
  Registro,
  obterOuCriarRegistro,
  obterOuCriarEntrada,
  entradaTemArquivoAudio,
  criarArquivoAudio,
  listarPorEquipe,
  obterDetalhado,
  obterPorIdEquipe,
  marcarComoExcluido,
  obterParaProcessamento,
  atualizarStatus,
  salvarTranscricao,
  salvarResultadoIa,
  listarIdsEmProcessamento,
  obterEntradaAudioAutorizada
};
