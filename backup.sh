#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  نظام النسخة الاحتياطية "قبل كل تحديث"
#  يعمل على: قاعدة البيانات (قراءة فقط) + نسخة الكود الحالية
#  الاحتفاظ: آخر 14 نسخة (أقدمها تُحذف تلقائياً)
# ============================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$ROOT/backups"
KEY_FILE="$HOME/.config/supabase-madarek/svc.key"
SUPABASE_URL="https://ofltanaffcxoobfvlkii.supabase.co"
KEEP=14

TABLES="profiles user_roles role_permissions posts comments likes comment_likes suggestions suggestion_replies suggestion_likes suggestion_reply_likes support_messages notifications user_warnings banned_words banned_devices user_devices study_rounds round_participants round_chat round_meetings round_meeting_members round_meeting_messages schedules schedule_comments staff_chat round_completions admin_actions post_reports changes_messages section_locks channel_settings"

STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST/db"

if [[ ! -f "$KEY_FILE" ]]; then
  echo "خطأ: ملف المفتاح غير موجود: $KEY_FILE"
  exit 1
fi
KEY="$(cat "$KEY_FILE")"

echo "📦  نسخة احتياطية جديدة: $DEST"
echo "────────────────────────────────────────"

counts="{}"
declare -A ROW_COUNTS

for t in $TABLES; do
  json=$(curl -sf \
    -H "apikey: $KEY" \
    -H "Authorization: Bearer $KEY" \
    -G "$SUPABASE_URL/rest/v1/$t" --data-urlencode "select=*") || {
      echo "  ⚠️  فشل قراءة الجدول: $t"
      ROW_COUNTS["$t"]="FAIL"
      continue
    }
  n=$(printf '%s' "$json" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)))' 2>/dev/null || echo "?")
  printf '%s' "$json" > "$DEST/db/$t.json"
  ROW_COUNTS["$t"]="$n"
  printf '  %-22s %s صفوف\n' "$t" "$n"
done

python3 - "$DEST" "$STAMP" << 'PY'
import json, os, sys
dest, stamp = sys.argv[1], sys.argv[2]
rows = {}
for f in os.listdir(os.path.join(dest, "db")):
    if f.endswith(".json"):
        try:
            rows[f[:-5]] = len(json.load(open(os.path.join(dest, "db", f))))
        except Exception:
            rows[f[:-5]] = "?"
manifest = {
    "backup": stamp,
    "type": "pre-update-snapshot",
    "tables": rows,
    "note": "snapshot of public schema via service role (read-only)",
}
json.dump(manifest, open(os.path.join(dest, "manifest.json"), "w"), indent=2, ensure_ascii=False)
print("  ✅ manifest.json تم إنشاؤه")
PY

echo "  📄 نسخة الكود الحالية (بدون node_modules / dist / backups)..."
  tar czf "$DEST/code.tar.gz" \
  --warning=no-file-changed \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='backups' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='.env*' \
  --exclude='email-config.json' \
  -C "$ROOT" . 2>/dev/null || true
  echo "  ✅ code.tar.gz"

ROWS_TOTAL=$(printf '%s\n' "${ROW_COUNTS[@]}" | grep -vc FAIL || true)
echo "────────────────────────────────────────"
echo "✅ تم إنشاء النسخة رقم: $STAMP"

# تنظيف القديم: إبقاء آخر KEEP نسخ فقط
count=$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
if [[ "$count" -gt "$KEEP" ]]; then
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d | sort | head -n "$((count - KEEP))" | xargs -r rm -rf
  echo "🧹 حُذف $(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l) نسخة قديمة مضى عليها الدور"
fi
echo "📂 عدد النسخ المحفوظة حاليًا: $(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l) / $KEEP"