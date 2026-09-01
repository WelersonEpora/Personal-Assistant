"use strict";

// docs/adr/0020-tela-de-atendimentos.md - agregações somente leitura sobre
// `registro` para a tela de Atendimentos. Nenhuma tabela nova: COUNT /
// COUNT(DISTINCT) / COUNT(*) FILTER / GROUP BY date_trunc / EXTRACT(DOW),
// escopadas por equipe (docs/adr/0011). Mesmo espírito do painel.repository
// (docs/adr/0017) - nada de escrita, não toca `resultado_ia`/`validacao`.
//
// Eixo temporal SEMPRE `data_atendimento` (docs/adr/0019) - "quando o
// atendimento aconteceu", não quando o relato entrou. As duas trilhas
// (`tipo = atendimento` e `tipo = avaliacao_fisica`) são contadas separadas
// em toda consulta - avaliação física não é "aula".
const { Op, literal } = require("sequelize");
const { Registro, Aluno, Usuario, Membro } = require("../models");

// Filtro base: sempre escopo de equipe + soft-delete + janela de data. `de` e
// `ate` são "AAAA-MM-DD" (inclusive nos dois extremos).
function construirWhere({ equipeId, de, ate, alunoId, usuarioId, tipo, somenteConfirmados }) {
  const where = {
    equipe_id: equipeId,
    deletado_em: null,
    data_atendimento: { [Op.between]: [de, ate] }
  };
  if (alunoId) where.aluno_id = alunoId;
  // docs/adr/0020 (adendo): `usuario_id` = "quem capturou o Registro"
  // (auditoria, docs/adr/0011) - lente por personal, não controle de acesso.
  if (usuarioId) where.usuario_id = usuarioId;
  if (tipo) where.tipo = tipo;
  if (somenteConfirmados) where.status = Registro.STATUS.CONFIRMADO;
  return where;
}

const CONTA_ATENDIMENTO = "COUNT(*) FILTER (WHERE tipo = 'atendimento')";
const CONTA_AVALIACAO = "COUNT(*) FILTER (WHERE tipo = 'avaliacao_fisica')";

// Expressão do bucket temporal - a granularidade é escolhida no service a
// partir do tamanho do período, nunca vem do cliente (literal seguro).
function expressaoBucket(granularidade) {
  if (granularidade === "dia") return "to_char(data_atendimento, 'YYYY-MM-DD')";
  if (granularidade === "semana") {
    return "to_char(date_trunc('week', data_atendimento::timestamp), 'YYYY-MM-DD')";
  }
  return "to_char(data_atendimento, 'YYYY-MM')";
}

// KPIs do topo. `alunos_atendidos` e `dias_com_atividade` olham só a trilha de
// atendimento (a distribuição de 3 avaliações/mês não diz nada).
async function resumo(filtros) {
  const [linha] = await Registro.findAll({
    attributes: [
      [literal(CONTA_ATENDIMENTO), "atendimentos"],
      [literal(CONTA_AVALIACAO), "avaliacoes_fisicas"],
      [literal("COUNT(DISTINCT aluno_id) FILTER (WHERE tipo = 'atendimento')"), "alunos_atendidos"],
      [literal("COUNT(DISTINCT data_atendimento) FILTER (WHERE tipo = 'atendimento')"), "dias_com_atividade"]
    ],
    where: construirWhere(filtros),
    raw: true
  });
  return {
    atendimentos: Number(linha.atendimentos),
    avaliacoes_fisicas: Number(linha.avaliacoes_fisicas),
    alunos_atendidos: Number(linha.alunos_atendidos),
    dias_com_atividade: Number(linha.dias_com_atividade)
  };
}

// Série do gráfico temporal - uma linha por bucket presente (o service
// preenche os buckets vazios do intervalo).
function porBucket(filtros, granularidade) {
  const expr = expressaoBucket(granularidade);
  return Registro.findAll({
    attributes: [
      [literal(expr), "bucket"],
      [literal(CONTA_ATENDIMENTO), "atendimento"],
      [literal(CONTA_AVALIACAO), "avaliacao_fisica"]
    ],
    where: construirWhere(filtros),
    group: [literal(expr)],
    order: [literal(`${expr} ASC`)],
    raw: true
  });
}

