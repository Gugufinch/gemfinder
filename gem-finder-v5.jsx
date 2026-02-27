import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/* ═══════════════════════════════════════════════════════════
   GEM FINDER v5 — AI-Powered A&R Management System
   + AI Drafts, AI Discovery, Spotify Links, Intel-Driven Outreach
   ═══════════════════════════════════════════════════════════ */

const STAGES = [
  { id: "prospect", label: "Prospect", icon: "◎" },
  { id: "researched", label: "Researched", icon: "◉" },
  { id: "drafted", label: "Draft Ready", icon: "✎" },
  { id: "sent", label: "Sent", icon: "→" },
  { id: "replied", label: "Replied", icon: "←" },
  { id: "won", label: "Won", icon: "★" },
  { id: "dead", label: "Dead", icon: "✕" },
];
const SM = Object.fromEntries(STAGES.map(s => [s.id, s]));

const LT = {
  bg:"#f5f5f7",sf:"#fff",sa:"#f0f0f3",sh:"#fafafa",bd:"#e0e0e6",bl:"#ccccd4",
  tx:"#1a1a2e",ts:"#5c5c72",tt:"#9494a8",
  ac:"#5046e5",al:"#ededff",am:"#7c75f0",at:"#3d35b8",
  gn:"#0f9d58",gb:"#e8f8ef",gd:"#a3e4be",
  bu:"#1a73e8",bb:"#e8f0fe",bd2:"#aecbfa",
  rd:"#d93025",rb:"#fce8e6",rbd:"#f5b7b1",
  ab:"#e37400",abb:"#fef3e0",abd:"#fdd888",
  pr:"#7c3aed",pb:"#f3edff",pbd:"#c9b8f8",
  sw:"0 1px 4px rgba(0,0,0,0.06)",sm:"0 4px 20px rgba(0,0,0,0.07)",cb:"#fff",
};
const DK = {
  bg:"#0c0c14",sf:"#13131f",sa:"#1a1a2a",sh:"#1e1e30",bd:"#28283e",bl:"#35355a",
  tx:"#e8e8f0",ts:"#8888a4",tt:"#5c5c76",
  ac:"#7c75f0",al:"#1e1c3a",am:"#6860e6",at:"#a9a4f7",
  gn:"#34d399",gb:"#0c2a1a",gd:"#166534",
  bu:"#60a5fa",bb:"#0c1a2e",bd2:"#1e3a5f",
  rd:"#f87171",rb:"#2a0c0c",rbd:"#5f1e1e",
  ab:"#fbbf24",abb:"#2a1e0c",abd:"#5f4410",
  pr:"#a78bfa",pb:"#1a0c2e",pbd:"#3d1e6f",
  sw:"0 1px 4px rgba(0,0,0,0.3)",sm:"0 4px 20px rgba(0,0,0,0.4)",cb:"#16162a",
};

function sc(id,C){return{prospect:C.tt,researched:C.ac,drafted:C.ab,sent:C.bu,replied:C.gn,won:C.pr,dead:C.rd}[id]||C.tt}
function sb(id,C){return{prospect:C.sa,researched:C.al,drafted:C.abb,sent:C.bb,replied:C.gb,won:C.pb,dead:C.rb}[id]||C.sa}
function bucketGenre(g){if(!g)return"Other";const l=g.toLowerCase();if(/country|americana|bluegrass/.test(l))return"Country";if(/hip.?hop|rap/.test(l))return"Hip Hop";if(/r&b|soul|neo.?soul/.test(l))return"R&B / Soul";if(/^indie/.test(l))return"Indie";if(/folk/.test(l))return"Folk";if(/punk|emo|hardcore/.test(l))return"Punk / Emo";if(/rock|grunge|metal/.test(l))return"Rock";if(/electronic|edm|house|techno|hyperpop|synth/.test(l))return"Electronic";if(/pop/.test(l))return"Pop";if(/jazz/.test(l))return"Jazz";if(/christian|gospel|worship/.test(l))return"Christian";if(/latin|reggaeton/.test(l))return"Latin";if(/singer.?songwriter/.test(l))return"Singer-Songwriter";if(/^alt/.test(l))return"Alternative";return"Other"}
function parseMl(s){if(!s)return 0;const m=s.replace(/[,\s]/g,"").match(/([\d.]+)(k|m)?/i);if(!m)return 0;let v=parseFloat(m[1]);if(m[2]?.toLowerCase()==="m")v*=1e6;else if(m[2]?.toLowerCase()==="k")v*=1e3;return v}
function fN(n){if(n>=1e6)return(n/1e6).toFixed(1).replace(/\.0$/,"")+"M";if(n>=1e3)return(n/1e3).toFixed(0)+"K";return n.toString()}
function pS(a){let s=0;const ml=parseMl(a.l);if(ml>=5e5)s+=3;else if(ml>=1e5)s+=2;else if(ml>=1e4)s+=1;if(a.e)s+=2;if(a.soc)s+=1;if(/high|known/i.test(a.h))s+=1;return s}
function pT(score,C){if(score>=5)return{label:"HOT",color:C.rd,bg:C.rb,border:C.rbd};if(score>=3)return{label:"WARM",color:C.ab,bg:C.abb,border:C.abd};return{label:"COOL",color:C.tt,bg:C.sa,border:C.bd}}
function rD(iso){if(!iso)return"";const d=Math.floor((new Date()-new Date(iso))/864e5);if(d===0)return"today";if(d===1)return"yesterday";if(d<7)return d+"d ago";if(d<30)return Math.floor(d/7)+"w ago";return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
function sD(iso){if(!iso)return"";return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"})}
function daysBetween(a,b){return Math.floor((new Date(b)-new Date(a))/864e5)}
function spotifyUrl(name){return`https://open.spotify.com/search/${encodeURIComponent(name)}`}

// ═══ AI CALL HELPER ═══
async function aiCall(prompt, maxTokens=1200){
  try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxTokens,messages:[{role:"user",content:prompt}]})});const d=await r.json();const t=d.content?.map(i=>i.type==="text"?i.text:"").filter(Boolean).join("\n")||"No response.";return{ok:true,text:t}}catch(e){return{ok:false,text:"API error: "+e.message}}
}

// ═══ AI INTEL ═══
async function fetchAIIntel(a,bucket){const pri=pS(a);return aiCall(`You are an A&R research analyst helping Greg (Head of Content & Partnerships at Songfinch) evaluate whether to recruit this artist. Songfinch lets fans commission custom songs directly from artists — $50M+ paid out since 2016.

ARTIST: ${a.n}
Genre: ${a.g||"Unknown"} (bucket: ${bucket})
Monthly Listeners: ${a.l||"Unknown"}
Hit Track: ${a.h||"Unknown"}
Social: ${a.ig||"None listed"}
Email: ${a.e?"Has management email":"No email"}
Location: ${a.loc||"Unknown"}
Priority: ${pri>=5?"HOT":pri>=3?"WARM":"COOL"} (${pri}/7)

Use your actual knowledge of this artist if you recognize them. Reference specific songs, career moments, fanbase traits. If you don't recognize them, say so honestly and work with what's provided.

Format (plain text, no markdown headers):

FIT SCORE: [1-10]

WHY THEY FIT: [2-3 specific sentences about THIS artist's fanbase and why they'd buy custom songs]

SUGGESTED ANGLE: [The single best personalized pitch angle — reference their actual work]

TALKING POINTS: [3 bullet points specific to this artist Greg can use in outreach]

RED FLAGS: [Honest concerns or "None obvious"]

SPOTIFY NOTE: [What you know about their Spotify presence — top tracks, listener range, recent releases. If unsure say "Verify on Spotify"]

PRIORITY MOVE: [One specific next action]

Be punchy, honest, specific. Bad fit? Say so.`)}

