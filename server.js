const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let lastFrame = null;
let esp32Client = null;
const browsers = new Set();

app.use(express.raw({ type: 'image/jpeg', limit: '5mb' }));

app.post('/frame', (req, res) => {
  lastFrame = req.body;
  browsers.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(lastFrame);
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
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:#000;display:flex;flex-direction:column;align-items:center;height:100vh;}
    img{width:100%;max-width:1200px;object-fit:contain;}
    .btns{display:flex;gap:12px;margin:10px;flex-wrap:wrap;justify-content:center;}
    button{padding:18px 36px;font-size:20px;border-radius:12px;border:none;
           color:#fff;font-weight:bold;cursor:pointer;
           touch-action:none;user-select:none;-webkit-user-select:none;}
    #btn{background:#e53935;}
    #btnPulse{background:#ff9800;}
    #status{color:#aaa;font-family:sans-serif;font-size:13px;padding:6px;}
  </style>
</head>
<body>
  <div id="status">Connexion...</div>
  <img id="frame">
  <div class="btns">
    <button id="btn">Maintenir pour vibrer</button>
    <button id="btnPulse">Vibration brève</button>
  </div>
<script>
  const ws = new WebSocket('wss://' + location.host);
  const img = document.getElementById('frame');
  const status = document.getElementById('status');
  const btn = document.getElementById('btn');
  let blobUrl = null;

  ws.binaryType = 'blob';
  ws.onopen = () => status.textContent = 'Connecte';
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

  btn.addEventListener('touchstart', e => { e.preventDefault(); send('START'); }, {passive:false});
  btn.addEventListener('touchend',   e => { e.preventDefault(); send('STOP');  }, {passive:false});
  btn.addEventListener('mousedown',  () => send('START'));
  btn.addEventListener('mouseup',    () => send('STOP'));

  const btnPulse = document.getElementById('btnPulse');
  btnPulse.addEventListener('touchstart', e => { e.preventDefault(); send('PULSE'); }, {passive:false});
  btnPulse.addEventListener('mousedown',  () => send('PULSE'));
</script>
</body>
</html>`);
});

wss.on('connection', (ws, req) => {
  if (req.url === '/esp') {
    esp32Client = ws;
    ws.on('close', () => { esp32Client = null; });
  } else {
    browsers.add(ws);
    if (lastFrame) ws.send(lastFrame);
    ws.on('message', msg => {
      const txt = msg.toString();
      if ((txt === 'START' || txt === 'STOP' || txt === 'PULSE')
          && esp32Client?.readyState === WebSocket.OPEN) {
        esp32Client.send(txt);
      }
    });
    ws.on('close', () => browsers.delete(ws));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Serveur port ' + PORT));
