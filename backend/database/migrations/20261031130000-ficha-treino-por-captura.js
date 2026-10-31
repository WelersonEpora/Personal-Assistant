"use strict";

// docs/adr/0028-ficha-de-treino-por-captura-e-ia.md:
// - registro.tipo ganha `ficha_treino`;
// - proposta_ficha_treino: staging da interpretação da IA (mesma natureza de
//   proposta_avaliacao_fisica, docs/adr/0018) - escrita só pelo worker, nunca
//   oficial. Uma linha por Registro; reprocessar atualiza a mesma linha;
// - ficha_treino.registro_id: de qual Registro a ficha nasceu (nulo para ficha
//   montada à mão). Gravado só pelo fichaTreino.service na confirmação.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `ALTER TABLE registro DROP CONSTRAINT ck_registro_tipo;
         ALTER TABLE registro ADD CONSTRAINT ck_registro_tipo CHECK (
           tipo IN ('atendimento', 'avaliacao_fisica', 'ficha_treino')
         );`,
        { transaction }
      );

      await queryInterface.createTable(
        "proposta_ficha_treino",
        {
          id: {
            type: Sequelize.UUID,
            allowNull: false,
            primaryKey: true,
            defaultValue: Sequelize.literal("gen_random_uuid()")
          },
          registro_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "registro", key: "id" },
            onDelete: "CASCADE"
          },
          payload_json: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
          avisos_json: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
          provedor: { type: Sequelize.STRING(40), allowNull: false, defaultValue: "gemini" },
          modelo: { type: Sequelize.STRING(60), allowNull: true },
          status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "pendente" },
          erro: { type: Sequelize.TEXT, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
        },
        { transaction }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE proposta_ficha_treino ADD CONSTRAINT ck_proposta_ft_status CHECK (
           status IN ('pendente', 'concluido', 'falha')
         );`,
        { transaction }
      );
      await queryInterface.addConstraint("proposta_ficha_treino", {
        fields: ["registro_id"],
        type: "unique",
        name: "uq_proposta_ft_registro_id",
        transaction
      });

      await queryInterface.addColumn(
        "ficha_treino",
        "registro_id",
        { type: Sequelize.UUID, allowNull: true, references: { model: "registro", key: "id" }, onDelete: "SET NULL" },
        { transaction }
      );
      await queryInterface.addIndex("ficha_treino", ["registro_id"], { name: "idx_ficha_treino_registro", transaction });
    });
  },

  // Registros `ficha_treino` não cabem na constraint antiga - a volta falha se
  // houver algum (aí é manual, de propósito: não apaga Registro sozinha).
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex("ficha_treino", "idx_ficha_treino_registro", { transaction });
      await queryInterface.removeColumn("ficha_treino", "registro_id", { transaction });
      await queryInterface.dropTable("proposta_ficha_treino", { transaction });
      await queryInterface.sequelize.query(
        `ALTER TABLE registro DROP CONSTRAINT ck_registro_tipo;
         ALTER TABLE registro ADD CONSTRAINT ck_registro_tipo CHECK (tipo IN ('atendimento', 'avaliacao_fisica'));`,
        { transaction }
      );
    });
  }
};
