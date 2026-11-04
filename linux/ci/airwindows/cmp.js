const fs=require('fs'),cp=require('child_process'),vm=require('vm');
const m890=fs.readFileSync(__dirname+'/../../../src/app/890-airwindows.js','utf8');const src=m890.slice(m890.indexOf('const NB_AW_SRC = `')+19,m890.indexOf('registerProcessor("nb-aw"'))+'\n;({AWDensity,AWDeRez2,AWPressure4,AWGalactic,AWToTape6})';
globalThis.AudioWorkletProcessor=class{constructor(){this.port={}}};
const M=vm.runInThisContext(src);
const SR=48000,N=SR*3;
// test signal: sweep + noise + loud bursts + silence gaps
let seed=1;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296)*2-1;
const L=new Float32Array(N),R=new Float32Array(N);
for(let i=0;i<N;i++){const t=i/SR;const env=(i%24000)<20000?1:0;const f=60*Math.pow(200,t/3);
 L[i]=env*(0.6*Math.sin(2*Math.PI*f*t)+0.15*rnd())*(t>1.5&&t<2?2.2:1);R[i]=env*(0.5*Math.sin(2*Math.PI*f*1.01*t+1)+0.15*rnd());}
const inter=new Float32Array(N*2);for(let i=0;i<N;i++){inter[2*i]=L[i];inter[2*i+1]=R[i];}
fs.writeFileSync('in.f32',Buffer.from(inter.buffer));
const cases=[['Density',[0.2,0,1,1]],['Density',[0.8,0.3,0.7,0.6]],['Density',[0.05,0.5,1,1]],
['DeRez2',[1,1,1,1]],['DeRez2',[0.3,0.4,0.5,1]],['DeRez2',[0.1,0.1,0,0.7]],
['Pressure4',[0,0.2,1,1]],['Pressure4',[0.7,0.5,0.3,0.8]],['Pressure4',[0.4,0.9,0.9,1]],
['Galactic',[0.5,0.5,0.5,1,1]],['Galactic',[0.9,0.3,0.8,0.4,0.6]],
['ToTape6',[0.5,0.5,0.5,0.5,0.5,1]],['ToTape6',[0.8,0.2,0.9,0.3,0.6,0.7]],['ToTape6',[0.5,0.5,0.5,0,0.5,1]]];
let bad=0;
for(const [nm,p] of cases){
 cp.execFileSync('./'+nm,['in.f32','out.f32',...p.map(String)]);
 const ref=new Float32Array(fs.readFileSync('out.f32').buffer.slice(0));
 const k=['A','B','C','D','E','F'],o={};p.forEach((v,i)=>o[k[i]]=v);
 const fx=new M['AW'+nm](SR);fx.set(o);
 const oL=new Float64Array(N),oR=new Float64Array(N);
 for(let i=0;i<N;i+=128){const n=Math.min(128,N-i);fx.process(L.subarray(i,i+n),R.subarray(i,i+n),oL.subarray(i,i+n),oR.subarray(i,i+n),n);}
 let md=0,mi=0,pk=0;for(let i=0;i<N;i++){for(const [a,b] of [[oL[i],ref[2*i]],[oR[i],ref[2*i+1]]]){const d=Math.abs(a-b);if(d>md){md=d;mi=i;}pk=Math.max(pk,Math.abs(b));}}
 const ok=md<1e-4;if(!ok)bad++;
 console.log(nm.padEnd(10),JSON.stringify(p).padEnd(28),'maxdiff',md.toExponential(2),'at',mi,'peak',pk.toFixed(3),ok?'OK':'FAIL');
}
process.exit(bad?1:0);
