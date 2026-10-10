// Export the current playbook diagram as a PNG: the live SVG is serialized
// with its design tokens resolved to literal colors, then rasterized at 2x.
const TOKENS = ['--court-canvas', '--court-accent', '--court-focus', '--court-trim', '--court-trim-ink', '--court-line', '--court-rim', '--court-wood', '--court-wood-dark', '--court-team-hint'];

export async function exportCourtDiagram(svg, filename) {
  if (!svg) return;
  const styles = window.getComputedStyle(svg);
  const clone = svg.cloneNode(true);
  const width = svg.viewBox.baseVal.width * 2;
  clone.setAttribute('width', String(width));
  const height = svg.viewBox.baseVal.height * 2;
  clone.setAttribute('height', String(height));
  let markup = new XMLSerializer().serializeToString(clone);
  for (const token of TOKENS) {
    const value = styles.getPropertyValue(token).trim();
    if (value) markup = markup.split(`var(${token})`).join(value);
  }
  markup = markup.replace(/var\(--font-mono\)/g, 'ui-monospace, Menlo, Consolas, monospace').replace(/var\(--font-display\)/g, 'Impact, sans-serif');
  const source = `<?xml version="1.0" encoding="UTF-8"?>${markup}`;
  const svgUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('The diagram could not be rendered.'));
      image.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const canvasColor = styles.getPropertyValue('--court-canvas').trim();
    context.fillStyle = canvasColor ? `hsl(${canvasColor})` : '#0b1220';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(png);
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
