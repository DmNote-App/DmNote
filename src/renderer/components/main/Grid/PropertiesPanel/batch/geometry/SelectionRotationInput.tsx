import { useLayoutEffect, useRef } from 'react';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import { useDocumentSelectionStore } from '../../../document/useDocumentSelectionStore';
import {
  documentRotationEntries,
  documentSelectionFrame,
  startDocumentGroupRotation,
} from '../../../document/documentGroupRotation';
import RotationInputRow from '../../controls/RotationInputRow';

interface SelectionRotationInputProps {
  label: string;
}

const EMPTY_IDS: string[] = [];

type RotationSession = ReturnType<typeof startDocumentGroupRotation>;

// 여러 트리 요소 묶음 회전 - 캔버스 묶음 회전 손잡이와 같은 틀·같은 커밋 (플러그인 요소가 섞이면 닫는다)
const SelectionRotationInput = ({ label }: SelectionRotationInputProps) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  const scene = useElementDocumentScene(mode);
  const ids = useDocumentSelectionStore((state) =>
    state.sceneId === mode ? state.selectedIds : EMPTY_IDS,
  );
  const withPlugins = useGridSelectionStore(
    (state) => state.selectedElements.length > 0,
  );
  const sessionRef = useRef<RotationSession | null>(null);
  const mountedRef = useRef(false);
  const sessionKey = `${mode}:${ids.join(',')}`;
  const cancel = () => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
  };
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      // 자식 숫자 입력의 언마운트 정산이 새 미리보기를 남기지 못하게 한다
      mountedRef.current = false;
      sessionRef.current?.cancel();
      sessionRef.current = null;
    };
  }, [sessionKey]);

  const { entries, rotatable } = documentRotationEntries(scene, ids);
  const frame = documentSelectionFrame(entries);
  if (!frame || !rotatable || entries.length < 2 || withPlugins) return null;
  const preview = (value: number) => {
    if (!mountedRef.current) return false;
    if (!sessionRef.current) {
      sessionRef.current = startDocumentGroupRotation(mode, entries, frame);
    }
    return sessionRef.current.preview(value);
  };
  return (
    <RotationInputRow
      label={label}
      value={frame.rotation}
      onPreview={preview}
      onChange={(value) => {
        if (!preview(value)) return;
        void sessionRef.current?.commit(value);
        sessionRef.current = null;
      }}
      onCancel={cancel}
    />
  );
};

export default SelectionRotationInput;
