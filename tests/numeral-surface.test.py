from pathlib import Path
import re,itertools,json
ROOT=Path(__file__).resolve().parents[1]/'src'
# Deliberately limited cascade audit: the known background-color selectors that
# can match unified live arrow cells or replay cells, not a browser CSS engine.
selectors=[
'button','button:hover:not(:disabled)', '.cell','.cell.related','.cell.same-value','.cell.selected','.cell:hover:not(:disabled)', '.cell.conflict','.cell.branch-cell:not(.selected):not(.conflict)', '.cell.hint-focus','.cell.fogged','.cell.batch-selected',
'.history-cell','.history-cell.shared','.history-cell.replay-changed',
'body[data-workspace=unified] .cell',
'body[data-workspace=unified] .cell.related',
'body[data-workspace=unified] .cell.same-value',
'body[data-workspace=unified] .cell.selected',
'body[data-workspace=unified] .cell.conflict',
'body[data-workspace=unified] .cell.hint-focus',
'body[data-workspace=unified] .cell.branch-cell:not(.conflict)',
'body[data-workspace=unified] .cell.batch-selected',
'body[data-workspace=unified] .cell.fogged',
'body[data-workspace=unified] .cell:hover:not(:disabled):not(.selected):not(.conflict)']
def split_sel(s):
 out=[];depth=0;start=0
 for i,c in enumerate(s):
  depth+=c=='(';depth-=c==')'
  if c==',' and not depth:out.append(s[start:i].strip());start=i+1
 return out+[s[start:].strip()]
def spec(s):
 s=s.replace(':not(', '(')
 attrs=len(re.findall(r'\[[^]]*\]',s));s=re.sub(r'\[[^]]*\]','',s)
 return (s.count('#'),attrs+len(re.findall(r'\.[\w-]+|:[\w-]+',s)),len(re.findall(r'(?:^|\s)(?:body|button)(?=\W|$)',s)))
def match(s,states,kind,hover,disabled,fine):
 if 'body[' in s and kind!='live':return False
 if s.endswith(':not(.selected):not(.conflict)') and not fine:return False
 s=s.split(' ')[-1]
 if 'history-cell' in s and kind!='replay':return False
 if re.search(r'(?<!history-)\.cell\b',s) and kind!='live':return False
 if s.startswith('button') and kind!='live':return False
 for no in re.findall(r':not\(([^()]*)\)',s):
  if no.startswith('.') and no[1:] in states:return False
  if no==':disabled' and disabled:return False
 s=re.sub(r':not\([^()]*\)','',s)
 if ':hover' in s and not hover:return False
 return all(c in states for c in re.findall(r'\.([\w-]+)',s))
rules=[]
for fn in ['styles.css','history.css','easter-extras.css','workspace.css','desktop-workspace.css']:
 css=re.sub(r'/\*[\s\S]*?\*/','', (ROOT/fn).read_text())
 for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css):
  props=re.findall(r'(?:^|;)\s*(background(?:-color)?)\s*:\s*([^;]+)',m[2])
  if not props:continue
  for sel in split_sel(m[1]):
   if sel in selectors:
    rules.append(dict(selector=sel,specificity=spec(sel),surface=props[-1][1],source=fn,order=len(rules)))
assert set(selectors)=={r['selector'] for r in rules}, set(selectors)-{r['selector'] for r in rules}
# Proposed minimal mapping mirrors unified source rules plus legacy unguarded
# .cell:hover. Defaults for both cells and 2 replay modifiers are independent.
proposal=[r for r in rules if r['selector'].startswith('body[data-workspace=unified]') or r['selector'] in ['.cell:hover:not(:disabled)','.history-cell','.history-cell.shared','.history-cell.replay-changed']]
def winner(rs,states,kind,hover=False,disabled=False,fine=True):
 candidates=[r for r in rs if match(r['selector'],states,kind,hover,disabled,fine)]
 return max(candidates,key=lambda r:(r['specificity'],r['order']))
features=['related','same-value','selected','conflict','hint-focus','branch-cell','batch-selected','fogged']
cases=0
for bits in itertools.product([False,True],repeat=len(features)):
 states={'cell'}|{s for s,b in zip(features,bits) if b}
 for hover,disabled,fine in itertools.product([False,True],repeat=3):
  a=winner(rules,states,'live',hover,disabled,fine);b=winner(proposal,states,'live',hover,disabled,fine)
  assert a['surface']==b['surface'],(states,hover,disabled,fine,a,b)
  cases+=1
for bits in itertools.product([False,True],repeat=2):
 states={'history-cell'}|{s for s,b in zip(['shared','replay-changed'],bits) if b}
 a=winner(rules,states,'replay');b=winner(proposal,states,'replay');assert a['surface']==b['surface'];cases+=1
out={'static_cases_passed':cases,'rules':rules,'representative':[]}
for label,st,h,d,f in [('plain',[],0,0,1),('selected branch',['selected','branch-cell'],0,0,1),('batch branch',['batch-selected','branch-cell'],0,0,1),('conflict hint',['conflict','hint-focus'],0,0,1),('branch hover',['branch-cell'],1,0,1),('batch hover',['batch-selected'],1,0,1),('conflict hover',['conflict'],1,0,1),('plain hover coarse',[],1,0,0),('related hover coarse',['related'],1,0,0)]:
 w=winner(rules,{'cell'}|set(st),'live',h,d,f)
 out['representative'].append({'state':label,'surface':w['surface'],'winner':w['selector'],'specificity':w['specificity']})
# Validate production --numeral-base rules against original winning backgrounds.
def strip_where(s):
 while ':where(' in s:
  a=s.index(':where(');i=a+7;depth=1
  while depth:
   depth+=(s[i]=='(')-(s[i]==')');i+=1
  s=s[:a]+s[i:]
 return re.sub(r'\s+',' ',s).strip()
css=re.sub(r'/\*[\s\S]*?\*/','',(ROOT/'desktop-workspace.css').read_text())
production=[]
for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css):
 p=re.search(r'(?:^|;)\s*--numeral-base:([^;]+)',m[2])
 if not p:continue
 for raw in split_sel(m[1]):
  sel=strip_where(raw)
  assert sel in selectors,sel
  production.append(dict(selector=sel,specificity=spec(sel),surface=p[1],source='production variables',order=len(production)))
production_cases=0
for bits in itertools.product([False,True],repeat=len(features)):
 states={'cell'}|{s for s,b in zip(features,bits) if b}
 for hover,disabled,fine in itertools.product([False,True],repeat=3):
  a=winner(rules,states,'live',hover,disabled,fine);b=winner(production,states,'live',hover,disabled,fine)
  assert a['surface']==b['surface'],(states,hover,disabled,fine,a,b)
  production_cases+=1
for bits in itertools.product([False,True],repeat=2):
 states={'history-cell'}|{s for s,b in zip(['shared','replay-changed'],bits) if b}
 assert winner(rules,states,'replay')['surface']==winner(production,states,'replay')['surface'];production_cases+=1
print('PASS production numeral-base cascade:',production_cases,'static cases; source parser only, not browser pixels')
