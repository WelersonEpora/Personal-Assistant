"use strict";

// docs/adr/0013 + 0017: alguns alunos não usam ficha de treino com o personal
// (treinam por conta, só acompanhamento etc.). Opt-out - o default mantém
// todo mundo contando no painel ("alunos sem ficha ativa"); marcar tira o
// aluno desse alerta sem apagar nada.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("aluno", "dispensa_ficha_treino", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("aluno", "dispensa_ficha_treino");
  }
};
