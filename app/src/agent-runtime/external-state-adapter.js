'use strict';

const crypto = require('node:crypto');

const DEFAULT_EVENT_BUS_ID = '1ooGUwDYQ5Q_nR6ctvrMx1kS1ESaJVmNDsyizLeXRMNs';
const DEFAULT_CANONICAL_STATE_ID = '1UhIkAmCNLVJibUUhbAogyU8EtzUsNOsIqdkEdfS_KMo';

function toObjects(values = []) {
  if (!values.length) return [];
  const seen = new Map();
  const headers = values[0].map(value => {
    const base = String(value || '').trim();
    if (!base) return '';
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}__${count}`;
  });
  return values.slice(1).filter(row => row.some(value => value !== '' && value != null)).map(row => {
    const out = {};
    headers.forEach((header, index) => {
      if (!header) return;
      out[header] = row[index] ?? '';
    });
    return out;
  });
}

function canonicalSnapshot(rows) {
  const values = {};
  for (const row of rows) {
    const key = row.STATE_KEY;
    if (!key) continue;
    values[key] = {
      value: row.STATE_VALUE ?? null,
      scope: row.SCOPE ?? null,
      status: row.STATUS ?? null,
      effectiveAt: row.EFFECTIVE_AT ?? null,
      sourcePointer: row.SOURCE_POINTER ?? null,
      validatedBy: row.VALIDATED_BY ?? null,
      modelVersion: row.MODEL_VERSION ?? null,
      notes: row.NOTES ?? null,
    };
  }
  return { version: 1, values, updatedAt: new Date().toISOString() };
}

function normalizeEvents(rows) {
  return rows.map(row => ({
    eventId: row.EVENT_ID || null,
    timestamp: row.TIMESTAMP || null,
    originActor: row.ORIGIN_ACTOR || null,
    originChatInstance: row.ORIGIN_CHAT_INSTANCE || null,
    type: row.TYPE || null,
    subject: row.SUBJECT || null,
    validationState: row.VALIDATION_STATE || null,
    canonicalEffect: row.CANONICAL_EFFECT || null,
    evidencePointer: row.EVIDENCE_POINTER || null,
    sourceVersion: row.SOURCE_VERSION || null,
    supersedesEventId: row.SUPERSEDES_EVENT_ID || null,
    notes: row.NOTES || null,
    legacyCanonicalEffect: row.CANONICAL_EFFECT__2 || null,
    sourceDocumentId: row.SOURCE_DOCUMENT_ID || null,
    ingestedAt: row.INGESTED_AT || null,
    secondaryNotes: row.NOTES__2 || null,
  })).filter(event => event.eventId);
}

class NullExternalStateAdapter {
  isConfigured() { return false; }
  async syncBeforeRun() { return { mode: 'LOCAL_ONLY', canonicalState: null, events: [], latestCursor: null }; }
  async publishRuntimeEvent() { return { mode: 'LOCAL_ONLY', written: false }; }
  async persistContinuityPackage() { return { mode: 'LOCAL_ONLY', written: false }; }
}

class GoogleJBLRExternalStateAdapter {
  constructor({
    eventBusSpreadsheetId = process.env.JBLR_EVENT_BUS_SPREADSHEET_ID || DEFAULT_EVENT_BUS_ID,
    canonicalSpreadsheetId = process.env.JBLR_CANONICAL_STATE_SPREADSHEET_ID || DEFAULT_CANONICAL_STATE_ID,
    credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null,
    continuityFolderMapJson = process.env.JBLR_CONTINUITY_FOLDER_MAP || '{}',
  } = {}) {
    this.eventBusSpreadsheetId = eventBusSpreadsheetId;
    this.canonicalSpreadsheetId = canonicalSpreadsheetId;
    this.credentialsJson = credentialsJson;
    this.continuityFolderMapJson = continuityFolderMapJson;
    this.clients = null;
  }

  isConfigured() { return Boolean(this.credentialsJson); }

  async getClients() {
    if (this.clients) return this.clients;
    if (!this.isConfigured()) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
    const module = await import('googleapis');
    const google = module.google || module.default?.google || module.default;
    if (!google?.auth?.GoogleAuth) throw new Error('googleapis module did not expose GoogleAuth');
    const credentials = JSON.parse(this.credentialsJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });
    this.clients = {
      sheets: google.sheets({ version: 'v4', auth }),
      drive: google.drive({ version: 'v3', auth }),
    };
    return this.clients;
  }

  async readRange(spreadsheetId, range) {
    const { sheets } = await this.getClients();
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return response.data.values || [];
  }

  async syncBeforeRun({ actorId, state, store }) {
    if (!this.isConfigured()) return { mode: 'LOCAL_ONLY', canonicalState: null, events: [], latestCursor: state.lastEventCursor || null };

    const [canonicalValues, eventValues] = await Promise.all([
      this.readRange(this.canonicalSpreadsheetId, 'CANONICAL_STATE!A1:I1000'),
      this.readRange(this.eventBusSpreadsheetId, 'EVENTS!A1:P1000'),
    ]);

    const canonicalRows = toObjects(canonicalValues);
    const allEvents = normalizeEvents(toObjects(eventValues));
    const cursor = state.lastEventCursor || null;
    let startIndex = 0;
    if (cursor) {
      const cursorIndex = allEvents.findIndex(event => event.eventId === cursor);
      if (cursorIndex < 0) {
        const error = new Error(`Event cursor not found: ${cursor}`);
        error.code = 'EVENT_CURSOR_NOT_FOUND';
        throw error;
      }
      startIndex = cursorIndex + 1;
    }

    const newEvents = allEvents.slice(startIndex);
    const acceptedEvents = newEvents.filter(event => event.validationState === 'ACCEPTED');
    const latestCursor = allEvents.at(-1)?.eventId || cursor;
    const canonicalState = canonicalSnapshot(canonicalRows);

    await store.writeCanonicalState(canonicalState);
    await store.replaceExternalEvents(allEvents);

    const latestState = await store.readActorState(actorId);
    latestState.lastEventCursor = latestCursor;
    latestState.updatedAt = new Date().toISOString();
    await store.writeActorState(actorId, latestState);

    return {
      mode: 'GOOGLE_SHARED_STATE',
      canonicalState,
      events: acceptedEvents,
      observedEventCount: newEvents.length,
      acceptedEventCount: acceptedEvents.length,
      latestCursor,
    };
  }

  async publishRuntimeEvent(event) {
    if (!this.isConfigured()) return { mode: 'LOCAL_ONLY', written: false };
    const { sheets } = await this.getClients();
    const eventId = event.eventId || `JBLR-EVT-RUNTIME-${crypto.randomUUID()}`;
    const timestamp = event.timestamp || new Date().toISOString();
    const row = [[
      eventId,
      timestamp,
      event.originActor || '',
      event.originChatInstance || 'AUTONOMOUS_RUNTIME',
      event.type || 'RUNTIME_EVENT',
      event.subject || '',
      event.validationState || 'PROPOSED',
      event.canonicalEffect || '',
      event.evidencePointer || '',
      event.sourceVersion || 'JBLR_AUTONOMOUS_ACTOR_RUNTIME_v1',
      event.supersedesEventId || '',
      event.notes || '',
      event.legacyCanonicalEffect || '',
      event.sourceDocumentId || '',
      event.ingestedAt || timestamp,
      event.secondaryNotes || '',
    ]];
    await sheets.spreadsheets.values.append({
      spreadsheetId: this.eventBusSpreadsheetId,
      range: 'EVENTS!A:P',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: row },
    });
    return { mode: 'GOOGLE_SHARED_STATE', written: true, eventId };
  }

  async persistContinuityPackage({ actorId, packageDir, files }) {
    if (!this.isConfigured()) return { mode: 'LOCAL_ONLY', written: false };
    const folderMap = JSON.parse(this.continuityFolderMapJson || '{}');
    const parentId = folderMap[String(actorId)];
    if (!parentId) return { mode: 'GOOGLE_DRIVE_NO_FOLDER', written: false };

    const { drive } = await this.getClients();
    const stamp = packageDir.split(/[\\/]/).filter(Boolean).at(-1);
    const folder = await drive.files.create({
      requestBody: {
        name: stamp,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id,name',
    });

    const created = [];
    for (const file of files) {
      const response = await drive.files.create({
        requestBody: { name: file.name, parents: [folder.data.id] },
        media: { mimeType: 'application/json', body: file.body },
        fields: 'id,name',
      });
      created.push(response.data);
    }
    return { mode: 'GOOGLE_DRIVE_COPY', written: true, folderId: folder.data.id, files: created };
  }
}

function createExternalStateAdapterFromEnv() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return new GoogleJBLRExternalStateAdapter();
  return new NullExternalStateAdapter();
}

module.exports = {
  NullExternalStateAdapter,
  GoogleJBLRExternalStateAdapter,
  createExternalStateAdapterFromEnv,
  toObjects,
  canonicalSnapshot,
  normalizeEvents,
};
