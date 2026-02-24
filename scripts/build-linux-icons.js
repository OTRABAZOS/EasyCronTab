#!/usr/bin/env node
/**
 * Genera iconos PNG en tamaños correctos para Linux (electron-builder).
 * Convierte build/icon.png (puede ser JPEG con extensión .png) a PNG real
 * y crea build/icons/256x256.png y 512x512.png para evitar la carpeta 0x0 en hicolor.
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const srcIcon = path.join(root, 'build', 'icon.png');
const outDir = path.join(root, 'build', 'icons');

if (!fs.existsSync(srcIcon)) {
  console.error('No existe build/icon.png');
  process.exit(1);
}

async function main() {
  const buf = fs.readFileSync(srcIcon);
  const image = sharp(buf);
  const meta = await image.metadata();
  console.log('Icono origen:', srcIcon, 'tamaño', meta.width + 'x' + meta.height);

  fs.mkdirSync(outDir, { recursive: true });

  const png512 = await sharp(buf).resize(512, 512).png().toBuffer();
  const png256 = await sharp(buf).resize(256, 256).png().toBuffer();

  // PNG principal 512x512 (para ventana y recurso)
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), png512);
  console.log('Generado build/icon.png 512x512 (PNG)');

  fs.writeFileSync(path.join(outDir, '256x256.png'), png256);
  console.log('Generado build/icons/256x256.png');

  fs.writeFileSync(path.join(outDir, '512x512.png'), png512);
  console.log('Generado build/icons/512x512.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
