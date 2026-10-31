"use strict";

// docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md
//
// Portão humano entre a avaliação mensal da IA (ADR-0015) e o aluno. O
// personal escreve um comentário e escolhe quais itens da avaliação vão no
// PDF; só então o PDF pode ser gerado (no cliente, "salvar como PDF" do
// navegador). NUNCA cria `validacao` nem torna a avaliação oficial (ADR-0007) -
// só habilita o compartilhamento e realimenta o próximo ciclo mensal.
const revisaoRepository = require("../repositories/revisaoAvaliacaoMensal.repository");
const avaliacaoMensalRepository = require("../repositories/avaliacaoMensal.repository");
const alunoRepository = require("../repositories/aluno.repository");
const { NotFoundError, ValidationError } = require("../shared/errors");

const COMENTARIO_MAXIMO = 5000;
const MAX_ITENS_EXCLUIDOS = 200;
const MAX_CHAVE = 120;

function normalizarComentario(comentario) {
  const limpo = typeof comentario === "string" ? comentario.trim() : "";
  if (!limpo) {
    throw new ValidationError('"comentario" é obrigatório.');
  }
  if (limpo.length > COMENTARIO_MAXIMO) {
    throw new ValidationError(`"comentario" não pode passar de ${COMENTARIO_MAXIMO} caracteres.`);
  }
  return limpo;
}

function normalizarItensExcluidos(itens) {
  if (itens == null) return [];
  if (!Array.isArray(itens)) {
    throw new ValidationError('"itens_excluidos" deve ser uma lista.');
  }
  if (itens.length > MAX_ITENS_EXCLUIDOS) {
    throw new ValidationError(`"itens_excluidos" não pode ter mais de ${MAX_ITENS_EXCLUIDOS} itens.`);
  }
  const chaves = itens.map((chave) => {
    if (typeof chave !== "string" || !chave.trim() || chave.length > MAX_CHAVE) {
      throw new ValidationError('Cada item de "itens_excluidos" deve ser um texto curto não vazio.');
    }
    return chave.trim();
  });
  return [...new Set(chaves)];
}

async function verificarAluno(equipeId, alunoId) {
  const aluno = await alunoRepository.findByIdAndEquipe(alunoId, equipeId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }
  return aluno;
}

// A avaliação da IA precisa existir E estar "gerada" - `dados_insuficientes` e
// `falha` não têm o que compartilhar.
async function obterAvaliacaoCompartilhavel(equipeId, alunoId, anoMes) {
  const avaliacao = await avaliacaoMensalRepository.obterPorMes({ alunoId, equipeId, anoMes });
  if (!avaliacao) {
    throw new NotFoundError("Nenhum Acompanhamento Mensal para este aluno neste mês.");
  }
  return avaliacao;
}

// Avaliação regerada depois da revisão -> revisão desatualizada (a tela trava
// o PDF até revisar de novo).
function estaDesatualizada(revisao, avaliacao) {
  if (!revisao) return false;
  return new Date(avaliacao.gerada_em).getTime() > new Date(revisao.avaliacao_gerada_em).getTime();
}

async function obter(equipeId, alunoId, anoMes) {
  await verificarAluno(equipeId, alunoId);
  const avaliacao = await obterAvaliacaoCompartilhavel(equipeId, alunoId, anoMes);
  const revisao = await revisaoRepository.obterPorAvaliacao(avaliacao.id);
  return { revisao, desatualizada: estaDesatualizada(revisao, avaliacao) };
}

async function salvar(equipeId, alunoId, anoMes, autorId, corpo) {
  await verificarAluno(equipeId, alunoId);
  const avaliacao = await obterAvaliacaoCompartilhavel(equipeId, alunoId, anoMes);
  if (avaliacao.status !== "gerada") {
    throw new ValidationError(
      "Só é possível compartilhar um Acompanhamento Mensal que a IA conseguiu gerar " +
        `(status atual: ${avaliacao.status}).`
    );
  }

  const comentario = normalizarComentario(corpo && corpo.comentario);
  const itensExcluidos = normalizarItensExcluidos(corpo && corpo.itens_excluidos);

  const revisao = await revisaoRepository.salvar({
    avaliacaoMensalId: avaliacao.id,
    alunoId,
    equipeId,
    autorId,
    comentario,
    itensExcluidos,
    avaliacaoGeradaEm: avaliacao.gerada_em
  });

  return { revisao, desatualizada: false };
}

async function excluir(equipeId, alunoId, anoMes) {
  await verificarAluno(equipeId, alunoId);
  const avaliacao = await obterAvaliacaoCompartilhavel(equipeId, alunoId, anoMes);
  const revisao = await revisaoRepository.obterPorAvaliacao(avaliacao.id);
  if (!revisao) {
    throw new NotFoundError("Este Acompanhamento Mensal ainda não foi preparado para compartilhamento.");
  }
  await revisaoRepository.excluir(revisao);
}

module.exports = { obter, salvar, excluir, estaDesatualizada };
