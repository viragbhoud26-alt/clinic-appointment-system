const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM doctors ORDER BY id ASC');
    res.render('doctors/index', { doctors: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

router.get('/new', (req, res) => {
  res.render('doctors/new');
});

router.post('/', async (req, res) => {
  const { name, specialization, available_from, available_to } = req.body;
  try {
    await pool.query(
      'INSERT INTO doctors (name, specialization, available_from, available_to) VALUES ($1, $2, $3, $4)',
      [name, specialization, available_from, available_to]
    );
    res.redirect('/doctors');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

module.exports = router;