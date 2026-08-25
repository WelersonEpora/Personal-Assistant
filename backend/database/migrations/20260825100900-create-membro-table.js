"use strict";

const { randomUUID } = require("node:crypto");

// docs/adr/0011-conceito-de-equipe-e-membro.md: membro associa um usuario a
// uma equipe, com um papel. Modelado como tabela de juncao mesmo sendo 1:1
// hoje (uq_membro_usuario_id) - suportar varias equipes por usuario no
// futuro vira só remover essa constraint, sem migração estrutural.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("membro", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      equipe_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "equipe", key: "id" },
        onDelete: "CASCADE"
      },
      usuario_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "usuario", key: "id" },
        onDelete: "CASCADE"
      },
      papel: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "colaborador" },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE membro ADD CONSTRAINT ck_membro_papel CHECK (papel IN ('owner', 'colaborador'));
    `);

    await queryInterface.addConstraint("membro", { fields: ["usuario_id"], type: "unique", name: "uq_membro_usuario_id" });
    await queryInterface.addIndex("membro", ["equipe_id"], { name: "idx_membro_equipe_id" });

    // Backfill: todo usuario já existente (dev seed hoje, base real amanhã)
    // ganha uma equipe própria e vira seu owner - garante que as próximas
    // migrations (aluno/registro) sempre encontram um membro pra fazer join.
    const usuarios = await queryInterface.sequelize.query("SELECT id, nome FROM usuario", {
      type: Sequelize.QueryTypes.SELECT
    });
    const now = new Date();
    const equipes = usuarios.map((u) => ({ id: randomUUID(), nome: `${u.nome} (equipe)`, created_at: now, updated_at: now }));
    const membros = usuarios.map((u, i) => ({
      id: randomUUID(),
      equipe_id: equipes[i].id,
      usuario_id: u.id,
      papel: "owner",
      created_at: now,
      updated_at: now
    }));

    if (equipes.length) {
      await queryInterface.bulkInsert("equipe", equipes);
      await queryInterface.bulkInsert("membro", membros);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("membro");
  }
};
