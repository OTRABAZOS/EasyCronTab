const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.AUTH_DB_HOST || 'db1.bwai.cc',
  user: process.env.AUTH_DB_USER,
  password: process.env.AUTH_DB_PASSWORD,
  database: process.env.AUTH_DB_NAME || 'brandwaiapp',
  waitForConnections: true,
  connectionLimit: 5,
});

const ALLOWED_ROLES = ['god'];

async function findUser(email, password) {
  const [rows] = await pool.execute(
    'SELECT email, password, role FROM BrandWaiUserProfile WHERE email = ? AND password = ? LIMIT 1',
    [email, password]
  );
  return rows[0] || null;
}

function hasAccess(role) {
  return ALLOWED_ROLES.includes(role);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  res.redirect('/login');
}

module.exports = { findUser, hasAccess, requireAuth };
