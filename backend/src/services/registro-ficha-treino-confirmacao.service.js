"use strict";

// docs/adr/0028-ficha-de-treino-por-captura-e-ia.md: confirmação de um
// Registro `tipo = ficha_treino`. Análogo ao
// registro-avaliacao-fisica-confirmacao.service - NÃO escreve `validacao`
// (POST /registros/:id/confirmar continua o único caminho, docs/adr/0007). O
// personal confirma as fichas revisadas e cada uma nasce pelo
// fichaTreino.service (mesmas validações do editor manual, docs/adr/0026), com
// `registro_id`, numa transação única com o avanço de `registro.status`: ou
// todas as fichas do ditado são criadas, ou nenhuma.

const registroRepository = require("../repositories/registro.repository");
const fichaTreinoService = require("./fichaTreino.service");
const { NotFoundError, ConflictError, ValidationError } = require("../shared/errors");

const { Registro, sequelize } = registroRepository;

function validarFichas(fichas) {
  if (!Array.isArray(fichas) || fichas.length === 0) {
    throw new ValidationError('"fichas" precisa ser uma lista com pelo menos uma ficha.');
  }
  // Duas fichas do mesmo ditado não podem substituir a mesma ficha ativa.
  const substituidas = fichas.map((ficha) => ficha?.substituiFichaId).filter(Boolean);
  if (new Set(substituidas).size !== substituidas.length) {
    throw new ValidationError("Duas fichas não podem substituir a mesma ficha ativa.");
  }
}

async function confirmar({ usuarioId, equipeId, registroId, payload }) {
  const registro = await registroRepository.obterDetalhado(registroId);
  if (!registro || registro.equipe_id !== equipeId) {
    throw new NotFoundError("Registro não encontrado.");
  }
  if (registro.tipo !== Registro.TIPOS.FICHA_TREINO) {
    throw new ConflictError("Este Registro não é de ficha de treino.");
  }
  if (registro.status !== Registro.STATUS.AGUARDANDO_REVISAO) {
    throw new ConflictError(`Registro não está aguardando revisão (status atual: "${registro.status}").`);
  }
  if (!registro.propostaFichaTreino || registro.propostaFichaTreino.status !== "concluido") {
    throw new ConflictError("Registro ainda não tem uma proposta de ficha de treino concluída para confirmar.");
  }

  const fichas = payload?.fichas;
  validarFichas(fichas);

  const fichasIds = await sequelize.transaction(async (transaction) => {
    const ids = [];
    for (const [indice, ficha] of fichas.entries()) {
      try {
        const criada = await fichaTreinoService.criarNovaVersao(equipeId, usuarioId, registro.aluno_id, ficha || {}, {
          transaction,
          registroId: registro.id
        });
        ids.push(criada.id);
      } catch (err) {
        // Diz qual ficha falhou - a mensagem do service fala em "Grupo N".
        if (fichas.length > 1 && err.statusCode && err.statusCode < 500) {
          err.message = `Ficha ${indice + 1}${ficha?.nome ? ` ("${ficha.nome}")` : ""}: ${err.message}`;
        }
        throw err;
      }
    }
    await registro.update({ status: Registro.STATUS.CONFIRMADO }, { transaction });
    return ids;
  });

  return { registroId: registro.id, fichasIds };
}

module.exports = { confirmar };
