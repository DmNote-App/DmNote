import React from 'react';
import type { KeyPosition } from '@src/types/key/keys';
import Checkbox from '@components/main/common/checkbox/Checkbox';
import { editGestureController } from '@src/renderer/editor/runtime/gesture/editGestureController';
import type {
  EditorPreviewStylePropertyPatchV1,
  EditorStylePropertyPreviewPatchV1,
} from '@src/types/editor';
import {
  PropertyRow,
  PropertySection,
  TextInput,
} from '../../controls/PropertyInputs';

interface BatchCustomCssSectionProps {
  getMixedValue: <T>(
    getter: (pos: KeyPosition) => T | undefined,
    defaultValue: T,
  ) => { isMixed: boolean; value: T };
  onUseInlineStylesCommit?: (useInlineStyles: boolean) => void;
  onStylePropertyPreview?: (patch: EditorStylePropertyPreviewPatchV1) => void;
  onStylePropertyCommit?: (patch: EditorPreviewStylePropertyPatchV1) => void;
  t: (key: string) => string;
}

/** 일괄 사용자 CSS - 인라인 스타일 우선·클래스 (설정에서 사용자 CSS를 켰을 때) */
const BatchCustomCssSection = ({
  getMixedValue,
  onUseInlineStylesCommit,
  onStylePropertyPreview,
  onStylePropertyCommit,
  t,
}: BatchCustomCssSectionProps) => (
  <PropertySection>
    {/* CSS 우선순위 토글 */}
    <div className="flex justify-between items-center w-full min-h-[32px]">
      <p className="text-fg-muted text-label">
        {t('propertiesPanel.useInlineStyles') || '인라인 스타일 우선'}
      </p>
      <Checkbox
        commitStrategy="after-paint"
        checked={getMixedValue((pos) => pos.useInlineStyles, false).value}
        onChange={() => {
          const currentValue = getMixedValue(
            (pos) => pos.useInlineStyles,
            false,
          ).value;
          onUseInlineStylesCommit?.(!currentValue);
        }}
      />
    </div>

    {/* 클래스명 */}
    <PropertyRow label={t('propertiesPanel.className') || '클래스'}>
      <TextInput
        value={
          getMixedValue((pos) => pos.className, '').isMixed
            ? ''
            : getMixedValue((pos) => pos.className, '').value
        }
        onChange={(value) =>
          onStylePropertyCommit?.({ property: 'className', value: value })
        }
        onPreview={(value) =>
          onStylePropertyPreview?.({
            property: 'className',
            value: value,
          })
        }
        onCancel={() => editGestureController.cancel()}
        placeholder={
          getMixedValue((pos) => pos.className, '').isMixed
            ? 'Mixed'
            : 'className'
        }
        width="90px"
        isMixed={getMixedValue((pos) => pos.className, '').isMixed}
      />
    </PropertyRow>
  </PropertySection>
);

export default BatchCustomCssSection;
