// 요소 문서 구조 전환 전후 비교 측정 (macOS)
// 실제 앱을 별도 식별자로 빌드해 사용자 데이터와 분리하고, 같은 시나리오를 여러 번 띄워 잰다
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

if (process.platform !== 'darwin') {
  throw new Error('요소 문서 비교 측정은 macOS에서만 실행할 수 있습니다.');
}

// 화면이 잠기거나 꺼져 있으면 WebKit이 그리기를 멈춰 화면 반영 지표가 무의미하다
const consoleState = execFileSync('/usr/sbin/ioreg', ['-n', 'Root', '-d1'], {
  encoding: 'utf8',
});
if (/CGSSessionScreenIsLocked"=Yes/.test(consoleState)) {
  throw new Error(
    '화면이 잠겨 있습니다. 잠금을 풀고 화면을 켠 채로 실행하세요.',
  );
}

// 측정 중 화면이 꺼지지 않게 한다
spawn('/usr/bin/caffeinate', ['-dimsu', '-w', String(process.pid)], {
  stdio: 'ignore',
  detached: true,
}).unref();

// DMN_ELEMENT_BENCHMARK_ROOT로 다른 작업 트리(기준 커밋)를 잴 수 있다
const root = resolve(process.env.DMN_ELEMENT_BENCHMARK_ROOT ?? process.cwd());
const label = process.env.DMN_ELEMENT_BENCHMARK_LABEL ?? 'baseline';
const runs = Number(process.env.DMN_ELEMENT_BENCHMARK_RUNS ?? 5);
const iterations = Number(process.env.DMN_ELEMENT_BENCHMARK_ITERATIONS ?? 30);
const skipBuild = process.env.DMN_ELEMENT_BENCHMARK_SKIP_BUILD === '1';
const identifier = 'com.dmnote.desktop.element-benchmark';
const dataDir = join(homedir(), 'Library/Application Support', identifier);
const binary = resolve(root, 'src-tauri/target/release-fast/dm-note');
const outputPath = resolve(
  process.cwd(),
  `benchmarks/results/element-document-${label}.json`,
);

const sh = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', ...options }).trim();

if (!skipBuild) {
  console.info('프론트 빌드');
  execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' });
  console.info('앱 빌드 (release-fast)');
  execFileSync(
    'cargo',
    [
      'build',
      '--profile',
      'release-fast',
      '--features',
      'tauri/custom-protocol',
    ],
    {
      cwd: resolve(root, 'src-tauri'),
      stdio: 'inherit',
      env: {
        ...process.env,
        TAURI_CONFIG: JSON.stringify({
          identifier,
          productName: 'DM NOTE Element Benchmark',
        }),
      },
    },
  );
}

let pending = null;
// 편집 가능해진 뒤 측정 전 대기 구간 알림
let onIdle = null;
const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== 'POST' || request.url !== '/element-benchmark') {
    response.writeHead(404).end();
    return;
  }
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => {
    response.end('{}');
    const parsed = JSON.parse(body);
    if (parsed.phase === 'started' || parsed.phase === 'progress') {
      console.info(`  ${parsed.phase}${parsed.step ? `: ${parsed.step}` : ''}`);
      if (parsed.step?.startsWith('idle')) onIdle?.();
      return;
    }
    const resolveReport = pending;
    pending = null;
    resolveReport?.(parsed);
  });
});
await new Promise((resolvePromise) =>
  server.listen(0, '127.0.0.1', resolvePromise),
);
const port = server.address().port;

const webContentPids = () => {
  const output = sh('/bin/ps', ['-axo', 'pid=,comm=']);
  return new Set(
    output
      .split('\n')
      .filter((line) => line.includes('com.apple.WebKit.WebContent'))
      .map((line) => Number(line.trim().split(/\s+/)[0])),
  );
};

// phys_footprint (Activity Monitor의 메모리 열과 같은 값)
const footprintBytes = (pid) => {
  try {
    const output = sh('/usr/bin/footprint', ['-p', String(pid)]);
    const match = output.match(/Footprint:\s*([\d.]+)\s*(KB|MB|GB)/);
    if (!match) return null;
    const scale = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[match[2]];
    return Math.round(Number(match[1]) * scale);
  } catch {
    return null;
  }
};

let currentChild = null;
const killCurrent = () => {
  if (currentChild && currentChild.exitCode === null)
    currentChild.kill('SIGKILL');
};
process.on('exit', killCurrent);

