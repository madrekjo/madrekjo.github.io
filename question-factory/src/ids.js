export function pad(n, width) {
  return String(n).padStart(width, '0');
}

export function makeLessonId(unitNumber, lessonIndex, num, padding = 2) {
  return `U${pad(unitNumber, padding)}-L${pad(lessonIndex, padding)}-Q${pad(num, 3)}`;
}

export function makeReviewId(unitNumber, num, prefix = 'REV', padding = 2) {
  return `U${pad(unitNumber, padding)}-${prefix}-Q${pad(num, 3)}`;
}

export function questionNumberFromId(id) {
  const m = String(id || '').match(/-Q(\d+)$/);
  return m ? Number(m[1]) : null;
}
