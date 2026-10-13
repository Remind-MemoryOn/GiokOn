// 의존성 취약점 게이트 — **배포에 닿는 것만 막고, 나머지는 보고한다**.
//
// 왜 나누는가: `pnpm audit` 은 락파일 전체를 본다. 지금 남은 high 대부분은
// `apps/mobile` 의 **개발 도구**(expo CLI · metro · eslint · babel · react-native
// 빌드 체인)에서 온다. 이것들은 웹 배포본에 한 줄도 실리지 않는다. 전부를 막으면
// 게이트가 상시 빨간불이 되어 아무도 보지 않게 되고(그래서 `continue-on-error` 가
// 붙어 있었다), 정작 **새로 생긴 진짜 취약점**을 놓친다.
//
// 규칙
//   - `apps__web` 경로가 하나라도 있는 advisory → **실패**(사용자 브라우저에 닿는다).
//   - 그 외 → 목록만 출력하고 통과. 줄어드는지 추이를 볼 수 있게 건수를 남긴다.
//   - 앱 스토어 제출 전에는 `apps__mobile` 도 같은 기준으로 승격한다(app 트랙 몫).
//
// 사용: pnpm check:audit   (CI security-audit 잡이 이걸 부른다)
import { spawnSync } from 'node:child_process';

const LEVELS = ['critical', 'high'];
/** 배포되는 워크스페이스 — 이 경로에 걸리면 막는다. */
const BLOCKING = 'apps__web';

// Windows의 pnpm.cmd는 실행 파일이 아니므로 cmd를 통해 고정 명령을 실행한다.
const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'pnpm audit --json']
  : ['audit', '--json'];
const res = spawnSync(command, args, {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
// pnpm audit 은 취약점이 있으면 0 이 아닌 코드로 끝난다 — 출력이 있으면 그대로 읽는다.
const raw = (res.stdout || '').trim();
if (!raw) {
  console.error('✗ pnpm audit 출력을 읽지 못했습니다.');
  console.error(res.error?.message ?? res.stderr?.slice(0, 500) ?? '');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error('✗ pnpm audit JSON 파싱 실패(네트워크·레지스트리 문제일 수 있음).');
  console.error(raw.slice(0, 500));
  process.exit(2);
}

// 레지스트리 실패 JSON을 "취약점 0건"으로 오인하지 않는다.
if (!report || report.error || !report.advisories || typeof report.advisories !== 'object' || Array.isArray(report.advisories)) {
  console.error('✗ pnpm audit 결과에 유효한 advisories가 없습니다.');
  process.exit(2);
}

const advisories = Object.values(report.advisories).filter((a) =>
  LEVELS.includes(a.severity),
);

const pathsOf = (a) =>
  (a.findings ?? []).flatMap((f) => f.paths ?? []);

const blocking = advisories.filter((a) => pathsOf(a).some((p) => p.startsWith(BLOCKING)));
const rest = advisories.filter((a) => !pathsOf(a).some((p) => p.startsWith(BLOCKING)));

const line = (a) => {
  const p = pathsOf(a)[0] ?? '(경로 불명)';
  return `  [${a.severity}] ${a.module_name} ${a.vulnerable_versions}\n      ${a.title?.slice(0, 90) ?? ''}\n      ${p}`;
};

if (rest.length > 0) {
  console.log(`ℹ 배포에 닿지 않는 취약점 ${rest.length}건 (${BLOCKING} 경로 없음 — 개발·빌드 도구):`);
  const byModule = new Map();
  for (const a of rest) byModule.set(a.module_name, (byModule.get(a.module_name) ?? 0) + 1);
  for (const [mod, n] of [...byModule].sort((x, y) => y[1] - x[1])) {
    console.log(`   · ${mod} × ${n}`);
  }
  console.log('   → 앱 스토어 제출 전에 같은 기준으로 승격한다(app 트랙).\n');
}

if (blocking.length > 0) {
  console.error(`✗ 배포본(${BLOCKING})에 닿는 취약점 ${blocking.length}건 — 반드시 처리해야 합니다:\n`);
  for (const a of blocking) console.error(line(a));
  console.error('\n업그레이드하거나, 도달 불가 근거를 남기고 이 스크립트의 예외로 명시하세요.');
  process.exit(1);
}

console.log(`✓ 배포본(${BLOCKING})에 닿는 high/critical 취약점 없음 (전체 검사 ${advisories.length}건)`);
