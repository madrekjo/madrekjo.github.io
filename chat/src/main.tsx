import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installNetworkResilience } from "./lib/networkResilience";

installNetworkResilience();

createRoot(document.getElementById("root")!).render(<App />);
