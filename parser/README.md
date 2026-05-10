# Trade Confirm Parser

A React component that takes pasted text from a Robinhood trade confirmation PDF and outputs a TSV ready for your trade log.

## Running it in Claude

This is the easiest path:

1. Open [Claude](https://claude.ai)
2. Start a new chat
3. Upload or paste the contents of `TradeConfirmParser.jsx`
4. Ask: *"Render this React component as an artifact"*
5. The interactive parser opens in the right panel

The parser uses Claude's built-in API runtime (`https://api.anthropic.com/v1/messages`) which handles authentication automatically when running inside a Claude artifact.

## How it works

1. You paste the raw text copied from a Robinhood confirmation PDF
2. The component sends it to `claude-sonnet-4-20250514` with a system prompt that defines the matched-lot output schema
3. Claude returns a JSON array; the component extracts and validates it
4. Each trade appears as an editable row in a preview table
5. **Copy All Rows** writes a 15-column TSV to your clipboard

### Output columns (in order)

`Position ID, Entry Date, Entry Time, Exit Date, Exit Time, Ticker, C/P, Strategy, Strike, Expiry, # Contracts, Entry Price, Fees, Exit Price, Contract High`

This order matches columns B through P in the spreadsheet exactly. **Do not reorder these columns** — the formula columns (Q onwards) in the spreadsheet must remain untouched, and any change to the parser column order will misalign the paste.

### Robustness features

- **Three response-body read methods** with auto-fallback (clone-text → stream reader → arrayBuffer)
- **Auto-retry** up to 3 attempts with 800ms / 1.6s backoff on empty responses
- **Multi-strategy JSON extraction** (raw parse → strip code fences → bracket-bounded slice → object boundaries → char-by-char object extraction)
- **Manual `JSON.parse` instead of `res.json()`** to avoid Safari's "string did not match expected pattern" error

### Matched-lot logic

For each unique position (same ticker + strike + expiry):

1. If the confirmation has both buys and sells → outputs one row per sell fill with `entry_price` set to the average buy price, plus one open-runner row if `total_bought > total_sold`
2. If the confirmation has only buys → outputs one combined open row with weighted average entry price and total contracts
3. If a sell appears with no matching buy in this confirmation → outputs a sell row with `entry_price = 0`. The spreadsheet's `AVERAGEIF` lookup formula then fills it in from existing rows with the same Position ID

## Modifying the parser

The system prompt is in the `SYSTEM` constant near the top of the file. The output schema is defined there in plain language — edit it if you switch brokers or want to change how trades are grouped.

The visible columns and their order live in the `COLS` array. Adding, removing, or reordering columns there changes both the preview table and the TSV output.

## License

MIT — see the repo root LICENSE file.
