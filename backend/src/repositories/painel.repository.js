"use strict";

// Consultas de agregação do painel (dashboard) - somente leitura, escopadas
// por equipe (docs/adr/0011). Nenhuma tabela nova: só COUNT/subquery sobre o
// que já existe, mesmo padrão dos contadores de aluno.repository.js. Um
// endpoint agregado em vez de o dashboard baixar a lista inteira de relatos
// e calcular no navegador (docs/adr/0017).
const { Op, fn, col, literal } = require("sequelize");
const {
  Aluno,
  Registro,
  RegistroEntrada,
  Validacao,
  FichaTreino,
  Exercicio,
  AvaliacaoFisica,
  AvaliacaoMensal
} = require("../models");

// --------------------------------------------------------------- contadores

async function contarAlunos(equipeId) {
  const [ativos, total] = await Promise.all([
    Aluno.count({ where: { equipe_id: equipeId, ativo: true, deletado_em: null } }),
    Aluno.count({ where: { equipe_id: equipeId, deletado_em: null } })
  ]);
  return { ativos, total };
}

// Relatos confirmados desde `desde` (critério: validacao.confirmado_em, o
// mesmo do ciclo mensal - docs/adr/0015). Conta pela Validacao, com o
// Registro só como filtro de escopo/soft-delete.
function contarRelatosConfirmadosDesde(equipeId, desde) {
  return Validacao.count({
    where: { confirmado_em: { [Op.gte]: desde } },
    include: [{ model: Registro, as: "registro", required: true, attributes: [], where: { equipe_id: equipeId, deletado_em: null } }]
  });
}

function contarRelatosEmProcessamento(equipeId) {
  return Registro.count({
    where: {
      equipe_id: equipeId,
      deletado_em: null,
      status: [Registro.STATUS.RECEBIDO, Registro.STATUS.TRANSCREVENDO, Registro.STATUS.INTERPRETANDO]
    }
  });
}

// Volume de atividade: quantos Registros entraram (foram sincronizados) desde
// `desde`, qualquer status.
function contarRelatosCapturadosDesde(equipeId, desde) {
  return Registro.count({
    where: { equipe_id: equipeId, deletado_em: null, created_at: { [Op.gte]: desde } }
  });
}

// Catálogo visível à equipe: exercícios globais (equipe_id NULL) + próprios,
// só ativos (docs/adr/0013). Fichas ativas: uma por aluno, da equipe.
async function contarCatalogo(equipeId) {
  const [exercicios, fichasAtivas] = await Promise.all([
    Exercicio.count({ where: { deletado_em: null, ativo: true, [Op.or]: [{ equipe_id: null }, { equipe_id: equipeId }] } }),
    FichaTreino.count({ where: { equipe_id: equipeId, ativo: true } })
  ]);
  return { exercicios, fichas_ativas: fichasAtivas };
}

// ------------------------------------------------------------------- listas

// Relatos parados numa etapa que exige o personal. Aguardando revisão: os
// mais antigos primeiro (fila). Com erro: retomáveis via reprocessar.
function listarRelatosAguardandoRevisao(equipeId) {
  return Registro.findAll({
    where: { equipe_id: equipeId, deletado_em: null, status: Registro.STATUS.AGUARDANDO_REVISAO },
    include: [
      { model: Aluno, as: "aluno", attributes: ["id", "nome"] },
      { model: RegistroEntrada, as: "entradas", attributes: ["id"] }
    ],
    order: [["iniciado_em", "ASC"]]
  });
}

function listarRelatosComErro(equipeId) {
  return Registro.findAll({
    where: {
      equipe_id: equipeId,
      deletado_em: null,
      status: [Registro.STATUS.ERRO_TRANSCRICAO, Registro.STATUS.ERRO_INTERPRETACAO]
    },
    include: [{ model: Aluno, as: "aluno", attributes: ["id", "nome"] }],
    order: [["updated_at", "DESC"]]
  });
}

