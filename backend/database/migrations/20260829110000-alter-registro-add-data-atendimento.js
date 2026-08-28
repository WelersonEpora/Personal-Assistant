"use strict";

// docs/adr/0019-data-do-atendimento.md: o Registro passa a separar QUANDO o
// atendimento aconteceu (`data_atendimento`, um dia, sem hora) das datas do
// sistema (`iniciado_em` = início da captura, `created_at` = sincronização,
// `validacao.confirmado_em` = confirmação). Antes disso `iniciado_em` era usado
// como proxy da data do evento - errado quando o personal grava o relato depois.
//
// Registros existentes recebem `iniciado_em::date` (em UTC, o mesmo critério
// que o app já usava ao formatar datas com `toISOString().slice(0,10)`).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("registro", "data_atendimento", {
      type: Sequelize.DATEONLY,
      allowNull: true
    });

    await queryInterface.sequelize.query(`
      UPDATE registro
      SET data_atendimento = (iniciado_em AT TIME ZONE 'UTC')::date
      WHERE data_atendimento IS NULL;
    `);

    await queryInterface.changeColumn("registro", "data_atendimento", {
      type: Sequelize.DATEONLY,
      allowNull: false
    });

    await queryInterface.addIndex("registro", ["aluno_id", "data_atendimento"], {
      name: "idx_registro_aluno_data_atendimento"
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("registro", "idx_registro_aluno_data_atendimento");
    await queryInterface.removeColumn("registro", "data_atendimento");
  }
};
