// Exact UV panel mapping from the uploaded wardrobe, using its original photos.
function panel(ctx, image, box, offset, rear) {
  if (!image || !box) return;
  const [x, y, w, h] = box, top = rear ? .12 : .20;
  ctx.drawImage(image, x + w * .12, y + h * top, w * .76, h * (.94 - top), offset + 51, rear ? 100 : 170, 410, rear ? 862 : 792);
  for (const side of [0, 1]) ctx.drawImage(image, x + w * (side ? .87 : .03), y + h * .43, w * .10, h * .51, offset + (side ? 474 : 0), 430, 38, 532);
}
export default function forgeUniformAtlas(element, item, loaded) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = element === 'shorts' ? item.shorts : item.primary; ctx.fillRect(0, 0, 1024, 1024);
  if (element === 'jersey') {
    if (loaded.front) panel(ctx, loaded.front, loaded.layout.front, 0, false);
    else ctx.drawImage(loaded.image, 1000, 840, 360, 475, 58, 218, 396, 745);
    if (loaded.back) panel(ctx, loaded.back, loaded.layout.back, 512, true);
    else if (loaded.front) {
      const [x, y, w, h] = loaded.layout.front;
      for (const side of [0, 1]) ctx.drawImage(loaded.front, x + w * (side ? .87 : .03), y + h * .43, w * .10, h * .51, 512 + (side ? 474 : 0), 430, 38, 532);
    }
  } else if (element === 'shorts') {
    for (let row = 0; row < 1024; row++) {
      const t = (row + .5) / 1024;
      ctx.drawImage(loaded.image, 945 - 30 * t, 1343 + 661 * t, 443 + 64 * t, 1, 0, row, 512, 1);
    }
    const front = ctx.getImageData(0, 0, 512, 1024).data;
    const fabric = (row, start) => [0, 1, 2].map(channel => {
      const values = Array.from({ length: 20 }, (_, x) => front[(row * 512 + start + x) * 4 + channel]);
      return values.sort((a, b) => a - b)[10];
    });
    for (let row = 0; row < 1024; row++) {
      const left = fabric(row, 62), right = fabric(row, 430);
      ctx.fillStyle = `rgb(${left.map((value, channel) => Math.round((value + right[channel]) * .5)).join(',')})`;
      ctx.fillRect(512, row, 512, 1); ctx.fillRect(0, row, 40, 1); ctx.fillRect(472, row, 40, 1);
    }
    ctx.fillStyle = item.accent; ctx.fillRect(0, 0, 1024, 32); ctx.fillRect(0, 984, 1024, 15);
  }
  return canvas;
}