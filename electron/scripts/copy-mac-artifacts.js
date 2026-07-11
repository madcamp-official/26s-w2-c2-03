const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// forge.config.js와 동일한 outDir 규칙.
const forgeOutDirectory = path.join(
  process.env.PUBLIC || process.env.TEMP || os.tmpdir(),
  'ZonemateBuild',
);
const makeDirectory = path.join(forgeOutDirectory, 'make');
const releaseDirectory = path.join(__dirname, '..', 'release');

if (!fs.existsSync(makeDirectory)) {
  throw new Error(`forge make 결과 폴더를 찾을 수 없습니다: ${makeDirectory}`);
}

// make/ 아래를 재귀적으로 훑어 .dmg / .zip 배포물을 모은다.
function findArtifacts(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findArtifacts(full));
    else if (/\.(dmg|zip)$/i.test(entry.name)) found.push(full);
  }
  return found;
}

fs.mkdirSync(releaseDirectory, { recursive: true });
const artifacts = findArtifacts(makeDirectory);
if (artifacts.length === 0) throw new Error('복사할 .dmg/.zip 배포물이 없습니다.');

for (const src of artifacts) {
  const dest = path.join(releaseDirectory, path.basename(src));
  fs.copyFileSync(src, dest);
  console.log('[package] copied', path.basename(src), '→ release/');
}
console.log(`[package] macOS 배포물 ${artifacts.length}개를 ${releaseDirectory}에 복사했습니다.`);
