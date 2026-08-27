"use strict";

const { Router } = require("express");
const fichaPublicaController = require("../controllers/ficha-publica.controller");

// docs/adr/0014-acesso-aluno-ficha-por-link.md: rotas PÚBLICAS - sem o
// middleware `autenticar`. O acesso é controlado só pela posse do token
// opaco no path (nenhum aluno_id/ficha_id/equipe_id em parâmetro nenhum).
const router = Router();

router.get("/:token", fichaPublicaController.obterFicha);
router.get("/:token/exercicios/:exercicioId/imagem/:posicao", fichaPublicaController.streamImagem);

module.exports = router;
