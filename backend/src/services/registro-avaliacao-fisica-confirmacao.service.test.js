"use strict";

// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: a confirmação de um
// Registro `tipo = avaliacao_fisica` cria a avaliação pelo CRUD oficial
// (origem = captura_ia, vínculo ao Registro, recálculo das derivadas) e
// avança o status - numa transação única. NUNCA cria `validacao`
// (docs/adr/0007 intacto). Integração: toca o banco de teste (catálogo seedado).

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const {
  Usuario,
  Equipe,
  Aluno,
  Registro,
  RegistroEntrada,
  PropostaAvaliacaoFisica,
  AvaliacaoFisica,
  AvaliacaoFisicaMedida,
  Validacao,
  MetricaAvaliacaoFisica
} = require("../models");
const service = require("./registro-avaliacao-fisica-confirmacao.service");

let usuario;
let equipe;
let outraEquipe;
let aluno;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal", email: `t-${randomUUID()}@ex.com`, senha_hash: "h" });
  equipe = await Equipe.create({ nome: `Eq ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno AF Captura" });
  assert.ok((await MetricaAvaliacaoFisica.count()) >= 38, "catálogo não seedado");
});

after(async () => {
  await limparAvaliacoes();
  await Aluno.destroy({ where: { id: aluno.id } });
  await Usuario.destroy({ where: { id: usuario.id } });
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
});

// Cada teste reusa o mesmo aluno e a mesma data -> uq_avaliacao_fisica_import
// (aluno_id, data, origem) colide entre testes se a avaliação não for limpa.
async function limparAvaliacoes() {
  const avs = await AvaliacaoFisica.findAll({ where: { aluno_id: aluno.id }, attributes: ["id"] });
  await AvaliacaoFisicaMedida.destroy({ where: { avaliacao_fisica_id: avs.map((a) => a.id) } });
  await AvaliacaoFisica.destroy({ where: { aluno_id: aluno.id } });
}

async function criarRegistro({ tipo = Registro.TIPOS.AVALIACAO_FISICA, status = Registro.STATUS.AGUARDANDO_REVISAO, comProposta = true } = {}) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipe.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    status,
    tipo
  });
  await RegistroEntrada.create({ registro_id: registro.id, ordem: 0, tipo: "texto", conteudo_texto: "peso e altura" });
  if (comProposta) {
    await PropostaAvaliacaoFisica.create({
      registro_id: registro.id,
      status: "concluido",
      payload_json: { data_ouvida: "", medidas: [], observacoes: "" }
    });
  }
  return registro;
}

const payloadValido = {
  data: "2026-08-28",
  medidas: [
    { metrica_codigo: "peso", valor: 78.4 },
    { metrica_codigo: "altura", valor: 179 }
  ]
};

test("confirmar: sucesso cria avaliacao_fisica (origem captura_ia + registro_id), deriva IMC, avança status e NÃO cria validacao", async (t) => {
  const registro = await criarRegistro();
  t.after(async () => {
    await Registro.destroy({ where: { id: registro.id } });
    await limparAvaliacoes();
  });

  const resultado = await service.confirmar({
    usuarioId: usuario.id,
    equipeId: equipe.id,
    registroId: registro.id,
    payload: payloadValido
  });

  const av = await AvaliacaoFisica.findByPk(resultado.avaliacaoFisicaId, { include: [{ model: AvaliacaoFisicaMedida, as: "medidas" }] });
  assert.equal(av.origem, "captura_ia");
  assert.equal(av.registro_id, registro.id);
  assert.equal(av.avaliador_id, usuario.id);

  const imc = av.medidas.find((m) => m.metrica_codigo === "imc");
  assert.ok(imc, "IMC deveria ter sido derivado pelo service");
  assert.equal(Number(imc.valor).toFixed(1), "24.5");

  const registroAtualizado = await Registro.findByPk(registro.id);
  assert.equal(registroAtualizado.status, Registro.STATUS.CONFIRMADO);

  assert.equal(await Validacao.count({ where: { registro_id: registro.id } }), 0, "confirmação de avaliação física nunca cria validacao");
});

test("confirmar: rejeita Registro que não é avaliacao_fisica", async (t) => {
  const registro = await criarRegistro({ tipo: Registro.TIPOS.ATENDIMENTO, comProposta: false });
  t.after(async () => {
    await Registro.destroy({ where: { id: registro.id } });
    await limparAvaliacoes();
  });

  await assert.rejects(
    () => service.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: registro.id, payload: payloadValido }),
    /não é de avaliação física/
  );
});

test("confirmar: rejeita quando não está aguardando_revisao", async (t) => {
  const registro = await criarRegistro({ status: Registro.STATUS.INTERPRETANDO });
  t.after(async () => {
    await Registro.destroy({ where: { id: registro.id } });
    await limparAvaliacoes();
  });

  await assert.rejects(
    () => service.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: registro.id, payload: payloadValido }),
    /aguardando revisão/
  );
});

test("confirmar: rejeita quando não há proposta concluída", async (t) => {
  const registro = await criarRegistro({ comProposta: false });
  t.after(async () => {
    await Registro.destroy({ where: { id: registro.id } });
    await limparAvaliacoes();
  });

  await assert.rejects(
    () => service.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: registro.id, payload: payloadValido }),
    /proposta de avaliação física concluída/
  );
});

test("confirmar: Registro de outra equipe não é encontrado e nada é criado", async (t) => {
  const registro = await criarRegistro();
  t.after(async () => {
    await Registro.destroy({ where: { id: registro.id } });
    await limparAvaliacoes();
  });

  await assert.rejects(
    () => service.confirmar({ usuarioId: usuario.id, equipeId: outraEquipe.id, registroId: registro.id, payload: payloadValido }),
    /não encontrado/
  );
  assert.equal(await AvaliacaoFisica.count({ where: { registro_id: registro.id } }), 0);
  assert.equal((await Registro.findByPk(registro.id)).status, Registro.STATUS.AGUARDANDO_REVISAO);
});

test("confirmar: payload inválido aborta a transação - status não avança, nenhuma avaliação criada", async (t) => {
  const registro = await criarRegistro();
  t.after(async () => {
    await Registro.destroy({ where: { id: registro.id } });
    await limparAvaliacoes();
  });

  await assert.rejects(() =>
    service.confirmar({
      usuarioId: usuario.id,
      equipeId: equipe.id,
      registroId: registro.id,
      payload: { data: "2026-08-28", medidas: [{ metrica_codigo: "metrica_que_nao_existe", valor: 1 }] }
    })
  );

  assert.equal(await AvaliacaoFisica.count({ where: { registro_id: registro.id } }), 0);
  assert.equal((await Registro.findByPk(registro.id)).status, Registro.STATUS.AGUARDANDO_REVISAO);
});

test("confirmar: erro amigável quando já existe avaliação captura_ia do aluno nessa data", async (t) => {
  const r1 = await criarRegistro();
  const r2 = await criarRegistro();
  t.after(async () => {
    await Registro.destroy({ where: { id: [r1.id, r2.id] } });
    await limparAvaliacoes();
  });

  await service.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: r1.id, payload: payloadValido });

  await assert.rejects(
    () => service.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: r2.id, payload: payloadValido }),
    /Já existe uma avaliação física deste aluno nessa data/
  );
  assert.equal((await Registro.findByPk(r2.id)).status, Registro.STATUS.AGUARDANDO_REVISAO);
});

test("confirmar: chamado duas vezes rejeita a segunda (status já confirmado) e não duplica", async (t) => {
  const registro = await criarRegistro();
  t.after(async () => {
    await Registro.destroy({ where: { id: registro.id } });
    await limparAvaliacoes();
  });

  await service.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: registro.id, payload: payloadValido });
  await assert.rejects(
    () => service.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: registro.id, payload: payloadValido }),
    /aguardando revisão/
  );
  assert.equal(await AvaliacaoFisica.count({ where: { registro_id: registro.id } }), 1);
});
