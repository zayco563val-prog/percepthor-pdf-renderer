import express from 'express';

const app = express();

app.get('/', (req, res) => {
  res.send('Servidor OK');
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
