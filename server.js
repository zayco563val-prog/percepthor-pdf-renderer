const express = require('express');
const puppeteer = require('puppeteer');

const app = express();

app.get('/', (req, res) => {
  res.send('Servidor OK');
});

app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;

  if (!url || !token) {
    return res.status(400).json({ error: 'Faltan parámetros: url y token' });
  }

  try {
    console.log('Generando PDF para:', url);

    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: puppeteer.executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // 🔐 TOKEN
    await page.setExtraHTTPHeaders({
      Authorization: token
    });

    // 🌐 CARGA
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // 🧠 ESPERA INTELIGENTE (NO DEPENDE DE SELECTOR)
    await page.waitForFunction(() => {
      return document.body && document.body.innerText.length > 100;
    }, { timeout: 20000 });

    // ⏳ ESPERA EXTRA (clave para Percepthor)
    const extraWait = wait ? parseInt(wait) : 10000;
    console.log('Esperando extra:', extraWait);
    await new Promise(r => setTimeout(r, extraWait));

    // 📄 PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true
    });

    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="output.pdf"'
    });

    res.send(pdf);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Error generando PDF',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
