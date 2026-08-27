"use strict";

const { Router } = require("express");
const fichaTreinoController = require("../controllers/ficha-treino.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const router = Router();

router.use(autenticar);

// Consulta avulsa de uma ficha (ex.: abrir um item do histórico a partir da
// tela do aluno). Criação/listagem por aluno vivem em aluno.routes.js -
// mesmo critério de nested path já usado para as entradas de Registro.
router.get("/:id", fichaTreinoController.obterDetalhe);

module.exports = router;
