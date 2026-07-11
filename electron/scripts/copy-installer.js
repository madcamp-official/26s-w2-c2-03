const fs = require('node:fs');
const path = require('node:path');

const forgeOutDirectory = path.join(
  process.env.PUBLIC || process.env.TEMP || path.join(__dirname, '..'),
  'ZonemateBuild',
);
const squirrelDirectory = path.join(forgeOutDirectory, 'make', 'squirrel.windows', 'x64');
const releaseDirectory = path.join(__dirname, '..', 'release');

if (!fs.existsSync(squirrelDirectory)) {
  throw new Error(`Squirrel 결과 폴더를 찾을 수 없습니다: ${squirrelDirectory}`);
}

fs.rmSync(releaseDirectory, { recursive: true, force: true });
fs.mkdirSync(releaseDirectory, { recursive: true });

for (const entry of fs.readdirSync(squirrelDirectory, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  fs.copyFileSync(
    path.join(squirrelDirectory, entry.name),
    path.join(releaseDirectory, entry.name === 'Setup.exe' ? 'Zonemate-Setup.exe' : entry.name),
  );
}

console.log(`[package] Windows installer copied to ${releaseDirectory}`);
