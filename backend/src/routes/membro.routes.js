"use strict";

const { Router } = require("express");
const multer = require("multer");
const membroController = require("../controllers/membro.controller");
const autenticar = require("../shared/middlewares/auth.middleware");
const { exigirOwner } = require("../shared/middlewares/papel.middleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.use(autenticar, exigirOwner);

router.get("/", membroController.list);
router.post("/", membroController.create);
router.put("/:id", membroController.update);
router.post("/:id/foto", upload.single("foto"), membroController.enviarFoto);
router.get("/:id/foto", membroController.streamFoto);
router.delete("/:id/foto", membroController.removerFoto);

module.exports = router;
