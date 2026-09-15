import { useState, useRef, useCallback } from 'react';
import { useSettingsStore } from '@stores/useSettingsStore';
import { settingsApi } from '@api/modules/app/settingsApi';
import { useTranslation } from '@contexts/useTranslation';

export function usePalette() {
  const { t } = useTranslation();
  const writeSequence = useRef(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [palette, setPalette] = useState(false);
  const backgroundColor = useSettingsStore((state) => state.backgroundColor);
  const setBackgroundColor = useSettingsStore(
    (state) => state.setBackgroundColor,
  );
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const color = draftColor ?? backgroundColor;

  const handleColorChange = useCallback(
    (newColor: string) => {
      const previousColor = useSettingsStore.getState().backgroundColor;
      const sequence = ++writeSequence.current;
      setIsSaving(true);
      setDraftColor(newColor);
      setBackgroundColor(newColor);
      settingsApi
        .update({ backgroundColor: newColor })
        .then(() => {
          if (sequence !== writeSequence.current) return;
          setSaveError(null);
          setDraftColor(null);
          setIsSaving(false);
        })
        .catch(async (error) => {
          console.error('Failed to update background color', error);
          if (sequence !== writeSequence.current) return;
          let restoredColor = previousColor;
          try {
            restoredColor = (await settingsApi.get()).backgroundColor;
          } catch (syncError) {
            console.error('Failed to reload background color', syncError);
          }
          if (sequence !== writeSequence.current) return;
          if (useSettingsStore.getState().backgroundColor === newColor) {
            setBackgroundColor(restoredColor);
          }
          setSaveError(t('common.saveFailed'));
          setIsSaving(false);
        });
    },
    [setBackgroundColor, t],
  );

  const handlePaletteClose = () => {
    if (palette) setPalette(false);
  };

  const handleResetColor = () => {
    handleColorChange('transparent');
  };

  return {
    color,
    saveError,
    isSaving,
    palette,
    setPalette,
    handleColorChange,
    handlePaletteClose,
    handleResetColor,
  };
}
