const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

const delay = (ms) => new Promise(r => setTimeout(r, ms));

app.get('/', (req, res) => {
  res.send('Servidor OK');
});

async function launchBrowser() {
  const execPath = await chromium.executablePath();

  return puppeteer.launch({
    executablePath: execPath,
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
    headless: chromium.headless
  });
}

app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;

  if (!url || !token) {
    return res.status(400).json({
      error: 'Faltan parámetros'
    });
  }

  const extraWait = parseInt(wait || '10000');

  let browser;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 1800 });

    await page.setExtraHTTPHeaders({
      authorization: token
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('Esperando render base...');
    await delay(5000);

    // 🔥 Esperar que React pinte contenido real
    await page.waitForFunction(() => {
      return document.body.innerText.length > 500;
    }, { timeout: 60000 });

    console.log('Contenido detectado');

    // 🔥 Esperar imágenes
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

    await delay(extraWait);

    // 🔍 Intentar capturar PDF interno (si existe)
    let pdfBuffer = null;

    try {
      const result = await page.evaluate(async () => {
        const a = document.querySelector('a[download]');
        if (!a) return null;

        const res = await fetch(a.href);
        const blob = await res.blob();

        const reader = new FileReader();
        return new Promise((resolve) => {
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      });

      if (result) {
        pdfBuffer = Buffer.from(result.split(',')[1], 'base64');
        console.log('PDF real detectado');
      }

    } catch (e) {
      console.log('No hubo PDF interno, usando fallback');
    }

    // 🔥 Fallback: screenshot como PDF
    if (!pdfBuffer) {
      console.log('Generando PDF visual');

      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true
      });
    }

    res.set({
      'Content-Type': 'application/pdf'
    });

    res.send(pdfBuffer);

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
