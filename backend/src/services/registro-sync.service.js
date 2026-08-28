"use strict";

const registroRepository = require("../repositories/registro.repository");
const alunoRepository = require("../repositories/aluno.repository");
const storageAudio = require("../services/storage-audio.service");
const { ValidationError, ForbiddenError, NotFoundError } = require("../shared/errors");
const { enfileirarRegistro } = require("../jobs/processador-fila-ia");

const { Registro, sequelize } = registroRepository;

const TIPOS_REGISTRO = Object.values(Registro.TIPOS);

// Máximo de dias no passado que a CAPTURA pode retroagir (docs/adr/0019). Para
// datas mais antigas, o personal ajusta pelo desktop (endpoint próprio, sem
// essa janela).
const DIAS_RETROATIVOS_CAPTURA = 7;

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

function apenasData(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function somarDias(dataYmd, dias) {
  const d = new Date(`${dataYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// docs/adr/0019: resolve a data do atendimento vinda do cliente.
// - ausente (cliente anterior a esta mudança) -> deriva de iniciadoEm::date,
//   mesma compatibilidade do `tipo` na ADR-0018;
// - presente -> precisa ser AAAA-MM-DD válida e cair na janela
//   [iniciadoEm::date - 7, iniciadoEm::date] (ancorada no INÍCIO da captura,
//   não no relógio do servidor - um Registro iniciado offline e sincronizado
//   dias depois continua válido).
function resolverDataAtendimento(iniciadoEm, dataAtendimento) {
  const iniciadoData = apenasData(iniciadoEm);
  if (!dataAtendimento) {
    return iniciadoData;
  }
  if (typeof dataAtendimento !== "string" || !FORMATO_DATA.test(dataAtendimento)) {
    throw new ValidationError('"dataAtendimento" deve estar no formato AAAA-MM-DD.');
  }
  const d = new Date(`${dataAtendimento}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dataAtendimento) {
    throw new ValidationError('"dataAtendimento" é uma data inválida.');
  }
  const minima = somarDias(iniciadoData, -DIAS_RETROATIVOS_CAPTURA);
  if (dataAtendimento > iniciadoData || dataAtendimento < minima) {
    throw new ValidationError(
      `"dataAtendimento" deve estar entre ${minima} e ${iniciadoData} (até ${DIAS_RETROATIVOS_CAPTURA} dias ` +
        "antes do início da captura). Para datas mais antigas, ajuste pelo desktop."
    );
  }
  return dataAtendimento;
}

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
  // Valida formato/janela da data do atendimento (docs/adr/0019); o valor
  // resolvido é recalculado em `sincronizar`.
  resolverDataAtendimento(metadata.iniciadoEm, metadata.dataAtendimento);
  // docs/adr/0018 - o tipo nasce no cliente; ausente = `atendimento` (mantém
  // compatível com clientes/Registros anteriores a esta mudança).
  if (metadata.tipo !== undefined && !TIPOS_REGISTRO.includes(metadata.tipo)) {
    throw new ValidationError(`"tipo" deve ser um de: ${TIPOS_REGISTRO.join(", ")}.`);
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
async function sincronizar({ usuarioId, equipeId, registroId, metadata, arquivos }) {
  validarMetadata(registroId, metadata);

  const aluno = await alunoRepository.findByIdAndEquipe(metadata.alunoId, equipeId);
  if (!aluno) {
    throw new NotFoundError("Aluno não encontrado.");
  }

  const { registro, criado } = await sequelize.transaction(async (transaction) => {
    const resultado = await registroRepository.obterOuCriarRegistro(
      {
        id: registroId,
        usuarioId,
        equipeId,
        alunoId: metadata.alunoId,
        titulo: metadata.titulo,
        iniciadoEm: metadata.iniciadoEm,
        dataAtendimento: resolverDataAtendimento(metadata.iniciadoEm, metadata.dataAtendimento),
        tipo: metadata.tipo || Registro.TIPOS.ATENDIMENTO
      },
      transaction
    );

    if (resultado.registro.equipe_id !== equipeId) {
      throw new ForbiddenError("Este Registro pertence a outra equipe.");
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

module.exports = { sincronizar, validarMetadata, resolverDataAtendimento, DIAS_RETROATIVOS_CAPTURA };
