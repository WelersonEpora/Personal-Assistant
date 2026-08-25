"use strict";

function success(res, data, { meta = {}, statusCode = 200 } = {}) {
  return res.status(statusCode).json({ data, meta });
}

module.exports = { success };
