import express from 'express';
import puppeteer from 'puppeteer';

const app = express();

app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;

  if (!url || !token) {
    return res.status(400).json({
      error: 'Missing parameters: url and token are required'
    });
  }

  let browser;

  try {
    console.log('Generating PDF for:', url);

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // 🔐 1. Inyectar TOKEN en todas las requests
    await page.setExtraHTTPHeaders({
      Authorization: token,
      Accept: 'application/json'
    });

    // 🚫 Evitar errores de CORS / SSL
    await page.setBypassCSP(true);

    // 🌐 2. Ir a la página
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // ⏳ 3. Esperar render REAL (React / Vue / etc)
    const extraWait = parseInt(wait) || 10000;

    console.log('Waiting extra ms:', extraWait);

    await new Promise(resolve => setTimeout(resolve, extraWait));

    // 👀 4. FORZAR scroll (muchas apps cargan lazy)
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

    // ⏳ Espera adicional tras scroll
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 📸 5. Generar PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="document.pdf"'
    });

    res.send(pdf);

  } catch (error) {
    console.error('PDF generation failed:', error);

    res.status(500).json({
      error: 'Failed to generate PDF',
      details: error.message
    });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});