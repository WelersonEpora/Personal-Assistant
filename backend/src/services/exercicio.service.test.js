"use strict";

// Isolamento multi-tenant e catálogo global vs. próprio (docs/adr/0013).
// Integração - toca o banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Equipe, Exercicio, ExercicioApelido } = require("../models");
const exercicioService = require("./exercicio.service");

let equipeA;
let equipeB;
let exercicioGlobal;
let exercicioDeB;

before(async () => {
  equipeA = await Equipe.create({ nome: `Equipe A ${randomUUID()}` });
  equipeB = await Equipe.create({ nome: `Equipe B ${randomUUID()}` });
  exercicioGlobal = await Exercicio.create({ equipe_id: null, nome: "Supino reto (global)" });
  exercicioDeB = await Exercicio.create({ equipe_id: equipeB.id, nome: "Exercício próprio de B" });
});

after(async () => {
  await Exercicio.destroy({ where: { id: [exercicioGlobal.id, exercicioDeB.id] } });
  await Equipe.destroy({ where: { id: [equipeA.id, equipeB.id] } });
});

test("listExercicios: traz os globais e os próprios da equipe, mas não os de outra equipe", async () => {
  const listaDeA = await exercicioService.listExercicios(equipeA.id);
  assert.ok(listaDeA.some((e) => e.id === exercicioGlobal.id), "deveria trazer o exercício global");
  assert.ok(!listaDeA.some((e) => e.id === exercicioDeB.id), "não deveria trazer exercício próprio de outra equipe");
});

test("getExercicio: qualquer equipe consegue ver um exercício global", async () => {
  const encontrado = await exercicioService.getExercicio(equipeA.id, exercicioGlobal.id);
  assert.equal(encontrado.id, exercicioGlobal.id);
});

test("getExercicio: rejeita exercício próprio de outra equipe", async () => {
  await assert.rejects(() => exercicioService.getExercicio(equipeA.id, exercicioDeB.id), /não encontrado/);
});

test("createExercicio: rejeita nome vazio", async () => {
  await assert.rejects(() => exercicioService.createExercicio(equipeA.id, { nome: "  " }), /nome/);
});

test("createExercicio: rejeita dificuldade fora das opções válidas", async () => {
  await assert.rejects(
    () => exercicioService.createExercicio(equipeA.id, { nome: "Agachamento", dificuldade: "extremo" }),
    /dificuldade/
  );
});

test("createExercicio: cria sempre como exercício próprio da equipe (nunca global)", async (t) => {
  const criado = await exercicioService.createExercicio(equipeA.id, { nome: "Remada curvada", grupoMuscular: "Costas", dificuldade: "intermediario" });
  t.after(() => Exercicio.destroy({ where: { id: criado.id } }));

  assert.equal(criado.equipe_id, equipeA.id);
  assert.equal(criado.ativo, true);
});

// TEMPORÁRIO (pedido explícito, ver exercicio.service.js::getExercicioEditavel):
// um personal parceiro está revisando/corrigindo o catálogo global, então
// editar um exercício global passou a ser permitido por ora. Quando essa
// exceção for revertida, este teste volta a esperar rejeição.
test("updateExercicio: TEMPORÁRIO - permite editar um exercício global (revisão do catálogo)", async (t) => {
  const nomeOriginal = exercicioGlobal.nome;
  // Pelo model, não pela instância: `exercicioGlobal` em memória ainda tem o
  // nome original, então instance.update() não veria mudança e não gravaria.
  t.after(() => Exercicio.update({ nome: nomeOriginal }, { where: { id: exercicioGlobal.id } }));

  const atualizado = await exercicioService.updateExercicio(equipeA.id, exercicioGlobal.id, { nome: "Supino reto (global) - corrigido" });
  assert.equal(atualizado.nome, "Supino reto (global) - corrigido");
  assert.equal(atualizado.equipe_id, null, "continua global - editar não transfere posse");
});

test("updateExercicio: rejeita editar exercício de outra equipe", async () => {
  await assert.rejects(
    () => exercicioService.updateExercicio(equipeA.id, exercicioDeB.id, { nome: "Tentativa" }),
    /não encontrado/
  );
});

test("updateExercicio: dono consegue editar e alternar ativo/inativo", async (t) => {
  const criado = await exercicioService.createExercicio(equipeA.id, { nome: "Leg press" });
  t.after(() => Exercicio.destroy({ where: { id: criado.id } }));

  const atualizado = await exercicioService.updateExercicio(equipeA.id, criado.id, { ativo: false, equipamento: "Máquina" });
  assert.equal(atualizado.ativo, false);
  assert.equal(atualizado.equipamento, "Máquina");
});

test("excluirExercicio: soft-delete some da listagem", async (t) => {
  const criado = await exercicioService.createExercicio(equipeA.id, { nome: "Exercício a excluir" });
  t.after(() => Exercicio.destroy({ where: { id: criado.id } }));

  await exercicioService.excluirExercicio(equipeA.id, criado.id);

  await assert.rejects(() => exercicioService.getExercicio(equipeA.id, criado.id), /não encontrado/);
});

