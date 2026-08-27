"use strict";

const { Op } = require("sequelize");
const { AnaliseSobDemanda, AvaliacaoMensal, Registro, Validacao } = require("../models");

function listarPorAluno({ alunoId, equipeId }) {
  return AnaliseSobDemanda.findAll({
    where: { aluno_id: alunoId, equipe_id: equipeId },
    order: [["solicitada_em", "DESC"]]
  });
}

// Última análise que a IA efetivamente gerou (status "gerada") - é ela que
// conta para o limite de 1 a cada 7 dias. "dados_insuficientes" e "falha"
// não consomem a janela (o personal não é penalizado por pedir cedo demais
// ou por uma falha do provedor).
function ultimaGerada({ alunoId }) {
  return AnaliseSobDemanda.findOne({
    where: { aluno_id: alunoId, status: "gerada" },
    order: [["solicitada_em", "DESC"]]
  });
}

// Análise mais recente do aluno, qualquer status. Se ela for uma "falha", a
// próxima tentativa (nova falha OU sucesso) sobrescreve essa mesma linha em
// vez de criar outra - o feed não acumula "Falha ao gerar" repetidos
// (docs/adr/0015).
function ultima({ alunoId }) {
  return AnaliseSobDemanda.findOne({
    where: { aluno_id: alunoId },
    order: [["solicitada_em", "DESC"]]
  });
}

async function atualizar(id, dados) {
  const linha = await AnaliseSobDemanda.findByPk(id);
  return linha.update(dados);
}

// Avaliação mensal mais recente (qualquer status) - fornece o contexto
// consolidado de REFERÊNCIA da análise sob demanda (somente leitura) e a
// data a partir da qual os relatos ainda não foram consolidados.
function avaliacaoMensalMaisRecente({ alunoId }) {
  return AvaliacaoMensal.findOne({
    where: { aluno_id: alunoId },
    order: [["ano_mes", "DESC"]]
  });
}

// Relatos confirmados do aluno com confirmado_em > `desde` (os ainda não
// incorporados a um fechamento mensal).
function listarRelatosConfirmadosDesde({ equipeId, alunoId, desde }) {
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
        where: { confirmado_em: { [Op.gt]: desde } }
      }
    ],
    order: [[{ model: Validacao, as: "validacao" }, "confirmado_em", "ASC"]]
  });
}

function criar(dados) {
  return AnaliseSobDemanda.create(dados);
}

module.exports = {
  listarPorAluno,
  ultimaGerada,
  ultima,
  atualizar,
  avaliacaoMensalMaisRecente,
  listarRelatosConfirmadosDesde,
  criar
};
