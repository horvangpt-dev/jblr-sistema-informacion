'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { JBLROrchestrator } = require('../src/agent-runtime/orchestrator');
const { GitHubRuntimeAdapter } = require('../src/agent-runtime/github-runtime-adapter');
const { toObjects, normalizeEvents } = require('../src/agent-runtime/external-state-adapter');

class RecordingAdapter {
  constructor(delayMs = 0) { this.calls = []; this.delayMs = delayMs; }
  isConfigured() { return false; }
  async run(args) {
    this.calls.push(args);
    if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return {
      mode: 'TEST',
      finalOutput: 'ok',
      usage: { requests: 1, inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      risk: 'SAFE',
    };
  }
}

class FakeExternalAdapter {
  constructor() { this.syncCalls = 0; }
  isConfigured() { return true; }
  async syncBeforeRun({ actorId, store }) {
    this.syncCalls += 1;
    const canonicalState = { version: 1, values: { REALITY_FIRST: { value: 'ACTIVE' } }, updatedAt: new Date().toISOString() };
    const allEvents = [
      { eventId: 'E1', validationState: 'ACCEPTED', subject: 'accepted' },
      { eventId: 'E2', validationState: 'PENDING_0000', subject: 'pending' },
    ];
    await store.writeCanonicalState(canonicalState);
    await store.replaceExternalEvents(allEvents);
    const latest = await store.readActorState(actorId);
    latest.lastEventCursor = 'E2';
    await store.writeActorState(actorId, latest);
    return { mode: 'TEST_EXTERNAL', canonicalState, events: [allEvents[0]], latestCursor: 'E2' };
  }
  async publishRuntimeEvent() { return { written: false }; }
  async persistContinuityPackage() { return { written: false }; }
}

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jblr-runtime-integration-'));
  const model = new RecordingAdapter(25);
  const external = new FakeExternalAdapter();
  const runtime = new JBLROrchestrator({ rootDir: root, adapter: model, externalAdapter: external });
  await runtime.initialize();

  const result = await runtime.runActor('04', 'design');
  assert.equal(result.externalSync.latestCursor, 'E2');
  assert.equal(model.calls[0].localContext.canonicalState.values.REALITY_FIRST.value, 'ACTIVE');
  assert.deepEqual(model.calls[0].localContext.acceptedEvents.map(event => event.eventId), ['E1']);
  assert.equal(model.calls[0].localContext.lastEventCursor, 'E2');

  const concurrent = await Promise.all([
    runtime.runActor('06', 'one'),
    runtime.runActor('06', 'two'),
  ]);
  assert.equal(concurrent[0].state.runtimeSessionId, '06-session-000001');
  assert.equal(concurrent[1].state.runtimeSessionId, '06-session-000001');
  const state = await runtime.store.readActorState('06');
  assert.equal(state.sessionSequence, 1);

  const parsedRows = toObjects([
    ['EVENT_ID', 'VALIDATION_STATE', 'CANONICAL_EFFECT', 'NOTES', 'CANONICAL_EFFECT', 'SOURCE_DOCUMENT_ID', 'INGESTED_AT', 'NOTES'],
    ['E-DUP', 'ACCEPTED', 'PRIMARY_EFFECT', 'primary note', 'LEGACY_EFFECT', 'DOC-001', '2026-08-20T21:59:25+02:00', 'secondary note'],
  ]);
  const parsedEvent = normalizeEvents(parsedRows)[0];
  assert.equal(parsedEvent.canonicalEffect, 'PRIMARY_EFFECT');
  assert.equal(parsedEvent.legacyCanonicalEffect, 'LEGACY_EFFECT');
  assert.equal(parsedEvent.notes, 'primary note');
  assert.equal(parsedEvent.sourceDocumentId, 'DOC-001');
  assert.equal(parsedEvent.ingestedAt, '2026-08-20T21:59:25+02:00');
  assert.equal(parsedEvent.secondaryNotes, 'secondary note');

  const github = new GitHubRuntimeAdapter({ repo: 'example/repo', token: null });
  const degraded = await github.readBranch('main');
  assert.equal(degraded.mode, 'DEGRADED_NO_GITHUB_TOKEN');
  await assert.rejects(() => github.write(), error => error.code === 'GITHUB_RUNTIME_WRITE_PROHIBITED');

  console.log('JBLR external sync/runtime QA candidate: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
