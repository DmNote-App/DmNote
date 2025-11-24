import "@api/dmnoteApi";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@styles/global.css";
import { I18nProvider } from "@contexts/I18nContext";

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
