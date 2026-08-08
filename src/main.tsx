import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EnvironmentDashboard from "./environment-dashboard";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EnvironmentDashboard />
  </StrictMode>,
);
