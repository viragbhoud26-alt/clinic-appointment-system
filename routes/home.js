const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const doctors = await pool.query('SELECT * FROM doctors ORDER BY name');
    res.render('home', { doctors: doctors.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

module.exports = router;
