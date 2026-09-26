import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Coordinates,
  CalculationMethod,
  CalculationParameters,
  PrayerTimes as AdhanPrayerTimes,
  HighLatitudeRule,
} from "adhan";

const C = {
  card: "rgba(26,22,14,0.94)",
  border: "rgba(224,180,92,0.30)",
  text: "#f4eeda",
  mut: "#c7b894",
  gold: "#e0b45c",
  goldSoft: "rgba(224,180,92,0.15)",
  inputBg: "rgba(0,0,0,0.35)",
};

const CITIES: Record<string, [number, number]> = {
  "عمّان": [31.9454, 35.9284],
  "إربد": [32.5556, 35.8500],
  "الزرقاء": [32.0727, 36.0870],
  "السلط": [32.0389, 35.7281],
  "مكّة المكرمة": [21.3891, 39.8579],
  "المدينة المنورة": [24.4672, 39.6111],
  "الرياض": [24.7136, 46.6753],
  "جدة": [21.4858, 39.1925],
  "القدس": [31.7683, 35.2137],
  "نابلس": [32.2211, 35.2544],
  "غزّة": [31.5017, 34.4668],
  "القاهرة": [30.0444, 31.2357],
  "دبي": [25.2048, 55.2708],
  "الدوحة": [25.2854, 51.5310],
  "الكويت": [29.3759, 47.9774],
};

interface Method {
  key: string;
  label: string;
  make: () => CalculationParameters;
}

const METHODS: Method[] = [
  { key: "Egyptian", label: "الهيئة المصرية العامة", make: () => CalculationMethod.Egyptian() },
  { key: "MWL", label: "رابطة العالم الإسلامي", make: () => CalculationMethod.MuslimWorldLeague() },
  { key: "UmmAlQura", label: "أم القرى (مكّة)", make: () => CalculationMethod.UmmAlQura() },
  { key: "Karachi", label: "كراتشي", make: () => CalculationMethod.Karachi() },
  {
    key: "ISNA",
    label: "أمريكا الشمالية (ISNA)",
    make: () => {
      const p = new CalculationParameters(null, 15, 15);
      p.method = "Other";
      return p;
    },
  },
  { key: "Dubai", label: "دبي", make: () => CalculationMethod.Dubai() },
  { key: "Qatar", label: "قطر", make: () => CalculationMethod.Qatar() },
  { key: "Kuwait", label: "الكويت", make: () => CalculationMethod.Kuwait() },
  { key: "Turkey", label: "تركيا (ديانة)", make: () => CalculationMethod.Turkey() },
];

const PRAYERS = [
  { key: "fajr", name: "الفجر" },
  { key: "sunrise", name: "الشروق" },
  { key: "dhuhr", name: "الظهر" },
  { key: "asr", name: "العصر" },
  { key: "maghrib", name: "المغرب" },
  { key: "isha", name: "العشاء" },
] as const;

const PREFS_KEY = "prayer-prefs";

interface TimesFields {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

interface Prefs {
  city: keyof typeof CITIES;
  method: string;
  lat: number | null;
  lng: number | null;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as Prefs;
  } catch {
    /* ignore */
  }
  return { city: "عمّان", method: "Egyptian", lat: null, lng: null };
}

function fmt(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function playAdhan() {
  try {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const notes = [392, 440, 392, 440, 494, 440, 392, 330, 392, 330, 294, 262];
    let t = now + 0.05;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
      t += i % 2 === 0 ? 0.95 : 0.55;
    });
    setTimeout(() => ctx.close(), 12000);
  } catch {
    /* ignore */
  }
}

function PrayerRow({ name, time, next }: { name: string; time: Date; next: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 10,
        background: next ? C.goldSoft : "transparent",
        border: next ? `1px solid ${C.border}` : "1px solid transparent",
        fontWeight: next ? 700 : 500,
        color: next ? C.gold : C.text,
      }}
    >
      <span style={{ fontSize: 15 }}>{name}</span>
      <span style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
        {fmt(time)}
        {next ? " ⏰" : ""}
      </span>
    </div>
  );
}

