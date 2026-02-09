import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Defer non-critical initializations
const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Load error tracking and session recovery after first paint
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => {
    import("./lib/errorLogger").then(m => m.initGlobalErrorHandlers());
    import("./lib/sessionRecovery").then(m => m.initSessionRecovery());
  });
} else {
  setTimeout(() => {
    import("./lib/errorLogger").then(m => m.initGlobalErrorHandlers());
    import("./lib/sessionRecovery").then(m => m.initSessionRecovery());
  }, 2000);
}
