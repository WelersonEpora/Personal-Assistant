"use strict";

const fichaAcessoLinkRepository = require("../repositories/fichaAcessoLink.repository");
const fichaTreinoRepository = require("../repositories/fichaTreino.repository");
const storageExercicioImagem = require("./storage-exercicio-imagem.service");
const equipeService = require("./equipe.service");
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
// pelo token), criado_por / nome do personal, equipe_id, ids de ficha e de
// grupo, timestamps internos, catálogo e histórico de fichas.
function projetarItem(item) {
  const exercicio = item.exercicio;
  return {
    ordem: item.ordem,
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

// docs/adr/0026: séries/voltas e descanso são do grupo.
function projetarGrupo(grupo) {
  return {
    ordem: grupo.ordem,
    tipo: grupo.tipo,
    series: grupo.series,
    descanso: grupo.descanso,
    observacoes: grupo.observacoes,
    itens: (grupo.itens || []).map(projetarItem)
  };
}

function projetarFicha(ficha) {
  return {
    nome: ficha.nome,
    observacoes: ficha.observacoes,
    atualizadaEm: ficha.created_at,
    grupos: (ficha.grupos || []).map(projetarGrupo)
  };
}

function listarAtivasDoLink(link) {
  return fichaTreinoRepository.listarAtivasPorAluno({ alunoId: link.aluno_id, equipeId: link.equipe_id });
}

// O link aponta para o aluno (docs/adr/0014) e devolve TODAS as fichas ativas
// dele (docs/adr/0026 - divisão de treino), na ordem do nome.
async function obterFicha(token) {
  const link = await resolverLinkUtilizavel(token);

  const aluno = await link.getAluno();
  // Aluno excluído (soft-delete) - trata como link sem conteúdo, não expõe nada.
  if (!aluno || aluno.deletado_em) {
    return { aluno: null, equipe: null, fichas: [] };
  }

  const [fichas, equipe] = await Promise.all([listarAtivasDoLink(link), link.getEquipe()]);
  return {
    aluno: { nome: aluno.nome },
    // docs/adr/0030: identidade visual de quem atende o aluno - nome e se há
    // logo (servido por obterLogo, escopado pelo mesmo token). Sem id.
    equipe: equipeService.projetarIdentidade(equipe),
    fichas: fichas.map(projetarFicha)
  };
}

// Stream da imagem de um exercício - só serve se o exercício pertence a um
// item de uma ficha ATIVA daquele token. Não é um proxy aberto para qualquer
// exercicio.id (docs/adr/0014).
async function obterImagemDoExercicio(token, exercicioId, posicao) {
  const campo = CAMPO_IMAGEM_POR_POSICAO[posicao];
  if (!campo) {
    throw new NotFoundError("Imagem não encontrada.");
  }

  const link = await resolverLinkUtilizavel(token);
  const fichas = await listarAtivasDoLink(link);

  const item = fichas
    .flatMap((ficha) => ficha.grupos || [])
    .flatMap((grupo) => grupo.itens || [])
    .find((entrada) => entrada.exercicio && entrada.exercicio.id === exercicioId);
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

// docs/adr/0030: logo da equipe dona do link. A equipe sai do token, nunca
// da URL - mesmas regras de utilização do link (expirado/revogado não serve).
async function obterLogo(token) {
  const link = await resolverLinkUtilizavel(token);
  const aluno = await link.getAluno();
  if (!aluno || aluno.deletado_em) {
    throw new NotFoundError("Logo não encontrado.");
  }
  return equipeService.lerLogo(await link.getEquipe());
}

module.exports = { obterFicha, obterImagemDoExercicio, obterLogo };
