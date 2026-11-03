// 트리 요소 클립보드 - 복사한 노드와 붙일 때 다시 결합할 원본 정보
import { create } from 'zustand';

import type { Node } from '@src/types/generated/elementDocument';

// 복사한 탭과 스프라이트 트리거가 가리키던 키의 canonical (스프라이트 id별) - 다른 탭에 붙일 때 다시 결합
export interface DocumentClipboardSource {
  mode: string;
  triggerCanonicals: Record<string, Record<string, string>>;
  // 레이어 패널에서 접혀 있던 복사한 그룹 - 붙인 그룹도 접는다 (예전과 같다)
  collapsedGroups?: string[];
}

interface DocumentClipboardState {
  nodes: Node[];
  source: DocumentClipboardSource | null;
  set: (nodes: Node[], source?: DocumentClipboardSource) => void;
  clear: () => void;
}

export const useDocumentClipboardStore = create<DocumentClipboardState>(
  (set) => ({
    nodes: [],
    source: null,
    set: (nodes, source) => set({ nodes, source: source ?? null }),
    clear: () => set({ nodes: [], source: null }),
  }),
);
