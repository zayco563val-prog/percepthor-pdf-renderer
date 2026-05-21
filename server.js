import express from 'express';
import puppeteer from 'puppeteer';

const app = express();

app.get('/', (req, res) => {
  res.send('Servidor OK');
});

app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;

  if (!url || !token) {
    return res.status(400).json({
      error: 'Missing url or token'
    });
  }

  let browser;

  try {
    console.log('Generando PDF:', url);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    // 🔐 Inyectar token
    await page.setExtraHTTPHeaders({
      Authorization: token
    });

    // Ir a la página
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // ⏳ Esperar render real
    const extraWait = parseInt(wait) || 10000;
    await new Promise(r => setTimeout(r, extraWait));

    // 👇 Scroll automático (CLAVE para Percepthor)
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 200;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });

    await new Promise(r => setTimeout(r, 3000));

    // 📄 Generar PDF
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

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
