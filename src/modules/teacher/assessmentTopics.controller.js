const { ok } = require('../../utils/response');
const gradesService = require('../../services/grades.service');
const topicsService = require('../../services/assessmentTopics.service');
const { assertClassNotLocked } = require('../../services/reportCardLock.service');

async function getClassTopics(req, res) {
  const teacherId = req.user.sub;
  const { classId } = req.params;
  const subjectId = await gradesService.resolveTeacherSubjectForClass(teacherId, classId);
  const topics = await topicsService.getClassTopics(classId, subjectId);
  return ok(res, { classId, subjectId, topics });
}

async function putClassTopics(req, res) {
  const teacherId = req.user.sub;
  const { classId } = req.params;
  const subjectId = await gradesService.resolveTeacherSubjectForClass(teacherId, classId);
  await assertClassNotLocked(classId, req.user.role);
  const result = await topicsService.saveClassTopics({
    classId,
    subjectId,
    teacherId,
    topics: req.body.topics,
  });
  return ok(res, result, 'Topik penilaian berhasil disimpan');
}

module.exports = { getClassTopics, putClassTopics };

