import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { MotionConfig } from "motion/react";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { WarmTooltipGroup } from "./ui/WarmTooltip";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <WarmTooltipGroup>
            <App />
          </WarmTooltipGroup>
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  </React.StrictMode>,
);
