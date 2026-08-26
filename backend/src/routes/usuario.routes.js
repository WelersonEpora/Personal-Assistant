"use strict";

const { Router } = require("express");
const usuarioController = require("../controllers/usuario.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const router = Router();

router.use(autenticar);

// "me" - qualquer usuário autenticado vê a própria foto, independente do
// papel (owner/colaborador). Editar a foto (própria ou de outro membro)
// continua exclusivo do owner, via /api/v1/membros/:id/foto.
router.get("/me/foto", usuarioController.streamFotoPropria);

module.exports = router;
