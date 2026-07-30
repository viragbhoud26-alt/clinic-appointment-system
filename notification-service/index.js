const express = require('express');
const { sendMail } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

function validateNotificationBody(body) {
  const { to, patientName, doctorName, appointmentDate, appointmentTime } = body;
  if (!to || !patientName || !doctorName || !appointmentDate || !appointmentTime) {
    return 'to, patientName, doctorName, appointmentDate, and appointmentTime are all required';
  }
  return null;
}

app.post('/notify/confirmation', async (req, res) => {
  const error = validateNotificationBody(req.body);
  if (error) return res.status(400).json({ error });

  const { to, patientName, doctorName, appointmentDate, appointmentTime } = req.body;

  try {
    await sendMail({
      to,
      subject: 'Appointment Confirmed — XYZ Clinic',
      text: `Hi ${patientName},\n\n` +
        `Your appointment with ${doctorName} is confirmed for ${appointmentDate} at ${appointmentTime}.\n\n` +
        `If you need to cancel or reschedule, please contact the clinic.\n\n` +
        `— XYZ Clinic`,
    });
    res.json({ sent: true });
  } catch (err) {
    console.error('Failed to send confirmation email:', err.message);
    res.status(502).json({ error: 'Failed to send email' });
  }
});

app.post('/notify/reminder', async (req, res) => {
  const error = validateNotificationBody(req.body);
  if (error) return res.status(400).json({ error });

  const { to, patientName, doctorName, appointmentDate, appointmentTime } = req.body;

  try {
    await sendMail({
      to,
      subject: 'Appointment Reminder — XYZ Clinic',
      text: `Hi ${patientName},\n\n` +
        `This is a reminder that you have an appointment with ${doctorName} ` +
        `on ${appointmentDate} at ${appointmentTime}.\n\n` +
        `— XYZ Clinic`,
    });
    res.json({ sent: true });
  } catch (err) {
    console.error('Failed to send reminder email:', err.message);
    res.status(502).json({ error: 'Failed to send email' });
  }
});

app.listen(PORT, () => {
  console.log(`Notification service running on port ${PORT}`);
});
