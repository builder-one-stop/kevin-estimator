"""Read-only validation/rendering of actual multi-function browser PDF downloads."""
import json,subprocess
from pathlib import Path
from pypdf import PdfReader
import pdfplumber
from PIL import Image,ImageDraw
folder=Path('evidence/material-functions-2026-10-28')
browser=json.loads((folder/'report.json').read_text())
poppler=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe'
report={}
for lang in ['en','es']:
 for mode in ['pending','reviewed']:
  name=f'{mode}-{lang}';path=folder/f'{name}.pdf';reader=PdfReader(path);text=' '.join(' '.join(p.extract_text() for p in reader.pages).split())
  checks={'pages':len(reader.pages),'paint_identifier':'433052' in text,'original_primer_identifier':'UGPR00-1-WH-1' in text,'two_protection_identifiers':all(s in text for s in ['590695','3487100']),'abrasive_identifier':'6014059' in text,'source_date_preserved':'2026-10-17' in text,'original_plan_disclosed':('Referencia del plan aprobado' if lang=='es' else 'Approved plan reference') in text,'allowance_replacement_disclosed':('Sustituye el supuesto de consumibles' if lang=='es' else 'Replaces the') in text,'all_pages_numbered':all(f'{i+1}/{len(reader.pages)}' in p.extract_text() for i,p in enumerate(reader.pages))}
  if mode=='pending':
   checks['preliminary']=('PRESUPUESTO PRELIMINAR' if lang=='es' else 'PRELIMINARY BUDGET') in text
   checks['primer_labor_pending']=('Horas de aplicación de imprimante pendientes' if lang=='es' else 'Primer application labor hours pending') in text
  else:
   total=next(c for c in browser['checks'] if c['language']==lang)['totals']['priceCents']/100
   checks['saved_total_present']=f'${total:,.2f}' in text
   checks['new_primer_identifier']='0460001' in text
   checks['explicit_zero_labor_review']=('Cantidad ajustada manualmente: 0 hr' if lang=='es' else 'Manual quantity override: 0 hr') in text
   checks['reviewed_labor_not_pending']=('Horas de aplicación de imprimante pendientes' if lang=='es' else 'Primer application labor hours pending') not in text
  with pdfplumber.open(path) as doc:checks['text_within_bounds']=all(39<=c['x0']<=c['x1']<=574 and 13<=c['top']<=c['bottom']<=781 for p in doc.pages for c in p.chars)
  assert all(checks.values()),(name,checks)
  subprocess.run([str(poppler),'-scale-to','1200','-png',str(path),str(folder/f'render-{name}')],check=True)
  pages=sorted(p for p in folder.glob(f'render-{name}-*.png') if p.stem.split('-')[-1].isdigit())
  sheet=Image.new('RGB',(440*min(3,len(pages)),590*((len(pages)+2)//3)),'#ddd')
  for i,p in enumerate(pages):
   im=Image.open(p).convert('RGB');im.thumbnail((420,560));x=(i%3)*440;y=(i//3)*590;sheet.paste(im,(x+(440-im.width)//2,y+23));ImageDraw.Draw(sheet).text((x+10,y+6),f'{name} page{i+1}',fill='black')
  sheet.save(folder/f'contact-{name}.png');report[name]=checks
(folder/'pdf-checks.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
