const cron = require('node-cron');
const pool = require('../db/connection');

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4000';

async function checkAndSendReminders() {
  try {
    const result = await pool.query(`
      SELECT a.id, a.appointment_date, a.appointment_time,
             p.name AS patient_name, p.email AS patient_email,
             d.name AS doctor_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
      WHERE a.status = 'booked'
        AND a.reminder_sent = FALSE
        AND (a.appointment_date + a.appointment_time)
            BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'
    `);

    if (result.rows.length === 0) {
      console.log('[reminder-check] No appointments due for a reminder this run.');
      return;
    }

    console.log(`[reminder-check] Found ${result.rows.length} appointment(s) due for a reminder.`);

    for (const appt of result.rows) {
      if (!appt.patient_email) {
        console.warn(`[reminder-check] Skipping appointment ${appt.id}: patient has no email on file`);
        continue;
      }
      try {
        const res = await fetch(`${NOTIFICATION_SERVICE_URL}/notify/reminder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: appt.patient_email,
            patientName: appt.patient_name,
            doctorName: appt.doctor_name,
            appointmentDate: appt.appointment_date.toISOString().slice(0, 10),
            appointmentTime: appt.appointment_time.slice(0, 5),
          }),
        });

        if (res.ok) {
          await pool.query('UPDATE appointments SET reminder_sent = TRUE WHERE id = $1', [appt.id]);
          console.log(`[reminder-check] Reminder sent and recorded for appointment ${appt.id}`);
        } else {
          console.error(`[reminder-check] Notification service returned ${res.status} for appointment ${appt.id}`);
        }
      } catch (err) {
        console.error(`[reminder-check] Failed to reach notification service for appointment ${appt.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[reminder-check] Database error while checking for reminders:', err.message);
  }
}

function start() {
  cron.schedule('0 * * * *', checkAndSendReminders);
  console.log('[reminder-check] Scheduled to run hourly.');
}

module.exports = { start, checkAndSendReminders };
