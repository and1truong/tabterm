import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App.tsx";
import { getInitialTheme, applyTheme } from "./theme.ts";
import { connect } from "./ws.ts";
import "./index.css";

applyTheme(getInitialTheme());
connect();

window.addEventListener("beforeunload", (e) => {
  e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
