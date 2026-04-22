const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let lastFrame = null;
let esp32Client = null;
const browsers = new Set();

app.use(express.raw({ type: 'image/jpeg', limit: '2mb' }));

app.post('/frame', (req, res) => {
  lastFrame = req.body;
  browsers.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(lastFrame);
    }
  });
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ESP32-CAM</title>
  <style>
    body{margin:0;background:#000;display:flex;flex-direction:column;align-items:center;min-height:100vh;}
    img{width:100%;max-width:800px;margin-top:10px;}
    button{margin:15px;padding:20px 40px;font-size:22px;border-radius:12px;border:none;
           background:#e53935;color:#fff;font-weight:bold;cursor:pointer;}
    #status{color:#aaa;margin-top:10px;font-family:sans-serif;font-size:14px;}
  </style>
</head>
<body>
  <div id="status">Connexion...</div>
  <img id="frame" src="">
  <button id="btn" onmousedown="vibrer(true)" onmouseup="vibrer(false)"
          ontouchstart="vibrer(true)" ontouchend="vibrer(false)">
    Maintenir pour vibrer
  </button>
<script>
  const ws = new WebSocket('wss://' + location.host);
  const img = document.getElementById('frame');
  const status = document.getElementById('status');

  ws.binaryType = 'blob';

  ws.onopen = () => { status.textContent = 'Connecte'; };
  ws.onclose = () => { status.textContent = 'Deconnecte'; };

  ws.onmessage = e => {
    if (e.data instanceof Blob) {
      const url = URL.createObjectURL(e.data);
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
    } else {
      if (e.data === 'ON') status.textContent = 'Vibreur ON';
      if (e.data === 'OFF') status.textContent = 'Vibreur OFF';
    }
  };

  function vibrer(on) {
    if (ws.readyState === WebSocket.OPEN) ws.send(on ? 'START' : 'STOP');
  }
</script>
</body>
</html>`);
});

wss.on('connection', (ws, req) => {
  const isEsp = req.url === '/esp';

  if (isEsp) {
    esp32Client = ws;
    ws.on('message', msg => {
      const txt = msg.toString();
      if (txt === 'START' || txt === 'STOP') {
        browsers.forEach(b => {
          if (b.readyState === WebSocket.OPEN) b.send(txt === 'START' ? 'ON' : 'OFF');
        });
        if (esp32Client && esp32Client.readyState === WebSocket.OPEN) {
          esp32Client.send(txt);
        }
      }
    });
    ws.on('close', () => { esp32Client = null; });
  } else {
    browsers.add(ws);
    if (lastFrame) ws.send(lastFrame);
    ws.on('close', () => browsers.delete(ws));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Serveur sur port ' + PORT));
