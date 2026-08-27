"use strict";

const fichaAcessoLinkRepository = require("../repositories/fichaAcessoLink.repository");
const fichaTreinoRepository = require("../repositories/fichaTreino.repository");
const storageExercicioImagem = require("./storage-exercicio-imagem.service");
const { AppError, NotFoundError } = require("../shared/errors");

// docs/adr/0014-acesso-aluno-ficha-por-link.md - endpoint PÚBLICO (sem
// autenticação). O único identificador que o cliente manda é o token; tudo
// o mais (aluno, equipe, ficha) é resolvido no servidor a partir dele.
// Não existe caminho onde um id vindo da URL selecione dados - por isso não
// dá para "trocar um id" e ver outro aluno.

const MSG_SOLICITAR_NOVO = "Este link não está mais ativo. Solicite um novo link ao seu personal.";

// Resolve o token para o link, aplicando as regras de utilização. Lança
// erros com códigos distintos (a tela pública usa para a mensagem certa).
async function resolverLinkUtilizavel(token) {
  const link = await fichaAcessoLinkRepository.obterPorToken(token);
  if (!link) {
    throw new AppError("Link inválido.", 404, "LINK_INVALIDO");
  }
  if (link.revogado_em) {
    throw new AppError(MSG_SOLICITAR_NOVO, 410, "LINK_REVOGADO");
  }
  if (!link.utilizavel()) {
    throw new AppError(MSG_SOLICITAR_NOVO, 410, "LINK_EXPIRADO");
  }
  return link;
}

const CAMPO_IMAGEM_POR_POSICAO = { inicio: "midia_imagem_inicio_caminho", fim: "midia_imagem_fim_caminho" };

// Lista branca explícita (docs/adr/0014): o aluno vê só o destinado à
// consulta, nunca o objeto do banco cru. Ficam de fora qualquer UUID além
// de exercicio.id (necessário só para buscar a imagem via endpoint escopado
// pelo token), criado_por / nome do personal, equipe_id, ids de ficha,
// timestamps internos, catálogo e histórico de fichas.
function projetarItem(item) {
  const exercicio = item.exercicio;
  return {
    ordem: item.ordem,
    series: item.series,
    repeticoes: item.repeticoes,
    cargaObs: item.carga_obs,
    exercicio: {
      id: exercicio.id,
      nome: exercicio.nome,
      grupoMuscular: exercicio.grupo_muscular,
      equipamento: exercicio.equipamento,
      instrucoes: exercicio.instrucoes,
      temImagemInicio: Boolean(exercicio.midia_imagem_inicio_caminho),
      temImagemFim: Boolean(exercicio.midia_imagem_fim_caminho),
      videoUrl: exercicio.midia_video_url
    }
  };
}

async function obterFicha(token) {
  const link = await resolverLinkUtilizavel(token);

  const aluno = await link.getAluno();
  // Aluno excluído (soft-delete) - trata como link sem conteúdo, não expõe nada.
  if (!aluno || aluno.deletado_em) {
    return { aluno: null, ficha: null };
  }

  const ficha = await fichaTreinoRepository.obterAtivaPorAluno({
    alunoId: link.aluno_id,
    equipeId: link.equipe_id
  });

  return {
    aluno: { nome: aluno.nome },
    ficha: ficha
      ? {
          nome: ficha.nome,
          observacoes: ficha.observacoes,
          atualizadaEm: ficha.created_at,
          itens: (ficha.itens || []).map(projetarItem)
        }
      : null
  };
}

// Stream da imagem de um exercício - só serve se o exercício pertence a um
// item da ficha ATIVA daquele token. Não é um proxy aberto para qualquer
// exercicio.id (docs/adr/0014).
async function obterImagemDoExercicio(token, exercicioId, posicao) {
  const campo = CAMPO_IMAGEM_POR_POSICAO[posicao];
  if (!campo) {
    throw new NotFoundError("Imagem não encontrada.");
  }

  const link = await resolverLinkUtilizavel(token);
  const ficha = await fichaTreinoRepository.obterAtivaPorAluno({
    alunoId: link.aluno_id,
    equipeId: link.equipe_id
  });

  const item = (ficha?.itens || []).find((entrada) => entrada.exercicio && entrada.exercicio.id === exercicioId);
  if (!item) {
    // Exercício não está na ficha deste aluno - mesma resposta de "não existe".
    throw new NotFoundError("Imagem não encontrada.");
  }

  const caminho = item.exercicio[campo];
  if (!caminho) {
    throw new NotFoundError("Imagem não encontrada.");
  }
  return storageExercicioImagem.ler(caminho);
}

module.exports = { obterFicha, obterImagemDoExercicio };
