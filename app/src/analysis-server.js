const { app, startServer } = require('./external-data-server');
const { pool } = require('./db');
const analysisFlow = require('./analysis-flow');

function clientError(message) {
  return /required|invalid|not found|missing|must|synthetic|conflicts|restricted|accepted baseline|duplicate/i.test(message || '');
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP10 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({
        error: clientError(message) ? message : 'Internal server error'
      });
    }
  };
}

app.get('/mvp10-api/taxa/:id/analyses', route(async (req,res) => {
  const detail = await analysisFlow.getTaxonAnalyses(req.params.id);
  if (!detail) return res.status(404).json({error:'TaxonConcept not found'});
  res.json(detail);
}));

app.post('/mvp10-api/taxa/:id/analysis-demo', route(async (req,res) => {
  const detail = await analysisFlow.createOrReuseAnalysis(req.params.id);
  const createdAny = Object.values(detail.created).some(Boolean);
  res.status(createdAny ? 201 : 200).json(detail);
}));

app.get('/mvp10-api/analysis-runs/:id', route(async (req,res) => {
  const detail = await analysisFlow.getAnalysisRunDetail(req.params.id);
  if (!detail) return res.status(404).json({error:'AnalysisRun not found'});
  res.json(detail);
}));

app.get('/mvp10-api/analysis-results/:id', route(async (req,res) => {
  const detail = await analysisFlow.getAnalysisResultDetail(req.params.id);
  if (!detail) return res.status(404).json({error:'AnalysisResult not found'});
  res.json(detail);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP10 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
