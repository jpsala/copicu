import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.createElement("div");
root.id = "probe-root";
document.body.appendChild(root);

createRoot(root).render(
  <StrictMode>
    <input aria-label="Probe input" defaultValue="react" />
  </StrictMode>,
);
