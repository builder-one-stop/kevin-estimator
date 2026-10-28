"""Read-only validation/rendering of actual technical-coverage browser PDF downloads."""
import json,subprocess
from pathlib import Path
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageDraw
folder=Path('evidence/technical-coverage-2026-10-28')
browser=json.loads((folder/'report.json').read_text())
totals=json.loads((folder/'document-totals.json').read_text())
poppler=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
report={}
for lang in ['en','es']:
 for mode in ['applied','resized']:
  name=f'{mode}-{lang}';path=folder/f'{name}.pdf';reader=PdfReader(path);text=' '.join(' '.join(p.extract_text() for p in reader.pages).split())
  checks={'pages':len(reader.pages),'paint_model':'275001' in text,'primer_model':'20941' in text,'paint_range':'250-400' in text,'primer_range':'300-400' in text,'paint_revision':'11/2020' in text,'primer_revision':'03/2019' in text,'technical_consultation_date':'2026-10-28' in text,'original_price_date':'2026-10-17' in text,'criterion':('Extremo inferior elegido' if lang=='es' else 'Lower bound chosen') in text,'not_guaranteed':('no garantía' if lang=='es' else 'not a guarantee') in text,'primer_labor_pending':('Horas de aplicación de imprimante pendientes' if lang=='es' else 'Primer application labor hours pending') in text,'preliminary':('PRESUPUESTO PRELIMINAR' if lang=='es' else 'PRELIMINARY BUDGET') in text,'scope_explicit':('elegidas explícitamente' if lang=='es' else 'explicitly selected') in text,'all_pages_numbered':all(f'{i+1}/{len(reader.pages)}' in p.extract_text() for i,p in enumerate(reader.pages))}
  checks['saved_known_subtotal_present']=f"${totals[name]['priceCents']/100:,.2f}" in text
  if mode=='resized':
   checks['resized_area']='640 sf' in text
   checks['resized_paint_gallons']='5.632' in text
   checks['resized_primer_gallons']='2.3467' in text
   checks['manual_price_preserved']=('Entrada manual' if lang=='es' else 'Manual entry') in text
  with pdfplumber.open(path) as doc:checks['text_within_bounds']=all(39<=c['x0']<=c['x1']<=574 and 13<=c['top']<=c['bottom']<=781 for p in doc.pages for c in p.chars)
  assert all(checks.values()),(name,checks)
  subprocess.run([str(poppler),'-scale-to','1200','-png',str(path),str(folder/f'render-{name}')],check=True)
  pages=sorted(p for p in folder.glob(f'render-{name}-*.png') if p.stem.split('-')[-1].isdigit())
  sheet=Image.new('RGB',(440*min(3,len(pages)),590*((len(pages)+2)//3)),'#ddd')
  for i,p in enumerate(pages):
   im=Image.open(p).convert('RGB');im.thumbnail((420,560));x=(i%3)*440;y=(i//3)*590;sheet.paste(im,(x+(440-im.width)//2,y+23));ImageDraw.Draw(sheet).text((x+10,y+6),f'{name} page{i+1}',fill='black')
  sheet.save(folder/f'contact-{name}.png');report[name]=checks
(folder/'pdf-checks.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
