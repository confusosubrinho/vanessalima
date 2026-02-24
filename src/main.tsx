import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initGlobalErrorHandlers } from "./lib/errorLogger";

const root = createRoot(document.getElementById("root")!);
root.render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// Load error tracking and session recovery after first paint
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => {
    initGlobalErrorHandlers();
    import("./lib/sessionRecovery").then(m => m.initSessionRecovery());
  });
} else {
  setTimeout(() => {
    initGlobalErrorHandlers();
    import("./lib/sessionRecovery").then(m => m.initSessionRecovery());
  }, 2000);
}
