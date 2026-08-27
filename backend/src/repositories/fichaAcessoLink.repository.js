"use strict";

const { sequelize, FichaAcessoLink } = require("../models");

// Link não-revogado atual do aluno (pode estar expirado - a checagem de
// "utilizável" é do service/model). No máximo um, garantido pelo índice
// parcial único uq_ficha_acesso_link_aluno_ativo (docs/adr/0014).
function obterAtivoPorAluno({ alunoId, equipeId }) {
  return FichaAcessoLink.findOne({
    where: { aluno_id: alunoId, equipe_id: equipeId, revogado_em: null }
  });
}

// Lookup só por token completo - sem aluno_id, sem match parcial. É o único
// caminho de resolução do endpoint público (docs/adr/0014).
function obterPorToken(token) {
  return FichaAcessoLink.findOne({ where: { token } });
}

// "Gerar um novo link invalida o anterior" (docs/adr/0014) - revoga o ativo
// atual e insere o novo numa única transação.
async function gerarNovo({ alunoId, equipeId, criadoPor, token, expiraEm }) {
  return sequelize.transaction(async (transaction) => {
    await FichaAcessoLink.update(
      { revogado_em: new Date() },
      { where: { aluno_id: alunoId, equipe_id: equipeId, revogado_em: null }, transaction }
    );

    return FichaAcessoLink.create(
      { aluno_id: alunoId, equipe_id: equipeId, criado_por: criadoPor, token, expira_em: expiraEm },
      { transaction }
    );
  });
}

async function revogarPorAluno({ alunoId, equipeId }) {
  const [afetados] = await FichaAcessoLink.update(
    { revogado_em: new Date() },
    { where: { aluno_id: alunoId, equipe_id: equipeId, revogado_em: null } }
  );
  return afetados;
}

module.exports = { obterAtivoPorAluno, obterPorToken, gerarNovo, revogarPorAluno };
