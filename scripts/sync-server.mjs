import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
// ST-Dollars 在 .../third-party/ST-Dollars，plugins 在 .../SillyTavern/plugins
const dest = path.resolve(root, '../../../../../plugins/dollars');

// 不删整个目录：ST 运行时锁着 dollars.db（删不掉），也避免误删数据库。
// 确保目录在，然后覆盖复制 server/ 下所有 .js（排除测试）+ package.json + shared/protocol.json。
fs.mkdirSync(path.join(dest, 'shared'), { recursive: true });
const serverDir = path.join(root, 'server');
for (const f of fs.readdirSync(serverDir)) {
  if (f.endsWith('.test.mjs')) continue;
  if (f.endsWith('.js') || f === 'package.json') {
    fs.copyFileSync(path.join(serverDir, f), path.join(dest, f));
  }
}
fs.copyFileSync(path.join(root, 'shared', 'protocol.json'), path.join(dest, 'shared', 'protocol.json'));
console.log('[sync-server] 已同步到', dest);
