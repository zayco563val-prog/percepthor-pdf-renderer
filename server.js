const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 10000;

// Ruta base
app.get('/', (req, res) => {
  res.send('Servidor OK');
});

// Ruta PDF
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
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    // 🔐 Token
    await page.setExtraHTTPHeaders({
      Authorization: token
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 0
    });

    console.log('Esperando render:', extraWait);

    await new Promise(r => setTimeout(r, extraWait));

    // Esperar imágenes
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map(img => {
          if (img.complete) return;
          return new Promise(res => {
            img.onload = img.onerror = res;
          });
        })
      );
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="documento.pdf"'
    });

    res.send(pdf);

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
