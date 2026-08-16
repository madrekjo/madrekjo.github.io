const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };

export function normalizeExponents(text) {
  return String(text).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (run, off, full) => {
    const sup = run.split('').map((ch) => SUP[ch]).join('');
    const before = full[off - 1];
    const needsCaret = before !== undefined && /[\p{L}\p{N}.]/u.test(before) && /^[\d+\-]/.test(sup);
    return needsCaret ? '^' + sup : sup;
  });
}

export function parseNumeric(text) {
  let s = normalizeExponents(text).replace(/,/g, '');
  s = s.replace(/(\d+(?:\.\d+)?)\s*[×x*]\s*10\s*\^\s*(-?\d+)/g, '$1e$2');
  s = s.replace(/(\d+(?:\.\d+)?)\s*[×x*]\s*10\s*(-?\d+)/g, '$1e$2');
  s = s.replace(/(^|[^\d])(10)\s*\^\s*(-?\d+)/g, (_m, pre, _base, exp) => `${pre}1e${exp}`);

  const frac = s.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);

  const m = s.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/);
  return m ? Number(m[0]) : null;
}

const PI = Math.PI;
const CONSTANTS = { pi: PI, π: PI, e: Math.E };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.eE+-]/.test(src[j])) {
        if ((src[j] === '+' || src[j] === '-') && !(j > i && /[eE]/.test(src[j - 1]))) break;
        j++;
      }
      const tok = src.slice(i, j);
      if (isNaN(Number(tok))) throw new Error('رقم غير صالح: ' + tok);
      tokens.push({ t: 'num', v: Number(tok) });
      i = j;
    } else if (/[+\-*/^(),π]/.test(ch)) {
      tokens.push({ t: ch, v: ch });
      i++;
    } else if (/[a-zA-Z]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j;
    } else {
      throw new Error('رمز غير معروف: ' + ch);
    }
  }
  tokens.push({ t: 'eof' });
  return tokens;
}

export function evaluateExpression(expr) {
  const tokens = tokenize(String(expr));
  let pos = 0;

  function peek() { return tokens[pos]; }
  function next() { return tokens[pos++]; }

  function parseExpr() {
    let left = parseTerm();
    while (peek().t === '+' || peek().t === '-') {
      const op = next().t;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (peek().t === '*' || peek().t === '/') {
      const op = next().t;
      const right = parseFactor();
      if (op === '*' ) left = left * right;
      else {
        if (right === 0) throw new Error('قسمة على صفر');
        left = left / right;
      }
    }
    return left;
  }

  function parseFactor() {
    let left = parseUnary();
    if (peek().t === '^') {
      next();
      const right = parseFactor();
      left = Math.pow(left, right);
    }
    return left;
  }

  function parseUnary() {
    if (peek().t === '-' || peek().t === '+') {
      const op = next().t;
      const v = parseUnary();
      return op === '-' ? -v : v;
    }
    return parseAtom();
  }

  function parseAtom() {
    const tok = next();
    if (tok.t === 'num') return tok.v;
    if (tok.t === '(') {
      const v = parseExpr();
      if (next().t !== ')') throw new Error('قوس غير مغلق');
      return v;
    }
    if (tok.t === 'id') {
      if (tok.v in CONSTANTS) return CONSTANTS[tok.v];
      if (tok.v === 'sqrt' || tok.v === 'sin' || tok.v === 'cos' || tok.v === 'tan' || tok.v === 'abs' || tok.v === 'ln' || tok.v === 'log') {
        if (next().t !== '(') throw new Error('الدالة ' + tok.v + ' تتطلب (');
        const arg = parseExpr();
        if (next().t !== ')') throw new Error('قوس غير مغلق');
        switch (tok.v) {
          case 'sqrt': return Math.sqrt(arg);
          case 'abs': return Math.abs(arg);
          case 'sin': return Math.sin(arg);
          case 'cos': return Math.cos(arg);
          case 'tan': return Math.tan(arg);
          case 'ln': return Math.log(arg);
          case 'log': return Math.log10(arg);
        }
      }
      throw new Error('متغير غير معروف: ' + tok.v);
    }
    throw new Error('تعريف غير متوقع');
  }

  const result = parseExpr();
  if (peek().t !== 'eof') throw new Error('نص زائد بعد نهاية التعبير');
  return result;
}

function approxEqual(a, b) {
  if (a === b) return true;
  return Math.abs(a - b) <= 1e-6 || Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9) <= 1e-4;
}

const VAR_RE = /[a-zA-Z]/;

function cleanFormula(f) {
  return String(f)
    .replace(/\$\s*|\s*\$/g, '')
    .replace(/[×⋅]/g, '*')
    .replace(/÷/g, '/');
}

export function verifyQuestion(q) {
  const answerText = (q.correct_answer_text || '').replace(/\$\s*|\s*\$/g, '');
  const expected = parseNumeric(answerText);
  if (expected === null) {
    return { status: 'unverified', detail: 'لا توجد قيمة رقمية قابلة للتحقق في الإجابة الصحيحة' };
  }

  const formula = q.solution && q.solution.formula ? cleanFormula(q.solution.formula) : null;

  if (formula && formula.trim() && formula !== 'null') {
    try {
      const result = evaluateExpression(formula);
      if (approxEqual(result, expected)) {
        return { status: 'verified', detail: `تحقق حسابي: المعادلة = ${result}` };
      }
      return { status: 'failed', detail: `المعادلة تعطي ${result} بينما الإجابة المذكورة ${expected}` };
    } catch (err) {
      const hasVar = /متغير غير معروف|رمز غير معروف/.test(err.message);
      return {
        status: 'unverified',
        detail: hasVar ? 'المعادلة تحتوي متغيرات — لا يمكن التحقق آليًا (يمر بمراجعة AI)' : `تعذر تقييم المعادلة: ${err.message}`
      };
    }
  }

  const opts = q.options || {};
  const numericOptions = Object.entries(opts).map(([k, v]) => ({ k, v: parseNumeric(v) })).filter((x) => x.v !== null);
  const correct = opts[q.correct_answer] ? parseNumeric(opts[q.correct_answer]) : null;
  if (numericOptions.length >= 2 && correct !== null) {
    const matches = numericOptions.filter((x) => approxEqual(x.v, expected));
    if (matches.length !== 1) {
      return { status: 'failed', detail: `عدد الخيارات المطابقة للقيمة ${expected} هو ${matches.length} (يجب أن يكون 1)` };
    }
  }
  return { status: 'unverified', detail: 'لا توجد معادلة رقمية كاملة — يمر بمراجعة AI' };
}
