// Ollama と OpenAI互換API の応答の形をまねた仮のサーバー（本物での確認は使う人が行う）
const http = require('node:http');

function startMockAi(answer) {
  const log = [];
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const json = body ? JSON.parse(body) : null;
        log.push({ url: req.url, auth: req.headers.authorization || '', body: json });
        const send = (o) => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
        if (req.url === '/api/tags') return send({ models: [{ name: 'mock-model:latest' }] });
        if (req.url === '/api/chat') return send({ model: json.model, created_at: '2026-11-05T00:00:00Z', message: { role: 'assistant', content: JSON.stringify(answer(json)) }, done: true });
        if (req.url === '/v1/chat/completions') return send({ id: 'x', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(answer(json)) }, finish_reason: 'stop' }] });
        res.writeHead(404, cors); res.end('{}');
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, log, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
module.exports = { startMockAi };
