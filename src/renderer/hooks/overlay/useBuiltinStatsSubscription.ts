import { useEffect } from 'react';
import { useKeyStore } from '@stores/data/useKeyStore';
import { useElementDocumentScene } from '@src/renderer/editor/document/elementDocumentRuntime';
import { treeModeArrays } from '@src/renderer/elementKinds/runtime/treeModeArrays';
import { applyStatsSnapshot } from '@stores/signals/statsSignals';

export function useBuiltinStatsSubscription() {
  // 지금 탭 트리에 통계를 읽는 요소(스탯·그래프)가 있을 때만 구독한다
  const selectedKeyType = useKeyStore((state) => state.selectedKeyType);
  const { itemArrays } = treeModeArrays(
    useElementDocumentScene(selectedKeyType),
  );
  const hasAnyStatConsumer =
    itemArrays.statPositions.length > 0 || itemArrays.graphPositions.length > 0;

  useEffect(() => {
    if (!hasAnyStatConsumer) {
      return;
    }

    // 초기 스냅샷
    try {
      applyStatsSnapshot(window.api.stats.get());
    } catch {
      // ignore
    }

    const unsubscribe = window.api.stats.subscribe((stats) => {
      applyStatsSnapshot(stats);
    });

    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [hasAnyStatConsumer]);
}
