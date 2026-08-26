"use strict";

const bcrypt = require("bcryptjs");
const membroRepository = require("../repositories/membro.repository");
const storageFoto = require("./storage-foto.service");
const { Membro } = require("../models");
const { NotFoundError, ValidationError, ConflictError } = require("../shared/errors");

const PAPEL_VALIDOS = Object.values(Membro.PAPEL);

function listarMembros(equipeId) {
  return membroRepository.findAllByEquipe(equipeId);
}

async function obterMembro(equipeId, id) {
  const membro = await membroRepository.findByIdAndEquipe(id, equipeId);
  if (!membro) {
    throw new NotFoundError("Membro não encontrado.");
  }
  return membro;
}

// Reaproveitada pelo branch "--equipe-de" de scripts/criar-usuario.js -
// única lógica de criação de membro, sem duplicar regra entre CLI e API.
async function criarMembro(equipeId, { nome, email, senha, especialidade, papel }) {
  if (!nome || !nome.trim()) {
    throw new ValidationError('"nome" é obrigatório.');
  }
  if (!email || !email.trim()) {
    throw new ValidationError('"email" é obrigatório.');
  }
  if (!senha || senha.length < 8) {
    throw new ValidationError('"senha" precisa ter ao menos 8 caracteres.');
  }
  const papelFinal = papel || Membro.PAPEL.COLABORADOR;
  if (!PAPEL_VALIDOS.includes(papelFinal)) {
    throw new ValidationError(`"papel" deve ser um entre: ${PAPEL_VALIDOS.join(", ")}.`);
  }

  const emailNormalizado = email.trim().toLowerCase();
  const existente = await membroRepository.findUsuarioPorEmail(emailNormalizado);
  if (existente) {
    throw new ConflictError("Já existe um usuário com este e-mail.");
  }

  const senha_hash = await bcrypt.hash(senha, 10);

  return membroRepository.sequelize.transaction((transaction) =>
    membroRepository.criarComUsuario(
      { equipeId, nome: nome.trim(), email: emailNormalizado, senha_hash, especialidade, papel: papelFinal },
      transaction
    )
  );
}

async function atualizarMembro(equipeId, id, dados) {
  const membro = await obterMembro(equipeId, id);

  const atualizacaoUsuario = {};
  if (dados.nome !== undefined) {
    if (!dados.nome || !dados.nome.trim()) {
      throw new ValidationError('"nome" não pode ficar vazio.');
    }
    atualizacaoUsuario.nome = dados.nome.trim();
  }
  if (dados.email !== undefined) {
    if (!dados.email || !dados.email.trim()) {
      throw new ValidationError('"email" não pode ficar vazio.');
    }
    const emailNormalizado = dados.email.trim().toLowerCase();
    if (emailNormalizado !== membro.usuario.email) {
      const existente = await membroRepository.findUsuarioPorEmail(emailNormalizado);
      if (existente) {
        throw new ConflictError("Já existe um usuário com este e-mail.");
      }
    }
    atualizacaoUsuario.email = emailNormalizado;
  }
  if (dados.especialidade !== undefined) atualizacaoUsuario.especialidade = dados.especialidade || null;
  if (dados.senha !== undefined && dados.senha !== "") {
    if (dados.senha.length < 8) {
      throw new ValidationError('"senha" precisa ter ao menos 8 caracteres.');
    }
    atualizacaoUsuario.senha_hash = await bcrypt.hash(dados.senha, 10);
  }

  const atualizacaoMembro = {};
  if (dados.papel !== undefined) {
    if (!PAPEL_VALIDOS.includes(dados.papel)) {
      throw new ValidationError(`"papel" deve ser um entre: ${PAPEL_VALIDOS.join(", ")}.`);
    }
    atualizacaoMembro.papel = dados.papel;
  }
  if (dados.ativo !== undefined) atualizacaoMembro.ativo = Boolean(dados.ativo);

  const papelFinal = atualizacaoMembro.papel ?? membro.papel;
  const ativoFinal = atualizacaoMembro.ativo ?? membro.ativo;
  const eraOwnerAtivo = membro.papel === Membro.PAPEL.OWNER && membro.ativo;
  const continuaOwnerAtivo = papelFinal === Membro.PAPEL.OWNER && ativoFinal;
  if (eraOwnerAtivo && !continuaOwnerAtivo) {
    const outrosOwnersAtivos = await membroRepository.countOwnersAtivos(equipeId, membro.id);
    if (outrosOwnersAtivos === 0) {
      throw new ValidationError("A equipe precisa de ao menos um owner ativo.");
    }
  }

  await membroRepository.sequelize.transaction(async (transaction) => {
    if (Object.keys(atualizacaoUsuario).length) {
      await membroRepository.atualizarUsuario(membro.usuario, atualizacaoUsuario, transaction);
    }
    if (Object.keys(atualizacaoMembro).length) {
      await membroRepository.atualizarMembro(membro, atualizacaoMembro, transaction);
    }
  });

  return obterMembro(equipeId, id);
}

async function atualizarFotoMembro(equipeId, id, { buffer, mimeType }) {
  const membro = await obterMembro(equipeId, id);
  if (!storageFoto.mimeSuportado(mimeType)) {
    throw new ValidationError("Formato de imagem não suportado - use JPEG, PNG ou WebP.");
  }
  const fotoCaminho = await storageFoto.salvar({ chave: `usuario-${membro.usuario.id}`, buffer, mimeType });
  await membroRepository.atualizarUsuario(membro.usuario, { foto_caminho: fotoCaminho });
  return obterMembro(equipeId, id);
}

async function obterFotoMembro(equipeId, id) {
  const membro = await obterMembro(equipeId, id);
  if (!membro.usuario.foto_caminho) {
    throw new NotFoundError("Membro não tem foto cadastrada.");
  }
  return storageFoto.ler(membro.usuario.foto_caminho);
}

async function removerFotoMembro(equipeId, id) {
  const membro = await obterMembro(equipeId, id);
  if (!membro.usuario.foto_caminho) {
    throw new NotFoundError("Membro não tem foto cadastrada.");
  }
  await storageFoto.remover(membro.usuario.foto_caminho);
  await membroRepository.atualizarUsuario(membro.usuario, { foto_caminho: null });
  return obterMembro(equipeId, id);
}

module.exports = {
  listarMembros,
  obterMembro,
  criarMembro,
  atualizarMembro,
  atualizarFotoMembro,
  obterFotoMembro,
  removerFotoMembro
};
