import { useEffect, useMemo, useState } from "react";
import {
  adminBanDevice,
  adminDeleteChatMessage,
  adminDeleteLine,
  adminListBanned,
  adminListChat,
  adminListLines,
  adminLogin,
  adminLogout,
  adminUnbanDevice,
  type AdminChatRow,
  type AdminLineRow,
  type BannedRow,
} from "../lib/api";

type Tab = "lines" | "chat" | "banned";

const timeTxt = (s: string) =>
  s ? new Date(s).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" }) : "";

export default function AdminPanel({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("lines");
  const [lines, setLines] = useState<AdminLineRow[]>([]);
  const [chat, setChat] = useState<AdminChatRow[]>([]);
  const [banned, setBanned] = useState<BannedRow[]>([]);
  const [search, setSearch] = useState("");
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");

  const fresh = async () => {
    try {
      const [l, c, b] = await Promise.all([
        adminListLines(),
        adminListChat(),
        adminListBanned(),
      ]);
      setLines(l);
      setChat(c);
      setBanned(b);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر التحميل");
    }
  };

  useEffect(() => {
    if (!open) return;
    setErr("");
    setSearch("");
    if (!authed) return;
    void fresh();
  }, [open, authed]);

  const locked = useMemo(
    () => !password.startsWith(" ") && password.length < 6,
    [password]
  );

  const doLogin = async () => {
    setBusy(true);
    setErr("");
    try {
      const ok = await adminLogin(password);
      if (ok) setAuthed(true);
      else setErr("كلمة السر غير صحيحة");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر التحقق — نفّذ migration الإدارة");
    } finally {
      setBusy(false);
    }
  };

  const filterLines = search.trim()
    ? lines.filter(
        (l) =>
          (l.text || "").includes(search.trim()) ||
          (l.submitter || "").includes(search.trim())
      )
    : lines;

  const filterChat = search.trim()
    ? chat.filter(
        (c) =>
          (c.nickname || "").includes(search.trim()) ||
          (c.message || "").includes(search.trim())
      )
    : chat;

  const confirmBanFor = (deviceId: string, reason: string) => {
    setConfirmBan(deviceId);
    setBanReason(reason);
    setErr("");
  };

  const runBan = async () => {
    if (!confirmBan) return;
    setBusy(true);
    setErr("");
    try {
      await adminBanDevice(confirmBan, banReason);
      setConfirmBan(null);
      setBanReason("");
      void fresh();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الحظر");
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async (kind: "line" | "chat", id: string) => {
    if (!window.confirm("متأكد من الحذف؟ لا يمكن التراجع.")) return;
    setBusy(true);
    setErr("");
    try {
      if (kind === "line") await adminDeleteLine(id);
      else await adminDeleteChatMessage(id);
      void fresh();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الحذف");
    } finally {
      setBusy(false);
    }
  };

  const runUnban = async (deviceId: string) => {
    setBusy(true);
    setErr("");
    try {
      await adminUnbanDevice(deviceId);
      void fresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر رفع الحظر");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    adminLogout();
    setAuthed(false);
    setPassword("");
    setErr("");
    setConfirmBan(null);
    setBanReason("");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={close}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-paper p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-bold text-ink">🛡️ إدارة «بين السطور»</h2>
          <button onClick={close} className="rounded-full bg-ink/10 px-3 py-1 text-sm font-bold text-ink hover:bg-ink/20">
            إغلاق
          </button>
        </div>

        {!authed ? (
          <div className="mt-6">
            <p className="mb-3 text-sm text-ink-soft">أدخل كلمة سر الأدمن للدخول:</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !locked && void doLogin()}
              placeholder="••••••••"
              className="w-full rounded-xl border border-line bg-white/60 px-4 py-2.5 text-ink outline-none focus:border-gold-deep"
            />
            {err && <p className="mt-2 text-sm font-bold text-red-600">{err}</p>}
            <button
              onClick={() => void doLogin()}
              disabled={locked || busy}
              className="mt-4 w-full rounded-xl bg-gold-deep px-4 py-2.5 font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "جارٍ التحقق..." : "دخول الإدارة"}
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
              {(
                [
                  ["lines", `البطاقات`],
                  ["chat", `رسائل القرّاء`],
                  ["banned", `المحظورون`],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-bold transition ${
                    tab === t ? "bg-white text-ink shadow" : "text-ink-soft"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو النص (يظهر للبطاقات ورسائل القرّاء)"
              className="mt-3 w-full rounded-xl border border-line bg-white/60 px-4 py-2 text-sm text-ink outline-none focus:border-gold-deep"
            />

            {err && <p className="mt-2 text-sm font-bold text-red-600">{err}</p>}

            {tab === "lines" && (
              <div className="mt-3 space-y-2">
                {filterLines.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-soft">لا يوجد بطاقات</p>
                )}
                {filterLines.map((l) => (
                  <div key={l.id} className="rounded-2xl border border-line bg-white/50 p-3">
                    <p className="text-sm font-bold text-ink">{l.text}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{l.book} — {l.author || l.category}</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-soft">
                      <span>{l.submitter} · 🕐 {timeTxt(l.created_at)} · ❤ {l.likes}</span>
                      <span dir="ltr" className="font-mono">{l.device_id}</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => void runDelete("line", l.id)}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:opacity-90"
                      >
                        حذف البطاقة
                      </button>
                      <button
                        onClick={() => confirmBanFor(l.device_id, `بطاقة: ${l.text.slice(0, 60)}`)}
                        className="rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white hover:opacity-90"
                      >
                        حظر + حذف كل محتواه
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "chat" && (
              <div className="mt-3 space-y-2">
                {filterChat.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-soft">لا توجد رسائل</p>
                )}
                {filterChat.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-line bg-white/50 p-3">
                    <p className="text-sm font-bold text-ink">{c.nickname}: <span className="font-normal">{c.message}</span></p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-soft">
                      <span>🕐 {timeTxt(c.created_at)}</span>
                      <span dir="ltr" className="font-mono">{c.device_id}</span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => void runDelete("chat", c.id)}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:opacity-90"
                      >
                        حذف الرسالة
                      </button>
                      <button
                        onClick={() => confirmBanFor(c.device_id, `رسالة: ${c.message.slice(0, 60)}`)}
                        className="rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white hover:opacity-90"
                      >
                        حظر + حذف كل محتواه
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "banned" && (
              <div className="mt-3 space-y-2">
                {banned.length === 0 && (
                  <p className="py-6 text-center text-sm text-ink-soft">لا يوجد جهة محظورة</p>
                )}
                {banned.map((b) => (
                  <div key={b.device_id} className="rounded-2xl border border-line bg-white/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span dir="ltr" className="font-mono text-xs">{b.device_id}</span>
                      <span className="text-[11px] text-ink-soft">منذ {timeTxt(b.banned_at)}</span>
                    </div>
                    {b.reason && <p className="mt-1 text-xs text-ink-soft">السبب: {b.reason}</p>}
                    <button
                      onClick={() => void runUnban(b.device_id)}
                      className="mt-2 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:opacity-90"
                    >
                      رفع الحظر
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {confirmBan && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmBan(null)}>
            <div className="w-full max-w-sm rounded-2xl bg-paper p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-serif text-lg font-bold text-ink">حظر جهاز نهائي</h3>
              <p dir="ltr" className="mt-2 text-center font-mono text-xs">{confirmBan}</p>
              <p className="mt-2 text-sm text-ink-soft">
                سيمنع الجهاز من النشر ويُحذف كل بطاقاته ورسائله فوراً. يمكن التراجع من تبويب «المحظورون».
              </p>
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="سبب الحظر (اختياري)"
                className="mt-3 w-full rounded-xl border border-line bg-white/60 px-4 py-2 text-sm text-ink outline-none focus:border-gold-deep"
              />
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => void runBan()}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? "جارٍ..." : "تأكيد الحظر"}
                </button>
                <button
                  onClick={() => setConfirmBan(null)}
                  className="flex-1 rounded-xl bg-ink/10 px-4 py-2.5 font-bold text-ink hover:bg-ink/20"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}