test("excluirExercicio: rejeita excluir um exercício global", async () => {
  await assert.rejects(() => exercicioService.excluirExercicio(equipeA.id, exercicioGlobal.id), /não encontrado/);
});

test("atualizarImagem: rejeita posição inválida", async (t) => {
  const criado = await exercicioService.createExercicio(equipeA.id, { nome: "Exercício para imagem inválida" });
  t.after(() => Exercicio.destroy({ where: { id: criado.id } }));

  await assert.rejects(
    () => exercicioService.atualizarImagem(equipeA.id, criado.id, "meio", { buffer: Buffer.from("x"), mimeType: "image/jpeg" }),
    /posicao/
  );
});

test("atualizarImagem: rejeita formato de imagem não suportado", async (t) => {
  const criado = await exercicioService.createExercicio(equipeA.id, { nome: "Exercício para formato inválido" });
  t.after(() => Exercicio.destroy({ where: { id: criado.id } }));

  await assert.rejects(
    () => exercicioService.atualizarImagem(equipeA.id, criado.id, "inicio", { buffer: Buffer.from("x"), mimeType: "image/gif" }),
    /não suportado/
  );
});

// TEMPORÁRIO - mesma exceção do teste de updateExercicio acima.
test("atualizarImagem: TEMPORÁRIO - permite enviar imagem para um exercício global (revisão do catálogo)", async (t) => {
  t.after(() => exercicioGlobal.update({ midia_imagem_inicio_caminho: null }));

  const atualizado = await exercicioService.atualizarImagem(equipeA.id, exercicioGlobal.id, "inicio", {
    buffer: Buffer.from("fake-jpeg"),
    mimeType: "image/jpeg"
  });
  assert.ok(atualizado.midia_imagem_inicio_caminho);
});

test("atualizarImagem + obterImagem: dono consegue salvar e ler as duas posições, independentes uma da outra", async (t) => {
  const criado = await exercicioService.createExercicio(equipeA.id, { nome: "Exercício com duas imagens" });
  t.after(() => Exercicio.destroy({ where: { id: criado.id } }));

  await exercicioService.atualizarImagem(equipeA.id, criado.id, "inicio", { buffer: Buffer.from("fake-inicio"), mimeType: "image/jpeg" });
  await exercicioService.atualizarImagem(equipeA.id, criado.id, "fim", { buffer: Buffer.from("fake-fim"), mimeType: "image/png" });

  const inicio = await exercicioService.obterImagem(equipeA.id, criado.id, "inicio");
  assert.equal(inicio.buffer.toString(), "fake-inicio");
  assert.equal(inicio.mimeType, "image/jpeg");

  const fim = await exercicioService.obterImagem(equipeA.id, criado.id, "fim");
  assert.equal(fim.buffer.toString(), "fake-fim");
  assert.equal(fim.mimeType, "image/png");
});

test("obterImagem: leitura não é bloqueada por ser exercício global (só a escrita é)", async (t) => {
  // Simula o que o seeder do catálogo global faz (grava o caminho direto,
  // sem passar pelo endpoint de upload, que rejeita globais) - o arquivo em
  // si não existe aqui de propósito: se a autorização bloqueasse por ser
  // global, o erro seria "não encontrado" antes mesmo de tentar ler do
  // disco; em vez disso, o erro vem da leitura (ENOENT).
  await exercicioGlobal.update({ midia_imagem_inicio_caminho: "arquivo-que-nao-existe.jpg" });
  t.after(() => exercicioGlobal.update({ midia_imagem_inicio_caminho: null }));

  await assert.rejects(() => exercicioService.obterImagem(equipeA.id, exercicioGlobal.id, "inicio"), /ENOENT|no such file/);
});

test("removerImagem: rejeita quando o exercício não tem essa imagem cadastrada", async (t) => {
  const criado = await exercicioService.createExercicio(equipeA.id, { nome: "Exercício sem imagem" });
  t.after(() => Exercicio.destroy({ where: { id: criado.id } }));

  await assert.rejects(() => exercicioService.removerImagem(equipeA.id, criado.id, "inicio"), /não tem essa imagem/);
});

test("removerImagem: limpa só a posição removida, mantendo a outra intacta", async (t) => {
  const criado = await exercicioService.createExercicio(equipeA.id, { nome: "Exercício para remover uma imagem" });
  t.after(() => Exercicio.destroy({ where: { id: criado.id } }));

  await exercicioService.atualizarImagem(equipeA.id, criado.id, "inicio", { buffer: Buffer.from("fake-inicio"), mimeType: "image/jpeg" });
  await exercicioService.atualizarImagem(equipeA.id, criado.id, "fim", { buffer: Buffer.from("fake-fim"), mimeType: "image/jpeg" });

  const atualizado = await exercicioService.removerImagem(equipeA.id, criado.id, "inicio");
  assert.equal(atualizado.midia_imagem_inicio_caminho, null);
  assert.ok(atualizado.midia_imagem_fim_caminho, "imagem de fim deveria continuar cadastrada");
});

