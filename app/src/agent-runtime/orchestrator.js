'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ACTORS, getActor } = require('./actor-registry');
const { RuntimeStore, nowIso } = require('./runtime-store');
const { OpenAIAgentAdapter } = require('./openai-agent-adapter');
const { createContinuityPackage } = require('./continuity');

class JBLROrchestrator {
  constructor({
    rootDir = process.env.JBLR_RUNTIME_STATE_DIR || path.join(process.cwd(), '.runtime-state'),
    adapter,
  } = {}) {
    this.store = new RuntimeStore(rootDir);
    this.adapter = adapter || new OpenAIAgentAdapter();
  }

  async initialize() {
    for (const actor of Object.values(ACTORS)) await this.store.initActor(actor);
    return this.status();
  }

  async status() {
    const actors = {};
    for (const actor of Object.values(ACTORS)) {
      actors[actor.id] = await this.store.readActorState(actor.id);
    }
    return {
      mode: this.adapter.isConfigured() ? 'REAL_OPENAI_AVAILABLE' : 'DEGRADED_NO_OPENAI_KEY',
      actors,
      canonicalState: await this.store.readCanonicalState(),
      events: await this.store.readEvents(),
    };
  }

  async ensureSession(actorId) {
    const actor = getActor(actorId);
    let state = await this.store.readActorState(actor.id);
    if (!state.runtimeSessionId) ({ state } = await this.store.createSession(actor.id, 'AUTO_OPEN'));
    return {
      actor,
      state,
      sessionDir: path.join(this.store.actorDir(actor.id), 'sessions', state.runtimeSessionId),
    };
  }

  async rotate(actorId, reason = 'SATURATION_HIGH') {
    const actor = getActor(actorId);
    const state = await this.store.readActorState(actor.id);
    if (!state.runtimeSessionId) return this.store.createSession(actor.id, 'ROTATION_WITHOUT_ACTIVE_SESSION');

    const oldSessionId = state.runtimeSessionId;
    const sessionDir = path.join(this.store.actorDir(actor.id), 'sessions', oldSessionId);
    let items = [];
    try {
      const raw = fs.readFileSync(path.join(sessionDir, 'session-items.json'), 'utf8');
      items = JSON.parse(raw).items || [];
    } catch (_) {
      items = [];
    }

    const canonicalState = await this.store.readCanonicalState();
    const events = await this.store.readEvents();
    const continuity = await createContinuityPackage({
      store: this.store,
      actor,
      state,
      reason,
      sessionItems: items,
      canonicalState,
      events,
    });

    await this.store.closeSession(actor.id, oldSessionId, reason);
    const opened = await this.store.createSession(actor.id, `RESTORED_FROM_${oldSessionId}`);
    const newState = opened.state;
    newState.nextAction = state.nextAction;
    newState.lastEventCursor = state.lastEventCursor;
    newState.contextRisk = 'SAFE';
    newState.restoredFromSessionId = oldSessionId;
    newState.lastContinuityPackage = continuity.packageDir;
    newState.updatedAt = nowIso();
    await this.store.writeActorState(actor.id, newState);

    await this.store.appendEvent({
      originActor: actor.id,
      type: 'CONTINUITY_ROTATION',
      subject: `${oldSessionId}->${newState.runtimeSessionId}`,
      validationState: 'ACCEPTED',
      canonicalEffect: 'SESSION_REPLACED_ACTOR_IDENTITY_PRESERVED',
      evidencePointer: continuity.packageDir,
    });

    return {
      continuity,
      oldSessionId,
      newSessionId: newState.runtimeSessionId,
      state: newState,
    };
  }

  async runActor(actorId, input, localContext = {}) {
    let current = await this.ensureSession(actorId);

    if (current.state.contextRisk === 'HIGH') {
      await this.rotate(actorId, 'PRE_RUN_HIGH_RISK');
      current = await this.ensureSession(actorId);
    }

    const result = await this.adapter.run({
      actor: current.actor,
      state: current.state,
      input,
      sessionDir: current.sessionDir,
      localContext,
    });

    if (result.mode === 'ROTATION_REQUIRED_BEFORE_RUN') {
      const rotation = await this.rotate(actorId, 'ADAPTER_PRE_RUN_HIGH_RISK');
      return {
        actorId: current.actor.id,
        rotated: true,
        rotation,
        execution: null,
        nextInstruction: 'RETRY_INPUT_ON_NEW_SESSION',
      };
    }

    const latest = await this.store.readActorState(actorId);
    latest.lastRunAt = nowIso();
    latest.lastUsage = result.usage;
    latest.contextRisk = result.risk;
    latest.updatedAt = nowIso();
    await this.store.writeActorState(actorId, latest);

    if (result.risk === 'HIGH') {
      const rotation = await this.rotate(actorId, 'POST_RUN_HIGH_RISK');
      return {
        actorId: current.actor.id,
        rotated: true,
        rotation,
        execution: result,
      };
    }

    if (result.risk === 'ELEVATED') {
      await this.store.appendEvent({
        originActor: actorId,
        type: 'CONTEXT_RISK',
        subject: latest.runtimeSessionId,
        validationState: 'ACCEPTED',
        canonicalEffect: 'ELEVATED_MINIMIZE_GROWTH_PERSIST_STATE',
        evidencePointer: null,
      });
    }

    return {
      actorId: current.actor.id,
      rotated: false,
      execution: result,
      state: latest,
    };
  }
}

module.exports = { JBLROrchestrator };
