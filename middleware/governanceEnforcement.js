/**
 * The Great Lake Bot - Governance Enforcement Middleware
 * Central safety filter implementing Rules 1-27.
 *
 * KEY RULES ENFORCED HERE:
 *   Rule 4  - Domain-Agnostic
 *   Rule 5  - Clarity First
 *   Rule 7  - Identity-Safe
 *   Rule 12 - Safety Filter
 *   Rule 22 - Nickname safety
 *   Rule 25 - Context-Boundary
 *   Rule 26 - Safety Filter for groups
 */
const config = require('../config');

const UNSAFE_PATTERNS = [
  /\b(stupid|idiot|moron|loser|worthless|incompetent|dumb)\b/i,
  /\b(love\s+you|miss\s+you|need\s+you|can't\s+live\s+without)\b/i,
  /\b(should\s+i\s+break\s+up|divorce|dating\s+advice)\b/i,
  /\b(kill|murder|suicide|self[- ]?harm|bomb|threat)\b/i,
];

const PERSONA_PATTERNS = [
  /\b(pretend\s+to\s+be|act\s+as\s+if|roleplay\s+as|you\s+are\s+now)\b/i,
];

function scanText(text) {
  if (typeof text !== 'string') return { safe: true, violation: null };

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        safe: false,
        violation: 'Content violates The Great Lake Bot safety filter (Rules 7, 12, 26): matched pattern "' + pattern.source + '"',
      };
    }
  }

  for (const pattern of PERSONA_PATTERNS) {
    if (pattern.test(text)) {
      return {
        safe: false,
        violation: 'Content violates The Great Lake Bot identity safety (Rule 7): persona-based language detected',
      };
    }
  }

  return { safe: true, violation: null };
}

function deepScan(obj) {
  if (typeof obj === 'string') return scanText(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = deepScan(item);
      if (!result.safe) return result;
    }
    return { safe: true, violation: null };
  }
  if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      const result = deepScan(value);
      if (!result.safe) return result;
    }
    return { safe: true, violation: null };
  }
  return { safe: true, violation: null };
}

function enforceFieldLength(value, maxLength, fieldName) {
  if (typeof value === 'string' && value.length > maxLength) {
    return {
      valid: false,
      error: 'Field "' + fieldName + '" exceeds maximum length of ' + maxLength + ' characters (Governance Rule 3/5).',
    };
  }
  return { valid: true };
}

function safetyFilter(req, res, next) {
  if (req.body && Object.keys(req.body).length > 0) {
    const result = deepScan(req.body);
    if (!result.safe) {
      return res.status(422).json({
        error: 'Governance violation',
        details: result.violation,
      });
    }
  }
  next();
}

function fieldLengthEnforcer(fieldLimits) {
  return (req, res, next) => {
    if (!req.body) return next();
    for (const [field, maxLen] of Object.entries(fieldLimits)) {
      if (req.body[field] !== undefined) {
        const check = enforceFieldLength(req.body[field], maxLen, field);
        if (!check.valid) {
          return res.status(422).json({
            error: 'Governance violation',
            details: check.error,
          });
        }
      }
    }
    next();
  };
}

function clarityFirstFilter(req, res, next) {
  if (req.body) {
    const textFields = Object.entries(req.body).filter(([, v]) => typeof v === 'string');
    for (const [key, text] of textFields) {
      if (text.trim().length === 0) {
        return res.status(422).json({
          error: 'Governance violation',
          details: 'Field "' + key + '" is empty or whitespace-only. The Great Lake Bot requires substantive, clarity-first input (Rule 5).',
        });
      }
    }
  }
  next();
}

module.exports = {
  scanText,
  deepScan,
  enforceFieldLength,
  safetyFilter,
  fieldLengthEnforcer,
  clarityFirstFilter,
};
