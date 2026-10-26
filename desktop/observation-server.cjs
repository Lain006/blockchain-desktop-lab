const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');

async function observationServer(manager, staticDir) {
  const app = express();
  app.get('/nodes', (req, res) => {
    res.set('Cache-Control', 'no-store').json(manager.snapshot().nodes.filter((node) => node.status === 'running' && node.info)
      .map((node) => `http://127.0.0.1:${node.info.apiPort}`));
  });
  const index = fs.readFileSync(path.join(staticDir, 'index.html'), 'utf8')
    .replace('<head>', '<head><script>window.__NODE_API_URL__=location.origin;</script>');
  app.get('/', (req, res) => res.set('Cache-Control', 'no-store').type('html').send(index));
  app.use(express.static(staticDir, { index: false }));
  app.use((req, res) => res.status(404).json({ error: '观测服务只提供只读目录和页面' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  manager.observationUrl = `http://127.0.0.1:${server.address().port}`;
  manager.changed();
  return server;
}
module.exports = observationServer;
