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
   ALGOLIA_INDEX_NAME=your_default_index_name_here

   # Required: For resource-specific operations (JSON format)
   RESOURCE_TYPE_SCHEMA_PATH_MAPPING={"webinarDemand":{"schemaPath":"/path/to/webinars/webinar-schema.json"},"event":{"schemaPath":"/path/to/events-schema.json"}}
   ```

   **Note**: `ALGOLIA_INDEX_NAME` is used as the default for most commands, but `backup-index` and `restore-index` will always prompt for the index name interactively.

3. Install dependencies:

   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## Available Commands

Most commands support `--index <name>` to override the default index from `.env`. Destructive operations require the `--execute` flag.

**Note**: The `backup-index` and `restore-index` commands will prompt you to enter the index name interactively and do not use the `ALGOLIA_INDEX_NAME` environment variable.


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

Generate UUID from input strings (interactive and non-interactive modes):

```bash
# Interactive mode - prompts for input
npm run dev generate-uuid

# Non-interactive mode - direct input
npm run dev generate-uuid --input "my string"
```

### fix-published-date

Convert string dates to timestamps for a specific resourceType (requires `--resource-type` parameter):

```bash
# Analyze publishedDate fields for webinarDemand records
npm run dev fix-published-date --resource-type webinarDemand

# Execute the fixes
npm run dev fix-published-date --resource-type webinarDemand --execute

# Use a different index
npm run dev fix-published-date --resource-type event --index my-other-index --execute
```

### normalize-date-field

Browse all records and normalize a specific date field to Unix timestamps in seconds (requires `--field` parameter):

```bash
# Analyze a date field across all records
npm run dev normalize-date-field --field publishedDate

# Execute normalization for createdAt field
npm run dev normalize-date-field --field createdAt --execute

# Use a different index
npm run dev normalize-date-field --field eventDate --index my-other-index --execute
```

**Supported input formats:**
- Date strings: `"2024-01-15"`, `"2024-12-25 14:30:00"`, `"12/25/2024"`
- String timestamps: `"1705334400"` (seconds), `"1705334400000"` (milliseconds) 
- Numeric timestamps: `1705334400` (seconds), `1705334400000` (milliseconds)
- All variations are normalized to Unix timestamps in seconds
- Skips null, undefined, or empty field values

### sanitize-date-values

Analyze and sanitize all date-like values across all record fields to Unix timestamps in seconds:

```bash
# Analyze all date-like values across all fields
npm run dev sanitize-date-values

# Execute sanitization of all date fields
npm run dev sanitize-date-values --execute

# Use a different index
npm run dev sanitize-date-values --index my-other-index --execute
```

**Behavior:**
- Automatically detects and normalizes any field containing date-like values
- Converts string dates, timestamp strings, and numeric timestamps
- More comprehensive than `normalize-date-field` (which targets a specific field)
- Uses the same date format support as `normalize-date-field`

### find-duplicate-slug

Find and handle duplicate records with the same slug, replacing title-generated objectIDs with slug-generated content:

```bash
# Find duplicate slug records
npm run dev find-duplicate-slug

# Execute duplicate handling
npm run dev find-duplicate-slug --execute

# Use a different index
npm run dev find-duplicate-slug --index my-other-index --execute
```

**Behavior:**
- Identifies records sharing the same slug value
- Replaces title-generated objectIDs with slug-generated ones
- Helps consolidate duplicate content under consistent identifiers

### delete-records-by-pattern

Delete records where a specific field matches a regular expression pattern:

```bash
# Find records matching a pattern (dry run)
npm run dev delete-records-by-pattern --key fieldName --pattern "regex-pattern"

# Execute deletions for matching records
npm run dev delete-records-by-pattern --key title --pattern "^test.*" --execute

# Delete records where URL contains "staging"
npm run dev delete-records-by-pattern --key url --pattern "staging" --execute
```

**Parameters:**
- `--key <name>`: Field name to match against (must be string field)
- `--pattern <regex>`: Regular expression pattern to match

### find-invalid-records

Find and optionally delete records with invalid values for specified keys:

```bash
# Find records with invalid values in specific fields
npm run dev find-invalid-records --keys "title,slug,url"

# Execute deletion of invalid records
npm run dev find-invalid-records --keys "title,slug" --execute

# Check a single field
npm run dev find-invalid-records --keys "publishedDate" --execute
```

**Parameters:**
- `--keys <list>`: Comma-delimited list of keys to check for invalid values

**Invalid values include:**
- `null` values
- `undefined` values  
- Empty strings (`""`)
- Missing keys

### backup-index

Backup an Algolia index including records, settings, rules and synonyms:

```bash
# Backup index (will prompt for index name)
npm run dev backup-index

# Backup to specific directory
npm run dev backup-index --output-dir ./backups

# Custom batch size
npm run dev backup-index --batch-size 500
```

**Features:**
- **Interactive index selection**: Prompts you to enter the index name (does not use `ALGOLIA_INDEX_NAME`)
- Exports all records, settings, rules, and synonyms
- Creates timestamped JSON files for each component
- Default output: current directory

### restore-index

Restore an Algolia index from backup files:

```bash
# Restore index (will prompt for target index name)
npm run dev restore-index --execute

# Dry run restore
npm run dev restore-index

# Restore from specific directory
npm run dev restore-index --input-dir ./backups --execute

# Skip confirmation prompts
npm run dev restore-index --skip-confirmation --execute
```

**Features:**
- **Interactive index selection**: Prompts you to enter the target index name (does not use `ALGOLIA_INDEX_NAME`)
- Automatically finds backup files by pattern matching
- Restores records, settings, rules, and synonyms
- Supports custom backup file prefixes with `--backup-prefix`
- Includes confirmation prompts for safety

## Processing Features

All batch operations include:

- Process records in batches of 1000 (configurable with `--batch-size`)
- Progress indicators and metrics
- Graceful error handling with detailed error logs
- Detailed processing time and statistics
- Dry-run by default for safety (destructive operations require `--execute`)
- Optional log file output with `--log-file` (saved to `logs/` folder with timestamp)
- Interactive confirmations for destructive operations
- Comprehensive validation and type checking

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
