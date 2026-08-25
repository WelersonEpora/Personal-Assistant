"use strict";

const { Router } = require("express");
const equipeController = require("../controllers/equipe.controller");
const autenticar = require("../shared/middlewares/auth.middleware");
const { exigirOwner } = require("../shared/middlewares/papel.middleware");

const router = Router();

router.use(autenticar, exigirOwner);

router.get("/", equipeController.obter);
router.put("/", equipeController.atualizar);

module.exports = router;
