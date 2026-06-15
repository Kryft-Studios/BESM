import path from 'node:path';
import { ModuleResolution } from './module-order-resolution.js';
import * as terser from "terser"
import { readdirSync, readFileSync, statSync } from 'node:fs';
import Module from 'node:module';
import * as gen from '@babel/generator';
import { parse, ParseResult } from '@babel/parser';
import { ExportDeclaration, ExportDefaultSpecifier, ExportNamespaceSpecifier, ExportSpecifier, ImportDeclaration, traverse } from '@babel/types';
import { Configuration } from './config.js';
export namespace GenerateBloxd {
    const CODE_BLOCK_SOFT_LIMIT = 30000
    export interface CodeBlockDescriptor {
        size: number,
        content: string,
    };
    /*export interface ImportStatement {
        imported: ImportedItem[],
        source: string,
    };
    export interface ImportedItem {
        type: ImportType,
        item: string
    }
    export interface ImpstType {
        code: string;
        imports: ImportStatement[];
    }
    export type ImportType = "default" | "individual" | "all"
    export function getImportStatementsAndDelete(code: string): { code: string, imports: ImportStatement[] } {
        const imports: ImportStatement[] = [];

        const masterRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`|(import\s+(?:(?:\s*[A-Za-z_$][A-Za-z0-9_$]*\s*,?\s*)?(?:\{[^}]+\}|(\*\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*))?\s+from\s+)?(["'])([^"'\s]+)\6;?)/g;

        let cleanedCode = "";
        let lastIndex = 0;

        const matches = [...code.matchAll(masterRegex)];

        for (const match of matches) {
            const matchIndex = match.index ?? 0;

            cleanedCode += code.slice(lastIndex, matchIndex);

            if (match[1] !== undefined || match[2] !== undefined || match[3] !== undefined) {
                cleanedCode += match[0];
                lastIndex = matchIndex + match[0].length;
                continue;
            }

            const fullImportStatement = match[4];

            const pureRegex = /import\s+(?:(?:\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*,?\s*)?(?:\{([^}]+)\}|(\*\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*))?\s+from\s+)?(["'])([^"'\s]+)\4/;
            const pureMatch = fullImportStatement.match(pureRegex);

            if (pureMatch) {
                const defaultImport = pureMatch[1] ? pureMatch[1].trim() : null;
                const namedImports = pureMatch[2] ? pureMatch[2].trim().split(",").map(a => a.trim()).filter(Boolean) : [];
                const namespaceImport = pureMatch[3] ? pureMatch[3].trim() : null;
                const moduleSource = pureMatch[5];

                const imptdItems: ImportedItem[] = [];

                if (defaultImport) {
                    imptdItems.push({ type: "default", item: defaultImport });
                }
                if (namespaceImport) {
                    imptdItems.push({ type: "all", item: namespaceImport });
                }
                for (const nmdimpt of namedImports) {
                    imptdItems.push({ type: "individual", item: nmdimpt });
                }

                imports.push({ source: moduleSource, imported: imptdItems });
            }

            cleanedCode += "";
            lastIndex = matchIndex + match[0].length;
        }

        cleanedCode += code.slice(lastIndex);

        return { code: cleanedCode, imports };
    };*/
    export type ModulesInfo = {
        unresModules: Record<number, number[]>,
        resModules: number[],
        idMap: Map<string, number>,
        parsedMap: Map<number, ParseResult>
    }
    function getIdentifierName(node: any): string {
        if (!node) return "";
        if (node.type === "Identifier") return node.name;
        if (node.type === "StringLiteral" || node.type === "Literal") return node.value;
        return "";
    }

