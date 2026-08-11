const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const env = require('./config/env');
const { authenticate } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const teacherRoutes = require('./modules/teacher/teacher.routes');
const homeroomRoutes = require('./modules/homeroom/homeroom.routes');
const studentRoutes = require('./modules/student/student.routes');

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', authenticate, adminRoutes);
app.use('/api/teacher', authenticate, teacherRoutes);
app.use('/api/homeroom', authenticate, homeroomRoutes);
app.use('/api/student', authenticate, studentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
