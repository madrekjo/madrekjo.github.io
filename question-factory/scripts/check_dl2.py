import json, pathlib
src = pathlib.Path(r'C:\Users\abdal_cw9hjgr\Downloads\earth_science_question_bank\output')
total = 0
for f in sorted(src.rglob('review.json')):
    data = json.loads(f.read_text(encoding='utf-8'))
    if isinstance(data, dict):
        key = 'unit_review' if 'unit_review' in data else 'lesson'
        qs = data.get(key, {}).get('questions', [])
        print(f'{f.parent.name}/{f.name}: key="{key}", {len(qs)} questions')
        total += len(qs)
        if qs:
            q0 = qs[0]
            print(f'  fields: {list(q0.keys())}')
    elif isinstance(data, list):
        print(f'{f.parent.name}/{f.name}: array, {len(data)} questions')
        total += len(data)
print(f'\nTotal review questions: {total}')
