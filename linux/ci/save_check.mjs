import fs from "fs"; import os from "os"; import path from "path";
const port = process.argv[2] || "9333";
const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const url = pages.find(p => p.type === "page" && p.url.startsWith("app://")).webSocketDebuggerUrl;
const ws = new WebSocket(url);
await new Promise(r => ws.onopen = r);
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['Nate Bloom Linux test'], { type: 'text/plain' })); a.download = 'nb-linux-test.txt'; document.body.appendChild(a); a.click(); a.remove(); return 1 })()", returnByValue: true } }));
const d = path.join(os.homedir(), "Downloads", "Nate Bloom");
for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); if (fs.existsSync(d) && fs.readdirSync(d).length) break; }
console.log("saved (raw CDP):", fs.existsSync(d) ? fs.readdirSync(d) : "no folder");
ws.close();
