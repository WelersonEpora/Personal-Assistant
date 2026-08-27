"use strict";

const fichaAcessoLinkRepository = require("../repositories/fichaAcessoLink.repository");
const alunoRepository = require("../repositories/aluno.repository");
const { gerarTokenSeguro } = require("../shared/utils/token-seguro");
const { NotFoundError, ValidationError } = require("../shared/errors");

// docs/adr/0014-acesso-aluno-ficha-por-link.md - lado do personal (rotas
// autenticadas, escopadas por equipe). Qualquer membro da equipe do aluno
// pode gerar/ver/revogar; sem controle por papel (coerente com ADR-0011).

const DIAS_VALIDADE_PADRAO = 7;
const DIAS_VALIDADE_MAXIMO = 30;

async function verificarAluno(equipeId, alunoId) {
  const aluno = await alunoRepository.findByIdAndEquipe(alunoId, equipeId);
  if (!aluno) {
    // Mesma mensagem para "não existe" e "é de outra equipe" - não revela a
    // diferença (mesmo critério do resto do sistema).
    throw new NotFoundError("Aluno não encontrado.");
  }
  return aluno;
}

// Projeção devolvida ao personal - inclui o token (para recopiar o link) e
// o status calculado. Nunca devolve o objeto do banco cru.
function serializar(link) {
  if (!link) return null;
  const agora = new Date();
  let status = "ativo";
  if (link.revogado_em) status = "revogado";
  else if (!link.utilizavel(agora)) status = "expirado";

  return {
    token: link.token,
    status,
    expira_em: link.expira_em,
    revogado_em: link.revogado_em,
    created_at: link.created_at
  };
}

async function obter(equipeId, alunoId) {
  await verificarAluno(equipeId, alunoId);
  const link = await fichaAcessoLinkRepository.obterAtivoPorAluno({ alunoId, equipeId });
  // Um link já expirado (mas não revogado) ainda é o "atual" - o personal
  // vê que expirou e decide gerar outro.
  return serializar(link);
}

async function gerar(equipeId, usuarioId, alunoId, { diasValidade } = {}) {
  await verificarAluno(equipeId, alunoId);

  let dias = DIAS_VALIDADE_PADRAO;
  if (diasValidade !== undefined && diasValidade !== null && diasValidade !== "") {
    dias = Number(diasValidade);
    if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_VALIDADE_MAXIMO) {
      throw new ValidationError(`"diasValidade" precisa ser um inteiro entre 1 e ${DIAS_VALIDADE_MAXIMO}.`);
    }
  }

  const expiraEm = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  const link = await fichaAcessoLinkRepository.gerarNovo({
    alunoId,
    equipeId,
    criadoPor: usuarioId,
    token: gerarTokenSeguro(),
    expiraEm
  });

  return serializar(link);
}

async function revogar(equipeId, alunoId) {
  await verificarAluno(equipeId, alunoId);
  const afetados = await fichaAcessoLinkRepository.revogarPorAluno({ alunoId, equipeId });
  if (afetados === 0) {
    throw new NotFoundError("Este aluno não tem um link ativo para revogar.");
  }
}

module.exports = { obter, gerar, revogar, DIAS_VALIDADE_PADRAO, DIAS_VALIDADE_MAXIMO };