// ----------------------------------------------------------- apelidos (docs/adr/0027)

// Nome único por execução - o banco de teste pode ter o catálogo global do seed.
function nomeUnico(base) {
  return `${base} ${randomUUID().slice(0, 8)}`;
}

test("adicionarApelido: apelido da equipe num exercício global aparece só para ela", async (t) => {
  const apelido = nomeUnico("Supininho");
  const resultado = await exercicioService.adicionarApelido(equipeA.id, exercicioGlobal.id, { apelido: `  ${apelido}  ` });
  t.after(() => ExercicioApelido.destroy({ where: { exercicio_id: exercicioGlobal.id } }));

  assert.deepEqual(resultado.apelidos.map((a) => a.apelido), [apelido], "apelido gravado sem os espaços das pontas");
  assert.equal(resultado.apelidos[0].equipe_id, equipeA.id);

  const listaDeA = await exercicioService.listExercicios(equipeA.id);
  const listaDeB = await exercicioService.listExercicios(equipeB.id);
  assert.equal(listaDeA.find((e) => e.id === exercicioGlobal.id).apelidos.length, 1);
  assert.equal(listaDeB.find((e) => e.id === exercicioGlobal.id).apelidos.length, 0, "apelido de A não aparece para B");
});

test("adicionarApelido: o mesmo apelido aponta para um exercício só na equipe (ignora acento e caixa)", async (t) => {
  const outro = await exercicioService.createExercicio(equipeA.id, { nome: nomeUnico("Remada da casa") });
  t.after(async () => {
    await ExercicioApelido.destroy({ where: { exercicio_id: [exercicioGlobal.id, outro.id] } });
    await Exercicio.destroy({ where: { id: outro.id } });
  });

  const sufixo = randomUUID().slice(0, 8);
  await exercicioService.adicionarApelido(equipeA.id, exercicioGlobal.id, { apelido: `Puxada Média ${sufixo}` });

  await assert.rejects(
    () => exercicioService.adicionarApelido(equipeA.id, outro.id, { apelido: `puxada media ${sufixo}` }),
    (err) => err.statusCode === 409 && /já é apelido de "Supino reto \(global\)"/.test(err.message)
  );
  // Outra equipe tem o próprio vocabulário - o mesmo apelido vale lá.
  await exercicioService.adicionarApelido(equipeB.id, exercicioGlobal.id, { apelido: `puxada media ${sufixo}` });
});

test("adicionarApelido: rejeita apelido igual ao nome de outro exercício visível ou ao próprio nome", async (t) => {
  const outro = await exercicioService.createExercicio(equipeA.id, { nome: nomeUnico("Serrote da casa") });
  t.after(() => Exercicio.destroy({ where: { id: outro.id } }));

  await assert.rejects(
    () => exercicioService.adicionarApelido(equipeA.id, exercicioGlobal.id, { apelido: outro.nome.toUpperCase() }),
    (err) => err.statusCode === 409 && /Já existe um exercício chamado/.test(err.message)
  );
  await assert.rejects(
    () => exercicioService.adicionarApelido(equipeA.id, exercicioGlobal.id, { apelido: "supino reto (GLOBAL)" }),
    (err) => err.statusCode === 409 && /já é o nome deste exercício/.test(err.message)
  );
});

test("adicionarApelido: rejeita apelido vazio e exercício de outra equipe", async () => {
  await assert.rejects(() => exercicioService.adicionarApelido(equipeA.id, exercicioGlobal.id, { apelido: "   " }), /obrigatório/);
  await assert.rejects(() => exercicioService.adicionarApelido(equipeA.id, exercicioDeB.id, { apelido: "qualquer" }), /não encontrado/);
});

test("removerApelido: remove o da própria equipe; o global e o de outra equipe não", async (t) => {
  const global = await ExercicioApelido.create({
    exercicio_id: exercicioGlobal.id,
    equipe_id: null,
    apelido: "apelido global de teste",
    apelido_normalizado: "apelido global de teste"
  });
  t.after(() => ExercicioApelido.destroy({ where: { exercicio_id: exercicioGlobal.id } }));
  const comApelido = await exercicioService.adicionarApelido(equipeA.id, exercicioGlobal.id, { apelido: nomeUnico("apelido de A") });
  const deA = comApelido.apelidos.find((a) => a.equipe_id === equipeA.id);

  await assert.rejects(() => exercicioService.removerApelido(equipeA.id, exercicioGlobal.id, global.id), /não encontrado/);
  await assert.rejects(() => exercicioService.removerApelido(equipeB.id, exercicioGlobal.id, deA.id), /não encontrado/);

  const depois = await exercicioService.removerApelido(equipeA.id, exercicioGlobal.id, deA.id);
  assert.deepEqual(depois.apelidos.map((a) => a.apelido), ["apelido global de teste"], "global continua visível");
});
