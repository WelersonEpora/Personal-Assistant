"use strict";

// docs/adr/0007-separacao-ia-persistencia.md: este é o único ponto do
// sistema que pode criar uma Validacao. Os testes abaixo comprovam as
// guardas que tornam essa garantia estrutural, não só de convenção.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { Usuario, Equipe, Aluno, Registro, RegistroEntrada, ResultadoIa, Validacao } = require("../models");
const registroConfirmacaoService = require("./registro-confirmacao.service");

let usuario;
let equipe;
let outraEquipe;
let aluno;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal de Teste", email: `teste-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipe = await Equipe.create({ nome: `Equipe de Teste ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra Equipe ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno de Teste" });
});

after(async () => {
  await Aluno.destroy({ where: { id: aluno.id } });
  await Usuario.destroy({ where: { id: usuario.id } });
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
});

async function criarRegistro(status) {
  const registro = await Registro.create({
    id: randomUUID(),
    usuario_id: usuario.id,
    equipe_id: equipe.id,
    aluno_id: aluno.id,
    iniciado_em: new Date(),
    status
  });
  await RegistroEntrada.create({ registro_id: registro.id, ordem: 0, tipo: "texto", conteudo_texto: "Conteúdo de teste." });
  return registro;
}

test("confirmar: rejeita quando o Registro não está aguardando_revisao", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.RECEBIDO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await assert.rejects(
    () => registroConfirmacaoService.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: registro.id, payload: { itens: [] } }),
    /aguardando revisão/
  );
});

test("confirmar: rejeita quando não há resultado_ia concluído", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.AGUARDANDO_REVISAO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await assert.rejects(
    () => registroConfirmacaoService.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: registro.id, payload: { itens: [] } }),
    /resultado de IA concluído/
  );
});

test("confirmar: rejeita quando o Registro pertence a outra equipe e não cria Validacao", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.AGUARDANDO_REVISAO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await ResultadoIa.create({ registro_id: registro.id, payload_json: { itens: [] }, status: "concluido" });

  await assert.rejects(
    () =>
      registroConfirmacaoService.confirmar({
        usuarioId: usuario.id,
        equipeId: outraEquipe.id,
        registroId: registro.id,
        payload: { itens: [] }
      }),
    /não encontrado/
  );

  const totalValidacoes = await Validacao.count({ where: { registro_id: registro.id } });
  assert.equal(totalValidacoes, 0);
});

test("confirmar: caminho de sucesso cria Validacao e avança o status para confirmado", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.AGUARDANDO_REVISAO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await ResultadoIa.create({
    registro_id: registro.id,
    payload_json: { itens: [{ label: "Agachamento", valor: "4x10" }] },
    status: "concluido"
  });

  const payloadConfirmado = { itens: [{ label: "Agachamento", valor: "4x10 - 30kg", obs: "", confidence: "alta" }], notaGeral: "" };
  const validacao = await registroConfirmacaoService.confirmar({
    usuarioId: usuario.id,
    equipeId: equipe.id,
    registroId: registro.id,
    payload: payloadConfirmado
  });

  assert.equal(validacao.usuario_id, usuario.id);
  assert.deepEqual(validacao.payload_confirmado_json, payloadConfirmado);

  const registroAtualizado = await Registro.findByPk(registro.id);
  assert.equal(registroAtualizado.status, Registro.STATUS.CONFIRMADO);

  const totalValidacoes = await Validacao.count({ where: { registro_id: registro.id } });
  assert.equal(totalValidacoes, 1);
});

test("confirmar: chamado duas vezes no mesmo Registro rejeita a segunda vez (dado oficial não é sobrescrito)", async (t) => {
  const registro = await criarRegistro(Registro.STATUS.AGUARDANDO_REVISAO);
  t.after(() => Registro.destroy({ where: { id: registro.id } }));

  await ResultadoIa.create({ registro_id: registro.id, payload_json: { itens: [] }, status: "concluido" });

  await registroConfirmacaoService.confirmar({ usuarioId: usuario.id, equipeId: equipe.id, registroId: registro.id, payload: { itens: [] } });

  await assert.rejects(
    () =>
      registroConfirmacaoService.confirmar({
        usuarioId: usuario.id,
        equipeId: equipe.id,
        registroId: registro.id,
        payload: { itens: [{ label: "X", valor: "Y" }] }
      }),
    /aguardando revisão/
  );

  const totalValidacoes = await Validacao.count({ where: { registro_id: registro.id } });
  assert.equal(totalValidacoes, 1);
});
