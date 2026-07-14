const path = require('node:path');
const os = require('node:os');
const { version } = require('./package.json');

// Squirrel의 rcedit.exe는 한글이 포함된 경로에서 Setup.exe를 열지 못한다.
// 항상 ASCII인 임시 경로(Windows=Public, mac/linux=os.tmpdir())에서 만든 뒤
// release/로 복사한다. (프로젝트 경로에 '몰입캠프' 한글이 있어 mac에서도 임시
// 경로를 쓰는 게 안전하고 repo도 깨끗하게 유지된다.)
const forgeOutDirectory = path.join(
  process.env.PUBLIC || process.env.TEMP || os.tmpdir(),
  process.env.ZONEMATE_FORGE_OUT || `ZonemateBuild-${version}`,
);

// electron/node_modules에는 실제 런타임 의존성(3개) 외에 electron-forge/
// typescript/webpack/@octokit/electron-winstaller 같은 devDependencies가 같이
// 들어있어 전체 517MB, 12,600여 개 파일이나 된다(그중 devDependency로 잡힌
// electron 패키지 자체만 300MB — 로컬 개발용 바이너리로, 패키저가 별도로 받는
// 배포용 Electron과는 무관해 앱에 들어갈 필요가 없다). 기본 ignore는 이걸
// 걸러내지 않아서, 패키징이 이 전부를 복사하려다 로컬 환경(특히 Spotlight
// 인덱싱·백신 실시간 검사가 있는 개인 맥)에서 몇 분씩 멈추는 것처럼 느려지는
// 원인이 됐다(2026-07-13, 로컬 make:mac이 "Finalizing package"에서 멈춘 문제로
// 발견). 실제 런타임에 필요한 프로덕션 의존성 트리만 화이트리스트로 남긴다.
// 목록 재생성: `npm ls --omit=dev --all --parseable | sed 's#.*/node_modules/##' | sort -u`
const RUNTIME_NODE_MODULES = new Set([
  '@isaacs/cliui', '@isaacs/fs-minipass', '@mapbox/node-pre-gyp', '@npmcli/agent', '@npmcli/fs', '@pkgjs/parseargs',
  'abbrev', 'agent-base', 'aggregate-error', 'ansi-regex', 'ansi-styles', 'aproba',
  'are-we-there-yet', 'balanced-match', 'brace-expansion', 'cacache', 'chownr', 'clean-stack',
  'color-convert', 'color-name', 'color-support', 'concat-map', 'consola', 'console-control-strings',
  'cross-spawn', 'debug', 'delegates', 'detect-libc', 'eastasianwidth', 'electron-squirrel-startup',
  'emoji-regex', 'encoding', 'env-paths', 'err-code', 'exponential-backoff', 'foreground-child',
  'fs-minipass', 'fs.realpath', 'gauge', 'get-windows', 'github-url-to-object', 'glob',
  'graceful-fs', 'has-unicode', 'http-cache-semantics', 'http-proxy-agent', 'https-proxy-agent', 'iconv-lite',
  'imurmurhash', 'indent-string', 'inflight', 'inherits', 'ip-address', 'is-fullwidth-code-point',
  'is-lambda', 'is-url', 'isexe', 'jackspeak', 'lru-cache', 'make-dir',
  'make-fetch-happen', 'minimatch', 'minipass', 'minipass-collect', 'minipass-fetch', 'minipass-flush',
  'minipass-pipeline', 'minipass-sized', 'minizlib', 'mkdirp', 'ms', 'negotiator',
  'node-addon-api', 'node-fetch', 'node-gyp', 'nopt', 'npmlog', 'object-assign',
  'once', 'p-map', 'package-json-from-dist', 'path-is-absolute', 'path-key', 'path-scurry',
  'proc-log', 'promise-retry', 'readable-stream', 'retry', 'rimraf', 'safe-buffer',
  'safer-buffer', 'semver', 'set-blocking', 'shebang-command', 'shebang-regex', 'signal-exit',
  'smart-buffer', 'socks', 'socks-proxy-agent', 'ssri', 'string-width', 'string-width-cjs',
  'string_decoder', 'strip-ansi', 'strip-ansi-cjs', 'tar', 'tr46', 'unique-filename',
  'unique-slug', 'update-electron-app', 'util-deprecate', 'webidl-conversions', 'whatwg-url', 'which',
  'wide-align', 'wrap-ansi', 'wrap-ansi-cjs', 'wrappy', 'yallist',
]);

// electron-packager의 ignore는 함수로 주면 (file) => true일 때 제외한다.
// file은 프로젝트 루트 기준 '/'로 시작하는 POSIX 상대경로.
function shouldIgnore(file) {
  if (/^\/build-resources($|\/)/.test(file)) return true;
  if (/^\/out($|\/)/.test(file)) return true;
  const match = /^\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(file);
  if (match) return !RUNTIME_NODE_MODULES.has(match[1]);
  return false;
}

module.exports = {
  packagerConfig: {
    // 확장자 없이! Forge가 OS별로 .ico / .icns 자동 선택
    icon: path.join(__dirname, 'icon'),
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'zonemate',
        setupExe: 'Zonemate-Setup.exe',
        setupIcon: path.join(__dirname, 'icon.ico'), // 확장자 필수
        iconUrl: 'https://raw.githubusercontent.com/.../icon.ico', // 제어판 아이콘용(선택, https 필수)
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'Zonemate',
        icon: path.join(__dirname, 'icon.icns'), // DMG 볼륨 아이콘
      },
    },
    // 리눅스(.deb) maker는 뺐다 — CI(release.yml)는 mac/Windows만 빌드하는데,
    // forge는 플랫폼 필터 전에 모든 maker 모듈을 먼저 resolve하므로 설치 안 된
    // @electron-forge/maker-deb가 있으면 mac/Windows 빌드까지 전부 실패한다.
    // 리눅스 배포가 필요해지면 그때 maker-deb를 devDependencies에 추가하고
    // release.yml에 ubuntu 잡을 함께 넣어야 한다.
  ],
};