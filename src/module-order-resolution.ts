import { error } from "./entry.js";

export namespace ModuleResolution {
    export type ResolutedModules = number[];
    export type UnresolutedModules = Record<number,number[]>;

    function findCircularDependencyPath(modules: UnresolutedModules): number[] | null {
        const visited = new Set<number>();
        const currentPath: number[] = [];

        function check(moduleName: number): number[] | null {
            const existingIdx = currentPath.indexOf(moduleName);
            if (existingIdx !== -1) {
                return [...currentPath.slice(existingIdx), moduleName];
            }

            if (visited.has(moduleName)) return null;

            currentPath.push(moduleName);

            const dependencies = modules[moduleName] || [];
            for (const dep of dependencies) {
                const cycle = check(dep);
                if (cycle) return cycle;
            }

            currentPath.pop();
            visited.add(moduleName);

            return null;
        }

        for (const moduleName of Object.keys(modules)) {
            const cycle = check(Number(moduleName));
            if (cycle) return cycle;
        }

        return null;
    }
    export function resolute(modules: UnresolutedModules): ResolutedModules {
        const circDep = findCircularDependencyPath(modules);
        if (circDep) {
            error(`Circular dependency!
Detected a circular dependency loop in path ${circDep.join(" -> ")}
Hint:
    Try reordering the dependencies.`);
            return [];
        }

        const orderedModules = new Set<number>();
        function visit(moduleName: number) {
            if (orderedModules.has(moduleName)) return;

            const deps = modules[moduleName] || [];

            for (const dep of deps) {
                visit(dep);
            }

            orderedModules.add(moduleName);
        }

        for (const moduleName of Object.keys(modules)) {
            visit(Number(moduleName));
        }

        return Array.from(orderedModules);
    }
};