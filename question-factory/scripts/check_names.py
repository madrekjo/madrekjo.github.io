import json, pathlib
root = pathlib.Path(r'C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد\questions\2009\semester-1\earth-science')
for unit_dir in sorted(root.iterdir()):
    if not unit_dir.is_dir(): continue
    f = sorted(unit_dir.glob('lesson-*.json'))[0]
    data = json.loads(f.read_text(encoding='utf-8'))
    lesson = data['lesson']
    print('Unit %d: %s' % (lesson['unit_number'], lesson['unit_name']))
    for lf in sorted(unit_dir.glob('lesson-*.json')):
        d = json.loads(lf.read_text(encoding='utf-8'))
        l = d['lesson']
        print('  L%s: %s (pp.%s-%s)' % (l['lesson_number'], l['lesson_name'], l['page_start'], l['page_end']))
    print('  REV: 50 questions')
    print()
