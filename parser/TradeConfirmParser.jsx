import { useState } from "react";

const COLS = [
  { key: "position_id",   label: "Position ID",    auto: false, w: 108 },
  { key: "entry_date",    label: "Entry Date",      auto: true,  w: 95  },
  { key: "entry_time",    label: "Entry Time",      auto: false, w: 82  },
  { key: "exit_date",     label: "Exit Date",       auto: true,  w: 95  },
  { key: "exit_time",     label: "Exit Time",       auto: false, w: 82  },
  { key: "ticker",        label: "Ticker",          auto: true,  w: 62  },
  { key: "type",          label: "C/P",             auto: true,  w: 44  },
  { key: "strategy",      label: "Strategy",        auto: true,  w: 124 },
  { key: "strike",        label: "Strike ($)",      auto: true,  w: 82  },
  { key: "expiry",        label: "Expiry",          auto: true,  w: 95  },
  { key: "contracts",     label: "# Contracts",     auto: true,  w: 90  },
  { key: "entry_price",   label: "Entry Price",     auto: true,  w: 92  },
  { key: "fees",          label: "Fees ($)",        auto: true,  w: 80  },
  { key: "exit_price",    label: "Exit Price",      auto: true,  w: 88  },
  { key: "contract_high", label: "Contract High",   auto: false, w: 105 },
];
// NOTE: IV Rank (col AC) and Notes (col AD) sit after formula columns Q-AB
// and can't be included in the paste — fill them directly in the spreadsheet.

const SYSTEM = `You are a Robinhood trade confirmation parser. The user will paste raw text copied from a Robinhood trade confirmation PDF. You must output MATCHED LOT rows — not one row per table line — so P&L calculates cleanly on every row. Return ONLY a raw JSON array. No markdown, no code fences. Start with [ and end with ].

CRITICAL — COMPLETENESS:
Before processing, scan the entire input and identify EVERY unique position (ticker + strike + expiry combination). Your output array MUST include at least one row for every unique position you found. Never skip a position, even if it only has one fill or appears in an unusual format. If you find 7 unique positions in the input, your output must contain rows covering all 7.

MATCHING LOGIC — follow exactly:
1. Group all table rows by position = same ticker + strike + expiry date
2. For each position that has both BUY and SELL rows:
   a. Sum all BUY quantities → total_bought. Weighted average all BUY prices → avg_buy_price.
   b. For EACH SELL row, output one closed lot row:
        entry_date  = Trade Date of the BUY orders
        exit_date   = Trade Date of this SELL
        entry_price = avg_buy_price
        exit_price  = this SELL's Price
        contracts   = this SELL's QTY
        fees        = this SELL row's fees (Comm + Contr Fee + Tran Fee)
        action      = "SELL"
   c. If total_bought > sum of all SELL quantities, output ONE open lot row for the remaining:
        entry_date  = Trade Date of the BUY orders
        exit_date   = ""
        entry_price = avg_buy_price
        exit_price  = 0
        contracts   = total_bought - total_sold
        fees        = sum of all BUY fees for this position
        action      = "BUY"
3. For positions with ONLY BUY rows (no sells in this confirmation):
   Output ONE combined row: avg entry_price, total contracts, no exit.
4. For SELL rows with no matching BUY in this confirmation:
   Output as a SELL row with exit_price filled, entry_price = 0, and entry_date = "".
   position_id omits the entry suffix — these are orphan sells that close a position opened in an earlier confirmation, and get flagged for manual matching against the existing Trade Log.

Each object must have exactly these fields:
  position_id  string  "TICKER-STRIKE-EXPMMDD-ENTRYMMDD" e.g. "SPY-740-0514-0506" — EXPMMDD = expiry month+day, ENTRYMMDD = entry (BUY) trade date month+day. This groups every lot from one open together with all of its closes, and keeps separate trade cycles of the same contract distinct. For SELL rows with no matching BUY in this confirmation, OMIT the entry suffix: "TICKER-STRIKE-EXPMMDD" e.g. "SPY-740-0514"
  entry_date   string  MM/DD/YYYY — the BUY/open trade date. REQUIRED on open BUY rows AND on matched SELL rows (use the matched BUY's trade date, per step 2b). "" ONLY for SELL rows with no matching BUY in this confirmation (step 4)
  exit_date    string  MM/DD/YYYY for closed/SELL rows; "" for open rows
  ticker       string  Stock symbol e.g. "SPY"
  type         string  "C" for CALL, "P" for PUT
  strategy     string  "Long Call" for open BUY+CALL, "Long Put" for open BUY+PUT, "Sell to Close" for SELL rows
  strike       number  Strike price e.g. 740
  expiry       string  Expiration date MM/DD/YYYY
  contracts    number  Number of contracts for this specific lot
  entry_price  number  Avg buy price per contract (0 if unknown)
  exit_price   number  Sell price per contract (0 if still open)
  fees         number  Total fees for this lot
  action       string  "BUY" for open lots, "SELL" for closed lots

VERIFICATION before returning:
- List every unique ticker you saw in the input
- Confirm every one of those tickers appears in at least one output row
- Confirm the sum of contracts in your output (per position) matches the sum from the input table

EXAMPLE — SPY bought 10 @ $1.40, sold 5 @ $1.45, sold 1 @ $1.75, sold 3 @ $1.45:
→ Row 1: SELL, contracts=5, entry_price=1.40, exit_price=1.45  (P&L = $25)
→ Row 2: SELL, contracts=1, entry_price=1.40, exit_price=1.75  (P&L = $35)
→ Row 3: SELL, contracts=3, entry_price=1.40, exit_price=1.45  (P&L = $15)
→ Row 4: BUY,  contracts=1, entry_price=1.40, exit_price=0     (1 runner)`;

