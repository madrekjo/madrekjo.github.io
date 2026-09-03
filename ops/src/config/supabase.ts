// MADARIK OPS - Configuration
// هذه القيم عامة (anon keys) وتُستخدم فقط للقراءة.
// عمليات الكتابة/الحذف/الحظر تتم عبر الـ OPS Worker (خدمة وسيطة).

export const SUPABASE_PROJECTS = {
  chat: {
    url: "https://biabdoatwfteqwgjdxzc.supabase.co",
    anonKey: "sb_publishable_V7dBpXLxsRDy9D0WdK4aig_xp5vHWJc",
  },
  anon: {
    url: "https://dqrzsllhdcvykoisisoy.supabase.co",
    anonKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcnpzbGxoZGN2eWtvaXNpc295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNTk1MTQsImV4cCI6MjEwMzczNTUxNH0.mkUzwPtybHXW8PD1dpfUQxPhqsu1ZpjVaC1taaOkhr4",
  },
  achievement: {
    url: "https://itflhfhsfzrdfpxvlzrv.supabase.co",
    anonKey: "sb_publishable_3mypt4J1F0sG5RD6oTSZZg_6PNgwoyY",
  },
} as const;

// رابط الـ OPS Worker (الوسيط الإداري)
export const OPS_WORKER_URL =
  "https://madarik-ops.abdalrahmanmadarik.workers.dev";
