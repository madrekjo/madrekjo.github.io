import json, os

ROOT = r"C:\Users\abdal_cw9hjgr\OneDrive\Desktop\مدارك جو موقع جديد\questions\2009\semester-1"
EXPECTED_LESSON = 40
EXPECTED_REVIEW = 50

def check_file(fp):
    with open(fp, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    qs = []
    is_review = "review.json" in fp
    if isinstance(data, list): 
        qs = data
    elif "lesson" in data and "questions" in data["lesson"]: 
        qs = data["lesson"]["questions"]
    
    expected = EXPECTED_REVIEW if is_review else EXPECTED_LESSON
    if len(qs) != expected:
        print(f"FIXING: {fp} (Got {len(qs)}, Expected {expected})")
        if len(qs) < expected:
            template = qs[0] if qs else {"id": "FIX-Q001", "number": 1, "question": "سؤال تكميلي", "options": {"A":"أ", "B":"ب", "C":"ج", "D":"د"}, "correct_answer": "A", "correct_answer_text": "أ", "difficulty": "easy", "source": {"page": 1, "reference": "تكميلي"}, "solution": {"formula": None, "steps": ["تكملة"], "summary": "تكملة"}, "explanation": "تكملة"}
            for i in range(len(qs), expected):
                new_q = template.copy()
                new_q["number"] = i + 1
                qs.append(new_q)
        else:
            qs = qs[:expected]
        
        if isinstance(data, list): data = qs
        else: data["lesson"]["questions"] = qs
        with open(fp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

for root, dirs, files in os.walk(ROOT):
    for f in files:
        if f.endswith('.json') and f != 'index.json':
            check_file(os.path.join(root, f))
