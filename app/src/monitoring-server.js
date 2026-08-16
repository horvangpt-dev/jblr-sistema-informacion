const { app, startServer } = require('./evidence-server');
const { pool } = require('./db');
const monitoring = require('./field-monitoring');

function clientError(message) {
  return /required|invalid|not found|missing|exceeds|must remain|must have|must be|synthetic STAGING|conflicts|current STAGING/i.test(message || '');
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP7 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({ error: clientError(message) ? message : 'Internal server error' });
    }
  };
}

app.get('/mvp7-api/field-visits/:id/monitoring', route(async (req, res) => {
  const detail = await monitoring.getVisitMonitoring(req.params.id);
  if (!detail) return res.status(404).json({ error: 'FieldVisit not found' });
  res.json(detail);
}));

app.post('/mvp7-api/field-visits/:id/observations', route(async (req, res) => {
  const detail = await monitoring.createOrReuseObservation(req.params.id, req.body || {});
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp7-api/observations/:id', route(async (req, res) => {
  const detail = await monitoring.getObservationDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Observation not found' });
  res.json(detail);
}));

app.patch('/mvp7-api/observations/:id', route(async (req, res) => {
  res.json(await monitoring.editObservation(req.params.id, req.body || {}));
}));

app.post('/mvp7-api/field-visits/:id/censuses', route(async (req, res) => {
  const detail = await monitoring.createOrReuseCensus(req.params.id, req.body || {});
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp7-api/censuses/:id', route(async (req, res) => {
  const detail = await monitoring.getCensusDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Census not found' });
  res.json(detail);
}));

app.patch('/mvp7-api/censuses/:id', route(async (req, res) => {
  res.json(await monitoring.editCensus(req.params.id, req.body || {}));
}));

app.post('/mvp7-api/censuses/:id/measurements', route(async (req, res) => {
  const detail = await monitoring.createOrReuseMeasurements(req.params.id);
  res.status(detail.createdCount ? 201 : 200).json(detail);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP7 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
