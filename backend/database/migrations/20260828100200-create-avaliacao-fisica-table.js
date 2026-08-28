"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3 §6):
// cabeçalho de uma sessão de avaliação física - evento de um dia, escopado
// por equipe (docs/adr/0011). CRUD direto do personal, como
// `avaliacao_personal`: NÃO passa pelo pipeline de IA e NUNCA vira `validacao`
// (dado objetivo do personal, não proposta a confirmar - docs/adr/0007
// intacto). `anamnese_json`/`postural_json` guardam só o qualitativo, com
// esquema fechado (proposta v3 §5); todo número medido é `avaliacao_fisica_medida`.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("avaliacao_fisica", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()")
      },
      aluno_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "aluno", key: "id" },
        onDelete: "CASCADE"
      },
      // Denormalizado do aluno para o escopo de tenancy, mesmo padrão de
      // `avaliacao_personal` (docs/adr/0011).
      equipe_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "equipe", key: "id" },
        onDelete: "CASCADE"
      },
      // Dia da avaliação - hora não entra em série (proposta v3 §9.7).
      data: { type: Sequelize.DATEONLY, allowNull: false },
      // legado_bodymove | manual
      origem: { type: Sequelize.STRING(20), allowNull: false },
      // Quem aplicou; NULL no legado (o BodyMove é monousuário).
      avaliador_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "usuario", key: "id" },
        onDelete: "SET NULL"
      },
      // Esquema fechado (proposta v3 §5.1 / §5.2) - só dado qualitativo/
      // contextual. Validação de esquema na escrita fica para a fase da API.
      anamnese_json: { type: Sequelize.JSONB, allowNull: true },
      postural_json: { type: Sequelize.JSONB, allowNull: true },
      observacoes: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("NOW()") }
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE avaliacao_fisica ADD CONSTRAINT ck_avaliacao_fisica_origem CHECK (
        origem IN ('legado_bodymove', 'manual')
      );
    `);

    await queryInterface.addIndex("avaliacao_fisica", ["aluno_id", "data"], {
      name: "idx_avaliacao_fisica_aluno_data"
    });

    // Idempotência do importador one-shot do legado (proposta v3 §6/§8): no
    // máximo uma avaliação por (aluno, dia, origem). O legado não tem nenhum
    // aluno com 2 avaliações no mesmo dia.
    await queryInterface.addConstraint("avaliacao_fisica", {
      fields: ["aluno_id", "data", "origem"],
      type: "unique",
      name: "uq_avaliacao_fisica_import"
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("avaliacao_fisica");
  }
};