// ═══ AI DRAFTS ═══
async function generateAIDrafts(a,bucket,intelText){
  const fn=a.n.includes(" ")?a.n.split(" ")[0]:a.n;const hasE=!!a.e;
  const ctx=intelText?`\n\nAI INTEL (use to personalize):\n${intelText}`:"";
  return aiCall(`You are Greg, Head of Content & Partnerships at Songfinch. Write outreach to recruit ${a.n}.

SONGFINCH: Fans pay artists to create one-of-one custom songs. $50M+ paid since 2016. No contracts, no AI, no cost. Artists own 100%, set price, accept only what they want.

ARTIST:
Name: ${a.n} | Genre: ${a.g||"Unknown"} (${bucket}) | Listeners: ${a.l||"Unknown"}
Hit Track: ${a.h||"Unknown"} | Social: ${a.ig||"None"} | Email: ${hasE?"Yes":"No"} | Location: ${a.loc||"Unknown"}${ctx}

Write 3 drafts. Each must feel genuinely personal — reference specific things about this artist. NOT generic templates.

===COLD_DM===
[Instagram/TikTok DM. 3-4 short paragraphs max. Casual, direct. Sound like you actually listen to their music. End with simple question.]

===EMAIL===
[${hasE?"Management email (Hey team,)":"Direct email (Hey "+fn+",")"} Professional but warm. Specific value prop for THIS artist. Sign: Greg, Head of Content & Partnerships, Songfinch, Greg@songfinch.com]

===WARM_INTRO===
[As if you have a mutual or have been following them. Personal, less salesy. Reference specific admiration. Low-pressure CTA. Sign with title + email.]

Each draft should be genuinely DIFFERENT in approach — not same pitch reformatted.`,2000)
}

function parseAIDrafts(text,a){
  const hasE=!!a.e;const sections=text.split(/===(\w+)===/);const drafts=[];
  for(let i=1;i<sections.length;i+=2){const k=sections[i].trim().toLowerCase(),c=(sections[i+1]||"").trim();
    if(k==="cold_dm")drafts.push({key:"cold_dm",label:"Cold DM ✨",sub:"AI-personalized → IG/TikTok",text:c,ai:true});
    else if(k==="email")drafts.push({key:"formal_email",label:hasE?"Mgmt Email ✨":"Direct Email ✨",sub:hasE?(a.e||"Find email"):"Greg@songfinch.com",text:c,ai:true});
    else if(k==="warm_intro")drafts.push({key:"warm_intro",label:"Warm Intro ✨",sub:"AI-personalized warm outreach",text:c,ai:true});
  }
  if(!drafts.length)drafts.push({key:"ai_full",label:"AI Draft ✨",sub:"Full AI output",text,ai:true});
  return drafts;
}

// ═══ QUICK TEMPLATES (instant fallback) ═══
function genQuickDrafts(a,bucket){
  const fn=a.n.includes(" ")?a.n.split(" ")[0]:a.n;
  const ht=a.h&&!/tbd|high|known|rising|low|presence/i.test(a.h)?a.h.split("(")[0].trim():null;
  const hooks={"Country":"the way your songs connect","Hip Hop":"the energy you bring","R&B / Soul":"the emotional depth","Indie":"your sound and fanbase","Pop":"your music and fanbase","Rock":"your sound","Folk":"the intimacy in your writing","Electronic":"the production energy"};
  const hk=hooks[bucket]||"your music";
  const th=ht?`Big fan of "${ht}".`:`Love ${hk}.`;
  return[
    {key:"cold_dm",label:"Cold DM",sub:"Template → hit ✨ for AI upgrade",text:`Hey ${fn}! Greg from Songfinch. ${th}\n\nSongfinch = fans pay artists to create custom songs. $50M+ paid out. No contracts, no AI, no cost. You own 100%.\n\nDown for more info?\n\n— Greg @ Songfinch`,ai:false},
    {key:"formal_email",label:a.e?"Mgmt Email":"Direct Email",sub:"Template → hit ✨ for AI upgrade",text:a.e?`Hey team,\n\nGreg here — Head of Content & Partnerships at Songfinch. ${th}\n\nSongfinch lets fans commission custom songs from artists. $50M+ paid since 2016. No contracts. Artists set price, keep 100%.\n\nWould love 15 mins to walk through it.\n\nGreg\nGreg@songfinch.com`:`Hey ${fn}!\n\nGreg from Songfinch. ${th}\n\nSongfinch = fans pay you to create custom songs. $50M+ paid. No contracts, no cost. You own 100%.\n\nWould love to connect.\n\nGreg\nGreg@songfinch.com`,ai:false},
    {key:"warm_intro",label:"Warm Intro",sub:"Template → hit ✨ for AI upgrade",text:`Hey ${fn}!\n\nGreg from Songfinch — ${ht?`"${ht}" has been on repeat`:"been following your work"} and wanted to reach out.\n\nSongfinch: $50M+ paid to artists since 2016. No contracts, no cost. You set price, own everything.\n\nWould love to walk you through it — no pressure.\n\n— Greg\nHead of Content & Partnerships, Songfinch\nGreg@songfinch.com`,ai:false},
  ];
}

// ═══ AI DISCOVERY ═══
async function discoverArtists(criteria){
  return aiCall(`You are an A&R research assistant for Greg at Songfinch. Find artists matching: ${criteria}

CONTEXT: Songfinch = fans pay artists for custom songs. Best fits: engaged fanbases, active social, genres with emotional/personal connection (country, indie, R&B, folk, pop especially). Sweet spot: 10K-500K monthly listeners. Active recent releases.

Return EXACTLY 8 recommendations. For EACH use this format:

===ARTIST===
NAME: [Full name]
GENRE: [Primary genre]
LISTENERS: [Approximate monthly Spotify listeners or "Verify"]
LOCATION: [City, Country if known]
TOP_TRACK: [Most known/recent notable track]
SOCIAL: [Instagram handle or "Unknown"]
WHY: [2-3 sentences on Songfinch fit — specific fanbase traits, career moment, engagement]

Only recommend artists you're confident exist and are currently active. Skip obvious mainstream. Prioritize hidden gems Greg probably doesn't know.`,3000)
}

function parseDiscovered(text){
  return text.split("===ARTIST===").filter(b=>b.trim()).map(block=>{
    const g=k=>{const m=block.match(new RegExp(`${k}:\\s*(.+?)(?:\\n|$)`));return m?m[1].trim():""};
    return{n:g("NAME"),g:g("GENRE"),l:g("LISTENERS"),loc:g("LOCATION"),h:g("TOP_TRACK"),ig:"",soc:g("SOCIAL").replace(/^@/,""),e:"",s:false,o:"",why:g("WHY")}
  }).filter(a=>a.n)
}

// ═══ ACTIVITY LOG ═══
function addLog(proj,name,action){const logs=proj.activityLog||{};const al=logs[name]||[];al.push({action,time:new Date().toISOString()});return{...logs,[name]:al.slice(-50)}}

