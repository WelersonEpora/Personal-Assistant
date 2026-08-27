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

module.exports = router;
