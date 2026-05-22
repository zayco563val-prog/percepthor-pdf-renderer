const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 10000;

const delay = ms => new Promise(r => setTimeout(r, ms));

app.get('/', (req, res) => {
  res.send('Servidor OK');
});

app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;

  if (!url || !token) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: [...chromium.args, '--no-sandbox'],
      headless: true
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1280,
      height: 2000
    });

    // 🔐 Token
    await page.setExtraHTTPHeaders({
      authorization: token
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 0
    });

    console.log('Página cargada, esperando render...');

    // 🔥 Esperar suficiente tiempo REAL
    await delay(parseInt(wait || '15000'));

    // 🔥 Esperar que haya contenido visible
    await page.waitForFunction(() => {
      return document.body.innerText.length > 1000;
    }, { timeout: 60000 });

    // 🔥 Scroll para forzar render lazy
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let total = 0;
        const distance = 500;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          total += distance;

          if (total >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });

    await delay(3000);

    console.log('Generando PDF visual');

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true
    });

    res.set({
      'Content-Type': 'application/pdf'
    });

    res.send(pdf);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Error generando PDF',
      details: err.message
    });

  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log('Servidor corriendo en puerto', PORT);
});
