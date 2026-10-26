import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const sharp=require('sharp');
const source=new URL('../images/cvsu_logo/logo.jfif',import.meta.url);
const assets=new URL('../src/assets/',import.meta.url),publicDir=new URL('../public/',import.meta.url);
await mkdir(assets,{recursive:true});await mkdir(publicDir,{recursive:true});
const input=await (await import('node:fs/promises')).readFile(source);
// Format/size derivatives only: keep the supplied university seal and its white background intact.
async function png(size){return sharp(input).resize(size,size,{fit:'contain',background:'#ffffff'}).png().toBuffer();}
await writeFile(new URL('cvsu-logo.png',assets),await png(192));
await writeFile(new URL('favicon-32.png',publicDir),await png(32));
await writeFile(new URL('apple-touch-icon.png',publicDir),await png(180));
const sizes=[16,32,48,256],images=[];for(const size of sizes)images.push(await png(size));
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
sizes.forEach((size,index)=>{const at=6+16*index;header[at]=size===256?0:size;header[at+1]=header[at];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(images[index].length,at+8);header.writeUInt32LE(offset,at+12);offset+=images[index].length;});
await writeFile(new URL('favicon.ico',publicDir),Buffer.concat([header,...images]));
console.log('Created local seal PNG, multi-size ICO and Apple touch icon from the supplied JFIF.');
