"use strict";

const { Router } = require("express");
const multer = require("multer");
const registroController = require("../controllers/registro.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const router = Router();

router.use(autenticar);

router.get("/", registroController.list);
router.get("/:id", registroController.getById);
router.post("/:id/sincronizar", upload.any(), registroController.sincronizar);
router.get("/:id/entradas/:entradaId/audio", registroController.streamAudio);
router.post("/:id/confirmar", registroController.confirmar);

module.exports = router;