export default function PrayerTimes({ compact }: { compact?: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [alarmOn, setAlarmOn] = useState(false);
  const [notifState, setNotifState] = useState<NotificationPermission>("default");
  const [open, setOpen] = useState(!compact);
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  const [tick, setTick] = useState(() => Date.now());
  const timersRef = useRef<number[]>([]);
  const dayTimerRef = useRef<number | null>(null);

  const lat = prefs.lat ?? CITIES[prefs.city][0];
  const lng = prefs.lng ?? CITIES[prefs.city][1];

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    if (dayTimerRef.current) window.clearTimeout(dayTimerRef.current);
  };

  const times = useMemo(() => {
    const params = (METHODS.find((m) => m.key === prefs.method) ?? METHODS[0]).make();
    params.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
    return new AdhanPrayerTimes(new Coordinates(lat, lng), new Date(), params);
  }, [lat, lng, prefs.method, dayKey, tick]);

  const fields: TimesFields = {
    fajr: times.fajr,
    sunrise: times.sunrise,
    dhuhr: times.dhuhr,
    asr: times.asr,
    maghrib: times.maghrib,
    isha: times.isha,
  };
  const rows = PRAYERS.map((p) => ({
    name: p.name,
    time: fields[p.key as keyof TimesFields],
  }));

  const now = new Date();
  const nextIdx = rows.findIndex((r) => r.time.getTime() > now.getTime() + 15 * 1000);
  const nextName = nextIdx >= 0 ? rows[nextIdx].name : "الفجر (غداً)";
  const nextMs =
    nextIdx >= 0 ? rows[nextIdx].time.getTime() - now.getTime() : null;
  const countdown =
    nextMs != null
      ? nextMs > 60000
        ? `بعد ${Math.round(nextMs / 60000)} دقيقة`
        : nextMs > 5000
          ? "بعد أقل من دقيقة"
          : "الآن"
      : null;

  const schedule = useCallback(() => {
    clearTimers();
    const base = new Date();
    const coords = new Coordinates(lat, lng);
    const params = (METHODS.find((m) => m.key === prefs.method) ?? METHODS[0]).make();
    params.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
    const pt = new AdhanPrayerTimes(coords, base, params);
    const pf = {
      fajr: pt.fajr,
      sunrise: null,
      dhuhr: pt.dhuhr,
      asr: pt.asr,
      maghrib: pt.maghrib,
      isha: pt.isha,
    } as Record<string, Date | null>;
    PRAYERS.forEach((p) => {
      if (p.key === "sunrise") return;
      const ptime = pf[p.key];
      if (!ptime) return;
      const delay = ptime.getTime() - Date.now();
      if (delay > 0) {
        timersRef.current.push(
          window.setTimeout(() => {
            playAdhan();
            if (Notification.permission === "granted") {
              try {
                new Notification("حانت صلاة " + p.name, {
                  body: "اللهم إنك عفوٌّ تحب العفو",
                });
              } catch {
                /* ignore */
              }
            }
          }, delay)
        );
      }
    });
    const tillMidnight =
      new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1).getTime() - Date.now();
    dayTimerRef.current = window.setTimeout(() => {
      setDayKey(new Date().toDateString());
    }, tillMidnight + 2000);
  }, [lat, lng, prefs.method, alarmOn]);

  useEffect(() => {
    if (!alarmOn) {
      clearTimers();
      return;
    }
    schedule();
    return clearTimers;
  }, [alarmOn, schedule]);

  useEffect(() => {
    const iv = window.setInterval(() => setTick(Date.now()), 30000);
    return () => window.clearInterval(iv);
  }, []);

  const toggleAlarm = () => {
    if (!alarmOn) {
      if (!("Notification" in window) || Notification.permission === "denied") {
        playAdhan();
        setAlarmOn(true);
        return;
      }
      Notification.requestPermission().then((p) => {
        setNotifState(p);
        setAlarmOn(true);
      });
    } else {
      setAlarmOn(false);
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPrefs((p) => ({ ...p, lat: pos.coords.latitude, lng: pos.coords.longitude }));
      },
      () => {
        /* ignore */
      }
    );
  };

  const title = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 20 }}>🕌</span>
      <span style={{ fontWeight: 800, fontSize: 16, color: C.gold }}>أوقات الصلاة</span>
      <span style={{ color: C.mut, fontSize: 12, fontWeight: 400 }}>
        {lat.toFixed(2)}°, {lng.toFixed(2)}°
      </span>
    </div>
  );

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        padding: "14px 16px",
        color: C.text,
        boxShadow: "0 8px 30px rgba(0,0,0,.25)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {title}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              background: C.inputBg,
              border: `1px solid ${C.border}`,
              color: C.text,
              borderRadius: 10,
              padding: "5px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {open ? "إخفاء" : "التفاصيل"}
          </button>
          <button
            onClick={toggleAlarm}
            style={{
              background: alarmOn ? C.goldSoft : C.inputBg,
              border: `1px solid ${C.border}`,
              color: alarmOn ? C.gold : C.mut,
              borderRadius: 10,
              padding: "5px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 700,
            }}
            title="منبه آذان بسيط + إشعار"
          >
            {alarmOn ? "⏰ المنبه مفعّل" : "🔔 فعّل المنبه"}
          </button>
        </div>
      </div>

      {alarmOn && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 10,
            background: C.goldSoft,
            color: C.gold,
            fontSize: 12,
          }}
        >
          سيُنبهك عند كل صلاة اليوم
          {notifState !== "granted" && " (صوت فقط — أعد السماح بالإشعارات للتنبيه بظهر الشاشة)"}
          . اترك الصفحة مفتوحة لو أردت المنبه.
        </div>
      )}

      {open && (
        <>
          <div
            style={{
              marginTop: 10,
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0,1fr))",
              gap: 6,
            }}
          >
            {rows.map((r, i) => (
              <PrayerRow key={r.name} name={r.name} time={r.time} next={i === nextIdx} />
            ))}
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
              fontSize: 12,
              color: C.mut,
            }}
          >
            <span>
              الصلاة القادمة:{" "}
              <b style={{ color: C.gold }}>{nextName}</b>
              {countdown ? ` ${countdown}` : ""}
            </span>
            <span>{new Intl.DateTimeFormat("ar", { day: "numeric", month: "long" }).format(new Date())}</span>
          </div>

          <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
              <select
                value={prefs.city}
                onChange={(e) =>
                  setPrefs((p) => ({ ...p, city: e.target.value as keyof typeof CITIES, lat: null, lng: null }))
                }
                style={selectStyle}
              >
                {Object.keys(CITIES).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={prefs.method}
                onChange={(e) => setPrefs((p) => ({ ...p, method: e.target.value }))}
                style={selectStyle}
              >
                {METHODS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                onClick={useMyLocation}
                style={{
                  background: C.inputBg,
                  border: `1px solid ${C.border}`,
                  color: C.gold,
                  borderRadius: 10,
                  padding: "6px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                📍 موقعي
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const selectStyle: CSSProperties = {
  background: C.inputBg,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "6px 8px",
  fontSize: 12,
  outline: "none",
};