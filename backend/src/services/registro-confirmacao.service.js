"use strict";

// docs/adr/0007-separacao-ia-persistencia.md: ÚNICO ponto do sistema que
// cria um registro de Validacao (dado oficial). Nenhum job, worker ou rota
// de IA tem acesso a este service - só o controller de confirmação chama.
const registroRepository = require("../repositories/registro.repository");
const { Validacao } = require("../models");
const { NotFoundError, ConflictError, ValidationError } = require("../shared/errors");
const { validarDataAtendimentoPassada } = require("../shared/utils/data-atendimento");

const { Registro, sequelize } = registroRepository;

async function confirmar({ usuarioId, equipeId, registroId, payload }) {
  if (!payload || !Array.isArray(payload.itens)) {
    throw new ValidationError('"itens" é obrigatório e deve ser uma lista.');
  }

  const registro = await registroRepository.obterDetalhado(registroId);
  if (!registro || registro.equipe_id !== equipeId) {
    throw new NotFoundError("Registro não encontrado.");
  }
  if (registro.status !== Registro.STATUS.AGUARDANDO_REVISAO) {
    throw new ConflictError(`Registro não está aguardando revisão (status atual: "${registro.status}").`);
  }
  if (!registro.resultadoIa || registro.resultadoIa.status !== "concluido") {
    throw new ConflictError("Registro ainda não tem um resultado de IA concluído para confirmar.");
  }

  // docs/adr/0019: a data do atendimento é ajustada no "Editar" da revisão e
  // vem junto no payload da confirmação (mesma transação da `validacao`). Não
  // é dado oficial (é campo do `registro`), então não fere a ADR-0007 - o
  // `/confirmar` continua o único que ESCREVE `validacao`. Janela de 60 dias
  // ancorada em iniciado_em (nunca futura, nunca antiga demais).
  const dataAtendimento = payload.dataAtendimento
    ? validarDataAtendimentoPassada(payload.dataAtendimento, registro.iniciado_em)
    : null;

  return sequelize.transaction(async (transaction) => {
    const validacao = await Validacao.create(
      {
        registro_id: registro.id,
        resultado_ia_id: registro.resultadoIa.id,
        usuario_id: usuarioId,
        payload_confirmado_json: {
          itens: payload.itens,
          notaGeral: typeof payload.notaGeral === "string" ? payload.notaGeral : ""
        }
      },
      { transaction }
    );

    const patch = { status: Registro.STATUS.CONFIRMADO };
    if (dataAtendimento && dataAtendimento !== registro.data_atendimento) {
      patch.data_atendimento = dataAtendimento;
    }
    await registro.update(patch, { transaction });

    return validacao;
  });
}

module.exports = { confirmar };
