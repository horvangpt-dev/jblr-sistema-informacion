'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { nowIso } = require('./runtime-store');

function sanitize(value) {
  if (value == null) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[SECRETO_REDACTADO]')
    .replace(/(?:token|api[_-]?key|password)\s*[:=]\s*[^\s,;]+/gi, '[SECRETO_REDACTADO]');
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, filePath);
}

async function createContinuityPackage({ store, actor, state, reason, sessionItems, canonicalState, events }) {
  const stamp = nowIso().replace(/[:.]/g, '-');
  const packageDir = path.join(store.actorDir(actor.id), 'continuity', stamp);
  await fs.mkdir(packageDir, { recursive: true });

  const transcript = {
    transcriptCompleteness: 'COMPLETE',
    actorId: actor.id,
    runtimeSessionId: state.runtimeSessionId,
    capturedAt: nowIso(),
    items: (sessionItems || []).map(item => sanitize(item)),
  };

  const continuity = {
    continuityPackageState: 'COMPLETE',
    actorId: actor.id,
    actorName: actor.name,
    authorityRole: actor.role,
    reason,
    runtimeSessionId: state.runtimeSessionId,
    nextAction: state.nextAction,
    lastEventCursor: state.lastEventCursor,
    contextRisk: state.contextRisk,
    canonicalStateSnapshot: canonicalState,
    eventTail: (events || []).slice(-50),
    activeInstructions: sanitize(actor.instructions),
    createdAt: nowIso(),
    invariants: [
      'REALITY_FIRST=ACTIVE',
      'NO_SILENT_INFERENCE=ACTIVE',
      'TRASPASO=COPY_NEVER_MOVE',
      'unknown!=zero',
      'unknown!=absence',
      'not_found!=absence',
      'reference!=assertion',
      'assertion!=validated_fact',
    ],
  };

  const restorationPrompt = {
    restorationPromptState: 'READY',
    actorId: actor.id,
    instruction: `Continue as persistent JBLR actor ${actor.id} (${actor.name}); this is not a new project. Restore canonical state, event bus cursor and NEXT_ACTION before substantive work.`,
    nextAction: state.nextAction,
    continuityPackageDir: packageDir,
    createdAt: nowIso(),
  };

  await writeJsonAtomic(path.join(packageDir, 'CHAT_COMPLETO.json'), transcript);
  await writeJsonAtomic(path.join(packageDir, 'CONTINUIDAD_INTEGRAL.json'), continuity);
  await writeJsonAtomic(path.join(packageDir, 'PROMPT_CONTINUIDAD.json'), restorationPrompt);

  return { packageDir, transcript, continuity, restorationPrompt };
}

module.exports = { createContinuityPackage };
