const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let lastFrame = null;
let esp32Control = null;
const browsers = new Set();

app.use(express.raw({ type: 'image/jpeg', limit: '5mb' }));

// ── fallback HTTP (garde si besoin) ──────────────────────────
app.post('/frame', (req, res) => {
  lastFrame = req.body;
  browsers.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(lastFrame);
  });
  res.sendStatus(200);
});

// ── page web ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ESP32-CAM</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:#000;display:flex;flex-direction:column;align-items:center;height:100vh;}
    img{width:100%;max-width:1200px;object-fit:contain;}
    .btns{display:flex;gap:12px;margin:10px;flex-wrap:wrap;justify-content:center;}
    button{padding:18px 36px;font-size:20px;border-radius:12px;border:none;
           color:#fff;font-weight:bold;cursor:pointer;
           touch-action:none;user-select:none;-webkit-user-select:none;}
    #btnPulse{background:#ff9800;}
    #status{color:#aaa;font-family:sans-serif;font-size:13px;padding:6px;}
  </style>
</head>
<body>
  <div id="status">Connexion...</div>
  <img id="frame">
  <div class="btns">
    <button id="btnPulse">Vibration brève</button>
  </div>
<script>
  const ws = new WebSocket('wss://' + location.host);
  const img = document.getElementById('frame');
  const status = document.getElementById('status');
  let blobUrl = null;

  ws.binaryType = 'blob';
  ws.onopen  = () => status.textContent = 'Connecte';
  ws.onclose = () => status.textContent = 'Deconnecte';
  ws.onmessage = e => {
    if (e.data instanceof Blob) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(e.data);
      img.src = blobUrl;
    }
  };

  function send(msg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }

  const btnPulse = document.getElementById('btnPulse');
  btnPulse.addEventListener('touchstart', e => { e.preventDefault(); send('PULSE'); }, {passive:false});
  btnPulse.addEventListener('mousedown',  () => send('PULSE'));
</script>
</body>
</html>`);
});

// ── WebSocket ─────────────────────────────────────────────────
wss.on('connection', (ws, req) => {

  // ESP32 — flux vidéo
  if (req.url === '/frame-ws') {
    ws.on('message', data => {
      lastFrame = data;
      browsers.forEach(b => {
        if (b.readyState === WebSocket.OPEN) b.send(data);
      });
    });
    ws.on('close', () => {});
    return;
  }

  // ESP32 — contrôle vibreur
  if (req.url === '/esp') {
    esp32Control = ws;
    ws.on('close', () => { esp32Control = null; });
    return;
  }

  // Browser
  browsers.add(ws);
  if (lastFrame) ws.send(lastFrame);

  ws.on('message', msg => {
    const txt = msg.toString();
    if (txt === 'PULSE' && esp32Control?.readyState === WebSocket.OPEN) {
      esp32Control.send(txt);
    }
  });

  ws.on('close', () => browsers.delete(ws));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Serveur port ' + PORT));
