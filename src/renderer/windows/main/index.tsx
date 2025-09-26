import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nextProvider } from "react-i18next";
import i18n from "../../utils/i18n";
import type { SettingsDiff, SettingsState } from "@src/types/settings";
import "@styles/global.css";

function RootWithI18n() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    window.api.settings
      .get()
      .then((settings: SettingsState) => {
        if (settings.language) {
          i18n.changeLanguage(settings.language);
        }
      })
      .catch((error) => {
        console.error("Failed to load language", error);
      })
      .finally(() => setReady(true));

    unsubscribe = window.api.settings.onChanged((diff: SettingsDiff) => {
      if (diff.changed.language) {
        i18n.changeLanguage(diff.changed.language);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (!ready) return null;
  return (
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Root container not found");
const root = createRoot(container);
root.render(<RootWithI18n />);
