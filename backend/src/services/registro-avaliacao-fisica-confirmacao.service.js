"use strict";

// docs/adr/0018-avaliacao-fisica-por-captura-e-ia.md: confirmação de um
// Registro `tipo = avaliacao_fisica`. É o análogo de
// registro-confirmacao.service para avaliação física - MAS não escreve
// `validacao` (aquele endpoint continua sendo o único que escreve `validacao`,
// docs/adr/0007 intacto). Aqui o personal confirma a proposta da IA e a
// avaliação nasce pelo avaliacao-fisica.service (mesma validação v3, mesmo
// recálculo de imc/rcq/massa_*), com `origem = captura_ia` e vínculo ao
// Registro, numa transação única com o avanço de `registro.status`.

const registroRepository = require("../repositories/registro.repository");
const avaliacaoFisicaRepository = require("../repositories/avaliacaoFisica.repository");
const avaliacaoFisicaService = require("./avaliacao-fisica.service");
const { NotFoundError, ConflictError } = require("../shared/errors");

const { Registro, sequelize } = registroRepository;

async function confirmar({ usuarioId, equipeId, registroId, payload }) {
  const registro = await registroRepository.obterDetalhado(registroId);
  if (!registro || registro.equipe_id !== equipeId) {
    throw new NotFoundError("Registro não encontrado.");
  }
  if (registro.tipo !== Registro.TIPOS.AVALIACAO_FISICA) {
    throw new ConflictError("Este Registro não é de avaliação física.");
  }
  if (registro.status !== Registro.STATUS.AGUARDANDO_REVISAO) {
    throw new ConflictError(`Registro não está aguardando revisão (status atual: "${registro.status}").`);
  }
  if (!registro.propostaAvaliacaoFisica || registro.propostaAvaliacaoFisica.status !== "concluido") {
    throw new ConflictError("Registro ainda não tem uma proposta de avaliação física concluída para confirmar.");
  }

  let avaliacaoFisicaId;
  try {
    avaliacaoFisicaId = await sequelize.transaction(async (transaction) => {
      const id = await avaliacaoFisicaService.criar(equipeId, registro.aluno_id, usuarioId, payload || {}, {
        origem: "captura_ia",
        registroId: registro.id,
        transaction
      });
      await registro.update({ status: Registro.STATUS.CONFIRMADO }, { transaction });
      return id;
    });
  } catch (err) {
    // uq_avaliacao_fisica_import (aluno_id, data, origem): já existe uma
    // avaliação `captura_ia` desse aluno nessa data (docs/adr/0016).
    if (err.name === "SequelizeUniqueConstraintError" && err.parent?.constraint === "uq_avaliacao_fisica_import") {
      throw new ConflictError("Já existe uma avaliação física deste aluno nessa data. Ajuste a data antes de confirmar.");
    }
    throw err;
  }

  return {
    registroId: registro.id,
    avaliacaoFisicaId,
    avaliacaoFisica: await avaliacaoFisicaRepository.obterPorId({ id: avaliacaoFisicaId, equipeId })
  };
}

module.exports = { confirmar };
