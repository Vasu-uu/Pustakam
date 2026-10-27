// Builds the Android app with Gradle.
//   node scripts/build-apk.mjs          → optimised, signed release APK (Pustakam.apk in the mobile folder)
//   node scripts/build-apk.mjs --debug  → debug APK for testing
// Capacitor 8 needs Java 21: if JAVA_HOME isn't Java 21, a JDK 21 in ~/.jdks is used.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(mobile, 'android');
const debug = process.argv.includes('--debug');
const env = { ...process.env };

if (!env.JAVA_HOME || !/21/.test(env.JAVA_HOME)) {
  const jdks = join(homedir(), '.jdks');
  const jdk21 = existsSync(jdks) && readdirSync(jdks).find((d) => /^jdk-21/.test(d));
  if (jdk21) env.JAVA_HOME = join(jdks, jdk21);
}
console.log(`Using Java from ${env.JAVA_HOME || 'PATH'}`);

if (!debug && !existsSync(join(android, 'keystore.properties'))) {
  console.error('No android/keystore.properties found — the release APK can\'t be signed. See README.md → "Signing key".');
  process.exit(1);
}

const gradlew = join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const task = debug ? 'assembleDebug' : 'assembleRelease';
const result = spawnSync(gradlew, [task], { cwd: android, env, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) process.exit(result.status || 1);

const built = join(android, 'app', 'build', 'outputs', 'apk', debug ? 'debug' : 'release', debug ? 'app-debug.apk' : 'app-release.apk');
const out = join(mobile, debug ? 'Pustakam-debug.apk' : 'Pustakam.apk');
copyFileSync(built, out);
console.log(`\nAPK ready: ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB)`);
