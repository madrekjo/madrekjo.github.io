import json, os

BASE_DIR = r"C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد\questions\2009\semester-1\english"


def save_json(rel_path, data):
    full = os.path.join(BASE_DIR, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def build_lesson(unit_no, unit_name, lesson_no, lesson_name, ps, pe, items):
    questions = []
    for i, (qt, opts, key, diff, page, ref, steps, summary, expl) in enumerate(items, 1):
        questions.append({
            "id": f"U{unit_no:02d}-L{lesson_no:02d}-Q{i:03d}",
            "number": i,
            "question": qt,
            "options": opts,
            "correct_answer": key,
            "correct_answer_text": opts[key],
            "difficulty": diff,
            "source": {"page": page, "reference": ref},
            "solution": {"formula": None, "steps": steps, "summary": summary},
            "explanation": expl,
        })
    return {
        "lesson": {
            "lesson_number": str(lesson_no),
            "lesson_name": lesson_name,
            "unit_number": unit_no,
            "unit_name": unit_name,
            "page_start": ps,
            "page_end": pe,
            "questions": questions,
        }
    }


def build_review(unit_no, unit_name, items):
    questions = []
    for i, (qt, opts, key, diff, page, ref, steps, summary, expl) in enumerate(items, 1):
        questions.append({
            "id": f"U{unit_no:02d}-REV-Q{i:03d}",
            "number": i,
            "question": qt,
            "options": opts,
            "correct_answer": key,
            "correct_answer_text": opts[key],
            "difficulty": diff,
            "source": {"page": page, "reference": ref},
            "solution": {"formula": None, "steps": steps, "summary": summary},
            "explanation": expl,
        })
    return questions