function extractTrades(raw) {
  const s = raw.replace(/```[\w]*\n?/g, "").replace(/```/g, "").trim();
  const attempts = [
    () => JSON.parse(s),
    () => { const a = s.indexOf("["), b = s.lastIndexOf("]"); return a>=0&&b>a ? JSON.parse(s.slice(a,b+1)) : null; },
    () => { const a = s.indexOf("{"), b = s.lastIndexOf("}"); if(a<0||b<=a) return null; const o = JSON.parse(s.slice(a,b+1)); for(const v of Object.values(o)) if(Array.isArray(v)&&v.length) return v; return null; },
  ];
  for (const fn of attempts) {
    try { const r = fn(); if(r && Array.isArray(r) && r.length) return r; } catch(_) {}
  }
  // last resort: pull out individual objects
  const objs = []; let depth=0, inStr=false, start=-1;
  for (let i=0;i<s.length;i++) {
    const c=s[i];
    if(c==='"'&&s[i-1]!=='\\') inStr=!inStr;
    if(inStr) continue;
    if(c==='{'){if(!depth)start=i;depth++;}
    if(c==='}'){depth--;if(!depth&&start>=0){try{objs.push(JSON.parse(s.slice(start,i+1)));}catch(_){}start=-1;}}
  }
  return objs.length ? objs : null;
}

function cleanTrades(raw) {
  return raw.map((t,i) => ({
    ...t,
    _id: `${i}-${Date.now()}`,
    entry_price: (!t.entry_price || t.entry_price===0) ? "" : t.entry_price,
    exit_price:  (t.action==="BUY" || !t.exit_price || t.exit_price===0) ? "" : t.exit_price,
    fees: t.fees || "",
  }));
}

