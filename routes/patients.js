const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients ORDER BY id ASC');
    res.render('patients/index', { patients: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

router.get('/new', (req, res) => {
  res.render('patients/new');
});

router.post('/', async (req, res) => {
  const { name, phone, email, date_of_birth } = req.body;
  try {
    await pool.query(
      'INSERT INTO patients (name, phone, email, date_of_birth) VALUES ($1, $2, $3, $4)',
      [name, phone, email, date_of_birth]
    );
    res.redirect('/patients');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

module.exports = router;