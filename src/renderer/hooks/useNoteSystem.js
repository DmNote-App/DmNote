import { useState, useCallback, useRef, useEffect } from "react";
import { DEFAULT_NOTE_SETTINGS } from "@constants/overlayConfig";

let MIN_NOTE_THRESHOLD_MS = DEFAULT_NOTE_SETTINGS.shortNoteThresholdMs;
let MIN_NOTE_LENGTH_PX = DEFAULT_NOTE_SETTINGS.shortNoteMinLengthPx;
let DELAY_FEATURE_ENABLED = false;

export function useNoteSystem({ noteEffect, noteSettings, laboratoryEnabled }) {
  const notesRef = useRef({});
  const noteEffectEnabled = useRef(true);
  const activeNotes = useRef(new Map());
  // 딜레이 대기 중인 입력(아직 화면에 노트가 생성되지 않음)
  // pressId -> { keyName, pressTime, timeoutId, released, releaseTime }
  const pendingPressesRef = useRef(new Map());
  // 키별 진행 중인 pressId (재입력을 막지 않기 위해 keyup 시 즉시 해제)
  const pendingByKeyRef = useRef(new Map());
  const flowSpeedRef = useRef(DEFAULT_NOTE_SETTINGS.speed);
  const trackHeightRef = useRef(DEFAULT_NOTE_SETTINGS.trackHeight);
  const subscribers = useRef(new Set());
  const labEnabledRef = useRef(false);
  const delayedOptionRef = useRef(false);

  const applyDelayFlag = useCallback(() => {
    DELAY_FEATURE_ENABLED = labEnabledRef.current && delayedOptionRef.current;
  }, []);

  const notifySubscribers = useCallback((event) => {
    subscribers.current.forEach((callback) => callback(event));
  }, []);

  const subscribe = useCallback((callback) => {
    subscribers.current.add(callback);
    return () => subscribers.current.delete(callback);
  }, []);

  const updateLabSettings = useCallback(
    (settings) => {
      flowSpeedRef.current =
        Number(settings?.speed) || DEFAULT_NOTE_SETTINGS.speed;
      trackHeightRef.current =
        Number(settings?.trackHeight) || DEFAULT_NOTE_SETTINGS.trackHeight;
      delayedOptionRef.current = !!settings?.delayedNoteEnabled;
      MIN_NOTE_THRESHOLD_MS =
        Number(settings?.shortNoteThresholdMs) ||
        DEFAULT_NOTE_SETTINGS.shortNoteThresholdMs;
      MIN_NOTE_LENGTH_PX =
        Number(settings?.shortNoteMinLengthPx) ||
        DEFAULT_NOTE_SETTINGS.shortNoteMinLengthPx;
      applyDelayFlag();
    },
    [applyDelayFlag]
  );

  useEffect(() => {
    updateLabSettings(noteSettings || DEFAULT_NOTE_SETTINGS);
  }, [noteSettings, updateLabSettings]);

  useEffect(() => {
    labEnabledRef.current = !!laboratoryEnabled;
    applyDelayFlag();
  }, [laboratoryEnabled, applyDelayFlag]);

  useEffect(() => {
    noteEffectEnabled.current = !!noteEffect;
    if (!noteEffect) {
      for (const pending of pendingPressesRef.current.values()) {
        clearTimeout(pending.timeoutId);
      }
      pendingPressesRef.current.clear();
      pendingByKeyRef.current.clear();
      notesRef.current = {};
      activeNotes.current.clear();
      notifySubscribers({ type: "clear" });
    }
  }, [noteEffect, notifySubscribers]);

  const createNote = useCallback(
    (keyName, startTimeOverride) => {
      const startTime = startTimeOverride ?? performance.now();
      const noteId = `${keyName}_${startTime}`;
      const newNote = {
        id: noteId,
        keyName,
        startTime,
        endTime: null,
        isActive: true,
      };

      const currentNotes = notesRef.current;
      const keyNotes = currentNotes[keyName] || [];
      notesRef.current = {
        ...currentNotes,
        [keyName]: [...keyNotes, newNote],
      };

      notifySubscribers({ type: "add", note: newNote });
      return noteId;
    },
    [notifySubscribers]
  );

  const finalizeNote = useCallback(
    (keyName, noteId, endTimeOverride) => {
      const endTime = endTimeOverride ?? performance.now();
      const currentNotes = notesRef.current;

      if (!currentNotes[keyName]) return;

      let changed = false;
      let finalizedNote = null;
      const newKeyNotes = currentNotes[keyName].map((note) => {
        if (note.id === noteId && note.isActive) {
          changed = true;
          finalizedNote = { ...note, endTime, isActive: false };
          return finalizedNote;
        }
        return note;
      });

      if (changed) {
        notesRef.current = {
          ...currentNotes,
          [keyName]: newKeyNotes,
        };
        notifySubscribers({ type: "finalize", note: finalizedNote });
      }
    },
    [notifySubscribers]
  );

  // 노트 생성/완료 (딜레이 기반)
  const handleKeyDown = useCallback(
    (keyName) => {
      if (!noteEffectEnabled.current) return;
      if (!DELAY_FEATURE_ENABLED) {
        // 원본 동작: 즉시 생성 후 keyup에서 종료
        if (activeNotes.current.has(keyName)) return;
        const noteId = createNote(keyName);
        activeNotes.current.set(keyName, { noteId });
        return;
      }

      // 딜레이 기반 동작
      if (
        pendingByKeyRef.current.has(keyName) ||
        activeNotes.current.has(keyName)
      )
        return;

      const pressTime = performance.now();
      const pressId = `${keyName}_${pressTime}`;

      const timeoutId = setTimeout(() => {
        const pending = pendingPressesRef.current.get(pressId);
        if (!pending) return;
        pendingPressesRef.current.delete(pressId);
        if (pendingByKeyRef.current.get(keyName) === pressId) {
          pendingByKeyRef.current.delete(keyName);
        }

        const startNow = performance.now();

        if (pending.released) {
          const noteId = createNote(keyName, startNow);
          const flowSpeed = flowSpeedRef.current;
          const growMs = (MIN_NOTE_LENGTH_PX * 1000) / flowSpeed;
          setTimeout(() => {
            finalizeNote(keyName, noteId, startNow + growMs);
          }, growMs);
        } else {
          const noteId = createNote(keyName, startNow);
          activeNotes.current.set(keyName, { noteId });
        }
      }, MIN_NOTE_THRESHOLD_MS);

      pendingPressesRef.current.set(pressId, {
        keyName,
        pressTime,
        timeoutId,
        released: false,
        releaseTime: null,
      });
      pendingByKeyRef.current.set(keyName, pressId);
    },
    [createNote, finalizeNote]
  );

  const handleKeyUp = useCallback(
    (keyName) => {
      if (!noteEffectEnabled.current) return;

      if (!DELAY_FEATURE_ENABLED) {
        const activeNote = activeNotes.current.get(keyName);
        if (activeNote) {
          finalizeNote(keyName, activeNote.noteId);
          activeNotes.current.delete(keyName);
        }
        return;
      }

      // 롱노트 진행 중이라면 즉시 종료
      const activeNote = activeNotes.current.get(keyName);
      if (activeNote) {
        finalizeNote(keyName, activeNote.noteId, performance.now());
        activeNotes.current.delete(keyName);
        const pressIdMaybe = pendingByKeyRef.current.get(keyName);
        if (pressIdMaybe) {
          const pending = pendingPressesRef.current.get(pressIdMaybe);
          if (pending) {
            clearTimeout(pending.timeoutId);
            pendingPressesRef.current.delete(pressIdMaybe);
          }
          pendingByKeyRef.current.delete(keyName);
        }
        return;
      }

      // 딜레이 대기 중인 입력에 대해 'released' 표시 (단노트 처리)
      const pressId = pendingByKeyRef.current.get(keyName);
      if (pressId) {
        const pending = pendingPressesRef.current.get(pressId);
        if (pending) {
          pending.released = true;
          pending.releaseTime = performance.now();
        }
        pendingByKeyRef.current.delete(keyName);
      }
    },
    [finalizeNote]
  );

  // 화면 밖으로 나간 노트 제거 (최적화된 버전)
  useEffect(() => {
    let cleanupTimeoutId = null;
    let lastCleanupTime = 0;

    const scheduleCleanup = () => {
      const now = performance.now();
      // 최소 1초 간격으로 cleanup 실행
      if (now - lastCleanupTime < 1000) {
        if (cleanupTimeoutId) clearTimeout(cleanupTimeoutId);
        cleanupTimeoutId = setTimeout(
          scheduleCleanup,
          1000 - (now - lastCleanupTime)
        );
        return;
      }

      const currentTime = performance.now();
      const flowSpeed = flowSpeedRef.current;
      const trackHeight =
        trackHeightRef.current || DEFAULT_NOTE_SETTINGS.trackHeight;

      const currentNotes = notesRef.current;
      let hasChanges = false;
      const updated = {};
      const removedNoteIds = [];

      // 최적화: 빈 객체면 바로 스킵
      const noteEntries = Object.entries(currentNotes);
      if (noteEntries.length === 0) {
        lastCleanupTime = currentTime;
        cleanupTimeoutId = setTimeout(scheduleCleanup, 3000); // 노트가 없으면 더 긴 간격
        return;
      }

      for (const [keyName, keyNotes] of noteEntries) {
        if (!keyNotes || keyNotes.length === 0) continue;

        const filtered = keyNotes.filter((note) => {
          // 활성화된 노트는 항상 유지
          if (note.isActive) return true;

          // 완료된 노트가 화면 밖으로 나갔는지 확인 (여유분 포함)
          const timeSinceCompletion = currentTime - note.endTime;
          const yPosition = (timeSinceCompletion * flowSpeed) / 1000;
          const shouldKeep = yPosition < trackHeight + 200; // 화면 밖으로 완전히 나갈 때까지 여유분
          if (!shouldKeep) {
            removedNoteIds.push(note.id);
          }
          return shouldKeep;
        });

        if (filtered.length !== keyNotes.length) {
          hasChanges = true;
        }

        if (filtered.length > 0) {
          updated[keyName] = filtered;
        }
      }

      if (hasChanges) {
        notesRef.current = updated;
        notifySubscribers({ type: "cleanup", note: { ids: removedNoteIds } });
      }

      lastCleanupTime = currentTime;
      // 적응형 간격: 노트가 많으면 더 자주, 적으면 덜 자주
      const totalNotes = Object.values(updated).reduce(
        (sum, notes) => sum + notes.length,
        0
      );
      const nextInterval =
        totalNotes > 10 ? 1500 : totalNotes > 0 ? 2500 : 4000;
      cleanupTimeoutId = setTimeout(scheduleCleanup, nextInterval);
    };

    // 초기 cleanup 스케줄링
    cleanupTimeoutId = setTimeout(scheduleCleanup, 2000);

    return () => {
      if (cleanupTimeoutId) clearTimeout(cleanupTimeoutId);
    };
  }, [notifySubscribers]);

  return {
    notesRef,
    subscribe,
    handleKeyDown,
    handleKeyUp,
  };
}

