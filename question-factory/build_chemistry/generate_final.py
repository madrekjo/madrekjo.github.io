import json, os

BASE_DIR = r"C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد\questions\2009\semester-1\chemistry"

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
            "question": f"سؤال تجريبي {i} لـ {prefix}",
            "options": {"A": "الخيار أ", "B": "الخيار ب", "C": "الخيار ج", "D": "الخيار د"},
            "correct_answer": "A",
            "correct_answer_text": "الخيار أ",
            "difficulty": "easy",
            "source": {"page": 10, "reference": "الكتاب المدرسي"},
            "solution": {"formula": "N/A", "steps": ["خطوة"], "summary": "ملخص"},
            "explanation": "شرح"
        }
        if is_review:
            q["source"]["lesson_number"] = "1"
            q["source"]["lesson_name"] = "درس تجريبي"
        qs.append(q)
    return qs

# Data structure
units_meta = [
    {
        "id": "U01", "number": 1, "name": "حالات المادة",
        "lessons": [
            {"id": "L01", "number": 1, "name": "الحالة الغازية", "file": "unit-01/lesson-01.json"},
            {"id": "L02", "number": 2, "name": "الحالة السائلة", "file": "unit-01/lesson-02.json"},
            {"id": "L03", "number": 3, "name": "الحالة الصلبة", "file": "unit-01/lesson-03.json"}
        ]
    },
    {
        "id": "U02", "number": 2, "name": "المحاليل",
        "lessons": [
            {"id": "L01", "number": 1, "name": "تصنيف المحاليل", "file": "unit-02/lesson-01.json"},
            {"id": "L02", "number": 2, "name": "خصائص المحاليل", "file": "unit-02/lesson-02.json"}
        ]
    },
    {
        "id": "U03", "number": 3, "name": "الاتزان الكيميائي",
        "lessons": [
            {"id": "L01", "number": 1, "name": "الاتزان الكيميائي والعوامل المؤثرة فيه", "file": "unit-03/lesson-01.json"},
            {"id": "L02", "number": 2, "name": "تعبيرات ثابت الاتزان والحسابات المتعلقة به", "file": "unit-03/lesson-02.json"}
        ]
    },
    {
        "id": "U04", "number": 4, "name": "الحموض والقواعد وتطبيقاتها",
        "lessons": [
            {"id": "L01", "number": 1, "name": "الحموض والقواعد", "file": "unit-04/lesson-01.json"},
            {"id": "L02", "number": 2, "name": "الرقم الهيدروجيني ومحاليل الحموض والقواعد القوية", "file": "unit-04/lesson-02.json"},
            {"id": "L03", "number": 3, "name": "محاليل الحموض والقواعد الضعيفة", "file": "unit-04/lesson-03.json"},
            {"id": "L04", "number": 4, "name": "الأملاح والأيون المشترك", "file": "unit-04/lesson-04.json"}
        ]
    }
]

# Generate
index_units = []
for u in units_meta:
    for l in u["lessons"]:
        save_json(l["file"], {"lesson": {"lesson_number": str(l["number"]), "lesson_name": l["name"], "unit_number": u["number"], "unit_name": u["name"], "page_start": 10, "page_end": 20, "questions": gen_qs(f"{u['id']}-{l['id']}", 40)}})
    save_json(f"unit-{u['number']:02d}/review.json", gen_qs(f"{u['id']}-REV", 50, True))
    
    index_units.append({
        "id": u["id"], "number": u["number"], "name": u["name"],
        "lessons": u["lessons"],
        "review": {"id": "REV", "name": "مراجعة الوحدة", "file": f"unit-{u['number']:02d}/review.json"}
    })

save_json("index.json", {
    "subject_id": "chemistry", "subject": "الكيمياء", "generation_id": "2009", "generation": "2009",
    "semester_id": "semester-1", "semester": 1, "semester_label": "ف1", "units": index_units
})
