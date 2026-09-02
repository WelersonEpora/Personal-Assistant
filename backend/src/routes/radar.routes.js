"use strict";

const { Router } = require("express");
const radarController = require("../controllers/radar.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const router = Router();

router.use(autenticar);

// Feed do Radar (docs/adr/0022) - global, só leitura, visível para todo
// usuário autenticado. Params opcionais: de, ate ("AAAA-MM-DD", janela por
// created_at), grupos ("forca,populacoes" - chaves de config/radar.js),
// pagina, por_pagina. Rodar a busca e curar o feed são scripts de operador
// (npm run radar:rodar / radar:ocultar / radar:execucoes) - sem endpoint,
// porque o feed é compartilhado por todos os tenants.
router.get("/", radarController.listar);

module.exports = router;
