const { app, startServer } = require('./regional-status-server');
const { pool } = require('./db');
const quality = require('./quality-review');

function clientError(message) {
  return /required|invalid|not found|missing|must|restricted|conflicts|duplicate|MVP12/i.test(message || '');
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP12 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({
        error: clientError(message) ? message : 'Internal server error'
      });
    }
  };
}

app.get('/mvp12-api/regional-assertions/:id/quality', route(async (req,res) => {
  res.json(await quality.listQualityForRegionalAssertion(req.params.id));
}));

app.post('/mvp12-api/regional-assertions/:id/quality-demo', route(async (req,res) => {
  const detail = await quality.createOrReuseQualityAssessment(req.params.id);
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp12-api/quality-assessments/:id', route(async (req,res) => {
  const detail = await quality.getQualityAssessment(req.params.id);
  if (!detail) return res.status(404).json({error:'QualityAssessment not found'});
  res.json(detail);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP12 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
