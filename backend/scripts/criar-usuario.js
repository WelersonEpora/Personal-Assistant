"use strict";

// Cria um usuário (personal trainer) real - não existe endpoint público de
// cadastro neste MVP de propósito (superfície de auth mínima, seção 12 do
// pedido). Único jeito de provisionar login, seja de uma equipe nova ou de
// um novo membro numa equipe existente (docs/adr/0011).
//
// Uso:
//   # cria uma equipe nova, com este usuário como owner:
//   node scripts/criar-usuario.js --nome="Fulano" --email="fulano@exemplo.com" --senha="..." --equipe-nome="Academia Fulano" [--especialidade="..."]
//
//   # entra numa equipe existente (identificada pelo e-mail de um membro já cadastrado), como colaborador:
//   node scripts/criar-usuario.js --nome="Beltrana" --email="beltrana@exemplo.com" --senha="..." --equipe-de="fulano@exemplo.com" [--especialidade="..."]
//
//   (em produção, dentro do container: docker compose exec backend node scripts/criar-usuario.js --nome=... --email=... --senha=... --equipe-nome=...)

const bcrypt = require("bcryptjs");
const { Usuario, Equipe, Membro, sequelize } = require("../src/models");
const membroService = require("../src/services/membro.service");

function lerArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const args = lerArgs();
  const { nome, email, senha, especialidade } = args;
  const equipeNome = args["equipe-nome"];
  const equipeDe = args["equipe-de"];

  if (!nome || !email || !senha) {
    console.error('Uso: node scripts/criar-usuario.js --nome="..." --email="..." --senha="..." (--equipe-nome="..." | --equipe-de="...") [--especialidade="..."]');
    process.exitCode = 1;
    return;
  }
  if (senha.length < 8) {
    console.error('"--senha" precisa ter ao menos 8 caracteres.');
    process.exitCode = 1;
    return;
  }
  if (Boolean(equipeNome) === Boolean(equipeDe)) {
    console.error('Informe exatamente um entre "--equipe-nome" (cria equipe nova) e "--equipe-de" (entra numa equipe existente).');
    process.exitCode = 1;
    return;
  }

  let resultado;

  if (equipeNome) {
    // Cria uma equipe nova - sem tela equivalente no /admin (o formulário
    // web só adiciona membro à equipe do owner logado), fica só no CLI.
    const senha_hash = await bcrypt.hash(senha, 10);
    resultado = await sequelize.transaction(async (transaction) => {
      const equipe = await Equipe.create({ nome: equipeNome }, { transaction });
      const usuario = await Usuario.create(
        { nome, email: email.trim().toLowerCase(), senha_hash, especialidade: especialidade || null },
        { transaction }
      );
      await Membro.create({ equipe_id: equipe.id, usuario_id: usuario.id, papel: Membro.PAPEL.OWNER }, { transaction });
      return { usuario, papel: Membro.PAPEL.OWNER, nomeEquipeLog: equipe.nome };
    });
  } else {
    // Entra numa equipe existente - mesma lógica de criação de membro usada
    // pela interface administrativa (POST /api/v1/membros), sem duplicar
    // regra de negócio entre CLI e API.
    const dono = await Usuario.findOne({
      where: { email: equipeDe.trim().toLowerCase() },
      include: [{ model: Membro, as: "membro", include: [{ model: Equipe, as: "equipe" }] }]
    });
    if (!dono || !dono.membro) {
      throw new Error(`Nenhum usuário com membro de equipe encontrado para o e-mail "${equipeDe}".`);
    }

    const membro = await membroService.criarMembro(dono.membro.equipe_id, {
      nome,
      email,
      senha,
      especialidade,
      papel: Membro.PAPEL.COLABORADOR
    });
    resultado = { usuario: membro.usuario, papel: membro.papel, nomeEquipeLog: dono.membro.equipe.nome };
  }

  console.log(
    `Usuário criado: ${resultado.usuario.id} <${resultado.usuario.email}> — equipe "${resultado.nomeEquipeLog}" (papel: ${resultado.papel})`
  );
}

main()
  .catch((err) => {
    console.error("Falha ao criar usuário:", err.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
