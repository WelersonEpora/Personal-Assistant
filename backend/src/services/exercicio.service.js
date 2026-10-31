"use strict";

const exercicioRepository = require("../repositories/exercicio.repository");
const storageExercicioImagem = require("./storage-exercicio-imagem.service");
const { Exercicio } = require("../models");
const { NotFoundError, ValidationError, ConflictError } = require("../shared/errors");
const { normalizarTexto } = require("../shared/utils/texto");

function validarDificuldade(dificuldade) {
  if (dificuldade !== undefined && dificuldade !== null && dificuldade !== "" && !Exercicio.DIFICULDADES.includes(dificuldade)) {
    throw new ValidationError(`"dificuldade" precisa ser uma das opções: ${Exercicio.DIFICULDADES.join(", ")}.`);
  }
}

async function listExercicios(equipeId) {
  return exercicioRepository.findAllVisiveisParaEquipe(equipeId);
}

async function getExercicio(equipeId, id) {
  const exercicio = await exercicioRepository.findByIdVisivelParaEquipe(id, equipeId);
  if (!exercicio) {
    throw new NotFoundError("Exercício não encontrado.");
  }
  return exercicio;
}

// getExercicio usa "visível" (global ou próprio) - já cobre autorização de
// leitura. Exclusão exige posse: getExercicioProprio (só próprio) - apagar
// um exercício global afeta todas as equipes do sistema, isso continua
// bloqueado sem pedido explícito à parte.
async function getExercicioProprio(equipeId, id) {
  const exercicio = await exercicioRepository.findByIdProprioDaEquipe(id, equipeId);
  if (!exercicio) {
    // Mesma mensagem tanto para "não existe" quanto para "é global ou de
    // outra equipe" - não revela a diferença (mesmo critério de aluno).
    throw new NotFoundError("Exercício não encontrado, ou não pertence à sua equipe.");
  }
  return exercicio;
}

// TEMPORÁRIO: edição (nome/grupo/equipamento/dificuldade/instruções/vídeo/
// imagem/ativo) liberada também para exercícios GLOBAIS, não só próprios -
// pedido explícito para um personal parceiro revisar e corrigir o catálogo
// global (docs/adr/0013 seed inicial). docs/adr/0013 continua dizendo que
// globais não são editáveis "em regra"; isto é uma exceção datada, não uma
// revogação da ADR. Reverter para getExercicioProprio (mesmo critério de
// excluirExercicio) quando a revisão terminar.
async function getExercicioEditavel(equipeId, id) {
  return getExercicio(equipeId, id);
}

async function createExercicio(equipeId, { nome, grupoMuscular, equipamento, dificuldade, instrucoes, midiaVideoUrl }) {
  if (!nome || !nome.trim()) {
    throw new ValidationError('"nome" é obrigatório.');
  }
  validarDificuldade(dificuldade);

  // Personal só cria exercícios próprios da equipe - nunca globais
  // (docs/adr/0013: catálogo global é alimentado só por seed do sistema).
  // Imagem não entra na criação - só via upload separado, depois que o
  // exercício já existe (mesmo critério de aluno/foto).
  return exercicioRepository.create({
    equipeId,
    nome: nome.trim(),
    grupoMuscular,
    equipamento,
    dificuldade,
    instrucoes,
    midiaVideoUrl
  });
}

async function updateExercicio(equipeId, id, dados) {
  const exercicio = await getExercicioEditavel(equipeId, id);

  const atualizacao = {};
  if (dados.nome !== undefined) {
    if (!dados.nome || !dados.nome.trim()) {
      throw new ValidationError('"nome" não pode ficar vazio.');
    }
    atualizacao.nome = dados.nome.trim();
  }
  if (dados.grupoMuscular !== undefined) atualizacao.grupo_muscular = dados.grupoMuscular || null;
  if (dados.equipamento !== undefined) atualizacao.equipamento = dados.equipamento || null;
  if (dados.dificuldade !== undefined) {
    validarDificuldade(dados.dificuldade);
    atualizacao.dificuldade = dados.dificuldade || null;
  }
  if (dados.instrucoes !== undefined) atualizacao.instrucoes = dados.instrucoes || null;
  if (dados.midiaVideoUrl !== undefined) atualizacao.midia_video_url = dados.midiaVideoUrl || null;
  if (dados.ativo !== undefined) atualizacao.ativo = Boolean(dados.ativo);

  return exercicioRepository.update(exercicio, atualizacao);
}

// Soft-delete (docs/adr/0013): itens de fichas de treino que já usam este
// exercício continuam resolvendo os dados normalmente (a linha só ganha
// deletado_em, nunca é removida fisicamente).
async function excluirExercicio(equipeId, id) {
  const exercicio = await getExercicioProprio(equipeId, id);
  await exercicioRepository.marcarComoExcluido(exercicio);
}

const POSICOES_VALIDAS = ["inicio", "fim"];
const CAMPO_POR_POSICAO = { inicio: "midia_imagem_inicio_caminho", fim: "midia_imagem_fim_caminho" };

function validarPosicao(posicao) {
  if (!POSICOES_VALIDAS.includes(posicao)) {
    throw new ValidationError('"posicao" precisa ser "inicio" ou "fim".');
  }
}

