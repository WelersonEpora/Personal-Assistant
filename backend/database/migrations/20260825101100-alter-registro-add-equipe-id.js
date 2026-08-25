"use strict";

// docs/adr/0011-conceito-de-equipe-e-membro.md: equipe_id vira a chave de
// escopo/autorização de Registro. usuario_id NÃO é removido nem deixa de
// ser preenchido - continua significando "quem capturou este Registro"
// (auditoria), mesmo padrão de redundância que já existia entre aluno_id e
// usuario_id nesta tabela.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("registro", "equipe_id", { type: Sequelize.UUID, allowNull: true });

    await queryInterface.sequelize.query(`
      UPDATE registro SET equipe_id = aluno.equipe_id
      FROM aluno
      WHERE aluno.id = registro.aluno_id;
    `);

    await queryInterface.changeColumn("registro", "equipe_id", { type: Sequelize.UUID, allowNull: false });
    await queryInterface.addConstraint("registro", {
      fields: ["equipe_id"],
      type: "foreign key",
      name: "fk_registro_equipe_id",
      references: { table: "equipe", field: "id" },
      onDelete: "CASCADE"
    });
    await queryInterface.addIndex("registro", ["equipe_id", "status"], { name: "idx_registro_equipe_id_status" });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("registro", "fk_registro_equipe_id");
    await queryInterface.removeIndex("registro", "idx_registro_equipe_id_status");
    await queryInterface.removeColumn("registro", "equipe_id");
  }
};
