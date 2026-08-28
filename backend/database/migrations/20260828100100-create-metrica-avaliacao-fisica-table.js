"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §3):
// catálogo controlado das métricas de avaliação física. Tabela estreita de
// medidas (`avaliacao_fisica_medida`) referencia este catálogo por `codigo`;
// a unidade é 100% derivada daqui (nunca gravada por linha de medida) e o
// valor é sempre armazenado na unidade canônica da métrica.
//
// Tabela de referência (não é dado de aluno) - populada por seeder e
// idempotente. `rotulo`/`unidade`/`direcao_favoravel`/`ordem`/`ativo` são
// dados de produto lidos em join com a série, por isso tabela e não constante.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("metrica_avaliacao_fisica", {
      codigo: { type: Sequelize.STRING(40), allowNull: false, primaryKey: true },
      rotulo: { type: Sequelize.STRING(80), allowNull: false },
      categoria: { type: Sequelize.STRING(20), allowNull: false },
      // Vocabulário fechado de unidades (proposta v3 §3.1).
      unidade: { type: Sequelize.STRING(12), allowNull: false },
      // Só exibição - storage é sempre NUMERIC(8,3) em avaliacao_fisica_medida.
      casas_decimais: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 1 },
      // menor | maior | neutro - deixa o sistema classificar evolução sem IA.
      direcao_favoravel: { type: Sequelize.STRING(6), allowNull: false, defaultValue: "neutro" },
      ordem: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 0 },
      // Esconde métrica descontinuada sem apagar histórico.
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE metrica_avaliacao_fisica
        ADD CONSTRAINT ck_metrica_categoria CHECK (
          categoria IN ('antropometria', 'composicao', 'perimetro', 'dobra', 'indice', 'cardio')
        ),
        ADD CONSTRAINT ck_metrica_unidade CHECK (
          unidade IN ('kg', 'cm', 'mm', '%', 'L', 'kg/m²', 'mL/kg/min', 'bpm', 'mmHg', 'kcal/dia', 'adimensional')
        ),
        ADD CONSTRAINT ck_metrica_direcao CHECK (
          direcao_favoravel IN ('menor', 'maior', 'neutro')
        );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("metrica_avaliacao_fisica");
  }
};
