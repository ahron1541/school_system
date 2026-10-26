// Read-only pre-publication check. Findings identify files, never secret values.
const {execFileSync}=require('node:child_process');
const {readFileSync,existsSync,statSync}=require('node:fs');
const path=require('node:path');
const {parseEnv}=require('node:util');
const root=path.resolve(__dirname,'../..');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
const secrets=new Set();
function remember(value){if(typeof value==='string'&&value.length>=8)secrets.add(value);}
for(const file of ['backend/.env','frontend/.env']){
  if(!existsSync(path.join(root,file)))continue;
  const env=parseEnv(readFileSync(path.join(root,file),'utf8'));
  for(const [key,value] of Object.entries(env))if(/password|secret|token|api.?key|database_url/i.test(key)){
    remember(value);
    if(key==='DATABASE_URL')try{remember(decodeURIComponent(new URL(value).password));}catch{}
  }
}
const databaseSecrets=path.join(root,'.local/database-secrets.json');
if(existsSync(databaseSecrets)){
  function collect(value){if(typeof value==='string')remember(value);else if(value&&typeof value==='object')Object.values(value).forEach(collect);}
  collect(JSON.parse(readFileSync(databaseSecrets,'utf8')));
}
const accounts=path.join(root,'.local/initial-accounts.md');
if(existsSync(accounts))for(const match of readFileSync(accounts,'utf8').matchAll(/^Password:\s*(\S+)/gm))remember(match[1]);
const forbidden=/(^|\/)(\.env(?:\..*)?|\.local|\.pio|\.pioenvs|\.piolibdeps|node_modules|dist|artifacts|test-results|playwright-report|backups|uploads|exports)(\/|$)|(^|\/)(secrets\.h|credentials\.json|database-secrets\.json|initial-accounts\.md|[^/]*-provisioning\.txt)$|\.(dump|backup|sqlite3?|db|pem|key|p12|pfx|bin|elf|hex|har)$/i;
const patterns=[
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['AWS access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['credential URL',/postgres(?:ql)?:\/\/[^\s:'"/]+:(?!PRIVATE_PASSWORD@|YOUR_PASSWORD@)[^\s@'"${}]+@/i],
  ['literal credential (review)',/\b(?:password|api_?key|secret|token)\s*[:=]\s*['"][^'"\r\n]{12,}['"]/i],
];
const privatePath=file=>(forbidden.test(file)||/\.(sql|csv|xlsx?|zip|7z|tar|tgz)$/i.test(file))&&!/(^|\/)\.env\.example$/.test(file)&&!/^backend\/src\/database\/migrations\/[^/]+\.sql$/.test(file);
let blocked=0,reviews=0,scanned=0;
function inspect(file,buffer,origin){
  scanned++;
  if(buffer.includes(0))return;
  const source=buffer.toString('utf8');
  if([...secrets].some(secret=>source.includes(secret))){console.log(`[BLOCK] ${origin} ${file}: matches a local private value`);blocked++;}
  for(const [kind,pattern] of patterns){
    if(!pattern.test(source))continue;
    // Literal credentials include deliberately invalid test fixtures and placeholders.
    console.log(`[REVIEW] ${origin} ${file}: ${kind}`);reviews++;
  }
}
const files=[...new Set(git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean))];
for(const file of files){
  if(privatePath(file)){console.log(`[BLOCK] working tree ${file}: private/generated path is eligible for commit`);blocked++;}
  const absolute=path.join(root,file);if(!existsSync(absolute)||!statSync(absolute).isFile())continue;
  if(statSync(absolute).size>2*1024*1024){console.log(`[REVIEW] working tree ${file}: exceeds 2 MB; content not scanned`);reviews++;continue;}
  inspect(file,readFileSync(absolute),'working tree');
}
if(process.argv.includes('--history')){
  const seen=new Set();
  // Inspect publishable branches/tags, not tool-owned checkpoint tree refs.
  for(const line of git('rev-list','--objects','HEAD','--branches','--tags','--remotes').trim().split('\n')){
    const separator=line.indexOf(' ');if(separator<0)continue;
    const object=line.slice(0,separator),file=line.slice(separator+1);if(seen.has(object))continue;seen.add(object);
    if(git('cat-file','-t',object).trim()!=='blob')continue;
    if(privatePath(file)){console.log(`[BLOCK] history ${file}: private/generated path was committed`);blocked++;}
    const size=Number(git('cat-file','-s',object).trim());if(size>2*1024*1024){console.log(`[REVIEW] history ${file}: exceeds 2 MB; content not scanned`);reviews++;continue;}
    inspect(file,execFileSync('git',['cat-file','blob',object],{cwd:root,maxBuffer:3*1024*1024}),'history');
  }
}
for(const file of git('diff','--cached','--name-only','--diff-filter=ACMR','-z').split('\0').filter(Boolean)){
  inspect(file,execFileSync('git',['show',':'+file],{cwd:root,maxBuffer:32*1024*1024}),'staged');
}
console.log(`[CHECK] ${scanned} file versions scanned; ${blocked} blocked findings; ${reviews} review findings.`);
console.log('[CHECK] Heuristics cannot detect every secret or identify personal information in images. Review staged changes before publishing.');
process.exitCode=blocked?1:reviews?2:0;
