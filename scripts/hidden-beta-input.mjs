import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { validHiddenFields } from './beta-password-setup.mjs'

// Loopback-only, one-use hidden input. No password files, argv, screenshots or logs.
export async function hiddenInput(fields, { port = 8791, onReady } = {}) {
  const nonce = randomUUID()
  let origin
  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      response.setHeader('Cache-Control', 'no-store')
      // Chrome sends Origin: null for form POSTs under no-referrer. Preserve
      // same-origin metadata so the strict POST origin check remains usable;
      // external destinations still receive no referrer.
      response.setHeader('Referrer-Policy', 'same-origin')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
      if (request.headers.host !== new URL(origin).host) { response.writeHead(403); response.end(); return }
      if (request.method === 'GET' && request.url === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(`<!doctype html><html lang="es"><meta charset="utf-8"><title>One Stop — entrada local protegida</title><style>body{font:16px system-ui;background:#1a1a1a;color:#eee;max-width:560px;margin:50px auto;padding:24px}form,label{display:grid;gap:12px}form{gap:24px}input,button{padding:12px;font:inherit}input{background:#292929;color:#eee;border:1px solid #777}button{background:#f07a22;border:0}</style><h1>One Stop — entrada local</h1><p>Los valores permanecerán en memoria durante la preparación y la prueba. No se guardarán en archivos ni registros. Usa esta página solo en Chrome.</p><form method="post" action="/submit"><input type="hidden" name="nonce" value="${nonce}">${fields.map(field => `<label>${field.label}<input type="${field.type === 'email' ? 'email' : 'password'}" name="${field.name}" required minlength="${field.minimum || 1}" autocomplete="off"></label>`).join('')}<button>Continuar</button></form></html>`)
        return
      }
      if (request.method !== 'POST' || request.url !== '/submit' || request.headers.origin !== origin) { response.writeHead(403); response.end(); return }
      const chunks = []; let size = 0
      for await (const chunk of request) { size += chunk.length; if (size > 4096) { response.writeHead(413); response.end(); return } chunks.push(chunk) }
      const values = new URLSearchParams(Buffer.concat(chunks).toString())
      if (values.get('nonce') !== nonce || !validHiddenFields(fields, values)) { response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.writeHead(400); response.end('Entrada no válida. Las contraseñas nuevas deben coincidir con su confirmación, tener al menos 8 caracteres y usar como máximo 72 bytes. Vuelve atrás para corregirlas.'); return }
      const result = Object.fromEntries(fields.map(field => [field.name, values.get(field.name)]))
      response.setHeader('Content-Type', 'text/html; charset=utf-8')
      response.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>One Stop</title><p>Entrada recibida. Puedes cerrar esta pestaña y volver a Codex.</p></html>')
      server.close(() => resolve(result))
    })
    server.on('error', () => reject(new Error('Hidden local input could not start')))
    server.listen(port, '127.0.0.1', () => {
      origin = `http://localhost:${server.address().port}`
      if (onReady) onReady(origin, server)
      else console.info(`Hidden local input ready: ${origin}`)
    })
  })
}
