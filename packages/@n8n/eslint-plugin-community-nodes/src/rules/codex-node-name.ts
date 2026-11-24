import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { AST_NODE_TYPES, parse, simpleTraverse } from '@typescript-eslint/typescript-estree';
import { existsSync, readFileSync } from 'node:fs';

import {
	createRule,
	findJsonProperty,
	findPackageJson,
	getTopLevelObjectInJson,
} from '../utils/index.js';

export const CodexNodeNameRule = createRule({
	name: 'codex-node-name',
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Require the "node" field in .node.json codex files to be "<package-name>.<node-name>"',
		},
		messages: {
			missingNode:
				'Add a "node" field set to "{{ expected }}", the package name and the node\'s "name" joined by a dot.',
			wrongNode:
				'"node" is "{{ actual }}" but should be "{{ expected }}", the package name and the node\'s "name" joined by a dot, so a node and its trigger get different values.',
		},
		fixable: 'code',
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		if (!context.filename.endsWith('.node.json')) {
			return {};
		}

		return {
			ObjectExpression(node: TSESTree.ObjectExpression) {
				const root = getTopLevelObjectInJson(node);
				if (!root) {
					return;
				}

				const packageName = readPackageName(context.filename);
				if (!packageName) {
					return;
				}

				const nodeName = findNodeName(context.filename);
				const expected = `${packageName}.${nodeName ?? '<node-name>'}`;
				const property = findJsonProperty(root, 'node');

				if (!property) {
					context.report({ node: root, messageId: 'missingNode', data: { expected } });
					return;
				}

				const { value } = property;
				const actual =
					value.type === AST_NODE_TYPES.Literal && typeof value.value === 'string'
						? value.value
						: null;

				const isValid = nodeName
					? actual === expected
					: actual !== null &&
						actual.startsWith(`${packageName}.`) &&
						actual.length > packageName.length + 1;
				if (isValid) {
					return;
				}

				context.report({
					node: value,
					messageId: 'wrongNode',
					data: { actual: actual ?? context.sourceCode.getText(value), expected },
					fix: nodeName ? (fixer) => fixer.replaceText(value, JSON.stringify(expected)) : null,
				});
			},
		};
	},
});

function readPackageName(codexPath: string): string | null {
	const packageJsonPath = findPackageJson(codexPath);
	if (!packageJsonPath) {
		return null;
	}

	try {
		const { name } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
		return typeof name === 'string' && name.length > 0 ? name : null;
	} catch {
		return null;
	}
}

/**
 * Reads the node's `name` from the node file next to the codex: `Foo.node.ts`
 * in a source checkout, or `Foo.node.js` in a published package
 */
export function findNodeName(codexPath: string): string | null {
	const base = codexPath.slice(0, -'.json'.length);
	const nodeFile = [`${base}.ts`, `${base}.js`].find((candidate) => existsSync(candidate));
	if (!nodeFile) {
		return null;
	}

	let program: TSESTree.Program;
	try {
		program = parse(readFileSync(nodeFile, 'utf8'), { jsx: false });
	} catch {
		return null;
	}

	let name: string | null = null;
	simpleTraverse(program, {
		enter(node) {
			if (name === null && node.type === AST_NODE_TYPES.ObjectExpression) {
				name = descriptionName(node);
			}
		},
	});
	return name;
}

/**
 * The `name` of a node description: an object with string `name` and
 * `displayName`, and a `version`, `defaultVersion` or `properties`
 */
function descriptionName(object: TSESTree.ObjectExpression): string | null {
	const keys = new Map<string, TSESTree.Node>();
	for (const property of object.properties) {
		if (property.type !== AST_NODE_TYPES.Property || property.computed) {
			continue;
		}
		const key =
			property.key.type === AST_NODE_TYPES.Identifier
				? property.key.name
				: property.key.type === AST_NODE_TYPES.Literal
					? String(property.key.value)
					: null;
		if (key) {
			keys.set(key, property.value);
		}
	}

	const name = keys.get('name');
	const isDescription =
		keys.has('displayName') &&
		(keys.has('version') || keys.has('defaultVersion') || keys.has('properties'));
	if (
		!isDescription ||
		name?.type !== AST_NODE_TYPES.Literal ||
		typeof name.value !== 'string' ||
		name.value.length === 0
	) {
		return null;
	}
	return name.value;
}
