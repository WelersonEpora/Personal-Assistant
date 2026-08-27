"use strict";

const { Op } = require("sequelize");
const { AvaliacaoMensal, Aluno, Registro, Validacao } = require("../models");

function listarPorAluno({ alunoId, equipeId }) {
  return AvaliacaoMensal.findAll({
    where: { aluno_id: alunoId, equipe_id: equipeId },
    order: [["ano_mes", "DESC"]]
  });
}

function obterPorMes({ alunoId, equipeId, anoMes }) {
  return AvaliacaoMensal.findOne({
    where: { aluno_id: alunoId, equipe_id: equipeId, ano_mes: anoMes },
    include: [{ model: AvaliacaoMensal, as: "contextoAnterior", attributes: ["id", "ano_mes"] }]
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

// Relatos (Registros) do aluno CONFIRMADOS dentro da janela [inicio, fim).
// O critério é `validacao.confirmado_em`, não a data da sessão: garante que
// cada relato confirmado caia em exatamente um ciclo mensal (docs/adr/0015).
function listarRelatosConfirmadosNoMes({ equipeId, alunoId, inicio, fim }) {
  return Registro.findAll({
    where: {
      equipe_id: equipeId,
      aluno_id: alunoId,
      status: Registro.STATUS.CONFIRMADO,
      deletado_em: null
    },
    include: [
      {
        model: Validacao,
        as: "validacao",
        required: true,
        where: { confirmado_em: { [Op.gte]: inicio, [Op.lt]: fim } }
      }
    ],
    order: [[{ model: Validacao, as: "validacao" }, "confirmado_em", "ASC"]]
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
