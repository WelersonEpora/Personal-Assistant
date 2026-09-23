"use strict";

// docs/adr/0016-avaliacao-fisica-importada-do-legado.md (proposta v3): CRUD da
// avaliação física. Dado objetivo do personal - CRUD direto, como
// `avaliacao_personal`. NÃO passa pelo pipeline de IA, NUNCA vira `validacao`
// (docs/adr/0007 intacto). `origem` (`legado_bodymove`/`manual`) e os
// protocolos das medidas são preservados na edição.

const avaliacaoFisicaRepository = require("../repositories/avaliacaoFisica.repository");
const alunoRepository = require("../repositories/aluno.repository");
const { NotFoundError, ValidationError } = require("../shared/errors");
const { METODOS_VALIDOS } = require("./avaliacao-fisica/metodos");
const { calcularDerivadas, arredondar, DERIVADAS } = require("./avaliacao-fisica/metricas-derivadas");
const { calcularPercentualGordura, idadeEm, PROTOCOLOS_CALCULADOS } = require("./avaliacao-fisica/protocolos-gordura");
const { validarAnamneseJson, validarPosturalJson } = require("./avaliacao-fisica/esquemas");

const TAMANHO_MAXIMO_OBS = 5000;

async function verificarAluno(equipeId, alunoId) {
  const aluno = await alunoRepository.findByIdAndEquipe(alunoId, equipeId);
  if (!aluno) throw new NotFoundError("Aluno não encontrado.");
  return aluno;
}

function validarData(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new ValidationError('"data" deve estar no formato AAAA-MM-DD.');
  }
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    throw new ValidationError('"data" é uma data inválida.');
  }
  return valor;
}

function validarObservacoes(valor) {
  if (valor === undefined || valor === null) return null;
  const t = String(valor).trim();
  if (!t) return null;
  if (t.length > TAMANHO_MAXIMO_OBS) {
    throw new ValidationError(`"observacoes" não pode passar de ${TAMANHO_MAXIMO_OBS} caracteres.`);
  }
  return t;
}

// docs/adr/0024 - calculada junto com a % de gordura de um protocolo de dobras.
const CALCULADAS_POR_PROTOCOLO = ["densidade_corporal"];

// Contexto do cálculo por protocolo (docs/adr/0024): sexo do aluno e idade na
// data da avaliação.
function contextoDoAluno(aluno, dataAvaliacao) {
  return {
    sexo: aluno?.sexo || null,
    idade: idadeEm(aluno?.data_nascimento, dataAvaliacao)
  };
}

// % de gordura (+ densidade) dos protocolos pedidos com `calcular: true`, a
// partir das dobras medidas. Faltando dado (dobra, sexo, nascimento) a % não
// sai - a avaliação é salva do mesmo jeito (série esparsa); o formulário avisa
// antes o que falta.
function linhasCalculadasPorProtocolo(pedidos, linhasMedidas, contexto, catalogoPorCodigo) {
  const dobras = {};
  for (const l of linhasMedidas) {
    if (l.metodo === "direto") dobras[l.metrica_codigo] = l.valor;
  }
  const linhas = [];
  for (const { metodo, principal } of pedidos) {
    const r = calcularPercentualGordura(metodo, { dobras, ...contexto });
    if (r.faltando) continue;
    linhas.push({
      metrica_codigo: "percentual_gordura",
      metodo,
      principal,
      valor: arredondar(r.percentual, catalogoPorCodigo.get("percentual_gordura").casas_decimais),
      origem_valor: "calculado"
    });
    const metricaDensidade = catalogoPorCodigo.get("densidade_corporal");
    if (metricaDensidade?.ativo && !linhas.some((l) => l.metrica_codigo === "densidade_corporal")) {
      linhas.push({
        metrica_codigo: "densidade_corporal",
        metodo,
        principal: true,
        valor: arredondar(r.densidade, metricaDensidade.casas_decimais),
        origem_valor: "calculado"
      });
    }
  }
  return linhas;
}

