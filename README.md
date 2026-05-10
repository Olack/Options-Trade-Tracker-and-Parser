# Options Trade Tracker

A spreadsheet-based options trading P&L tracker with an AI-powered parser that ingests Robinhood trade confirmation PDFs and auto-fills your trade log.

Built for swing traders who need to track partial exits, runners, and overall position P&L without copying numbers by hand.

---

## What's inside

- **`tracker/Options_Tracker.xlsx`** — the spreadsheet with auto-calculating dashboard, position summary, monthly calendar, and 1000-row trade log
- **`parser/TradeConfirmParser.jsx`** — a React component that takes pasted Robinhood confirmation text, extracts every trade, and outputs a TSV ready to paste into the tracker
- **`examples/sample_trades.csv`** — anonymized sample data so you can see what filled-in looks like

---

## Features

### Spreadsheet
- **Trade Log** — 1000 rows, one row per matched lot (each sell paired with its entry; runners as their own row)
- **Dashboard** — KPIs including Total P&L, Win Rate, Best Ticker, Total Fees, Max P&L %, \$ Left on Table, plus a Strategy breakdown table, Ticker Performance table, Quarterly Results, and Yearly Results
- **Position Summary** — rolls up by Position ID with total P&L, premium paid/received, and **Open Contracts** so you see your runners at a glance
- **Monthly Calendar** — shows daily P&L for any selected month/year
- **Auto-calculated columns** — Premium Paid, Premium Received, Max Value, P&L \$, P&L %, Max P&L \$, Max P&L %, Days Held, Actual R:R, Max R:R, plus TradingView 1H/4H chart links per row
- **Smart entry-price lookup** — sell rows without entry prices auto-look up the matching buy via Position ID

### Parser
- **Text paste interface** — copy text from a Robinhood PDF, paste, parse
- **Matched lot output** — for a position bought 10 @ \$1.40, sold 5 @ \$1.45, sold 1 @ \$1.75, sold 3 @ \$1.45, the parser produces 4 clean rows: 3 closed sells with their P&L, plus 1 open runner
- **Fee extraction** — sums Comm + Contr Fee + Tran Fee per row
- **Auto-detects** ticker, option type (Call/Put), strike, expiry, contracts, and dates
- **Editable preview** — fix anything before copying to the spreadsheet

---

## Setup

### 1. The spreadsheet

1. Download `tracker/Options_Tracker.xlsx`
2. Upload it to **Google Sheets** (recommended) or open in Excel
3. *Google Sheets:* `File → Import → Upload → Replace spreadsheet`
4. The spreadsheet uses array formulas (`UNIQUE`, `FILTER`) that work natively in Google Sheets and Excel 365+

### 2. The parser

The parser is a React component designed to run as a [Claude Artifact](https://claude.ai). It uses the Anthropic API via Claude's built-in artifact runtime — no API key needed when running in Claude.

**To use it:**
1. Open Claude (claude.ai)
2. Start a new chat and paste the contents of `parser/TradeConfirmParser.jsx`
3. Ask Claude to "render this as an artifact"
4. The parser opens in the artifact panel — drop in your trade confirmation text and click Parse

**To run standalone** (advanced): the parser fetches `https://api.anthropic.com/v1/messages` and expects auth to be handled by the runtime. To run outside Claude you'd need to add your own API key handling and a small backend proxy.

---

## How to use

### Logging trades

1. Download your Robinhood trade confirmation PDF for the day
2. Open the PDF in Preview (Mac) or Adobe Acrobat
3. **Cmd+A** to select all text, **Cmd+C** to copy
4. Open the parser artifact in Claude, paste into the text area, click **Parse Trades**
5. Review the extracted rows in the preview table
6. Fill in any yellow columns you want (Contract High, etc.)
7. Click **Copy All Rows**
8. Open your tracker → **Trade Log** tab → click the first empty cell in **column B** (Position ID)
9. Press **Cmd+Shift+V** (paste values only) to preserve formatting

### What gets calculated

For each filled row, the spreadsheet auto-calculates:
- **Premium Paid** = entry × contracts × 100
- **Premium Received** = exit × contracts × 100
- **P&L \$** = Received − Paid
- **P&L %** = P&L / Paid
- **Days Held** = Exit Date − Entry Date
- **TradingView chart links** for the entry datetime

### Manual columns

These need filling in directly on the spreadsheet:
- **Contract High (col P)** — the highest price the contract reached during your hold (look it up on TradingView). Required for Max P&L and "\$ Left on Table" KPIs to work.
- **IV Rank (col AC)** and **Notes (col AD)** — optional, for journaling

---

## Position ID convention

`TICKER-STRIKE-MMDD` — e.g. `SPY-740-0514` for SPY 5/14/2026 \$740 Call

This is what links partial fills together. The parser generates these automatically.

---

## License

MIT — see [LICENSE](LICENSE)

## Disclaimer

This is a personal trade tracker, not financial advice. Verify all calculations against your broker's records. Past performance does not guarantee future results.
