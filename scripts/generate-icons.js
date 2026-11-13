import fs from 'fs';
import path from 'path';
import pngToIco from 'png-to-ico';
import { PNG } from 'pngjs';

// Helper to resize PNG for standard NSIS installer icon
function resizePng(srcPng, targetSize) {
  const dst = new PNG({ width: targetSize, height: targetSize });
  const xRatio = srcPng.width / targetSize;
  const yRatio = srcPng.height / targetSize;

  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);
      const srcIdx = (srcY * srcPng.width + srcX) * 4;
      const dstIdx = (y * targetSize + x) * 4;

      dst.data[dstIdx] = srcPng.data[srcIdx];
      dst.data[dstIdx + 1] = srcPng.data[srcIdx + 1];
      dst.data[dstIdx + 2] = srcPng.data[srcIdx + 2];
      dst.data[dstIdx + 3] = srcPng.data[srcIdx + 3];
    }
  }
  return PNG.sync.write(dst);
}

async function generateIcons() {
  const root = process.cwd();
  const buildDir = path.join(root, 'build');
  const publicDir = path.join(root, 'public');

  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  const pwa512 = path.join(publicDir, 'pwa-512x512.png');

  if (fs.existsSync(pwa512)) {
    try {
      const fn = pngToIco.default || pngToIco;

      // Copy master icon to build/icon.png
      fs.copyFileSync(pwa512, path.join(buildDir, 'icon.png'));

      // 1. Generate full Windows icon (256, 48, 32, 16) for VOXReader.exe
      // Passing single file path makes png-to-ico resize properly instead of keeping 512x512
      const fullIcoBuf = await fn(pwa512);
      fs.writeFileSync(path.join(buildDir, 'icon.ico'), fullIcoBuf);
      fs.writeFileSync(path.join(publicDir, 'icon.ico'), fullIcoBuf);
      console.log('[IconGenerator] Berhasil membuat build/icon.ico (aplikasi):', fullIcoBuf.length, 'bytes');

      // 2. Generate dedicated NSIS installer/uninstaller icon (48, 32, 16)
      // NSIS requires standard icon dimensions and exact byte matching to avoid "invalid icon file size"
      const src = PNG.sync.read(fs.readFileSync(pwa512));
      const p48 = resizePng(src, 48);
      const p32 = resizePng(src, 32);
      const p16 = resizePng(src, 16);

      const installerIcoBuf = await fn([p48, p32, p16]);
      fs.writeFileSync(path.join(buildDir, 'installer.ico'), installerIcoBuf);
      console.log('[IconGenerator] Berhasil membuat build/installer.ico (NSIS installer):', installerIcoBuf.length, 'bytes');
    } catch (err) {
      console.warn('[IconGenerator] Peringatan saat membuat icon:', err?.message || err);
    }
  }
}

generateIcons();

