// 요소 문서 구조 전환 전후 비교 측정 - 앱을 그대로 띄운 채 공개 API·키보드 입력만으로
// 같은 시나리오를 재현한다. 저장 구조가 바뀌어도 시나리오가 그대로 돌게 내부 스토어를 쓰지 않는다
import { internalApi } from '@api/internalApi';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import {
  afterPaintOpportunity,
  summarizeDistribution,
  type Distribution,
} from '../controls/shadowToggleBenchmark';

export const BENCHMARK_SEED_TABS = ['4key', '5key'] as const;
export const BENCHMARK_KEYS_PER_TAB = 150;
export const BENCHMARK_STATS_PER_TAB = 30;
export const BENCHMARK_GRAPHS_PER_TAB = 10;
export const BENCHMARK_KNOBS_PER_TAB = 10;

const KEY_NAMES = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'0123456789'.split(''),
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
];

type JsonRecord = Record<string, unknown>;

interface BenchmarkConfig {
  phase: 'seed' | 'measure';
  reportUrl: string;
  iterations: number;
}

interface MeasureResult {
  phase: 'measure';
  userAgent: string;
  timeOriginEpochMs: number;
  firstContentfulPaintMs: number | null;
  editableMs: number;
  arrowNudgePaintMs: Distribution;
  apiCommitRoundTripMs: Distribution;
  tabSwitchPaintMs: Distribution;
  pasteFiftyPaintMs: Distribution;
  documentReplaceMs: Distribution;
  samples: Record<string, number[]>;
}

const readConfig = (): BenchmarkConfig | null => {
  const query = new URLSearchParams(window.location.search);
  const port = query.get('element-benchmark');
  if (!port) return null;
  const phase = query.get('phase') === 'seed' ? 'seed' : 'measure';
  return {
    phase,
    reportUrl: `http://127.0.0.1:${port}/element-benchmark`,
    iterations: Number(query.get('iterations') ?? 30),
  };
};

const report = async (url: string, body: unknown) => {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body),
  });
};

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 60_000,
): Promise<void> => {
  const startedAt = performance.now();
  while (!predicate()) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error(
        `측정 대기 시간 초과 (visibility=${document.visibilityState})`,
      );
    }
    // 창이 가려져 그리기가 멈춰도 시간 초과를 볼 수 있게 타이머와 겨룬다
    await Promise.race([
      nextFrame(),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
  }
};

const keyElementCount = () =>
  document.querySelectorAll('[data-key-element]').length;

// 플러그인 공개 API와 같은 구현
const api = () => internalApi;

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const withoutId = (value: unknown): JsonRecord => {
  const copy = cloneJson(value) as JsonRecord;
  delete copy.id;
  return copy;
};

// 탭마다 키·스탯·그래프·노브를 격자로 채운다 - 기존 요소를 본떠 새 신원으로 만든다
const buildSeedChanges = (document: JsonRecord): JsonRecord => {
  const keys = cloneJson(document.keys) as Record<string, unknown[]>;
  const keyPositions = cloneJson(document.keyPositions) as Record<
    string,
    unknown[]
  >;
  const statPositions = cloneJson(document.statPositions) as Record<
    string,
    unknown[]
  >;
  const graphPositions = cloneJson(document.graphPositions) as Record<
    string,
    unknown[]
  >;
  const knobPositions = cloneJson(document.knobPositions) as Record<
    string,
    unknown[]
  >;
  const keyTemplate = withoutId(keyPositions['4key'][0]);
  const statTemplate = withoutId(statPositions['4key']?.[0] ?? keyTemplate);
  const place = (template: JsonRecord, index: number, column: number) => ({
    ...template,
    dx: 20 + (index % column) * 70,
    dy: 20 + Math.floor(index / column) * 70,
  });
  for (const tab of BENCHMARK_SEED_TABS) {
    keys[tab] = Array.from(
      { length: BENCHMARK_KEYS_PER_TAB },
      (_, index) => KEY_NAMES[index % KEY_NAMES.length],
    );
    keyPositions[tab] = Array.from(
      { length: BENCHMARK_KEYS_PER_TAB },
      (_, index) => place(keyTemplate, index, 15),
    );
    statPositions[tab] = Array.from(
      { length: BENCHMARK_STATS_PER_TAB },
      (_, index) => ({
        ...place(statTemplate, index, 15),
        statType: 'kps',
        dy: 800 + Math.floor(index / 15) * 70,
      }),
    );
    graphPositions[tab] = Array.from(
      { length: BENCHMARK_GRAPHS_PER_TAB },
      (_, index) => ({
        ...place(keyTemplate, index, 5),
        width: 200,
        height: 100,
        dy: 1000 + Math.floor(index / 5) * 120,
        dx: 20 + (index % 5) * 220,
        statType: 'kps',
        graphType: 'line',
        graphSpeed: 1000,
        graphColor: '#FFFFFF',
      }),
    );
    knobPositions[tab] = Array.from(
      { length: BENCHMARK_KNOBS_PER_TAB },
      (_, index) => ({
        ...place(keyTemplate, index, 10),
        dy: 1300,
      }),
    );
  }
  return {
    schemaVersion: 1,
    keys,
    keyPositions,
    statPositions,
    graphPositions,
    knobPositions,
  };
};

