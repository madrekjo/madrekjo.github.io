import json, os

BASE_DIR = r"C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد\questions\2009\semester-1\financial-culture"

def save_json(rel_path, data):
    full = os.path.join(BASE_DIR, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def gen_qs(prefix, count, is_review=False):
    qs = []
    for i in range(1, count + 1):
        q = {
            "id": f"{prefix}-Q{i:03d}",
            "number": i,
            "question": f"سؤال ثقافة مالية {i}",
            "options": {"A": "الخيار أ", "B": "الخيار ب", "C": "الخيار ج", "D": "الخيار د"},
            "correct_answer": "A",
            "correct_answer_text": "الخيار أ",
            "difficulty": "easy",
            "source": {"page": 10, "reference": "كتاب الثقافة المالية"},
            "solution": {"formula": None, "steps": ["معالجة محاسبية"], "summary": "استنتاج"},
            "explanation": "شرح"
        }
        if is_review:
            q["source"]["lesson_number"] = "1"
            q["source"]["lesson_name"] = "درس تجريبي"
        qs.append(q)
    return qs

units = [
    {"id": "U01", "number": 1, "name": "الدورة المحاسبية", "lessons": [
        {"id": "L01", "number": 1, "name": "الدورة المحاسبية: المفهوم والمراحل", "file": "unit-01/lesson-01.json"},
        {"id": "L02", "number": 2, "name": "نظرية القيد المزدوج والعمليات المالية", "file": "unit-01/lesson-02.json"}
    ]},
    {"id": "U02", "number": 2, "name": "القوائم المالية", "lessons": [
        {"id": "L01", "number": 1, "name": "القوائم المالية: المفهوم والأنواع", "file": "unit-02/lesson-01.json"}
    ]}
]

index_units = []
for u in units:
    for l in u["lessons"]:
        save_json(l["file"], {"lesson": {"lesson_number": str(l["number"]), "lesson_name": l["name"], "unit_number": u["number"], "unit_name": u["name"], "page_start": 8, "page_end": 20, "questions": gen_qs(f"{u['id']}-{l['id']}", 40)}})
    save_json(f"unit-{u['number']:02d}/review.json", gen_qs(f"{u['id']}-REV", 50, True))
    index_units.append({"id": u["id"], "number": u["number"], "name": u["name"], "lessons": u["lessons"], "review": {"id": "REV", "name": "مراجعة الوحدة", "file": f"unit-{u['number']:02d}/review.json"}})

save_json("index.json", {"subject_id": "financial-culture", "subject": "الثقافة المالية", "generation_id": "2009", "generation": "2009", "semester_id": "semester-1", "semester": 1, "semester_label": "ف1", "units": index_units})