// Reconciliation checks — surface things the parser can't fix on its own
// because it only ever sees one confirmation at a time.
function computeWarnings(trades) {
  const out = [];
  // group by contract (ticker + strike + expiry), ignoring entry-date suffix
  const byContract = {};
  trades.forEach(t => {
    const k = `${t.ticker}|${t.strike}|${t.expiry}`;
    (byContract[k] = byContract[k] || []).push(t);
  });

  // A) Orphan sells — a SELL with no matching BUY in this confirmation.
  // It almost always closes a position already sitting OPEN in the Trade Log.
  trades.forEach(t => {
    if (t.action === "SELL" && !t.entry_date) {
      out.push({
        level: "warn",
        text: `${t.position_id || t.ticker}: sell of ${t.contracts||"?"} contract(s) has no matching buy here. It likely closes a position already in your Trade Log — update that open row's exit instead of pasting this as a new position, or you'll double-count.`,
      });
    }
  });

  // B) Open lots — distinguish a brand-new open position from a partial fill.
  Object.values(byContract).forEach(rows => {
    const sells = rows.filter(r => r.action === "SELL");
    rows.filter(r => r.action === "BUY").forEach(b => {
      if (sells.length) {
        out.push({
          level: "info",
          text: `${b.position_id}: partial fill — some contracts sold, ${b.contracts||"?"} still open. This open lot stays in your log until a later confirmation closes it.`,
        });
      } else {
        out.push({
          level: "info",
          text: `${b.position_id}: new open position, ${b.contracts||"?"} contract(s) @ ${b.entry_price||"?"}. Stays open until a later confirmation closes it.`,
        });
      }
    });
  });

  return out;
}

