import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';
import { Client } from 'basic-ftp';

const required = ['FTP_HOST', 'FTP_USER', 'FTP_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required .env variables: ${missing.join(', ')}`);
  process.exit(1);
}

const host = process.env.FTP_HOST;
const port = Number(process.env.FTP_PORT ?? '21');
const user = process.env.FTP_USER;
const password = process.env.FTP_PASSWORD;
const remotePath = process.env.FTP_REMOTE_PATH ?? '/';
const secure = (process.env.FTP_SECURE ?? 'true') !== 'false';
// `--check`: connect, verify the certificate, log in and list the remote
// directory, then stop — nothing is uploaded or deleted.
const checkOnly = process.argv.includes('--check');
const localPath = 'dist';
const indexFile = 'index.html';
const assetsDir = 'assets';

// BL-58: certificate verification is always on — with it off, the FTP
// password could be intercepted and a spoofed server could serve altered
// JS to every visitor. The host's FTPS certificate is valid, but the server
// sends only the leaf, not the Let's Encrypt intermediate, so Node can't
// build the chain from its own root store; the missing links ship with the
// repo and are trusted on top of Node's roots. FTP_CA_FILE overrides them.
if (process.env.FTP_REJECT_UNAUTHORIZED !== undefined) {
  console.warn('FTP_REJECT_UNAUTHORIZED is no longer supported and is ignored — certificate verification is always on.');
}
const caFile = process.env.FTP_CA_FILE ?? new URL('./certs/lets-encrypt-yr1-chain.pem', import.meta.url);
const ca = [...rootCertificates, readFileSync(caFile, 'utf8')];

const TLS_ERROR_HINT = `Certificate verification failed. Check that FTP_HOST is a name the server's
certificate is issued for (for this host: v101.vh.net.pl, not ftp.vh11566.vh.net.pl), and that
scripts/certs/lets-encrypt-yr1-chain.pem still matches the issuer of the server's certificate
(Let's Encrypt rotates intermediates; the certificate's own "CA Issuers" URL has the current one).`;

const client = new Client();
client.ftp.verbose = process.env.FTP_VERBOSE === 'true';

function isTlsError(err) {
  return /certificate|altnames|self.signed|issuer/i.test(`${err.code ?? ''} ${err.message}`);
}

async function listRemote(path) {
  try {
    return await client.list(path);
  } catch (err) {
    if (/no such file|not found|550/i.test(err.message)) return [];
    throw err;
  }
}

try {
  console.log(`Connecting to ${user}@${host}:${port} (${secure ? 'explicit FTPS, verified' : 'plain FTP'}) ...`);
  await client.access({
    host,
    port,
    user,
    password,
    secure,
    secureOptions: secure ? { ca, servername: host } : undefined,
  });
  console.log(`Landed in: ${await client.pwd()}`);

  console.log(`Switching to remote directory ${remotePath} ...`);
  await client.ensureDir(remotePath);
  console.log(`Working dir after ensureDir: ${await client.pwd()}`);

  if (checkOnly) {
    for (const entry of await client.list()) {
      console.log(`  ${entry.type === 2 ? 'd' : '-'} ${entry.name}`);
    }
    console.log('Check finished — nothing uploaded.');
  } else {
    // BL-58: the live index.html must never point at files that aren't
    // there. Order: new hashed assets first (next to the old ones), then
    // the other root files, index.html last — only then the old assets the
    // new build no longer references are deleted. A failed or interrupted
    // upload leaves the previous version fully working.
    //
    // Only files this build owns are touched: everything else in the
    // docroot is left alone — deliberately NOT a clearWorkingDir(): it also
    // holds cPanel-managed files (cgi-bin/, php.ini).
    console.log(`Uploading ${localPath}/${assetsDir}/ ...`);
    await client.uploadFromDir(join(localPath, assetsDir), assetsDir);

    for (const name of readdirSync(localPath)) {
      if (name === assetsDir || name === indexFile) continue;
      const fullPath = join(localPath, name);
      console.log(`Uploading ${name} ...`);
      if (statSync(fullPath).isDirectory()) {
        await client.uploadFromDir(fullPath, name);
      } else {
        await client.uploadFrom(fullPath, name);
      }
    }

    console.log(`Uploading ${indexFile} (last) ...`);
    await client.uploadFrom(join(localPath, indexFile), indexFile);

    const currentAssets = new Set(readdirSync(join(localPath, assetsDir)));
    const stale = (await listRemote(assetsDir)).filter((entry) => entry.type !== 2 && !currentAssets.has(entry.name));
    console.log(`Removing ${stale.length} old file(s) from ${assetsDir}/ ...`);
    for (const entry of stale) {
      await client.remove(`${assetsDir}/${entry.name}`);
    }

    const listing = await client.list();
    console.log(`Remote listing after upload (${await client.pwd()}):`);
    for (const entry of listing) {
      console.log(`  ${entry.type === 2 ? 'd' : '-'} ${entry.name} (${entry.size} bytes)`);
    }

    console.log('Deploy finished.');
  }
} catch (err) {
  console.error('Deploy failed:', err.message);
  if (secure && isTlsError(err)) console.error(TLS_ERROR_HINT);
  process.exitCode = 1;
} finally {
  client.close();
}
