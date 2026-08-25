"use strict";

// docs/adr/0011-conceito-de-equipe-e-membro.md: aluno passa a pertencer à
// equipe (compartilhado entre seus membros), não mais a um usuario
// individual. usuario_id é removido, não mantido como auditoria - nunca
// foi usado como "quem cadastrou o aluno" em nenhuma tela, e mantê-lo numa
// entidade agora compartilhada pela equipe seria enganoso.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("aluno", "equipe_id", { type: Sequelize.UUID, allowNull: true });

    await queryInterface.sequelize.query(`
      UPDATE aluno SET equipe_id = membro.equipe_id
      FROM membro
      WHERE membro.usuario_id = aluno.usuario_id;
    `);

    await queryInterface.changeColumn("aluno", "equipe_id", { type: Sequelize.UUID, allowNull: false });
    await queryInterface.addConstraint("aluno", {
      fields: ["equipe_id"],
      type: "foreign key",
      name: "fk_aluno_equipe_id",
      references: { table: "equipe", field: "id" },
      onDelete: "CASCADE"
    });
    await queryInterface.addIndex("aluno", ["equipe_id"], { name: "idx_aluno_equipe_id" });

    await queryInterface.removeIndex("aluno", "idx_aluno_usuario_id");
    await queryInterface.removeColumn("aluno", "usuario_id");
  },

  // Reversível apenas na estrutura: os valores originais de usuario_id não
  // são recuperáveis (down() não roda em produção - scripts/deploy.sh nunca
  // executa migrate:undo -, é só uma conveniência de desenvolvimento).
  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("aluno", "usuario_id", { type: Sequelize.UUID, allowNull: true });
    await queryInterface.removeConstraint("aluno", "fk_aluno_equipe_id");
    await queryInterface.removeIndex("aluno", "idx_aluno_equipe_id");
    await queryInterface.removeColumn("aluno", "equipe_id");
  }
};
