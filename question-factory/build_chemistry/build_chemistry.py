# -*- coding: utf-8 -*-
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from chem_u1 import UNIT1
from chem_u2 import UNIT2
from chem_u3 import UNIT3
from chem_u4 import UNIT4

BASE_DIR = r"C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد\questions\2009\semester-1\chemistry"

UNITS = [UNIT1, UNIT2, UNIT3, UNIT4]

EXPECTED_LESSON = 40
EXPECTED_REVIEW = 50


def make_question(qid, num, item):
    text, opts, ans, diff, page, ref, formula, steps, summary, exp = item[:10]
    return {
        "id": qid,
        "number": num,
        "question": text,
        "options": opts,
        "correct_answer": ans,
        "correct_answer_text": opts[ans],
        "difficulty": diff,
        "source": {"page": page, "reference": ref},
        "solution": {"formula": formula, "steps": steps, "summary": summary},
        "explanation": exp,
    }


def build_lesson(lesson):
    items = lesson["data"]["questions"]
    if len(items) != EXPECTED_LESSON:
        raise ValueError(
            "lesson %s expected %d questions, got %d"
            % (lesson["id"], EXPECTED_LESSON, len(items))
        )
    qs = []
    for i, it in enumerate(items, start=1):
        prefix = lesson["prefix"]
        qs.append(make_question("%s-Q%03d" % (prefix, i), i, it))
    return {
        "lesson": {
            "lesson_number": str(lesson["number"]),
            "lesson_name": lesson["name"],
            "unit_number": lesson["unit_number"],
            "unit_name": lesson["unit_name"],
            "page_start": lesson["page_start"],
            "page_end": lesson["page_end"],
            "questions": qs,
        }
    }


def build_review(review):
    items = review["data"]["questions"]
    if len(items) != EXPECTED_REVIEW:
        raise ValueError(
            "review %s expected %d questions, got %d"
            % (review["id"], EXPECTED_REVIEW, len(items))
        )
    qs = []
    for i, it in enumerate(items, start=1):
        prefix = review["prefix"]
        q = make_question("%s-Q%03d" % (prefix, i), i, it)
        src = q["source"]
        src["lesson_number"] = it[10]
        src["lesson_name"] = it[11]
        qs.append(q)
    return qs


def write_json(rel_path, data):
    full = os.path.join(BASE_DIR, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Wrote %s" % rel_path)


def main():
    index_units = []
    for unit in UNITS:
        for lesson in unit["lessons"]:
            data = build_lesson(lesson)
            write_json(lesson["file"], data)
        data = build_review(unit["review"])
        write_json(unit["review"]["file"], data)
        index_units.append(
            {
                "id": unit["id"],
                "number": unit["number"],
                "name": unit["name"],
                "lessons": [
                    {
                        "id": lesson["id"],
                        "number": lesson["number"],
                        "name": lesson["name"],
                        "file": lesson["file"],
                    }
                    for lesson in unit["lessons"]
                ],
                "review": {
                    "id": unit["review"]["id"],
                    "name": unit["review"]["name"],
                    "file": unit["review"]["file"],
                },
            }
        )
    index_data = {
        "subject_id": "chemistry",
        "subject": "الكيمياء",
        "generation_id": "2009",
        "generation": "2009",
        "semester_id": "semester-1",
        "semester": 1,
        "semester_label": "ف1",
        "units": index_units,
    }
    write_json("index.json", index_data)


if __name__ == "__main__":
    main()
