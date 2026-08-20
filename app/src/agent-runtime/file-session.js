'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

class FileSession {
  constructor({ sessionId, filePath }) {
    if (!sessionId) throw new Error('sessionId is required');
    if (!filePath) throw new Error('filePath is required');
    this.sessionId = sessionId;
    this.filePath = filePath;
  }

  getSessionId() {
    return this.sessionId;
  }

  async _read() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.items) ? parsed.items : [];
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async _write(items) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ sessionId: this.sessionId, items }, null, 2));
    await fs.rename(tmp, this.filePath);
  }

  async getItems(limit) {
    const items = await this._read();
    if (!Number.isFinite(limit) || limit <= 0 || items.length <= limit) return items;
    return items.slice(-limit);
  }

  async addItems(items) {
    const current = await this._read();
    await this._write(current.concat(items || []));
  }

  async popItem() {
    const items = await this._read();
    const item = items.pop();
    await this._write(items);
    return item;
  }

  async clearSession() {
    await this._write([]);
  }
}

module.exports = { FileSession };
