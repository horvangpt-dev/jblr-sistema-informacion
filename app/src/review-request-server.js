const { app, startServer } = require('./quality-review-server');
const { pool } = require('./db');
const review = require('./review-request');

function clientError(message) {
  return /required|invalid|not found|missing|must|restricted|conflicts|duplicate|MVP13|fail-closed|unauthorized/i.test(message || '');
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unexpected error';
      if (!clientError(message)) console.error('MVP13 request error:', message);
      res.status(clientError(message) ? 400 : 500).json({
        error: clientError(message) ? message : 'Internal server error'
      });
    }
  };
}

app.get('/mvp13-api/regional-assertions/:id/review', route(async (req,res) => {
  res.json(await review.listRegionalReview(req.params.id));
}));

app.post('/mvp13-api/regional-assertions/:id/request-review', route(async (req,res) => {
  const detail = await review.requestRegionalReview(req.params.id);
  res.status(detail.created ? 201 : 200).json(detail);
}));

app.get('/mvp13-api/validation-events/:id', route(async (req,res) => {
  const detail = await review.getValidationEvent(req.params.id);
  if (!detail) return res.status(404).json({error:'ValidationEvent not found'});
  res.json(detail);
}));

if (require.main === module) {
  startServer().then((httpServer) => {
    console.log(`JBLR STAGING MVP13 listening on http://127.0.0.1:${httpServer.address().port}`);
  }).catch((err) => {
    console.error(err.message);
    pool.end().finally(() => process.exit(1));
  });
}

module.exports = { app, startServer };
