import { execFileSync } from 'node:child_process'
import { readFile,readdir } from 'node:fs/promises'
import path from 'node:path'
const git=args=>execFileSync('git',args,{maxBuffer:256*1024*1024,stdio:['pipe','pipe','pipe']})
const key=process.env.OPENAI_API_KEY?Buffer.from(process.env.OPENAI_API_KEY):null
const suspicious=/(?<![A-Za-z0-9_-])sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}/
const violations=[]
const candidates=[]
const inspect=(bytes,label)=>{if(key&&bytes.includes(key))violations.push(label+':configured-key');const matches=bytes.toString('utf8').match(new RegExp(suspicious.source,'g'))??[];for(const candidate of matches){violations.push(label+':key-pattern');candidates.push({location:label,length:candidate.length,syntheticName:/test|fixture|example|fake|secret-should/.test(candidate)})}}
const files=git(['ls-files','-z','--cached','--others','--exclude-standard']).toString().split('\0').filter(Boolean)
for(const file of files){if(/(^|\/)\.env\.local$/.test(file))violations.push('tracked-local-environment');try{inspect(await readFile(file),file)}catch{throw new Error('Unable to inspect tracked file; details omitted')}}
let frontendFiles=0
async function frontend(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isDirectory())await frontend(target);else if(/\.(js|css|html|json|webmanifest)$/.test(entry.name)){inspect(await readFile(target),'frontend-build');frontendFiles++}}}
await frontend('dist')
const rows=git(['rev-list','--objects','HEAD']).toString().trim().split('\n')
const envInHistory=rows.some(row=>/(?:^|\/)\.env\.local$/.test(row));if(envInHistory)violations.push('local-environment-in-history')
const textPath=/(?:\.(?:m?js|cjs|jsx|ts|tsx|json|md|txt|ya?ml|toml|html|css|env|ini|conf)|(?:^|\/)\.env(?:\.[^/]+)?|\.gitignore|Dockerfile)$/i
const selected=rows.filter(row=>row.includes(' ')&&textPath.test(row.slice(row.indexOf(' ')+1)))
const unique=[...new Set(selected.map(row=>row.split(' ')[0]))]
// Batch inspection keeps secrets inside this process; no blob, match, key, or
// environment value is printed or passed in a command argument.
const child=execFileSync('git',['cat-file','--batch'],{input:unique.join('\n')+'\n',maxBuffer:256*1024*1024,stdio:['pipe','pipe','pipe']})
let offset=0,historyBlobs=0
while(offset<child.length){const end=child.indexOf(10,offset),header=child.subarray(offset,end).toString(),parts=header.split(' ');if(parts[1]!=='blob'||!/^\d+$/.test(parts[2]??''))throw new Error('History object inspection failed');const length=Number(parts[2]),start=end+1;inspect(child.subarray(start,start+length),'branch-history:'+selected.find(row=>row.startsWith(parts[0]+' '))?.slice(41));historyBlobs++;offset=start+length+1}
console.info(JSON.stringify({configuredKeyCompared:Boolean(key),trackedAndNewFiles:files.length,frontendFiles,historyTextBlobs:historyBlobs,envLocalTracked:files.some(f=>/(^|\/)\.env\.local$/.test(f)),envLocalInHistory:envInHistory,violations:violations.length}))
if(violations.length){console.info(JSON.stringify({configuredKeyViolations:violations.filter(v=>v.endsWith(':configured-key')).length,candidates}));throw new Error('Secret boundary violation. Push stopped; credential values intentionally omitted.')}
