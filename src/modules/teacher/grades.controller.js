const { ok } = require('../../utils/response');
const gradesService = require('../../services/grades.service');
const { assertClassNotLocked } = require('../../services/reportCardLock.service');

async function getClassGrades(req, res) {
  const teacherId = req.user.sub;
  const { classId } = req.params;
  const subjectId = await gradesService.resolveTeacherSubjectForClass(teacherId, classId);
  const rows = await gradesService.getClassGrades(classId, subjectId);
  return ok(res, rows);
}

async function putClassGrades(req, res) {
  const teacherId = req.user.sub;
  const { classId } = req.params;
  const subjectId = await gradesService.resolveTeacherSubjectForClass(teacherId, classId);
  await assertClassNotLocked(classId, req.user.role);

  const result = await gradesService.saveGrades({
    classId, subjectId, entries: req.body.entries, filledByTeacherId: teacherId,
  });
  return ok(res, result, 'Nilai berhasil disimpan');
}

module.exports = { getClassGrades, putClassGrades };
