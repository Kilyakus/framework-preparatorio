#!/usr/bin/env node
/** Keep distribution copies of this framework byte-identical to the source. */
import { readdir, readFile, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const workspace=resolve(root,'..');
const projects=['fws-prismia','fws-evolvia','morphia-studio'];
const check=process.argv.includes('--check');
const entries=['src','docs','package.json','README.md','LICENSE','CHANGELOG.md'];
async function files(path) {
 const result=[];
 for(const ent of await readdir(path,{withFileTypes:true})) {
   const name=join(path,ent.name);
   if(ent.isDirectory()) result.push(...await files(name));
   else if(ent.isFile()) result.push(name);
 }
 return result;
}
let differences=0,found=0;
for(const project of projects){
 const projectRoot=join(workspace,project);
 try{await access(join(projectRoot,'package.json'));}catch{continue;}
 found++;
 const vendor=join(projectRoot,'vendor/framework-preparatorio');
 const source=[];
 for(const entry of entries){const path=join(root,entry);if(entry==='src'||entry==='docs')source.push(...await files(path));else source.push(path);}
 const expected=new Set(source.map(file=>relative(root,file)));
 let existing=[];try{existing=await files(vendor)}catch{}
 for(const old of existing){if(!expected.has(relative(vendor,old))){differences++;if(check)console.error(`EXTRA ${project}/${relative(projectRoot,old)}`);else await rm(old);}}
 for(const file of source){
   const rel=relative(root,file), target=join(vendor,rel), bytes=await readFile(file);let current;
   try{current=await readFile(target)}catch{}
   if(current?.equals(bytes))continue;
   differences++;
   if(check)console.error(`DIFF ${project}/vendor/framework-preparatorio/${rel}`);
   else {await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
 }
 if(!check)console.log(`SYNC ${project}/vendor/framework-preparatorio`);
}
if(!found)throw Error('No sibling project found.');
if(check&&differences)process.exitCode=1;
else console.log(`${found} project(s): framework vendor ${check?'verified':'synchronized'}.`);
