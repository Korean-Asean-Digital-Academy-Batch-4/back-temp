const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../middleware/roleGuard');
const ctrl = require('./homeroom.controller');

const router = Router();
router.use(requireRole('teacher', 'admin')); // otorisasi per-kelas dicek di controller (isHomeroomOf)

router.get('/classes/:classId/overview', asyncHandler(ctrl.getClassOverview));
router.get('/classes/:classId/completeness', asyncHandler(ctrl.getClassCompletenessHandler));
router.get('/report-cards/:studentId', asyncHandler(ctrl.getReportCard));
router.patch('/report-cards/:studentId/note', asyncHandler(ctrl.updateReportCardNote));
router.post('/classes/:classId/finalize', asyncHandler(ctrl.finalizeClass));
router.post('/classes/:classId/distribute', asyncHandler(ctrl.distributeClass));
router.get('/report-cards/:studentId/download', asyncHandler(ctrl.downloadReportCard));

module.exports = router;
