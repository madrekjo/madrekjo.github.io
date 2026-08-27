import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import save_json, build_lesson, build_review
import data_u3_l1, data_u3_l2, data_u3_l3, data_u3_l4, data_u3_l5, data_u3_l6
import data_u3_review

L = [
    (1, "Vocabulary and Speaking", 26, 27, data_u3_l1.ITEMS),
    (2, "Listening and Vocabulary", 28, 28, data_u3_l2.ITEMS),
    (3, "Speaking", 29, 29, data_u3_l3.ITEMS),
    (4, "Reading and Vocabulary", 30, 31, data_u3_l4.ITEMS),
    (5, "Grammar", 32, 33, data_u3_l5.ITEMS),
    (6, "Writing and Vocabulary", 34, 35, data_u3_l6.ITEMS),
]

for lesson_no, name, ps, pe, items in L:
    data = build_lesson(3, "Hard sell", lesson_no, name, ps, pe, items)
    save_json(f"unit-03/lesson-{lesson_no:02d}.json", data)
    print(f"lesson-{lesson_no:02d}.json: {len(items)} questions")

review_items = data_u3_review.ITEMS
save_json("unit-03/review.json", build_review(3, "Hard sell", review_items))
print(f"review.json: {len(review_items)} questions")

all_items = L + [("REV", "Review", 0, 0, review_items)]
ok = True
for idx, (lesson_no, name, ps, pe, items) in enumerate(all_items):
    for i, it in enumerate(items, 1):
        qt, opts, key, diff, page, ref, steps, summary, expl = it
        if key not in opts:
            print(f"ERROR: {lesson_no} item {i}: key {key} not in options")
            ok = False
print("ALL OK" if ok else "ERRORS FOUND")
