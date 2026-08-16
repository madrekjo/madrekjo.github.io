import { normalize } from '../src/dedupe.js';
import { settings } from '../src/config.js';

const ARABIC_CHARS = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function checkContent(q, ctx = {}) {
  const issues = [];
  const text = (q.question || '') + ' ' + Object.values(q.options || {}).join(' ');

  if (ctx.content && typeof ctx.content === 'string' && ctx.content.trim()) {
    const threshold = settings().content_relevance_threshold ?? 0.3;
    const contentNorm = normalize(ctx.content);
    const tokens = normalize(text)
      .split(' ')
      .filter((w) => w.length >= 3);
    if (tokens.length) {
      const hits = tokens.filter((w) => contentNorm.includes(w)).length;
      const ratio = hits / tokens.length;
      if (ratio < threshold) {
        issues.push(`السؤال لا يبدو مرتبطًا بمحتوى الدرس (نسبة تطابق المحتوى ${(ratio * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%)`);
      }
    }
  }

  const totalChars = text.replace(/\s+/g, '');
  if (totalChars.length >= 10) {
    let arabic = 0;
    for (const ch of totalChars) if (ARABIC_CHARS.test(ch)) arabic++;
    const ratio = arabic / totalChars.length;
    if (ratio < 0.4) issues.push('النص لا يبدو عربيًا سليمًا (نسبة الحروف العربية منخفضة)');
  }

  if (text.includes('\uFFFD')) issues.push('يحتوي النص على حرف استبدال (�) — نص تالف');

  const repeated = text.match(/(.)\1{8,}/);
  if (repeated) issues.push('تكرار حرفي مفرط في النص');

  const unbalanced = (text.match(/\u0028/g) || []).length !== (text.match(/\u0029/g) || []).length;
  if (unbalanced) issues.push('أقواس غير متوازنة في النص');

  if (ctx.subject && ctx.subject !== 'math' && ctx.subject !== 'physics' && (q.question || '').includes('$')) {
    issues.push('نص يحتوي على صيغ LaTeX في مادة غير حسابية');
  }

  return issues;
}
