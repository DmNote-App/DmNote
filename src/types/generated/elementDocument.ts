// 자동 생성 파일 - 직접 고치지 않는다. 원본: src-tauri/crates/element-document
// 갱신: UPDATE_TS_BINDINGS=1 cargo test -p element-document --manifest-path src-tauri/Cargo.toml

export type JsonValue = number | string | boolean | Array<JsonValue> | { [key in string]?: JsonValue } | null;

export type Document = { formatVersion: number, kindVersions: { [key in string]?: number }, scenes: { [key in string]?: Scene }, } & ({ [key in string]?: number | string | boolean | Array<JsonValue> | { [key in string]?: JsonValue } | null });

export type Scene = { nodes: Array<Node>, } & ({ [key in string]?: number | string | boolean | Array<JsonValue> | { [key in string]?: JsonValue } | null });

export type Node = { "type": "group" } & Group | { "type": "element" } & Element;

export type Group = { id: string, name: string, hidden?: boolean, children: Array<Node>, } & ({ [key in string]?: number | string | boolean | Array<JsonValue> | { [key in string]?: JsonValue } | null });

export type Element = { id: string, kind: string, frame: Frame, name?: string | null, hidden?: boolean, className?: string | null, useInlineStyles?: boolean | null, bundles?: { [key in string]?: JsonValue }, values?: { [key in string]?: JsonValue }, input?: InputBinding | null, } & ({ [key in string]?: number | string | boolean | Array<JsonValue> | { [key in string]?: JsonValue } | null });

export type Frame = { x: number, y: number, width: number, height: number, rotation: number, };

export type InputBinding = { "type": "key", slot: JsonValue, } | { "type": "axis", axisId: string, } | { "type": "pointer", };

export type Op = { "op": "insert", scene: string, parent: string | null, index: number | null, node: Node, } | { "op": "remove", scene: string, ids: Array<string>, } | { "op": "move", scene: string, ids: Array<string>, parent: string | null, index: number | null, } | { "op": "setFrame", scene: string, id: string, frame: FramePatch, } | { "op": "setCommon", scene: string, id: string, name?: string | null | null, hidden?: boolean | null, className?: string | null | null, useInlineStyles?: boolean | null | null, } | { "op": "setValues", scene: string, id: string, values: { [key in string]?: JsonValue }, } | { "op": "setBundle", scene: string, id: string, bundle: string, fields: { [key in string]?: JsonValue }, } | { "op": "setInput", scene: string, id: string, input: InputBinding | null, } | { "op": "group", scene: string, id: string, name: string, ids: Array<string>, } | { "op": "ungroup", scene: string, id: string, } | { "op": "setGroup", scene: string, id: string, name?: string | null, hidden?: boolean | null, } | { "op": "addScene", scene: string, } | { "op": "removeScene", scene: string, };

export type FramePatch = { x?: number | null, y?: number | null, width?: number | null, height?: number | null, rotation?: number | null, };

export type ChangeSet = { scenes: { [key in string]?: SceneChange }, };

export type SceneChange = { changed: Array<string>, removed: Array<string>, structure: boolean, created?: boolean, deleted?: boolean, };

export type PendingEdit = { id: string, ops: Array<Op>, };

export type Violation = { code: ViolationCode, path: string, };

export type ViolationCode = "VALUE_TYPE_MISMATCH" | "VALUE_OUT_OF_RANGE" | "VALUE_NOT_INTEGER" | "VALUE_UNKNOWN_OPTION" | "VALUE_TOO_LONG" | "VALUE_TOO_MANY_ITEMS" | "VALUE_DUPLICATE_ITEM" | "VALUE_NOT_NULLABLE" | "VALUE_INVALID_COLOR" | "VALUE_INVALID_GRADIENT" | "UNKNOWN_FIELD" | "REFERENCE_NOT_FOUND" | "REFERENCE_WRONG_KIND" | "DUPLICATE_ID" | "ELEMENT_NOT_FOUND" | "GROUP_NOT_FOUND" | "UNKNOWN_KIND" | "KIND_VERSION_LOCKED" | "INVALID_FRAME" | "INVALID_BUNDLE" | "BUNDLE_NOT_ALLOWED" | "INVALID_INPUT" | "INVALID_MOVE" | "SCENE_NOT_FOUND";

export type LoadReport = { repaired: Array<[string, string]>, reissued: Array<[string, string, string]>, migrated: Array<[string, number, number]>, pendingHooks: Array<[string, string]>, lockedKinds: Array<string>, unknownKinds: Array<string>, };

export type KindSchema = { kind: string, version: number, fields: Array<FieldRule>, bundles: Array<string>, inputs: Array<string>, defaultSize: Size, fallbackSize: Size, rotatable: boolean, maxPerScene?: number | null, migrations: Array<KindMigration>, };

export type Size = { width: number, height: number, };

export type FieldRule = { name: string, value: ValueKind, default: JsonValue, nullable?: boolean, when?: Condition | null, };

export type ValueKind = { "type": "bool", } | { "type": "number", min?: number | null, max?: number | null, integer?: boolean, } | { "type": "string", maxLength?: number | null, } | { "type": "enum", options: Array<string>, } | { "type": "color", } | { "type": "gradient", } | { "type": "file", asset: AssetKind, } | { "type": "elementRef", kinds?: Array<string>, } | { "type": "id", } | { "type": "list", item: ValueKind, maxItems?: number | null, unique?: boolean, } | { "type": "object", fields: Array<FieldRule>, } | { "type": "json", };

export type AssetKind = "image" | "sound" | "font";

export type Condition = EqualsCondition | OneOfCondition | AllCondition | AnyCondition | NotCondition;

export type EqualsCondition = { field: string, equals: JsonValue, };

export type OneOfCondition = { field: string, oneOf: Array<JsonValue>, };

export type AllCondition = { all: Array<Condition>, };

export type AnyCondition = { any: Array<Condition>, };

export type NotCondition = { not: Condition, };

export type KindMigration = { from: number, steps: Array<MigrationStep>, };

export type MigrationStep = { "op": "rename", from: string, to: string, } | { "op": "mapValue", field: string, from: JsonValue, to: JsonValue, } | { "op": "setDefault", field: string, value: JsonValue, } | { "op": "remove", field: string, } | { "op": "hook", name: string, };

export type DefinitionError = { kind: string, message: string, };
