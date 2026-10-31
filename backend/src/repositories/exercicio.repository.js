"use strict";

const { Op } = require("sequelize");
const { Exercicio, ExercicioApelido } = require("../models");

// Visível para a equipe = global (equipe_id NULL) ou próprio da equipe
// (docs/adr/0013) - critério repetido em todo lookup de leitura/uso.
function condicaoVisivel(equipeId) {
  return { [Op.or]: [{ equipe_id: null }, { equipe_id: equipeId }] };
}

// Apelidos visíveis (docs/adr/0027) = os globais do exercício + os da
// própria equipe - nunca os que outra equipe deu ao mesmo exercício global.
function includeApelidos(equipeId) {
  return {
    model: ExercicioApelido,
    as: "apelidos",
    required: false,
    attributes: ["id", "apelido", "equipe_id"],
    where: condicaoVisivel(equipeId)
  };
}

const ORDEM_APELIDOS = [{ model: ExercicioApelido, as: "apelidos" }, "apelido", "ASC"];

function findAllVisiveisParaEquipe(equipeId) {
  return Exercicio.findAll({
    where: { ...condicaoVisivel(equipeId), deletado_em: null },
    include: [includeApelidos(equipeId)],
    order: [["ativo", "DESC"], ["nome", "ASC"], ORDEM_APELIDOS]
  });
}

function findByIdComApelidos(id, equipeId) {
  return Exercicio.findOne({
    where: { id, ...condicaoVisivel(equipeId), deletado_em: null },
    include: [includeApelidos(equipeId)],
    order: [ORDEM_APELIDOS]
  });
}

function findByIdVisivelParaEquipe(id, equipeId) {
  return Exercicio.findOne({ where: { id, ...condicaoVisivel(equipeId), deletado_em: null } });
}

// Só exercícios próprios da equipe podem ser editados/excluídos - os
// globais (equipe_id NULL) nunca aparecem aqui (docs/adr/0013: "Personal
// pode usar os globais, mas não editá-los").
function findByIdProprioDaEquipe(id, equipeId) {
  return Exercicio.findOne({ where: { id, equipe_id: equipeId, deletado_em: null } });
}

// Só exercícios ativos podem ser selecionados para uma NOVA ficha de treino
// - um exercício marcado inativo continua existindo e resolvendo
// normalmente nos itens de fichas antigas que já o referenciam (essa busca
// aqui só é usada na validação de criação de uma nova versão da ficha).
function findSelecionaveisPorIds(ids, equipeId) {
  return Exercicio.findAll({ where: { id: ids, ...condicaoVisivel(equipeId), ativo: true, deletado_em: null } });
}

// Imagem não entra aqui - é sempre upload separado (POST /exercicios/:id/imagem),
// só possível depois que o exercício já existe (mesmo critério de aluno/foto).
function create({ equipeId, nome, grupoMuscular, equipamento, dificuldade, instrucoes, midiaVideoUrl }) {
  return Exercicio.create({
    equipe_id: equipeId,
    nome,
    grupo_muscular: grupoMuscular || null,
    equipamento: equipamento || null,
    dificuldade: dificuldade || null,
    instrucoes: instrucoes || null,
    midia_video_url: midiaVideoUrl || null
  });
}

async function update(exercicio, dados) {
  return exercicio.update(dados);
}

function marcarComoExcluido(exercicio) {
  return exercicio.update({ deletado_em: new Date() });
}

// Nomes que a equipe enxerga, para conferir ambiguidade de um apelido novo
// (docs/adr/0027). O catálogo é pequeno (centenas), então a comparação
// normalizada dos nomes é feita no service, em JS.
function listarNomesVisiveis(equipeId) {
  return Exercicio.findAll({
    where: { ...condicaoVisivel(equipeId), deletado_em: null },
    attributes: ["id", "nome"],
    raw: true
  });
}

function findApelidosVisiveisPorNormalizado(equipeId, apelidoNormalizado) {
  return ExercicioApelido.findAll({
    where: { ...condicaoVisivel(equipeId), apelido_normalizado: apelidoNormalizado },
    include: [{ model: Exercicio, as: "exercicio", attributes: ["id", "nome"], where: { deletado_em: null } }]
  });
}

function criarApelido({ exercicioId, equipeId, apelido, apelidoNormalizado }) {
  return ExercicioApelido.create({
    exercicio_id: exercicioId,
    equipe_id: equipeId,
    apelido,
    apelido_normalizado: apelidoNormalizado
  });
}

// Só apelido da própria equipe - o global (equipe_id NULL) nunca é removível.
function findApelidoDaEquipe({ id, exercicioId, equipeId }) {
  return ExercicioApelido.findOne({ where: { id, exercicio_id: exercicioId, equipe_id: equipeId } });
}

function removerApelido(apelido) {
  return apelido.destroy();
}

module.exports = {
  findAllVisiveisParaEquipe,
  findByIdComApelidos,
  findByIdVisivelParaEquipe,
  findByIdProprioDaEquipe,
  findSelecionaveisPorIds,
  create,
  update,
  marcarComoExcluido,
  listarNomesVisiveis,
  findApelidosVisiveisPorNormalizado,
  criarApelido,
  findApelidoDaEquipe,
  removerApelido
};
