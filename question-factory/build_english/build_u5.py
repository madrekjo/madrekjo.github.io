import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import save_json, build_lesson, build_review
import data_u5_l1, data_u5_l2, data_u5_l3, data_u5_l4, data_u5_l5, data_u5_l6
import data_u5_review

L = [
    (1, "Vocabulary and Speaking", 48, 49, data_u5_l1.ITEMS),
    (2, "Grammar", 50, 51, data_u5_l2.ITEMS),
    (3, "Reading and Vocabulary", 52, 53, data_u5_l3.ITEMS),
    (4, "Listening and Vocabulary", 54, 55, data_u5_l4.ITEMS),
    (5, "Speaking", 55, 56, data_u5_l5.ITEMS),
    (6, "Writing and Vocabulary", 56, 57, data_u5_l6.ITEMS),
]

for lesson_no, name, ps, pe, items in L:
    data = build_lesson(5, "Do your best", lesson_no, name, ps, pe, items)
    save_json(f"unit-05/lesson-{lesson_no:02d}.json", data)
    print(f"lesson-{lesson_no:02d}.json: {len(items)} questions")

review_items = data_u5_review.ITEMS
save_json("unit-05/review.json", build_review(5, "Do your best", review_items))
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
