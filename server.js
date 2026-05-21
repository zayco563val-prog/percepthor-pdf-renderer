const express = require('express');
const puppeteer = require('puppeteer');

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
      executablePath: puppeteer.executablePath(), // 🔥 CLAVE
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // 🔐 Inyectar token
    await page.setExtraHTTPHeaders({
      Authorization: token
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 0
    });

    console.log('Esperando render:', extraWait);

    // Espera adicional
    await new Promise(resolve => setTimeout(resolve, extraWait));

    // Esperar imágenes
    await page.evaluate(async () => {
      const images = Array.from(document.images);
      await Promise.all(
        images.map(img => {
          if (img.complete) return;
          return new Promise(resolve => {
            img.onload = img.onerror = resolve;
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
    console.error('Error:', error);

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