const commitChanges = async (changes: JsonRecord) => {
  const current = await api().editor.get();
  const result = (await api().editor.commit({
    baseRevision: current.revision,
    mutationId: crypto.randomUUID(),
    changes,
    multiKey: true,
  } as never)) as { success?: boolean; error?: unknown };
  if (result && result.success === false) {
    throw new Error(`커밋 실패: ${JSON.stringify(result.error)}`);
  }
  return current;
};

const progress = (config: BenchmarkConfig, step: string) =>
  report(config.reportUrl, {
    phase: 'progress',
    step: `${step} (visibility=${document.visibilityState})`,
  });

const seed = async (config: BenchmarkConfig) => {
  await progress(config, 'wait-keys');
  await waitFor(() => keyElementCount() > 0);
  await progress(config, 'commit');
  const { document } = await api().editor.get();
  const seeded = buildSeedChanges(document as unknown as JsonRecord);
  // 그래프·노브 템플릿 값은 백엔드가 각 종류 기본값으로 맞춘다
  await commitChanges(seeded);
  await progress(config, 'set-mode');
  await api().keys.setMode('4key');
  await waitFor(() => keyElementCount() >= BENCHMARK_KEYS_PER_TAB);
  await report(config.reportUrl, { phase: 'seed', ok: true });
};

const firstContentfulPaint = (): number | null => {
  const entry = performance
    .getEntriesByType('paint')
    .find((paint) => paint.name === 'first-contentful-paint');
  return entry ? entry.startTime : null;
};

// 스타일 변경이 화면에 나갈 기회까지
const paintAfterMutation = async (
  action: () => void | Promise<void>,
  done: () => boolean,
): Promise<number> => {
  const startedAt = performance.now();
  await action();
  await waitFor(done, 10_000);
  await afterPaintOpportunity();
  return performance.now() - startedAt;
};

const dispatchKey = (key: string, init: KeyboardEventInit = {}) => {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, ...init }),
  );
  window.dispatchEvent(
    new KeyboardEvent('keyup', { key, bubbles: true, ...init }),
  );
};

const firstKeyNode = () =>
  document.querySelector<HTMLElement>('[data-key-element]');

