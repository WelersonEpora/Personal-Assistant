"use strict";

// docs/adr/0028-ficha-de-treino-por-captura-e-ia.md: a confirmação de um
// Registro `tipo = ficha_treino` cria as fichas pelo fichaTreino.service (com
// registro_id) e avança o status - numa transação única: todas as fichas ou
// nenhuma. NUNCA cria `validacao` (docs/adr/0007). Integração: banco de teste.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Registro, PropostaFichaTreino, FichaTreino, Exercicio, Validacao } = require("../models");
const fichaTreinoService = require("./fichaTreino.service");
const service = require("./registro-ficha-treino-confirmacao.service");

let usuario;
let equipe;
let outraEquipe;
let aluno;
let supino;
let remada;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal", email: `t-${randomUUID()}@ex.com`, senha_hash: "h" });
  equipe = await Equipe.create({ nome: `Eq ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno Ficha por Voz" });
  supino = await Exercicio.create({ equipe_id: equipe.id, nome: `Supino ${randomUUID()}` });
  remada = await Exercicio.create({ equipe_id: equipe.id, nome: `Remada ${randomUUID()}` });
});

after(async () => {
  await FichaTreino.destroy({ where: { aluno_id: aluno.id } });
  await Registro.destroy({ where: { aluno_id: aluno.id } });
  await Exercicio.destroy({ where: { id: [supino.id, remada.id] } });
  await Aluno.destroy({ where: { id: aluno.id } });
  await Usuario.destroy({ where: { id: usuario.id } });
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
});

async function criarRegistro({ tipo = Registro.TIPOS.FICHA_TREINO, status = Registro.STATUS.AGUARDANDO_REVISAO, comProposta = true } = {}) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipe.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    data_atendimento: new Date().toISOString().slice(0, 10),
    status,
    tipo
  });
  if (comProposta) {
    await PropostaFichaTreino.create({ registro_id: registro.id, status: "concluido", payload_json: { fichas: [] } });
  }
  return registro;
}

function ficha(nome, exercicio, extra = {}) {
  return { nome, grupos: [{ tipo: "simples", series: 3, itens: [{ exercicioId: exercicio.id, repeticoes: "10" }] }], ...extra };
}

test("confirmar: cria todas as fichas ditadas com registro_id, confirma o Registro e não cria validacao", async () => {
  const registro = await criarRegistro();

  const resultado = await service.confirmar({
    usuarioId: usuario.id,
    equipeId: equipe.id,
    registroId: registro.id,
    payload: { fichas: [ficha("Treino A", supino), ficha("Treino B", remada)] }
  });

  assert.equal(resultado.fichasIds.length, 2);
  const criadas = await FichaTreino.findAll({ where: { registro_id: registro.id }, order: [["nome", "ASC"]] });
  assert.deepEqual(criadas.map((f) => [f.nome, f.ativo, f.criado_por]), [["Treino A", true, usuario.id], ["Treino B", true, usuario.id]]);

  assert.equal((await Registro.findByPk(registro.id)).status, Registro.STATUS.CONFIRMADO);
  assert.equal(await Validacao.count({ where: { registro_id: registro.id } }), 0, "ficha por voz nunca cria validacao");
});

test("confirmar: substituir desativa só a ficha escolhida", async () => {
  const antiga = await fichaTreinoService.criarNovaVersao(equipe.id, usuario.id, aluno.id, ficha("Inferiores", supino));
  const outra = await fichaTreinoService.criarNovaVersao(equipe.id, usuario.id, aluno.id, ficha("Superiores", remada));
  const registro = await criarRegistro();

  await service.confirmar({
    usuarioId: usuario.id,
    equipeId: equipe.id,
    registroId: registro.id,
    payload: { fichas: [ficha("Inferiores", remada, { substituiFichaId: antiga.id })] }
  });

  assert.equal((await FichaTreino.findByPk(antiga.id)).ativo, false);
  assert.equal((await FichaTreino.findByPk(outra.id)).ativo, true, "a outra ficha ativa continua");
  const nova = await FichaTreino.findOne({ where: { registro_id: registro.id } });
  assert.equal(nova.substitui_id, antiga.id);
});

test("confirmar: erro em uma ficha desfaz todas e o Registro continua aguardando revisão", async () => {
  const registro = await criarRegistro();

  await assert.rejects(
    () =>
      service.confirmar({
        usuarioId: usuario.id,
        equipeId: equipe.id,
        registroId: registro.id,
        payload: { fichas: [ficha("Treino A", supino), { nome: "Treino B", grupos: [] }] }
      }),
    (err) => err.statusCode === 400 && /Ficha 2 \("Treino B"\)/.test(err.message)
  );

  assert.equal(await FichaTreino.count({ where: { registro_id: registro.id } }), 0, "nenhuma ficha fica pela metade");
  assert.equal((await Registro.findByPk(registro.id)).status, Registro.STATUS.AGUARDANDO_REVISAO);
});

test("confirmar: duas fichas não podem substituir a mesma ficha ativa", async () => {
  const ativa = await fichaTreinoService.criarNovaVersao(equipe.id, usuario.id, aluno.id, ficha("Full body", supino));
  const registro = await criarRegistro();

  await assert.rejects(
    () =>
      service.confirmar({
        usuarioId: usuario.id,
        equipeId: equipe.id,
        registroId: registro.id,
        payload: {
          fichas: [ficha("A", supino, { substituiFichaId: ativa.id }), ficha("B", remada, { substituiFichaId: ativa.id })]
        }
      }),
    /mesma ficha ativa/
  );
  assert.equal((await FichaTreino.findByPk(ativa.id)).ativo, true);
});

test("confirmar: recusa outro tipo, outro status, sem proposta, outra equipe e lista vazia", async () => {
  const deAvaliacao = await criarRegistro({ tipo: Registro.TIPOS.AVALIACAO_FISICA });
  const jaConfirmado = await criarRegistro({ status: Registro.STATUS.CONFIRMADO });
  const semProposta = await criarRegistro({ comProposta: false });
  const valido = await criarRegistro();
  const payload = { fichas: [ficha("A", supino)] };
  const chamar = (registroId, equipeId = equipe.id, corpo = payload) =>
    service.confirmar({ usuarioId: usuario.id, equipeId, registroId, payload: corpo });

  await assert.rejects(() => chamar(deAvaliacao.id), /não é de ficha de treino/);
  await assert.rejects(() => chamar(jaConfirmado.id), /não está aguardando revisão/);
  await assert.rejects(() => chamar(semProposta.id), /proposta de ficha de treino concluída/);
  await assert.rejects(() => chamar(valido.id, outraEquipe.id), /não encontrado/);
  await assert.rejects(() => chamar(valido.id, equipe.id, { fichas: [] }), /pelo menos uma ficha/);
});
