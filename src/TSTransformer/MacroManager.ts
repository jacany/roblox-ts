import fs from "fs-extra";
import path from "path";
import { ProjectError } from "Shared/errors/ProjectError";
import { PropertyCallMacro, PROPERTY_CALL_MACROS } from "TSTransformer/macros/propertyCallMacros";
import ts from "typescript";

const INCLUDE_FILES = ["roblox.d.ts", "es.d.ts", "macro_math.d.ts"];

interface InterfaceInfo {
	symbols: Array<ts.Symbol>;
	methods: Map<string, Array<ts.Symbol>>;
}

export class MacroManager {
	private propertyCallMacros = new Map<ts.Symbol, PropertyCallMacro>();

	constructor(program: ts.Program, typeChecker: ts.TypeChecker, nodeModulesPath: string) {
		const interfaces = new Map<string, InterfaceInfo>();
		const functions = new Map<string, ts.FunctionDeclaration>();

		const typesPath = path.join(nodeModulesPath, "@rbxts", "types", "include");
		for (const fileName of INCLUDE_FILES) {
			const filePath = path.join(typesPath, fileName);
			if (!fs.pathExistsSync(filePath)) {
				throw new ProjectError(`(MacroManager) Path does not exist ${filePath}`);
			}

			const sourceFile = program.getSourceFileByPath(filePath as ts.Path);
			if (!sourceFile) {
				throw new ProjectError(`(MacroManager) Could not find source file for ${filePath}`);
			}

			for (const statement of sourceFile.statements) {
				if (ts.isInterfaceDeclaration(statement)) {
					let interfaceInfo = interfaces.get(statement.name.text);
					if (!interfaceInfo) {
						interfaceInfo = {
							symbols: new Array<ts.Symbol>(),
							methods: new Map<string, Array<ts.Symbol>>(),
						};
						interfaces.set(statement.name.text, interfaceInfo);
					}

					interfaceInfo.symbols.push(typeChecker.getTypeAtLocation(statement).symbol);

					for (const member of statement.members) {
						if (ts.isMethodSignature(member)) {
							if (ts.isIdentifier(member.name)) {
								const methodName = member.name.text;
								let methodSymbols = interfaceInfo.methods.get(methodName);
								if (!methodSymbols) {
									methodSymbols = new Array<ts.Symbol>();
									interfaceInfo.methods.set(methodName, methodSymbols);
								}
								methodSymbols.push(typeChecker.getTypeAtLocation(member).symbol);
							}
						}
					}
				} else if (ts.isFunctionDeclaration(statement)) {
					functions.set(statement.name!.text, statement);
				}
			}
		}

		for (const [className, methods] of Object.entries(PROPERTY_CALL_MACROS)) {
			const interfaceInfo = interfaces.get(className);
			if (!interfaceInfo) {
				throw new ProjectError(`(MacroManager) No interface for ${className}`);
			}
			for (const [methodName, macro] of Object.entries(methods)) {
				const methodSymbols = interfaceInfo.methods.get(methodName);
				if (!methodSymbols) {
					throw new ProjectError(`(MacroManager) No method for ${className}.${methodName}`);
				}
				for (const methodSymbol of methodSymbols) {
					this.propertyCallMacros.set(methodSymbol, macro);
				}
			}
		}
	}

	public getPropertyCallMacro(methodSymbol: ts.Symbol) {
		return this.propertyCallMacros.get(methodSymbol);
	}
}
