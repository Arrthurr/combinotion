/// <reference types="vite/client" />
import ts from "typescript";
import { expect, it } from "vitest";

it("allows raw public Convex registration only for the two deliberately public queries", () => {
  const sources = import.meta.glob<string>([
    "../convex/**/*.ts",
    "!../convex/**/*.test.ts",
    "!../convex/_generated/**",
    "!../convex/lib/auth.ts",
  ], { eager: true, query: "?raw", import: "default" });
  const publicQueries = new Map([
    ["../convex/titles.ts", "listRequestable"],
    ["../convex/orgSettings.ts", "publicRequestGate"],
  ]);
  const registrations: string[] = [];
  const violations: string[] = [];
  for (const [path, source] of Object.entries(sources)) {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const rawBuilders = new Set<string>();
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const module = statement.moduleSpecifier;
      if (!module || !ts.isStringLiteral(module)) continue;
      if (!module.text.endsWith("_generated/server") && module.text !== "convex/server") continue;
      if (ts.isExportDeclaration(statement)) {
        violations.push(`${path}: re-export of raw builders`);
        continue;
      }
      const bindings = statement.importClause?.namedBindings;
      if (!bindings) continue;
      if (ts.isNamespaceImport(bindings)) {
        violations.push(`${path}: namespace import of raw builders`);
        continue;
      }
      for (const binding of bindings.elements) {
        const name = (binding.propertyName ?? binding.name).text;
        if (!["query", "mutation", "action", "queryGeneric", "mutationGeneric", "actionGeneric"].includes(name)) continue;
        if (name !== "query" || !publicQueries.has(path)) {
          violations.push(`${path}: import ${name}`);
        }
        rawBuilders.add(binding.name.text);
      }
    }
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && rawBuilders.has(node.expression.text)) {
        const declaration = node.parent;
        const name = ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)
          ? declaration.name.text : "unknown";
        registrations.push(`${path}:${name}`);
        if (name !== publicQueries.get(path)) violations.push(`${path}: raw registration ${name}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  expect(violations).toEqual([]);
  expect(registrations.sort()).toEqual([
    "../convex/orgSettings.ts:publicRequestGate",
    "../convex/titles.ts:listRequestable",
  ]);
});