export default function TradeConfirmParser() {
  const [text, setText]     = useState("");
  const [loading, setLoad]  = useState(false);
  const [trades, setTrades] = useState([]);
  const [focused, setFoc]   = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError]   = useState("");

  const parse = async () => {
    const trimmed = text.trim();
    if (!trimmed) { setError("Please paste your confirmation text first."); return; }
    setLoad(true); setError(""); setTrades([]);
    try {
      // Read response body via every available method until something works
      const readBody = async (response) => {
        // Try 1: clone and read as text
        try {
          const t = await response.clone().text();
          if (t) return t;
        } catch (_) {}
        // Try 2: stream reader on a fresh clone
        try {
          const reader = response.clone().body?.getReader();
          if (reader) {
            const chunks = [];
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) chunks.push(value);
            }
            if (chunks.length) {
              const total = chunks.reduce((s,c)=>s+c.length, 0);
              const merged = new Uint8Array(total);
              let off = 0;
              for (const ch of chunks) { merged.set(ch, off); off += ch.length; }
              const t = new TextDecoder().decode(merged);
              if (t) return t;
            }
          }
        } catch (_) {}
        // Try 3: arrayBuffer
        try {
          const buf = await response.arrayBuffer();
          if (buf?.byteLength) return new TextDecoder().decode(buf);
        } catch (_) {}
        return "";
      };

      const requestBody = JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: SYSTEM,
        messages: [{ role:"user", content: `Here is the text copied from my Robinhood trade confirmation:\n\n${trimmed}` }]
      });

      // Retry loop — up to 3 attempts with 800ms backoff
      let res, responseText = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody
          });
        } catch (e) {
          if (attempt === 2) throw new Error(`Network error: ${e.message}`);
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        responseText = await readBody(res);
        if (responseText) break;
        // Empty body, wait and retry
        if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }

      if (!responseText) throw new Error(`Empty response after 3 attempts (HTTP ${res?.status}). The API proxy may be rate limiting — wait a moment and try again.`);
      if (!res.ok) throw new Error(`API ${res.status}: ${responseText.slice(0,200)}`);

      let data;
      try { data = JSON.parse(responseText); }
      catch(_) { throw new Error(`Response not JSON: ${responseText.slice(0,200)}`); }

      if (data.error) throw new Error(data.error.message);

      const raw = (data.content||[]).find(b=>b.type==="text")?.text||"";
      if (!raw) throw new Error(`No text in response. stop_reason=${data.stop_reason}`);

      const extracted = extractTrades(raw);
      if (!extracted?.length) throw new Error(`Could not extract trades. Preview: "${raw.slice(0,300)}"`);

      setTrades(cleanTrades(extracted));
    } catch(e) { setError(e.message); }
    finally { setLoad(false); }
  };

  const updateTrade = (id,key,val) =>
    setTrades(prev => prev.map(t => t._id===id ? {...t,[key]:val} : t));
  const removeTrade = (id) => setTrades(prev => prev.filter(t=>t._id!==id));
  const addRow = () => setTrades(prev=>[...prev,{_id:`new-${Date.now()}`,action:"BUY",type:"C",strategy:"Long Call"}]);

  const copyTSV = () => {
    const rows = trades.map(t => COLS.map(c=>String(t[c.key]??"").replace(/\t/g," ")).join("\t"));
    navigator.clipboard.writeText(rows.join("\n")).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),3000);});
  };

  const buys  = trades.filter(t=>t.action==="BUY").length;
  const sells = trades.filter(t=>t.action==="SELL").length;
  const totalFees = trades.reduce((s,t)=>s+(parseFloat(t.fees)||0),0);
  const warnings = computeWarnings(trades);
  const warnCount = warnings.filter(w=>w.level==="warn").length;

  const C = {
    wrap: { fontFamily:"'IBM Plex Mono','Courier New',monospace", background:"#0A0E1A", minHeight:"100vh", color:"#E2E8F0" },
    header: { background:"#0F1729", borderBottom:"1px solid #1E3A5F", padding:"18px 24px", display:"flex", alignItems:"center", gap:12 },
    logo: { width:36, height:36, background:"#1D4ED8", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 },
    body: { padding:"20px 24px" },
    label: { fontSize:11, fontWeight:700, color:"#94A3B8", marginBottom:8, display:"block" },
    textarea: { width:"100%", minHeight:180, background:"#0D1525", border:"1px solid #1E3A5F", borderRadius:10, padding:"14px 16px", color:"#E2E8F0", fontFamily:"inherit", fontSize:10, outline:"none", resize:"vertical", lineHeight:1.6, boxSizing:"border-box" },
    btn: (on) => ({ width:"100%", padding:13, borderRadius:8, border:"none", fontFamily:"inherit", fontSize:12, fontWeight:700, letterSpacing:".4px", cursor:on?"pointer":"not-allowed", background:on?"#1D4ED8":"#1E293B", color:on?"#fff":"#475569", transition:"all .2s" }),
    error: { background:"#2D1515", border:"1px solid #7F1D1D", borderRadius:8, padding:"10px 14px", color:"#FCA5A5", fontSize:11, marginBottom:12, wordBreak:"break-word" },
    warnRow: (lvl) => ({
      display:"flex", gap:8, alignItems:"flex-start", padding:"7px 11px", fontSize:10, lineHeight:1.5,
      borderBottom:"1px solid #0D1525",
      color: lvl==="warn" ? "#FCD34D" : "#7DD3FC",
    }),
    th: (auto) => ({ padding:"9px 7px", color:auto?"#22C55E":"#F59E0B", fontWeight:600, borderBottom:"1px solid #1E3A5F", whiteSpace:"nowrap", background:"#0D1829", textAlign:"left" }),
    td: { padding:"4px 5px", borderBottom:"1px solid #0D1525" },
    inp: (auto,has,foc,fees) => ({
      background: foc?"#1E2D4A": fees&&has?"#1A0A0A": auto&&has?"#0D1F13": has?"#1A160A":"transparent",
      border:`1px solid ${foc?"#3B82F6":"transparent"}`,
      borderRadius:4, padding:"3px 6px",
      color: foc?"#E2E8F0": fees&&has?"#FCA5A5": auto&&has?"#86EFAC": has?"#FCD34D":"#334155",
      fontFamily:"inherit", fontSize:10, outline:"none", width:"100%", transition:"all .15s",
    }),
  };

  return (
    <div style={C.wrap}>
      <div style={C.header}>
        <div style={C.logo}>⚡</div>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:"#F0F6FF"}}>Trade Confirm Parser</div>
          <div style={{fontSize:10,color:"#475569",marginTop:1}}>Paste confirmation text · AI extracts trades · Copy into your tracker</div>
        </div>
      </div>

      <div style={C.body}>

        {/* Instructions */}
        <div style={{background:"#0D1829",border:"1px solid #1E3A5F",borderRadius:10,padding:"14px 18px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#3B82F6",marginBottom:8}}>📋  How to get the text from your Robinhood PDF</div>
          <ol style={{paddingLeft:16,color:"#64748B",fontSize:10,lineHeight:2.2,margin:0}}>
            <li>Open the trade confirmation PDF in <strong style={{color:"#94A3B8"}}>Preview</strong> (Mac) or <strong style={{color:"#94A3B8"}}>Adobe Acrobat</strong></li>
            <li>Press <strong style={{color:"#60A5FA"}}>Cmd+A</strong> to select all, then <strong style={{color:"#60A5FA"}}>Cmd+C</strong> to copy</li>
            <li>Paste into the box below with <strong style={{color:"#60A5FA"}}>Cmd+V</strong></li>
            <li>Click <strong style={{color:"#60A5FA"}}>Parse Trades</strong></li>
          </ol>
        </div>

        {/* Text input */}
        <label style={C.label}>PASTE CONFIRMATION TEXT HERE</label>
        <textarea
          style={C.textarea}
          value={text}
          onChange={e=>setText(e.target.value)}
          placeholder="Paste the full text from your Robinhood trade confirmation PDF here..."
          spellCheck={false}
        />

        {error && <div style={{...C.error,marginTop:10}}><strong>Error:</strong> {error}</div>}

        <button onClick={parse} disabled={!text.trim()||loading}
          style={{...C.btn(!!text.trim()&&!loading),marginTop:12}}>
          {loading?"⏳  Parsing trades...":"⚡  PARSE TRADES"}
        </button>

        {/* Results */}
        {trades.length>0&&(
          <div style={{marginTop:20}}>
            <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:12,flexWrap:"wrap"}}>
              {[["#1A3A2A","#22C55E","Auto-filled"],["#2A2210","#F59E0B","Fill manually"]].map(([bg,br,lbl])=>(
                <div key={lbl} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:"#64748B"}}>
                  <div style={{width:10,height:10,background:bg,border:`1px solid ${br}`,borderRadius:2}}/>
                  {lbl}
                </div>
              ))}
              <div style={{marginLeft:"auto",display:"flex",gap:14,fontSize:11,color:"#64748B"}}>
                <span>🟢 {buys} buys</span>
                <span>🔴 {sells} sells</span>
                <span>📋 {trades.length} rows</span>
                {totalFees>0&&<span style={{color:"#FCA5A5"}}>💸 ${totalFees.toFixed(2)} fees</span>}
              </div>
            </div>

            {warnings.length>0&&(
              <div style={{border:"1px solid #1E3A5F",borderRadius:10,marginBottom:14,overflow:"hidden"}}>
                <div style={{background:"#0D1829",padding:"9px 12px",fontSize:11,fontWeight:700,
                  color: warnCount>0 ? "#F59E0B" : "#3B82F6", borderBottom:"1px solid #1E3A5F"}}>
                  🔎  Reconciliation — {warnCount>0
                    ? `${warnCount} row${warnCount>1?"s":""} need a manual check before you paste`
                    : "no issues, just a heads-up on open positions"}
                </div>
                {warnings.map((w,i)=>(
                  <div key={i} style={C.warnRow(w.level)}>
                    <span style={{flexShrink:0}}>{w.level==="warn"?"⚠️":"📌"}</span>
                    <span>{w.text}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{overflowX:"auto",borderRadius:10,border:"1px solid #1E3A5F",marginBottom:14}}>
              <table style={{borderCollapse:"collapse",width:"100%",fontSize:10}}>
                <thead>
                  <tr>
                    <th style={{...C.th(false),width:36,textAlign:"center"}}>#</th>
                    {COLS.map(c=>(
                      <th key={c.key} style={{...C.th(c.auto),minWidth:c.w}}>{c.label}</th>
                    ))}
                    <th style={{...C.th(false),width:30}}/>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade,idx)=>{
                    const isBuy=trade.action==="BUY";
                    return (
                      <tr key={trade._id} style={{background:idx%2===0?"#0D1525":"#0A1020"}}>
                        <td style={{...C.td,textAlign:"center"}}>
                          <span style={{background:isBuy?"#052E16":"#2D0A0A",color:isBuy?"#22C55E":"#F87171",borderRadius:3,padding:"2px 5px",fontSize:9,fontWeight:700}}>
                            {isBuy?"B":"S"}
                          </span>
                        </td>
                        {COLS.map(c=>{
                          const val=trade[c.key]??"";
                          const hasVal=String(val).trim()!==""&&String(val)!=="0";
                          const fKey=`${trade._id}-${c.key}`;
                          const isFoc=focused===fKey;
                          const isFees=c.key==="fees";
                          return (
                            <td key={c.key} style={C.td}>
                              <input
                                value={val}
                                onChange={e=>updateTrade(trade._id,c.key,e.target.value)}
                                onFocus={()=>setFoc(fKey)}
                                onBlur={()=>setFoc(null)}
                                placeholder={c.auto?"—":"fill in"}
                                style={{...C.inp(c.auto,hasVal,isFoc,isFees),minWidth:c.w-14}}
                              />
                            </td>
                          );
                        })}
                        <td style={{...C.td,textAlign:"center"}}>
                          <button onClick={()=>removeTrade(trade._id)}
                            style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:13,padding:0}}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap"}}>
              <button onClick={addRow}
                style={{padding:"10px 16px",borderRadius:8,border:"1px solid #1E3A5F",background:"#0D1525",color:"#94A3B8",cursor:"pointer",fontFamily:"inherit",fontSize:11}}>
                + Add Row
              </button>
              <button onClick={copyTSV}
                style={{padding:"10px 20px",borderRadius:8,border:"none",fontFamily:"inherit",background:copied?"#065F46":"#1D4ED8",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700,letterSpacing:".3px"}}>
                {copied?"✅  Copied! Paste into column B of Trade Log":"📋  Copy All Rows → Paste into Google Sheets (col B)"}
              </button>
            </div>

            <div style={{background:"#0D1829",border:"1px solid #1E3A5F",borderRadius:10,padding:"16px 20px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#3B82F6",marginBottom:10}}>📌  How to paste into your Trade Log</div>
              <ol style={{paddingLeft:16,color:"#64748B",fontSize:10,lineHeight:2.2,margin:0}}>
                <li>Fill in any <span style={{color:"#FCD34D"}}>yellow</span> columns: Entry/Exit Time, Contract High. Then fill <strong style={{color:"#60A5FA"}}>IV Rank (col AC)</strong> and <strong style={{color:"#60A5FA"}}>Notes (col AD)</strong> directly in the sheet</li>
                <li>Click <strong style={{color:"#60A5FA"}}>Copy All Rows</strong> above</li>
                <li>Open Google Sheets → <strong style={{color:"#60A5FA"}}>Trade Log</strong> tab</li>
                <li>Click the first empty cell in <strong style={{color:"#60A5FA"}}>column B</strong> of the next available row</li>
                <li>Press <strong style={{color:"#60A5FA"}}>Ctrl+Shift+V</strong> (paste values only) to preserve formatting</li>
                <li><span style={{color:"#86EFAC"}}>P&L, Premium, Days Held, chart links</span> all calculate automatically ✅</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
