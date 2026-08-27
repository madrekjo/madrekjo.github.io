import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common import save_json, build_lesson, build_review
import data_u2_l1, data_u2_l2, data_u2_l3, data_u2_l4, data_u2_l5, data_u2_l6
import data_u2_rev, data_u2_revb

L = [
    (1, "Vocabulary and Speaking", 14, 15, data_u2_l1.ITEMS),
    (2, "Reading and Vocabulary", 16, 17, data_u2_l2.ITEMS),
    (3, "Grammar", 18, 19, data_u2_l3.ITEMS),
    (4, "Listening and Vocabulary", 20, 20, data_u2_l4.ITEMS),
    (5, "Speaking", 21, 21, data_u2_l5.ITEMS),
    (6, "Writing and Vocabulary", 22, 23, data_u2_l6.ITEMS),
]

for lesson_no, name, ps, pe, items in L:
    data = build_lesson(2, "On the move", lesson_no, name, ps, pe, items)
    save_json(f"unit-02/lesson-{lesson_no:02d}.json", data)
    print(f"lesson-{lesson_no:02d}.json: {len(items)} questions")

review_items = data_u2_rev.ITEMS + data_u2_revb.ITEMS
save_json("unit-02/review.json", build_review(2, "On the move", review_items))
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
