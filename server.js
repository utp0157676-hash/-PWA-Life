/**
 * ==============================================================================
 * SERVIDOR LOCAL HTTP - PWA LIFE
 * ==============================================================================
 * 
 * Servidor HTTP nativo en Node.js sin dependencias externas (zero-dependencies).
 * Proporciona el entorno de origen local (http://localhost:3000) requerido por los
 * navegadores modernos para permitir el registro de Service Workers y Cache Storage.
 * ==============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

// Mapeo de extensiones a tipos MIME estándar
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Limpiar URL y prevenir Path Traversal
  let safeUrl = req.url.split('?')[0].split('#')[0];
  if (safeUrl === '/' || safeUrl === '') {
    safeUrl = '/index.html';
  }

  // Decodificar ruta
  let decodedPath;
  try { decodedPath = decodeURIComponent(safeUrl); }
  catch { res.writeHead(400); res.end('Ruta inválida'); return; }
  // This server only serves the public app shell; PHP must run through Apache.
  if (!/^\/(?:index\.html|manifest\.json|sw\.js|(?:js|css|icons)\/[a-zA-Z0-9_.-]+)$/.test(decodedPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Recurso no disponible. La API PHP requiere Apache/XAMPP.');
    return;
  }
  let filePath = path.join(BASE_DIR, decodedPath);

  // Normalizar ruta para evitar salir del directorio base
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Prohibido: Acceso no permitido fuera del directorio del proyecto.');
    return;
  }

  // Verificar existencia del archivo
  fs.stat(normalizedPath, (err, stats) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Si no existe y es una petición de navegación, servir index.html (SPA Fallback)
        const indexPath = path.join(BASE_DIR, 'index.html');
        fs.readFile(indexPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Recurso no encontrado.');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 Error interno del servidor: ${err.code}`);
      }
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(normalizedPath, 'index.html');
    } else {
      filePath = normalizedPath;
    }

    const ext = path.extname(filePath).toLowerCase();
    let contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Asegurar MIME correcto para manifest.json
    if (path.basename(filePath) === 'manifest.json') {
      contentType = 'application/manifest+json; charset=utf-8';
    }

    // Cabeceras recomendadas para desarrollo y pruebas de PWA
    const headers = {
      'Content-Type': contentType,
      // Evitar que el navegador almacene en HTTP Cache el Service Worker para facilitar pruebas
      'Cache-Control': ext === '.js' && path.basename(filePath) === 'sw.js' 
        ? 'no-cache, no-store, must-revalidate' 
        : 'public, max-age=3600'
    };

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 Error al leer el archivo: ${readErr.message}`);
      } else {
        res.writeHead(200, headers);
        res.end(content);
      }
    });
  });
});

// Manejo elegante de errores de puerto ocupado
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] El puerto ${PORT} ya está ocupado por otro proceso.`);
    console.error(`Cierra la otra aplicación o inicia en otro puerto con: set PORT=3001 && node server.js\n`);
  } else {
    console.error(`\n[ERROR] Error en el servidor: ${err.message}\n`);
  }
  process.exit(1);
});

// Escuchar en todas las interfaces de red (0.0.0.0) para admitir localhost, 127.0.0.1 y red local
server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log('       PWA LIFE - SERVIDOR LOCAL ACTIVO             ');
  console.log('====================================================');
  console.log(` PWA Life disponible en http://localhost:${PORT}`);
  console.log(` Acceso alternativo: http://127.0.0.1:${PORT}`);
  console.log(' Presiona CTRL + C para detener el servidor');
  console.log('====================================================');
});
