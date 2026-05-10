# Sample Data

`sample_trades.csv` shows what parsed trade data looks like for one trading day. Tickers and dates are real options symbols but quantities and prices are illustrative.

## What's in this sample

This represents the matched-lot output from a confirmation where:
- **SPY 740 Call** was bought 10 contracts at $1.40, then partially sold at three different prices throughout the day, leaving 1 runner open
- **ORCL 300 Call** had two separate buy fills (3 + 2 contracts) combined into one open lot at avg $0.98
- Six other positions (NVDA, ANET, IREN x2, MU) are simple opens with no exits yet

## How to load this sample into your tracker

1. Open `sample_trades.csv` in a spreadsheet app
2. Select all rows starting from row 2 (skip the header)
3. Copy them
4. Open your tracker → **Trade Log** tab
5. Click cell **B5** (first data row, Position ID column)
6. Paste with **Cmd+Shift+V** (values only)

The dashboard, position summary, and other sheets will update automatically.

## Expected results after pasting

- **Total Fills:** 10
- **Open positions:** 7 (ORCL, SPY runner, NVDA, ANET, IREN x2, MU)
- **Closed P&L:** +$75 from the SPY partial sells
  - 5 contracts: ($1.45 − $1.40) × 5 × 100 = $25
  - 1 contract: ($1.75 − $1.40) × 1 × 100 = $35
  - 3 contracts: ($1.45 − $1.40) × 3 × 100 = $15
- **Total Fees:** ~$0.92
