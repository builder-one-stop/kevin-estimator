"""QA helper; requires PyMuPDF. Run after fixture + browser PDF generation."""
import json
from pathlib import Path
import fitz
folder = Path('evidence/ai-estimator')
result = {}
for path in folder.glob('*.pdf'):
    doc = fitz.open(path)
    text = '\n'.join(page.get_text() for page in doc)
    total = '$4,008.60' if path.name.startswith('fixture') else '$4,273.80'
    checks = {
        'pages': len(doc), 'expected_total': total, 'total_present': total in text,
        'default_internal_cost_hidden': '$2,947.50' not in text and 'Internal cost:' not in text,
        'section_headers_on_new_pages': all('continued' in p.get_text().splitlines()[1] or '—' in p.get_text().splitlines()[1] for p in list(doc)[1:]),
        'all_pages_numbered': all(f'{i+1}/{len(doc)}' in p.get_text() for i,p in enumerate(doc)),
        'kitchen_walls_only': 'Included: Walls only' in text,
        'spot_prime_preserved': 'Spot-prime only' in text,
        'no_expanded_prime': 'Prime all surfaces' not in text,
        'alternative_finish_preserved': 'selection pending' in text,
        'ceiling_product_preserved': 'Interior Latex Flat Ceiling Paint' in text,
        'no_overflow': all(b[0]>=40 and b[2]<=570 and b[1]>=15 and b[3]<=780 for p in doc for b in p.get_text('blocks')),
    }
    assert all(v for v in checks.values()), (path.name, checks)
    for i, page in enumerate(doc):
        page.get_pixmap(matrix=fitz.Matrix(1,1)).save(f'/tmp/onestop-{path.stem}-{i+1}.png')
    result[path.name] = checks
(folder/'pdf-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
