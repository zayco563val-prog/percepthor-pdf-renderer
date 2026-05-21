const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();

app.get('/pdf', async (req, res) => {
  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    await page.goto(req.query.url, {
      waitUntil: 'networkidle2'
    });

    await new Promise(r => setTimeout(r, Number(req.query.wait || 5000)));

    const pdf = await page.pdf({ format: 'A4' });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'PDF failed', details: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});