const path = require('node:path');

// Squirrel의 rcedit.exe는 한글이 포함된 경로에서 Setup.exe를 열지 못한다.
// 항상 ASCII인 Windows Public 경로에서 만든 뒤 release/로 복사한다.
const forgeOutDirectory = path.join(
  process.env.PUBLIC || process.env.TEMP || __dirname,
  'ZonemateBuild',
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
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'zonemate',
        setupExe: 'Zonemate-Setup.exe',
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