const measure = async (config: BenchmarkConfig) => {
  const samples: Record<string, number[]> = {
    arrowNudgePaintMs: [],
    apiCommitRoundTripMs: [],
    tabSwitchPaintMs: [],
    pasteFiftyPaintMs: [],
    documentReplaceMs: [],
  };
  await waitFor(() => keyElementCount() >= BENCHMARK_KEYS_PER_TAB);
  const editableMs = performance.now();
  // 이 대기 구간 가운데에서 창 메모리를 잰다
  await progress(config, 'idle');
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const { document: initial } = await api().editor.get();
  const keyIds = (
    (initial.keyPositions as Record<string, Array<{ id: string }>>)['4key'] ??
    []
  ).map((position) => position.id);

  // 방향키 이동 - 선택한 키 하나가 화면에서 움직일 때까지
  await progress(config, 'arrow-nudge');
  useGridSelectionStore
    .getState()
    .setSelectedElements([{ type: 'key', id: keyIds[0], index: 0 }]);
  await afterPaintOpportunity();
  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const node = firstKeyNode();
    const before = node?.getAttribute('style') ?? '';
    samples.arrowNudgePaintMs.push(
      await paintAfterMutation(
        () => dispatchKey(iteration % 2 === 0 ? 'ArrowRight' : 'ArrowLeft'),
        () => (firstKeyNode()?.getAttribute('style') ?? '') !== before,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  useGridSelectionStore.getState().clearSelection();
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // 공개 API 커밋 왕복 - 키 하나의 위치를 바꾸는 커밋
  await progress(config, 'api-commit');
  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const { revision, document } = await api().editor.get();
    const positions = cloneJson(document.keyPositions) as Record<
      string,
      Array<{ dx: number }>
    >;
    positions['4key'][1].dx += iteration % 2 === 0 ? 1 : -1;
    const startedAt = performance.now();
    await api().editor.commit({
      baseRevision: revision,
      mutationId: crypto.randomUUID(),
      changes: { schemaVersion: 1, keyPositions: positions },
    } as never);
    samples.apiCommitRoundTripMs.push(performance.now() - startedAt);
  }

  // 탭 전환 - 다른 탭의 키가 모두 그려질 때까지
  await progress(config, 'tab-switch');
  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const target = iteration % 2 === 0 ? '5key' : '4key';
    const before = firstKeyNode();
    samples.tabSwitchPaintMs.push(
      await paintAfterMutation(
        async () => {
          await api().keys.setMode(target);
        },
        () =>
          firstKeyNode() !== before &&
          keyElementCount() >= BENCHMARK_KEYS_PER_TAB,
      ),
    );
  }
  await api().keys.setMode('4key');
  await waitFor(() => keyElementCount() >= BENCHMARK_KEYS_PER_TAB);

  // 복사·붙여넣기 50개 - 붙여넣은 키가 화면에 나올 때까지, 매번 되돌린다
  await progress(config, 'paste');
  const pasteRounds = Math.min(config.iterations, 10);
  for (let iteration = 0; iteration < pasteRounds; iteration += 1) {
    const { revision, document } = await api().editor.get();
    const ids = (
      document.keyPositions as Record<string, Array<{ id: string }>>
    )['4key']
      .slice(0, 50)
      .map((position, index) => ({
        type: 'key' as const,
        id: position.id,
        index,
      }));
    useGridSelectionStore.getState().setSelectedElements(ids);
    await afterPaintOpportunity();
    const modifier = navigator.userAgent.includes('Mac')
      ? { metaKey: true }
      : { ctrlKey: true };
    dispatchKey('c', modifier);
    await afterPaintOpportunity();
    const countBefore = keyElementCount();
    samples.pasteFiftyPaintMs.push(
      await paintAfterMutation(
        () => dispatchKey('v', modifier),
        () => keyElementCount() >= countBefore + 50,
      ),
    );
    useGridSelectionStore.getState().clearSelection();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const restored = await api().editor.get();
    await api().editor.commit({
      baseRevision: restored.revision,
      mutationId: crypto.randomUUID(),
      changes: {
        schemaVersion: 1,
        keys: document.keys,
        keyPositions: document.keyPositions,
      },
      multiKey: true,
    } as never);
    void revision;
    await waitFor(() => keyElementCount() === countBefore);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // 문서 통째 교체(프리셋 불러오기 대용) - 모든 컬렉션을 바꾸는 커밋이 화면에 나올 때까지
  await progress(config, 'document-replace');
  const replaceRounds = Math.min(config.iterations, 10);
  for (let iteration = 0; iteration < replaceRounds; iteration += 1) {
    const { revision, document } = await api().editor.get();
    const shifted = cloneJson(document) as unknown as JsonRecord;
    for (const field of [
      'keyPositions',
      'statPositions',
      'graphPositions',
      'knobPositions',
    ]) {
      const collection = shifted[field] as Record<
        string,
        Array<{ dx: number }>
      >;
      for (const tab of Object.keys(collection)) {
        for (const position of collection[tab]) {
          position.dx += iteration % 2 === 0 ? 5 : -5;
        }
      }
    }
    const node = firstKeyNode();
    const before = node?.getAttribute('style') ?? '';
    samples.documentReplaceMs.push(
      await paintAfterMutation(
        async () => {
          await api().editor.commit({
            baseRevision: revision,
            mutationId: crypto.randomUUID(),
            changes: {
              schemaVersion: 1,
              keys: shifted.keys,
              keyPositions: shifted.keyPositions,
              statPositions: shifted.statPositions,
              graphPositions: shifted.graphPositions,
              knobPositions: shifted.knobPositions,
            },
            multiKey: true,
          } as never);
        },
        () => (firstKeyNode()?.getAttribute('style') ?? '') !== before,
      ),
    );
  }

  const result: MeasureResult = {
    phase: 'measure',
    userAgent: navigator.userAgent,
    timeOriginEpochMs: performance.timeOrigin,
    firstContentfulPaintMs: firstContentfulPaint(),
    editableMs,
    arrowNudgePaintMs: summarizeDistribution(samples.arrowNudgePaintMs),
    apiCommitRoundTripMs: summarizeDistribution(samples.apiCommitRoundTripMs),
    tabSwitchPaintMs: summarizeDistribution(samples.tabSwitchPaintMs),
    pasteFiftyPaintMs: summarizeDistribution(samples.pasteFiftyPaintMs),
    documentReplaceMs: summarizeDistribution(samples.documentReplaceMs),
    samples,
  };
  await report(config.reportUrl, result);
};

export const startElementDocumentBenchmark = async (): Promise<void> => {
  const config = readConfig();
  if (!config) return;
  try {
    await report(config.reportUrl, { phase: 'started' });
    if (config.phase === 'seed') await seed(config);
    else await measure(config);
  } catch (error) {
    await report(config.reportUrl, {
      phase: config.phase,
      error:
        error instanceof Error
          ? `${error.message}\n${error.stack ?? ''}`
          : JSON.stringify(error),
    });
  }
};
