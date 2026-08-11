function ok(res, data, message = 'Berhasil', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function created(res, data, message = 'Berhasil dibuat') {
  return ok(res, data, message, 201);
}

function fail(res, status, message, errors) {
  return res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });
}

module.exports = { ok, created, fail };
