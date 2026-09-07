import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://njdvogvquzofnqqwyvyl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZHZvZ3ZxdXpvZm5xcXd5dnlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxOTIyODQsImV4cCI6MjEwMzc2ODI4NH0.a0zbP1xm8rFuoTFSvbscdWo7HPZR2a9Dq3DEtZf_ua4"
);