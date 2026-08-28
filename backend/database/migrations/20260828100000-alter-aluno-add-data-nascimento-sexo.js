"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md: a avaliação física
// precisa de data de nascimento e sexo do aluno (entram no cálculo de idade
// e em protocolos de composição corporal). São atributos estáveis da pessoa,
// não da avaliação (proposta v3 §5.1) - por isso ficam em `aluno`, não em
// `avaliacao_fisica`. Nulos: o cadastro mínimo (docs/adr/0008) não os exige;
// o importador do legado preenche quando o BodyMove tinha o dado.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("aluno", "data_nascimento", {
      type: Sequelize.DATEONLY,
      allowNull: true
    });
    await queryInterface.addColumn("aluno", "sexo", {
      type: Sequelize.STRING(1),
      allowNull: true
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE aluno ADD CONSTRAINT ck_aluno_sexo CHECK (
        sexo IS NULL OR sexo IN ('F', 'M')
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("ALTER TABLE aluno DROP CONSTRAINT IF EXISTS ck_aluno_sexo;");
    await queryInterface.removeColumn("aluno", "sexo");
    await queryInterface.removeColumn("aluno", "data_nascimento");
  }
};
