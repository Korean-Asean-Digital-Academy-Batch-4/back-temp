const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { login } = require('./auth.controller');

const router = Router();

router.post('/login', asyncHandler(login));

module.exports = router;
