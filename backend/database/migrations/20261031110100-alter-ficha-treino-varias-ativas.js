"use strict";

// docs/adr/0026: um aluno pode ter várias fichas ativas (divisão de treino -
// "inferiores" num dia, "superiores" no outro). Sai o índice único de "uma
// ativa por aluno"; `substitui_id` liga cada nova versão à ficha que ela
// substitui, para a nova versão desativar só aquela. O índice único parcial em
// substitui_id garante que uma ficha seja substituída no máximo uma vez (duas
// edições concorrentes da mesma ficha não geram duas ativas).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query("DROP INDEX IF EXISTS uq_ficha_treino_aluno_ativo", { transaction });
      await queryInterface.addColumn(
        "ficha_treino",
        "substitui_id",
        { type: Sequelize.UUID, allowNull: true, references: { model: "ficha_treino", key: "id" }, onDelete: "SET NULL" },
        { transaction }
      );
      await queryInterface.sequelize.query(
        "CREATE UNIQUE INDEX uq_ficha_treino_substitui ON ficha_treino (substitui_id) WHERE substitui_id IS NOT NULL",
        { transaction }
      );
    });
  },

  // Volta a "uma ativa por aluno": mantém ativa só a mais recente de cada aluno.
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query("DROP INDEX IF EXISTS uq_ficha_treino_substitui", { transaction });
      await queryInterface.removeColumn("ficha_treino", "substitui_id", { transaction });
      await queryInterface.sequelize.query(
        `UPDATE ficha_treino ft SET ativo = false
          WHERE ft.ativo = true
            AND EXISTS (
              SELECT 1 FROM ficha_treino mais_nova
               WHERE mais_nova.aluno_id = ft.aluno_id AND mais_nova.ativo = true AND mais_nova.created_at > ft.created_at
            )`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        "CREATE UNIQUE INDEX uq_ficha_treino_aluno_ativo ON ficha_treino (aluno_id) WHERE ativo = true",
        { transaction }
      );
    });
  }
};
