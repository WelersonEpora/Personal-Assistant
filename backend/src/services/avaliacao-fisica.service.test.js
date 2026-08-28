"use strict";

// docs/adr/0016: CRUD da avaliação física. Integração - toca o banco de teste
// (depende do seed do catálogo de métricas). Não é dado oficial, não passa
// pela IA. Cobre validação da v3, recálculo de IMC/RCQ, preservação de
// origem/protocolos e isolamento por equipe.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const {
  Usuario,
  Equipe,
  Aluno,
  AvaliacaoFisica,
  AvaliacaoFisicaMedida,
  MetricaAvaliacaoFisica
} = require("../models");
const service = require("./avaliacao-fisica.service");

let usuario;
let equipe;
let outraEquipe;
let aluno;
let alunoDeOutra;

function medida(metrica_codigo, valor, extra = {}) {
  return { metrica_codigo, valor, ...extra };
}

before(async () => {
  usuario = await Usuario.create({ nome: "Personal", email: `t-${randomUUID()}@ex.com`, senha_hash: "h" });
  equipe = await Equipe.create({ nome: `Eq ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno AF" });
  alunoDeOutra = await Aluno.create({ equipe_id: outraEquipe.id, nome: "Aluno de Outra" });

  assert.ok((await MetricaAvaliacaoFisica.count()) >= 38, "catálogo não seedado");
});

after(async () => {
  const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: [aluno.id, alunoDeOutra.id] }, attributes: ["id"] });
  await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } });
  await AvaliacaoFisica.destroy({ where: { aluno_id: [aluno.id, alunoDeOutra.id] } });
  await Aluno.destroy({ where: { id: [aluno.id, alunoDeOutra.id] } });
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

async function limpar() {
  const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: aluno.id }, attributes: ["id"] });
  await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } });
  await AvaliacaoFisica.destroy({ where: { aluno_id: aluno.id } });
}

test("criar: grava avaliação manual, seta avaliador, deriva IMC/RCQ automaticamente", async (t) => {
  t.after(limpar);

  const av = await service.criar(equipe.id, aluno.id, usuario.id, {
    data: "2026-01-15",
    observacoes: "  primeira avaliação  ",
    medidas: [
      medida("peso", 80),
      medida("altura", 180),
      medida("perimetro_cintura", 85),
      medida("perimetro_quadril", 100)
    ]
  });

  assert.equal(av.origem, "manual");
  assert.equal(av.avaliador_id, usuario.id);
  assert.equal(av.data, "2026-01-15");
  assert.equal(av.observacoes, "primeira avaliação");

  const porCodigo = Object.fromEntries(av.medidas.map((m) => [m.metrica_codigo, m]));
  assert.equal(Number(porCodigo.imc.valor), 24.7); // 80 / 1.8^2
  assert.equal(porCodigo.imc.origem_valor, "calculado");
  assert.equal(porCodigo.imc.principal, true);
  assert.equal(Number(porCodigo.rcq.valor), 0.85);
  assert.equal(porCodigo.peso.origem_valor, "medido");
});

test("criar: peso + % gordura principal deriva massa_gorda e massa_magra", async (t) => {
  t.after(limpar);
  const av = await service.criar(equipe.id, aluno.id, usuario.id, {
    data: "2026-02-10",
    medidas: [
      medida("peso", 90),
      medida("percentual_gordura", 25, { metodo: "pollock_7", principal: true })
    ]
  });
  const porCodigo = Object.fromEntries(av.medidas.map((m) => [m.metrica_codigo, m]));
  assert.equal(Number(porCodigo.massa_gorda.valor), 22.5); // 90 * 25 / 100
  assert.equal(porCodigo.massa_gorda.origem_valor, "calculado");
  assert.equal(Number(porCodigo.massa_magra.valor), 67.5); // 90 - 22.5
  assert.ok(!("imc" in porCodigo)); // sem altura
});

test("criar: rejeita POST manual de massa_gorda (derivada)", async () => {
  await assert.rejects(
    () =>
      service.criar(equipe.id, aluno.id, usuario.id, {
        data: "2026-02-11",
        medidas: [medida("massa_gorda", 20)]
      }),
    /calculada automaticamente/
  );
});

test("criar: % de gordura com 2 métodos, um principal", async (t) => {
  t.after(limpar);
  const av = await service.criar(equipe.id, aluno.id, usuario.id, {
    data: "2026-02-01",
    medidas: [
      medida("percentual_gordura", 18, { metodo: "pollock_7", principal: true }),
      medida("percentual_gordura", 21, { metodo: "durnin_womersley" })
    ]
  });
  const gord = av.medidas.filter((m) => m.metrica_codigo === "percentual_gordura");
  assert.equal(gord.length, 2);
  assert.equal(gord.find((g) => g.metodo === "pollock_7").principal, true);
  assert.equal(gord.find((g) => g.metodo === "durnin_womersley").principal, false);
});

test("criar: rejeições de validação da v3", async () => {
  const base = { data: "2026-03-01" };
  await assert.rejects(() => service.criar(equipe.id, aluno.id, usuario.id, { ...base, data: "01/03/2026" }), /AAAA-MM-DD/);
  await assert.rejects(
    () => service.criar(equipe.id, aluno.id, usuario.id, { ...base, medidas: [medida("imc", 25)] }),
    /calculada automaticamente/
  );
  await assert.rejects(
    () => service.criar(equipe.id, aluno.id, usuario.id, { ...base, medidas: [medida("xpto", 1)] }),
    /não existe no catálogo/
  );
  await assert.rejects(
    () => service.criar(equipe.id, aluno.id, usuario.id, { ...base, medidas: [medida("peso", 0)] }),
    /maior que zero/
  );
  await assert.rejects(
    () => service.criar(equipe.id, aluno.id, usuario.id, { ...base, medidas: [medida("peso", 80, { metodo: "chute" })] }),
    /Método "chute" inválido/
  );
  await assert.rejects(
    () =>
      service.criar(equipe.id, aluno.id, usuario.id, {
        ...base,
        medidas: [medida("peso", 80), medida("peso", 81)]
      }),
    /duplicada/
  );
  await assert.rejects(
    () =>
      service.criar(equipe.id, aluno.id, usuario.id, {
        ...base,
        medidas: [
          medida("percentual_gordura", 18, { metodo: "pollock_7", principal: true }),
          medida("percentual_gordura", 21, { metodo: "durnin_womersley", principal: true })
        ]
      }),
    /mais de um valor marcado como principal/
  );
  await assert.rejects(
    () => service.criar(equipe.id, aluno.id, usuario.id, { ...base, anamnese_json: { peso: 80 } }),
    /chave desconhecida/
  );
});

test("editar avaliação importada: origem e protocolos preservados; IMC recalcula", async (t) => {
  t.after(limpar);

  // simula uma avaliação vinda do BodyMove
  const importada = await AvaliacaoFisica.create({
    aluno_id: aluno.id,
    equipe_id: equipe.id,
    data: "2015-06-10",
    origem: "legado_bodymove"
  });
  await AvaliacaoFisicaMedida.bulkCreate([
    { avaliacao_fisica_id: importada.id, metrica_codigo: "peso", metodo: "direto", principal: true, valor: 70, origem_valor: "importado" },
    { avaliacao_fisica_id: importada.id, metrica_codigo: "altura", metodo: "direto", principal: true, valor: 170, origem_valor: "importado" },
    { avaliacao_fisica_id: importada.id, metrica_codigo: "imc", metodo: "direto", principal: true, valor: 24.2, origem_valor: "calculado" },
    { avaliacao_fisica_id: importada.id, metrica_codigo: "percentual_gordura", metodo: "pollock_7", principal: true, valor: 20, origem_valor: "calculado" },
    { avaliacao_fisica_id: importada.id, metrica_codigo: "percentual_gordura", metodo: "petroski", principal: false, valor: 23, origem_valor: "calculado" }
  ]);

  const atual = await service.obter(equipe.id, aluno.id, importada.id);
  // reenvia as medidas de entrada (sem imc/rcq), mudando o peso
  const medidasEntrada = atual.medidas
    .filter((m) => !["imc", "rcq"].includes(m.metrica_codigo))
    .map((m) => ({
      metrica_codigo: m.metrica_codigo,
      metodo: m.metodo,
      principal: m.principal,
      valor: m.metrica_codigo === "peso" ? 75 : Number(m.valor)
    }));

  const editada = await service.atualizar(equipe.id, aluno.id, importada.id, { medidas: medidasEntrada });

  assert.equal(editada.origem, "legado_bodymove"); // preservada
  const porCodMet = editada.medidas.map((m) => `${m.metrica_codigo}:${m.metodo}`);
  assert.ok(porCodMet.includes("percentual_gordura:pollock_7"));
  assert.ok(porCodMet.includes("percentual_gordura:petroski")); // protocolo preservado
  assert.equal(Number(editada.medidas.find((m) => m.metrica_codigo === "imc").valor), 26); // 75/1.7^2 = 25.95
});

test("editar: PUT sem 'medidas' só mexe no header", async (t) => {
  t.after(limpar);
  const av = await service.criar(equipe.id, aluno.id, usuario.id, {
    data: "2026-04-01",
    medidas: [medida("peso", 60), medida("altura", 160)]
  });
  const antes = av.medidas.length;

  const editada = await service.atualizar(equipe.id, aluno.id, av.id, { observacoes: "revisado" });
  assert.equal(editada.observacoes, "revisado");
  assert.equal(editada.medidas.length, antes);
});

test("excluir: some e leva as medidas junto", async (t) => {
  t.after(limpar);
  const av = await service.criar(equipe.id, aluno.id, usuario.id, {
    data: "2026-05-01",
    medidas: [medida("peso", 70)]
  });
  await service.excluir(equipe.id, aluno.id, av.id);
  await assert.rejects(() => service.obter(equipe.id, aluno.id, av.id), /não encontrada/);
  assert.equal(await AvaliacaoFisicaMedida.count({ where: { avaliacao_fisica_id: av.id } }), 0);
});

test("isolamento por equipe: aluno de outra equipe -> NotFound", async () => {
  await assert.rejects(
    () => service.criar(equipe.id, alunoDeOutra.id, usuario.id, { data: "2026-01-01" }),
    /Aluno não encontrado/
  );
  await assert.rejects(() => service.listar(equipe.id, alunoDeOutra.id), /Aluno não encontrado/);
});

test("listarMetricas: devolve o catálogo ordenado", async () => {
  const metricas = await service.listarMetricas();
  assert.ok(metricas.length >= 38);
  assert.ok(metricas.some((m) => m.codigo === "peso" && m.unidade === "kg"));
});
