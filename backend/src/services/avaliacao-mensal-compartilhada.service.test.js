"use strict";

// docs/adr/0023-compartilhar-avaliacao-mensal-com-o-aluno.md. Integração -
// toca o banco de teste. Cobre: upsert 1:1 da revisão, exigência de avaliação
// "gerada", detecção de "regerada depois da revisão", escopo por equipe e - o
// mais importante - o fluxo NÃO cria `validacao` (a avaliação nunca é oficial).

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const {
  sequelize,
  Usuario,
  Equipe,
  Aluno,
  Registro,
  Validacao,
  AvaliacaoMensal,
  RevisaoAvaliacaoMensal
} = require("../models");
const service = require("./avaliacao-mensal-compartilhada.service");

let usuario;
let equipe;
let outraEquipe;
let aluno;

before(async () => {
  usuario = await Usuario.create({ nome: "Personal", email: `t-${randomUUID()}@exemplo.com`, senha_hash: "hash" });
  equipe = await Equipe.create({ nome: `Equipe ${randomUUID()}` });
  outraEquipe = await Equipe.create({ nome: `Outra ${randomUUID()}` });
  aluno = await Aluno.create({ equipe_id: equipe.id, nome: "Aluno de Teste" });
});

after(async () => {
  await RevisaoAvaliacaoMensal.destroy({ where: { aluno_id: aluno.id } });
  await AvaliacaoMensal.destroy({ where: { aluno_id: aluno.id } });
  await Aluno.destroy({ where: { id: aluno.id } });
  await Equipe.destroy({ where: { id: [equipe.id, outraEquipe.id] } });
  await Usuario.destroy({ where: { id: usuario.id } });
});

beforeEach(async () => {
  await RevisaoAvaliacaoMensal.destroy({ where: { aluno_id: aluno.id } });
  await AvaliacaoMensal.destroy({ where: { aluno_id: aluno.id } });
});

function criarAvaliacaoMensal({ anoMes = "2026-08", status = "gerada", geradaEm = new Date() } = {}) {
  return AvaliacaoMensal.create({
    aluno_id: aluno.id,
    equipe_id: equipe.id,
    ano_mes: anoMes,
    periodo_inicio: `${anoMes}-01`,
    periodo_fim: `${anoMes}-28`,
    status,
    origem: "manual",
    relatos_considerados: 6,
    baseada_em_registro_ids: [],
    avaliacao_json: {
      resumo_geral: "Evolução consistente.",
      dimensoes: [{ nome: "Força", situacao_atual: "boa", evolucao_no_mes: "subindo", confianca: "alta" }],
      destaques: ["Frequência de 4x/semana"],
      recomendacoes: ["Manter progressão de carga"]
    },
    contexto_consolidado_json: { aluno_id: aluno.id },
    gerada_em: geradaEm
  });
}

test("salvar cria a revisão (comentário + itens excluídos) para uma avaliação gerada", async () => {
  const avaliacao = await criarAvaliacaoMensal();

  const { revisao, desatualizada } = await service.salvar(equipe.id, aluno.id, "2026-08", usuario.id, {
    comentario: "Parabéns pela constância neste mês!",
    itens_excluidos: ["destaque:0", "destaque:0"]
  });

  assert.equal(desatualizada, false);
  assert.equal(revisao.comentario, "Parabéns pela constância neste mês!");
  assert.deepEqual(revisao.itens_excluidos, ["destaque:0"]);
  assert.equal(revisao.avaliacao_mensal_id, avaliacao.id);
  assert.equal(revisao.autor?.nome, "Personal");
});

test("salvar de novo faz upsert (1:1), não cria uma segunda linha", async () => {
  await criarAvaliacaoMensal();
  await service.salvar(equipe.id, aluno.id, "2026-08", usuario.id, { comentario: "primeira versão" });
  await service.salvar(equipe.id, aluno.id, "2026-08", usuario.id, { comentario: "segunda versão", itens_excluidos: [] });

  const linhas = await RevisaoAvaliacaoMensal.findAll({ where: { aluno_id: aluno.id } });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].comentario, "segunda versão");
});

test("comentário é obrigatório", async () => {
  await criarAvaliacaoMensal();
  await assert.rejects(
    () => service.salvar(equipe.id, aluno.id, "2026-08", usuario.id, { comentario: "   " }),
    /comentario.*obrigat/i
  );
});

test("recusa compartilhar avaliação que não está 'gerada'", async () => {
  await criarAvaliacaoMensal({ status: "dados_insuficientes" });
  await assert.rejects(
    () => service.salvar(equipe.id, aluno.id, "2026-08", usuario.id, { comentario: "vai" }),
    /gerar/i
  );
});

test("GET marca a revisão como desatualizada quando a avaliação foi regerada depois", async () => {
  const avaliacao = await criarAvaliacaoMensal({ geradaEm: new Date("2026-09-01T10:00:00Z") });
  await service.salvar(equipe.id, aluno.id, "2026-08", usuario.id, { comentario: "revisado" });

  let atual = await service.obter(equipe.id, aluno.id, "2026-08");
  assert.equal(atual.desatualizada, false);

  await avaliacao.update({ gerada_em: new Date("2026-09-05T10:00:00Z") });

  atual = await service.obter(equipe.id, aluno.id, "2026-08");
  assert.equal(atual.desatualizada, true);
  assert.ok(atual.revisao);
});

test("excluir remove a revisão", async () => {
  await criarAvaliacaoMensal();
  await service.salvar(equipe.id, aluno.id, "2026-08", usuario.id, { comentario: "x" });

  await service.excluir(equipe.id, aluno.id, "2026-08");

  const { revisao } = await service.obter(equipe.id, aluno.id, "2026-08");
  assert.equal(revisao, null);
});

test("aluno de outra equipe: 404", async () => {
  await criarAvaliacaoMensal();
  await assert.rejects(
    () => service.salvar(outraEquipe.id, aluno.id, "2026-08", usuario.id, { comentario: "x" }),
    /não encontrado/i
  );
});

test("o fluxo de compartilhamento NUNCA cria uma Validacao", async () => {
  await criarAvaliacaoMensal();
  const contar = () =>
    Validacao.count({ include: [{ model: Registro, as: "registro", required: true, where: { aluno_id: aluno.id } }] });

  const antes = await contar();
  await service.salvar(equipe.id, aluno.id, "2026-08", usuario.id, { comentario: "x" });
  await service.salvar(equipe.id, aluno.id, "2026-08", usuario.id, { comentario: "y" });
  await service.excluir(equipe.id, aluno.id, "2026-08");
  const depois = await contar();

  assert.equal(depois, antes);
});

// Mantém o require do sequelize "usado" para lint e deixa o teardown explícito.
test("teardown: sem revisões órfãs", async () => {
  await sequelize.query("SELECT 1");
  const linhas = await RevisaoAvaliacaoMensal.findAll({ where: { aluno_id: aluno.id } });
  assert.equal(linhas.length, 0);
});
