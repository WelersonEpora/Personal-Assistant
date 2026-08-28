"use strict";

// docs/adr/0016 + 0017: nem todo aluno contrata avaliação física com o
// personal. Opt-out (default false, sem backfill) - marcar tira o aluno do
// alerta "avaliação física vencida" do painel, sem apagar o histórico.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("aluno", "dispensa_avaliacao_fisica", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("aluno", "dispensa_avaliacao_fisica");
  }
};
