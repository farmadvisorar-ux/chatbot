const express = require('express');
const recoverRouter = require('./src/routes/recover');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use('/api', recoverRouter);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Website snapshot recovery service listening on port ${PORT}`);
  });
}

module.exports = app;
