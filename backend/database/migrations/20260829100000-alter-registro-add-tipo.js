"use strict";

// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: o Registro passa a ter
// um "tipo", escolhido no cliente ao iniciar (junto com o id) e imutável
// depois. `atendimento` é o comportamento atual (relato -> resultado_ia ->
// validacao); `avaliacao_fisica` bifurca o pipeline de IA para um
// interpretador próprio e uma proposta_avaliacao_fisica (nunca dado oficial).
// Default preserva 100% dos Registros existentes como `atendimento`.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("registro", "tipo", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "atendimento"
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE registro ADD CONSTRAINT ck_registro_tipo CHECK (
        tipo IN ('atendimento', 'avaliacao_fisica')
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("registro", "tipo");
  }
};
