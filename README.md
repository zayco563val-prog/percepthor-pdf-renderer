# percepthor-pdf-renderer

API para generar PDFs a partir de páginas Percepthor protegidas con Bearer token.

## Descripción

Este proyecto expone un endpoint Express que recibe una URL de Percepthor y un token Bearer, renderiza la página con Puppeteer y devuelve un PDF A4 idéntico a la vista en navegador.

## Uso

1. Instala dependencias:

```bash
npm install
```

2. Inicia el servidor:

```bash
npm start
```

3. Llama al endpoint:

```bash
GET /pdf?url=https://display.percepthor.com/...&token=Bearer eyJhbGci...
```

También puedes ajustar el retraso adicional con `wait` (milisegundos):

```bash
GET /pdf?url=https://display.percepthor.com/...&token=Bearer eyJhbGci...&wait=8000
```

## Características

- Usa `express` para el servidor HTTP.
- Usa `puppeteer` con `--no-sandbox` para compatibilidad con Render.
- Soporta puerto dinámico mediante `process.env.PORT`.
- Espera `networkidle2` y detecta automáticamente cuando ya no hay requests pendientes.
- Carga imágenes antes de generar el PDF.
- Añade un delay manual adicional para asegurar el render completo.
- Devuelve el PDF con `Content-Type: application/pdf`.

## Configuración para Render

Render detecta un `package.json` con script `start` y expone el puerto desde `process.env.PORT`.

## Ejemplo de respuesta

- `200 OK` con contenido PDF
- `400 Bad Request` si faltan parámetros
- `500 Internal Server Error` si no puede generarse el PDF
