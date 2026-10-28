import json,subprocess
from pathlib import Path
from pypdf import PdfReader
import pdfplumber
p=Path('evidence/catalog-p2-2026-10-28');pdf=p/'own-selected-en.pdf';reader=PdfReader(pdf);text=' '.join(' '.join(x.extract_text() for x in reader.pages).split());totals=json.loads((p/'own-totals.json').read_text());checks={'pages':len(reader.pages),'selectedOwnSku':'OWN-65' in text,'ownProduct':'Own finish paint 65' in text,'originalDate':'2026-10-25' in text,'knownSubtotal':f"${totals['priceCents']/100:,.2f}" in text,'allPagesNumbered':all(f'{i+1}/{len(reader.pages)}' in page.extract_text() for i,page in enumerate(reader.pages))}
with pdfplumber.open(pdf) as doc:checks['textWithinBounds']=all(39<=c['x0']<=c['x1']<=574 and 13<=c['top']<=c['bottom']<=781 for page in doc.pages for c in page.chars)
assert all(checks.values()),checks
poppler=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe';subprocess.run([str(poppler),'-scale-to','1200','-png',str(pdf),str(p/'own-render')],check=True)
from PIL import Image,ImageDraw
pages=list(p.glob('own-render-*.png'));sheet=Image.new('RGB',(440*min(3,len(pages)),590*((len(pages)+2)//3)),'#ddd')
for i,impath in enumerate(pages):
 im=Image.open(impath).convert('RGB');im.thumbnail((420,560));sheet.paste(im,((i%3)*440+10,(i//3)*590+23))
sheet.save(p/'own-contact.png');(p/'own-pdf-checks.json').write_text(json.dumps(checks,indent=2));print(json.dumps(checks))
