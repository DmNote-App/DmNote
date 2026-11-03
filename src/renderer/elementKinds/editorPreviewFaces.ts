// 편집 화면 미리보기 그리기 등록 - 편집 창(편집 화면 트리 층)만 불러온다. 오버레이·OBS 번들에 편집 스토어를
// 읽는 미리보기 갈래가 따라가지 않게 종류의 그리기와 나눠 둔다
import KeyPreview from './definitions/key/KeyPreview';
import SpritePreviewFace from './definitions/sprite/SpritePreviewFace';
import StatPreview from './definitions/stat/StatPreview';
import { registerPreviewFace } from './runtime/previewFaces';

registerPreviewFace('key', KeyPreview);
registerPreviewFace('stat', StatPreview);
registerPreviewFace('sprite', SpritePreviewFace);
