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
const rejectUnauthorized = (process.env.FTP_REJECT_UNAUTHORIZED ?? 'true') !== 'false';
const localPath = 'dist';

const client = new Client();
client.ftp.verbose = process.env.FTP_VERBOSE === 'true';

async function removeRemoteDirIfExists(path) {
  try {
    await client.removeDir(path);
  } catch (err) {
    if (!/no such file|not found|550/i.test(err.message)) {
      throw err;
    }
  }
}

try {
  console.log(`Connecting to ${user}@${host}:${port} (${secure ? 'explicit FTPS' : 'plain FTP'}) ...`);
  await client.access({
    host,
    port,
    user,
    password,
    secure,
    secureOptions: secure ? { rejectUnauthorized } : undefined,
  });
  console.log(`Landed in: ${await client.pwd()}`);

  console.log(`Switching to remote directory ${remotePath} ...`);
  await client.ensureDir(remotePath);
  console.log(`Working dir after ensureDir: ${await client.pwd()}`);

  // Only clear the assets/ folder we own (hashed filenames would otherwise
  // pile up across builds). Everything else in this directory is left
  // alone — deliberately NOT a full clearWorkingDir(): the docroot also
  // holds cPanel-managed files (cgi-bin/, php.ini) we must not touch.
  // uploadFromDir() below overwrites our own named files (index.html,
  // .htaccess, robots.txt, favicon.svg) in place without deleting anything
  // unrelated.
  console.log('Removing old assets/ (if present) ...');
  await removeRemoteDirIfExists('assets');

  console.log(`Uploading ${localPath}/ ...`);
  await client.uploadFromDir(localPath);

  const listing = await client.list();
  console.log(`Remote listing after upload (${await client.pwd()}):`);
  for (const entry of listing) {
    console.log(`  ${entry.type === 2 ? 'd' : '-'} ${entry.name} (${entry.size} bytes)`);
  }

  console.log('Deploy finished.');
} catch (err) {
  console.error('Deploy failed:', err.message);
  process.exitCode = 1;
} finally {
  client.close();
}
