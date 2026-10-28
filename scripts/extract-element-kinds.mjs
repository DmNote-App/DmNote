// 요소 종류 정의에서 백엔드가 읽는 순수 데이터만 뽑는다
// - 코드를 실행하지 않고 TypeScript 구문 트리에서 리터럴만 읽는다
// - 데이터 칸에 함수·호출·외부 값이 섞이면 실패한다
// 사용: node scripts/extract-element-kinds.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kindsDir = resolve(root, 'src/renderer/elementKinds');
export const OUTPUT_PATH = resolve(root, 'src-tauri/kinds/builtin-kinds.json');

const DATA_KEYS = [
  'kind',
  'version',
  'fields',
  'bundles',
  'inputs',
  'defaultSize',
  'fallbackSize',
  'rotatable',
  'maxPerScene',
  'migrations',
];

const parse = (path) =>
  ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

const where = (source, node) => {
  const { line, character } = source.getLineAndCharacterOfPosition(
    node.getStart(source),
  );
  return `${source.fileName}:${line + 1}:${character + 1}`;
};

const topLevelConsts = (source) => {
  const consts = new Map();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        consts.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return consts;
};

const propertyName = (source, name) => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  throw new Error(`${where(source, name)} 계산된 칸 이름은 쓸 수 없음`);
};

const evaluate = (source, consts, node, seen = new Set()) => {
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  ) {
    return evaluate(source, consts, node.expression, seen);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node)) {
    const initializer = consts.get(node.text);
    if (!initializer || seen.has(node.text)) {
      throw new Error(
        `${where(source, node)} ${
          node.text
        }: 같은 파일의 상수 리터럴만 참조할 수 있음`,
      );
    }
    return evaluate(source, consts, initializer, new Set([...seen, node.text]));
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => {
      if (ts.isSpreadElement(element)) {
        const spread = evaluate(source, consts, element.expression, seen);
        if (!Array.isArray(spread)) {
          throw new Error(`${where(source, element)} 배열만 펼칠 수 있음`);
        }
        return spread;
      }
      return [evaluate(source, consts, element, seen)];
    });
  }
  if (ts.isObjectLiteralExpression(node)) {
    const object = {};
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        object[propertyName(source, property.name)] = evaluate(
          source,
          consts,
          property.initializer,
          seen,
        );
      } else if (ts.isShorthandPropertyAssignment(property)) {
        object[property.name.text] = evaluate(
          source,
          consts,
          property.name,
          seen,
        );
      } else if (ts.isSpreadAssignment(property)) {
        const spread = evaluate(source, consts, property.expression, seen);
        if (!spread || typeof spread !== 'object' || Array.isArray(spread)) {
          throw new Error(`${where(source, property)} 객체만 펼칠 수 있음`);
        }
        Object.assign(object, spread);
      } else {
        throw new Error(
          `${where(source, property)} 데이터 칸에 함수·접근자를 쓸 수 없음`,
        );
      }
    }
    return object;
  }
  throw new Error(
    `${where(source, node)} 데이터 칸은 리터럴이어야 함 (${
      ts.SyntaxKind[node.kind]
    })`,
  );
};

const findDefinitionCall = (source) => {
  let found = null;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineElementKind'
    ) {
      if (found) {
        throw new Error(`${where(source, node)} 파일 하나에 정의 하나만`);
      }
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) throw new Error(`${source.fileName}: defineElementKind 없음`);
  const [argument] = found.arguments;
  if (!argument || !ts.isObjectLiteralExpression(argument)) {
    throw new Error(`${where(source, found)} 정의는 객체 리터럴이어야 함`);
  }
  return argument;
};

export const extractDefinition = (path) => {
  const source = parse(path);
  const consts = topLevelConsts(source);
  const definition = findDefinitionCall(source);
  const data = {};
  for (const property of definition.properties) {
    if (
      !ts.isPropertyAssignment(property) &&
      !ts.isShorthandPropertyAssignment(property)
    ) {
      continue;
    }
    const name = propertyName(source, property.name);
    if (!DATA_KEYS.includes(name)) continue;
    const value = ts.isPropertyAssignment(property)
      ? property.initializer
      : property.name;
    data[name] = evaluate(source, consts, value);
  }
  // 정의 안 순서가 아니라 고정 순서로 내보낸다
  return Object.fromEntries(
    DATA_KEYS.filter((key) => key in data).map((key) => [key, data[key]]),
  );
};

export const builtinDefinitionFiles = () => {
  const source = parse(resolve(kindsDir, 'builtinKinds.ts'));
  const consts = topLevelConsts(source);
  const files = consts.get('BUILTIN_ELEMENT_KIND_FILES');
  if (!files) throw new Error('BUILTIN_ELEMENT_KIND_FILES 없음');
  return evaluate(source, consts, files).map((file) => resolve(kindsDir, file));
};

export const extractBuiltinKinds = () =>
  `${JSON.stringify(
    builtinDefinitionFiles().map(extractDefinition),
    null,
    2,
  )}\n`;

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const output = extractBuiltinKinds();
  if (process.argv.includes('--check')) {
    const current = readFileSync(OUTPUT_PATH, 'utf8');
    if (current !== output) {
      console.error(
        '요소 종류 추출 결과가 다릅니다. npm run kinds:extract 후 커밋하세요.',
      );
      process.exit(1);
    }
  } else {
    writeFileSync(OUTPUT_PATH, output);
    console.info(`저장: ${OUTPUT_PATH}`);
  }
}