    export function getAllModules(dir: string): ModulesInfo {
        const um: ModulesInfo = {
            unresModules: {},
            resModules: [],
            idMap: new Map(),
            parsedMap: new Map()
        };

        const items = readdirSync(dir, { recursive: true, encoding: "utf-8" });
        const filePaths: string[] = [];
        let moduleIdCounter = 0;
        for (const item of items) {
            const pth = path.join(dir, item);
            if (statSync(pth).isDirectory()) continue;
            if (!pth.endsWith(".js") && !pth.endsWith(".ts")) continue;

            filePaths.push(pth);

            const relativePath = path.relative(dir, pth).replace(/\\/g, "/").replace(/\.[jt]s$/, "");

            um.idMap.set(relativePath, moduleIdCounter);
            moduleIdCounter++;
        }

        for (const pth of filePaths) {
            const currentRelativePath = path.relative(dir, pth).replace(/\\/g, "/").replace(/\.[jt]s$/, "");
            const currentModuleId = um.idMap.get(currentRelativePath)!;

            const fileContent = readFileSync(pth, { encoding: "utf-8" });
            const ast = parse(fileContent, {
                sourceType: "module",
                allowAwaitOutsideFunction: false,
            });

            const dependencies: number[] = [];
            const rewrittenBody: any[] = [];
            const importMap = new Map<string, { moduleId: number, importedName: string }>();

            for (const node of ast.program.body) {
                if (node.type === "ImportDeclaration") {
                    const rawSource = node.source.value;

                    const absoluteDependencyPath = path.resolve(path.dirname(pth), rawSource);
                    const depRelativePath = path.relative(dir, absoluteDependencyPath).replace(/\\/g, "/").replace(/\.[jt]s$/, "");

                    const finalDepId = um.idMap.get(depRelativePath);

                    if (finalDepId !== undefined) {
                        dependencies.push(finalDepId);

                        for (const specifier of node.specifiers) {
                            const localName = specifier.local.name;

                            if (specifier.type === "ImportSpecifier") {
                                const importedName = getIdentifierName(specifier.imported);
                                importMap.set(localName, { moduleId: finalDepId, importedName });
                            } else if (specifier.type === "ImportDefaultSpecifier") {
                                importMap.set(localName, { moduleId: finalDepId, importedName: "default" });
                            } else if (specifier.type === "ImportNamespaceSpecifier") {
                                importMap.set(localName, { moduleId: finalDepId, importedName: "*" });
                            }
                        }
                    }
                    continue;
                }

                if (node.type === "ExportDefaultDeclaration") {
                    const declaration = node.declaration;
                    if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
                        if (declaration.id) {
                            rewrittenBody.push(declaration);
                            rewrittenBody.push(createAssignmentNode(currentModuleId, "default", declaration.id.name));
                        } else {
                            rewrittenBody.push({
                                type: "ExpressionStatement",
                                expression: {
                                    type: "AssignmentExpression",
                                    operator: "=",
                                    left: createModuleMemberExpression(currentModuleId, "default"),
                                    right: declaration.type === "FunctionDeclaration"
                                        ? { ...declaration, type: "FunctionExpression" }
                                        : { ...declaration, type: "ClassExpression" }
                                }
                            });
                        }
                    } else {
                        rewrittenBody.push({
                            type: "ExpressionStatement",
                            expression: {
                                type: "AssignmentExpression",
                                operator: "=",
                                left: createModuleMemberExpression(currentModuleId, "default"),
                                right: declaration
                            }
                        });
                    }
                    continue;
                }

                if (node.type === "ExportNamedDeclaration") {
                    if (node.declaration) {
                        const decl = node.declaration;
                        rewrittenBody.push(decl);

                        if (decl.type === "VariableDeclaration") {
                            for (const dec of decl.declarations) {
                                if (dec.id.type === "Identifier") {
                                    rewrittenBody.push(createAssignmentNode(currentModuleId, dec.id.name, dec.id.name));
                                }
                            }
                        } else if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") {
                            if (decl.id) {
                                rewrittenBody.push(createAssignmentNode(currentModuleId, decl.id.name, decl.id.name));
                            }
                        }
                    } else if (node.specifiers) {
                        for (let specifier of node.specifiers) {
                            if (specifier.type === "ExportSpecifier") {
                                const localName = getIdentifierName(specifier.local);
                                const exportedName = getIdentifierName(specifier.exported);
                                rewrittenBody.push(createAssignmentNode(currentModuleId, exportedName, localName));
                            } else if (specifier.type === "ExportNamespaceSpecifier") {
                                const exportedName = getIdentifierName(specifier.exported);
                                rewrittenBody.push(createAssignmentNode(currentModuleId, exportedName, "*"));
                            } else if (specifier.type === "ExportDefaultSpecifier") {
                                const exportedName = getIdentifierName(specifier.exported);
                                rewrittenBody.push(createAssignmentNode(currentModuleId, exportedName, "default"));
                            }
                        }
                    }
                    continue;
                }

                rewrittenBody.push(node);
            }

