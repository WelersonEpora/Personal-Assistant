"use strict";

const { randomUUID } = require("node:crypto");
const { sequelize, FichaTreino, FichaTreinoGrupo, FichaTreinoExercicio, Exercicio, Usuario } = require("../models");
const { ConflictError } = require("../shared/errors");

// docs/adr/0026: ficha → grupos → exercícios, ambos na ordem salva.
const INCLUDE_GRUPOS = {
  model: FichaTreinoGrupo,
  as: "grupos",
  separate: true,
  order: [["ordem", "ASC"]],
  include: [
    {
      model: FichaTreinoExercicio,
      as: "itens",
      include: [{ model: Exercicio, as: "exercicio" }],
      separate: true,
      order: [["ordem", "ASC"]]
    }
  ]
};
const INCLUDE_CRIADO_POR = { model: Usuario, as: "criadoPor", attributes: ["id", "nome"] };

function listarPorAluno({ alunoId, equipeId }) {
  return FichaTreino.findAll({
    where: { aluno_id: alunoId, equipe_id: equipeId },
    include: [INCLUDE_GRUPOS, INCLUDE_CRIADO_POR],
    order: [["created_at", "DESC"]]
  });
}

// Várias fichas ativas por aluno (docs/adr/0026) - ordenadas pelo nome, que é
// o que as diferencia ("Inferiores", "Superiores").
function listarAtivasPorAluno({ alunoId, equipeId }) {
  return FichaTreino.findAll({
    where: { aluno_id: alunoId, equipe_id: equipeId, ativo: true },
    include: [INCLUDE_GRUPOS, INCLUDE_CRIADO_POR],
    order: [
      [sequelize.fn("LOWER", sequelize.col("FichaTreino.nome")), "ASC NULLS LAST"],
      ["created_at", "ASC"]
    ]
  });
}

function obterPorIdEquipe({ id, equipeId }) {
  return FichaTreino.findOne({
    where: { id, equipe_id: equipeId },
    include: [INCLUDE_GRUPOS, INCLUDE_CRIADO_POR]
  });
}

// Preserva o histórico sem versionamento explícito (docs/adr/0013): a ficha
// substituída só é marcada ativo=false, nunca editada ou apagada; a nova nasce
// como uma linha própria, com seus próprios grupos e itens. Sem
// `substituiFichaId`, a ficha nova soma às ativas (docs/adr/0026).
async function criarNovaVersao({ alunoId, equipeId, criadoPor, nome, observacoes, substituiFichaId, grupos }) {
  return sequelize.transaction(async (transaction) => {
    if (substituiFichaId) {
      const [desativadas] = await FichaTreino.update(
        { ativo: false },
        { where: { id: substituiFichaId, aluno_id: alunoId, equipe_id: equipeId, ativo: true }, transaction }
      );
      if (desativadas === 0) {
        throw new ConflictError("Esta ficha já foi substituída ou arquivada. Recarregue a página.");
      }
    }

    const ficha = await FichaTreino.create(
      {
        aluno_id: alunoId,
        equipe_id: equipeId,
        criado_por: criadoPor,
        nome: nome || null,
        observacoes: observacoes || null,
        substitui_id: substituiFichaId || null,
        ativo: true
      },
      { transaction }
    );

    const linhasGrupo = grupos.map((grupo, indiceGrupo) => ({
      id: randomUUID(),
      ficha_treino_id: ficha.id,
      ordem: indiceGrupo + 1,
      tipo: grupo.tipo,
      series: grupo.series ?? null,
      descanso: grupo.descanso || null,
      observacoes: grupo.observacoes || null
    }));
    await FichaTreinoGrupo.bulkCreate(linhasGrupo, { transaction });

    await FichaTreinoExercicio.bulkCreate(
      grupos.flatMap((grupo, indiceGrupo) =>
        grupo.itens.map((item, indiceItem) => ({
          ficha_treino_id: ficha.id,
          grupo_id: linhasGrupo[indiceGrupo].id,
          exercicio_id: item.exercicioId,
          ordem: indiceItem + 1,
          repeticoes: item.repeticoes || null,
          carga_obs: item.cargaObs || null
        }))
      ),
      { transaction }
    );

    return ficha;
  });
}

// Arquivar = desligar sem substituta (docs/adr/0026). Devolve quantas linhas
// mudaram - 0 se a ficha já não estava ativa.
async function arquivar({ id, equipeId }) {
  const [alteradas] = await FichaTreino.update({ ativo: false }, { where: { id, equipe_id: equipeId, ativo: true } });
  return alteradas;
}

module.exports = { listarPorAluno, listarAtivasPorAluno, obterPorIdEquipe, criarNovaVersao, arquivar };
