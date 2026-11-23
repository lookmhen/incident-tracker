const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const compiled = path.join(__dirname, 'dist', 'backup-db.js');
const tsScript = path.join(__dirname, 'backup-db.ts');
const args = process.argv.slice(2);

if (fs.existsSync(compiled)) {
  const result = spawnSync(process.execPath, [compiled, ...args], { stdio: 'inherit' });
  process.exit(result.status || 0);
} else {
  const result = spawnSync('npx', ['tsx', tsScript, ...args], { stdio: 'inherit', shell: true });
  process.exit(result.status || 0);
}
