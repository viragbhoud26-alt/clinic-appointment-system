const express = require('express');
const path = require('path');
const session = require('express-session');
const appointmentsRouter = require('./routes/appointments');
const patientsRouter = require('./routes/patients');
const doctorsRouter = require('./routes/doctors');
const authRouter = require('./routes/auth');
const homeRouter = require('./routes/home');
const requireLogin = require('./middleware/auth');
const reminderJob = require('./jobs/reminder-check');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 }
}));

app.use((req, res, next) => {
  res.locals.isLoggedIn = !!(req.session && req.session.isAdmin);
  next();
});

app.use('/', homeRouter);
app.use('/', authRouter);

app.use('/appointments', requireLogin, appointmentsRouter);
app.use('/patients', requireLogin, patientsRouter);
app.use('/doctors', requireLogin, doctorsRouter);

app.listen(PORT, () => {
  console.log(`Clinic app running at http://localhost:${PORT}`);
  reminderJob.start();
});
