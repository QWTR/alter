// Runs the Android Gradle build with the JDK that ships with Android Studio and the user's Android SDK,
// so nothing has to be set in the environment: node scripts/gradle.mjs assembleDebug
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const pick = (...p) => p.find((x) => x && existsSync(x));
const jdk = pick(process.env.JAVA_HOME, 'C:/Program Files/Android/Android Studio/jbr', 'C:/Program Files/Android/Android Studio/jre');
const sdk = pick(process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
if (!jdk || !sdk) {
  console.error('Need Android Studio (its JDK) and the Android SDK. JDK:', jdk, 'SDK:', sdk);
  process.exit(1);
}
const dir = join(import.meta.dirname, '..', 'android');
const win = process.platform === 'win32';
const r = spawnSync(win ? join(dir, 'gradlew.bat') : './gradlew', process.argv.slice(2), {
  cwd: dir,
  stdio: 'inherit',
  shell: win,
  env: { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
});
process.exit(r.status ?? 1);
