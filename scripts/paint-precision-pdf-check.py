"""Read-only inspection and rendering of synthetic precision QA PDFs."""
import json, subprocess
from pathlib import Path
from pypdf import PdfReader
import pdfplumber
from PIL import Image, ImageDraw
folder=Path('evidence/paint-precision-2026-10-28')
poppler=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
browser=json.loads((folder/'report.json').read_text())
report={}
for lang in ['en','es']:
 for mode in ['pending','resolved']:
  path=folder/f'{mode}-{lang}.pdf'
  reader=PdfReader(path);text='\n'.join(p.extract_text() for p in reader.pages)
  checks={'pages':len(reader.pages),'supplier_fixture_disclosed':'Synthetic fixture' in text,'five_gallon_package':'5 US gal' in text,'all_pages_numbered':all(f'{i+1}/{len(reader.pages)}' in p.extract_text() for i,p in enumerate(reader.pages))}
  if mode=='pending':
   checks['preliminary']=('PRESUPUESTO PRELIMINAR' if lang=='es' else 'PRELIMINARY BUDGET') in text
   checks['package_change_note']=('confirma una nueva cantidad' if lang=='es' else 'confirm a new purchase quantity') in text
  else:
   total=next(x for x in browser['checks'] if x['language']==lang)['totals']['priceCents']/100
   checks['saved_total_present']=f'${total:,.2f}' in text
   checks['manual_quantity_note']=('Cantidad ajustada manualmente: 1 ea' if lang=='es' else 'Manual quantity override: 1 ea') in text
  with pdfplumber.open(path) as doc:
   checks['text_bounds']=all(39<=c['x0']<=c['x1']<=574 and 13<=c['top']<=c['bottom']<=781 for page in doc.pages for c in page.chars)
  assert all(checks.values()),(lang,mode,checks)
  subprocess.run([str(poppler),'-scale-to','1200','-png',str(path),str(folder/f'render-{mode}-{lang}')],check=True)
  pages=sorted(p for p in folder.glob(f'render-{mode}-{lang}-*.png') if p.stem.split('-')[-1].isdigit())
  sheet=Image.new('RGB',(440*len(pages),590),'#dddddd')
  for i,p in enumerate(pages):
   im=Image.open(p).convert('RGB');im.thumbnail((420,560));sheet.paste(im,(i*440+(440-im.width)//2,23));ImageDraw.Draw(sheet).text((i*440+10,6),f'{mode} {lang} page{i+1}',fill='black')
  sheet.save(folder/f'contact-{mode}-{lang}.png');report[f'{mode}-{lang}']=checks
(folder/'pdf-checks.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
