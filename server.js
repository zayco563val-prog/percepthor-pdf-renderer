const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Servidor OK');
});

app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;

  if (!url || !token) {
    return res.status(400).json({
      error: 'Faltan parámetros: url y token'
    });
  }

  const extraWait = parseInt(wait || '8000');

  let browser;

  try {
    console.log('Generando PDF de:', url);

    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox'],
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      Authorization: token
    });

    let pdfBuffer = null;

    // 👇 INTERCEPTAR RESPUESTAS
    page.on('response', async (response) => {
      try {
        const headers = response.headers();
        const contentType = headers['content-type'] || '';

        if (contentType.includes('application/pdf')) {
          console.log('PDF detectado en red');
          pdfBuffer = await response.buffer();
        }
      } catch (e) {}
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('Esperando render...');
    await new Promise(r => setTimeout(r, extraWait));

    // 👇 SCROLL para forzar carga dinámica
    await page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    await new Promise(r => setTimeout(r, 3000));

    // 👇 SI NO SE CAPTURÓ PDF, FALLA
    if (!pdfBuffer) {
      throw new Error('No se detectó ningún PDF en la red');
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="documento.pdf"'
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error PDF:', error);

    res.status(500).json({
      error: 'Error generando PDF',
      details: error.message
    });

  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
