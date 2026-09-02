"use strict";

const radarService = require("../services/radar.service");
const { success } = require("../shared/utils/api-response");

// docs/adr/0022 - feed do Radar. Só leitura; qualquer usuário autenticado.
// Filtros opcionais: período (de/ate por `created_at`) e grupos de assunto
// (?grupos=forca,populacoes). Rodar a busca / ver execuções / ocultar item
// são scripts de operador (ver routes).
async function listar(req, res) {
  const resultado = await radarService.listar({
    pagina: req.query.pagina,
    porPagina: req.query.por_pagina,
    de: req.query.de,
    ate: req.query.ate,
    grupos: req.query.grupos
  });
  success(res, resultado);
}

module.exports = { listar };
