'use strict';
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, createWebSocketStream } = require('ws');

// load .env (no dependency)
try {
  for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch (_) {}

const ID = (process.env.APP_ID || '').replace(/-/g, '').toLowerCase();
const WS_PATH = process.env.WS_PATH || '/ws';
const PORT = parseInt(process.env.PORT || '3000', 10);
const idBuf = Buffer.from(ID, 'hex');

const server = http.createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/status') { 
    res.writeHead(200, { 'content-type': 'application/json' }); 
    return res.end(JSON.stringify({ status: 'healthy', version: '1.0.4' })); 
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><head><title>Web Runtime Service</title></head><body><h1>Welcome to Web Runtime</h1><p>Service is running normally.</p></body></html>');
});

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
server.on('upgrade', (req, sock, head) => {
  if (!req.url.startsWith(WS_PATH) || idBuf.length !== 16) return sock.destroy();
  wss.handleUpgrade(req, sock, head, (ws) => handle(ws));
});

function handle(ws) {
  ws.once('message', (msg) => {
    try {
      msg = Buffer.from(msg);
      const ver = msg[0];
      if (!msg.subarray(1, 17).equals(idBuf)) return ws.close();
      let i = 18 + msg[17];
      const cmd = msg[i++];
      if (cmd !== 1) return ws.close();
      const port = msg.readUInt16BE(i); i += 2;
      const atyp = msg[i++];
      let host;
      if (atyp === 1) { host = Array.from(msg.subarray(i, i + 4)).join('.'); i += 4; }
      else if (atyp === 2) { const n = msg[i++]; host = msg.subarray(i, i + n).toString(); i += n; }
      else if (atyp === 3) { const b = msg.subarray(i, i + 16); i += 16; host = b.toString('hex').match(/.{4}/g).join(':'); }
      else return ws.close();
      ws.send(Buffer.from([ver, 0]));
      const duplex = createWebSocketStream(ws);
      duplex.on('error', () => {});
      const remote = net.connect({ host, port }, () => {
        remote.write(msg.subarray(i));
        duplex.pipe(remote).pipe(duplex);
      });
      remote.on('error', () => { try { ws.close(); } catch (_) {} });
      ws.on('close', () => remote.destroy());
    } catch (_) { try { ws.close(); } catch (_) {} }
  });
  ws.on('error', () => {});
}

server.listen(PORT, '0.0.0.0', () => console.log('listening on', PORT));
