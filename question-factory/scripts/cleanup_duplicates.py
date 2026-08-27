"""Remove duplicate questions from all 16 earth-science files."""
import json, pathlib, re, sys

ROOT = pathlib.Path(r'C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد')
QDIR = ROOT / 'questions' / '2009' / 'semester-1' / 'earth-science'
THRESHOLD = 0.85  # slightly higher than pipeline 0.82 for cleanup

# ── Normalize (mirrors JS dedupe.js normalize) ──
LATEX_MAP = [
    (r'\\pm\b', '±'), (r'\\mp\b', '∓'), (r'\\times\b', '×'),
    (r'\\cdot\b', '·'), (r'\\cdotp\b', '·'), (r'\\div\b', '÷'),
    (r'\\sqrt\b', '√'), (r'\\leq\b', '≤'), (r'\\le\b', '≤'),
    (r'\\geq\b', '≥'), (r'\\ge\b', '≥'), (r'\\neq\b', '≠'),
    (r'\\ne\b', '≠'), (r'\\approx\b', '≈'), (r'\\infty\b', '∞'),
    (r'\\triangle\b', '∆'), (r'\\perp\b', '⊥'), (r'\\parallel\b', '∥'),
]
PREFIX_RE = re.compile(r'^(ماذا|أي من|أي|بأي|لماذا|كيف|متى|أين|أينما|كم|من|هل|عندما|ما هو|ما هي|ما المقصود|ما|اذكر|عرف|وضّح|عدّد)\s+')
KEEP = set('±×÷·•=<>≤≥%^*±∓≈≠≡√∑∏∫∞°′″∆⊥∥→←↔⇌()[]\'-+')

def normalize(text):
    s = str(text or '')
    for pat, sym in LATEX_MAP:
        s = re.sub(pat, sym, s)
    # Remove tashkeel
    s = re.sub(r'[\u064B-\u065F\u0670]', '', s)
    s = s.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا')
    s = s.replace('ى', 'ي').replace('ئ', 'ي').replace('ؤ', 'و').replace('ة', 'ه')
    # Keep only letters, digits, KEEP symbols
    out = []
    for ch in s:
        cp = ord(ch)
        if (0x0600 <= cp <= 0x06FF) or (0x0660 <= cp <= 0x0669) or ch.isalnum() or ch in KEEP:
            out.append(ch)
        elif out and out[-1] != ' ':
            out.append(' ')
    s = ''.join(out)
    return re.sub(r'\s+', ' ', s).strip()

def strip_prefix(text):
    return PREFIX_RE.sub('', text).strip()

def tokens(text):
    return [w for w in normalize(strip_prefix(text)).split() if len(w) >= 2]

def jaccard(a, b):
    sa, sb = set(a), set(b)
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0

def char_ngrams(text, n=3):
    s = normalize(text).replace(' ', '')
    grams = {}
    if len(s) < n:
        grams[s] = 1
        return grams
    for i in range(len(s) - n + 1):
        g = s[i:i+n]
        grams[g] = grams.get(g, 0) + 1
    return grams

def dice(a, b):
    ga, gb = char_ngrams(a), char_ngrams(b)
    inter = sum(min(c, gb.get(g, 0)) for g, c in ga.items())
    total = sum(ga.values()) + sum(gb.values())
    return (2 * inter) / total if total else 0

def lcs_len(a, b):
    la, lb = len(a), len(b)
    if not la or not lb:
        return 0
    prev = [0] * (lb + 1)
    for i in range(1, la + 1):
        cur = [0] * (lb + 1)
        for j in range(1, lb + 1):
            cur[j] = prev[j-1] + 1 if a[i-1] == b[j-1] else max(prev[j], cur[j-1])
        prev = cur
    return prev[lb]

def similarity(a, b):
    ta, tb = tokens(a), tokens(b)
    ja = jaccard(ta, tb)
    di = dice(a, b)
    na, nb = normalize(strip_prefix(a)), normalize(strip_prefix(b))
    min_len = min(len(na), len(nb))
    lcs = lcs_len(na, nb) / min_len if min_len else 0
    return max(ja, di, lcs)

def literal_hash(text):
    import hashlib
    return hashlib.sha256(normalize(text).encode('utf-8')).hexdigest()

def read_questions(filepath):
    data = json.loads(filepath.read_text(encoding='utf-8'))
    if isinstance(data, dict) and 'lesson' in data:
        return data, data['lesson'].get('questions', []), 'wrapped'
    elif isinstance(data, list):
        return data, data, 'raw_array'
    return data, [], 'unknown'

def write_questions(filepath, structure, questions, fmt):
    if fmt == 'wrapped':
        structure['lesson']['questions'] = questions
        filepath.write_text(json.dumps(structure, ensure_ascii=False, indent=2), encoding='utf-8')
    elif fmt == 'raw_array':
        filepath.write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding='utf-8')

# ── Main ──
global_hashes = set()
global_texts = []  # (text, id, file)
stats = {}

for unit_dir in sorted(QDIR.iterdir()):
    if not unit_dir.is_dir():
        continue
    for f in sorted(unit_dir.glob('*.json')):
        structure, questions, fmt = read_questions(f)
        if not questions:
            continue

        original_count = len(questions)
        kept = []
        file_dups = 0
        seen_hashes = set()

        for q in questions:
            text = q.get('question', '')
            h = literal_hash(text)

            # Literal dup within file
            if h in seen_hashes:
                file_dups += 1
                continue

            # Semantic dup within file
            is_dup = False
            for kept_q in kept:
                sim = similarity(text, kept_q['question'])
                if sim >= THRESHOLD:
                    is_dup = True
                    file_dups += 1
                    break

            if is_dup:
                continue

            seen_hashes.add(h)
            kept.append(q)

        # Renumber
        for i, q in enumerate(kept):
            q['number'] = i + 1

        removed = original_count - len(kept)
        stats[f.relative_to(QDIR)] = {'before': original_count, 'after': len(kept), 'removed': removed}

        if removed > 0:
            write_questions(f, structure, kept, fmt)
            print(f'  CLEANED {f.relative_to(QDIR)}: {original_count} -> {len(kept)} (-{removed} dups)')
        else:
            print(f'  OK      {f.relative_to(QDIR)}: {original_count} (no dups)')

print('\n=== Summary ===')
total_before = sum(s['before'] for s in stats.values())
total_after = sum(s['after'] for s in stats.values())
total_removed = sum(s['removed'] for s in stats.values())
print(f'Total before: {total_before}')
print(f'Total after:  {total_after}')
print(f'Removed:      {total_removed}')
print(f'Dup rate:     {total_removed/total_before*100:.1f}%' if total_before else '')
