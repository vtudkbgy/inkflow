#!/usr/bin/env node
/**
 * Lanceur intelligent Tauri v2 (`npm run tauri ...`) :
 * - Sous Windows : exécute directement `@tauri-apps/cli` pour produire le `.exe` et l'installateur NSIS/MSI.
 * - Sous Linux (cross-compilation vers Windows) : configure automatiquement `clang-cl`, `lld-link`, `llvm-lib`,
 *   `llvm-rc` et le SDK Windows 11 / MSVC CRT extrait dans `~/.cache/cargo-xwin/xwin` afin de compiler
 *   directement le binaire natif Windows `.exe` (`src-tauri/target/x86_64-pc-windows-msvc/release/PlumeStudioPro.exe`).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const isLinux = process.platform === 'linux';
const isBuildCmd = args[0] === 'build';

const env = { ...process.env };
const localRustup = path.join(rootDir, '.rustup');
const localCargo = path.join(rootDir, '.cargo');
const localCargoBin = path.join(localCargo, 'bin');

if (fs.existsSync(localRustup)) {
  env.RUSTUP_HOME = localRustup;
}
if (fs.existsSync(localCargo)) {
  env.CARGO_HOME = localCargo;
}
if (fs.existsSync(localCargoBin)) {
  env.PATH = `${localCargoBin}:${env.PATH || ''}`;
}

let finalArgs = [...args];
if (isLinux && isBuildCmd) {
  const xwinDir = path.join(rootDir, '.cache', 'cargo-xwin', 'xwin');
  if (fs.existsSync(path.join(xwinDir, 'crt', 'lib', 'x86_64'))) {
    const crtInc = path.join(xwinDir, 'crt', 'include');
    const ucrtInc = path.join(xwinDir, 'sdk', 'include', 'ucrt');
    const umInc = path.join(xwinDir, 'sdk', 'include', 'um');
    const sharedInc = path.join(xwinDir, 'sdk', 'include', 'shared');
    const winrtInc = path.join(xwinDir, 'sdk', 'include', 'winrt');

    const crtLib = path.join(xwinDir, 'crt', 'lib', 'x86_64');
    const umLib = path.join(xwinDir, 'sdk', 'lib', 'um', 'x86_64');
    const ucrtLib = path.join(xwinDir, 'sdk', 'lib', 'ucrt', 'x86_64');

    const imsvcFlags = [crtInc, ucrtInc, umInc, sharedInc, winrtInc]
      .map((p) => `/imsvc${p}`)
      .join(' ');
    const clFlags = `--target=x86_64-pc-windows-msvc -Wno-unused-command-line-argument -fuse-ld=lld-link ${imsvcFlags}`;

    env.CC_x86_64_pc_windows_msvc = 'clang-cl';
    env.CXX_x86_64_pc_windows_msvc = 'clang-cl';
    env.AR_x86_64_pc_windows_msvc = 'llvm-lib';
    env.CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = 'lld-link';
    env.CFLAGS_x86_64_pc_windows_msvc = clFlags;
    env.CXXFLAGS_x86_64_pc_windows_msvc = clFlags;
    env.INCLUDE = [crtInc, ucrtInc, umInc, sharedInc, winrtInc].join(';');
    env.LIB = [crtLib, umLib, ucrtLib].join(';');
    env.CARGO_ENCODED_RUSTFLAGS = [
      `-Lnative=${crtLib}`,
      `-Lnative=${umLib}`,
      `-Lnative=${ucrtLib}`
    ].join('\x1f');
  }

  if (!finalArgs.includes('--target') && !finalArgs.includes('-t')) {
    finalArgs.push('--target', 'x86_64-pc-windows-msvc');
  }
  if (!finalArgs.includes('--no-bundle') && !finalArgs.includes('--bundles')) {
    finalArgs.push('--no-bundle');
  }
}

const tauriBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'tauri.cmd' : 'tauri');
console.log(`[Plume Studio Tauri v2] Exécution : tauri ${finalArgs.join(' ')}`);

const res = spawnSync(tauriBin, finalArgs, {
  cwd: rootDir,
  env,
  stdio: 'inherit'
});

if (res.status === 0 && isBuildCmd) {
  const winExe = path.join(rootDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'PlumeStudioPro.exe');
  const rootExeCopy = path.join(rootDir, 'PlumeStudioPro.exe');
  if (fs.existsSync(winExe)) {
    fs.copyFileSync(winExe, rootExeCopy);
    const sizeMb = (fs.statSync(winExe).size / (1024 * 1024)).toFixed(2);
    console.log(`\n✅ Exécutable Windows natif généré avec succès (${sizeMb} Mo) :`);
    console.log(`   - ${winExe}`);
    console.log(`   - ${rootExeCopy}`);
  }
}

process.exit(res.status ?? 1);
