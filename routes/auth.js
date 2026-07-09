const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

router.get('/login', (req, res) => {
  res.render('auth/login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT * FROM admins WHERE username = $1 AND password_hash = crypt($2, password_hash)`,
      [username, password]
    );
    if (result.rows.length === 0) {
      return res.render('auth/login', { error: 'Invalid username or password.' });
    }
    req.session.isAdmin = true;
    req.session.username = result.rows[0].username;
    res.redirect('/appointments');
  } catch (err) {
    console.error(err);
    res.render('auth/login', { error: 'Something went wrong. Try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;