// entradas: [{ metrica_codigo, metodo?, valor, principal? }] -> linhas de medida
// validadas/normalizadas (sem avaliacao_fisica_id), já com as derivadas.
// docs/adr/0024: `{ metrica_codigo: 'percentual_gordura', metodo: 'pollock_7',
// calcular: true }` (sem `valor`) pede a % calculada pelo protocolo - precisa
// do `contexto` (sexo/idade do aluno).
function normalizarMedidas(entradas, catalogoPorCodigo, contexto = {}) {
  if (entradas === undefined) return null;
  if (!Array.isArray(entradas)) throw new ValidationError('"medidas" deve ser uma lista.');

  const vistos = new Set();
  const linhas = [];
  const pedidosCalculo = [];

  for (const entrada of entradas) {
    if (!entrada || typeof entrada !== "object") {
      throw new ValidationError("Cada medida deve ser um objeto.");
    }
    const codigo = String(entrada.metrica_codigo || "").trim();
    const metrica = catalogoPorCodigo.get(codigo);
    if (!metrica || !metrica.ativo) {
      throw new ValidationError(`Métrica "${codigo}" não existe no catálogo (ou está inativa).`);
    }
    if (DERIVADAS.includes(codigo) || CALCULADAS_POR_PROTOCOLO.includes(codigo)) {
      throw new ValidationError(`"${codigo}" é calculada automaticamente - não envie como medida.`);
    }

    const metodo = String(entrada.metodo || "direto").trim() || "direto";
    if (!METODOS_VALIDOS.includes(metodo)) {
      throw new ValidationError(`Método "${metodo}" inválido para "${codigo}".`);
    }

    const chave = `${codigo}|${metodo}`;
    if (vistos.has(chave)) {
      throw new ValidationError(`Medida duplicada: "${codigo}" com método "${metodo}".`);
    }
    vistos.add(chave);

    if (entrada.calcular === true) {
      if (codigo !== "percentual_gordura" || !PROTOCOLOS_CALCULADOS.includes(metodo)) {
        throw new ValidationError(`O sistema não calcula "${codigo}" pelo método "${metodo}" - informe o valor.`);
      }
      pedidosCalculo.push({ metodo, principal: Boolean(entrada.principal) });
      continue;
    }

    const valorNum = typeof entrada.valor === "number" ? entrada.valor : Number(entrada.valor);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      throw new ValidationError(`Valor de "${codigo}" deve ser um número maior que zero.`);
    }

    linhas.push({
      metrica_codigo: codigo,
      metodo,
      principal: Boolean(entrada.principal),
      valor: arredondar(valorNum, metrica.casas_decimais),
      origem_valor: "medido"
    });
  }

  linhas.push(...linhasCalculadasPorProtocolo(pedidosCalculo, linhas, contexto, catalogoPorCodigo));

  // principal: no máximo um por métrica; se nenhum marcado, o primeiro.
  const porMetrica = new Map();
  for (const linha of linhas) {
    if (!porMetrica.has(linha.metrica_codigo)) porMetrica.set(linha.metrica_codigo, []);
    porMetrica.get(linha.metrica_codigo).push(linha);
  }
  for (const [codigo, grupo] of porMetrica) {
    const principais = grupo.filter((l) => l.principal);
    if (principais.length > 1) {
      throw new ValidationError(`"${codigo}" tem mais de um valor marcado como principal.`);
    }
    if (principais.length === 0) grupo[0].principal = true;
  }

  // Derivadas (imc/rcq) a partir das medidas principais.
  const mapaPrincipais = {};
  for (const linha of linhas) {
    if (linha.principal) mapaPrincipais[linha.metrica_codigo] = linha.valor;
  }
  return [...linhas, ...calcularDerivadas(mapaPrincipais)];
}

async function carregarCatalogo() {
  const catalogo = await avaliacaoFisicaRepository.listarCatalogo();
  return new Map(catalogo.map((m) => [m.codigo, m]));
}

