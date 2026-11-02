"use strict";

const { Op } = require("sequelize");
const { AvaliacaoMensal, Aluno, Registro, Validacao, RevisaoAvaliacaoMensal } = require("../models");

// Resumo da revisão do personal (docs/adr/0023) - o suficiente para a tela de
// Acompanhamento sinalizar "compartilhada" / "revisão desatualizada" sem uma
// segunda chamada. O comentário completo só vem no endpoint de compartilhamento.
// `textos_editados` vem para o selo "texto ajustado" e o aviso antes de regerar.
const INCLUDE_REVISAO = {
  model: RevisaoAvaliacaoMensal,
  as: "revisao",
  attributes: ["id", "compartilhada_em", "avaliacao_gerada_em", "textos_editados"]
};

function listarPorAluno({ alunoId, equipeId }) {
  return AvaliacaoMensal.findAll({
    where: { aluno_id: alunoId, equipe_id: equipeId },
    include: [INCLUDE_REVISAO],
    order: [["ano_mes", "DESC"]]
  });
}

function obterPorMes({ alunoId, equipeId, anoMes }) {
  return AvaliacaoMensal.findOne({
    where: { aluno_id: alunoId, equipe_id: equipeId, ano_mes: anoMes },
    include: [
      { model: AvaliacaoMensal, as: "contextoAnterior", attributes: ["id", "ano_mes"] },
      INCLUDE_REVISAO
    ]
  });
}

// Última avaliação de um mês ESTRITAMENTE anterior a `anoMes` (comparação
// lexicográfica funciona no formato "YYYY-MM"). Fornece o contexto
// consolidado que entra no ciclo atual - qualquer status serve, inclusive
// "dados_insuficientes" ou "falha" carregam o contexto anterior adiante
// (docs/adr/0015).
function obterAnteriorAoMes({ alunoId, anoMes }) {
  return AvaliacaoMensal.findOne({
    where: { aluno_id: alunoId, ano_mes: { [Op.lt]: anoMes } },
    order: [["ano_mes", "DESC"]]
  });
}

// Relatos (Registros) confirmados do aluno cujo ATENDIMENTO caiu no mês
// [inicioData, fimData] (docs/adr/0015, adendo 2026-11-02): o critério é
// `registro.data_atendimento` (docs/adr/0019), não a data da confirmação -
// relato de outubro confirmado em novembro conta em outubro. Relato que chega
// depois de o mês já ter sido gerado fica fora até o personal regerar (a tela
// avisa comparando com `baseada_em_registro_ids`).
function listarRelatosConfirmadosNoMes({ equipeId, alunoId, inicioData, fimData }) {
  return Registro.findAll({
    where: {
      equipe_id: equipeId,
      aluno_id: alunoId,
      status: Registro.STATUS.CONFIRMADO,
      deletado_em: null,
      data_atendimento: { [Op.between]: [inicioData, fimData] }
    },
    include: [{ model: Validacao, as: "validacao", required: true }],
    order: [
      ["data_atendimento", "ASC"],
      ["created_at", "ASC"]
    ]
  });
}

// docs/adr/0015: a avaliação mensal NÃO é dado oficial - regenerar
// simplesmente sobrescreve a linha do mês (unicidade aluno_id/ano_mes).
async function salvar(dados) {
  const [avaliacao] = await AvaliacaoMensal.findOrCreate({
    where: { aluno_id: dados.aluno_id, ano_mes: dados.ano_mes },
    defaults: dados
  });
  return avaliacao.update({ ...dados, gerada_em: new Date() });
}

// Alvos do job mensal - alunos ativos (inativos/excluídos ficam de fora).
function listarAlunosAtivos() {
  return Aluno.findAll({
    where: { ativo: true, deletado_em: null },
    attributes: ["id", "equipe_id"]
  });
}

module.exports = {
  listarPorAluno,
  obterPorMes,
  obterAnteriorAoMes,
  listarRelatosConfirmadosNoMes,
  salvar,
  listarAlunosAtivos
};
