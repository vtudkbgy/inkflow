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
const isWin = process.platform === 'win32';
const isBuildCmd = args[0] === 'build';
const isDevCmd = args[0] === 'dev';

const env = { ...process.env };
const localRustup = path.join(rootDir, '.rustup');
const localCargo = path.join(rootDir, '.cargo');
const localCargoBin = path.join(localCargo, 'bin');

if (fs.existsSync(path.join(localRustup, 'toolchains'))) {
  env.RUSTUP_HOME = localRustup;
}
if (fs.existsSync(localCargo)) {
  env.CARGO_HOME = localCargo;
}
if (fs.existsSync(localCargoBin)) {
  env.PATH = `${localCargoBin}${path.delimiter}${env.PATH || ''}`;
}

if (isWin && (isBuildCmd || isDevCmd) && !env.RUSTUP_TOOLCHAIN) {
  const hasMsvcLink = spawnSync('where', ['link.exe'], { stdio: 'ignore' }).status === 0;
  if (!hasMsvcLink) {
    const toolchains = spawnSync('rustup', ['toolchain', 'list'], { encoding: 'utf8', env });
    if (toolchains.status === 0 && /stable-x86_64-pc-windows-gnu/.test(toolchains.stdout || '')) {
      env.RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu';
      // Ajoute WinLibs MinGW-w64 (dlltool, as, windres, gcc) s'il est installé via winget
      const wingetPkgs = path.join(env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
      if (fs.existsSync(wingetPkgs)) {
        const winlibsDir = fs.readdirSync(wingetPkgs).find((d) => d.startsWith('BrechtSanders.WinLibs'));
        if (winlibsDir) {
          const mingwBin = path.join(wingetPkgs, winlibsDir, 'mingw64', 'bin');
          if (fs.existsSync(mingwBin)) {
            env.PATH = `${mingwBin}${path.delimiter}${env.PATH || ''}`;
          }
        }
      }
      console.log('[InkFlow Tauri v2] MSVC link.exe absent → bascule automatique sur stable-x86_64-pc-windows-gnu');
    }
  }
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
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (res.status === 0 && isBuildCmd) {
  const candidates = [
    path.join(rootDir, 'src-tauri', 'target', 'release', 'InkFlow.exe'),
    path.join(rootDir, 'src-tauri', 'target', 'x86_64-pc-windows-gnu', 'release', 'InkFlow.exe'),
    path.join(rootDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'InkFlow.exe')
  ];
  const winExe = candidates.find((p) => fs.existsSync(p));
  const rootExeCopy = path.join(rootDir, 'InkFlow.exe');
  if (winExe) {
    let copiedToRoot = false;
    try {
      fs.copyFileSync(winExe, rootExeCopy);
      copiedToRoot = true;
    } catch (err) {
      if (err && (err.code === 'EBUSY' || err.code === 'EPERM')) {
        console.warn(`\n⚠️ Impossible d'écraser ${rootExeCopy} car l'application InkFlow.exe est actuellement ouverte.`);
        console.warn(`   Fermez la fenêtre InkFlow.exe ou lancez directement : ${winExe}`);
      } else {
        throw err;
      }
    }
    const webview2Dll = path.join(path.dirname(winExe), 'WebView2Loader.dll');
    if (fs.existsSync(webview2Dll)) {
      try {
        fs.copyFileSync(webview2Dll, path.join(rootDir, 'WebView2Loader.dll'));
      } catch (_) {}
    }
    const sizeMb = (fs.statSync(winExe).size / (1024 * 1024)).toFixed(2);
    console.log(`\n✅ Exécutable Windows natif généré avec succès (${sizeMb} Mo) :`);
    console.log(`   - ${winExe}`);
    if (copiedToRoot) console.log(`   - ${rootExeCopy}`);
  }
}

process.exit(res.status ?? 1);
