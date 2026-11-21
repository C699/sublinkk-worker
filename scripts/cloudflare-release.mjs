import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const [mode = 'upload'] = process.argv.slice(2);
const namespace = process.env.SUBLINK_EXISTING_KV_ID;
if (!['check', 'upload', 'deploy'].includes(mode) || !/^[a-f0-9]{32}$/.test(namespace ?? '')) {
  console.error('A valid existing SUBLINK_KV namespace is required. No Worker was uploaded.');
  process.exit(1);
}

const source = readFileSync('wrangler.toml', 'utf8');
const binding = /(\bbinding\s*=\s*"SUBLINK_KV"\s*,\s*id\s*=\s*")[a-f0-9]{32}("\s*\})/g;
if (!/^name\s*=\s*"sublinkk-worker"\s*$/m.test(source) || [...source.matchAll(binding)].length !== 1) {
  console.error('Unexpected Worker or KV config; refusing to change the existing binding.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const config = `.wrangler-release-${process.pid}.toml`;
const command = mode === 'upload' ? ['versions', 'upload'] : ['deploy'];
command.push('--keep-vars');
if (mode === 'check') command.push('--dry-run');
else command.push('--message', `Sublink Worker v${version}`);
const env = { ...process.env };
delete env.SUBLINK_EXISTING_KV_ID;

// Only the Cloudflare build gets the real namespace ID; it never enters Git history.
writeFileSync(config, source.replace(binding, (_, prefix, suffix) => prefix + namespace + suffix), {
  flag: 'wx',
  mode: 0o600,
});
try {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...command, '--config', config], {
    env,
    stdio: 'inherit',
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  unlinkSync(config);
}
