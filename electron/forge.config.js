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

module.exports = {
  outDir: forgeOutDirectory,
  // get-windows는 N-API 바이너리라 Electron 43/Node 24에서 이미 로드 검증했다.
  // 로컬 C++ 툴체인으로 다시 빌드하지 않고 설치된 바이너리를 그대로 사용한다.
  rebuildConfig: {
    onlyModules: [],
  },
  packagerConfig: {
    asar: true,
    name: 'Zonemate',
    executableName: 'Zonemate',
    appBundleId: 'io.zonemate.desktop',
    // 확장자 없이 지정 — 패키저가 플랫폼별로 .icns(mac)/.ico(win)를 붙인다.
    icon: path.join(__dirname, 'icon'),
    extraResource: [
      path.join(__dirname, 'build-resources', 'backend'),
      path.join(__dirname, 'build-resources', 'frontend'),
    ],
    ignore: [
      /^\/build-resources($|\/)/,
      /^\/out($|\/)/,
    ],
  },
  makers: [
    {
      // Windows 설치본(자동 업데이트 지원: Squirrel.Windows). 서명 없이도 동작.
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'zonemate',
        setupExe: 'Zonemate-Setup.exe',
      },
    },
    {
      // macOS zip — Squirrel.Mac 자동 업데이트가 소비하는 포맷이자, 서명 없이도
      // 만들 수 있는 가장 안전한 배포물.
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      // macOS .dmg — 더 보기 좋은 다운로드용 설치 이미지.
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        name: 'Zonemate',
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
  publishers: [
    {
      // 빌드 산출물을 GitHub Release로 올린다. draft:true라 CI는 "초안"까지만
      // 만들고, 사람이 GitHub에서 확인 후 발행해야 실제 공개(=자동 업데이트 노출)된다.
      // update.electronjs.org는 발행된(=non-draft) 릴리스만 읽는다.
      name: '@electron-forge/publisher-github',
      config: {
        repository: { owner: 'madcamp-official', name: '26s-w2-c2-03' },
        draft: true,
        prerelease: false,
      },
    },
  ],
};
