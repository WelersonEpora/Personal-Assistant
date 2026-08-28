"use strict";

const { PropostaAvaliacaoFisica } = require("../models");

// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: staging da interpretação
// da IA para Registros `tipo = avaliacao_fisica`. O ÚNICO writer é o worker
// (jobs/processador-fila-ia.js). Espelha salvarResultadoIa (registro.repository)
// - uma linha por Registro, reprocessar atualiza a mesma linha.

async function salvarProposta(registroId, dados) {
  const [proposta] = await PropostaAvaliacaoFisica.findOrCreate({
    where: { registro_id: registroId },
    defaults: { provedor: "gemini" }
  });
  return proposta.update(dados);
}

function obterPorRegistro(registroId) {
  return PropostaAvaliacaoFisica.findOne({ where: { registro_id: registroId } });
}

module.exports = { salvarProposta, obterPorRegistro };
