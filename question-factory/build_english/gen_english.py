import json, os

BASE_DIR = r"C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد\questions\2009\semester-1\english"

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
            "question": f"Sample question {i}",
            "options": {"A": "A", "B": "B", "C": "C", "D": "D"},
            "correct_answer": "A",
            "correct_answer_text": "A",
            "difficulty": "easy",
            "source": {"page": 5, "reference": "Student's Book"},
            "solution": {"formula": None, "steps": ["Step"], "summary": "Summary"},
            "explanation": "Explanation"
        }
        if is_review:
            q["source"]["lesson_number"] = "1"
            q["source"]["lesson_name"] = "Sample Lesson"
        qs.append(q)
    return qs

units = [
    {"id": "U01", "number": 1, "name": "Identity", "lessons": [
        {"id": "L01", "number": 1, "name": "Speaking and Vocabulary", "file": "unit-01/lesson-01.json"},
        {"id": "L02", "number": 2, "name": "Listening and Vocabulary", "file": "unit-01/lesson-02.json"},
        {"id": "L03", "number": 3, "name": "Grammar", "file": "unit-01/lesson-03.json"}
    ]}
]

index_units = []
for u in units:
    for l in u["lessons"]:
        save_json(l["file"], {"lesson": {"lesson_number": str(l["number"]), "lesson_name": l["name"], "unit_number": u["number"], "unit_name": u["name"], "page_start": 4, "page_end": 10, "questions": gen_qs(f"{u['id']}-{l['id']}", 40)}})
    save_json(f"unit-{u['number']:02d}/review.json", gen_qs(f"{u['id']}-REV", 50, True))
    index_units.append({"id": u["id"], "number": u["number"], "name": u["name"], "lessons": u["lessons"], "review": {"id": "REV", "name": "Unit Review", "file": f"unit-{u['number']:02d}/review.json"}})

save_json("index.json", {"subject_id": "english", "subject": "اللغة الإنجليزية", "generation_id": "2009", "generation": "2009", "semester_id": "semester-1", "semester": 1, "semester_label": "ف1", "units": index_units})
