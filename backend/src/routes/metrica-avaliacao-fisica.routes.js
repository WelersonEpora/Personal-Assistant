"use strict";

const { Router } = require("express");
const avaliacaoFisicaController = require("../controllers/avaliacao-fisica.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

// docs/adr/0016: catálogo de métricas de avaliação física (dado de referência,
// não escopado por equipe). Somente leitura - alimenta o formulário de
// avaliação. Populado por seeder.
const router = Router();

router.use(autenticar);
router.get("/", avaliacaoFisicaController.listarMetricas);

module.exports = router;