// ═══ SMART QUEUE ═══
function buildQueue(enriched){const today=new Date().toISOString().slice(0,10);const items=[];enriched.forEach(a=>{if(a.followUp&&a.followUp<=today&&a.stage!=="won"&&a.stage!=="dead"){const d=daysBetween(a.followUp,today);items.push({type:"overdue",artist:a,priority:10+d,label:`Follow-up overdue ${d}d`,icon:"🔴"})}else if(a.followUp&&a.followUp>today){const d=daysBetween(today,a.followUp);if(d<=3)items.push({type:"upcoming",artist:a,priority:7,label:`Follow-up in ${d}d`,icon:"🟡"})}if(a.priority>=5&&a.stage==="prospect")items.push({type:"hot",artist:a,priority:9,label:"HOT — still in Prospect",icon:"🔥"});if(a.stage==="drafted"){const d=a.stageDate?daysBetween(a.stageDate,today):0;items.push({type:"draft",artist:a,priority:6+Math.min(d,3),label:`Draft ${d}d — send it`,icon:"✎"})}if(a.stage==="sent"&&a.stageDate){const d=daysBetween(a.stageDate,today);if(d>=7)items.push({type:"stale",artist:a,priority:5,label:`Sent ${d}d — no reply`,icon:"⏳"})}if(a.priority>=3&&a.priority<5&&a.stage==="prospect"&&a.e)items.push({type:"warm",artist:a,priority:4,label:"WARM + email — start outreach",icon:"📧"})});return items.sort((a,b)=>b.priority-a.priority).slice(0,20)}

// ═══ STORAGE + CSV ═══
const SK="gemfinder-v5";
async function sGet(k){try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null}catch{return null}}
async function sSet(k,v){try{await window.storage.set(k,JSON.stringify(v))}catch(e){console.error("save:",e)}}
function parseCSV(text){const lines=text.split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return[];const headers=lines[0].split(",").map(h=>h.trim());const results=[],seen=new Set();for(let i=1;i<lines.length;i++){const vals=lines[i].split(",").map(v=>v.trim());const row={};headers.forEach((h,j)=>row[h]=vals[j]||"");const name=row["Artist"]||"";if(!name||seen.has(name))continue;seen.add(name);let email=row["Emaisl"]||row["Email"]||"";if(email&&!email.includes("@"))email="";let soc=row["Social"]||"",igH="";if(soc.startsWith("@")&&!soc.includes("google.com"))igH=soc.replace(/^@/,"");results.push({n:name,g:row["Genre/Vibe"]||"",l:row["Monthly Listeners"]||"",h:row["Hit Track + Streams"]||"",ig:row["IG/TikTok + Followers"]||"",soc:igH,e:email,loc:row["Location"]||"",s:(row["Sent"]||"").toUpperCase()==="TRUE",o:row["Internal User"]||""})}return results}
function exportPipeline(proj,enriched){const rows=[["Artist","Genre","Bucket","Listeners","Hit Track","Email","Social","Stage","Priority","Spotify","Notes","Follow-Up"]];enriched.forEach(a=>{rows.push([a.n,a.g,a.bucket,a.l,a.h,a.e,a.soc,a.stage,pS(a)>=5?"HOT":pS(a)>=3?"WARM":"COOL",spotifyUrl(a.n),(a.note||"").replace(/,/g,";"),a.followUp||""])});const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`${proj.name.replace(/\s+/g,"_")}_pipeline.csv`;link.click();URL.revokeObjectURL(url)}

