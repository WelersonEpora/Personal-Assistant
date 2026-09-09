"use strict";

// docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md
const { RevisaoAvaliacaoMensal, Usuario } = require("../models");

const INCLUDE_AUTOR = { model: Usuario, as: "autor", attributes: ["id", "nome"] };

function obterPorAvaliacao(avaliacaoMensalId) {
  return RevisaoAvaliacaoMensal.findOne({
    where: { avaliacao_mensal_id: avaliacaoMensalId },
    include: [INCLUDE_AUTOR]
  });
}

// Upsert 1:1 por avaliacao_mensal_id (ADR-0023). `compartilhada_em` avança a
// cada salvamento; `avaliacao_gerada_em` fixa o snapshot do texto revisado.
async function salvar({ avaliacaoMensalId, alunoId, equipeId, autorId, comentario, itensExcluidos, avaliacaoGeradaEm }) {
  const agora = new Date();
  const [revisao] = await RevisaoAvaliacaoMensal.findOrCreate({
    where: { avaliacao_mensal_id: avaliacaoMensalId },
    defaults: {
      avaliacao_mensal_id: avaliacaoMensalId,
      aluno_id: alunoId,
      equipe_id: equipeId,
      autor_id: autorId,
      comentario,
      itens_excluidos: itensExcluidos,
      avaliacao_gerada_em: avaliacaoGeradaEm,
      compartilhada_em: agora
    }
  });
  await revisao.update({
    autor_id: autorId,
    comentario,
    itens_excluidos: itensExcluidos,
    avaliacao_gerada_em: avaliacaoGeradaEm,
    compartilhada_em: agora
  });
  return RevisaoAvaliacaoMensal.findOne({
    where: { avaliacao_mensal_id: avaliacaoMensalId },
    include: [INCLUDE_AUTOR]
  });
}

function excluir(revisao) {
  return revisao.destroy();
}

module.exports = { obterPorAvaliacao, salvar, excluir };
