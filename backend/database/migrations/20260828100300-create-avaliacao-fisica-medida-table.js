"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §4/§6):
// tabela estreita - 1 linha por métrica × método de uma avaliação. Não é EAV
// aberto: `valor` é sempre NUMERIC, `metrica_codigo` existe no catálogo, a
// unidade é fechada e derivada do catálogo.
//
// `metodo`: protocolo/fórmula/teste que produziu o valor ('direto' para
// medição sem protocolo). Uma avaliação pode gravar 2-3 linhas de
// `percentual_gordura`, uma por método (o legado tem 10 casos).
//
// `principal`: marca o valor ACOMPANHADO daquela métrica naquela avaliação -
// o que a série "linha única" do gráfico usa. Evita o "degrau de método"
// (proposta v3 §4/§12.7). Índice único parcial garante no máximo um principal
// por métrica/avaliação.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("avaliacao_fisica_medida", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      avaliacao_fisica_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "avaliacao_fisica", key: "id" },
        onDelete: "CASCADE"
      },
      metrica_codigo: {
        type: Sequelize.STRING(40),
        allowNull: false,
        references: { model: "metrica_avaliacao_fisica", key: "codigo" },
        onDelete: "RESTRICT"
      },
      metodo: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "direto" },
      principal: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      // Sempre na unidade canônica da métrica (proposta v3 §3.1). `casas_decimais`
      // do catálogo é só exibição - o storage é sempre NUMERIC(8,3).
      valor: { type: Sequelize.DECIMAL(8, 3), allowNull: false },
      // medido | calculado | importado
      origem_valor: { type: Sequelize.STRING(10), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE avaliacao_fisica_medida ADD CONSTRAINT ck_medida_origem_valor CHECK (
        origem_valor IN ('medido', 'calculado', 'importado')
      );
    `);

    await queryInterface.addConstraint("avaliacao_fisica_medida", {
      fields: ["avaliacao_fisica_id", "metrica_codigo", "metodo"],
      type: "unique",
      name: "uq_medida_avaliacao_metrica_metodo"
    });

    // Índice único parcial - no máximo 1 valor principal por métrica/avaliação.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX uq_medida_principal
        ON avaliacao_fisica_medida (avaliacao_fisica_id, metrica_codigo)
        WHERE principal;
    `);

    // Série de uma métrica (WHERE metrica_codigo = ... ORDER BY data via join).
    await queryInterface.addIndex("avaliacao_fisica_medida", ["metrica_codigo", "avaliacao_fisica_id"], {
      name: "idx_medida_serie"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("avaliacao_fisica_medida");
  }
};
