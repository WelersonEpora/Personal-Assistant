"use strict";

// docs/adr/0020: relatório de atividade por período. Integração - toca o banco
// de teste (NODE_ENV=test). Cada teste monta a própria equipe para não sofrer
// interferência de outros cenários. Datas sempre explícitas (`de`/`ate`) exceto
// no teste do período default.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Membro, Aluno, Registro } = require("../models");
const atividadesService = require("./atividades.service");

let usuario;
const criados = { equipes: [], alunos: [], registros: [], usuarios: [], membros: [] };

// Cria um usuário + membro numa equipe (personal adicional para os testes de
// filtro por personal / bloco por_membro).
async function criarMembro(equipeId, { papel = "colaborador", nome } = {}) {
  const u = await Usuario.create({
    nome: nome || `Personal ${randomUUID().slice(0, 8)}`,
    email: `membro-${randomUUID()}@ex.com`,
    senha_hash: "h"
  });
  const m = await Membro.create({ equipe_id: equipeId, usuario_id: u.id, papel });
  criados.usuarios.push(u.id);
  criados.membros.push(m.id);
  return { usuario: u, membro: m };
}

async function novaEquipe() {
  const equipe = await Equipe.create({ nome: `Equipe Atividades ${randomUUID()}` });
  criados.equipes.push(equipe.id);
  return equipe.id;
}

async function criarAluno(equipeId, props = {}) {
  const aluno = await Aluno.create({ equipe_id: equipeId, nome: `Aluno ${randomUUID().slice(0, 8)}`, ...props });
  criados.alunos.push(aluno.id);
  return aluno;
}

async function criarRegistro({ aluno, dataAtendimento, tipo = "atendimento", status = "confirmado", usuarioId }) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuarioId || usuario.id,
    equipe_id: aluno.equipe_id,
    aluno_id: aluno.id,
    iniciado_em: new Date(`${dataAtendimento}T12:00:00Z`),
    data_atendimento: dataAtendimento,
    tipo,
    status
  });
  criados.registros.push(registro.id);
  return registro;
}

before(async () => {
  usuario = await Usuario.create({ nome: "Personal Atividades", email: `atividades-${randomUUID()}@ex.com`, senha_hash: "h" });
});

after(async () => {
  await Registro.destroy({ where: { id: criados.registros } });
  await Membro.destroy({ where: { id: criados.membros } });
  await Aluno.destroy({ where: { id: criados.alunos } });
  await Equipe.destroy({ where: { id: criados.equipes } });
  await Usuario.destroy({ where: { id: [usuario.id, ...criados.usuarios] } });
});

test("resumo: conta atendimento e avaliação física em trilhas separadas", async () => {
  const equipeId = await novaEquipe();
  const a1 = await criarAluno(equipeId);
  const a2 = await criarAluno(equipeId);
  await criarRegistro({ aluno: a1, dataAtendimento: "2026-03-02" });
  await criarRegistro({ aluno: a1, dataAtendimento: "2026-03-10" });
  await criarRegistro({ aluno: a2, dataAtendimento: "2026-03-10" });
  await criarRegistro({ aluno: a2, dataAtendimento: "2026-03-15", tipo: "avaliacao_fisica" });

  const r = await atividadesService.obterAtividades(equipeId, { de: "2026-03-01", ate: "2026-03-31" });
  assert.equal(r.resumo.atendimentos, 3);
  assert.equal(r.resumo.avaliacoes_fisicas, 1);
  assert.equal(r.resumo.alunos_atendidos, 2);
  assert.equal(r.resumo.dias_com_atividade, 2); // 02 e 10 (a avaliação de 15 não conta)
  assert.equal(r.resumo.media_por_aluno, 1.5);
});

test("por_aluno: dias distintos separam de nº de registros quando há 2 no mesmo dia", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId, { nome: "Familia" });
  await criarRegistro({ aluno, dataAtendimento: "2026-04-06" });
  await criarRegistro({ aluno, dataAtendimento: "2026-04-06" }); // mesmo dia
  await criarRegistro({ aluno, dataAtendimento: "2026-04-13" });

  const r = await atividadesService.obterAtividades(equipeId, { de: "2026-04-01", ate: "2026-04-30" });
  const linha = r.por_aluno.find((l) => l.aluno_id === aluno.id);
  assert.equal(linha.atendimentos, 3);
  assert.equal(linha.dias_distintos, 2);
  assert.equal(linha.primeiro, "2026-04-06");
  assert.equal(linha.ultimo, "2026-04-13");
});

