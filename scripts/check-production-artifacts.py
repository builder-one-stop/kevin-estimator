import json,zipfile,stat,hashlib,re,struct,sys
from pathlib import Path
root=Path.cwd().resolve();folder=root/'.test-tmp/netlify-functions';out=root/'evidence/pricing-mobile-2026-10-28';private={}
for line in Path(sys.argv[1]).read_text().splitlines():
 m=re.match(r'\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$',line)
 if m and re.search('SECRET|SERVICE_ROLE|API_KEY|ACCESS_TOKEN|PASSWORD',m[1]):
  value=m[2].strip().strip('\"\'')
  if len(value)>=16:private[m[1]]=value.encode()
report={'packager':'@netlify/zip-it-and-ship-it 16.5.0 (existing Netlify CLI27.14.2 cache)','bundler':'nft','runtime':'nodejs24.x','functions':[],'secretMatches':[],'fixtureMatches':[],'forbiddenFiles':[],'symlinks':[],'productionDist':{}}
for p in folder.glob('*.zip'):
 target=(root/'.test-tmp/zip-smoke'/p.stem).resolve();assert target.is_relative_to(root);target.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None;names=z.namelist();native=[]
  for i in z.infolist():
   n=i.filename;assert (target/n).resolve().is_relative_to(target)
   if stat.S_ISLNK(i.external_attr>>16):report['symlinks'].append({'zip':p.name,'file':n})
   if re.search(r'(^|/)(\.env[^/]*|\.git|\.local-review|tests|evidence)(/|$)|\.(pem|key)$',n):report['forbiddenFiles'].append({'zip':p.name,'file':n})
   b=z.read(n)
   for k,v in private.items():
    if v in b:report['secretMatches'].append({'variable':k,'zip':p.name,'file':n})
   for token in [b'fixture-a',b'fixture-b',b'fixture-public-key',b'Synthetic-only',b'127.0.0.1:8790']:
    if token in b:report['fixtureMatches'].append({'token':token.decode(),'zip':p.name,'file':n})
   if ('sharp-linux-x64' in n and n.endswith('.node')) or ('sharp-libvips-linux-x64' in n and '.so.' in n):
    native.append({'file':n,'elf64x86':b[:4]==b'\x7fELF' and b[4]==2 and struct.unpack('<H',b[18:20])[0]==62,'sha256':hashlib.sha256(b).hexdigest()})
  assert not report['symlinks'];z.extractall(target)
  main=z.read('netlify/functions/'+p.stem+'.mjs')
  report['functions'].append({'name':p.stem,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'entries':len(names),'native':native,'hasLinuxNativePair':len(native)>=2,'hasBootstrap':'___netlify-bootstrap.mjs' in names,'newPricingMarkers':{s:s.encode() in main for s in ['275001','20941','technicalProfile','materialSelections']}})
  if p.stem in ['ai','workers','worker-cleanup']:assert len(native)>=2 and all(n['elf64x86'] for n in native)
for p in (root/'dist').rglob('*'):
 if not p.is_file():continue
 b=p.read_bytes()
 for k,v in private.items():
  if v in b:report['secretMatches'].append({'variable':k,'file':str(p.relative_to(root))})
 for token in [b'fixture-a',b'fixture-b',b'fixture-public-key',b'Synthetic-only',b'127.0.0.1:8790',b'/__fixture/']:
  if token in b:report['fixtureMatches'].append({'token':token.decode(),'file':str(p.relative_to(root))})
 if re.search(r'(^|/)(\.env[^/]*|\.local-review)(/|$)|\.(pem|key)$',str(p.relative_to(root))):report['forbiddenFiles'].append(str(p.relative_to(root)))
public=json.loads(Path(sys.argv[2]).read_text());js=b''.join(p.read_bytes() for p in (root/'dist').rglob('*.js'));report['productionDist']={'kevinTargetPresent':public['url'].encode() in js,'existingPublicKeyPresent':public['publishableKey'].encode() in js,'privateValuesCheckedByName':list(private)}
assert not any(report[k] for k in ['secretMatches','fixtureMatches','forbiddenFiles','symlinks']);assert all(report['productionDist'][k] for k in ['kevinTargetPresent','existingPublicKeyPresent']);report['status']='passed';(out/'production-artifact-checks.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
