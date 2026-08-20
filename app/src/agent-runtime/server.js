'use strict';

const express = require('express');
const { JBLROrchestrator } = require('./orchestrator');

async function main() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const runtime = new JBLROrchestrator();
  await runtime.initialize();

  app.get('/health', async (_req, res) => {
    const status = await runtime.status();
    res.json({
      ok: true,
      openaiConfigured: runtime.adapter.isConfigured(),
      mode: status.mode,
      actorIds: Object.keys(status.actors),
    });
  });

  app.get('/runtime/status', async (_req, res) => {
    res.json(await runtime.status());
  });

  app.post('/actors/:actorId/run', async (req, res, next) => {
    try {
      const input = String(req.body?.input || '').trim();
      if (!input) return res.status(400).json({ ok: false, error: 'input is required' });
      res.json(await runtime.runActor(req.params.actorId, input));
    } catch (error) {
      next(error);
    }
  });

  app.post('/actors/:actorId/continuity', async (req, res, next) => {
    try {
      res.json(await runtime.rotate(req.params.actorId, req.body?.reason || 'MANUAL_CONTINUITY'));
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    res.status(500).json({ ok: false, error: error.message });
  });

  const port = Number(process.env.JBLR_AGENT_RUNTIME_PORT || 8790);
  app.listen(port, () => {
    console.log(`JBLR Autonomous Actor Runtime listening on ${port}`);
  });
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
