'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { JBLROrchestrator } = require('../src/agent-runtime/orchestrator');
const { NullExternalStateAdapter } = require('../src/agent-runtime/external-state-adapter');

class FakeAdapter {
  constructor(risks = ['SAFE']) {
    this.risks = [...risks];
  }

  isConfigured() { return false; }

  async run() {
    const risk = this.risks.shift() || 'SAFE';
    return {
      mode: 'TEST',
      finalOutput: 'ok',
      usage: {
        requests: 1,
        inputTokens: risk === 'HIGH' ? 999999 : 100,
        outputTokens: 10,
        totalTokens: risk === 'HIGH' ? 1000009 : 110,
      },
      risk,
    };
  }
}

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jblr-runtime-'));
  const runtime = new JBLROrchestrator({
    rootDir: root,
    adapter: new FakeAdapter(['SAFE', 'HIGH', 'SAFE']),
    externalAdapter: new NullExternalStateAdapter(),
  });

  await runtime.initialize();

  const first = await runtime.runActor('06', 'first');
  assert.equal(first.rotated, false);

  const state1 = await runtime.store.readActorState('06');
  assert.equal(state1.actorId, '06');
  assert.equal(state1.runtimeSessionId, '06-session-000001');
  state1.nextAction = 'CONTINUE_AFTER_ROTATION';
  state1.lastEventCursor = 'JBLR-EVT-CURSOR-001';
  await runtime.store.writeActorState('06', state1);

  const second = await runtime.runActor('06', 'second');
  assert.equal(second.rotated, true);

  const state2 = await runtime.store.readActorState('06');
  assert.equal(state2.actorId, '06');
  assert.equal(state2.runtimeSessionId, '06-session-000002');
  assert.equal(state2.restoredFromSessionId, '06-session-000001');
  assert.equal(state2.contextRisk, 'SAFE');
  assert.equal(state2.lastUsage, null);
  assert.equal(state2.nextAction, 'CONTINUE_AFTER_ROTATION');
  assert.equal(state2.lastEventCursor, 'JBLR-EVT-CURSOR-001');
  assert.ok(state2.lastContinuityPackage);

  const third = await runtime.runActor('06', 'third');
  assert.equal(third.rotated, false);
  const state3 = await runtime.store.readActorState('06');
  assert.equal(state3.runtimeSessionId, '06-session-000002');
  assert.equal(state3.lastUsage.inputTokens, 100);

  const events = await runtime.store.readEvents();
  assert.equal(events.at(-1).validationState, 'ACCEPTED');
  assert.equal(events.at(-1).type, 'CONTINUITY_ROTATION');

  const actor04 = await runtime.store.readActorState('04');
  assert.equal(actor04.runtimeSessionId, null);

  console.log('JBLR autonomous runtime core tests: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