async function listarMetricas() {
  return avaliacaoFisicaRepository.listarCatalogo();
}

async function listar(equipeId, alunoId) {
  await verificarAluno(equipeId, alunoId);
  return avaliacaoFisicaRepository.listarPorAluno({ alunoId, equipeId });
}

async function obter(equipeId, alunoId, id) {
  await verificarAluno(equipeId, alunoId);
  const avaliacao = await avaliacaoFisicaRepository.obterPorId({ id, equipeId });
  if (!avaliacao || avaliacao.aluno_id !== alunoId) {
    throw new NotFoundError("Avaliação física não encontrada.");
  }
  return avaliacao;
}

// `opcoes` (docs/adr/0018): `origem` continua server-set - o cliente nunca a
// escolhe; o default `manual` é o CRUD direto, `captura_ia` vem do service de
// confirmação de Registro. `registroId` liga a avaliação ao Registro que a
// originou. `transaction` compõe esta criação com o avanço de `registro.status`
// numa transação única - nesse caso devolve só o id (o chamador refaz o fetch
// depois do commit, fora da transação estrangeira).
async function criar(equipeId, alunoId, autorId, dados = {}, opcoes = {}) {
  const { origem = "manual", registroId = null, transaction = null } = opcoes;
  const aluno = await verificarAluno(equipeId, alunoId);

  const catalogo = await carregarCatalogo();
  const header = {
    aluno_id: alunoId,
    equipe_id: equipeId,
    data: validarData(dados.data),
    origem,
    avaliador_id: autorId,
    registro_id: registroId,
    anamnese_json: validarAnamneseJson(dados.anamnese_json ?? null),
    postural_json: validarPosturalJson(dados.postural_json ?? null),
    observacoes: validarObservacoes(dados.observacoes)
  };
  const medidas = normalizarMedidas(dados.medidas ?? [], catalogo, contextoDoAluno(aluno, header.data)) || [];

  const id = await avaliacaoFisicaRepository.criar({ header, medidas }, transaction);
  if (transaction) return id;
  return avaliacaoFisicaRepository.obterPorId({ id, equipeId });
}

async function atualizar(equipeId, alunoId, id, dados = {}) {
  const aluno = await verificarAluno(equipeId, alunoId);
  const avaliacao = await avaliacaoFisicaRepository.obterPorId({ id, equipeId });
  if (!avaliacao || avaliacao.aluno_id !== alunoId) {
    throw new NotFoundError("Avaliação física não encontrada.");
  }

  // `origem` e `avaliador_id` NUNCA mudam no update (preserva legado_bodymove).
  const header = {};
  if (dados.data !== undefined) header.data = validarData(dados.data);
  if (dados.observacoes !== undefined) header.observacoes = validarObservacoes(dados.observacoes);
  if (dados.anamnese_json !== undefined) header.anamnese_json = validarAnamneseJson(dados.anamnese_json);
  if (dados.postural_json !== undefined) header.postural_json = validarPosturalJson(dados.postural_json);

  let medidas = null;
  if (dados.medidas !== undefined) {
    const catalogo = await carregarCatalogo();
    const dataAvaliacao = header.data ?? String(avaliacao.data).slice(0, 10);
    medidas = normalizarMedidas(dados.medidas || [], catalogo, contextoDoAluno(aluno, dataAvaliacao)) || [];
  }

  await avaliacaoFisicaRepository.atualizar(avaliacao, { header, medidas });
  return avaliacaoFisicaRepository.obterPorId({ id, equipeId });
}

async function excluir(equipeId, alunoId, id) {
  await verificarAluno(equipeId, alunoId);
  const avaliacao = await avaliacaoFisicaRepository.obterPorId({ id, equipeId });
  if (!avaliacao || avaliacao.aluno_id !== alunoId) {
    throw new NotFoundError("Avaliação física não encontrada.");
  }
  await avaliacaoFisicaRepository.excluir(avaliacao);
}

module.exports = { listarMetricas, listar, obter, criar, atualizar, excluir };
