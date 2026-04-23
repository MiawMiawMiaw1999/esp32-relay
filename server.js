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
    body{margin:0;background:#000;display:flex;flex-direction:column;align-items:center;min-height:100vh;}
    img{width:100%;max-width:800px;margin-top:10px;}
    button{margin:15px;padding:20px 40px;font-size:22px;border-radius:12px;border:none;
           background:#e53935;color:#fff;font-weight:bold;cursor:pointer;-webkit-user-select:none;}
    #status{color:#aaa;margin-top:10px;font-family:sans-serif;font-size:14px;}
    #log{color:#0f0;font-family:monospace;font-size:11px;margin:10px;text-align:left;width:90%;}
  </style>
</head>
<body>
  <div id="status">Connexion...</div>
  <img id="frame" src="">
  <button id="btn"
    onmousedown="vibrer(true)" onmouseup="vibrer(false)"
    ontouchstart="e=>{e.preventDefault();vibrer(true)}" ontouchend="vibrer(false)">
    Maintenir pour vibrer
  </button>
  <div id="log"></div>
<script>
  const ws = new WebSocket('wss://' + location.host);
  const img = document.getElementById('frame');
  const status = document.getElementById('status');
  const log = document.getElementById('log');

  function addLog(msg) {
    log.innerHTML = msg + '<br>' + log.innerHTML;
  }

  ws.binaryType = 'blob';
  ws.onopen = () => {
    status.textContent = 'Connecte';
    addLog('WS ouvert');
  };
  ws.onclose = () => {
    status.textContent = 'Deconnecte';
    addLog('WS ferme');
  };
  ws.onerror = (e) => {
    addLog('WS erreur: ' + e.type);
  };
  ws.onmessage = e => {
    if (e.data instanceof Blob) {
      const url = URL.createObjectURL(e.data);
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
    } else {
      addLog('Recu: ' + e.data);
      if (e.data === 'ON') status.textContent = 'Vibreur ON';
      if (e.data === 'OFF') status.textContent = 'Vibreur OFF';
    }
  };

  function vibrer(on) {
    addLog('Bouton: ' + (on ? 'START' : 'STOP') + ' ws=' + ws.readyState);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(on ? 'START' : 'STOP');
      addLog('Envoye: ' + (on ? 'START' : 'STOP'));
    } else {
      addLog('ERREUR: WS pas ouvert (state=' + ws.readyState + ')');
    }
  }

  document.getElementById('btn').addEventListener('touchstart', function(e) {
    e.preventDefault();
    vibrer(true);
  }, {passive: false});

  document.getElementById('btn').addEventListener('touchend', function(e) {
    e.preventDefault();
    vibrer(false);
  }, {passive: false});
</script>
</body>
</html>`);
});

wss.on('connection', (ws, req) => {
  const isEsp = req.url === '/esp';
  console.log('Nouvelle connexion WS - isEsp:', isEsp, 'url:', req.url);

  if (isEsp) {
    esp32Client = ws;
    console.log('ESP32 connecte');
    ws.on('message', msg => {
      console.log('Message ESP32:', msg.toString());
    });
    ws.on('close', () => {
      console.log('ESP32 deconnecte');
      esp32Client = null;
    });
  } else {
    browsers.add(ws);
    console.log('Navigateur connecte, total:', browsers.size);
    if (lastFrame) ws.send(lastFrame);

    ws.on('message', msg => {
      const txt = msg.toString();
      console.log('Message navigateur:', txt, '| ESP32 dispo:', !!esp32Client);
      if ((txt === 'START' || txt === 'STOP') && esp32Client
          && esp32Client.readyState === WebSocket.OPEN) {
        esp32Client.send(txt);
        console.log('Transmis a ESP32:', txt);
      } else {
        console.log('ESP32 non connecte ou message inconnu');
      }
    });

    ws.on('close', () => {
      browsers.delete(ws);
      console.log('Navigateur deconnecte');
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Serveur sur port ' + PORT));
