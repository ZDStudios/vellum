// Vellum AI Assistant — zero-dependency proxy to the Anthropic Messages API.
// The API key lives only on the server (never shipped to the browser).
// Configure with:  ANTHROPIC_API_KEY=sk-ant-...   (optional: VELLUM_AI_MODEL)
const MODEL = process.env.VELLUM_AI_MODEL || 'claude-opus-4-8';
const key = () => process.env.ANTHROPIC_API_KEY;

const SYSTEM = `You are the Vellum Assistant, a helpful writing and productivity companion built into Vellum — a clean, open-source document workspace with docs, tasks and a calendar.
Help the user write, edit, rewrite, summarise, outline, brainstorm and answer questions. Keep replies concise, warm and well-structured; use short paragraphs or bullet points. When the user is viewing a document, its text is provided for context — use it when relevant.`;

async function chat({ prompt, doc, history } = {}) {
  if (!key()) {
    return {
      configured: false,
      reply:
        "The AI assistant isn't configured yet. Set an ANTHROPIC_API_KEY environment variable on the Vellum server " +
        '(grab one at console.anthropic.com), then restart. Optionally set VELLUM_AI_MODEL to choose a model ' +
        '(default: claude-opus-4-8).',
    };
  }

  let system = SYSTEM;
  if (doc && Array.isArray(doc.content)) {
    const text = doc.content.map((b) => b.text).filter(Boolean).join('\n').slice(0, 6000);
    if (text) system += `\n\nThe user is currently viewing a document titled "${doc.title || 'Untitled'}":\n"""\n${text}\n"""`;
  }

  const messages = [];
  for (const m of (Array.isArray(history) ? history : []).slice(-8)) {
    if (m && m.role && m.content) messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) });
  }
  messages.push({ role: 'user', content: String(prompt || '') });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2048, system, messages }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { configured: true, error: true, reply: `Assistant error: ${(j.error && j.error.message) || res.status}` };
    if (j.stop_reason === 'refusal') return { configured: true, reply: "I'm not able to help with that request." };
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { configured: true, reply: text || '(no response)' };
  } catch (e) {
    return { configured: true, error: true, reply: `Assistant error: ${e.message}` };
  }
}

module.exports = { chat, MODEL };
