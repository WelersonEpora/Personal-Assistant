"use strict";

const { Op } = require("sequelize");
const { Exercicio } = require("../models");

// Visível para a equipe = global (equipe_id NULL) ou próprio da equipe
// (docs/adr/0013) - critério repetido em todo lookup de leitura/uso.
function condicaoVisivel(equipeId) {
  return { [Op.or]: [{ equipe_id: null }, { equipe_id: equipeId }] };
}

function findAllVisiveisParaEquipe(equipeId) {
  return Exercicio.findAll({
    where: { ...condicaoVisivel(equipeId), deletado_em: null },
    order: [
      ["ativo", "DESC"],
      ["nome", "ASC"]
    ]
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

module.exports = {
  findAllVisiveisParaEquipe,
  findByIdVisivelParaEquipe,
  findByIdProprioDaEquipe,
  findSelecionaveisPorIds,
  create,
  update,
  marcarComoExcluido
};
