"use strict";

// Cria um usuário (personal trainer) real - não existe endpoint público de
// cadastro neste MVP de propósito (superfície de auth mínima, seção 12 do
// pedido). Único jeito de provisionar o primeiro login de produção.
//
// Uso:
//   node scripts/criar-usuario.js --nome="Fulano" --email="fulano@exemplo.com" --senha="..." [--especialidade="..."]
//   (em produção, dentro do container: docker compose exec backend node scripts/criar-usuario.js --nome=... --email=... --senha=...)

const bcrypt = require("bcryptjs");
const { Usuario, sequelize } = require("../src/models");

function lerArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const { nome, email, senha, especialidade } = lerArgs();

  if (!nome || !email || !senha) {
    console.error('Uso: node scripts/criar-usuario.js --nome="..." --email="..." --senha="..." [--especialidade="..."]');
    process.exitCode = 1;
    return;
  }
  if (senha.length < 8) {
    console.error('"--senha" precisa ter ao menos 8 caracteres.');
    process.exitCode = 1;
    return;
  }

  const senha_hash = await bcrypt.hash(senha, 10);
  const usuario = await Usuario.create({
    nome,
    email: email.trim().toLowerCase(),
    senha_hash,
    especialidade: especialidade || null
  });

  console.log(`Usuário criado: ${usuario.id} <${usuario.email}>`);
}

main()
  .catch((err) => {
    console.error("Falha ao criar usuário:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
