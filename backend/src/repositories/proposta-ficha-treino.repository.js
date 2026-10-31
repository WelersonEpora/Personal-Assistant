"use strict";

const { PropostaFichaTreino } = require("../models");

// docs/adr/0028-ficha-de-treino-por-captura-e-ia.md: staging da interpretação
// da IA para Registros `tipo = ficha_treino`. O ÚNICO writer é o worker
// (jobs/processador-fila-ia.js). Mesmo formato de
// proposta-avaliacao-fisica.repository - uma linha por Registro, reprocessar
// atualiza a mesma linha.

async function salvarProposta(registroId, dados) {
  const [proposta] = await PropostaFichaTreino.findOrCreate({
    where: { registro_id: registroId },
    defaults: { provedor: "gemini" }
  });
  return proposta.update(dados);
}

function obterPorRegistro(registroId) {
  return PropostaFichaTreino.findOne({ where: { registro_id: registroId } });
}

module.exports = { salvarProposta, obterPorRegistro };
