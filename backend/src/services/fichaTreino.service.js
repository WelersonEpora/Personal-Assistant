"use strict";

const fichaTreinoRepository = require("../repositories/fichaTreino.repository");
const exercicioRepository = require("../repositories/exercicio.repository");
const alunoRepository = require("../repositories/aluno.repository");
const { FichaTreinoGrupo } = require("../models");
const { NotFoundError, ValidationError, ConflictError } = require("../shared/errors");

const TIPOS = FichaTreinoGrupo.TIPOS;
const NOMES_TIPO = {
  [TIPOS.SIMPLES]: "Exercício simples",
  [TIPOS.BISET]: "Bi-set",
  [TIPOS.TRISET]: "Tri-set",
  [TIPOS.CIRCUITO]: "Circuito"
};
const LIMITE_TEXTO_CURTO = 30;

async function verificarAluno(equipeId, alunoId) {
  const aluno = await alunoRepository.findByIdAndEquipe(alunoId, equipeId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }
  return aluno;
}

async function listarPorAluno(equipeId, alunoId) {
  await verificarAluno(equipeId, alunoId);
  return fichaTreinoRepository.listarPorAluno({ alunoId, equipeId });
}

async function listarAtivas(equipeId, alunoId) {
  await verificarAluno(equipeId, alunoId);
  return fichaTreinoRepository.listarAtivasPorAluno({ alunoId, equipeId });
}

async function obterDetalhe(equipeId, fichaId) {
  const ficha = await fichaTreinoRepository.obterPorIdEquipe({ id: fichaId, equipeId });
  if (!ficha) {
    throw new NotFoundError("Ficha de treino não encontrada.");
  }
  return ficha;
}

// docs/adr/0026: o tipo é escolha do personal; a quantidade de exercícios é
// conferida aqui (simples = 1, bi-set = 2, tri-set = 3, circuito ≥ 2).
function quantidadeValida(tipo, quantidade) {
  if (tipo === TIPOS.SIMPLES) return quantidade === 1;
  if (tipo === TIPOS.BISET) return quantidade === 2;
  if (tipo === TIPOS.TRISET) return quantidade === 3;
  return quantidade >= 2;
}

function textoCurto(valor, campo, posicao) {
  if (valor === undefined || valor === null || String(valor).trim() === "") return null;
  const texto = String(valor).trim();
  if (texto.length > LIMITE_TEXTO_CURTO) {
    throw new ValidationError(`Grupo ${posicao}: "${campo}" aceita no máximo ${LIMITE_TEXTO_CURTO} caracteres.`);
  }
  return texto;
}

function normalizarGrupos(grupos) {
  if (!Array.isArray(grupos) || grupos.length === 0) {
    throw new ValidationError('"grupos" precisa ser uma lista com pelo menos um exercício.');
  }

  return grupos.map((grupo, indice) => {
    const posicao = indice + 1;
    const tipo = grupo?.tipo || TIPOS.SIMPLES;
    if (!NOMES_TIPO[tipo]) {
      throw new ValidationError(`Grupo ${posicao}: tipo "${tipo}" inválido.`);
    }

    const itens = grupo.itens;
    if (!Array.isArray(itens) || itens.length === 0) {
      throw new ValidationError(`Grupo ${posicao}: precisa ter pelo menos um exercício.`);
    }
    if (!quantidadeValida(tipo, itens.length)) {
      throw new ValidationError(`Grupo ${posicao}: ${NOMES_TIPO[tipo]} não pode ter ${itens.length} exercício(s).`);
    }
    if (itens.some((item) => !item?.exercicioId)) {
      throw new ValidationError('Cada item precisa informar "exercicioId".');
    }

    let series = null;
    if (grupo.series !== undefined && grupo.series !== null && grupo.series !== "") {
      series = Number(grupo.series);
      if (!Number.isInteger(series) || series < 1) {
        throw new ValidationError(`Grupo ${posicao}: séries/voltas precisa ser um número inteiro positivo.`);
      }
    }

    return {
      tipo,
      series,
      descanso: textoCurto(grupo.descanso, "descanso", posicao),
      observacoes: grupo.observacoes ? String(grupo.observacoes).trim() || null : null,
      itens: itens.map((item) => ({
        exercicioId: item.exercicioId,
        repeticoes: textoCurto(item.repeticoes, "repeticoes", posicao),
        cargaObs: item.cargaObs ? String(item.cargaObs).trim() || null : null
      }))
    };
  });
}

// Toda atualização relevante cria uma nova versão da ficha - a anterior é
// preservada como histórico, nunca sobrescrita (docs/adr/0013). Com
// `substituiFichaId`, a nova versão desativa só aquela ficha; sem, a ficha
// nova soma às ativas do aluno (docs/adr/0026).
async function criarNovaVersao(equipeId, usuarioId, alunoId, { nome, observacoes, substituiFichaId, grupos }) {
  await verificarAluno(equipeId, alunoId);

  const gruposNormalizados = normalizarGrupos(grupos);

  const exerciciosIds = [...new Set(gruposNormalizados.flatMap((grupo) => grupo.itens.map((item) => item.exercicioId)))];
  const exerciciosSelecionaveis = await exercicioRepository.findSelecionaveisPorIds(exerciciosIds, equipeId);
  const idsEncontrados = new Set(exerciciosSelecionaveis.map((exercicio) => exercicio.id));
  const idsInvalidos = exerciciosIds.filter((id) => !idsEncontrados.has(id));
  if (idsInvalidos.length > 0) {
    throw new ValidationError(
      "Um ou mais exercícios selecionados não existem, estão inativos, ou não pertencem à sua equipe.",
      { exerciciosIds: idsInvalidos }
    );
  }

  if (substituiFichaId) {
    const substituida = await fichaTreinoRepository.obterPorIdEquipe({ id: substituiFichaId, equipeId });
    if (!substituida || substituida.aluno_id !== alunoId) {
      throw new NotFoundError("Ficha de treino a substituir não encontrada.");
    }
    if (!substituida.ativo) {
      throw new ConflictError("Esta ficha já foi substituída ou arquivada. Recarregue a página.");
    }
  }

  const ficha = await fichaTreinoRepository.criarNovaVersao({
    alunoId,
    equipeId,
    criadoPor: usuarioId,
    nome: nome ? String(nome).trim() : null,
    observacoes: observacoes ? String(observacoes).trim() : null,
    substituiFichaId: substituiFichaId || null,
    grupos: gruposNormalizados
  });

  return obterDetalhe(equipeId, ficha.id);
}

// Desliga a ficha sem substituta - a divisão encolheu (docs/adr/0026). A ficha
// continua no histórico, intacta.
async function arquivar(equipeId, fichaId) {
  const ficha = await obterDetalhe(equipeId, fichaId);
  if (!ficha.ativo) {
    throw new ConflictError("Esta ficha já não está ativa.");
  }
  await fichaTreinoRepository.arquivar({ id: fichaId, equipeId });
  return obterDetalhe(equipeId, fichaId);
}

module.exports = { listarPorAluno, listarAtivas, obterDetalhe, criarNovaVersao, arquivar };
