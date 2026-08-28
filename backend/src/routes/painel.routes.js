"use strict";

const { Router } = require("express");
const painelController = require("../controllers/painel.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const router = Router();

router.use(autenticar);

// Resumo agregado do dashboard do /admin (docs/adr/0017) - somente leitura,
// escopado pela equipe do token.
router.get("/", painelController.obter);

module.exports = router;
