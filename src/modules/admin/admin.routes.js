const { Router } = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const upload = require('../../middleware/upload');
const { requireRole } = require('../../middleware/roleGuard');

const periods = require('./academicPeriods.controller');
const accounts = require('./accounts.controller');
const templates = require('./templates.controller');
const subjects = require('./subjects.controller');
const classes = require('./classes.controller');
const gradesAttendance = require('./gradesAttendance.controller');

const router = Router();
router.use(requireRole('admin'));

// Tahun ajaran & semester
router.get('/academic-years', asyncHandler(periods.listAcademicYears));
router.post('/academic-years', asyncHandler(periods.createAcademicYear));
router.patch('/academic-years/:id/activate', asyncHandler(periods.activateAcademicYear));
router.get('/semesters', asyncHandler(periods.listSemesters));
router.post('/semesters', asyncHandler(periods.createSemester));
router.patch('/semesters/:id/activate', asyncHandler(periods.activateSemester));

// Akun Guru
router.post('/teachers', asyncHandler(accounts.createTeacher));
router.post('/teachers/import', upload.single('file'), asyncHandler(accounts.importTeachers));
router.get('/teachers', asyncHandler(accounts.listTeachers));
router.patch('/teachers/:id/reset-password', asyncHandler(accounts.resetTeacherPassword));

// Akun Siswa
router.post('/students', asyncHandler(accounts.createStudent));
router.post('/students/import', upload.single('file'), asyncHandler(accounts.importStudents));
router.get('/students', asyncHandler(accounts.listStudents));
router.patch('/students/:id/reset-password', asyncHandler(accounts.resetStudentPassword));

// Templat unduhan
router.get('/templates/teachers-csv', templates.teachersCsvTemplate);
router.get('/templates/students-csv', templates.studentsCsvTemplate);
router.get('/templates/class-students-xlsx', templates.classStudentsXlsxTemplate);

// Mata pelajaran
router.post('/subjects', asyncHandler(subjects.createSubject));
router.get('/subjects', asyncHandler(subjects.listSubjects));
router.patch('/subjects/:id', asyncHandler(subjects.updateSubject));

// Kelas
router.post('/classes', asyncHandler(classes.createClass));
router.get('/classes', asyncHandler(classes.listClasses));
router.post('/classes/:id/students/import', upload.single('file'), asyncHandler(classes.importClassStudents));
router.post('/classes/:id/subjects', asyncHandler(classes.addClassSubject));
router.patch('/classes/:id/homeroom-teacher', asyncHandler(classes.setHomeroomTeacher));
router.get('/classes/:id', asyncHandler(classes.getClassDetail));

// Nilai & presensi (akses penuh, dapat menembus rapor Final — §8.1)
router.put('/grades', asyncHandler(gradesAttendance.putGrades));
router.put('/attendance-sessions/:id/records', asyncHandler(gradesAttendance.putAttendanceRecords));

module.exports = router;
