const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless
});

const app = express();
const PORT = process.env.PORT || 10000;

const parseBearerToken = (token) => {
  if (!token) return null;
  return token.trim().toLowerCase().startsWith('bearer ') ? token.trim() : `Bearer ${token.trim()}`;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const waitForNetworkIdle = async (page, idleTime = 1000, maxWait = 30000) => {
  let pendingRequests = 0;
  let resolveIdle;
  let timeoutId;
  let maxWaitId;

  const cleanup = () => {
    page.off('request', onRequestStarted);
    page.off('requestfinished', onRequestComplete);
    page.off('requestfailed', onRequestComplete);
    clearTimeout(timeoutId);
    clearTimeout(maxWaitId);
  };

  const onRequestStarted = () => {
    pendingRequests += 1;
    clearTimeout(timeoutId);
  };

  const onRequestComplete = () => {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests === 0) {
      timeoutId = setTimeout(() => resolveIdle(true), idleTime);
    }
  };

  page.on('request', onRequestStarted);
  page.on('requestfinished', onRequestComplete);
  page.on('requestfailed', onRequestComplete);

  return new Promise((resolve) => {
    resolveIdle = (success) => {
      cleanup();
      resolve(success);
    };
    timeoutId = setTimeout(() => {
      if (pendingRequests === 0) {
        resolveIdle(true);
      }
    }, idleTime);
    maxWaitId = setTimeout(() => resolveIdle(false), maxWait);
  });
};

app.get('/pdf', async (req, res) => {
  const { url, token, wait } = req.query;
  const bearerToken = parseBearerToken(token);
  const waitMs = clamp(parseInt(wait, 10) || 7000, 5000, 30000);

  if (!url) {
    console.error('Missing URL parameter');
    return res.status(400).json({ error: 'Missing required query parameter: url' });
  }

  if (!bearerToken) {
    console.error('Missing token parameter');
    return res.status(400).json({ error: 'Missing required query parameter: token' });
  }

  console.log('Generating PDF for URL:', url);
  console.log('Waiting for images and page render, extra delay:', waitMs, 'ms');

  let browser;
  try {
    console.log('Launching Puppeteer browser...');
    console.log('Using executablePath:', process.env.PUPPETEER_EXECUTABLE_PATH || 'bundled');

    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
    console.log('Puppeteer launched successfully.');

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    await page.setExtraHTTPHeaders({ Authorization: bearerToken });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 0,
    });

    console.log('Page navigation completed. Waiting for pending requests to finish...');
    const networkIdle = await waitForNetworkIdle(page, 1000, 15000);
    console.log('Network idle detected:', networkIdle);

    console.log('Waiting for images to finish loading...');
    const imagesLoaded = await page.evaluate(() =>
      new Promise((resolve) => {
        const images = Array.from(document.images || []);
        if (images.length === 0) {
          return resolve(true);
        }

        let loadedCount = 0;
        const markLoaded = () => {
          loadedCount += 1;
          if (loadedCount >= images.length) {
            resolve(true);
          }
        };

        images.forEach((img) => {
          if (img.complete) {
            markLoaded();
            return;
          }
          img.addEventListener('load', markLoaded);
          img.addEventListener('error', markLoaded);
        });

        setTimeout(() => resolve(false), 15000);
      }),
    );

    console.log('Images loaded status:', imagesLoaded);
    console.log(`Applying manual delay of ${waitMs}ms for final render stabilization...`);
    await page.waitForTimeout(waitMs);

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '10mm',
        bottom: '10mm',
        left: '10mm',
        right: '10mm',
      },
    });

    console.log('PDF generation completed. Sending response.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="percepthor.pdf"');
    return res.send(pdf);
  } catch (error) {
    console.error('PDF generation failed:', error);
    return res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn('Error closing browser:', closeError);
      }
    }
  }
});

app.get('/', (req, res) => {
  res.send('Percepthor PDF Renderer API is running. Use GET /pdf?url=...&token=Bearer ...');
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
