import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// ST-Dollars 在 .../third-party/ST-Dollars，plugins 在 .../SillyTavern/plugins
const dest = path.resolve(root, '../../../../../plugins/dollars');

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, 'shared'), { recursive: true });
for (const f of ['index.js', 'db.js', 'package.json']) {
  fs.copyFileSync(path.join(root, 'server', f), path.join(dest, f));
}
fs.copyFileSync(path.join(root, 'shared', 'protocol.json'), path.join(dest, 'shared', 'protocol.json'));
console.log('[sync-server] 已同步到', dest);
