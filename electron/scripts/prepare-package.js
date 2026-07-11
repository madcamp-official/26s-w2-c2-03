const fs = require('node:fs');
const path = require('node:path');

const electronDirectory = path.join(__dirname, '..');
const projectRoot = path.join(electronDirectory, '..');
const stagingDirectory = path.join(electronDirectory, 'build-resources');
const backendSource = path.join(projectRoot, 'backend');
const frontendDistSource = path.join(projectRoot, 'frontend', 'dist');
const backendTarget = path.join(stagingDirectory, 'backend');
const frontendTarget = path.join(stagingDirectory, 'frontend', 'dist');

if (!fs.existsSync(frontendDistSource)) {
  throw new Error('frontend/dist가 없습니다. 먼저 프런트엔드 빌드를 실행해주세요.');
}
if (!fs.existsSync(path.join(backendSource, 'node_modules'))) {
  throw new Error('backend/node_modules가 없습니다. backend에서 npm install을 실행해주세요.');
}

fs.rmSync(stagingDirectory, { recursive: true, force: true });
fs.mkdirSync(backendTarget, { recursive: true });
fs.mkdirSync(frontendTarget, { recursive: true });

// .env, SQLite 데이터, 개발 캐시는 복사하지 않고 실행에 필요한 항목만 명시한다.
fs.cpSync(path.join(backendSource, 'src'), path.join(backendTarget, 'src'), { recursive: true });
fs.cpSync(path.join(backendSource, 'node_modules'), path.join(backendTarget, 'node_modules'), { recursive: true });
for (const filename of ['package.json', 'package-lock.json']) {
  fs.copyFileSync(path.join(backendSource, filename), path.join(backendTarget, filename));
}
fs.cpSync(frontendDistSource, frontendTarget, { recursive: true });

console.log('[package] backend와 frontend/dist 리소스 준비 완료');
