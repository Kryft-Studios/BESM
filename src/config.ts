import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { error } from "./entry.js";

export namespace Hooks {
    export type Hooks = {
        playerLoad: string,
        worldCode:string,
        playerAlreadyLoaded: string
    }
    export function getHooks(dir:string):Hooks.Hooks{
        const playerLoad = existsSync(path.join(dir,"./hooks/on-player-load.js"))? readFileSync(path.join(dir,"./hooks/on-player-load.js"),{encoding:"utf-8"}):"";
        const playerAlreadyLoaded = existsSync(path.join(dir,"./hooks/on-player-already-loaded.js"))? readFileSync(path.join(dir,"./hooks/on-player-already-loaded.js"),{encoding:"utf-8"}):"";
        const worldCode = existsSync(path.join(dir,"./hooks/world-code.js"))? readFileSync(path.join(dir,"./hooks/world-code.js"),{encoding:"utf-8"}):"";
        return {playerLoad,playerAlreadyLoaded,worldCode};
    }
}
export namespace Configuration {
    export type Config = {
        loadPos: number[]&{length:3},
        src: string,
        dst: string,
        hooks: Hooks.Hooks
    }
    export function getConfig(dir:string):Configuration.Config{
        const hooks = Hooks.getHooks(dir);
        if(!existsSync(`${dir}/config.json`)){
          error("Config not found")  
          return {hooks,loadPos:[1,2,3],src:"",dst:""}
        } else {
            const config = JSON.parse(readFileSync(path.join(dir,"config.json"),{encoding:"utf-8"}));
            return {hooks,...config}
        }
    }
}