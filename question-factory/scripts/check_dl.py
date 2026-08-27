import json, pathlib
src = pathlib.Path(r'C:\Users\abdal_cw9hjgr\Downloads\earth_science_question_bank\output')
for f in sorted(src.rglob('review.json')):
    data = json.loads(f.read_text(encoding='utf-8'))
    if isinstance(data, list):
        print(f'{f.relative_to(src)}: array, {len(data)} questions')
    elif isinstance(data, dict) and 'lesson' in data:
        qs = data['lesson'].get('questions', [])
        print(f'{f.relative_to(src)}: wrapped, {len(qs)} questions')
    else:
        print(f'{f.relative_to(src)}: unknown format')