export default function App(){
  const[dark,setDark]=useState(false),[projects,setProjects]=useState([]),[apId,setApId]=useState(null),[screen,setScreen]=useState("hub"),[loading,setLoading]=useState(true),[toast,setToast]=useState(null);
  const fr=useRef(null);
  const[search,setSearch]=useState(""),[gf,setGf]=useState("All"),[sf,setSf]=useState("all"),[pf,setPf]=useState("all"),[sortBy,setSortBy]=useState("priority");
  const[selA,setSelA]=useState(null),[draftTab,setDraftTab]=useState(0),[drafts,setDrafts]=useState([]),[copied,setCopied]=useState(null);
  const[aNote,setANote]=useState(""),[aFU,setAFU]=useState(""),[showNew,setShowNew]=useState(false),[npN,setNpN]=useState(""),[npD,setNpD]=useState("");
  const[batch,setBatch]=useState(false),[bSel,setBSel]=useState(new Set()),[showFunnel,setShowFunnel]=useState(false);
  const[viewMode,setViewMode]=useState("list"),[intel,setIntel]=useState(null),[intelLoading,setIntelLoading]=useState(false);
  const[showLog,setShowLog]=useState(false),[showQueue,setShowQueue]=useState(false);
  const[aiDraftLoading,setAiDraftLoading]=useState(false),[draftMode,setDraftMode]=useState("template"); // "template" or "ai"
  const[showDiscover,setShowDiscover]=useState(false),[discQuery,setDiscQuery]=useState(""),[discResults,setDiscResults]=useState([]),[discLoading,setDiscLoading]=useState(false);

  const C=dark?DK:LT;
  const ft="'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
  const mn="'JetBrains Mono','Fira Code','SF Mono',monospace";
  const mkP=(a,cl,bg)=>({padding:"5px 14px",borderRadius:20,fontSize:12,fontWeight:a?600:400,border:`1.5px solid ${a?cl:C.bd}`,cursor:"pointer",fontFamily:ft,background:a?bg:"transparent",color:a?cl:C.ts,transition:"all 0.15s",whiteSpace:"nowrap"});
  const iS={padding:"8px 14px",border:`1.5px solid ${C.bd}`,borderRadius:10,fontSize:13,fontFamily:ft,outline:"none",color:C.tx,background:C.sa,boxSizing:"border-box"};
  const cS={background:C.cb,border:`1.5px solid ${C.bd}`,borderRadius:14,boxShadow:C.sw};
  const css=`@keyframes si{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}input[type="file"]{display:none}::selection{background:${C.ac}33}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:3px}`;

  useEffect(()=>{(async()=>{const d=await sGet(SK);if(d?.projects){setProjects(d.projects);if(d.lastActive)setApId(d.lastActive);if(d.dark)setDark(d.dark);if(d.viewMode)setViewMode(d.viewMode)}setLoading(false)})()},[]);
  const persist=useCallback(async(np,la,dk,vm)=>{await sSet(SK,{projects:np||projects,lastActive:la!==undefined?la:apId,dark:dk!==undefined?dk:dark,viewMode:vm!==undefined?vm:viewMode})},[projects,apId,dark,viewMode]);
  const flash=(m,t="ok")=>{setToast({m,t});setTimeout(()=>setToast(null),2500)};
  const togDark=async()=>{const nd=!dark;setDark(nd);await persist(undefined,undefined,nd)};
  const setView=async v=>{setViewMode(v);await persist(undefined,undefined,undefined,v)};
  const proj=projects.find(p=>p.id===apId);

  const createProj=async(name,desc)=>{const id="p_"+Date.now();const np={id,name,desc,artists:[],pipeline:{},notes:{},followUps:{},activityLog:{},created:new Date().toISOString()};const u=[...projects,np];setProjects(u);setApId(id);setScreen("project");setShowNew(false);setNpN("");setNpD("");await persist(u,id);flash(`Created "${name}"`)};
  const importCSV=async e=>{const f=e.target.files?.[0];if(!f||!proj)return;const t=await f.text();const p=parseCSV(t);if(!p.length){flash("No valid artists","err");return}const ex=new Set(proj.artists.map(a=>a.n));const nw=p.filter(a=>!ex.has(a.n));const mg=[...proj.artists,...nw];const nl={...proj.pipeline};nw.forEach(a=>{if(a.s&&!nl[a.n])nl[a.n]={stage:"sent",date:new Date().toISOString()}});const u=projects.map(pp=>pp.id===proj.id?{...pp,artists:mg,pipeline:nl}:pp);setProjects(u);await persist(u);flash(`+${nw.length} artists (${p.length-nw.length} dupes skipped)`);e.target.value=""};
  const setSt=async(n,sid)=>{if(!proj)return;const nl={...proj.pipeline,[n]:{...(proj.pipeline[n]||{}),stage:sid,date:new Date().toISOString()}};const al=addLog(proj,n,`Stage → ${SM[sid]?.label}`);const u=projects.map(p=>p.id===proj.id?{...p,pipeline:nl,activityLog:al}:p);setProjects(u);await persist(u);flash(`${n} → ${SM[sid]?.label}`)};
  const batchSt=async sid=>{if(!proj||bSel.size===0)return;const nl={...proj.pipeline};let al=proj.activityLog||{};bSel.forEach(n=>{nl[n]={...(nl[n]||{}),stage:sid,date:new Date().toISOString()};const logs=al[n]||[];logs.push({action:`Batch → ${SM[sid]?.label}`,time:new Date().toISOString()});al={...al,[n]:logs.slice(-50)}});const u=projects.map(p=>p.id===proj.id?{...p,pipeline:nl,activityLog:al}:p);setProjects(u);await persist(u);flash(`Moved ${bSel.size} → ${SM[sid]?.label}`);setBSel(new Set());setBatch(false)};
  const saveN=async(n,note)=>{if(!proj)return;const al=addLog(proj,n,"Note updated");const u=projects.map(p=>p.id===proj.id?{...p,notes:{...p.notes,[n]:note},activityLog:al}:p);setProjects(u);await persist(u)};
  const saveFU=async(n,d)=>{if(!proj)return;const al=addLog(proj,n,d?`Follow-up: ${sD(d)}`:"Follow-up cleared");const u=projects.map(p=>p.id===proj.id?{...p,followUps:{...p.followUps,[n]:d},activityLog:al}:p);setProjects(u);await persist(u);flash(d?`Follow-up: ${sD(d)}`:"Cleared")};
  const cp=(text,key)=>{try{const el=document.createElement("textarea");el.value=text;el.style.cssText="position:fixed;top:-9999px";document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el)}catch{navigator.clipboard?.writeText(text).catch(()=>{})}setCopied(key);setTimeout(()=>setCopied(null),1800);if(proj&&selA){const al=addLog(proj,selA.n,`Copied ${key} draft`);const u=projects.map(p=>p.id===proj.id?{...p,activityLog:al}:p);setProjects(u);persist(u)}};

  const openA=a=>{setSelA(a);const b=bucketGenre(a.g);setDrafts(genQuickDrafts(a,b));setDraftTab(0);setDraftMode("template");setANote(proj?.notes?.[a.n]||"");setAFU(proj?.followUps?.[a.n]||"");setIntel(null);setShowLog(false);setScreen("detail")};

  const runIntel=async a=>{setIntelLoading(true);setIntel(null);const result=await fetchAIIntel(a,bucketGenre(a.g));setIntel(result);setIntelLoading(false);if(proj){const al=addLog(proj,a.n,"AI Intel generated");const u=projects.map(p=>p.id===proj.id?{...p,activityLog:al}:p);setProjects(u);persist(u)}};

  const runAIDrafts=async a=>{setAiDraftLoading(true);const bucket=bucketGenre(a.g);const result=await generateAIDrafts(a,bucket,intel?.ok?intel.text:null);if(result.ok){const parsed=parseAIDrafts(result.text,a);setDrafts(parsed);setDraftTab(0);setDraftMode("ai");flash("AI drafts generated")}else{flash("Draft generation failed","err")}setAiDraftLoading(false);if(proj){const al=addLog(proj,a.n,"AI drafts generated");const u=projects.map(p=>p.id===proj.id?{...p,activityLog:al}:p);setProjects(u);persist(u)}};

  const switchToTemplates=a=>{setDrafts(genQuickDrafts(a,bucketGenre(a.g)));setDraftTab(0);setDraftMode("template")};

  const runDiscover=async()=>{if(!discQuery.trim())return;setDiscLoading(true);setDiscResults([]);const r=await discoverArtists(discQuery);if(r.ok){const artists=parseDiscovered(r.text);setDiscResults(artists);if(!artists.length)flash("No artists parsed — try different criteria","err")}else flash("Discovery failed","err");setDiscLoading(false)};

  const addDiscovered=async a=>{if(!proj)return;const ex=new Set(proj.artists.map(x=>x.n));if(ex.has(a.n)){flash(`${a.n} already in project`,"err");return}const u=projects.map(p=>p.id===proj.id?{...p,artists:[...p.artists,{n:a.n,g:a.g,l:a.l,h:a.h,ig:a.ig||"",soc:a.soc||"",e:a.e||"",loc:a.loc||"",s:false,o:"AI Discovery"}]}:p);setProjects(u);await persist(u);flash(`Added ${a.n}`)};

  const enriched=useMemo(()=>{if(!proj)return[];return proj.artists.map(a=>({...a,bucket:bucketGenre(a.g),priority:pS(a),stage:proj.pipeline[a.n]?.stage||"prospect",stageDate:proj.pipeline[a.n]?.date||null,note:proj.notes?.[a.n]||"",followUp:proj.followUps?.[a.n]||""}))},[proj]);
  const gBuckets=useMemo(()=>{const c={};enriched.forEach(a=>{c[a.bucket]=(c[a.bucket]||0)+1});return Object.entries(c).sort((a,b)=>b[1]-a[1])},[enriched]);
  const filtered=useMemo(()=>{let l=enriched;if(search){const q=search.toLowerCase();l=l.filter(a=>a.n.toLowerCase().includes(q)||a.g.toLowerCase().includes(q)||(a.h||"").toLowerCase().includes(q))}if(gf!=="All")l=l.filter(a=>a.bucket===gf);if(sf!=="all")l=l.filter(a=>a.stage===sf);if(pf!=="all")l=l.filter(a=>pT(a.priority,C).label===pf);if(sortBy==="priority")l=[...l].sort((a,b)=>b.priority-a.priority);else if(sortBy==="name")l=[...l].sort((a,b)=>a.n.localeCompare(b.n));else if(sortBy==="listeners")l=[...l].sort((a,b)=>parseMl(b.l)-parseMl(a.l));else if(sortBy==="recent")l=[...l].sort((a,b)=>(b.stageDate||"").localeCompare(a.stageDate||""));return l},[enriched,search,gf,sf,pf,sortBy,C]);
  const stCounts=useMemo(()=>{const c={};STAGES.forEach(s=>c[s.id]=0);enriched.forEach(a=>{c[a.stage]=(c[a.stage]||0)+1});return c},[enriched]);
  const funnel=useMemo(()=>{const t=enriched.length||1;const ct=(stCounts.sent||0)+(stCounts.replied||0)+(stCounts.won||0);const rp=(stCounts.replied||0)+(stCounts.won||0);const w=stCounts.won||0;return[{l:"Total",c:enriched.length,p:100},{l:"Contacted",c:ct,p:Math.round(ct/t*100)},{l:"Replied",c:rp,p:Math.round(rp/t*100)},{l:"Won",c:w,p:Math.round(w/t*100)}]},[enriched,stCounts]);
  const queue=useMemo(()=>buildQueue(enriched),[enriched]);

  const Toast=()=>toast?(<div style={{position:"fixed",top:20,right:20,zIndex:999,background:toast.t==="err"?C.rb:C.sf,border:`1px solid ${toast.t==="err"?C.rbd:C.bd}`,borderRadius:12,padding:"10px 20px",boxShadow:C.sm,fontSize:13,color:toast.t==="err"?C.rd:C.tx,fontFamily:ft,animation:"si 0.2s ease"}}>{toast.t==="err"?"✕ ":"✓ "}{toast.m}</div>):null;
  const DkBtn=()=>(<button onClick={togDark} title={dark?"Light":"Dark"} style={{background:C.sa,border:`1.5px solid ${C.bd}`,width:36,height:36,borderRadius:10,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",color:C.ts,flexShrink:0}}>{dark?"☀":"☾"}</button>);

  if(loading)return(<div style={{fontFamily:ft,background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:C.ts}}><style>{css}</style><div style={{textAlign:"center"}}><div style={{fontSize:11,fontWeight:700,letterSpacing:4,color:C.ac,textTransform:"uppercase",marginBottom:6}}>Gem Finder v5</div><div style={{fontSize:13,color:C.tt}}>Loading...</div></div></div>);

  // ═══ HUB ═══
  if(screen==="hub")return(
    <div style={{fontFamily:ft,background:C.bg,minHeight:"100vh",color:C.tx}}>
      <Toast/><style>{css}</style>
      <div style={{borderBottom:`1px solid ${C.bd}`,background:C.sf}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"24px 24px 20px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:5,color:C.ac,textTransform:"uppercase",marginBottom:4}}>Gem Finder v5</div>
            <div style={{fontSize:26,fontWeight:800,letterSpacing:"-0.03em"}}>AI-Powered A&R</div>
            <div style={{fontSize:13,color:C.ts,marginTop:3}}>Artist outreach with AI intel, personalized drafts, and discovery.</div>
          </div>
          <DkBtn/>
        </div>
      </div>
      <div style={{maxWidth:960,margin:"0 auto",padding:"28px 24px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
          {projects.map((p,i)=>{const ac=p.artists?.length||0,pl=p.pipeline||{},sent=Object.values(pl).filter(v=>["sent","replied","won"].includes(v.stage)).length,replied=Object.values(pl).filter(v=>["replied","won"].includes(v.stage)).length,won=Object.values(pl).filter(v=>v.stage==="won").length;
            return(<div key={p.id} onClick={()=>{setApId(p.id);setScreen("project");setSearch("");setGf("All");setSf("all");setPf("all");persist(projects,p.id)}}
              style={{...cS,padding:"22px 24px",cursor:"pointer",transition:"all 0.2s",animation:`fu 0.3s ease ${i*0.06}s both`}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.ac;e.currentTarget.style.boxShadow=C.sm}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.bd;e.currentTarget.style.boxShadow=C.sw}}>
              <div style={{fontSize:17,fontWeight:700,marginBottom:3}}>{p.name}</div>
              {p.desc&&<div style={{fontSize:12,color:C.ts,marginBottom:12,lineHeight:1.5}}>{p.desc}</div>}
              <div style={{display:"flex",gap:16,fontSize:12,color:C.ts}}>
                <span><strong style={{color:C.tx}}>{ac}</strong> artists</span>
                <span><strong style={{color:C.bu}}>{sent}</strong> sent</span>
                <span><strong style={{color:C.gn}}>{replied}</strong> replied</span>
                {won>0&&<span><strong style={{color:C.pr}}>{won}</strong> won</span>}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
                <span style={{fontSize:11,color:C.tt}}>Created {sD(p.created)}</span>
                <button onClick={e=>{e.stopPropagation();if(confirm(`Delete "${p.name}"?`)){const u=projects.filter(pp=>pp.id!==p.id);setProjects(u);if(apId===p.id)setApId(null);persist(u,null);flash("Deleted")}}} style={{fontSize:11,color:C.tt,background:"none",border:"none",cursor:"pointer",fontFamily:ft}}>✕</button>
              </div>
            </div>)})}
          <div onClick={()=>setShowNew(true)} style={{background:C.sa,border:`2px dashed ${C.bd}`,borderRadius:14,padding:"22px 24px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:140,transition:"all 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=C.ac;e.currentTarget.style.background=C.al}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.bd;e.currentTarget.style.background=C.sa}}>
            <div style={{fontSize:28,color:C.tt,marginBottom:6}}>+</div>
            <div style={{fontSize:13,fontWeight:600,color:C.ts}}>New Project</div>
          </div>
        </div>
        {showNew&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}} onClick={e=>{if(e.target===e.currentTarget)setShowNew(false)}}>
          <div style={{background:C.sf,borderRadius:18,padding:"28px 32px",width:420,boxShadow:"0 25px 70px rgba(0,0,0,0.2)"}}>
            <div style={{fontSize:18,fontWeight:700,marginBottom:16,color:C.tx}}>New Project</div>
            <input placeholder='Project name' value={npN} onChange={e=>setNpN(e.target.value)} autoFocus style={{...iS,width:"100%",marginBottom:10}}/>
            <input placeholder="Description (optional)" value={npD} onChange={e=>setNpD(e.target.value)} style={{...iS,width:"100%",marginBottom:18,fontSize:12}}/>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setShowNew(false)} style={{padding:"8px 18px",borderRadius:10,border:`1px solid ${C.bd}`,background:"transparent",cursor:"pointer",fontSize:13,fontFamily:ft,color:C.ts}}>Cancel</button>
              <button onClick={()=>{if(npN.trim())createProj(npN.trim(),npD.trim())}} style={{padding:"8px 24px",borderRadius:10,border:"none",background:C.ac,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:ft,opacity:npN.trim()?1:0.4}}>Create</button>
            </div>
          </div>
        </div>)}
      </div>
    </div>
  );

  // ═══ DETAIL ═══
  if(screen==="detail"&&selA){
    const a=selA,bucket=bucketGenre(a.g),pri=pS(a),pt=pT(pri,C),stage=proj?.pipeline?.[a.n]?.stage||"prospect";
    const logs=(proj?.activityLog||{})[a.n]||[];
    return(
    <div style={{fontFamily:ft,background:C.bg,minHeight:"100vh",color:C.tx}}>
      <Toast/><style>{css}</style>
      <div style={{borderBottom:`1px solid ${C.bd}`,background:C.sf}}>
        <div style={{maxWidth:900,margin:"0 auto",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <button onClick={()=>{setScreen("project");setSelA(null)}} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontFamily:ft,color:C.ac,fontWeight:600}}>← Pipeline</button>
          <DkBtn/>
        </div>
      </div>
      <div style={{maxWidth:900,margin:"0 auto",padding:"24px",animation:"fu 0.25s ease"}}>
        {/* HEADER */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:20}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              <span style={{fontSize:24,fontWeight:800,letterSpacing:"-0.02em"}}>{a.n}</span>
              <span style={{...mkP(true,pt.color,pt.bg),fontSize:11}}>{pt.label}</span>
            </div>
            <div style={{display:"flex",gap:12,fontSize:12,color:C.ts,flexWrap:"wrap",alignItems:"center"}}>
              {a.g&&<span>{a.g}</span>}
              {a.l&&<span>🎧 {a.l}</span>}
              {a.loc&&<span>📍 {a.loc}</span>}
              <a href={spotifyUrl(a.n)} target="_blank" rel="noopener" style={{color:C.gn,textDecoration:"none",fontWeight:600,fontSize:11,padding:"2px 10px",background:C.gb,borderRadius:12,border:`1px solid ${C.gd}`}}>🎵 Spotify</a>
              {a.soc&&<a href={`https://instagram.com/${a.soc}`} target="_blank" rel="noopener" style={{color:C.pr,textDecoration:"none",fontSize:11,fontWeight:600,padding:"2px 10px",background:C.pb,borderRadius:12,border:`1px solid ${C.pbd}`}}>📷 @{a.soc}</a>}
            </div>
            {a.h&&<div style={{fontSize:12,color:C.ts,marginTop:6}}>🎵 {a.h}</div>}
            {a.e&&<div style={{fontSize:12,color:C.ts,marginTop:3}}>✉ {a.e}</div>}
          </div>
        </div>

        {/* STAGE PILLS */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:24}}>
          {STAGES.map(s=>(<button key={s.id} onClick={()=>setSt(a.n,s.id)} style={{...mkP(stage===s.id,sc(s.id,C),sb(s.id,C)),fontSize:11}}>{s.icon} {s.label}</button>))}
        </div>

        {/* AI INTEL */}
        <div style={{...cS,padding:"20px 24px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:intel?12:0}}>
            <div style={{fontSize:14,fontWeight:700}}>🧠 AI Intel</div>
            <button onClick={()=>runIntel(a)} disabled={intelLoading} style={{padding:"6px 16px",borderRadius:10,border:`1.5px solid ${C.ac}`,background:intelLoading?C.sa:C.al,color:C.ac,cursor:intelLoading?"wait":"pointer",fontSize:12,fontWeight:600,fontFamily:ft}}>{intelLoading?"Analyzing...":intel?"Re-analyze":"Analyze Artist"}</button>
          </div>
          {intelLoading&&<div style={{fontSize:12,color:C.ts,padding:"12px 0"}}>🔄 Running AI analysis on {a.n}...</div>}
          {intel&&<div style={{fontSize:13,lineHeight:1.7,color:C.tx,whiteSpace:"pre-wrap",padding:"12px 16px",background:C.sa,borderRadius:10,marginTop:8,border:`1px solid ${C.bd}`}}>{intel.text}</div>}
        </div>

        {/* DRAFTS */}
        <div style={{...cS,padding:"20px 24px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:700}}>✉ Outreach Drafts</div>
            <div style={{display:"flex",gap:6}}>
              {draftMode==="ai"?(<button onClick={()=>switchToTemplates(a)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${C.bd}`,background:"transparent",color:C.ts,cursor:"pointer",fontSize:11,fontFamily:ft}}>Templates</button>)
              :(<button onClick={()=>runAIDrafts(a)} disabled={aiDraftLoading} style={{padding:"5px 12px",borderRadius:8,border:`1.5px solid ${C.pr}`,background:aiDraftLoading?C.sa:C.pb,color:C.pr,cursor:aiDraftLoading?"wait":"pointer",fontSize:11,fontWeight:600,fontFamily:ft}}>✨ {aiDraftLoading?"Generating...":"AI Personalize"}</button>)}
            </div>
          </div>
          {aiDraftLoading&&<div style={{fontSize:12,color:C.ts,padding:"8px 0"}}>🔄 Writing personalized drafts{intel?.ok?" using intel context":""}...</div>}
          {/* TAB BAR */}
          <div style={{display:"flex",gap:4,marginBottom:12,borderBottom:`1px solid ${C.bd}`,paddingBottom:8}}>
            {drafts.map((d,i)=>(<button key={d.key} onClick={()=>setDraftTab(i)} style={{padding:"6px 14px",borderRadius:"8px 8px 0 0",border:"none",background:draftTab===i?C.ac:"transparent",color:draftTab===i?"#fff":C.ts,cursor:"pointer",fontSize:12,fontWeight:draftTab===i?600:400,fontFamily:ft,transition:"all 0.15s"}}>{d.label}</button>))}
          </div>
          {drafts[draftTab]&&(<div>
            <div style={{fontSize:11,color:C.ts,marginBottom:8}}>{drafts[draftTab].sub}</div>
            <textarea value={drafts[draftTab].text} onChange={e=>{const nd=[...drafts];nd[draftTab]={...nd[draftTab],text:e.target.value};setDrafts(nd)}} style={{...iS,width:"100%",minHeight:200,lineHeight:1.65,fontSize:13,resize:"vertical",boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
              <button onClick={()=>cp(drafts[draftTab].text,drafts[draftTab].key)} style={{padding:"7px 20px",borderRadius:10,border:"none",background:copied===drafts[draftTab].key?C.gn:C.ac,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:ft,transition:"all 0.2s"}}>{copied===drafts[draftTab].key?"Copied ✓":"Copy"}</button>
              {draftMode==="template"&&<span style={{fontSize:11,color:C.tt}}>💡 Hit "AI Personalize" above for a custom version{intel?.ok?" (will use intel data)":""}</span>}
              {draftMode==="ai"&&<span style={{fontSize:11,color:C.pr}}>✨ AI-generated — edit freely</span>}
            </div>
          </div>)}
        </div>

        {/* NOTES + FOLLOW-UP */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          <div style={{...cS,padding:"16px 20px"}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📝 Notes</div>
            <textarea value={aNote} onChange={e=>setANote(e.target.value)} onBlur={()=>saveN(a.n,aNote)} placeholder="Add notes..." style={{...iS,width:"100%",minHeight:80,fontSize:12,resize:"vertical",boxSizing:"border-box"}}/>
          </div>
          <div style={{...cS,padding:"16px 20px"}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>📅 Follow-Up</div>
            <input type="date" value={aFU} onChange={e=>{setAFU(e.target.value);saveFU(a.n,e.target.value)}} style={{...iS,width:"100%",boxSizing:"border-box"}}/>
            {aFU&&<button onClick={()=>{setAFU("");saveFU(a.n,"")}} style={{fontSize:11,color:C.rd,background:"none",border:"none",cursor:"pointer",marginTop:6,fontFamily:ft}}>Clear follow-up</button>}
          </div>
        </div>

        {/* ACTIVITY LOG */}
        <div style={{...cS,padding:"16px 20px"}}>
          <button onClick={()=>setShowLog(!showLog)} style={{fontSize:13,fontWeight:700,background:"none",border:"none",cursor:"pointer",color:C.tx,fontFamily:ft,width:"100%",textAlign:"left",padding:0}}>📋 Activity Log ({logs.length}) {showLog?"▾":"▸"}</button>
          {showLog&&logs.length>0&&(<div style={{marginTop:10,maxHeight:240,overflowY:"auto"}}>
            {[...logs].reverse().map((l,i)=>(<div key={i} style={{fontSize:11,color:C.ts,padding:"4px 0",borderBottom:i<logs.length-1?`1px solid ${C.sa}`:"none"}}>
              <span style={{color:C.tt,fontFamily:mn}}>{new Date(l.time).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</span> — {l.action}
            </div>))}
          </div>)}
          {showLog&&logs.length===0&&<div style={{fontSize:12,color:C.tt,marginTop:8}}>No activity yet.</div>}
        </div>
      </div>
    </div>)
  }

  // ═══ PROJECT ═══
  if(screen==="project"&&proj)return(
    <div style={{fontFamily:ft,background:C.bg,minHeight:"100vh",color:C.tx}}>
      <Toast/><style>{css}</style>
      {/* HEADER */}
      <div style={{borderBottom:`1px solid ${C.bd}`,background:C.sf}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"16px 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
            <div>
              <button onClick={()=>{setScreen("hub");setSearch("");setGf("All");setSf("all");setPf("all")}} style={{fontSize:11,color:C.ac,background:"none",border:"none",cursor:"pointer",fontFamily:ft,fontWeight:600,padding:0,marginBottom:4}}>← Projects</button>
              <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.02em"}}>{proj.name}</div>
              <div style={{fontSize:12,color:C.ts,marginTop:2}}>{enriched.length} artists · {stCounts.sent+stCounts.replied+stCounts.won} contacted · {stCounts.won} won</div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <button onClick={()=>setShowDiscover(true)} style={{padding:"7px 16px",borderRadius:10,border:`1.5px solid ${C.pr}`,background:C.pb,color:C.pr,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:ft}}>🔍 AI Discover</button>
              <button onClick={()=>setShowQueue(!showQueue)} style={{padding:"7px 14px",borderRadius:10,border:`1.5px solid ${C.ab}`,background:queue.length?C.abb:"transparent",color:C.ab,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:ft}}>🎯 Queue {queue.length>0&&`(${queue.length})`}</button>
              <button onClick={()=>setShowFunnel(!showFunnel)} style={{padding:"7px 14px",borderRadius:10,border:`1.5px solid ${C.bd}`,background:"transparent",color:C.ts,cursor:"pointer",fontSize:12,fontFamily:ft}}>📊</button>
              <label style={{padding:"7px 14px",borderRadius:10,border:`1.5px solid ${C.bd}`,background:"transparent",color:C.ts,cursor:"pointer",fontSize:12,fontFamily:ft}}>Import CSV<input type="file" accept=".csv" ref={fr} onChange={importCSV}/></label>
              <button onClick={()=>exportPipeline(proj,enriched)} style={{padding:"7px 14px",borderRadius:10,border:`1.5px solid ${C.bd}`,background:"transparent",color:C.ts,cursor:"pointer",fontSize:12,fontFamily:ft}}>Export</button>
              <DkBtn/>
            </div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"16px 24px"}}>
        {/* FUNNEL */}
        {showFunnel&&(<div style={{...cS,padding:"18px 24px",marginBottom:16,animation:"si 0.2s ease"}}>
          <div style={{display:"flex",gap:16,alignItems:"flex-end"}}>
            {funnel.map((f,i)=>(<div key={i} style={{flex:1,textAlign:"center"}}>
              <div style={{height:80,display:"flex",alignItems:"flex-end",justifyContent:"center",marginBottom:6}}>
                <div style={{width:"100%",maxWidth:80,height:Math.max(6,f.p*0.7),background:i===3?C.gn:i===0?C.ac:C.am,borderRadius:"6px 6px 0 0",transition:"height 0.4s"}}/>
              </div>
              <div style={{fontSize:20,fontWeight:800,color:C.tx}}>{f.c}</div>
              <div style={{fontSize:11,color:C.ts}}>{f.l}</div>
              {i>0&&<div style={{fontSize:10,color:C.tt}}>{f.p}%</div>}
            </div>))}
          </div>
        </div>)}

        {/* QUEUE */}
        {showQueue&&queue.length>0&&(<div style={{...cS,padding:"16px 20px",marginBottom:16,animation:"si 0.2s ease"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>🎯 Smart Queue — Top Actions</div>
          <div style={{display:"grid",gap:6}}>
            {queue.slice(0,10).map((q,i)=>(<div key={i} onClick={()=>openA(q.artist)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,background:C.sa,cursor:"pointer",fontSize:12,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=C.sh} onMouseLeave={e=>e.currentTarget.style.background=C.sa}>
              <span style={{fontSize:14}}>{q.icon}</span>
              <span style={{fontWeight:600,minWidth:120}}>{q.artist.n}</span>
              <span style={{color:C.ts,flex:1}}>{q.label}</span>
              <span style={{...mkP(true,sc(q.artist.stage,C),sb(q.artist.stage,C)),fontSize:10,padding:"2px 8px"}}>{SM[q.artist.stage]?.label}</span>
            </div>))}
          </div>
        </div>)}

        {/* DISCOVERY MODAL */}
        {showDiscover&&(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}} onClick={e=>{if(e.target===e.currentTarget)setShowDiscover(false)}}>
          <div style={{background:C.sf,borderRadius:18,padding:"28px 32px",width:640,maxHeight:"80vh",overflow:"auto",boxShadow:"0 25px 70px rgba(0,0,0,0.25)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:700}}>🔍 AI Artist Discovery</div>
              <button onClick={()=>setShowDiscover(false)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:C.ts}}>✕</button>
            </div>
            <div style={{fontSize:12,color:C.ts,marginBottom:12}}>Describe what you're looking for — genre, location, listener range, vibe, career stage, etc.</div>
            <textarea value={discQuery} onChange={e=>setDiscQuery(e.target.value)} placeholder='e.g. "Chicago indie artists, 10K-100K listeners, released in last year, strong IG presence"' style={{...iS,width:"100%",minHeight:60,fontSize:13,resize:"vertical",boxSizing:"border-box",marginBottom:12}}/>
            <button onClick={runDiscover} disabled={discLoading||!discQuery.trim()} style={{padding:"8px 24px",borderRadius:10,border:"none",background:discLoading?C.sa:C.pr,color:"#fff",cursor:discLoading?"wait":"pointer",fontSize:13,fontWeight:600,fontFamily:ft,marginBottom:16}}>{discLoading?"🔄 Discovering...":"Discover Artists"}</button>
            
            {discResults.length>0&&(<div>
              <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>{discResults.length} artists found</div>
              {discResults.map((da,i)=>(<div key={i} style={{padding:"14px 16px",background:C.sa,borderRadius:10,marginBottom:8,border:`1px solid ${C.bd}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:15,fontWeight:700}}>{da.n}</span>
                      <a href={spotifyUrl(da.n)} target="_blank" rel="noopener" style={{fontSize:10,color:C.gn,background:C.gb,padding:"1px 8px",borderRadius:8,textDecoration:"none",fontWeight:600,border:`1px solid ${C.gd}`}}>Spotify</a>
                    </div>
                    <div style={{fontSize:12,color:C.ts,marginTop:3}}>{da.g} · {da.l} listeners{da.loc?` · ${da.loc}`:""}</div>
                    {da.h&&<div style={{fontSize:11,color:C.ts,marginTop:2}}>🎵 {da.h}</div>}
                    {da.why&&<div style={{fontSize:12,color:C.tx,marginTop:6,lineHeight:1.5}}>{da.why}</div>}
                  </div>
                  <button onClick={()=>addDiscovered(da)} style={{padding:"5px 14px",borderRadius:8,border:`1.5px solid ${C.gn}`,background:C.gb,color:C.gn,cursor:"pointer",fontSize:11,fontWeight:600,fontFamily:ft,flexShrink:0}}>+ Add</button>
                </div>
              </div>))}
            </div>)}
          </div>
        </div>)}

        {/* FILTERS + VIEWS */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
          <input placeholder="Search artists..." value={search} onChange={e=>setSearch(e.target.value)} style={{...iS,width:220}}/>
          <div style={{display:"flex",gap:2,background:C.sa,borderRadius:10,padding:3,border:`1px solid ${C.bd}`}}>
            {[["list","☰"],["kanban","▦"],["table","▤"]].map(([v,ic])=>(<button key={v} onClick={()=>setView(v)} style={{padding:"5px 12px",borderRadius:8,border:"none",background:viewMode===v?C.ac:"transparent",color:viewMode===v?"#fff":C.ts,cursor:"pointer",fontSize:13,fontFamily:ft}}>{ic}</button>))}
          </div>
          {batch&&<div style={{display:"flex",gap:4}}>{STAGES.map(s=>(<button key={s.id} onClick={()=>batchSt(s.id)} style={{...mkP(false,sc(s.id,C),sb(s.id,C)),fontSize:10,padding:"3px 8px"}}>{s.icon}</button>))}</div>}
          <button onClick={()=>{setBatch(!batch);setBSel(new Set())}} style={{...mkP(batch,C.ab,C.abb),fontSize:11}}>Batch</button>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...iS,padding:"6px 10px",fontSize:12}}>
            <option value="priority">Sort: Priority</option><option value="name">Sort: Name</option><option value="listeners">Sort: Listeners</option><option value="recent">Sort: Recent</option>
          </select>
        </div>

        {/* STAGE PILLS */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
          <button onClick={()=>setSf("all")} style={mkP(sf==="all",C.ac,C.al)}>All {enriched.length}</button>
          {STAGES.map(s=>stCounts[s.id]>0&&<button key={s.id} onClick={()=>setSf(s.id)} style={mkP(sf===s.id,sc(s.id,C),sb(s.id,C))}>{s.icon} {s.label} {stCounts[s.id]}</button>)}
        </div>
        {/* GENRE PILLS */}
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
          <button onClick={()=>setGf("All")} style={mkP(gf==="All",C.ac,C.al)}>All Genres</button>
          {gBuckets.slice(0,12).map(([b,c])=>(<button key={b} onClick={()=>setGf(gf===b?"All":b)} style={mkP(gf===b,C.ac,C.al)}>{b} {c}</button>))}
        </div>
        {/* PRIORITY PILLS */}
        <div style={{display:"flex",gap:4,marginBottom:16}}>
          <button onClick={()=>setPf("all")} style={mkP(pf==="all",C.ac,C.al)}>All Priority</button>
          {["HOT","WARM","COOL"].map(p=>(<button key={p} onClick={()=>setPf(pf===p?"all":p)} style={mkP(pf===p,p==="HOT"?C.rd:p==="WARM"?C.ab:C.tt,p==="HOT"?C.rb:p==="WARM"?C.abb:C.sa)}>{p}</button>))}
        </div>

        <div style={{fontSize:12,color:C.tt,marginBottom:12}}>{filtered.length} artist{filtered.length!==1?"s":""}</div>

        {/* ═══ LIST VIEW ═══ */}
        {viewMode==="list"&&(<div style={{display:"grid",gap:8}}>
          {filtered.slice(0,200).map((a,i)=>{const pt2=pT(a.priority,C);return(
            <div key={a.n} onClick={()=>{if(batch){const ns=new Set(bSel);ns.has(a.n)?ns.delete(a.n):ns.add(a.n);setBSel(ns)}else openA(a)}}
              style={{...cS,padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:14,transition:"all 0.15s",animation:`fu 0.2s ease ${Math.min(i,15)*0.02}s both`,borderLeft:batch&&bSel.has(a.n)?`3px solid ${C.ac}`:"3px solid transparent"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.ac} onMouseLeave={e=>{e.currentTarget.style.borderColor=batch&&bSel.has(a.n)?C.ac:C.bd}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700}}>{a.n}</span>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:pt2.bg,color:pt2.color,fontWeight:600,border:`1px solid ${pt2.border}`}}>{pt2.label}</span>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:sb(a.stage,C),color:sc(a.stage,C),fontWeight:500}}>{SM[a.stage]?.icon} {SM[a.stage]?.label}</span>
                </div>
                <div style={{fontSize:11,color:C.ts,marginTop:3,display:"flex",gap:10,flexWrap:"wrap"}}>
                  {a.g&&<span>{a.bucket}</span>}
                  {a.l&&<span>🎧 {a.l}</span>}
                  {a.e&&<span style={{color:C.gn}}>✉</span>}
                  {a.soc&&<span>📷</span>}
                  {a.followUp&&<span style={{color:a.followUp<=new Date().toISOString().slice(0,10)?C.rd:C.ab}}>📅 {sD(a.followUp)}</span>}
                </div>
              </div>
              <a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:C.gn,textDecoration:"none",fontWeight:600,padding:"3px 10px",background:C.gb,borderRadius:8,border:`1px solid ${C.gd}`,flexShrink:0}}>Spotify</a>
            </div>
          )})}
        </div>)}

        {/* ═══ KANBAN VIEW ═══ */}
        {viewMode==="kanban"&&(<div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:20}}>
          {STAGES.map(s=>{const col=filtered.filter(a=>a.stage===s.id);return(
            <div key={s.id} style={{minWidth:200,maxWidth:240,flex:"0 0 auto"}}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:8,padding:"6px 12px",borderRadius:8,background:sb(s.id,C),color:sc(s.id,C),textAlign:"center"}}>{s.icon} {s.label} ({col.length})</div>
              <div style={{display:"grid",gap:6}}>
                {col.slice(0,50).map(a=>{const pt2=pT(a.priority,C);return(
                  <div key={a.n} onClick={()=>openA(a)} style={{...cS,padding:"10px 12px",cursor:"pointer",transition:"all 0.15s",fontSize:12}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.ac} onMouseLeave={e=>e.currentTarget.style.borderColor=C.bd}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontWeight:700,fontSize:13}}>{a.n}</span>
                      <span style={{fontSize:9,padding:"1px 6px",borderRadius:8,background:pt2.bg,color:pt2.color,fontWeight:600}}>{pt2.label}</span>
                    </div>
                    <div style={{color:C.ts,marginTop:3,fontSize:11}}>{a.bucket}{a.l?` · ${a.l}`:""}</div>
                    <div style={{display:"flex",gap:4,marginTop:4}}>
                      {a.e&&<span style={{fontSize:10}}>✉</span>}
                      {a.soc&&<span style={{fontSize:10}}>📷</span>}
                      <a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{fontSize:9,color:C.gn,textDecoration:"none"}}>🎵</a>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )})}
        </div>)}

        {/* ═══ TABLE VIEW ═══ */}
        {viewMode==="table"&&(<div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{borderBottom:`2px solid ${C.bd}`,textAlign:"left"}}>
              {["Artist","Genre","Listeners","Stage","Priority","Email","Social","Spotify","Follow-up","Updated"].map(h=>(
                <th key={h} style={{padding:"8px 10px",fontWeight:600,color:C.ts,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>))}
            </tr></thead>
            <tbody>
              {filtered.slice(0,500).map(a=>{const pt2=pT(a.priority,C);return(
                <tr key={a.n} onClick={()=>openA(a)} style={{borderBottom:`1px solid ${C.sa}`,cursor:"pointer",transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.sh} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:"8px 10px",fontWeight:600}}>{a.n}</td>
                  <td style={{padding:"8px 10px",color:C.ts}}>{a.bucket}</td>
                  <td style={{padding:"8px 10px",color:C.ts}}>{a.l||"-"}</td>
                  <td style={{padding:"8px 10px"}}><span style={{fontSize:10,padding:"2px 8px",borderRadius:8,background:sb(a.stage,C),color:sc(a.stage,C)}}>{SM[a.stage]?.icon} {SM[a.stage]?.label}</span></td>
                  <td style={{padding:"8px 10px"}}><span style={{fontSize:10,padding:"2px 6px",borderRadius:8,background:pt2.bg,color:pt2.color,fontWeight:600}}>{pt2.label}</span></td>
                  <td style={{padding:"8px 10px",color:a.e?C.gn:C.tt,fontSize:11}}>{a.e?"✓":"—"}</td>
                  <td style={{padding:"8px 10px"}}>{a.soc?<a href={`https://instagram.com/${a.soc}`} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{color:C.pr,textDecoration:"none",fontSize:11}}>@{a.soc}</a>:"—"}</td>
                  <td style={{padding:"8px 10px"}}><a href={spotifyUrl(a.n)} target="_blank" rel="noopener" onClick={e=>e.stopPropagation()} style={{color:C.gn,textDecoration:"none",fontSize:11}}>🎵</a></td>
                  <td style={{padding:"8px 10px",color:a.followUp?C.ab:C.tt,fontSize:11}}>{a.followUp?sD(a.followUp):"—"}</td>
                  <td style={{padding:"8px 10px",color:C.tt,fontSize:11}}>{rD(a.stageDate)}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>)}

        {filtered.length===0&&(<div style={{textAlign:"center",padding:"60px 20px",color:C.tt}}>
          <div style={{fontSize:36,marginBottom:12}}>◎</div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>No artists yet</div>
          <div style={{fontSize:13}}>Import a CSV or use AI Discover to find artists.</div>
        </div>)}
      </div>
    </div>
  );

  return null;
}
