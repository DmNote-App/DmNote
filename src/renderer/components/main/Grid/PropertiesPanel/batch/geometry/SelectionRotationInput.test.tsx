import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Frame, Scene } from '@src/types/generated/elementDocument';

const mocks = vi.hoisted(() => ({
  scene: undefined as Scene | undefined,
  edit: vi.fn((_ops: unknown[], _options?: unknown) => Promise.resolve(null)),
  row: vi.fn(),
}));

vi.mock('@src/renderer/editor/document/elementDocumentRuntime', () => ({
  useElementDocumentScene: () => mocks.scene,
  getElementDocumentStore: () => null,
}));
vi.mock('../../../document/documentEditActions', () => ({
  editDocument: mocks.edit,
}));
vi.mock('../../controls/RotationInputRow', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.row(props);
    return null;
  },
}));

import { useKeyStore } from '@stores/data/useKeyStore';
import { useGridSelectionStore } from '@stores/grid/useGridSelectionStore';
import { useDocumentSelectionStore } from '../../../document/useDocumentSelectionStore';
import SelectionRotationInput from './SelectionRotationInput';

const box = (x: number, rotation = 0): Frame => ({
  x,
  y: 0,
  width: 20,
  height: 20,
  rotation,
});

const element = (id: string, frame: Frame) => ({
  type: 'element' as const,
  id,
  kind: 'key',
  frame,
});

type RowProps = {
  value: number;
  onPreview: (value: number) => boolean;
  onChange: (value: number) => void;
};

describe('일괄 패널 회전 입력', () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = () =>
    act(() => {
      root.render(<SelectionRotationInput label="회전" />);
    });
  const lastRow = () => mocks.row.mock.lastCall?.[0] as RowProps | undefined;

  beforeEach(() => {
    mocks.edit.mockClear();
    mocks.row.mockClear();
    mocks.scene = {
      nodes: [element('a', box(0, 10)), element('b', box(40))],
    };
    useKeyStore.setState({ selectedKeyType: '4key' });
    useGridSelectionStore.setState({ selectedElements: [] });
    useDocumentSelectionStore.setState({
      sceneId: '4key',
      selectedIds: ['a', 'b'],
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('트리 요소 여럿이면 첫 요소 회전을 보여 주고 바꾸면 묶음 회전 한 커밋', async () => {
    render();
    expect(lastRow()?.value).toBe(10);
    await act(async () => lastRow()!.onChange(40));
    const ops = mocks.edit.mock.calls[0][0] as Array<{
      op: string;
      id: string;
      frame: { rotation: number };
    }>;
    expect(ops.map(({ op, id }) => [op, id])).toEqual([
      ['setFrame', 'a'],
      ['setFrame', 'b'],
    ]);
    expect(ops[0].frame.rotation).toBe(40);
    expect(ops[1].frame.rotation).toBe(30);
  });

  it('하나뿐이거나 플러그인 요소가 섞이면 닫는다', () => {
    useDocumentSelectionStore.setState({ selectedIds: ['a'] });
    render();
    expect(mocks.row).not.toHaveBeenCalled();
    useDocumentSelectionStore.setState({ selectedIds: ['a', 'b'] });
    useGridSelectionStore.setState({
      selectedElements: [{ type: 'plugin', id: 'p::1' }],
    });
    render();
    expect(mocks.row).not.toHaveBeenCalled();
  });
});
