const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4000';

function normalizeTime(t) {
  return t.length === 5 ? t + ':00' : t; // "14:30" -> "14:30:00"
}

// Fire-and-forget call to the Notification Service. Never awaited by the
// caller — a booking must succeed even if the email fails to send or the
// Notification Service is temporarily unreachable.
function sendConfirmationEmail({ patient, doctorName, appointment_date, appointment_time }) {
  if (!patient || !patient.email) {
    console.warn('Skipping confirmation email: patient has no email on file');
    return;
  }
  fetch(`${NOTIFICATION_SERVICE_URL}/notify/confirmation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: patient.email,
      patientName: patient.name,
      doctorName,
      appointmentDate: appointment_date,
      appointmentTime: appointment_time.slice(0, 5),
    }),
  }).catch(err => {
    console.error('Failed to reach notification service:', err.message);
  });
}

// NEW: returns available time slots for a doctor on a given date, as JSON
router.get('/available-slots', async (req, res) => {
  const { doctor_id, date } = req.query;
  if (!doctor_id || !date) {
    return res.status(400).json({ error: 'doctor_id and date are required' });
  }
  try {
    const doctorResult = await pool.query(
      'SELECT available_from, available_to FROM doctors WHERE id = $1',
      [doctor_id]
    );
    if (doctorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    const { available_from, available_to } = doctorResult.rows[0];

    const bookedResult = await pool.query(
      `SELECT appointment_time FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2 AND status = 'booked'`,
      [doctor_id, date]
    );
    const bookedTimes = new Set(bookedResult.rows.map(r => r.appointment_time.slice(0, 5)));

    // Generate 30-minute slots between available_from and available_to
    const slots = [];
    let [h, m] = available_from.slice(0, 5).split(':').map(Number);
    const [endH, endM] = available_to.slice(0, 5).split(':').map(Number);
    while (h < endH || (h === endH && m < endM)) {
      const label = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      slots.push({ time: label, available: !bookedTimes.has(label) });
      m += 30;
      if (m >= 60) { m -= 60; h += 1; }
    }
    res.json({ slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.appointment_date, a.appointment_time, a.status,
             p.name AS patient_name, d.name AS doctor_name, d.specialization
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
      ORDER BY a.appointment_date, a.appointment_time
    `);
    res.render('appointments/index', { appointments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

router.get('/new', async (req, res) => {
  try {
    const patients = await pool.query('SELECT * FROM patients ORDER BY name');
    const doctors = await pool.query('SELECT * FROM doctors ORDER BY name');
    res.render('appointments/new', { patients: patients.rows, doctors: doctors.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

router.post('/', async (req, res) => {
  const { patient_id, doctor_id, appointment_date } = req.body;
  const appointment_time = normalizeTime(req.body.appointment_time);
  try {
    const doctor = await pool.query('SELECT * FROM doctors WHERE id = $1', [doctor_id]);
    const { available_from, available_to } = doctor.rows[0];
    if (appointment_time < available_from || appointment_time > available_to) {
      return res.status(400).send(
        `This doctor is only available between ${available_from} and ${available_to}.`
      );
    }

    const clash = await pool.query(
      `SELECT * FROM appointments
       WHERE doctor_id = $1 AND appointment_date = $2 AND appointment_time = $3
       AND status = 'booked'`,
      [doctor_id, appointment_date, appointment_time]
    );
    if (clash.rows.length > 0) {
      return res.status(409).send('This slot is already booked. Please choose another time.');
    }

    await pool.query(
      `INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time)
       VALUES ($1, $2, $3, $4)`,
      [patient_id, doctor_id, appointment_date, appointment_time]
    );

    // Confirmation email — fire-and-forget, does not block the response
    const patient = await pool.query('SELECT * FROM patients WHERE id = $1', [patient_id]);
    sendConfirmationEmail({
      patient: patient.rows[0],
      doctorName: doctor.rows[0].name,
      appointment_date,
      appointment_time,
    });

    res.redirect('/appointments');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    await pool.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [req.params.id]);
    res.redirect('/appointments');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

module.exports = router;
