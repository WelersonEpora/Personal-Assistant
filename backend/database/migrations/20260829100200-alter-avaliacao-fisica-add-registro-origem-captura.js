"use strict";

// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: a avaliação física pode
// nascer da confirmação de um Registro `tipo = avaliacao_fisica`.
// - `registro_id` (nulo): rastreio de qual Registro originou (nulo para
//   `manual` e `legado_bodymove`). UNIQUE para 1 avaliação por Registro
//   (Postgres permite múltiplos NULL).
// - `origem` ganha `captura_ia` - server-set pelo service de confirmação; o
//   cliente continua sem poder escolher a origem (docs/adr/0016).
// A avaliação continua sendo escrita SÓ pelo avaliacao-fisica.service (nunca
// pela IA), e NUNCA vira `validacao` (docs/adr/0007 intacto).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("avaliacao_fisica", "registro_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "registro", key: "id" },
      onDelete: "SET NULL"
    });

    await queryInterface.addConstraint("avaliacao_fisica", {
      fields: ["registro_id"],
      type: "unique",
      name: "uq_avaliacao_fisica_registro_id"
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE avaliacao_fisica DROP CONSTRAINT ck_avaliacao_fisica_origem;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE avaliacao_fisica ADD CONSTRAINT ck_avaliacao_fisica_origem CHECK (
        origem IN ('legado_bodymove', 'manual', 'captura_ia')
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE avaliacao_fisica DROP CONSTRAINT ck_avaliacao_fisica_origem;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE avaliacao_fisica ADD CONSTRAINT ck_avaliacao_fisica_origem CHECK (
        origem IN ('legado_bodymove', 'manual')
      );
    `);
    await queryInterface.removeConstraint("avaliacao_fisica", "uq_avaliacao_fisica_registro_id");
    await queryInterface.removeColumn("avaliacao_fisica", "registro_id");
  }
};
