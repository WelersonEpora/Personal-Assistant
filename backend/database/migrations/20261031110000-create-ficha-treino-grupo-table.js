"use strict";

// docs/adr/0026: grupo entre a ficha e os exercícios (bi-set, tri-set,
// circuito). Todo item passa a pertencer a um grupo - exercício isolado é um
// grupo "simples" de um item - e `series` sai do item para o grupo (séries do
// exercício no simples, voltas no conjugado). Migração dos dados: cada item
// existente vira um grupo simples com as séries que já tinha; o id do grupo
// reaproveita o id do item, o que dispensa tabela de correspondência.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable(
        "ficha_treino_grupo",
        {
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
          ordem: { type: Sequelize.INTEGER, allowNull: false },
          tipo: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "simples" },
          series: { type: Sequelize.INTEGER, allowNull: true },
          descanso: { type: Sequelize.STRING(30), allowNull: true },
          observacoes: { type: Sequelize.TEXT, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
        },
        { transaction }
      );
      await queryInterface.addConstraint("ficha_treino_grupo", {
        fields: ["ficha_treino_id", "ordem"],
        type: "unique",
        name: "uq_ficha_treino_grupo_ficha_ordem",
        transaction
      });

      await queryInterface.addColumn(
        "ficha_treino_exercicio",
        "grupo_id",
        { type: Sequelize.UUID, allowNull: true, references: { model: "ficha_treino_grupo", key: "id" }, onDelete: "CASCADE" },
        { transaction }
      );

      await queryInterface.sequelize.query(
        `INSERT INTO ficha_treino_grupo (id, ficha_treino_id, ordem, tipo, series, created_at, updated_at)
         SELECT id, ficha_treino_id, ordem, 'simples', series, created_at, updated_at FROM ficha_treino_exercicio`,
        { transaction }
      );

      await queryInterface.removeConstraint("ficha_treino_exercicio", "uq_ficha_treino_exercicio_ficha_ordem", { transaction });
      await queryInterface.sequelize.query("UPDATE ficha_treino_exercicio SET grupo_id = id, ordem = 1", { transaction });

      await queryInterface.changeColumn(
        "ficha_treino_exercicio",
        "grupo_id",
        { type: Sequelize.UUID, allowNull: false, references: { model: "ficha_treino_grupo", key: "id" }, onDelete: "CASCADE" },
        { transaction }
      );
      await queryInterface.addConstraint("ficha_treino_exercicio", {
        fields: ["grupo_id", "ordem"],
        type: "unique",
        name: "uq_ficha_treino_exercicio_grupo_ordem",
        transaction
      });
      await queryInterface.removeColumn("ficha_treino_exercicio", "series", { transaction });
    });
  },

  // Volta à lista plana: ordem global pela posição do grupo e do item, séries
  // do grupo copiadas para cada item (num grupo conjugado, as voltas viram as
  // séries de cada exercício - o agrupamento em si se perde).
  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn("ficha_treino_exercicio", "series", { type: Sequelize.INTEGER, allowNull: true }, { transaction });
      await queryInterface.removeConstraint("ficha_treino_exercicio", "uq_ficha_treino_exercicio_grupo_ordem", { transaction });
      await queryInterface.sequelize.query(
        `UPDATE ficha_treino_exercicio fte
            SET series = n.series, ordem = n.nova_ordem
           FROM (
             SELECT fte2.id, g.series,
                    ROW_NUMBER() OVER (PARTITION BY fte2.ficha_treino_id ORDER BY g.ordem, fte2.ordem) AS nova_ordem
               FROM ficha_treino_exercicio fte2
               JOIN ficha_treino_grupo g ON g.id = fte2.grupo_id
           ) n
          WHERE n.id = fte.id`,
        { transaction }
      );
      await queryInterface.addConstraint("ficha_treino_exercicio", {
        fields: ["ficha_treino_id", "ordem"],
        type: "unique",
        name: "uq_ficha_treino_exercicio_ficha_ordem",
        transaction
      });
      await queryInterface.removeColumn("ficha_treino_exercicio", "grupo_id", { transaction });
      await queryInterface.dropTable("ficha_treino_grupo", { transaction });
    });
  }
};
