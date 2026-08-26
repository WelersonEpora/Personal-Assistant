"use strict";

const { Router } = require("express");
const multer = require("multer");
const alunoController = require("../controllers/aluno.controller");
const autenticar = require("../shared/middlewares/auth.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.use(autenticar);

router.get("/", alunoController.list);
router.post("/", alunoController.create);
router.get("/:id", alunoController.getById);
router.put("/:id", alunoController.update);
router.delete("/:id", alunoController.excluir);
router.post("/:id/foto", upload.single("foto"), alunoController.enviarFoto);
router.get("/:id/foto", alunoController.streamFoto);

module.exports = router;
