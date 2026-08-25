"use strict";

const AppError = require("./app-error");

class NotFoundError extends AppError {
  constructor(message = "Recurso nao encontrado.", details = null) {
    super(message, 404, "NOT_FOUND", details);
  }
}

class ValidationError extends AppError {
  constructor(message = "Dados invalidos.", details = null) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

class ConflictError extends AppError {
  constructor(message = "Conflito de dados.", details = null) {
    super(message, 409, "CONFLICT", details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Nao autorizado.", details = null) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "Acesso negado.", details = null) {
    super(message, 403, "FORBIDDEN", details);
  }
}

module.exports = { NotFoundError, ValidationError, ConflictError, UnauthorizedError, ForbiddenError };
