"""Import selected CC-BY prose from fixed Open RN chapter URLs. No patient data.

Tables, figures, quotations, boxed third-party content, media and references are
excluded. A chapter selection is not a complete book or a clinical endorsement.
"""
import concurrent.futures
import hashlib
import html
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'server/capabilities'
SELECTIONS = [
 ('fund-patient', 'nursingfundamentals', '2-3-communicating-with-patients', '与患者沟通', ['communication','interview']),
 ('fund-team', 'nursingfundamentals', '2-4-communicating-with-health-care-team-members', '团队沟通与交接', ['handoff','documentation']),
 ('fund-document', 'nursingfundamentals', '2-5-documentation', '记录与电子文书', ['documentation','quality']),
 ('fund-assess', 'nursingfundamentals', '4-3-assessment', '信息采集与来源核对', ['interview','subject','quality']),
 ('fund-quality', 'nursingfundamentals', '1-8-quality-and-evidence-based-practice', '质量与循证实践', ['quality','research']),
 ('fund-culture', 'nursingfundamentals', '3-4-cultural-competence', '文化与沟通差异', ['communication']),
 ('fund-safety', 'nursingfundamentals', '5-4-culture-of-safety', '安全文化', ['quality']),
 ('skills-history', 'nursingskills', '2-2-health-history-basic-concepts', '健康史基本概念', ['interview','subject']),
 ('skills-components', 'nursingskills', '2-3-components-of-a-health-history', '健康史组成', ['interview','history']),
 ('skills-demographic', 'nursingskills', '2-4-demographic-and-biological-data', '基本资料与信息来源', ['subject','history']),
 ('skills-reason', 'nursingskills', '2-5-reason-for-seeking-health-care', '就诊原因与主诉', ['interview','summary']),
 ('skills-current', 'nursingskills', '2-6-current-and-past-medical-history', '现病史与既往史', ['history','chronology']),
 ('skills-family', 'nursingskills', '2-7-family-health-history', '家族健康史', ['history','subject']),
 ('skills-function', 'nursingskills', '2-8-functional-health-and-activities-of-daily-living', '日常功能与生活状态', ['history','interview']),
 ('skills-systems', 'nursingskills', '2-9-review-of-body-systems', '系统回顾', ['interview','history']),
 ('skills-example', 'nursingskills', '2-10-sample-documentation', '健康史记录示例', ['documentation','summary']),
 ('skills-checklist', 'nursingskills', '2-11-checklist-for-obtaining-a-health-history', '健康史采集核对', ['quality','interview']),
]

class Prose(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True)
  self.stack=[]; self.main=False; self.block=None; self.parts=[]; self.heading=''; self.rows=[]; self.stop=False
 def handle_starttag(self, tag, attrs):
  a=dict(attrs); classes=a.get('class','')
  if tag=='section' and a.get('data-type')=='chapter': self.main=True
  parent=self.stack[-1][1] if self.stack else False
  excluded=parent or tag in ['table','figure','blockquote','script','style','nav','footer','sup'] or any(x in classes for x in ['textbox','footnote','license','share','video','audio','interactive'])
  if tag not in ['br','hr','img','meta','link','input','source','wbr']:
   self.stack.append((tag,excluded))
  if self.main and not excluded and tag in ['p','h1','h2','h3','h4','li'] and self.block is None:
   self.block=tag;self.parts=[]
 def handle_data(self,data):
  if self.main and self.block and not self.stop and not (self.stack and self.stack[-1][1]): self.parts.append(data)
 def handle_endtag(self,tag):
  if tag==self.block:
   text=' '.join(''.join(self.parts).split()).strip()
   if tag.startswith('h'):
    self.heading=text
    if text.lower() in ['references','footnotes','license','share this book']: self.stop=True
   elif len(text)>45 and not self.stop:
    self.rows.append({'heading':self.heading,'text':text})
   self.block=None;self.parts=[]
  for i in range(len(self.stack)-1,-1,-1):
   if self.stack[i][0]==tag:
    self.stack=self.stack[:i];break
  if tag=='section':self.main=False

def retrieve(selection):
 id,book,slug,title,tags=selection
 url=f'https://wtcs.pressbooks.pub/{book}/chapter/{slug}/'
 raw=urlopen(Request(url,headers={'User-Agent':'Hoooho-recording-source-audit/1.0'}),timeout=35).read().decode('utf-8')
 if 'creativecommons.org/licenses/by/4.0' not in raw: raise ValueError('CC-BY-4.0 declaration missing: '+id)
 parser=Prose();parser.feed(raw)
 if len(parser.rows)<2:raise ValueError('Not enough eligible prose: '+id)
 text='\n\n'.join(r['heading']+'\n'+r['text'] for r in parser.rows)+'\n'
 path=DEST/'sources'/f'{id}.txt';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
 return {'id':id,'title':title,'book':'Nursing Fundamentals 2e' if book=='nursingfundamentals' else 'Nursing Skills 2e','publisher':'WisTech Open / Open RN','editors':['Kimberly Ernstmeyer','Elizabeth Christman'],'url':url,'license':'CC-BY-4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','attribution':f'{"Nursing Fundamentals 2e (2024)" if book=="nursingfundamentals" else "Nursing Skills 2e (2023)"}, Open RN, edited by Kimberly Ernstmeyer and Elizabeth Christman, WisTech Open. CC BY 4.0 except noted material. Hoooho selected prose; tables, media, boxed content, quotations and references excluded. No endorsement implied.','selection':'Selected narrative prose only; not the complete chapter or book','file':f'sources/{id}.txt','sha256':hashlib.sha256(text.encode()).hexdigest(),'bytes':len(text.encode()),'retrievedAt':'2026-11-02','tags':tags,'status':'imported','runtimeUse':'recording_methods_only','clinicalReview':'not_clinically_validated','paragraphs':parser.rows}

if __name__=='__main__':
 DEST.mkdir(parents=True,exist_ok=True)
 results=[];failures=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  futures={pool.submit(retrieve,s):s[0] for s in SELECTIONS}
  for f in concurrent.futures.as_completed(futures):
   try:results.append(f.result())
   except Exception as e:failures.append({'id':futures[f],'error':str(e)})
 results.sort(key=lambda r:r['id'])
 (DEST/'imported-sources.json').write_text(json.dumps({'version':'2026-11-02-v1','sources':results,'failures':failures},ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'imported':len(results),'paragraphs':sum(len(r['paragraphs']) for r in results),'bytes':sum(r['bytes'] for r in results),'failures':failures},ensure_ascii=False))
