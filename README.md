# Algolia CLI Tool

A CLI tool for common Algolia operations built with Node.js and TypeScript.

## Setup

1. Copy `.env.example` to `.env` and fill in your Algolia credentials:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your values:
   ```
   ALGOLIA_APP_ID=your_app_id_here
   ALGOLIA_API_KEY=your_admin_api_key_here
   ALGOLIA_INDEX_NAME=your_index_name_here
   
   # Optional: For resource-specific operations (comma-separated resourceType:path pairs)
   RESOURCE_TYPE_SCHEMA_PATH_MAPPING=webinarDemand:/drafts/cole/webinars/webinar-schema.json,event:/drafts/events/events-schema.json,report:/drafts/reports/reports-schema.json,pressMention:/drafts/cole/press/press-mention-schema.json
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## Available Commands

All commands support `--index <name>` to override the default index from `.env`. Destructive operations require the `--execute` flag.

### replace-objectid

Replace all record objectIDs with `title.toLowerCase()`:

```bash
# Dry run (default) - shows what would change without making changes
npm run dev replace-objectid

# Execute the changes
npm run dev replace-objectid --execute

# Use a different index
npm run dev replace-objectid --index my-other-index --execute
```

### replace-resource-objectid

Replace objectID for resource records using `schemaPath + title + resourceType`:

```bash
npm run dev replace-resource-objectid --execute
```

### find-matching-objectid

Find records where objectID equals `generateUid(title)` (read-only):

```bash
npm run dev find-matching-objectid
```

### replace-objectid-with-slug

Replace objectID with `generateUid(slug)` for records where objectID matches `generateUid(title)` and slug is defined:

```bash
npm run dev replace-objectid-with-slug --execute
```

### generate-uuid

Interactive UUID generation from input strings:

```bash
npm run dev generate-uuid
```

### fix-published-date

Convert string dates to timestamps for a specific resourceType:

```bash
npm run dev fix-published-date --resource-type webinarDemand --execute
```

## Processing Features

All batch operations include:
- Process records in batches of 1000
- Progress indicators and metrics
- Graceful error handling
- Detailed processing time and statistics
- Dry-run by default for safety

### Adding New Actions

To add new actions:

1. Create a new file in `src/actions/your-action.ts`
2. Export an async function that takes options
3. Add the command to `src/index.ts`

## Development

```bash
# Run in development mode with a command
npm run dev <command>

# Build for production
npm run build

# Run built version
npm start <command>

# Type checking
npm run typecheck

# View available commands
npm run dev --help
```

## Architecture

- **Commander.js** for CLI structure and argument parsing
- **Algolia v5 client** for search operations
- **TypeScript** with strict configuration
- **Batch processing** with 1000 records per batch using `client.browse()`
- **Interactive prompts** for destructive operations
- **Comprehensive metrics** and progress reporting