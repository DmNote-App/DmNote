import { useState, useCallback, useRef, useEffect } from "react";
import { DEFAULT_NOTE_SETTINGS } from "@constants/overlayConfig";
import { createNoteBuffer } from "@stores/noteBuffer";

let MIN_NOTE_THRESHOLD_MS = DEFAULT_NOTE_SETTINGS.shortNoteThresholdMs;
let MIN_NOTE_LENGTH_PX = DEFAULT_NOTE_SETTINGS.shortNoteMinLengthPx;
let DELAY_FEATURE_ENABLED = false;

const acquireNote = (pool) => {
  const note = pool.pop();
  if (note) {
    return note;
  }
  return {
    id: "",
    keyName: "",
    startTime: 0,
    endTime: null,
    isActive: false,
  };
};

const releaseNote = (note, pool) => {
  note.id = "";
  note.keyName = "";
  note.startTime = 0;
  note.endTime = null;
  note.isActive = false;
  pool.push(note);
};

const releaseAllNotes = (notesByKey, pool, lookup) => {
  const keys = Object.keys(notesByKey);
  for (const keyName of keys) {
    const keyNotes = notesByKey[keyName];
    if (!keyNotes) {
      delete notesByKey[keyName];
      continue;
    }
    for (const note of keyNotes) {
      if (!note) continue;
      lookup.delete(note.id);
      releaseNote(note, pool);
    }
    keyNotes.length = 0;
    delete notesByKey[keyName];
  }
};

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
  const notePoolRef = useRef([]);
  const noteLookupRef = useRef(new Map());
  const noteBufferRef = useRef(createNoteBuffer());
  const labEnabledRef = useRef(false);
  const delayedOptionRef = useRef(false);
  // 이벤트 기반 클린업을 위한 refs
  const cleanupTimerRef = useRef(null);
  const nextCleanupTimeRef = useRef(Infinity);

  const applyDelayFlag = useCallback(() => {
    DELAY_FEATURE_ENABLED = labEnabledRef.current && delayedOptionRef.current;
  }, []);

  const notifySubscribers = useCallback((event) => {
    if (subscribers.current.size === 0) return;
    subscribers.current.forEach((callback) => callback(event));
  }, []);

  const subscribe = useCallback((callback) => {
    subscribers.current.add(callback);
    return () => subscribers.current.delete(callback);
  }, []);

  // In-place 클린업 함수
  const runCleanup = useCallback(() => {
    const currentTime = performance.now();
    const flowSpeed = flowSpeedRef.current;
    const trackHeight =
      trackHeightRef.current || DEFAULT_NOTE_SETTINGS.trackHeight;
    const currentNotes = notesRef.current;
    const removedNoteIds = [];
    const removedNotes = [];
    let hasChanges = false;

    // 각 keyName에 대해 in-place로 배열 정리
    for (const keyName in currentNotes) {
      const keyNotes = currentNotes[keyName];
      if (!keyNotes || keyNotes.length === 0) {
        delete currentNotes[keyName];
        hasChanges = true;
        continue;
      }

      let writeIndex = 0; // 유지할 노트를 쓸 위치
      for (let readIndex = 0; readIndex < keyNotes.length; readIndex++) {
        const note = keyNotes[readIndex];
        let shouldKeep = true;

        // 활성화된 노트는 항상 유지
        if (!note.isActive) {
          // 완료된 노트가 화면 밖으로 나갔는지 확인
          const timeSinceCompletion = currentTime - note.endTime;
          const yPosition = (timeSinceCompletion * flowSpeed) / 1000;
          shouldKeep = yPosition < trackHeight + 200;

          if (!shouldKeep) {
            const removedId = note.id;
            removedNoteIds.push(removedId);
            noteLookupRef.current.delete(removedId);
            removedNotes.push(note);
            hasChanges = true;
          }
        }

        if (shouldKeep) {
          if (writeIndex !== readIndex) {
            keyNotes[writeIndex] = note;
          }
          writeIndex++;
        }
      }

      // 배열 길이 조정
      if (writeIndex < keyNotes.length) {
        keyNotes.length = writeIndex;
        hasChanges = true;
      }

      // 빈 배열이면 키 제거
      if (keyNotes.length === 0) {
        delete currentNotes[keyName];
      }
    }

    // 클린업 상태 초기화
    cleanupTimerRef.current = null;
    nextCleanupTimeRef.current = Infinity;

    // 구독자에게 알림
    if (removedNoteIds.length > 0) {
      const buffer = noteBufferRef.current;
      for (const removedId of removedNoteIds) {
        buffer.release(removedId);
      }
    }

    if (hasChanges && removedNoteIds.length > 0) {
      notifySubscribers({
        type: "cleanup",
        note: { ids: removedNoteIds },
        activeCount: noteBufferRef.current.activeCount,
        version: noteBufferRef.current.version,
      });
    }

    if (removedNotes.length > 0) {
      const pool = notePoolRef.current;
      for (const note of removedNotes) {
        releaseNote(note, pool);
      }
    }

    // 다음 클린업 스케줄링: 남은 비활성 노트 중 가장 먼저 사라질 노트 찾기
    let earliestCleanupTime = Infinity;
    for (const keyName in currentNotes) {
      const keyNotes = currentNotes[keyName];
      if (!keyNotes) continue;

      for (const note of keyNotes) {
        if (!note.isActive && note.endTime != null) {
          // 이 노트가 화면 밖으로 나갈 시간 계산
          const travelTimeMs = ((trackHeight + 200) * 1000) / flowSpeed;
          const cleanupTime = note.endTime + travelTimeMs;
          if (cleanupTime < earliestCleanupTime) {
            earliestCleanupTime = cleanupTime;
          }
        }
      }
    }

    // 다음 클린업이 필요하면 스케줄
    if (earliestCleanupTime < Infinity) {
      const delay = Math.max(0, earliestCleanupTime - performance.now());
      cleanupTimerRef.current = setTimeout(runCleanup, delay);
      nextCleanupTimeRef.current = earliestCleanupTime;
    }
  }, [notifySubscribers]);

  // 이벤트 기반 클린업 스케줄러
  const scheduleCleanup = useCallback(
    (finalizedNote) => {
      if (!finalizedNote || !finalizedNote.endTime) return;

      const flowSpeed = flowSpeedRef.current;
      const trackHeight =
        trackHeightRef.current || DEFAULT_NOTE_SETTINGS.trackHeight;

      // 이 노트가 화면 밖으로 완전히 사라질 시간 계산
      const travelTimeMs = ((trackHeight + 200) * 1000) / flowSpeed;
      const newCleanupTime = finalizedNote.endTime + travelTimeMs;

      // 현재 예약된 것보다 더 빨리 실행해야 하는 경우에만 재스케줄
      if (newCleanupTime < nextCleanupTimeRef.current) {
        if (cleanupTimerRef.current !== null) {
          clearTimeout(cleanupTimerRef.current);
        }
        const delay = Math.max(0, newCleanupTime - performance.now());
        cleanupTimerRef.current = setTimeout(runCleanup, delay);
        nextCleanupTimeRef.current = newCleanupTime;
      }
    },
    [runCleanup]
  );

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
      // 클린업 타이머 취소
      if (cleanupTimerRef.current !== null) {
        clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
        nextCleanupTimeRef.current = Infinity;
      }
      // 대기 중인 입력 정리
      for (const pending of pendingPressesRef.current.values()) {
        clearTimeout(pending.timeoutId);
      }
      pendingPressesRef.current.clear();
      pendingByKeyRef.current.clear();
      releaseAllNotes(
        notesRef.current,
        notePoolRef.current,
        noteLookupRef.current
      );
      noteLookupRef.current.clear();
      activeNotes.current.clear();
      noteBufferRef.current.clear();
      notifySubscribers({
        type: "clear",
        activeCount: 0,
        version: noteBufferRef.current.version,
      });
    }
  }, [noteEffect, notifySubscribers]);

  const createNote = useCallback(
    (keyName, startTimeOverride) => {
      const startTime = startTimeOverride ?? performance.now();
      const noteId = `${keyName}_${startTime}`;
      const currentNotes = notesRef.current;
      let keyNotes = currentNotes[keyName];
      if (!keyNotes) {
        keyNotes = [];
        currentNotes[keyName] = keyNotes;
      }

      const newNote = acquireNote(notePoolRef.current);
      newNote.id = noteId;
      newNote.keyName = keyName;
      newNote.startTime = startTime;
      newNote.endTime = null;
      newNote.isActive = true;

      keyNotes.push(newNote);
      noteLookupRef.current.set(noteId, newNote);

      const slot = noteBufferRef.current.allocate(keyName, noteId, startTime);
      if (slot >= 0) {
        notifySubscribers({
          type: "add",
          note: newNote,
          slot,
          activeCount: noteBufferRef.current.activeCount,
          version: noteBufferRef.current.version,
        });
      } else {
        notifySubscribers({ type: "add", note: newNote });
      }
      return noteId;
    },
    [notifySubscribers]
  );

  const finalizeNote = useCallback(
    (keyName, noteId, endTimeOverride) => {
      const endTime = endTimeOverride ?? performance.now();
      const note = noteLookupRef.current.get(noteId);
      if (!note || note.keyName !== keyName || !note.isActive) return;

      note.endTime = endTime;
      note.isActive = false;
      const slot = noteBufferRef.current.finalize(noteId, endTime);
      notifySubscribers({
        type: "finalize",
        note,
        slot,
        activeCount: noteBufferRef.current.activeCount,
        version: noteBufferRef.current.version,
      });
      // 이벤트 기반 클린업 스케줄링
      scheduleCleanup(note);
    },
    [notifySubscribers, scheduleCleanup]
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

  // 화면 밖으로 나간 노트 제거 - 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current !== null) {
        clearTimeout(cleanupTimerRef.current);
      }
      releaseAllNotes(
        notesRef.current,
        notePoolRef.current,
        noteLookupRef.current
      );
      noteLookupRef.current.clear();
      noteBufferRef.current.clear();
    };
  }, []);

  // 노트 효과가 꺼져있으면 no-op 함수 반환하여 오버헤드 최소화
  const noOpHandler = useCallback(() => {}, []);
  const effectiveHandleKeyDown = noteEffect ? handleKeyDown : noOpHandler;
  const effectiveHandleKeyUp = noteEffect ? handleKeyUp : noOpHandler;

  return {
    notesRef,
    subscribe,
    handleKeyDown: effectiveHandleKeyDown,
    handleKeyUp: effectiveHandleKeyUp,
    noteBuffer: noteBufferRef.current,
    updateTrackLayouts: (layouts) =>
      noteBufferRef.current.updateTrackLayouts(layouts),
  };
}
