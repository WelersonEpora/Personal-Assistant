"use strict";

const authService = require("../services/auth.service");
const { success } = require("../shared/utils/api-response");

async function login(req, res) {
  const resultado = await authService.login(req.body || {});
  success(res, resultado);
}

module.exports = { login };
