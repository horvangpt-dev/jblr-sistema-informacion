'use strict';

const path = require('node:path');
const { FileSession } = require('./file-session');

class OpenAIAgentAdapter {
  constructor({
    model = process.env.JBLR_AGENT_MODEL || 'gpt-5.6',
    elevatedInputTokens = process.env.JBLR_CONTEXT_ELEVATED_INPUT_TOKENS || 60000,
    highInputTokens = process.env.JBLR_CONTEXT_HIGH_INPUT_TOKENS || 90000,
    compactionItems = process.env.JBLR_CONTEXT_COMPACTION_ITEMS || 100,
    elevatedItems = process.env.JBLR_CONTEXT_ELEVATED_ITEMS || 120,
    highItems = process.env.JBLR_CONTEXT_HIGH_ITEMS || 180,
  } = {}) {
    this.model = model;
    this.elevatedInputTokens = Number(elevatedInputTokens);
    this.highInputTokens = Number(highInputTokens);
    this.compactionItems = Number(compactionItems);
    this.elevatedItems = Number(elevatedItems);
    this.highItems = Number(highItems);
  }

  isConfigured() { return Boolean(process.env.OPENAI_API_KEY); }

  classifyRisk({ inputTokens = 0, sessionItemCount = 0 }) {
    if (inputTokens >= this.highInputTokens || sessionItemCount >= this.highItems) return 'HIGH';
    if (inputTokens >= this.elevatedInputTokens || sessionItemCount >= this.elevatedItems) return 'ELEVATED';
    return 'SAFE';
  }

  async run({ actor, state, input, sessionDir, localContext = {} }) {
    if (!this.isConfigured()) {
      return {
        mode: 'DEGRADED_NO_OPENAI_KEY',
        finalOutput: null,
        usage: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        risk: 'SAFE',
      };
    }

    const sdk = await import('@openai/agents');
    const underlyingSession = new FileSession({
      sessionId: state.runtimeSessionId,
      filePath: path.join(sessionDir, 'session-items.json'),
    });

    const compactionSession = new sdk.OpenAIResponsesCompactionSession({
      underlyingSession,
      model: this.model,
      compactionMode: 'input',
      shouldTriggerCompaction: ({ sessionItems }) => sessionItems.length >= this.compactionItems,
    });

    const itemsBefore = await underlyingSession.getItems();
    const preRisk = this.classifyRisk({
      inputTokens: state.lastUsage?.inputTokens || 0,
      sessionItemCount: itemsBefore.length,
    });
    if (preRisk === 'HIGH') {
      return {
        mode: 'ROTATION_REQUIRED_BEFORE_RUN',
        finalOutput: null,
        usage: state.lastUsage || null,
        risk: 'HIGH',
      };
    }

    const agent = new sdk.Agent({
      name: `JBLR ${actor.id} ${actor.name}`,
      instructions: actor.instructions,
      model: this.model,
    });

    const result = await sdk.run(agent, input, {
      session: compactionSession,
      context: {
        actorId: actor.id,
        nextAction: state.nextAction,
        lastEventCursor: state.lastEventCursor,
        ...localContext,
      },
    });

    const usage = result.state.usage;
    const itemsAfter = await underlyingSession.getItems();
    const risk = this.classifyRisk({
      inputTokens: usage.inputTokens,
      sessionItemCount: itemsAfter.length,
    });

    return {
      mode: 'REAL_OPENAI',
      finalOutput: result.finalOutput,
      lastResponseId: result.lastResponseId || null,
      usage: {
        requests: usage.requests,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      },
      risk,
      sessionItems: itemsAfter,
    };
  }
}

module.exports = { OpenAIAgentAdapter };
