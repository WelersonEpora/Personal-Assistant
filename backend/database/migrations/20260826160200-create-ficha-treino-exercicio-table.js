"use strict";

// docs/adr/0013: itens relacionais (não JSON genérico como em
// registro_entrada/resultado_ia) - referência direta a exercicio_id, para
// que uma futura sugestão de IA (fora de escopo agora) já encontre uma
// estrutura previsível para gerar. exercicio_id usa onDelete RESTRICT (não
// CASCADE): exercício é referenciado, não "possuído" pela ficha - excluir
// (soft-delete) um exercício não pode apagar itens de fichas que já o usam.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ficha_treino_exercicio", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      ficha_treino_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "ficha_treino", key: "id" },
        onDelete: "CASCADE"
      },
      exercicio_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "exercicio", key: "id" },
        onDelete: "RESTRICT"
      },
      ordem: { type: Sequelize.INTEGER, allowNull: false },
      series: { type: Sequelize.INTEGER, allowNull: true },
      repeticoes: { type: Sequelize.STRING(30), allowNull: true },
      carga_obs: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.addConstraint("ficha_treino_exercicio", {
      fields: ["ficha_treino_id", "ordem"],
      type: "unique",
      name: "uq_ficha_treino_exercicio_ficha_ordem"
    });
    await queryInterface.addIndex("ficha_treino_exercicio", ["exercicio_id"], { name: "idx_ficha_treino_exercicio_exercicio_id" });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ficha_treino_exercicio");
  }
};
