import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import { resolveIdentity } from "./lib/device-identity";

// الهوية مرتبطة برمز الجهاز: نستعيدها قبل أول رسم، فمسح بيانات المتصفح
// لا يولّد هوية جديدة. لازم ينتهي قبل أن يقرأ أي مكوّن getDeviceId().
void resolveIdentity().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});