            ast.program.body = rewrittenBody;

            walkAST(ast, null, (node, parent) => {
    if (node.type === "Identifier" && importMap.has(node.name)) {
        // Skip identifiers that are properties of MemberExpressions
        if (parent && parent.type === "MemberExpression" && parent.property === node) return;
        // Skip identifiers that are keys in object properties
        if (parent && parent.type === "Property" && parent.key === node && !parent.shorthand) return;
        // Skip identifiers that are function/variable names being declared
        if (parent && (parent.type === "FunctionDeclaration" || parent.type === "VariableDeclarator" || parent.type === "ClassDeclaration") && parent.id === node) return;

        const mapping = importMap.get(node.name)!;

        if (mapping.importedName === "*") {
            replaceNodeProperties(node, {
                type: "MemberExpression",
                computed: true,
                object: { type: "Identifier", name: "__modules" },
                property: { type: "NumericLiteral", value: mapping.moduleId }
            });
        } else {
            replaceNodeProperties(node, createModuleMemberExpression(mapping.moduleId, mapping.importedName));
        }
    }
});

            um.unresModules[currentModuleId] = dependencies;
            um.parsedMap.set(currentModuleId, ast);
        }

        um.resModules = ModuleResolution.resolute(um.unresModules);
        return um;
    }

    function createModuleMemberExpression(moduleId: number, propName: string) {
        return {
            type: "MemberExpression",
            computed: true,
            object: {
                type: "MemberExpression",
                computed: true,
                object: { type: "Identifier", name: "__modules" },
                property: {
                    type: "NumericLiteral",
                    value: moduleId
                }
            },
            property: { type: "StringLiteral", value: propName }
        };
    }

    function createAssignmentNode(moduleId: number, exportedName: string, localVariableName: string) {
        return {
            type: "ExpressionStatement",
            expression: {
                type: "AssignmentExpression",
                operator: "=",
                left: createModuleMemberExpression(moduleId, exportedName),
                right: { type: "Identifier", name: localVariableName }
            }
        };
    }

    function replaceNodeProperties(node: any, newProps: any) {
        // Clear all enumerable properties to avoid leaving old ones behind
        for (const key in node) {
            if (Object.prototype.hasOwnProperty.call(node, key) && key !== 'loc' && key !== 'start' && key !== 'end' && key !== 'extra') {
                delete node[key];
            }
        }
        // Assign new properties
        Object.assign(node, newProps);
    }

    export function walkAST(
        node: any,
        parent: any,
        callback: (node: any, parent: any) => void,
        visited = new Set<any>(),
        depth = 0
    ) {
        if (!node || typeof node !== "object") return;
        if (visited.has(node)) return;
        if (depth > 500) return; // Prevent stack overflow with depth limit
        
        visited.add(node);
        callback(node, parent);

        const IGNORED_KEYS = new Set(["parent", "loc", "start", "end", "extra", "tokens", "comments"]);

        for (const key in node) {
            if (Object.prototype.hasOwnProperty.call(node, key)) {
                if (IGNORED_KEYS.has(key)) continue;

                const child = node[key];
                if (!child || typeof child !== "object") continue;

                if (Array.isArray(child)) {
                    for (const item of child) {
                        if (item && typeof item === "object") {
                            walkAST(item, node, callback, visited, depth + 1);
                        }
                    }
                } else {
                    walkAST(child, node, callback, visited, depth + 1);
                }
            }
        }
    }
    export async function generateCodeBlocks(
        minfo: ModulesInfo,
        config: Configuration.Config
    ): Promise<CodeBlockDescriptor[]> {
        const codeBlockLoadingContent = `if(loaded&&!loadedPlayers[myId]){${config.hooks.playerLoad}}else if(loaded&&loadedPlayers[myId]){${config.hooks.playerAlreadyLoaded}}`;

        const CodeBlocks: CodeBlockDescriptor[] = [
            { "content": codeBlockLoadingContent, size: codeBlockLoadingContent.length }
        ];

        let currCbIndex = 0;

        for (const moduleName of minfo.resModules) {
            const astNode = minfo.parsedMap.get(moduleName);
            if (!astNode) continue;
            let generatedCode: string;
            try {
                generatedCode = (await terser.minify(gen.generate(astNode).code, { "mangle": false, "compress": false })).code + "\n";
            } catch (e) {
                // Fall back to unminified code if minification fails
                generatedCode = gen.generate(astNode).code + "\n";
            }

            if ((CodeBlocks[currCbIndex].size + generatedCode.length) >= CODE_BLOCK_SOFT_LIMIT) {
                CodeBlocks.push({ content: generatedCode, size: generatedCode.length });
                currCbIndex++;
            } else {
                CodeBlocks[currCbIndex].content += generatedCode;
                CodeBlocks[currCbIndex].size += generatedCode.length;
            }
        }

        const endDec = `loadedPlayers[myId]=true;loaded=true;${config.hooks.playerLoad};`;

        if ((CodeBlocks[currCbIndex].size + endDec.length) >= CODE_BLOCK_SOFT_LIMIT) {
            CodeBlocks.push({ "content": endDec, size: endDec.length });
        } else {
            CodeBlocks[currCbIndex].content += endDec;
            CodeBlocks[currCbIndex].size += endDec.length;
        }

        return CodeBlocks;
    }
    const WORLD_CODE_SOFT_LIMIT = 60_000
    export async function generateWorldCode(
        config: Configuration.Config
    ): Promise<string> {
        const ast = parse(config.hooks.worldCode, {
            sourceType: "module",
            allowAwaitOutsideFunction: false,
        });

        const rewrittenBody: any[] = [];
        const importMap = new Map<string, { moduleId: number, importedName: string }>();

        for (const node of ast.program.body) {
            if (node.type === "ImportDeclaration") {
                const rawSource = node.source.value;
                const mockDepId = Math.abs(rawSource.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0));

                for (const specifier of node.specifiers) {
                    const localName = specifier.local.name;

                    if (specifier.type === "ImportSpecifier") {
                        const importedName = getIdentifierName(specifier.imported);
                        importMap.set(localName, { moduleId: mockDepId, importedName });
                    } else if (specifier.type === "ImportDefaultSpecifier") {
                        importMap.set(localName, { moduleId: mockDepId, importedName: "default" });
                    } else if (specifier.type === "ImportNamespaceSpecifier") {
                        importMap.set(localName, { moduleId: mockDepId, importedName: "*" });
                    }
                }
                continue;
            }

            if (node.type === "ExportDefaultDeclaration") {
                const declaration = node.declaration;
                if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
                    if (declaration.id) {
                        rewrittenBody.push(declaration);
                        rewrittenBody.push(createAssignmentNode(0, "default", declaration.id.name));
                    } else {
                        rewrittenBody.push({
                            type: "ExpressionStatement",
                            expression: {
                                type: "AssignmentExpression",
                                operator: "=",
                                left: createModuleMemberExpression(0, "default"),
                                right: declaration.type === "FunctionDeclaration" ? { ...declaration, type: "FunctionExpression" } : { ...declaration, type: "ClassExpression" }
                            }
                        });
                    }
                } else {
                    rewrittenBody.push({
                        type: "ExpressionStatement",
                        expression: {
                            type: "AssignmentExpression",
                            operator: "=",
                            left: createModuleMemberExpression(0, "default"),
                            right: declaration
                        }
                    });
                }
                continue;
            }

            if (node.type === "ExportNamedDeclaration") {
                if (node.declaration) {
                    const decl = node.declaration;
                    rewrittenBody.push(decl);

                    if (decl.type === "VariableDeclaration") {
                        for (const dec of decl.declarations) {
                            if (dec.id.type === "Identifier") {
                                rewrittenBody.push(createAssignmentNode(0, dec.id.name, dec.id.name));
                            }
                        }
                    } else if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") {
                        if (decl.id) {
                            rewrittenBody.push(createAssignmentNode(0, decl.id.name, decl.id.name));
                        }
                    }
                } else if (node.specifiers) {
                    for (let specifier of node.specifiers) {
                        if (specifier.type === "ExportSpecifier") {
                            const localName = getIdentifierName(specifier.local);
                            const exportedName = getIdentifierName(specifier.exported);
                            rewrittenBody.push(createAssignmentNode(0, exportedName, localName));
                        }
                    }
                }
                continue;
            }

            rewrittenBody.push(node);
        }

        ast.program.body = rewrittenBody;

        walkAST(ast, null, (node, parent) => {
    if (node.type === "Identifier" && importMap.has(node.name)) {
        // Skip identifiers that are properties of MemberExpressions
        if (parent && parent.type === "MemberExpression" && parent.property === node) return;
        // Skip identifiers that are keys in object properties
        if (parent && parent.type === "Property" && parent.key === node && !parent.shorthand) return;
        // Skip identifiers that are function/variable names being declared
        if (parent && (parent.type === "FunctionDeclaration" || parent.type === "VariableDeclarator" || parent.type === "ClassDeclaration") && parent.id === node) return;

        const mapping = importMap.get(node.name)!;

        if (mapping.importedName === "*") {
            replaceNodeProperties(node, {
                type: "MemberExpression",
                computed: true,
                object: { type: "Identifier", name: "__modules" },
                property: { type: "NumericLiteral", value: mapping.moduleId }
            });
        } else {
            replaceNodeProperties(node, createModuleMemberExpression(mapping.moduleId, mapping.importedName));
        }
    }
});

        let eventControllerCode: string;
        try {
            eventControllerCode = (await terser.minify(gen.generate(ast).code, { "mangle": false, "compress": false })).code as string;
        } catch (e) {
            eventControllerCode = gen.generate(ast).code;
        }

        const initializationHeader = `globalThis.__BESM={};globalThis.__modules=[];globalThis.loaded=false;globalThis.loadedPlayers={};`;
        const tailCode = `
__BESM.originalOpj = typeof onPlayerJoin !== "undefined"?onPlayerJoin:()=>{};
onPlayerJoin=(myId)=>{
if(!loaded){
api.setPosition(myId,${config.loadPos})
}else{
${config.hooks.playerLoad}
loadedPlayers[myId]=true;
}
__BESM.originalOpj(myId);
}
__BESM.onPlayerLeave = typeof onPlayerLeave !== "undefined"? onPlayerLeave:()=>{}
onPlayerLeave=(myId)=>{
delete loadedPlayers[myId]
__BESM.onPlayerLeave(myId);
};
`
        const fullWorldCode = `${initializationHeader}\n${eventControllerCode}\n${tailCode}`;

        let minifiedWorld;
        try {
            minifiedWorld = await terser.minify(fullWorldCode, {
                mangle: false,
                compress: false
            });
        } catch (e) {
            // If minification fails, return the unminified code
            minifiedWorld = { code: fullWorldCode };
        }

        return minifiedWorld.code || fullWorldCode;
    }
}