// Duas imagens por exercício (posição inicial/final do movimento). Mesma
// autorização TEMPORÁRIA de updateExercicio acima (getExercicioEditavel) -
// upload liberado também para globais enquanto durar a revisão do catálogo.
async function atualizarImagem(equipeId, id, posicao, { buffer, mimeType }) {
  validarPosicao(posicao);
  const exercicio = await getExercicioEditavel(equipeId, id);
  if (!storageExercicioImagem.mimeSuportado(mimeType)) {
    throw new ValidationError("Formato de imagem não suportado - use JPEG, PNG ou WebP.");
  }
  const caminho = await storageExercicioImagem.salvar({ chave: `exercicio-${id}-${posicao}`, buffer, mimeType });
  return exercicioRepository.update(exercicio, { [CAMPO_POR_POSICAO[posicao]]: caminho });
}

// Leitura usa "visível" (global ou próprio) - qualquer equipe pode ver a
// imagem de um exercício global, só não pode trocá-la.
async function obterImagem(equipeId, id, posicao) {
  validarPosicao(posicao);
  const exercicio = await getExercicio(equipeId, id);
  const caminho = exercicio[CAMPO_POR_POSICAO[posicao]];
  if (!caminho) {
    throw new NotFoundError("Exercício não tem essa imagem cadastrada.");
  }
  return storageExercicioImagem.ler(caminho);
}

async function removerImagem(equipeId, id, posicao) {
  validarPosicao(posicao);
  const exercicio = await getExercicioEditavel(equipeId, id);
  const campo = CAMPO_POR_POSICAO[posicao];
  if (!exercicio[campo]) {
    throw new NotFoundError("Exercício não tem essa imagem cadastrada.");
  }
  await storageExercicioImagem.remover(exercicio[campo]);
  return exercicioRepository.update(exercicio, { [campo]: null });
}

// ----------------------------------------------------------- apelidos
// docs/adr/0027: qualquer membro dá apelido a um exercício visível (global
// ou próprio) - o apelido é da equipe, o exercício global continua intacto.

const TAMANHO_MAXIMO_APELIDO = 120;

// Um nome ou apelido aponta para UM exercício só, no que a equipe enxerga -
// senão a busca e a interpretação por voz não saberiam qual escolher.
async function conferirAmbiguidade(equipeId, exercicio, apelidoNormalizado) {
  if (normalizarTexto(exercicio.nome) === apelidoNormalizado) {
    throw new ConflictError(`"${exercicio.nome}" já é o nome deste exercício.`);
  }

  const nomes = await exercicioRepository.listarNomesVisiveis(equipeId);
  const mesmoNome = nomes.find((outro) => outro.id !== exercicio.id && normalizarTexto(outro.nome) === apelidoNormalizado);
  if (mesmoNome) {
    throw new ConflictError(`Já existe um exercício chamado "${mesmoNome.nome}".`, { exercicioId: mesmoNome.id });
  }

  const [existente] = await exercicioRepository.findApelidosVisiveisPorNormalizado(equipeId, apelidoNormalizado);
  if (existente) {
    const mensagem = existente.exercicio_id === exercicio.id
      ? `"${existente.apelido}" já é apelido deste exercício.`
      : `"${existente.apelido}" já é apelido de "${existente.exercicio.nome}".`;
    throw new ConflictError(mensagem, { exercicioId: existente.exercicio_id });
  }
}

async function adicionarApelido(equipeId, exercicioId, { apelido }) {
  const texto = String(apelido ?? "").replace(/\s+/g, " ").trim();
  if (!texto) {
    throw new ValidationError('"apelido" é obrigatório.');
  }
  if (texto.length > TAMANHO_MAXIMO_APELIDO) {
    throw new ValidationError(`"apelido" pode ter no máximo ${TAMANHO_MAXIMO_APELIDO} caracteres.`);
  }

  const exercicio = await getExercicio(equipeId, exercicioId);
  const apelidoNormalizado = normalizarTexto(texto);
  await conferirAmbiguidade(equipeId, exercicio, apelidoNormalizado);

  try {
    await exercicioRepository.criarApelido({ exercicioId, equipeId, apelido: texto, apelidoNormalizado });
  } catch (err) {
    // Corrida entre dois cadastros do mesmo apelido - uq_exercicio_apelido_equipe.
    if (err.name === "SequelizeUniqueConstraintError") {
      throw new ConflictError(`"${texto}" já é apelido de outro exercício da sua equipe.`);
    }
    throw err;
  }
  return exercicioRepository.findByIdComApelidos(exercicioId, equipeId);
}

async function removerApelido(equipeId, exercicioId, apelidoId) {
  const apelido = await exercicioRepository.findApelidoDaEquipe({ id: apelidoId, exercicioId, equipeId });
  if (!apelido) {
    // Inclui o apelido global - não é removível por equipe nenhuma.
    throw new NotFoundError("Apelido não encontrado, ou não pertence à sua equipe.");
  }
  await exercicioRepository.removerApelido(apelido);
  return exercicioRepository.findByIdComApelidos(exercicioId, equipeId);
}

module.exports = {
  adicionarApelido,
  removerApelido,
  listExercicios,
  getExercicio,
  createExercicio,
  updateExercicio,
  excluirExercicio,
  atualizarImagem,
  obterImagem,
  removerImagem
};
