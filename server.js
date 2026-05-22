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

// Ruta PDF
app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;
  if (!url || !token) {
    return res.status(400).json({ error: 'Faltan parámetros: url y token' });
  }
  const extraWait = parseInt(wait || '10000');
  let browser;
  try {
    console.log('Generando PDF de:', url);
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    // Definir viewport (importante para render completo de Percepthor)
    await page.setViewport({ width: 1280, height: 1800 });

    // Inyectar token en cabeceras
    await page.setExtraHTTPHeaders({ Authorization: token });

    // Navegar a la página (espera DOMContentLoaded)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Esperando render base:', extraWait);

    // Espera fija inicial para la carga de datos
    await page.waitForTimeout(extraWait);

    // Espera condicional a que haya texto visible en el body (evitar PDF en blanco)
    await page.waitForFunction(
      () => document.body && document.body.innerText.trim().length > 200,
      { timeout: 20000 }
    );
    console.log('Contenido cargado');

    // Realizar *scroll* automático para cargar imágenes/elementos bajo scroll
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let total = 0;
        const distance = 200;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          total += distance;
          if (total >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    console.log('Scroll completado');

    // Esperar carga de todas las imágenes
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map(img => {
        if (img.complete) return;
        return new Promise(res => { img.onload = img.onerror = res; });
      }));
    });
    console.log('Imágenes cargadas');

    // (Opcional) Screenshot de depuración
    // await page.screenshot({ path: 'debug.png', fullPage: true });

    // Generar PDF
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    // Enviar PDF al cliente
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