const launch = async (phase) => {
  const before = webContentPids();
  const reportPromise = new Promise((resolvePromise, rejectPromise) => {
    // 끝난 실행의 타이머가 남아 다음 실행을 죽이지 않게 보고가 오면 끈다
    const timer = setTimeout(() => {
      // 멈춘 원인을 보려고 죽이기 전에 프로세스 스택을 떠 둔다
      if (currentChild?.pid) {
        try {
          const samplePath = resolve(
            dirname(outputPath),
            `hang-${label}-${Date.now()}.txt`,
          );
          execFileSync('/usr/bin/sample', [
            String(currentChild.pid),
            '3',
            '-file',
            samplePath,
          ]);
          console.info(`스택: ${samplePath}`);
        } catch (error) {
          console.info(`스택 실패: ${error}`);
        }
      }
      killCurrent();
      rejectPromise(new Error(`${phase} 240초 timeout`));
    }, 240_000);
    pending = (value) => {
      clearTimeout(timer);
      resolvePromise(value);
    };
  });
  const spawnedAt = Date.now();
  const child = spawn(binary, [], {
    env: {
      ...process.env,
      DMN_ELEMENT_BENCHMARK: `element-benchmark=${port}&phase=${phase}&iterations=${iterations}`,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  currentChild = child;
  child.stderr.on('data', () => {});
  const exited = new Promise((resolvePromise) =>
    child.once('exit', resolvePromise),
  );

  let memory = null;
  if (phase === 'measure') {
    // 편집 가능해진 뒤 측정을 시작하기 전 대기 구간 가운데에서 한 번 잰다
    // (시작 뒤 고정 시각에 재면 측정 단계가 어디까지 왔는지에 따라 값이 흔들린다)
    const sampleWhenReady = async () => {
      const idle = await Promise.race([
        new Promise((resolvePromise) => {
          onIdle = () => resolvePromise(true);
        }),
        new Promise((resolvePromise) =>
          setTimeout(() => resolvePromise(false), 60_000),
        ),
      ]);
      onIdle = null;
      if (!idle) return null;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
      const fresh = [...webContentPids()].filter((pid) => !before.has(pid));
      return {
        webContent: fresh.map((pid) => ({ pid, bytes: footprintBytes(pid) })),
        host: footprintBytes(child.pid),
      };
    };
    memory = await sampleWhenReady();
  }

  const reported = await reportPromise;
  const fresh = [...webContentPids()].filter((pid) => !before.has(pid));
  const memoryAfter =
    phase === 'measure'
      ? {
          webContent: fresh.map((pid) => ({ pid, bytes: footprintBytes(pid) })),
          host: footprintBytes(child.pid),
        }
      : null;
  child.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise((resolvePromise) => setTimeout(resolvePromise, 10_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
  if (reported.error) throw new Error(`${phase} 실패: ${reported.error}`);
  return { spawnedAt, reported, memory, memoryAfter };
};

await rm(dataDir, { recursive: true, force: true });
await mkdir(dataDir, { recursive: true });
await mkdir(dirname(outputPath), { recursive: true });

const measured = [];
try {
  console.info('요소 채우기');
  await launch('seed');
  for (let run = 0; run < runs; run += 1) {
    console.info(`측정 ${run + 1}/${runs}`);
    const { spawnedAt, reported, memory, memoryAfter } = await launch(
      'measure',
    );
    const origin = reported.timeOriginEpochMs;
    measured.push({
      coldStart: {
        webviewOriginMs: origin - spawnedAt,
        firstContentfulPaintMs:
          reported.firstContentfulPaintMs === null
            ? null
            : origin + reported.firstContentfulPaintMs - spawnedAt,
        editableMs: origin + reported.editableMs - spawnedAt,
      },
      memory,
      memoryAfter,
      ...reported,
    });
  }
} finally {
  server.close();
}

const median = (values) => {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const sumBytes = (sample) =>
  sample
    ? sample.webContent.reduce((sum, item) => sum + (item.bytes ?? 0), 0)
    : null;

const summary = {
  coldStartEditableMs: median(
    measured.map((item) => item.coldStart.editableMs),
  ),
  coldStartFirstPaintMs: median(
    measured.map((item) => item.coldStart.firstContentfulPaintMs),
  ),
  webContentFootprintBytes: median(
    measured.map((item) => sumBytes(item.memory)),
  ),
  webContentFootprintAfterBytes: median(
    measured.map((item) => sumBytes(item.memoryAfter)),
  ),
  hostFootprintBytes: median(measured.map((item) => item.memory?.host ?? null)),
  arrowNudgePaintP50Ms: median(
    measured.map((item) => item.arrowNudgePaintMs.p50),
  ),
  arrowNudgePaintP95Ms: median(
    measured.map((item) => item.arrowNudgePaintMs.p95),
  ),
  apiCommitRoundTripP50Ms: median(
    measured.map((item) => item.apiCommitRoundTripMs.p50),
  ),
  apiCommitRoundTripP95Ms: median(
    measured.map((item) => item.apiCommitRoundTripMs.p95),
  ),
  tabSwitchPaintP50Ms: median(
    measured.map((item) => item.tabSwitchPaintMs.p50),
  ),
  tabSwitchPaintP95Ms: median(
    measured.map((item) => item.tabSwitchPaintMs.p95),
  ),
  pasteFiftyPaintP50Ms: median(
    measured.map((item) => item.pasteFiftyPaintMs.p50),
  ),
  documentReplaceP50Ms: median(
    measured.map((item) => item.documentReplaceMs.p50),
  ),
};

const result = {
  schemaVersion: 1,
  benchmarkId: 'ELEMENT-DOCUMENT',
  label,
  measuredAt: new Date().toISOString(),
  commit: sh('git', ['rev-parse', 'HEAD'], { cwd: root }),
  runtime: {
    os: sh('/usr/bin/sw_vers', ['-productVersion']),
    cpu: sh('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string']),
    memoryBytes: Number(sh('/usr/sbin/sysctl', ['-n', 'hw.memsize'])),
    userAgent: measured[0]?.userAgent,
    build: 'release-fast + custom-protocol',
  },
  scenario: {
    runs,
    iterations,
    tabs: 2,
    elementsPerTab: 200,
  },
  summary,
  runs: measured,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.info(JSON.stringify(summary, null, 2));
console.info(`저장: ${outputPath}`);
