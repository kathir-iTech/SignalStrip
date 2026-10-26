import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
const packages=[];
for(const [location,entry] of Object.entries(lock.packages)){
  if(!location)continue;
  let installed={};try{installed=JSON.parse(await fs.readFile(path.join(root,location,'package.json'),'utf8'));}catch{}
  packages.push({name:installed.name??entry.name??location.split('node_modules/').at(-1),version:entry.version,license:installed.license??entry.license??'See package license',developmentOnly:!!entry.dev,location});
}
packages.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
await fs.writeFile(path.join(root,'docs/dependency-inventory.json'),JSON.stringify({generatedUtc:new Date().toISOString(),source:'Pinned lockfile and installed package manifests',packages},null,2));
console.log(`Inventoried ${packages.length} locked package entries.`);
