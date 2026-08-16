const { app, startServer } = require('./monitoring-server');
const { pool } = require('./db');
const trace = require('./individual-traceability');

function clientError(message) {
  return /required|invalid|not found|missing|exceeds|must remain|must have|must be|synthetic STAGING|conflicts|current STAGING|exactly one|belong/i.test(message || '');
}
function route(handler) {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP8 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({ error: clientError(message) ? message : 'Internal server error' });
    }
  };
}

app.get('/mvp8-api/populations/:id/individuals', route(async (req,res) => {
  const detail = await trace.getPopulationIndividuals(req.params.id);
  if (!detail) return res.status(404).json({error:'Population not found'});
  res.json(detail);
}));
app.post('/mvp8-api/populations/:id/individuals', route(async (req,res) => {
  const detail = await trace.createOrReuseIndividual(req.params.id, req.body || {});
  res.status(detail.created ? 201 : 200).json(detail);
}));
app.get('/mvp8-api/individuals/:id', route(async (req,res) => {
  const detail = await trace.getIndividualDetail(req.params.id);
  if (!detail) return res.status(404).json({error:'Individual not found'});
  res.json(detail);
}));
app.patch('/mvp8-api/individuals/:id', route(async (req,res) => {
  res.json(await trace.editIndividual(req.params.id, req.body || {}));
}));
app.get('/mvp8-api/collection-events/:id/individuals', route(async (req,res) => {
  const detail = await trace.getCollectionIndividuals(req.params.id);
  if (!detail) return res.status(404).json({error:'CollectionEvent not found'});
  res.json(detail);
}));
app.post('/mvp8-api/collection-events/:id/individuals', route(async (req,res) => {
  const detail = await trace.linkCollectionIndividual(req.params.id, req.body || {});
  res.status(detail.created ? 201 : 200).json(detail);
}));
app.get('/mvp8-api/samples/:id/origin-trace', route(async (req,res) => {
  const detail = await trace.getSampleOriginTrace(req.params.id);
  if (!detail) return res.status(404).json({error:'Sample not found'});
  res.json(detail);
}));
app.post('/mvp8-api/samples/:id/origin-individual', route(async (req,res) => {
  const detail = await trace.linkSampleOriginIndividual(req.params.id, req.body || {});
  res.status(detail.linked ? 201 : 200).json(detail);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP8 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}
module.exports = { app, startServer };
