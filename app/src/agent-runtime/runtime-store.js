'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function nowIso() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

class RuntimeStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  actorDir(actorId) { return path.join(this.rootDir, 'actors', String(actorId)); }
  actorStatePath(actorId) { return path.join(this.actorDir(actorId), 'actor-state.json'); }
  canonicalPath() { return path.join(this.rootDir, 'canonical-state.json'); }
  eventBusPath() { return path.join(this.rootDir, 'event-bus.jsonl'); }

  async initActor(actor) {
    await fs.mkdir(this.actorDir(actor.id), { recursive: true });
    try {
      return await this.readActorState(actor.id);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const state = {
      actorId: actor.id,
      actorName: actor.name,
      role: actor.role,
      status: 'ACTIVE',
      runtimeSessionId: null,
      sessionSequence: 0,
      sessions: [],
      nextAction: null,
      lastEventCursor: null,
      lastRunAt: null,
      lastUsage: null,
      contextRisk: 'SAFE',
      updatedAt: nowIso(),
    };
    await this.writeActorState(actor.id, state);
    return state;
  }

  async readJson(filePath, fallback) {
    try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
      throw error;
    }
  }

  async writeJsonAtomic(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2));
    await fs.rename(tmp, filePath);
  }

  readActorState(actorId) { return this.readJson(this.actorStatePath(actorId)); }
  writeActorState(actorId, state) { return this.writeJsonAtomic(this.actorStatePath(actorId), state); }
  readCanonicalState() { return this.readJson(this.canonicalPath(), { version: 1, values: {}, updatedAt: null }); }
  writeCanonicalState(state) { return this.writeJsonAtomic(this.canonicalPath(), state); }

  async appendEvent(event) {
    await fs.mkdir(this.rootDir, { recursive: true });
    const normalized = {
      eventId: event.eventId || id('JBLR-EVT-RUNTIME'),
      timestamp: event.timestamp || nowIso(),
      validationState: 'PROPOSED',
      ...event,
    };
    await fs.appendFile(this.eventBusPath(), `${JSON.stringify(normalized)}\n`);
    return normalized;
  }

  async readEvents() {
    try {
      const raw = await fs.readFile(this.eventBusPath(), 'utf8');
      return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async replaceExternalEvents(events) {
    await fs.mkdir(this.rootDir, { recursive: true });
    const lines = (events || []).map(event => JSON.stringify(event)).join('\n');
    await fs.writeFile(this.eventBusPath(), lines ? `${lines}\n` : '');
  }

  async createSession(actorId, reason = 'INITIAL') {
    const state = await this.readActorState(actorId);
    const seq = (state.sessionSequence || 0) + 1;
    const sessionId = `${actorId}-session-${String(seq).padStart(6, '0')}`;
    const sessionDir = path.join(this.actorDir(actorId), 'sessions', sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    const session = { sessionId, sequence: seq, openedAt: nowIso(), closedAt: null, reason, status: 'ACTIVE' };
    state.sessionSequence = seq;
    state.runtimeSessionId = sessionId;
    state.sessions = [...(state.sessions || []), session];
    state.updatedAt = nowIso();
    await this.writeActorState(actorId, state);
    return { state, session, sessionDir };
  }

  async closeSession(actorId, sessionId, reason) {
    const state = await this.readActorState(actorId);
    state.sessions = (state.sessions || []).map(s => s.sessionId === sessionId ? { ...s, status: 'CLOSED', closedAt: nowIso(), closeReason: reason } : s);
    if (state.runtimeSessionId === sessionId) state.runtimeSessionId = null;
    state.updatedAt = nowIso();
    await this.writeActorState(actorId, state);
    return state;
  }
}

module.exports = { RuntimeStore, nowIso };
