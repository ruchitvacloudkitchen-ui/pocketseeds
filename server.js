const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.get('/api/qr', async (req, res) => {
  const text = req.query.text;
  if (!text) return res.status(400).send('Missing text parameter');
  try {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send('Error generating QR');
  }
});

app.use(express.static(path.join(__dirname)));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PocketSeeds static server listening on http://0.0.0.0:${PORT}`);
});
