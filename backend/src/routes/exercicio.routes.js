"use strict";

const { Router } = require("express");
const multer = require("multer");
const exercicioController = require("../controllers/exercicio.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.use(autenticar);

router.get("/", exercicioController.list);
router.post("/", exercicioController.create);
router.get("/:id", exercicioController.getById);
router.put("/:id", exercicioController.update);
router.delete("/:id", exercicioController.excluir);
// :posicao é "inicio" ou "fim" (validado no service) - duas imagens por
// exercício, mesmo padrão do free-exercise-db (docs/adr/0013).
router.post("/:id/imagem/:posicao", upload.single("imagem"), exercicioController.enviarImagem);
router.get("/:id/imagem/:posicao", exercicioController.streamImagem);
router.delete("/:id/imagem/:posicao", exercicioController.removerImagem);
// docs/adr/0027: apelidos da equipe (os globais vêm do seed e não saem daqui).
router.post("/:id/apelidos", exercicioController.adicionarApelido);
router.delete("/:id/apelidos/:apelidoId", exercicioController.removerApelido);

module.exports = router;
