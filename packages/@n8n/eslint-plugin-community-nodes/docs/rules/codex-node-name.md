# Require the "node" field in .node.json codex files to be "<package-name>.<node-name>" (`@n8n/community-nodes/codex-node-name`)

⚠️ This rule _warns_ in the following configs: ✅ `recommended`, ☑️ `recommendedWithoutN8nCloudSupport`.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

The `node` field in a node's `.node.json` codex file identifies the node it describes. It should be the package name and the node's `name` joined by a dot, the same format n8n's built-in nodes use (`n8n-nodes-base.github`, `n8n-nodes-base.githubTrigger`). Using only the package name gives a node and its trigger the same value.

The rule reads the node's `name` from the node file next to the codex (`Example.node.ts`, or `Example.node.js` in a published package) and can fix the value. When there is no node file or its `name` isn't a plain string, it only checks that the value starts with the package name and a dot.

See [codex files](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/codex-files).

## Examples

### ❌ Incorrect

```json
{
  "node": "n8n-nodes-example"
}
```

### ✅ Correct

```json
{
  "node": "n8n-nodes-example.example"
}
```
