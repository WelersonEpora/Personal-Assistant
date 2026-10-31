"use strict";

const equipeRepository = require("../repositories/equipe.repository");
const storageFoto = require("./storage-foto.service");
const { NotFoundError, ValidationError } = require("../shared/errors");

async function buscarEquipe(equipeId) {
  const equipe = await equipeRepository.findById(equipeId);
  if (!equipe) {
    throw new NotFoundError("Equipe não encontrada.");
  }
  return equipe;
}

async function obterEquipe(equipeId) {
  const equipe = await buscarEquipe(equipeId);
  const totalMembros = await equipeRepository.countMembros(equipeId);
  return { id: equipe.id, nome: equipe.nome, temLogo: Boolean(equipe.logo_caminho), totalMembros };
}

// docs/adr/0030: o que a equipe mostra para o aluno (PDF do Acompanhamento
// Mensal, link da ficha). Qualquer membro lê - não só o owner.
function projetarIdentidade(equipe) {
  return { nome: equipe.nome, temLogo: Boolean(equipe.logo_caminho) };
}

async function obterIdentidade(equipeId) {
  return projetarIdentidade(await buscarEquipe(equipeId));
}

async function atualizarNome(equipeId, nome) {
  if (!nome || !nome.trim()) {
    throw new ValidationError('"nome" é obrigatório.');
  }
  const equipe = await buscarEquipe(equipeId);
  await equipeRepository.update(equipe, { nome: nome.trim() });
  return obterEquipe(equipeId);
}

// Mesma chave a cada upload; trocar de formato (ex.: .jpg → .png) gera outro
// nome de arquivo, então o anterior é apagado para não ficar órfão.
async function atualizarLogo(equipeId, { buffer, mimeType }) {
  if (!storageFoto.mimeSuportado(mimeType)) {
    throw new ValidationError("Formato de imagem não suportado (use JPEG, PNG ou WebP).");
  }
  const equipe = await buscarEquipe(equipeId);
  const anterior = equipe.logo_caminho;
  const logoCaminho = await storageFoto.salvar({ chave: `equipe-${equipe.id}`, buffer, mimeType });
  await equipeRepository.update(equipe, { logo_caminho: logoCaminho });
  if (anterior && anterior !== logoCaminho) {
    await storageFoto.remover(anterior);
  }
  return obterEquipe(equipeId);
}

async function lerLogo(equipe) {
  if (!equipe.logo_caminho) {
    throw new NotFoundError("Equipe não tem logo cadastrado.");
  }
  return storageFoto.ler(equipe.logo_caminho);
}

async function obterLogo(equipeId) {
  return lerLogo(await buscarEquipe(equipeId));
}

async function removerLogo(equipeId) {
  const equipe = await buscarEquipe(equipeId);
  if (!equipe.logo_caminho) {
    throw new NotFoundError("Equipe não tem logo cadastrado.");
  }
  await storageFoto.remover(equipe.logo_caminho);
  await equipeRepository.update(equipe, { logo_caminho: null });
  return obterEquipe(equipeId);
}

module.exports = {
  obterEquipe,
  obterIdentidade,
  projetarIdentidade,
  atualizarNome,
  atualizarLogo,
  obterLogo,
  lerLogo,
  removerLogo
};
