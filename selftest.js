// Prueba local de punta a punta: levanta la app, la abre en un navegador real,
// genera el CSV + el PDF de etiquetas y guarda el PDF para poder abrirlo.
//
//   node selftest.js [ubicacion]      (por defecto 2-L-11-0)
//
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const rootDir = __dirname;
const LOCATION = process.argv[2] || '2-L-11-0';
const OUT_PDF = path.join(rootDir, 'selftest-etiquetas.pdf');
const TIMEOUT_MS = 120000;

function findChrome(){
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch(e){ return false; } });
}

const harness = `
<script>
(function(){
  var L = [];
  function log(m){ L.push(String(m)); }
  function $(id){ return document.getElementById(id); }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  window.addEventListener('error', function(e){ log('JS ERROR: ' + e.message + ' @linea ' + e.lineno); });
  window.addEventListener('unhandledrejection', function(e){
    var r = e.reason;
    log('PROMESA RECHAZADA: ' + ((r && (r.stack || r.message)) || r));
  });

  // Interceptamos las descargas para no ensuciar la carpeta de Descargas.
  var downloads = [];
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(){
    if (this.download){ downloads.push(this.download); return; }
    return origClick.apply(this, arguments);
  };

  window.addEventListener('load', async function(){
    var payload = { log: L };
    try {
      log('libs -> XLSX=' + (typeof XLSX) + '  jsPDF=' + (typeof window.jspdf) + '  JsBarcode=' + (typeof JsBarcode));
      log('puente loadLabelsFromCsv=' + (typeof window.loadLabelsFromCsv));
      await wait(1500);
      log('PickSequence -> ' + $('locSourceInfo').textContent);

      $('locInput').value = ${JSON.stringify(LOCATION)};
      $('genBtn').click();

      // Paso 1: el boton del conversor descarga SOLO el CSV y deja las etiquetas listas.
      var t0 = Date.now();
      while (Date.now() - t0 < 30000 && $('pdfStatLabels').textContent === '0') await wait(250);
      log('paso 1 (CSV) descargas -> ' + JSON.stringify(downloads));
      if (downloads.length !== 1) log('OJO: el boton deberia disparar exactamente 1 descarga (el CSV).');

      // Paso 2: recien al apretar "Generar PDF" se baja el PDF.
      $('pdfGenBtn').click();
      var link = null; t0 = Date.now();
      while (Date.now() - t0 < 90000){
        link = document.querySelector('#pdfDownloadWrap a');
        if (link) break;
        await wait(250);
      }

      log('CSV    -> ' + $('status').textContent);
      log('PDF    -> ' + $('pdfStatus').textContent);
      log('conteo -> filas leidas ' + $('pdfStatRows').textContent + ', etiquetas ' + $('pdfStatLabels').textContent);
      log('descargas disparadas -> ' + JSON.stringify(downloads));

      if (link){
        var buf = await (await fetch(link.href)).arrayBuffer();
        var u8 = new Uint8Array(buf), bin = '';
        for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
        payload.pdf = btoa(bin);
        payload.pdfName = link.getAttribute('download');
        log('PDF generado -> ' + payload.pdfName + ' (' + u8.length + ' bytes)');
      } else {
        log('NO se genero el PDF: nunca aparecio el enlace de descarga.');
      }
    } catch (err){
      log('FALLO EL ARNES: ' + (err && err.message ? err.message : err));
    }
    payload.log = L;
    fetch('/__report', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  });
})();
</script>`;

const mime = { '.html':'text/html; charset=utf-8', '.csv':'text/csv; charset=utf-8', '.js':'application/javascript; charset=utf-8' };

let finished = false;
function finish(code){
  if (finished) return;
  finished = true;
  try { chrome && chrome.kill(); } catch(e){}
  try { server.close(); } catch(e){}
  process.exit(code);
}

const server = http.createServer((req, res) => {
  if (req.url === '/__report' && req.method === 'POST'){
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      res.end('ok');
      let data = {};
      try { data = JSON.parse(body); } catch(e){ data = { log: ['respuesta ilegible'] }; }
      console.log('\n──────── resultado ────────');
      (data.log || []).forEach(l => console.log('  ' + l));
      if (data.pdf){
        fs.writeFileSync(OUT_PDF, Buffer.from(data.pdf, 'base64'));
        console.log('\n✅ PDF guardado en: ' + OUT_PDF);
        console.log('   abrilo con:  open "' + OUT_PDF + '"');
        finish(0);
      } else {
        console.log('\n❌ No se genero el PDF. El detalle de arriba dice en que paso se corto.');
        finish(1);
      }
    });
    return;
  }

  const name = (req.url === '/' ? 'Conversor_ubicaciones_bins.html' : req.url.replace(/^\//,'').split('?')[0]);
  const file = path.join(rootDir, name);
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404); res.end('no encontrado'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    // La app se sirve tal cual; el arnes se agrega solo en memoria, el archivo no se toca.
    res.end(ext === '.html' ? Buffer.concat([data, Buffer.from(harness)]) : data);
  });
});

let chrome;
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const url = 'http://127.0.0.1:' + port + '/';
  const bin = findChrome();
  if (!bin){
    console.error('No encontre Chrome. Indicá la ruta con CHROME_PATH=... node selftest.js');
    finish(1);
    return;
  }
  console.log('Ubicacion de prueba : ' + LOCATION);
  console.log('App servida en      : ' + url);
  console.log('Navegador           : ' + bin);
  console.log('\nCorriendo… (puede tardar unos segundos)');

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ubibins-'));
  chrome = spawn(bin, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--user-data-dir=' + profile, url
  ], { stdio: 'ignore' });

  setTimeout(() => {
    console.log('\n❌ Timeout: la pagina no reporto en ' + (TIMEOUT_MS/1000) + 's.');
    finish(1);
  }, TIMEOUT_MS);
});
