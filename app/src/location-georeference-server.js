const { app, startServer } = require('./review-request-server');
const { pool } = require('./db');
const geo = require('./location-georeference');

function clientError(message) {
  return /required|invalid|not found|missing|must|restricted|conflicts|duplicate|MVP14|fail-closed|unauthorized/i.test(message || '');
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP14 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({ error: clientError(message) ? message : 'Internal server error' });
    }
  };
}

app.get('/mvp14-api/locations/:id/georeference', route(async (req,res) => {
  res.json(await geo.getLocationGeoreference(req.params.id));
}));

app.post('/mvp14-api/locations/:id/georeference-demo', route(async (req,res) => {
  const detail = await geo.createOrReuseDemoGeometry(req.params.id);
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp14-api/location-geometry-versions/:id', route(async (req,res) => {
  const detail = await geo.getGeometryVersion(req.params.id);
  if (!detail) return res.status(404).json({error:'LocationGeometryVersion not found'});
  res.json(detail);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP14 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
