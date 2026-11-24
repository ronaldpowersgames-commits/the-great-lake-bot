(function (global) {
  'use strict';

  // Export timestamps are local wall times. Include the original text and leave the zone unknown.
  const stamp = /^(?:\[)?(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?m\.?)?)(?:\]\s*|\s+-\s+)(.*)$/i;
  function dateParts(date, clock, order) {
    const fields = date.split(/[./-]/).map(Number);
    let year = fields[order.indexOf('y')];
    const month = fields[order.indexOf('m')];
    const day = fields[order.indexOf('d')];
    if (year < 100) year += 2000;
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.?m\.?)?$/i.exec(clock);
    const [, hour, minute, second, meridiem] = match;
    let h = Number(hour);
    if (meridiem) {
      if (h < 1 || h > 12) return null;
      h = h % 12 + (meridiem.toLowerCase() === 'p' ? 12 : 0);
    }
    const utc = new Date(Date.UTC(year, month - 1, day, h, Number(minute), Number(second || 0)));
    if (!Number.isFinite(utc.getTime()) || utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month ||
        utc.getUTCDate() !== day || utc.getUTCHours() !== h) return null;
    return utc.toISOString().slice(0, 19);
  }

  function parseExport(input, order) {
    if (!['mdy', 'dmy', 'ymd'].includes(order)) throw new Error('Choose a supported date order.');
    const records = [];
    let current;
    for (const [i, raw] of input.split(/\r?\n/).entries()) {
      const line = raw.replace(/^[\u200e\u200f\ufeff]+/, '');
      const match = stamp.exec(line);
      if (!match) {
        if (current && line) current.text += '\n' + line;
        continue;
      }
      const [, date, clock, body] = match;
      const splitter = body.indexOf(': ');
      current = {
        id: i + 1, timestamp: dateParts(date, clock, order),
        originalTimestamp: date + ' ' + clock,
        participant: splitter >= 0 ? body.slice(0, splitter) : null,
        text: splitter >= 0 ? body.slice(splitter + 2) : body
      };
      records.push(current);
    }
    return records;
  }

  if (typeof module === 'object' && module.exports) module.exports = { parseExport };
  else global.LakeWhatsAppExport = { parseExport };
})(globalThis);
