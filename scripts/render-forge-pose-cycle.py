"""CPU visual review of the three actual rig poses; no app or browser used."""
import importlib.util
import json
import math
from pathlib import Path

module_path = Path(__file__).with_name('render-forge-athlete.py')
spec = importlib.util.spec_from_file_location('forge_cpu', module_path)
cpu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cpu)
output = cpu.ROOT / 'docs/forge-pose-cycle'
cpu.CAPTURES = output / 'runtime-review'
release, doc, read = cpu.load()
labels = ['dunk', 'jump-shot', 'dribble']
rows = {label: cpu.posed(label, doc, read) for label in labels}
fit = {'halfY': 0, 'sweep': 0}
for model in rows.values():
    points = cpu.np.concatenate([row[0] for row in model])
    assert cpu.np.isfinite(points).all()
    size = cpu.np.ptp(points, axis=0)
    fit['halfY'] = max(fit['halfY'], float(size[1] * .57))
    fit['sweep'] = max(fit['sweep'], float(cpu.np.hypot(size[0], size[2]) * .57))
sheet = cpu.Image.new('RGB', (1260, 1220), (244, 247, 246))
draw = cpu.ImageDraw.Draw(sheet)
for column, label in enumerate(labels):
    for row, (yaw, view) in enumerate([(0, 'Front'), (-.65, 'Three-quarter')]):
        rendered = cpu.render(rows[label], yaw, fit)
        rendered.save(output / f'{label}-{view.lower()}.png')
        sheet.paste(rendered, (420 * column, 610 * row))
        draw.text((420 * column + 14, 610 * row + 587), f'{label} / {view}', fill=(30, 50, 60))
    print(f'CPU rendered pose: {label}', flush=True)
sheet.save(output / 'pose-cycle-review.png')
(output / 'render-validation.json').write_text(json.dumps({
    'status': 'passed', 'modelSha256': release['model']['sha256'], 'poses': labels,
    'fit': fit, 'method': 'CPU raster of actual Three.js joint matrices and runtime garment textures',
    'limitations': 'Approximate lighting and centroid texture sampling; no GPU or interactive app check.',
    'appUsed': False, 'deployed': False,
}, indent=2) + '\n')
