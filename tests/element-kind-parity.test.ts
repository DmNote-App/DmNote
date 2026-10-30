import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EDITOR_ELEMENT_POSITION_FIELDS,
  EDITOR_ELEMENT_TYPES,
  EDITOR_FIELDS,
  isEditorElementType,
} from '../src/types/editor';
import {
  ELEMENT_TYPE_BY_PREVIEW_DOMAIN,
  PREVIEW_DOMAIN_BY_ELEMENT_TYPE,
} from '../src/types/preview';

// Rust 테스트(models/editor)와 같은 fixture를 공유해 요소 종류 목록·순서와
// 종류별 문서 필드·프리뷰 도메인 wire 이름을 양쪽에서 고정한다
interface ElementKindFixtureEntry {
  type: string;
  positionField: string;
  previewDomain: string;
}

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'element-kinds.json'), 'utf8'),
) as ElementKindFixtureEntry[];

describe('요소 종류 파리티', () => {
  it('종류 목록과 순서가 fixture와 같다', () => {
    expect([...EDITOR_ELEMENT_TYPES]).toEqual(
      fixture.map((entry) => entry.type),
    );
  });

  it('종류별 문서 필드가 fixture와 같다', () => {
    for (const entry of fixture) {
      expect(isEditorElementType(entry.type)).toBe(true);
      if (!isEditorElementType(entry.type)) continue;
      expect(EDITOR_ELEMENT_POSITION_FIELDS[entry.type]).toBe(
        entry.positionField,
      );
      expect(EDITOR_FIELDS).toContain(entry.positionField);
    }
    expect(Object.keys(EDITOR_ELEMENT_POSITION_FIELDS)).toHaveLength(
      fixture.length,
    );
  });

  it('종류별 프리뷰 도메인과 역매핑이 fixture와 같다', () => {
    for (const entry of fixture) {
      if (!isEditorElementType(entry.type)) continue;
      expect(PREVIEW_DOMAIN_BY_ELEMENT_TYPE[entry.type]).toBe(
        entry.previewDomain,
      );
      expect(
        ELEMENT_TYPE_BY_PREVIEW_DOMAIN[
          entry.previewDomain as keyof typeof ELEMENT_TYPE_BY_PREVIEW_DOMAIN
        ],
      ).toBe(entry.type);
    }
    expect(Object.keys(ELEMENT_TYPE_BY_PREVIEW_DOMAIN)).toHaveLength(
      fixture.length,
    );
  });

  it('목록 밖 값은 요소 종류가 아니다', () => {
    expect(isEditorElementType('plugin')).toBe(false);
    expect(isEditorElementType(undefined)).toBe(false);
  });
});
