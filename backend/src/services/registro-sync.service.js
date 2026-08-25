"use strict";

const registroRepository = require("../repositories/registro.repository");
const storageAudio = require("../services/storage-audio.service");
const { Aluno } = require("../models");
const { ValidationError, ForbiddenError, NotFoundError } = require("../shared/errors");
const { enfileirarRegistro } = require("../jobs/processador-fila-ia");

const { Registro, sequelize } = registroRepository;

function validarMetadata(registroId, metadata) {
  if (!metadata || metadata.id !== registroId) {
    throw new ValidationError('O "id" do metadata precisa ser igual ao id do Registro na URL.');
  }
  if (!metadata.alunoId) {
    throw new ValidationError('"alunoId" é obrigatório.');
  }
  if (!metadata.iniciadoEm) {
    throw new ValidationError('"iniciadoEm" é obrigatório.');
  }
  if (!Array.isArray(metadata.entradas) || metadata.entradas.length === 0) {
    throw new ValidationError("O Registro precisa de ao menos uma entrada.");
  }
  metadata.entradas.forEach((entrada, indice) => {
    if (!["audio", "texto"].includes(entrada.tipo)) {
      throw new ValidationError(`entradas[${indice}].tipo deve ser "audio" ou "texto".`);
    }
    if (!Number.isInteger(entrada.ordem) || entrada.ordem < 0) {
      throw new ValidationError(`entradas[${indice}].ordem deve ser um inteiro >= 0.`);
    }
    if (entrada.tipo === "texto" && (!entrada.conteudoTexto || !entrada.conteudoTexto.trim())) {
      throw new ValidationError(`entradas[${indice}].conteudoTexto é obrigatório para entradas de texto.`);
    }
  });
}

// Sincronização de um Registro completo, em uma única requisição atômica
// (docs/adr/0005-estrategia-sincronizacao.md). Idempotente pelo id gerado
// no cliente - reenviar o mesmo Registro (rede instável, retry automático)
// nunca duplica entradas nem arquivos de áudio, e só entra na fila de IA
// uma vez (na 1a vez que chega, ou se ainda não tinha começado a processar).
async function sincronizar({ usuarioId, registroId, metadata, arquivos }) {
  validarMetadata(registroId, metadata);

  const aluno = await Aluno.findOne({ where: { id: metadata.alunoId, usuario_id: usuarioId } });
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }

  const { registro, criado } = await sequelize.transaction(async (transaction) => {
    const resultado = await registroRepository.obterOuCriarRegistro(
      { id: registroId, usuarioId, alunoId: metadata.alunoId, titulo: metadata.titulo, iniciadoEm: metadata.iniciadoEm },
      transaction
    );

    if (resultado.registro.usuario_id !== usuarioId) {
      throw new ForbiddenError("Este Registro pertence a outro usuário.");
    }

    for (const entradaMeta of metadata.entradas) {
      const entrada = await registroRepository.obterOuCriarEntrada(
        {
          registroId: resultado.registro.id,
          ordem: entradaMeta.ordem,
          tipo: entradaMeta.tipo,
          conteudoTexto: entradaMeta.tipo === "texto" ? entradaMeta.conteudoTexto : null,
          duracaoSegundos: entradaMeta.tipo === "audio" ? entradaMeta.duracaoSegundos ?? null : null
        },
        transaction
      );

      if (entradaMeta.tipo === "audio") {
        const arquivo = arquivos.get(entradaMeta.ordem);
        const jaTemAudio = await registroRepository.entradaTemArquivoAudio(entrada.id, transaction);
        if (!jaTemAudio) {
          if (!arquivo) {
            throw new ValidationError(`Arquivo de áudio ausente para a entrada de ordem ${entradaMeta.ordem}.`);
          }
          const nomeArquivo = await storageAudio.salvar({ entradaId: entrada.id, buffer: arquivo.buffer, mimeType: arquivo.mimetype });
          await registroRepository.criarArquivoAudio(
            { registroEntradaId: entrada.id, caminhoArmazenamento: nomeArquivo, mimeType: arquivo.mimetype, tamanhoBytes: arquivo.buffer.length },
            transaction
          );
        }
      }
    }

    return resultado;
  });

  if (criado || registro.status === Registro.STATUS.RECEBIDO) {
    enfileirarRegistro(registro.id);
  }

  return registro;
}

module.exports = { sincronizar, validarMetadata };
