const { app, startServer } = require('./server');
const { pool } = require('./db');
const evidence = require('./evidence-flow');

function clientError(message) {
  return /required|invalid|not found|missing|exceeds|must remain|must be|synthetic STAGING|current STAGING/i.test(message || '');
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP6 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({ error: clientError(message) ? message : 'Internal server error' });
    }
  };
}

app.get('/mvp6-api/taxa/:id/evidence', route(async (req, res) => {
  const detail = await evidence.getTaxonEvidence(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Taxon concept not found' });
  res.json(detail);
}));

app.post('/mvp6-api/bibliographic-references', route(async (req, res) => {
  const detail = await evidence.createOrReuseBibliographicReference(req.body || {});
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp6-api/bibliographic-references/:id', route(async (req, res) => {
  const detail = await evidence.getBibliographicReference(req.params.id);
  if (!detail) return res.status(404).json({ error: 'BibliographicReference not found' });
  res.json(detail);
}));

app.patch('/mvp6-api/bibliographic-references/:id', route(async (req, res) => {
  res.json(await evidence.editBibliographicReference(req.params.id, req.body || {}));
}));

app.post('/mvp6-api/taxa/:id/assertions', route(async (req, res) => {
  const detail = await evidence.createOrReuseAssertion(req.params.id, req.body || {});
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp6-api/assertions/:id', route(async (req, res) => {
  const detail = await evidence.getAssertion(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Assertion not found' });
  res.json(detail);
}));

app.patch('/mvp6-api/assertions/:id', route(async (req, res) => {
  res.json(await evidence.editAssertion(req.params.id, req.body || {}));
}));

app.post('/mvp6-api/assertions/:id/evidence-links', route(async (req, res) => {
  const referenceId = req.body && req.body.referenceId;
  if (!referenceId) return res.status(400).json({ error: 'referenceId is required' });
  const detail = await evidence.createOrReuseEvidenceLink(req.params.id, referenceId);
  res.status(detail.created ? 201 : 200).json(detail);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP6 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
