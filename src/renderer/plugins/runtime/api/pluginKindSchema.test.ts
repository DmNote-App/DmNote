import { describe, expect, it } from 'vitest';

import { pluginKindName, pluginKindSchema } from './pluginKindSchema';

describe('플러그인 요소 종류 정의', () => {
  it('설정 선언을 값 칸으로 옮기고 저장된 값을 거부하지 않게 너그럽게 둔다', () => {
    const schema = pluginKindSchema('counter-plus', {
      title: { type: 'section', label: '제목' },
      label: { type: 'string', default: 'Hi', label: '라벨' },
      size: { type: 'number', default: 12, min: 1, max: 99, label: '크기' },
      mode: {
        type: 'select',
        default: 1,
        label: '모드',
        options: [
          { label: 'a', value: 1 },
          { label: 'b', value: 'two' },
        ],
      },
      on: { type: 'boolean', default: true, label: '켜기' },
    });
    expect(schema.kind).toBe(pluginKindName('counter-plus'));
    expect(schema.kind).toBe('plugin:counter-plus');
    // 단락(section)은 값이 아니라 빠진다, 값 종류는 검사 없는 json
    expect(schema.fields).toEqual([
      { name: 'label', value: { type: 'json' }, default: 'Hi', nullable: true },
      { name: 'size', value: { type: 'json' }, default: 12, nullable: true },
      { name: 'mode', value: { type: 'json' }, default: 1, nullable: true },
      { name: 'on', value: { type: 'json' }, default: true, nullable: true },
    ]);
    expect(schema.rotatable).toBe(false);
    expect(schema.maxPerScene ?? null).toBeNull();
    expect(schema.defaultSize).toEqual({ width: 200, height: 150 });
  });

  it('설정이 없으면 값 칸 없이', () => {
    expect(pluginKindSchema('bare', undefined).fields).toEqual([]);
  });
});
