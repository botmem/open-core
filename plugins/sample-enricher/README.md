# Botmem Plugin API

Botmem supports three types of plugins: **lifecycle**, **scorer**, and **connector**. Plugins live in the `plugins/` directory (configurable via `PLUGINS_DIR` env var). Each plugin is a subdirectory containing a `manifest.json` and an entry point file.

## Plugin Types

### Lifecycle Plugins

Lifecycle plugins subscribe to pipeline hooks and receive read-only memory data at specific stages. They cannot modify the pipeline data -- they are fire-and-forget observers.

### Scorer Plugins

Scorer plugins contribute a bonus (positive or negative) to the final search ranking score. The bonus from each scorer is averaged across all scorers and clamped to +/-0.05 before being added to the base score.

### Connector Plugins

Connector plugins use the existing `BaseConnector` pattern from `@botmem/connector-sdk`. See the connectors documentation for details.

## manifest.json Schema

Every plugin directory must contain a `manifest.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "lifecycle",
  "description": "What this plugin does",
  "hooks": ["afterEnrich"],
  "entryPoint": "index.js"
}
```

| Field         | Type     | Required | Description                                                    |
|---------------|----------|----------|----------------------------------------------------------------|
| `name`        | string   | yes      | Unique plugin identifier                                       |
| `version`     | string   | yes      | Semver version string                                          |
| `type`        | string   | yes      | One of: `lifecycle`, `scorer`, `connector`                     |
| `description` | string   | no       | Human-readable description                                     |
| `hooks`       | string[] | no       | Hook names this plugin subscribes to (lifecycle plugins only)  |
| `entryPoint`  | string   | no       | Entry point file, defaults to `index.js`                       |

## Lifecycle Hook API

### Available Hooks

| Hook          | Fires When                                  | Data Fields                                                    |
|---------------|---------------------------------------------|----------------------------------------------------------------|
| `afterIngest` | After memory record is inserted into DB     | `id`, `text`, `sourceType`, `connectorType`, `eventTime`       |
| `afterEmbed`  | After embedding is stored in Qdrant         | `id`, `text`, `sourceType`, `connectorType`, `eventTime`       |
| `afterEnrich` | After enrichment completes                  | `id`, `text`, `sourceType`, `connectorType`, `eventTime`, `entities`, `factuality` |
| `afterSearch` | After search results are computed           | `query`, `resultCount`, `topScore`                             |

### Handler Signature

```typescript
(data: Record<string, unknown>) => void | Promise<void>
```

- The `data` object is frozen (read-only). Mutations will throw.
- Handlers that throw are caught and logged. They never crash the pipeline.
- All hooks are fire-and-forget: they do not block or delay the pipeline.
- Async handlers run concurrently via `Promise.allSettled`.

### Entry Point Format (Lifecycle)

```javascript
module.exports = {
  afterEnrich(data) {
    // data.id, data.text, data.entities, etc.
    console.log(`Enriched memory ${data.id}`);
  },
  afterSearch(data) {
    console.log(`Search returned ${data.resultCount} results`);
  },
};
```

## Scorer Plugin API

### Entry Point Format (Scorer)

```javascript
module.exports = {
  score(memory, currentWeights) {
    // memory: the memory record as a plain object
    // currentWeights: { semantic, rerank, recency, importance, trust }
    // Return a number (bonus). Will be averaged and clamped to +/-0.05.
    if (memory.sourceType === 'email') return 0.02;
    return 0;
  },
};
```

### Scoring Rules

- Each scorer returns a raw bonus number.
- All scorer bonuses are summed and divided by the number of scorers (averaged).
- The averaged bonus is clamped to the range `[-0.05, +0.05]`.
- The clamped bonus is added to the base score.
- The final score is clamped to `[0, 1]`.

### Scorer Manifest

```json
{
  "name": "my-scorer",
  "version": "1.0.0",
  "type": "scorer",
  "description": "Boosts email memories slightly"
}
```

## Error Handling

- Plugin errors are isolated: a failing plugin never crashes the pipeline.
- Hook handler errors are caught and logged with a warning.
- Scorer errors are caught and the scorer's contribution is skipped.

## Creating a New Plugin

1. Copy the `sample-enricher/` directory to a new directory under `plugins/`.
2. Edit `manifest.json`: set the `name`, `type`, `hooks` (if lifecycle), and `description`.
3. Edit `index.js`: implement your hook handlers or `score` function.
4. Restart the API server. Plugins are loaded on startup.

## This Sample Plugin

This `sample-enricher` plugin subscribes to the `afterEnrich` hook and logs entity information for each enriched memory. It serves as a starting point for building your own lifecycle plugins.

```javascript
// index.js
module.exports = {
  afterEnrich(memory) {
    const entities = memory.entities ? JSON.parse(memory.entities) : [];
    if (entities.length > 0) {
      console.log(
        `[sample-enricher] Memory ${memory.id?.slice(0, 8)} has ${entities.length} entities:`,
        entities.map(e => `${e.type}:${e.value}`).join(', ')
      );
    }
  },
};
```
