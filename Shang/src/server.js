import http from 'node:http';
import { handleIncomingMessage } from './agent.js';

export function startAgentServer(config, options = {}) {
  const listenUrl = new URL(options.listen ?? config.agent.listen);
  const port = Number(options.port ?? listenUrl.port ?? 8787);
  const host = options.host ?? listenUrl.hostname ?? 'localhost';

  const server = http.createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`).pathname;

      if (request.method === 'GET' && requestPath.endsWith('/health')) {
        return sendJson(response, 200, { ok: true, agent: config.agent.name });
      }

      if (request.method === 'POST' && requestPath.endsWith('/agent/message')) {
        const payload = await readJsonBody(request);
        const result = await handleIncomingMessage(config, payload);
        return sendJson(response, 200, result);
      }

      sendJson(response, 404, { ok: false, error: 'not found' });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: String(error?.message ?? error) });
    }
  });

  server.listen(port, host, () => {
    console.log(`Shang agent ${config.agent.name} listening at http://${host}:${port}`);
  });

  return server;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}