// Uma linha por aluno com atividade no período. Sem JOIN aqui - os nomes vêm
// de `nomesAlunos` (evita alias de include em query agregada com raw).
function porAluno(filtros) {
  return Registro.findAll({
    attributes: [
      "aluno_id",
      [literal(CONTA_ATENDIMENTO), "atendimentos"],
      [literal(CONTA_AVALIACAO), "avaliacoes_fisicas"],
      [literal("COUNT(DISTINCT data_atendimento) FILTER (WHERE tipo = 'atendimento')"), "dias_distintos"],
      [literal("to_char(MIN(data_atendimento), 'YYYY-MM-DD')"), "primeiro"],
      [literal("to_char(MAX(data_atendimento), 'YYYY-MM-DD')"), "ultimo"]
    ],
    where: construirWhere(filtros),
    group: ["aluno_id"],
    raw: true
  });
}

// Nomes dos alunos das linhas de `porAluno`. SEM filtro de `deletado_em` - o
// histórico de trabalho não some quando o aluno é excluído depois
// (docs/adr/0020). `deletado_em` volta junto para a UI poder marcar.
function nomesAlunos(ids) {
  return Aluno.findAll({ where: { id: ids }, attributes: ["id", "nome", "deletado_em"], raw: true });
}

// docs/adr/0020 (adendo) - uma linha por personal (usuario_id do Registro)
// com atividade no período. Mesmo par de métricas do `porAluno`. Sem JOIN:
// os nomes vêm de `nomesMembros`. Respeita todos os filtros ativos (inclusive
// `membro_id`, caso em que a lista tem no máximo uma linha).
function porMembro(filtros) {
  return Registro.findAll({
    attributes: [
      "usuario_id",
      [literal(CONTA_ATENDIMENTO), "atendimentos"],
      [literal(CONTA_AVALIACAO), "avaliacoes_fisicas"],
      [literal("COUNT(DISTINCT data_atendimento) FILTER (WHERE tipo = 'atendimento')"), "dias_distintos"],
      [literal("COUNT(DISTINCT aluno_id) FILTER (WHERE tipo = 'atendimento')"), "alunos_distintos"],
      [literal("to_char(MIN(data_atendimento), 'YYYY-MM-DD')"), "primeiro"],
      [literal("to_char(MAX(data_atendimento), 'YYYY-MM-DD')"), "ultimo"]
    ],
    where: construirWhere(filtros),
    group: ["usuario_id"],
    raw: true
  });
}

// Nomes dos personais das linhas de `porMembro`. Um Registro antigo pode ter
// `usuario_id` de alguém que já saiu da equipe - o nome ainda aparece (o
// trabalho feito não some); a UI marca quando não há mais `membro` ativo.
async function nomesMembros(ids, equipeId) {
  const [usuarios, membros] = await Promise.all([
    Usuario.findAll({ where: { id: ids }, attributes: ["id", "nome"], raw: true }),
    Membro.findAll({
      where: { usuario_id: ids, equipe_id: equipeId },
      attributes: ["usuario_id", "ativo"],
      raw: true
    })
  ]);
  const ativoPorUsuario = new Map(membros.map((m) => [m.usuario_id, m.ativo]));
  return usuarios.map((u) => ({
    id: u.id,
    nome: u.nome,
    na_equipe: ativoPorUsuario.get(u.id) === true
  }));
}

// Distribuição por dia da semana (EXTRACT(DOW): 0 = domingo … 6 = sábado).
// Só a trilha de atendimento.
function porDiaSemana(filtros) {
  return Registro.findAll({
    attributes: [
      [literal("EXTRACT(DOW FROM data_atendimento)::int"), "dow"],
      [literal(CONTA_ATENDIMENTO), "atendimentos"]
    ],
    where: construirWhere(filtros),
    group: [literal("EXTRACT(DOW FROM data_atendimento)")],
    raw: true
  });
}

// Tabela "Por mês" - independente da granularidade do gráfico.
function porMes(filtros) {
  const expr = "to_char(data_atendimento, 'YYYY-MM')";
  return Registro.findAll({
    attributes: [
      [literal(expr), "mes"],
      [literal(CONTA_ATENDIMENTO), "atendimentos"],
      [literal(CONTA_AVALIACAO), "avaliacoes_fisicas"],
      [literal("COUNT(DISTINCT aluno_id) FILTER (WHERE tipo = 'atendimento')"), "alunos_distintos"]
    ],
    where: construirWhere(filtros),
    group: [literal(expr)],
    order: [literal(`${expr} DESC`)],
    raw: true
  });
}

module.exports = {
  resumo,
  porBucket,
  porAluno,
  nomesAlunos,
  porMembro,
  nomesMembros,
  porDiaSemana,
  porMes
};
