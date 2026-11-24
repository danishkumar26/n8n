import { RuleTester } from '@typescript-eslint/rule-tester';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { CodexNodeNameRule, findNodeName } from './codex-node-name.js';

const fixturesDir = mkdtempSync(join(tmpdir(), 'n8n-codex-node-name-'));

afterAll(() => {
	rmSync(fixturesDir, { recursive: true, force: true });
});

let packageCount = 0;

/** Writes a package to disk and returns the path of its codex file */
function createPackage(packageName: string, files: Record<string, string>): string {
	const packageDir = join(fixturesDir, `package-${++packageCount}`);
	writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: packageName }));
	let codexPath = '';
	for (const [relativePath, content] of Object.entries(files)) {
		writeFile(join(packageDir, relativePath), content);
		if (relativePath.endsWith('.node.json')) {
			codexPath = join(packageDir, relativePath);
		}
	}
	return codexPath;
}

function writeFile(filePath: string, content: string) {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, content);
}

const nodeSource = (name: string) => `
export class Example {
	description = {
		displayName: 'Example',
		name: '${name}',
		version: 1,
		properties: [],
	};
}
`;

/** `tsc` output for a node class */
const compiledNode = (name: string) => `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Example = void 0;
class Example {
    constructor() {
        this.description = {
            displayName: 'Example',
            name: '${name}',
            version: 1,
            properties: [],
        };
    }
}
exports.Example = Example;
`;

const codex = (node?: string) => JSON.stringify(node === undefined ? {} : { node });

/** A source package with the given codex `node` and node `name` */
function sourceCodex(
	node: string | undefined,
	nodeName = 'example',
	packageName = 'n8n-nodes-example',
) {
	const code = codex(node);
	const filename = createPackage(packageName, {
		'nodes/Example/Example.node.json': code,
		'nodes/Example/Example.node.ts': nodeSource(nodeName),
	});
	return { filename, code };
}

const ruleTester = new RuleTester();

ruleTester.run('codex-node-name', CodexNodeNameRule, {
	valid: [
		{ name: 'package name and node name', ...sourceCodex('n8n-nodes-example.example') },
		{
			name: 'scoped package',
			...sourceCodex('@acme/n8n-nodes-example.example', 'example', '@acme/n8n-nodes-example'),
		},
		{
			name: 'trigger in the same package',
			...sourceCodex('n8n-nodes-example.exampleTrigger', 'exampleTrigger'),
		},
		(() => {
			const code = codex('n8n-nodes-example.example');
			const filename = createPackage('n8n-nodes-example', {
				'dist/nodes/Example/Example.node.json': code,
				'dist/nodes/Example/Example.node.js': compiledNode('example'),
			});
			return { name: 'published package with a compiled node', filename, code };
		})(),
		(() => {
			const code = codex('n8n-nodes-example.anything');
			const filename = createPackage('n8n-nodes-example', {
				'nodes/Example/Example.node.json': code,
			});
			return { name: 'only the package prefix is checked without a node file', filename, code };
		})(),
		{
			name: 'unrelated JSON file',
			filename: 'package.json',
			code: codex('n8n-nodes-example'),
		},
	],
	invalid: [
		{
			name: 'package name only',
			...sourceCodex('n8n-nodes-example'),
			errors: [
				{
					messageId: 'wrongNode',
					data: { actual: 'n8n-nodes-example', expected: 'n8n-nodes-example.example' },
				},
			],
			output: codex('n8n-nodes-example.example'),
		},
		{
			name: 'scoped package name only',
			...sourceCodex('@acme/n8n-nodes-example', 'example', '@acme/n8n-nodes-example'),
			errors: [{ messageId: 'wrongNode' }],
			output: codex('@acme/n8n-nodes-example.example'),
		},
		{
			name: 'trigger reusing the action node name',
			...sourceCodex('n8n-nodes-example.example', 'exampleTrigger'),
			errors: [{ messageId: 'wrongNode' }],
			output: codex('n8n-nodes-example.exampleTrigger'),
		},
		{
			name: 'wrong package prefix',
			...sourceCodex('n8n-nodes-other.example'),
			errors: [{ messageId: 'wrongNode' }],
			output: codex('n8n-nodes-example.example'),
		},
		{
			name: 'missing node field',
			...sourceCodex(undefined),
			errors: [{ messageId: 'missingNode', data: { expected: 'n8n-nodes-example.example' } }],
		},
		(() => {
			const code = codex('n8n-nodes-example');
			const filename = createPackage('n8n-nodes-example', {
				'nodes/Example/Example.node.json': code,
			});
			return {
				name: 'package name only without a node file',
				filename,
				code,
				errors: [{ messageId: 'wrongNode' as const }],
				output: null,
			};
		})(),
	],
});

describe('findNodeName', () => {
	it('reads the description name, not the class or file name', () => {
		const filename = createPackage('n8n-nodes-luma', {
			'nodes/Luma/LumaTrigger.node.json': codex(),
			'nodes/Luma/LumaTrigger.node.ts': `
				import type { INodeType, INodeTypeDescription } from 'n8n-workflow';

				export class LumaTrigger implements INodeType {
					description: INodeTypeDescription = {
						displayName: 'Luma Trigger',
						name: 'lumaTrigger',
						group: ['trigger'],
						version: 1,
						inputs: [],
						outputs: ['main'],
						properties: [],
					};
				}
			`,
		});
		expect(findNodeName(filename)).toBe('lumaTrigger');
	});

	it('reads the name from a versioned node base description', () => {
		const filename = createPackage('n8n-nodes-example', {
			'nodes/Example/Example.node.json': codex(),
			'nodes/Example/Example.node.ts': `
				export class Example extends VersionedNodeType {
					constructor() {
						const baseDescription = { displayName: 'Example', name: 'example', defaultVersion: 2 };
						super({}, baseDescription);
					}
				}
			`,
		});
		expect(findNodeName(filename)).toBe('example');
	});

	it('ignores objects that are not a node description', () => {
		const filename = createPackage('n8n-nodes-example', {
			'nodes/Example/Example.node.json': codex(),
			'nodes/Example/Example.node.ts': `
				const option = { name: 'Create', value: 'create' };
				export class Example { description = { displayName: 'Example', name: 'example', version: 1 }; }
			`,
		});
		expect(findNodeName(filename)).toBe('example');
	});
});
