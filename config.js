require('dotenv').config({ path: '.env' });

const PORT = parseInt(process.env.PORT || '3000', 10);

module.exports = {
  server: { port: PORT }
};