test("filtro aluno_id restringe a um aluno", async () => {
  const equipeId = await novaEquipe();
  const alvo = await criarAluno(equipeId);
  const outro = await criarAluno(equipeId);
  await criarRegistro({ aluno: alvo, dataAtendimento: "2026-05-05" });
  await criarRegistro({ aluno: outro, dataAtendimento: "2026-05-06" });

  const r = await atividadesService.obterAtividades(equipeId, { de: "2026-05-01", ate: "2026-05-31", aluno_id: alvo.id });
  assert.equal(r.resumo.atendimentos, 1);
  assert.equal(r.por_aluno.length, 1);
  assert.equal(r.por_aluno[0].aluno_id, alvo.id);
});

test("filtro tipo=avaliacao_fisica zera a trilha de atendimento", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId);
  await criarRegistro({ aluno, dataAtendimento: "2026-06-02" });
  await criarRegistro({ aluno, dataAtendimento: "2026-06-03", tipo: "avaliacao_fisica" });

  const r = await atividadesService.obterAtividades(equipeId, { de: "2026-06-01", ate: "2026-06-30", tipo: "avaliacao_fisica" });
  assert.equal(r.resumo.atendimentos, 0);
  assert.equal(r.resumo.avaliacoes_fisicas, 1);
});

test("somente_confirmados filtra registros não confirmados", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId);
  await criarRegistro({ aluno, dataAtendimento: "2026-07-07", status: "confirmado" });
  await criarRegistro({ aluno, dataAtendimento: "2026-07-08", status: "aguardando_revisao" });

  const todos = await atividadesService.obterAtividades(equipeId, { de: "2026-07-01", ate: "2026-07-31" });
  assert.equal(todos.resumo.atendimentos, 2);

  const confirmados = await atividadesService.obterAtividades(equipeId, {
    de: "2026-07-01",
    ate: "2026-07-31",
    somente_confirmados: "true"
  });
  assert.equal(confirmados.resumo.atendimentos, 1);
});

test("serie_temporal preenche buckets vazios do intervalo", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId);
  await criarRegistro({ aluno, dataAtendimento: "2026-02-02" });
  await criarRegistro({ aluno, dataAtendimento: "2026-02-05" });

  const r = await atividadesService.obterAtividades(equipeId, { de: "2026-02-01", ate: "2026-02-07" });
  assert.equal(r.periodo.granularidade, "dia");
  assert.equal(r.serie_temporal.length, 7);
  assert.deepEqual(
    r.serie_temporal.map((b) => b.atendimento),
    [0, 1, 0, 0, 1, 0, 0]
  );
});

test("por_dia_semana sempre traz os 7 dias", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId);
  await criarRegistro({ aluno, dataAtendimento: "2026-03-02" }); // segunda -> dow 1

  const r = await atividadesService.obterAtividades(equipeId, { de: "2026-03-01", ate: "2026-03-31" });
  assert.equal(r.por_dia_semana.length, 7);
  assert.deepEqual(r.por_dia_semana.map((d) => d.dow), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(r.por_dia_semana.find((d) => d.dow === 1).atendimentos, 1);
});

test("aluno excluído continua no por_aluno (histórico de trabalho não some)", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId, { nome: "Excluido Depois" });
  await criarRegistro({ aluno, dataAtendimento: "2026-01-10" });
  await Aluno.update({ deletado_em: new Date() }, { where: { id: aluno.id } });

  const r = await atividadesService.obterAtividades(equipeId, { de: "2026-01-01", ate: "2026-01-31" });
  const linha = r.por_aluno.find((l) => l.aluno_id === aluno.id);
  assert.ok(linha);
  assert.equal(linha.nome, "Excluido Depois");
  assert.equal(linha.aluno_removido, true);
});

test("por_membro: separa por personal (quem registrou) e traz os dois pares de métrica", async () => {
  const equipeId = await novaEquipe();
  await Membro.create({ equipe_id: equipeId, usuario_id: usuario.id, papel: "owner" }).then((m) =>
    criados.membros.push(m.id)
  );
  const { usuario: p2 } = await criarMembro(equipeId, { nome: "Segundo Personal" });
  const a1 = await criarAluno(equipeId);
  const a2 = await criarAluno(equipeId);
  await criarRegistro({ aluno: a1, dataAtendimento: "2026-09-02" }); // usuário base
  await criarRegistro({ aluno: a1, dataAtendimento: "2026-09-04" }); // usuário base
  await criarRegistro({ aluno: a2, dataAtendimento: "2026-09-03", usuarioId: p2.id });
  await criarRegistro({ aluno: a2, dataAtendimento: "2026-09-10", tipo: "avaliacao_fisica", usuarioId: p2.id });

  const r = await atividadesService.obterAtividades(equipeId, { de: "2026-09-01", ate: "2026-09-30" });
  // `personais` = lista para o seletor da tela (independe do período/filtros).
  assert.equal(r.personais.length, 2);
  assert.ok(r.personais.every((p) => p.membro_id && p.nome));
  assert.equal(r.por_membro.length, 2);
  const base = r.por_membro.find((l) => l.usuario_id === usuario.id);
  const segundo = r.por_membro.find((l) => l.usuario_id === p2.id);
  assert.equal(base.atendimentos, 2);
  assert.equal(base.dias_distintos, 2);
  assert.equal(base.alunos_distintos, 1);
  assert.equal(segundo.atendimentos, 1);
  assert.equal(segundo.avaliacoes_fisicas, 1);
  assert.equal(segundo.personal_na_equipe, true);
});

