/* ============================================================
 *  AXION Search v5 — AI layer (Google AI Studio)
 *
 *  - 3 distinct API keys rotated round-robin (rate-limit guard).
 *  - 2 models rotated automatically: gemma-4-31b-it, gemma-4-26b-a4b-it
 *  - NO user model selection: backend routes & rotates by itself.
 *  - All calls are async/non-blocking (I/O wait excluded from CPU time).
 * ============================================================ */

import { LANG_NAME } from './util.js';

const AI_MODELS = ['gemma-4-31b-it', 'gemma-4-26b-a4b-it'];
const OUTBOUND_TIMEOUT_MS = 30000;

export class AIService {
  constructor(env) {
    this.keys = [env.AI_KEY_1, env.AI_KEY_2, env.AI_KEY_3].filter(Boolean);
    this.keyIdx = 0;
    this.modelIdx = 0;
  }
  get enabled() { return this.keys.length > 0; }

  _nextKey() {
    const k = this.keys[this.keyIdx % this.keys.length];
    this.keyIdx++;
    return k;
  }
  _nextModel() {
    const m = AI_MODELS[this.modelIdx % AI_MODELS.length];
    this.modelIdx++;
    return m;
  }

  async generate(prompt) {
    if (!this.enabled) { const e = new Error('AI not configured'); e.code = 'NO_KEY'; throw e; }
    let lastErr = null;
    // Try each key once (round-robin); on 429/quota move to the next key.
    for (let attempt = 0; attempt < this.keys.length; attempt++) {
      const key = this._nextKey();
      const model = this._nextModel();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), OUTBOUND_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 900 }
          }),
          signal: ctrl.signal
        });
        clearTimeout(t);
        if (res.status === 429 || res.status === 500) { lastErr = new Error(`upstream ${res.status}`); continue; }
        if (!res.ok) { const e = new Error(`AI HTTP ${res.status}`); e.code = 'AI_FAIL'; throw e; }
        const data = await res.json();
        const text = (data?.candidates?.[0]?.content?.parts || [])
          .map(p => p.text).filter(Boolean).join('').trim();
        if (!text) { lastErr = new Error(data?.error?.message || 'empty AI reply'); continue; }
        return { text, model };
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
        if (e?.name === 'AbortError') continue;
        throw e;
      }
    }
    throw lastErr || new Error('all AI keys exhausted');
  }

  /* Grounded summary — answers ONLY from the supplied web results. */
  async summarize(query, webResults, langCode) {
    if (!webResults || !webResults.length) {
      return { summary: null, ai: false, reason: 'no_web_results', model: null };
    }
    const lang = LANG_NAME[langCode] || 'English';
    const ctx = webResults.slice(0, 10)
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet || ''}\n${r.link}`).join('\n\n');
    const prompt =
      `You are AXION, a search assistant. Answer ONLY using the context below. ` +
      `If the context does not contain the answer, say so explicitly in ${lang} — do NOT invent facts, numbers, or sources. ` +
      `Cite by number like [1]. Reply in ${lang}. Be concise (max 3 short paragraphs).\n` +
      `Query: "${query}"\nContext:\n${ctx}\nAnswer in ${lang}:`;
    const { text, model } = await this.generate(prompt);
    return { summary: text, model, ai: true };
  }

  /* Chat mode — re-searches the latest user message for fresh grounding. */
  async chat(messages, webResults, langCode) {
    const lang = LANG_NAME[langCode] || 'English';
    const ctx = webResults.slice(0, 8)
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet || ''}\n${r.link}`).join('\n\n')
      || '(no web results found — tell the user you could not find sources and answer generally, clearly marking uncertainty)';
    const history = messages.slice(-6)
      .map(m => `${m.role === 'user' ? 'User' : 'AXION'}: ${m.content}`).join('\n');
    const prompt =
      `You are AXION, a helpful search assistant chatting in ${lang}. ` +
      `Use the fresh web context below to answer the user's latest message. ` +
      `Cite sources by number like [1]. If context is insufficient, say so — never invent. ` +
      `Keep replies concise and in ${lang}.\n\nFresh web context:\n${ctx}\n\nConversation:\n${history}\n\nAXION (in ${lang}):`;
    const { text, model } = await this.generate(prompt);
    return { reply: text, model, sources: webResults.slice(0, 8), webCount: webResults.length };
  }
}
