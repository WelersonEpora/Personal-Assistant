"use strict";

const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");

// Usuário de desenvolvimento local - credenciais só para rodar o MVP na
// máquina do dev, nunca usadas em produção. Ver CLAUDE.md "Como rodar
// localmente".
const USUARIO_DEV_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL_DEV = "personal@dev.local";
const SENHA_DEV = "personal123";

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert("usuario", [
      {
        id: USUARIO_DEV_ID,
        nome: "Personal de Desenvolvimento",
        email: EMAIL_DEV,
        senha_hash: bcrypt.hashSync(SENHA_DEV, 10),
        especialidade: "Hipertrofia e condicionamento físico",
        created_at: now,
        updated_at: now
      }
    ]);

    await queryInterface.bulkInsert("aluno", [
      {
        id: randomUUID(),
        usuario_id: USUARIO_DEV_ID,
        nome: "João Silva",
        observacoes: null,
        ativo: true,
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("aluno", { usuario_id: USUARIO_DEV_ID });
    await queryInterface.bulkDelete("usuario", { id: USUARIO_DEV_ID });
  }
};
