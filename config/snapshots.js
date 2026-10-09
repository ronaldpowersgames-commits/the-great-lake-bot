function object(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}
const text = { type: 'string' };
const list = items => ({ type: 'array', items });
const statement = object({
  statement: text,
  kind: { type: 'string', enum: ['user_stated', 'observed', 'tentative_interpretation'] },
  sources: list(text),
  confidence: { type: 'string', enum: ['confirmed', 'tentative', 'unknown'] }
});
const schema = object({
  scope: { type: 'string', enum: ['chat', 'total', 'both'] },
  coverage: object({ source_session_ids: list(text), limitations: list(text) }),
  user_context: list(statement),
  people: list(object({ name: text, aliases: list(text), confirmed_identity: { type: 'boolean' }, context: list(statement) })),
  conversation: object({ summary: text, decisions: list(statement), open_questions: list(text), unfinished_work: list(text) }),
  total_context: object({ summary: text, patterns: list(statement), preferences: list(statement) }),
  contribution_to_total: list(statement),
  resume: object({ active_topic: text, last_user_intent: text, next_step: text, avoid: list(text) })
});

function conforms(value, shape) {
  if (shape.type === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every(key => Object.hasOwn(shape.properties, key)) &&
      shape.required.every(key => conforms(value[key], shape.properties[key]));
  }
  if (shape.type === 'array') return Array.isArray(value) && value.every(item => conforms(item, shape.items));
  return typeof value === shape.type && (!shape.enum || shape.enum.includes(value));
}

module.exports = {
  responseFormat: { type: 'json_schema', json_schema: { name: 'lake_ai_handoff', strict: true, schema } },
  parse(content, scope) {
    const handoff = JSON.parse(content);
    if (!conforms(handoff, schema) || handoff.scope !== scope) throw new Error('Invalid AI handoff structure');
    return handoff;
  }
};
