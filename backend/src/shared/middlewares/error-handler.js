"use strict";

const { ValidationError: SequelizeValidationError } = require("sequelize");
const { AppError } = require("../errors");
const logger = require("../logger");

const POSTGRES_INVALID_TEXT_REPRESENTATION = "22P02";
const POSTGRES_UNIQUE_VIOLATION = "23505";

function errorHandler(err, req, res, _next) {
  const log = req.log || logger;

  if (err instanceof AppError) {
    log.warn({ err }, err.message);
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details }
    });
  }

  if (err instanceof SequelizeValidationError && err.original?.code === POSTGRES_UNIQUE_VIOLATION) {
    log.warn({ err }, "Violacao de unicidade");
    return res.status(409).json({
      error: { code: "CONFLICT", message: "Ja existe um registro com esses mesmos dados.", details: null }
    });
  }

  if (err instanceof SequelizeValidationError) {
    log.warn({ err }, "Erro de validacao do Sequelize");
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados invalidos.",
        details: err.errors.map((item) => ({ field: item.path, message: item.message }))
      }
    });
  }

  if (err.name === "SequelizeDatabaseError" && err.original?.code === POSTGRES_INVALID_TEXT_REPRESENTATION) {
    log.warn({ err }, "Valor invalido enviado para o banco");
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Um ou mais valores enviados tem formato invalido (ex.: id que nao e um UUID valido).",
        details: null
      }
    });
  }

  if (err.name === "MulterError") {
    log.warn({ err }, "Erro de upload multipart");
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: `Falha no upload: ${err.message}`, details: null }
    });
  }

  log.error({ err }, "Erro inesperado");
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor.", details: null }
  });
}

module.exports = errorHandler;
