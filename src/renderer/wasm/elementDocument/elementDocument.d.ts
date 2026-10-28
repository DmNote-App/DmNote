/* tslint:disable */
/* eslint-disable */

export class EditorDocumentSession {
    free(): void;
    [Symbol.dispose](): void;
    acknowledge(edit_id: string, revision: number): string;
    /**
     * 백엔드 패치(elementDocument:changed)로 확정 문서를 고친다
     */
    applyRemote(patch: string, revision: number): string;
    /**
     * 화면 상태의 요소 하나(JSON) - 없으면 undefined
     */
    element(scene: string, id: string): string | undefined;
    /**
     * kinds: 종류 정의 데이터 배열(JSON), document: 확정 문서(JSON)
     */
    constructor(kinds: string, document: string, revision: number);
    pendingCount(): number;
    /**
     * 화면에 먼저 반영 - 바뀐 곳(ChangeSet) JSON. 규칙에 어긋나면 위반 목록 JSON을 담은 오류
     */
    push(edit: string): string;
    reject(edit_id: string): string;
    /**
     * 확정 문서를 통째로 바꾼다 (다시 불러오기)
     */
    reset(document: string, revision: number): string;
    revision(): number;
    /**
     * 화면 상태의 장면 하나(JSON) - 없으면 undefined
     */
    scene(scene: string): string | undefined;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_editordocumentsession_free: (a: number, b: number) => void;
    readonly editordocumentsession_acknowledge: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly editordocumentsession_applyRemote: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly editordocumentsession_element: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly editordocumentsession_new: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly editordocumentsession_pendingCount: (a: number) => number;
    readonly editordocumentsession_push: (a: number, b: number, c: number, d: number) => void;
    readonly editordocumentsession_reject: (a: number, b: number, c: number, d: number) => void;
    readonly editordocumentsession_reset: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly editordocumentsession_revision: (a: number) => number;
    readonly editordocumentsession_scene: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
