// server.js
const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 10000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const extraWait = Number.parseInt(wait || '8000', 10);
  const selectorTimeout = Math.max(45000, extraWait + 20000);

  let browser;

  try {
    console.log('Generando PDF de:', url);

    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1280,
      height: 1800
    });

    await page.setExtraHTTPHeaders({
      Authorization: token
    });

    page.on('console', msg => console.log('PAGE:', msg.text()));
    page.on('pageerror', err => console.log('PAGEERROR:', err.message));

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('Esperando enlace de descarga...');

    await page.waitForSelector('a[download][href^="blob:"]', {
      timeout: selectorTimeout
    }).catch(async () => {
      await page.waitForSelector('a[download]', {
        timeout: selectorTimeout
      });
    });

    await delay(Math.min(extraWait, 10000));

    const payload = await page.evaluate(async () => {
      const anchor =
        document.querySelector('a[download][href^="blob:"]') ||
        document.querySelector('a[download]');

      if (!anchor) {
        throw new Error('No se encontró el enlace de descarga');
      }

      const href = anchor.href || anchor.getAttribute('href');
      if (!href) {
        throw new Error('El enlace de descarga no tiene href');
      }

      const filename = anchor.getAttribute('download') || 'documento.pdf';

      const response = await fetch(href);
      if (!response.ok) {
        throw new Error(`No se pudo leer el blob: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'application/pdf';
      const buffer = await response.arrayBuffer();

      return {
        filename,
        contentType,
        bytes: Array.from(new Uint8Array(buffer))
      };
    });

    if (!payload?.bytes?.length) {
      throw new Error('El PDF llegó vacío');
    }

    const pdfBuffer = Buffer.from(payload.bytes);

    res.set({
      'Content-Type': payload.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${payload.filename.replace(/"/g, '')}"`
    });

    return res.send(pdfBuffer);

  } catch (error) {
    console.error('Error PDF:', error);

    return res.status(500).json({
      error: 'Error generando PDF',
      details: error.message
    });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
