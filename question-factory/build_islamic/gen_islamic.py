import json, os

BASE_DIR = r"C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد\questions\2009\semester-1\islamic"

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
            "question": f"سؤال تربية إسلامية {i}",
            "options": {"A": "الخيار أ", "B": "الخيار ب", "C": "الخيار ج", "D": "الخيار د"},
            "correct_answer": "A",
            "correct_answer_text": "الخيار أ",
            "difficulty": "easy",
            "source": {"page": 5, "reference": "كتاب التربية الإسلامية"},
            "solution": {"formula": None, "steps": ["استنباط"], "summary": "استنتاج"},
            "explanation": "تفسير"
        }
        if is_review:
            q["source"]["lesson_number"] = "1"
            q["source"]["lesson_name"] = "درس تجريبي"
        qs.append(q)
    return qs

units = [
    {"id": "U01", "number": 1, "name": "علاقة الإنسان بربه سبحانه", "lessons": [
        {"id": "L01", "number": 1, "name": "واجب الإنسان تجاه خالقه", "file": "unit-01/lesson-01.json"},
        {"id": "L02", "number": 2, "name": "شكر النعم", "file": "unit-01/lesson-02.json"}
    ]},
    {"id": "U02", "number": 2, "name": "علاقة الإنسان بمَنْ حوله", "lessons": [
        {"id": "L01", "number": 1, "name": "الشخصية الإسلامية", "file": "unit-02/lesson-01.json"}
    ]}
]

index_units = []
for u in units:
    for l in u["lessons"]:
        save_json(l["file"], {"lesson": {"lesson_number": str(l["number"]), "lesson_name": l["name"], "unit_number": u["number"], "unit_name": u["name"], "page_start": 5, "page_end": 15, "questions": gen_qs(f"{u['id']}-{l['id']}", 40)}})
    save_json(f"unit-{u['number']:02d}/review.json", gen_qs(f"{u['id']}-REV", 50, True))
    index_units.append({"id": u["id"], "number": u["number"], "name": u["name"], "lessons": u["lessons"], "review": {"id": "REV", "name": "مراجعة الوحدة", "file": f"unit-{u['number']:02d}/review.json"}})

save_json("index.json", {"subject_id": "islamic", "subject": "التربية الإسلامية", "generation_id": "2009", "generation": "2009", "semester_id": "semester-1", "semester": 1, "semester_label": "ف1", "units": index_units})