test("filtro membro_id restringe todas as agregações a um personal", async () => {
  const equipeId = await novaEquipe();
  const { membro: m2, usuario: p2 } = await criarMembro(equipeId);
  const aluno = await criarAluno(equipeId);
  await criarRegistro({ aluno, dataAtendimento: "2026-10-05" }); // usuário base
  await criarRegistro({ aluno, dataAtendimento: "2026-10-06", usuarioId: p2.id });

  const r = await atividadesService.obterAtividades(equipeId, {
    de: "2026-10-01",
    ate: "2026-10-31",
    membro_id: m2.id
  });
  assert.equal(r.filtros.membro_id, m2.id);
  assert.equal(r.resumo.atendimentos, 1);
  assert.equal(r.por_membro.length, 1);
  assert.equal(r.por_membro[0].usuario_id, p2.id);
});

test("membro_id de outra equipe é rejeitado (isolamento)", async () => {
  const equipeA = await novaEquipe();
  const equipeB = await novaEquipe();
  const { membro: mB } = await criarMembro(equipeB);
  await assert.rejects(
    () => atividadesService.obterAtividades(equipeA, { de: "2026-01-01", ate: "2026-01-31", membro_id: mB.id }),
    /não pertence/
  );
});

test("isolamento: relatório de uma equipe não enxerga outra", async () => {
  const equipeA = await novaEquipe();
  const equipeB = await novaEquipe();
  const alunoA = await criarAluno(equipeA);
  await criarRegistro({ aluno: alunoA, dataAtendimento: "2026-08-10" });

  const r = await atividadesService.obterAtividades(equipeB, { de: "2026-08-01", ate: "2026-08-31" });
  assert.equal(r.resumo.atendimentos, 0);
  assert.equal(r.por_aluno.length, 0);
});

test("período default = mês corrente", async () => {
  const equipeId = await novaEquipe();
  const aluno = await criarAluno(equipeId);
  const hoje = new Date().toISOString().slice(0, 10);
  const mesPassado = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await criarRegistro({ aluno, dataAtendimento: hoje });
  await criarRegistro({ aluno, dataAtendimento: mesPassado });

  const r = await atividadesService.obterAtividades(equipeId, {});
  assert.equal(r.periodo.de, `${hoje.slice(0, 8)}01`);
  assert.equal(r.periodo.ate, hoje);
  assert.equal(r.resumo.atendimentos, 1); // só o de hoje
});

test("rejeita data inválida, de > ate e janela > 1 ano", async () => {
  const equipeId = await novaEquipe();
  await assert.rejects(() => atividadesService.obterAtividades(equipeId, { de: "2026-13-01" }), /formato|válida/);
  await assert.rejects(() => atividadesService.obterAtividades(equipeId, { de: "2026-05-01", ate: "2026-04-01" }), /depois/);
  await assert.rejects(
    () => atividadesService.obterAtividades(equipeId, { de: "2024-01-01", ate: "2026-01-01" }),
    /1 ano/
  );
});

test("escolherGranularidade: dia <= 31, semana <= 92, mês além", () => {
  assert.equal(atividadesService.escolherGranularidade(0), "dia");
  assert.equal(atividadesService.escolherGranularidade(31), "dia");
  assert.equal(atividadesService.escolherGranularidade(32), "semana");
  assert.equal(atividadesService.escolherGranularidade(92), "semana");
  assert.equal(atividadesService.escolherGranularidade(93), "mes");
});

test("gerarBuckets: semana ancora na segunda-feira; mês cobre o intervalo", () => {
  // 2026-03-04 é quarta; a semana começa em 2026-03-02 (segunda)
  const semanas = atividadesService.gerarBuckets("2026-03-04", "2026-03-20", "semana");
  assert.equal(semanas[0], "2026-03-02");
  const meses = atividadesService.gerarBuckets("2026-01-15", "2026-04-03", "mes");
  assert.deepEqual(meses, ["2026-01", "2026-02", "2026-03", "2026-04"]);
});
