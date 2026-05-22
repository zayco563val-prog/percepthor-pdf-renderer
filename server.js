// server.js
const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 10000;

// Ruta base
app.get('/', (req, res) => {
  res.send('Servidor OK');
});

// Ruta /pdf que genera el PDF
app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;
  if (!url || !token) {
    return res.status(400).json({ error: 'Faltan parámetros: url y token' });
  }
  const extraWait = parseInt(wait || '8000');

  let browser;
  try {
    console.log('Generando PDF de:', url);

    // Lanzar Chromium integrado con Puppeteer-Core
    browser = await puppeteer.launch({
      args: puppeteer.defaultArgs({ args: chromium.args }),
      defaultViewport: { width: 1280, height: 1800 },  // Ajustar viewport
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    // Inyectar header de Autorización
    await page.setExtraHTTPHeaders({ Authorization: token });

    // Navegar a la URL (SPA)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Esperando carga dinámica:', extraWait);

    // Espera adicional base (por la carga SPA)
    await new Promise(r => setTimeout(r, extraWait));

    // Esperar condicional: chequea que haya texto visible en el body
    await page.waitForFunction(() => {
      return document.body && document.body.innerText.trim().length > 100;
    }, { timeout: 15000 });
    console.log('Contenido cargado');

    // (Opcional) Asegurar que imágenes se hayan cargado
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map(img => {
        if (img.complete) return;
        return new Promise(res => { img.onload = img.onerror = res; });
      }));
    });

    // Generar PDF (formato A4, fondos impresos)
    const pdf = await page.pdf({ format: 'A4', printBackground: true });

    // Cerrar el navegador y enviar respuesta
    await browser.close();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="documento.pdf"'
    });
    res.send(pdf);

  } catch (error) {
    console.error('Error PDF:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: 'Error generando PDF', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
