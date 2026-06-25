#!/usr/bin/env node
import {existsSync, mkdir, mkdirSync, readFileSync, statSync, writeFileSync} from "node:fs";
import { GenerateBloxd } from "./gen-code.js";
import { Configuration } from "./config.js";
import path from "node:path";
import rl from "readline/promises"
import { stderr, stdin, stdout } from "node:process";
export function error(...message:string[]){
    console.error("[BESM Error]",...message);
    process.exit(1)
}
const headdir= process.cwd()

if(process.argv[2]==="build"){
const config = Configuration.getConfig(headdir);
const modules =GenerateBloxd.getAllModules(path.join(headdir,config.src))
const codeBlocks = await GenerateBloxd.generateCodeBlocks(modules,config);
const dstdir = path.join(headdir, config.dst);
let counter=1;
for(const cb of codeBlocks){
writeFileSync(path.join(dstdir,`codeblock${counter++}.js`),cb.content);
}
writeFileSync(path.join(dstdir,"worldCode.js"),(await GenerateBloxd.generateWorldCode(config)))
}else if(process.argv[2]==="init"){
const ans=await rl.createInterface({"input":stdin, output: stdout}).question("Enter the directory you want to init in: ");
const chosedir=path.join(headdir,ans)
try{mkdirSync(chosedir)}catch(e){}
mkdirSync(path.join(chosedir,"hooks"))
mkdirSync(path.join(chosedir,"build"))
mkdirSync(path.join(chosedir, "src"))
writeFileSync(path.join(chosedir,"src/module.js"),"console.log('hello')")
writeFileSync(path.join(chosedir,"hooks/worldCode.js"),"console.log('hello from worldcode')")
writeFileSync(path.join(chosedir,"./config.json"),JSON.stringify({
    loadPos:[0,0,0],
    src: "./src",
    dst: "./build"
},null,4))
console.log(`\nSuccessfully initialized BESM project inside ${ans}! use besm build to build.`);
}