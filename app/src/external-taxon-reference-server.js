const { app, startServer } = require('./location-georeference-server');
const { pool } = require('./db');
const refs = require('./external-taxon-reference');

function clientError(message) {
  return /required|invalid|not found|missing|must|restricted|conflicts|duplicate|MVP15|fail-closed|unauthorized/i.test(message || '');
}

function route(handler) {
  return async (req,res) => {
    try {
      await handler(req,res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP15 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({ error: clientError(message) ? message : 'Internal server error' });
    }
  };
}

app.get('/mvp15-api/taxa/:id/external-taxonomy-references', route(async (req,res) => {
  res.json(await refs.getTaxonReferences(req.params.id));
}));

app.post('/mvp15-api/taxa/:id/external-taxonomy-references-demo', route(async (req,res) => {
  const detail = await refs.createOrReuseDemoReference(req.params.id);
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp15-api/external-taxonomy-references/:id', route(async (req,res) => {
  const detail = await refs.getReference(req.params.id);
  if (!detail) return res.status(404).json({ error:'ExternalTaxonReference not found' });
  res.json(detail);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP15 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
