const { app, startServer } = require('./individual-server');
const { pool } = require('./db');
const externalData = require('./external-data');

function clientError(message) {
  return /required|invalid|not found|missing|exceeds|must remain|must have|must be|synthetic STAGING|conflicts|current STAGING|duplicate|preserved/i.test(message || '');
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP9 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({ error: clientError(message) ? message : 'Internal server error' });
    }
  };
}

app.get('/mvp9-api/taxa/:id/external-data', route(async (req, res) => {
  const detail = await externalData.getTaxonExternalData(req.params.id);
  if (!detail) return res.status(404).json({ error: 'TaxonConcept not found' });
  res.json(detail);
}));

app.post('/mvp9-api/external-sources', route(async (req, res) => {
  const detail = await externalData.createOrReuseExternalSource(req.body || {});
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.post('/mvp9-api/external-records', route(async (req, res) => {
  const detail = await externalData.createOrReuseExternalRecord(req.body || {});
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp9-api/external-records/:id', route(async (req, res) => {
  const detail = await externalData.getRecordDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'ExternalRecord not found' });
  res.json(detail);
}));

app.post('/mvp9-api/external-records/:id/snapshots', route(async (req, res) => {
  const detail = await externalData.createOrReuseSnapshot(req.params.id);
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp9-api/external-record-snapshots/:id', route(async (req, res) => {
  const detail = await externalData.getSnapshotDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'ExternalRecordSnapshot not found' });
  res.json(detail);
}));

app.post('/mvp9-api/taxa/:id/provenance-links', route(async (req, res) => {
  const detail = await externalData.linkTaxonProvenance(req.params.id, req.body || {});
  res.status(detail.created ? 201 : 200).json(detail);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP9 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
