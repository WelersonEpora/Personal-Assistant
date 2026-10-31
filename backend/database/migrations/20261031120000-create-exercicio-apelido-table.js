"use strict";

// docs/adr/0027: outros nomes de um exercício. `equipe_id` NULL = nome
// alternativo do catálogo global (vem do seed, nenhuma equipe edita);
// preenchido = apelido dado por aquela equipe (vale para exercício global ou
// próprio). `apelido_normalizado` (minúsculas, sem acento) é a chave de
// comparação.
//
// Unicidade em dois índices parciais (NULL não colide em UNIQUE comum):
// - global: o mesmo apelido não se repete no mesmo exercício;
// - equipe: um apelido da equipe aponta para UM exercício só - é o que impede
//   "puxada" de significar duas coisas na busca e na interpretação por voz.
// O conflito entre apelido da equipe e nome/apelido global de outro exercício
// é conferido no service (atravessa escopos, não cabe num índice).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "exercicio_apelido",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: Sequelize.literal("gen_random_uuid()")
          },
          exercicio_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "exercicio", key: "id" },
            onDelete: "CASCADE"
          },
          equipe_id: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "equipe", key: "id" },
            onDelete: "CASCADE"
          },
          apelido: { type: Sequelize.STRING(120), allowNull: false },
          apelido_normalizado: { type: Sequelize.STRING(120), allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
        },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX uq_exercicio_apelido_global
           ON exercicio_apelido (exercicio_id, apelido_normalizado) WHERE equipe_id IS NULL`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX uq_exercicio_apelido_equipe
           ON exercicio_apelido (equipe_id, apelido_normalizado) WHERE equipe_id IS NOT NULL`,
        { transaction }
      );
      await queryInterface.addIndex("exercicio_apelido", ["exercicio_id"], { name: "idx_exercicio_apelido_exercicio", transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("exercicio_apelido");
  }
};
