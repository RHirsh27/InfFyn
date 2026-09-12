import { mkdir,writeFile } from 'node:fs/promises';
import { syntheticAudit,headers } from '../app/lib/audit-v2';
async function main(){
await mkdir('fixtures/v2',{recursive:true});
for(const kind of ['product','internal'] as const){
  await writeFile(`fixtures/v2/${kind}.json`,JSON.stringify(syntheticAudit(kind),null,2)+'\n');
}
for(const [key,header] of Object.entries(headers)){
  await writeFile(`fixtures/v2/${key.replace('_csv','')}-template.csv`,header+'\n');
  await writeFile(`fixtures/v2/${key.replace('_csv','')}-sample.csv`,syntheticAudit('product')[key as keyof typeof headers]+'\n');
}
console.log('Synthetic fixtures and templates exported to fixtures/v2. No customer evidence used.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
