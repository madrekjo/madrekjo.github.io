# -*- coding: utf-8 -*-
"""Convert data_unitN.py (extracted Arabic literature units) into the site's
questions/2009/semester-1/arabic JSON layout."""
import json
import os
import sys
import importlib.util

BASE_DIR = r"C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد\questions\2009\semester-1\arabic"
GEN_DIR = r"C:\Users\abdal_cw9hjgr\AppData\Local\Temp\opencode\gen"

SUBJECT = "اللغة العربية"
REFERENCE = "كتاب اللغة العربية - الأدب والنصوص والمطالعة"

def load_unit(module_name):
    spec = importlib.util.spec_from_file_location(
        module_name, os.path.join(GEN_DIR, module_name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod.UNIT


def build_question(q, qid, num, page, lesson_number=None, lesson_name=None):
    correct = q["correct"]
    qj = {
        "id": qid,
        "number": num,
        "question": q["question"],
        "options": q["options"],
        "correct_answer": correct,
        "correct_answer_text": q["options"][correct],
        "difficulty": q["difficulty"],
        "source": {
            "page": page,
            "reference": REFERENCE,
        },
        "solution": {
            "formula": None,
            "steps": q["steps"],
            "summary": q["summary"],
        },
        "explanation": q["explanation"],
    }
    if lesson_number is not None:
        qj["source"]["lesson_number"] = str(lesson_number)
    if lesson_name is not None:
        qj["source"]["lesson_name"] = lesson_name
    return qj


def gen_unit(unit):
    u = unit
    num = u["number"]
    uname = u["name"]
    prefix = f"U{num:02d}"
    units_dir = os.path.join(BASE_DIR, f"unit-{num:02d}")
    os.makedirs(units_dir, exist_ok=True)

    lessons_meta = []
    for li, lesson in enumerate(u["lessons"], start=1):
        lprefix = f"{prefix}-L{li:02d}"
        qs = []
        for qi, q in enumerate(lesson["questions"], start=1):
            qs.append(build_question(q, f"{lprefix}-Q{qi:03d}", qi,
                                     lesson["page_start"],
                                     lesson_number=li,
                                     lesson_name=lesson["name"]))
        lesson_json = {
            "lesson": {
                "lesson_number": str(li),
                "lesson_name": lesson["name"],
                "unit_number": num,
                "unit_name": uname,
                "page_start": lesson["page_start"],
                "page_end": lesson["page_end"],
                "questions": qs,
            }
        }
        with open(os.path.join(units_dir, f"lesson-{li:02d}.json"),
                  "w", encoding="utf-8") as f:
            json.dump(lesson_json, f, ensure_ascii=False, indent=2)
        lessons_meta.append({
            "id": lesson["id"],
            "number": li,
            "name": lesson["name"],
            "file": f"unit-{num:02d}/lesson-{li:02d}.json",
        })

    rev_qs = []
    for qi, q in enumerate(u["review"]["questions"], start=1):
        rev_qs.append(build_question(q, f"{prefix}-REV-Q{qi:03d}", qi,
                                     u["page_start"],
                                     lesson_number=q.get("lesson_number"),
                                     lesson_name=q.get("lesson_name")))
    with open(os.path.join(units_dir, "review.json"),
              "w", encoding="utf-8") as f:
        json.dump(rev_qs, f, ensure_ascii=False, indent=2)

    return {
        "id": prefix,
        "number": num,
        "name": uname,
        "lessons": lessons_meta,
        "review": {
            "id": "REV",
            "name": u["review_name"],
            "file": f"unit-{num:02d}/review.json",
        },
    }


def main(units_to_gen):
    with open(os.path.join(BASE_DIR, "index.json"), encoding="utf-8") as f:
        index = json.load(f)

    existing = {u["id"]: u for u in index["units"]}
    for n in units_to_gen:
        unit = load_unit(f"data_unit{n}")
        existing[unit["id"]] = gen_unit(unit)

    order = sorted(existing, key=lambda k: int(k[1:]))
    index["units"] = [existing[k] for k in order]
    with open(os.path.join(BASE_DIR, "index.json"),
              "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print("index units:", [u["id"] for u in index["units"]])


if __name__ == "__main__":
    nums = [int(a) for a in sys.argv[1:]] if len(sys.argv) > 1 else [2, 3]
    main(nums)
