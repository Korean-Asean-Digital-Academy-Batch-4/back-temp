const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const { requireRole } = require('../../middleware/roleGuard');

const classesCtrl = require('./classes.controller');
const gradesCtrl = require('./grades.controller');
const assessmentTopicsCtrl = require('./assessmentTopics.controller');
const attendanceCtrl = require('./attendance.controller');

const router = Router();
router.use(requireRole('teacher')); // Admin punya endpoint terpisah: lihat /admin/grades & /admin/attendance-sessions

router.get('/classes', asyncHandler(classesCtrl.listMyClasses));
router.get('/classes/:classId/students', asyncHandler(classesCtrl.listClassStudents));

router.get('/classes/:classId/grades', asyncHandler(gradesCtrl.getClassGrades));
router.put('/classes/:classId/grades', asyncHandler(gradesCtrl.putClassGrades));
router.get('/classes/:classId/assessment-topics', asyncHandler(assessmentTopicsCtrl.getClassTopics));
router.put('/classes/:classId/assessment-topics', asyncHandler(assessmentTopicsCtrl.putClassTopics));

router.get('/classes/:classId/attendance-sessions', asyncHandler(attendanceCtrl.listSessions));
router.post('/classes/:classId/attendance-sessions', asyncHandler(attendanceCtrl.openSession));
router.get('/attendance-sessions/:id', asyncHandler(attendanceCtrl.getSession));
router.put('/attendance-sessions/:id/records', asyncHandler(attendanceCtrl.updateRecords));
router.post('/attendance-sessions/:id/mark-all-present', asyncHandler(attendanceCtrl.markAllPresent));
router.delete('/attendance-sessions/:id', asyncHandler(attendanceCtrl.deleteSession));

module.exports = router;
