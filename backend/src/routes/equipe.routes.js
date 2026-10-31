"use strict";

const { Router } = require("express");
const multer = require("multer");
const equipeController = require("../controllers/equipe.controller");
const autenticar = require("../shared/middlewares/auth.middleware");
const { exigirOwner } = require("../shared/middlewares/papel.middleware");

// O front já reduz o logo antes de enviar (docs/adr/0030); o limite aqui só
// barra arquivo absurdo vindo de outro cliente.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const router = Router();

router.use(autenticar);

// Identidade (nome + logo) é lida por qualquer membro - o PDF do
// Acompanhamento Mensal é aberto por quem estiver logado. Editar continua
// exclusivo do owner.
router.get("/identidade", equipeController.obterIdentidade);
router.get("/logo", equipeController.streamLogo);

router.get("/", exigirOwner, equipeController.obter);
router.put("/", exigirOwner, equipeController.atualizar);
router.post("/logo", exigirOwner, upload.single("logo"), equipeController.enviarLogo);
router.delete("/logo", exigirOwner, equipeController.removerLogo);

module.exports = router;
