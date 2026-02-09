import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initGlobalErrorHandlers } from "./lib/errorLogger";
import { initSessionRecovery } from "./lib/sessionRecovery";

// Initialize error tracking and session recovery
initGlobalErrorHandlers();
initSessionRecovery();

createRoot(document.getElementById("root")!).render(<App />);
