const { app, startServer } = require('./analysis-server');
const { pool } = require('./db');
const regionalStatus = require('./regional-status');

function clientError(message) {
  return /required|invalid|not found|missing|must|restricted|conflicts|duplicate|exceeds|MVP11/i.test(message || '');
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP11 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({
        error: clientError(message) ? message : 'Internal server error'
      });
    }
  };
}

app.get('/mvp11-api/taxa/:id/regional-status', route(async (req,res) => {
  const detail = await regionalStatus.getTaxonRegionalStatus(req.params.id);
  if (!detail) return res.status(404).json({error:'TaxonConcept not found'});
  res.json(detail);
}));

app.post('/mvp11-api/taxa/:id/regional-status-demo', route(async (req,res) => {
  const detail = await regionalStatus.createOrReuseRegionalStatus(req.params.id);
  const createdAny = Object.values(detail.created).some(Boolean);
  res.status(createdAny ? 201 : 200).json(detail);
}));

app.get('/mvp11-api/geographic-areas/:id', route(async (req,res) => {
  const detail = await regionalStatus.getGeographicArea(req.params.id);
  if (!detail) return res.status(404).json({error:'GeographicArea not found'});
  res.json(detail);
}));

app.get('/mvp11-api/regional-assertions/:id', route(async (req,res) => {
  const detail = await regionalStatus.getRegionalAssertion(req.params.id);
  if (!detail) return res.status(404).json({error:'RegionalTaxonAssertion not found'});
  res.json(detail);
}));

app.patch('/mvp11-api/regional-assertions/:id', route(async (req,res) => {
  res.json(await regionalStatus.editRegionalAssertion(req.params.id, req.body || {}));
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP11 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
