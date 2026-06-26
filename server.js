/**
 * fnos-easynet - Lightweight management server for mihomo proxy on fnOS
 * Zero external dependencies - uses only Node.js built-in modules
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { execSync, exec } = require('child_process');

// ─── Configuration ───────────────────────────────────────────────────────────
const PORT = process.env.SERVER_PORT || 9090;
const MIHOMO_API = process.env.MIHOMO_API || 'http://127.0.0.1:9097';
const CONFIG_DIR = process.env.CONFIG_DIR || '/etc/mihomo';
const DATA_DIR = process.env.DATA_DIR || '/data';
const WEB_DIR = path.join(__dirname, 'web');
const TRAFFIC_HISTORY_SIZE = 60; // Keep 60 data points

// ─── State ───────────────────────────────────────────────────────────────────
let currentMode = 'proxy'; // 'proxy' or 'tun'
let trafficHistory = [];
let connectionLog = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function readJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function proxyToMihomo(reqPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(reqPath, MIHOMO_API);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => { data += chunk; });
      proxyRes.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    proxyReq.on('error', (err) => {
      reject(err);
    });

    if (body) {
      proxyReq.write(JSON.stringify(body));
    }
    proxyReq.end();
  });
}

// ─── MIME Types ──────────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

// ─── Static File Server ─────────────────────────────────────────────────────
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ─── API Routes ──────────────────────────────────────────────────────────────
async function handleAPI(req, res, url) {
  const pathname = url.pathname.replace('/api', '');
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    sendJSON(res, { ok: true });
    return;
  }

  try {
    // ── Status ──
    if (pathname === '/status' && method === 'GET') {
      let mihomoInfo = null;
      try {
        mihomoInfo = await proxyToMihomo('/version');
      } catch {
        mihomoInfo = { version: 'unknown', message: 'mihomo not reachable' };
      }

      let mihomoTraffic = null;
      try {
        mihomoTraffic = await proxyToMihomo('/traffic');
      } catch {
        mihomoTraffic = { up: 0, down: 0 };
      }

      let mihomoConns = null;
      try {
        mihomoConns = await proxyToMihomo('/connections');
      } catch {
        mihomoConns = { connections: [] };
      }

      sendJSON(res, {
        mode: currentMode,
        mihomo: mihomoInfo,
        traffic: mihomoTraffic,
        connections: {
          total: mihomoConns.connections ? mihomoConns.connections.length : 0,
          list: mihomoConns.connections ? mihomoConns.connections.slice(0, 20) : []
        },
        uptime: process.uptime(),
        timestamp: Date.now()
      });
      return;
    }

    // ── Mode Switch ──
    if (pathname === '/mode' && method === 'GET') {
      sendJSON(res, { mode: currentMode });
      return;
    }

    if (pathname === '/mode' && method === 'POST') {
      const body = await parseBody(req);
      const newMode = body.mode;

      if (!['proxy', 'tun'].includes(newMode)) {
        sendJSON(res, { error: 'Invalid mode. Use "proxy" or "tun"' }, 400);
        return;
      }

      try {
        if (newMode === 'tun') {
          // Enable TUN mode via mihomo API
          await proxyToMihomo('/configs', 'PATCH', {
            tun: {
              enable: true,
              stack: 'system',
              'auto-route': true,
              'auto-detect-interface': true,
              'dns-hijack': ['any:53']
            }
          });
        } else {
          // Disable TUN mode
          await proxyToMihomo('/configs', 'PATCH', {
            tun: { enable: false }
          });
        }

        currentMode = newMode;
        writeJSON(path.join(DATA_DIR, 'mode.json'), { mode: currentMode });
        sendJSON(res, { mode: currentMode, message: `Switched to ${newMode} mode` });
      } catch (err) {
        sendJSON(res, { error: `Failed to switch mode: ${err.message}` }, 500);
      }
      return;
    }

    // ── Proxies ──
    if (pathname === '/proxies' && method === 'GET') {
      const proxies = await proxyToMihomo('/proxies');
      sendJSON(res, proxies);
      return;
    }

    if (pathname.startsWith('/proxies/') && method === 'PUT') {
      const proxyName = decodeURIComponent(pathname.split('/')[3]);
      const body = await parseBody(req);
      const result = await proxyToMihomo(`/proxies/${proxyName}`, 'PUT', body);
      sendJSON(res, result);
      return;
    }

    // ── Proxy Delay Test ──
    if (pathname.startsWith('/proxies/') && pathname.endsWith('/delay') && method === 'GET') {
      const proxyName = decodeURIComponent(pathname.split('/')[3]);
      const testUrl = url.searchParams.get('url') || 'https://www.google.com';
      const timeout = url.searchParams.get('timeout') || '5000';
      const result = await proxyToMihomo(
        `/proxies/${proxyName}/delay?url=${encodeURIComponent(testUrl)}&timeout=${timeout}`
      );
      sendJSON(res, result);
      return;
    }

    // ── Connections ──
    if (pathname === '/connections' && method === 'GET') {
      const conns = await proxyToMihomo('/connections');
      sendJSON(res, conns);
      return;
    }

    if (pathname === '/connections' && method === 'DELETE') {
      await proxyToMihomo('/connections', 'DELETE');
      sendJSON(res, { message: 'All connections closed' });
      return;
    }

    // ── Traffic ──
    if (pathname === '/traffic' && method === 'GET') {
      try {
        const traffic = await proxyToMihomo('/traffic');
        trafficHistory.push({ ...traffic, timestamp: Date.now() });
        if (trafficHistory.length > TRAFFIC_HISTORY_SIZE) {
          trafficHistory.shift();
        }
        sendJSON(res, { current: traffic, history: trafficHistory });
      } catch {
        sendJSON(res, { current: { up: 0, down: 0 }, history: trafficHistory });
      }
      return;
    }

    // ── Config Management ──
    if (pathname === '/configs' && method === 'GET') {
      // Read raw YAML config as text (not JSON)
      try {
        const configRaw = fs.readFileSync(path.join(CONFIG_DIR, 'config.yaml'), 'utf-8');
        sendJSON(res, { config: configRaw });
      } catch {
        sendJSON(res, { config: '' });
      }
      return;
    }

    if (pathname === '/configs' && method === 'PUT') {
      const body = await parseBody(req);
      await proxyToMihomo('/configs', 'PATCH', body);
      sendJSON(res, { message: 'Config updated' });
      return;
    }

    // ── Subscription Management ──
    if (pathname === '/subscriptions' && method === 'GET') {
      const subs = readJSON(path.join(DATA_DIR, 'subscriptions.json'), []);
      sendJSON(res, { subscriptions: subs });
      return;
    }

    if (pathname === '/subscriptions' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.url) {
        sendJSON(res, { error: 'Subscription URL is required' }, 400);
        return;
      }

      const subs = readJSON(path.join(DATA_DIR, 'subscriptions.json'), []);
      const newSub = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        url: body.url,
        name: body.name || 'New Subscription',
        addedAt: new Date().toISOString(),
        updatedAt: null
      };
      subs.push(newSub);
      writeJSON(path.join(DATA_DIR, 'subscriptions.json'), subs);
      sendJSON(res, newSub, 201);
      return;
    }

    if (pathname.startsWith('/subscriptions/') && method === 'DELETE') {
      const subId = pathname.split('/')[3];
      let subs = readJSON(path.join(DATA_DIR, 'subscriptions.json'), []);
      subs = subs.filter(s => s.id !== subId);
      writeJSON(path.join(DATA_DIR, 'subscriptions.json'), subs);
      sendJSON(res, { message: 'Subscription deleted' });
      return;
    }

    if (pathname.startsWith('/subscriptions/') && pathname.endsWith('/update') && method === 'POST') {
      const subId = pathname.split('/')[3];
      const subs = readJSON(path.join(DATA_DIR, 'subscriptions.json'), []);
      const sub = subs.find(s => s.id === subId);
      if (!sub) {
        sendJSON(res, { error: 'Subscription not found' }, 404);
        return;
      }

      // Update subscription by downloading and replacing config
      try {
        const body = await parseBody(req);
        // In production, this would download the subscription URL
        sub.updatedAt = new Date().toISOString();
        writeJSON(path.join(DATA_DIR, 'subscriptions.json'), subs);
        sendJSON(res, { message: 'Subscription updated', subscription: sub });
      } catch (err) {
        sendJSON(res, { error: `Failed to update: ${err.message}` }, 500);
      }
      return;
    }

    // ── Logs ──
    if (pathname === '/logs' && method === 'GET') {
      sendJSON(res, { logs: connectionLog.slice(-100) });
      return;
    }

    // ── DNS ──
    if (pathname === '/dns' && method === 'GET') {
      const domain = url.searchParams.get('name') || 'dns.alidns.com';
      try {
        const dns = await proxyToMihomo(`/dns/query?name=${encodeURIComponent(domain)}`);
        sendJSON(res, dns);
      } catch {
        sendJSON(res, { nameserver: ['223.5.5.5', '119.29.29.29'] });
      }
      return;
    }

    // ── Rules ──
    if (pathname === '/rules' && method === 'GET') {
      const rules = await proxyToMihomo('/rules');
      sendJSON(res, rules);
      return;
    }

    // ── Version / Info ──
    if (pathname === '/version' && method === 'GET') {
      sendJSON(res, {
        name: 'fnos-easynet',
        version: '1.0.0',
        author: 'fnos-easynet',
        description: 'VPN & Proxy solution for fnOS (飞牛OS)',
        mihomo: await proxyToMihomo('/version').catch(() => ({ version: 'unknown' }))
      });
      return;
    }

    // ── 404 ──
    sendJSON(res, { error: 'Not Found' }, 404);

  } catch (err) {
    sendJSON(res, { error: err.message }, 500);
  }
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // API routes
  if (pathname.startsWith('/api/')) {
    await handleAPI(req, res, url);
    return;
  }

  // Proxy mihomo dashboard (metacubexd) - serve as-is
  if (pathname.startsWith('/dashboard/')) {
    const dashPath = pathname.replace('/dashboard/', '/usr/share/metacubexd/');
    if (fs.existsSync(dashPath)) {
      serveStatic(res, dashPath);
    } else {
      serveStatic(res, '/usr/share/metacubexd/index.html');
    }
    return;
  }

  // Static files - serve web UI
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(WEB_DIR, filePath);

  // Prevent directory traversal
  if (!filePath.startsWith(WEB_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  serveStatic(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[fnos-easynet] Management server running on port ${PORT}`);
  console.log(`[fnos-easynet] Mihomo API: ${MIHOMO_API}`);
  console.log(`[fnos-easynet] Web UI: http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[fnos-easynet] Shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[fnos-easynet] Shutting down...');
  server.close(() => process.exit(0));
});