// Uma única varredura dos alunos ATIVOS com os indicadores que o painel
// cruza (sem ficha ativa, ficha antiga, avaliação física vencida, sem relato
// recente, aniversário). Subqueries no lugar de N includes - escala de
// dezenas de alunos por equipe (docs/adr/0011, 1 equipe por usuário hoje).
function listarAlunosAtivosComIndicadores(equipeId) {
  return Aluno.findAll({
    where: { equipe_id: equipeId, ativo: true, deletado_em: null },
    attributes: [
      "id",
      "nome",
      "data_nascimento",
      "dispensa_ficha_treino",
      "dispensa_avaliacao_fisica",
      [
        literal(
          '(SELECT MAX(r.iniciado_em) FROM registro r WHERE r.aluno_id = "Aluno".id AND r.deletado_em IS NULL)'
        ),
        "ultimo_relato_em"
      ],
      [
        literal('(SELECT MAX(af.data) FROM avaliacao_fisica af WHERE af.aluno_id = "Aluno".id)'),
        "ultima_avaliacao_fisica"
      ],
      [
        literal(
          '(SELECT ft.created_at FROM ficha_treino ft WHERE ft.aluno_id = "Aluno".id AND ft.ativo = true LIMIT 1)'
        ),
        "ficha_ativa_desde"
      ]
    ],
    order: [["nome", "ASC"]]
  });
}

// ------------------------------------------------------------- ciclo mensal

// Distribuição de status das avaliações mensais de um mês (docs/adr/0015).
async function resumoAvaliacoesMensaisDoMes(equipeId, anoMes) {
  const linhas = await AvaliacaoMensal.findAll({
    where: { equipe_id: equipeId, ano_mes: anoMes },
    attributes: ["status", [fn("COUNT", col("id")), "total"]],
    group: ["status"],
    raw: true
  });
  const porStatus = { gerada: 0, dados_insuficientes: 0, falha: 0 };
  for (const linha of linhas) {
    porStatus[linha.status] = Number(linha.total);
  }
  return porStatus;
}

function listarAvaliacoesMensaisComFalha(equipeId, anoMes) {
  return AvaliacaoMensal.findAll({
    where: { equipe_id: equipeId, ano_mes: anoMes, status: AvaliacaoMensal.STATUS.FALHA },
    include: [{ model: Aluno, as: "aluno", attributes: ["id", "nome"] }],
    order: [["gerada_em", "DESC"]]
  });
}

// --------------------------------------------------------- atividade recente

// Feed unificado: cada fonte devolve suas linhas recentes (inseridas a partir
// de `desde`); o service mescla por timestamp e limita por tipo. O corte por
// data é pelo `created_at`/`gerada_em` - o que interessa é quando o
// lançamento entrou no sistema, não a data do evento em si (docs/adr/0017).
function relatosRecentes(equipeId, limite, desde) {
  return Registro.findAll({
    where: { equipe_id: equipeId, deletado_em: null, created_at: { [Op.gte]: desde } },
    attributes: ["id", "titulo", "status", "iniciado_em", "created_at"],
    include: [{ model: Aluno, as: "aluno", attributes: ["id", "nome"] }],
    order: [["created_at", "DESC"]],
    limit: limite
  });
}

function avaliacoesFisicasRecentes(equipeId, limite, desde) {
  return AvaliacaoFisica.findAll({
    where: { equipe_id: equipeId, created_at: { [Op.gte]: desde } },
    attributes: ["id", "data", "origem", "created_at"],
    include: [{ model: Aluno, as: "aluno", attributes: ["id", "nome"] }],
    order: [["created_at", "DESC"]],
    limit: limite
  });
}

function fichasRecentes(equipeId, limite, desde) {
  return FichaTreino.findAll({
    where: { equipe_id: equipeId, created_at: { [Op.gte]: desde } },
    attributes: ["id", "nome", "ativo", "created_at"],
    include: [{ model: Aluno, as: "aluno", attributes: ["id", "nome"] }],
    order: [["created_at", "DESC"]],
    limit: limite
  });
}

function avaliacoesMensaisRecentes(equipeId, limite, desde) {
  return AvaliacaoMensal.findAll({
    where: { equipe_id: equipeId, status: AvaliacaoMensal.STATUS.GERADA, gerada_em: { [Op.gte]: desde } },
    attributes: ["id", "ano_mes", "gerada_em"],
    include: [{ model: Aluno, as: "aluno", attributes: ["id", "nome"] }],
    order: [["gerada_em", "DESC"]],
    limit: limite
  });
}

module.exports = {
  contarAlunos,
  contarRelatosConfirmadosDesde,
  contarRelatosEmProcessamento,
  contarRelatosCapturadosDesde,
  contarCatalogo,
  listarRelatosAguardandoRevisao,
  listarRelatosComErro,
  listarAlunosAtivosComIndicadores,
  resumoAvaliacoesMensaisDoMes,
  listarAvaliacoesMensaisComFalha,
  relatosRecentes,
  avaliacoesFisicasRecentes,
  fichasRecentes,
  avaliacoesMensaisRecentes
};
