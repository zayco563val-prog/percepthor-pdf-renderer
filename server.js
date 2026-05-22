// server.js
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
    return res.status(400).json({ error: 'Faltan parámetros: url y token' });
  }
  const extraWait = parseInt(wait || '8000', 10);
  let browser;

  try {
    console.log('Generando PDF de:', url);
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();
    // Inyectar token en headers
    await page.setExtraHTTPHeaders({ Authorization: token });

    // Navegar y esperar carga completa
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Esperar enlace de descarga (botón) que la página crea dinámicamente
    await page.waitForSelector('a[download]', { visible: true, timeout: 30000 });
    console.log('Enlace de descarga encontrado');

    // Pequeña espera adicional por si hay animaciones o delays
    await new Promise(r => setTimeout(r, extraWait));

    // Dentro del contexto del navegador, usar fetch para descargar el Blob y convertirlo a base64
    const fileBase64 = await page.evaluate(async () => {
      const a = document.querySelector('a[download]');
      const href = a ? a.href : null;
      if (!href) throw new Error('Enlace de descarga no disponible');
      const response = await fetch(href);
      if (!response.ok) throw new Error(`Fetch falló con status ${response.status}`);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject('Error leyendo Blob');
        reader.onload = () => {
          // reader.result es "data:application/pdf;base64,...."
          const dataUrl = reader.result;
          const base64 = dataUrl.split(',')[1];
          if (!base64) reject('No se pudo extraer base64');
          else resolve(base64);
        };
        reader.readAsDataURL(blob);
      });
    });

    // Convertir la cadena base64 a Buffer en Node.js
    const pdfBuffer = Buffer.from(fileBase64, 'base64');

    // Enviar PDF como respuesta
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="documento.pdf"'
    });
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error PDF:', error);
    res.status(500).json({ error: 'Error generando PDF', details: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
