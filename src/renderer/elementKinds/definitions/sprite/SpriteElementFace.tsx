'use no memo';
// 프리뷰 오버레이(모듈 상태)를 버전으로 다시 읽어야 해서 컴파일러 메모 제외
import type { ElementNode } from '@src/renderer/editor/document/documentPatch';
import { useDocumentElement } from '@src/renderer/editor/document/elementDocumentRuntime';
import { useEditorPreviewElement } from '@src/renderer/elementKinds/runtime/editorPreviewElement';
import type {
  ElementPlacement,
  ElementRenderProps,
} from '@src/renderer/elementKinds/runtime/renderTypes';
import { useKeyStore } from '@stores/data/useKeyStore';
import type { CanonicalReactiveSpritePosition } from '@src/types/editor';
import { projectSpriteResize } from '@utils/sprite/resizeProjection';
import SpriteLive from './SpriteLive';
import SpritePreview from './SpritePreview';

// 스프라이트 그리기 - 오버레이·OBS는 키 입력에 따라 자세를 바꾸고(SpriteLive), 편집 화면은 자세 편집 미리보기로
// 그린다(SpritePreview). 고유 값이 스프라이트 배치 모양과 같아 트리 값과 상자로 그 모양을 만들어 넘긴다

type SpriteFaceProps = ElementRenderProps<Record<string, unknown>>;

const EMPTY_KEY_MAP: ReadonlyMap<string, string> = new Map();

// 같은 요소·같은 자리면 같은 객체 - 오버레이 잎의 React.memo가 identity로 비교한다
const viewCache = new WeakMap<
  ElementNode,
  { key: string; view: CanonicalReactiveSpritePosition }
>();

/** 트리 값 + 상자 → 스프라이트 배치 모양 (오버레이는 받은 자리, 편집 화면은 요소 틀) */
const spriteViewOf = (
  element: ElementNode,
  placement?: ElementPlacement,
): CanonicalReactiveSpritePosition => {
  const key = placement
    ? `${placement.x},${placement.y},${placement.zIndex}`
    : '';
  const cached = viewCache.get(element);
  if (cached?.key === key) return cached.view;
  const { x, y, width, height, rotation } = element.frame;
  const view = {
    ...(element.values ?? {}),
    id: element.id,
    dx: placement?.x ?? x,
    dy: placement?.y ?? y,
    width,
    height,
    rotation,
    hidden: element.hidden === true,
    ...(element.className != null ? { className: element.className } : {}),
    ...(element.useInlineStyles != null
      ? { useInlineStyles: element.useInlineStyles }
      : {}),
    ...(placement ? { zIndex: placement.zIndex } : {}),
  } as unknown as CanonicalReactiveSpritePosition;
  viewCache.set(element, { key, view });
  return view;
};

// 편집 화면 - 이동값의 기준 크기는 저장된 요소(편집 미리보기 포함). 받은 요소는 끄는 중 미리보기 틀일 수 있다
const PreviewSprite = ({ element, selected }: SpriteFaceProps) => {
  const mode = useKeyStore((state) => state.selectedKeyType);
  const stored = useDocumentElement(mode, element.id) ?? element;
  const base = useEditorPreviewElement(stored, mode);
  const { frame } = element;
  return (
    <SpritePreview
      // 그림 배치는 상자 크기 기준 - 끄는 중·반영 전 크기 변경도 이동값을 같은 비율로 (커밋과 같은 projection)
      position={projectSpriteResize(spriteViewOf(base), {
        dx: frame.x,
        dy: frame.y,
        width: frame.width,
        height: frame.height,
      })}
      elementId={element.id}
      isSelected={selected === true}
    />
  );
};

const SpriteElementFace = (props: SpriteFaceProps) =>
  props.live ? (
    <SpriteLive
      position={spriteViewOf(props.element, props.placement)}
      // 트리거(키 요소 id) → 키는 오버레이 맥락
      keyCanonicalMap={props.context?.spriteKeyCanonicalMap ?? EMPTY_KEY_MAP}
    />
  ) : (
    <PreviewSprite {...props} />
  );

export default SpriteElementFace;
