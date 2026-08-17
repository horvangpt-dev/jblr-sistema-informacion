const { app, startServer } = require('./external-taxon-reference-server');
const { pool } = require('./db');
const controlled = require('./controlled-real');
const persistentPilot = require('./controlled-real-persistent-pilot');
const realMaterialFlow = require('./real-material-flow');

function enabled() {
  return process.env[controlled.ACTIVATION_ENV] === 'true';
}

function route(handler) {
  return async (req,res) => {
    try {
      if (!enabled()) return res.status(404).json({ error: 'CONTROLLED_REAL route is not enabled' });
      await handler(req,res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      console.error('CONTROLLED_REAL request error:', message);
      res.status(400).json({ error: message });
    }
  };
}

app.get('/controlled-real-api/capability', route(async (_req,res) => {
  const staging = await require('./staging').assertAuthorizedStaging();
  res.json({ mode: 'CONTROLLED_REAL', stagingOnly: true, active: true, environment: staging.environment });
}));

app.post('/controlled-real-api/disposable-integration-probe', route(async (req,res) => {
  const baseline = await controlled.baselineSnapshot();
  const created = await controlled.createDisposableProbe(req.body || {});
  res.status(201).json({ baseline, ...created });
}));

app.post('/controlled-real-api/disposable-integration-probe/reverse', route(async (req,res) => {
  const manifest = req.body && req.body.manifest;
  const before = req.body && req.body.baseline;
  const reversed = await controlled.reverseDisposableProbe(manifest);
  const after = await controlled.baselineSnapshot();
  const comparison = controlled.compareSnapshots(before,after);
  if (!comparison.exact) throw new Error(`Post-reversal baseline mismatch: ${JSON.stringify(comparison)}`);
  res.json({ reversed, after, comparison });
}));

app.post('/controlled-real-api/persistent-real-pilot-01', route(async (req,res) => {
  const result = await persistentPilot.createPersistentRealPilot(req.body || {});
  res.status(201).json(result);
}));

app.get('/real-flow-api/capability', route(async (_req,res) => {
  await require('./staging').assertAuthorizedStaging();
  res.json({
    mode:'REAL_BOTANICAL_MATERIAL_FLOW',
    stagingOnly:true,
    supportedStages:realMaterialFlow.SUPPORTED_STAGES,
    retrospectiveEntry:true,
    newCollectionEntry:true,
    prospectionRequired:false,
    fieldVisitRequired:false,
    historyStructured:true,
    structuredPhysicalStorage:false,
    storageBlocker:'CORE_PHYSICAL_MODEL_v1 has no canonical structured physical-storage entity; fail closed instead of overloading ResourceSet.'
  });
}));

app.post('/real-flow-api/preview', route(async (req,res) => {
  res.json(realMaterialFlow.planFlow(req.body || {}));
}));

app.post('/real-flow-api/flows', route(async (req,res) => {
  const result = await realMaterialFlow.createFlow(req.body || {});
  res.status(201).json(result);
}));

app.post('/real-flow-api/resources/:id/revisions', route(async (req,res) => {
  const result = await realMaterialFlow.recordRevision(req.params.id,req.body || {});
  res.status(201).json(result);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING CONTROLLED_REAL listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
