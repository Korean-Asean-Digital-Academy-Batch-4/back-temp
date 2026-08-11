const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../middleware/roleGuard');
const ctrl = require('./student.controller');

const router = Router();
router.use(requireRole('student'));

router.get('/grades', asyncHandler(ctrl.getMyGrades));
router.get('/assessment-topics', asyncHandler(ctrl.getMyAssessmentTopics));
router.get('/attendance', asyncHandler(ctrl.getMyAttendance));
router.post('/ai-insight', asyncHandler(ctrl.getAiInsight));
router.get('/report-card', asyncHandler(ctrl.getMyReportCard));
router.get('/report-card/download', asyncHandler(ctrl.downloadMyReportCard));

module.exports = router;
