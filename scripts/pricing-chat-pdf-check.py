"""Read-only PDF QA after pricing-chat-browser.mjs; renders independent evidence."""
import json
import subprocess
from pathlib import Path
from pypdf import PdfReader
import pdfplumber
from PIL import Image, ImageDraw

folder = Path('evidence/pricing-chat-2026-10-28')
poppler = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
report = {}
for lang in ['en', 'es']:
    path = folder / f'proposal-{lang}.pdf'
    saved = json.loads((folder / f'saved-{lang}.json').read_text(encoding='utf-8'))
    browser = json.loads((folder / 'report.json').read_text(encoding='utf-8'))
    reader = PdfReader(path)
    text = '\n'.join(page.extract_text() for page in reader.pages)
    total = browser[lang]['totals']['priceCents'] / 100
    checks = {
        'pages': len(reader.pages),
        'saved_total_present': f'${total:,.2f}' in text,
        'no_live_lookup_disclosure': ('sin consulta en vivo' if lang == 'es' else 'no live lookup') in text,
        'unknown_costs_disclosed': ('desconocidos' if lang == 'es' else 'unknown') in text,
        'all_pages_numbered': all(f'{i+1}/{len(reader.pages)}' in page.extract_text() for i, page in enumerate(reader.pages)),
        'manual_or_missing_provenance': ('PRESUPUESTO PRELIMINAR' in text and 'DOES-NOT-EXIST' in text) if lang == 'es' else 'Manual entry' in text,
    }
    with pdfplumber.open(path) as doc:
        checks['text_within_page_bounds'] = all(39 <= c['x0'] <= c['x1'] <= 574 and 13 <= c['top'] <= c['bottom'] <= 781 for page in doc.pages for c in page.chars)
    assert all(checks.values()), (lang, checks)
    subprocess.run([str(poppler), '-scale-to', '1200', '-png', str(path), str(folder / f'pdf-{lang}')], check=True)
    pages = sorted(p for p in folder.glob(f'pdf-{lang}-*.png') if p.stem.split('-')[-1].isdigit())
    thumbs = []
    for i, image_path in enumerate(pages):
        image = Image.open(image_path).convert('RGB')
        image.thumbnail((420, 560))
        tile = Image.new('RGB', (440, 590), '#dddddd')
        tile.paste(image, ((440-image.width)//2, 23))
        ImageDraw.Draw(tile).text((12, 6), f'{lang} page {i+1}', fill='black')
        thumbs.append(tile)
    contact = Image.new('RGB', (440*min(3, len(thumbs)), 590*((len(thumbs)+2)//3)), 'white')
    for i, tile in enumerate(thumbs):
        contact.paste(tile, ((i % 3)*440, (i//3)*590))
    contact.save(folder / f'pdf-{lang}-contact.png')
    report[lang] = checks
(folder / 'pdf-checks.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
