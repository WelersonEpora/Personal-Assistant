"use strict";

const { REVISADOS, NOVOS } = require("../dados/exercicios-globais-v2");
const { idDeterministico } = require("./20260826170000-seed-exercicios-globais");
const { normalizarTexto } = require("../../src/shared/utils/texto");

// Catálogo global revisado (docs/adr/0027): nomes de academia, apelidos
// globais e os exercícios que faltavam. Roda depois do catálogo original, uma
// vez só (seederStorage), também no servidor via scripts/deploy.sh.
//
// - Os 87 originais mantêm o id (imagens e fichas continuam valendo). Só são
//   renomeados se ainda estiverem com o nome original do seed: um exercício
//   global que o personal já corrigiu pela tela (exceção temporária de edição
//   de globais, exercicio.service.js) fica como ele deixou.
// - Os novos têm id a partir do código fixo; INSERT idempotente.
// - Apelidos globais (equipe_id NULL): ON CONFLICT no índice parcial global.

function idNovo(codigo) {
  return idDeterministico(`v2:${codigo}`);
}

async function inserirApelidos(queryInterface, exercicioId, apelidos, transaction) {
  for (const apelido of apelidos) {
    await queryInterface.sequelize.query(
      `INSERT INTO exercicio_apelido (id, exercicio_id, equipe_id, apelido, apelido_normalizado, created_at, updated_at)
       SELECT gen_random_uuid(), :exercicioId, NULL, :apelido, :normalizado, NOW(), NOW()
        WHERE EXISTS (SELECT 1 FROM exercicio WHERE id = :exercicioId)
       ON CONFLICT (exercicio_id, apelido_normalizado) WHERE equipe_id IS NULL DO NOTHING`,
      { replacements: { exercicioId, apelido, normalizado: normalizarTexto(apelido) }, transaction }
    );
  }
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const revisado of REVISADOS) {
        const id = idDeterministico(revisado.antigo);
        const campos = {};
        if (revisado.nome) campos.nome = revisado.nome;
        if (revisado.grupoMuscular) campos.grupo_muscular = revisado.grupoMuscular;
        if (revisado.instrucoes) campos.instrucoes = revisado.instrucoes;

        const sets = Object.keys(campos).map((campo) => `${campo} = :${campo}`);
        if (sets.length) {
          await queryInterface.sequelize.query(
            `UPDATE exercicio SET ${sets.join(", ")}, updated_at = NOW()
              WHERE id = :id AND equipe_id IS NULL AND nome = :antigo`,
            { replacements: { ...campos, id, antigo: revisado.antigo }, transaction }
          );
        }
        await inserirApelidos(queryInterface, id, revisado.apelidos, transaction);
      }

      for (const novo of NOVOS) {
        const id = idNovo(novo.codigo);
        await queryInterface.sequelize.query(
          `INSERT INTO exercicio (id, equipe_id, nome, grupo_muscular, equipamento, dificuldade, instrucoes, ativo, created_at, updated_at)
           VALUES (:id, NULL, :nome, :grupoMuscular, :equipamento, :dificuldade, :instrucoes, TRUE, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          { replacements: { id, ...novo }, transaction }
        );
        await inserirApelidos(queryInterface, id, novo.apelidos, transaction);
      }
    });
  },

  // Volta os nomes originais (só onde ainda está o nome desta revisão), tira
  // os apelidos globais e os exercícios novos. Falha se algum exercício novo
  // já estiver numa ficha - aí a volta é manual.
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const idsRevisados = REVISADOS.map((revisado) => idDeterministico(revisado.antigo));
      const idsNovos = NOVOS.map((novo) => idNovo(novo.codigo));

      await queryInterface.sequelize.query(
        "DELETE FROM exercicio_apelido WHERE equipe_id IS NULL AND exercicio_id IN (:ids)",
        { replacements: { ids: [...idsRevisados, ...idsNovos] }, transaction }
      );
      await queryInterface.sequelize.query("DELETE FROM exercicio WHERE equipe_id IS NULL AND id IN (:ids)", {
        replacements: { ids: idsNovos },
        transaction
      });
      for (const revisado of REVISADOS.filter((r) => r.nome)) {
        await queryInterface.sequelize.query(
          "UPDATE exercicio SET nome = :antigo, updated_at = NOW() WHERE id = :id AND equipe_id IS NULL AND nome = :nome",
          { replacements: { id: idDeterministico(revisado.antigo), antigo: revisado.antigo, nome: revisado.nome }, transaction }
        );
      }
    });
  },

  idNovo,
  inserirApelidos
};
