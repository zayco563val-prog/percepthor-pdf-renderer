// server.js
const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.get('/', (req, res) => {
  res.send('Servidor OK');
});

async function getChromiumExecutablePathCopy() {
  const sourcePath = await chromium.executablePath();
  const targetPath = path.join(
    os.tmpdir(),
    `chromium-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, 0o755);

  return targetPath;
}

async function launchBrowserSafe() {
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const executablePath = await getChromiumExecutablePathCopy();

    try {
      const browser = await puppeteer.launch({
        executablePath,
        args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
        headless: chromium.headless,
        ignoreHTTPSErrors: true
      });

      return browser;
    } catch (error) {
      lastError = error;
      const message = String(error && error.message ? error.message : error);

      if (!message.includes('ETXTBSY') || attempt === 2) {
        throw error;
      }

      await delay(1200);
    }
  }

  throw lastError;
}

app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;

  if (!url || !token) {
    return res.status(400).json({
      error: 'Faltan parámetros: url y token'
    });
  }

  const extraWait = Number.parseInt(wait || '8000', 10) || 8000;
  let browser;

  try {
    console.log('Generando PDF de:', url);

    browser = await launchBrowserSafe();

    const page = await browser.newPage();

    await page.setViewport({
      width: 1280,
      height: 1800
    });

    await page.setDefaultTimeout(60000);
    await page.setDefaultNavigationTimeout(60000);

    // Percepthor usa header y cookie; dejamos ambos para máxima compatibilidad.
    await page.setExtraHTTPHeaders({
      authorization: token,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });

    const targetUrl = new URL(url);
    await page.setCookie({
      name: 'percepthor-jwt',
      value: token,
      domain: targetUrl.hostname,
      path: '/',
      secure: true,
      httpOnly: false
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // La página crea el PDF como blob + anchor de descarga.
    await page.waitForFunction(() => {
      const a = document.querySelector('a[download]');
      return Boolean(a && a.href && a.href.startsWith('blob:'));
    }, { timeout: 60000 });

    await delay(extraWait);

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

      const response = await fetch(href);
      if (!response.ok) {
        throw new Error(`No se pudo leer el blob: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Error leyendo Blob'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(blob);
      });

      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        throw new Error('No se pudo convertir el blob a base64');
      }

      return {
        fileName: anchor.getAttribute('download') || 'documento.pdf',
        base64
      };
    });

    const pdfBuffer = Buffer.from(payload.base64, 'base64');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${String(payload.fileName).replace(/"/g, '')}"`
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
      await browser.close().catch(() => {});
    }
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
