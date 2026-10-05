const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env if present
try {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  }
} catch {}

const API_KEY = process.env.GEMINI_API_KEY;
const PUBLIC = path.join(__dirname, 'public');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/breakdown') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        if (!API_KEY) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'GEMINI_API_KEY not set on server' }));
        }
        const { task } = JSON.parse(body);
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Break this task into 3-5 small actionable subtasks. Reply with only a JSON array of strings, no extra text: "${task}"` }] }]
          })
        });
        const data = await r.json();
        if (data.error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: data.error.message }));
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const match = text.match(/\[[\s\S]*\]/);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ subtasks: match ? JSON.parse(match[0]) : [] }));
      } catch (e) {
        console.log('ERROR:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Static files
  let filePath = path.join(PUBLIC, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(content);
  });
});

server.listen(3000, () => console.log('App running at http://localhost:3000'));
