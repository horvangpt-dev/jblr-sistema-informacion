const fs = require('fs');
const path = require('path');
const express = require('express');
const { pool } = require('./db');
const { assertAuthorizedStaging } = require('./staging');
const taxonomy = require('./taxonomy');
const populations = require('./populations');
const fieldActivity = require('./field-activity');

const app = express();
const defaultPort = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
const publicDir = path.join(__dirname, '..', 'public');
app.get('/app.js', (_req, res) => {
  res.type('application/javascript').send(`${fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8')}\n${fs.readFileSync(path.join(publicDir, 'field-activity.js'), 'utf8')}`);
});
app.get('/styles.css', (_req, res) => {
  res.type('text/css').send(`${fs.readFileSync(path.join(publicDir, 'styles.css'), 'utf8')}\n${fs.readFileSync(path.join(publicDir, 'field-activity.css'), 'utf8')}`);
});
app.use(express.static(publicDir));

app.get('/api/health', async (_req, res, next) => {
  try {
    const staging = await assertAuthorizedStaging();
    const { rows } = await pool.query(`SELECT current_setting('server_version') AS postgres_version`);
    res.json({ ok: true, environment: staging.environment, database: staging.database, postgresVersion: rows[0].postgres_version });
  } catch (err) { next(err); }
});

app.get('/api/ranks', async (_req, res, next) => {
  try { res.json(await taxonomy.listRanks()); } catch (err) { next(err); }
});

app.get('/api/taxa', async (req, res, next) => {
  try {
    if (!req.query.q || String(req.query.q).trim().length < 2) return res.json([]);
    res.json(await taxonomy.searchTaxa(req.query.q));
  } catch (err) { next(err); }
});

app.get('/api/locations', async (req, res, next) => {
  try { res.json(await populations.listLocations(req.query.q || '')); } catch (err) { next(err); }
});

app.post('/api/locations', async (req, res, next) => {
  try { res.status(201).json(await populations.createLocation(req.body || {})); } catch (err) { next(err); }
});

app.patch('/api/locations/:id', async (req, res, next) => {
  try { res.json(await populations.editLocation(req.params.id, req.body || {})); } catch (err) { next(err); }
});

app.get('/api/populations/:id/field-activity', async (req, res, next) => {
  try { res.json(await fieldActivity.getPopulationFieldActivity(req.params.id)); } catch (err) { next(err); }
});

app.post('/api/populations/:id/field-visits', async (req, res, next) => {
  try { res.status(201).json(await fieldActivity.createFieldVisit(req.params.id, req.body || {})); } catch (err) { next(err); }
});

app.get('/api/field-visits/:id', async (req, res, next) => {
  try {
    const detail = await fieldActivity.getFieldVisitDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'FieldVisit not found' });
    res.json(detail);
  } catch (err) { next(err); }
});

app.patch('/api/field-visits/:id', async (req, res, next) => {
  try { res.json(await fieldActivity.editFieldVisit(req.params.id, req.body || {})); } catch (err) { next(err); }
});

app.post('/api/prospections', async (req, res, next) => {
  try { res.status(201).json(await fieldActivity.createProspection(req.body || {})); } catch (err) { next(err); }
});

app.get('/api/prospections/:id', async (req, res, next) => {
  try {
    const detail = await fieldActivity.getProspectionDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Prospection not found' });
    res.json(detail);
  } catch (err) { next(err); }
});

app.patch('/api/prospections/:id', async (req, res, next) => {
  try { res.json(await fieldActivity.editProspection(req.params.id, req.body || {})); } catch (err) { next(err); }
});

app.get('/api/populations/:id', async (req, res, next) => {
  try {
    const detail = await populations.getPopulationDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Population not found' });
    res.json(detail);
  } catch (err) { next(err); }
});

app.patch('/api/populations/:id', async (req, res, next) => {
  try { res.json(await populations.editPopulation(req.params.id, req.body || {})); } catch (err) { next(err); }
});

app.get('/api/taxa/:id/populations', async (req, res, next) => {
  try { res.json(await populations.getTaxonPopulations(req.params.id)); } catch (err) { next(err); }
});

app.post('/api/taxa/:id/populations', async (req, res, next) => {
  try { res.status(201).json(await populations.createPopulation(req.params.id, req.body || {})); } catch (err) { next(err); }
});

app.get('/api/taxa/:id', async (req, res, next) => {
  try {
    const detail = await taxonomy.getTaxonDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Taxon concept not found' });
    res.json(detail);
  } catch (err) { next(err); }
});

app.post('/api/taxa', async (req, res, next) => {
  try {
    const detail = await taxonomy.createTaxon(req.body || {});
    res.status(201).json(detail);
  } catch (err) { next(err); }
});

app.patch('/api/taxa/:id', async (req, res, next) => {
  try { res.json(await taxonomy.editTaxon(req.params.id, req.body || {})); } catch (err) { next(err); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  const message = err && err.message ? err.message : 'Unexpected error';
  const clientError = /required|invalid|already exists|not found|missing|exceeds|must not|current STAGING/i.test(message);
  if (!clientError) console.error('Request error:', message);
  res.status(clientError ? 400 : 500).json({ error: clientError ? message : 'Internal server error' });
});

async function startServer(port = defaultPort, host = '127.0.0.1') {
  await assertAuthorizedStaging();
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.once('error', reject);
  });
}

if (require.main === module) {
  startServer().then((server) => {
    console.log(`JBLR STAGING MVP listening on http://127.0.0.1:${server.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
