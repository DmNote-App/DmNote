import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addPendingTreeEdit,
  clearPendingTreeEdits,
  composePendingTreeEdits,
  hasPendingTreeEdits,
  subscribePendingTreeEdits,
} from './pendingTreeEdits';

const canonical = () => ({
  '4key': [
    { id: 'a', fontColor: '#000', imagePath: 'x.png' },
    { id: 'b', fontColor: '#111' },
  ],
  '5key': [{ id: 'a', fontColor: '#222' }],
});

describe('대기 중인 트리 편집 얹기', () => {
  afterEach(() => clearPendingTreeEdits());

  it('대기 편집이 없으면 같은 참조를 돌려준다', () => {
    const positions = canonical();
    expect(composePendingTreeEdits('keyPosition', positions)).toBe(positions);
    expect(hasPendingTreeEdits()).toBe(false);
  });

  it('대상 요소만 바꾸고 null은 옛 칸을 지운다 - 다른 요소·탭은 같은 객체', () => {
    const positions = canonical();
    addPendingTreeEdit('keyPosition', '4key', 'a', {
      fontColor: '#fff',
      imagePath: null,
    });
    const composed = composePendingTreeEdits('keyPosition', positions);
    expect(composed['4key'][0]).toEqual({ id: 'a', fontColor: '#fff' });
    expect(composed['4key'][1]).toBe(positions['4key'][1]);
    expect(composed['5key']).toBe(positions['5key']);
    // 다른 도메인에는 얹지 않는다
    expect(composePendingTreeEdits('statPosition', positions)).toBe(positions);
  });

  it('같은 입력이면 같은 결과 객체를 돌려준다', () => {
    const positions = canonical();
    addPendingTreeEdit('keyPosition', '4key', 'a', { fontColor: '#fff' });
    expect(composePendingTreeEdits('keyPosition', positions)).toBe(
      composePendingTreeEdits('keyPosition', positions),
    );
  });

  it('나중 편집이 같은 칸을 덮고, 내리면 앞 편집만 남는다', () => {
    const positions = canonical();
    addPendingTreeEdit('keyPosition', '4key', 'a', { fontColor: '#fff' });
    const later = addPendingTreeEdit('keyPosition', '4key', 'a', {
      fontColor: '#f00',
    });
    expect(
      composePendingTreeEdits('keyPosition', positions)['4key'][0].fontColor,
    ).toBe('#f00');
    later();
    expect(
      composePendingTreeEdits('keyPosition', positions)['4key'][0].fontColor,
    ).toBe('#fff');
  });

  it('더하고 내릴 때 구독자에게 알린다 (두 번 내려도 한 번)', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePendingTreeEdits(listener);
    const edit = addPendingTreeEdit('keyPosition', '4key', 'a', {
      fontColor: '#fff',
    });
    edit();
    edit();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
