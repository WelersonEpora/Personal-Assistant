"use strict";

const { Router } = require("express");
const atividadesController = require("../controllers/atividades.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const router = Router();

router.use(autenticar);

// Relatório de atividade por período (docs/adr/0020) - somente leitura,
// escopado pela equipe do token. Params: de, ate, aluno_id, tipo,
// somente_confirmados (ver atividades.service.js).
router.get("/", atividadesController.obter);

module.exports = router;
