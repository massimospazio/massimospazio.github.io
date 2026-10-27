/* V74.3 — Global financial perspective; scoped read-only actuals. */
(function(root){
"use strict";
const key="bf-perspective-v1",modes=["MASSIMO","LUISA","FAMILY"],names={MASSIMO:"Massimo",LUISA:"Luisa",FAMILY:"Famiglia"};
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=x=>Number(x)||0,eur=x=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(num(x));
const mon=x=>String(x||"").slice(0,7);
function totals(months){return (months||[]).reduce((a,r)=>{for(const k of ["income","expense","investment","economic_net","account_flow_net","transfer_in","transfer_out"])a[k]+=num(r[k]);return a},{income:0,expense:0,investment:0,economic_net:0,account_flow_net:0,transfer_in:0,transfer_out:0})}
function categories(rows){const map=new Map();for(const r of rows||[]){const k=[r.direction,r.l1_name,r.l2_name].join("|"),v=map.get(k)||{type:r.direction,l1:r.l1_name,l2:r.l2_name,amount:0};v.amount+=num(r.amount);map.set(k,v)}return [...map.values()].sort((a,b)=>b.amount-a.amount)}
function table(head,rows){return '<div class="bf-sp-scroll"><table><thead><tr>'+head.map(x=>'<th>'+x+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>'}
function mount({app,rpc,legacy,management=false}){
 if(app._bfScope)return app._bfScope.legacy();
 const top=app.querySelector(".top");if(!top)return true;
 let scope;try{scope=root.localStorage.getItem(key)}catch(e){}
 if(!modes.includes(scope))scope="MASSIMO";
 let classic=scope==="MASSIMO",tab="SUMMARY",period=12,seq=0,data=null,error="",loading=false;
 const bar=root.document.createElement("div"),panel=root.document.createElement("section");
 bar.className="bf-sp-bar";panel.className="bf-sp-panel";
 top.insertAdjacentElement("afterend",bar);bar.insertAdjacentElement("afterend",panel);
 const original=[...app.children].filter(x=>x!==top&&x!==bar&&x!==panel);
 function draw(){
  original.forEach(x=>x.classList.toggle("bf-sp-hidden",!classic));
  panel.classList.toggle("bf-sp-hidden",classic);
  bar.innerHTML='<strong>Modalità: '+names[scope]+'</strong><div class="bf-sp-switch">'+modes.map(x=>'<button data-sp-mode="'+x+'" class="'+(x===scope?"active":"")+'" aria-pressed="'+(x===scope)+'">'+names[x]+'</button>').join("")+'</div>'+
  '<div class="bf-sp-actions"><button data-sp-modern '+(!classic?'disabled':'')+'>Analisi per prospettiva</button>'+
   ((scope==="MASSIMO"||management)?'<button data-sp-classic '+(classic?'disabled':'')+'>'+(management?"Gestione conti · tutti":"Strumenti storici Massimo")+'</button>':"")+'</div>'+
  '<small>'+(classic?(management?"Gestione operativa: dati di tutti i conti (non filtrati)": "Strumenti storici Massimo"): "Dati filtrati per "+names[scope])+'</small>';
  if(classic)return;
  if(loading){panel.innerHTML='<p>Caricamento movimenti '+names[scope]+'…</p>';return}
  if(error){panel.innerHTML='<div class="bf-sp-error">'+esc(error)+'</div><button data-sp-retry>Riprova</button>';return}
  if(!data){panel.innerHTML='<p>Caricamento iniziale…</p>';return}
  const t=totals(data.monthly),c=categories(data.categories);
  const nav='<div class="bf-sp-tabs">'+["SUMMARY","CATEGORIES","MOVEMENTS","CASHFLOW","PLAN"].map((x,i)=>'<button data-sp-tab="'+x+'" class="'+(tab===x?"active":"")+'">'+["Riepilogo","Categorie","Movimenti","Cash flow","Baseline · Piano · Controllo"][i]+'</button>').join("")+'</div>';
  const hero='<div class="bf-sp-top"><div><h2>'+names[scope]+' · Analisi consuntivi</h2><p>Il perimetro riguarda i conti del titolare selezionato. I trasferimenti sono separati dalle entrate e spese economiche.</p></div>'+
    '<div>'+[6,12,24].map(n=>'<button data-sp-period="'+n+'" class="'+(period===n?"active":"")+'">'+n+' mesi</button>').join("")+'</div></div>';
  const kpis=items=>'<div class="bf-sp-kpis">'+items.map(([label,value])=>'<div><small>'+label+'</small><strong>'+eur(value)+'</strong></div>').join("")+'</div>';
  let content="";
  if(tab==="SUMMARY")content=kpis([["Entrate",t.income],["Spese",t.expense],["Investimenti",t.investment],["Risultato economico",t.economic_net]])+
    table(["Mese","Entrate","Spese","Investimenti","Saldo"],data.monthly.map(r=>'<tr><td>'+esc(mon(r.month_start))+'</td><td>'+eur(r.income)+'</td><td>'+eur(r.expense)+'</td><td>'+eur(r.investment)+'</td><td>'+eur(r.economic_net)+'</td></tr>'));
  else if(tab==="CATEGORIES")content=table(["Tipo","L1","L2","Importo"],c.map(r=>'<tr><td>'+esc(r.type)+'</td><td>'+esc(r.l1)+'</td><td>'+esc(r.l2)+'</td><td>'+eur(r.amount)+'</td></tr>'));
  else if(tab==="CASHFLOW")content=kpis([["Flusso registrato sui conti",t.account_flow_net],["Trasferimenti in",t.transfer_in],["Trasferimenti out",t.transfer_out],["Saldo economico",t.economic_net]])+
    table(["Mese","Flusso registrato","Trasf. in","Trasf. out","Saldo economico"],data.monthly.map(r=>'<tr><td>'+esc(mon(r.month_start))+'</td><td>'+eur(r.account_flow_net)+'</td><td>'+eur(r.transfer_in)+'</td><td>'+eur(r.transfer_out)+'</td><td>'+eur(r.economic_net)+'</td></tr>'));
  else if(tab==="MOVEMENTS")content=table(["Data","Titolare","Conto","Descrizione","Tipo","Importo"],data.movements.map(r=>'<tr><td>'+esc(r.transaction_date)+'</td><td>'+esc(r.owner_name)+'</td><td>'+esc(r.bank_name)+' / '+esc(r.account_name)+'</td><td>'+esc(String(r.raw_description||"").slice(0,110))+'</td><td>'+(r.is_transfer?"Trasferimento":esc(r.transaction_type))+'</td><td>'+eur(r.amount)+'</td></tr>'))+
  '<p>Ultimi 250 movimenti del periodo; i trasferimenti restano visibili per la riconciliazione.</p>';
  else content=scope==="MASSIMO"?'<p>Il Piano già approvato appartiene alla vista storica Massimo. Non viene modificato automaticamente.</p><button data-sp-classic>Apri il Piano Massimo</button>':
    '<div class="bf-sp-note"><strong>Piano non disponibile per '+names[scope]+'.</strong> Baseline, scenari e Controllo richiedono un Piano dedicato; non sono mostrati i target di Massimo sotto un altro perimetro.</div>';
  panel.innerHTML=hero+nav+content+'<p class="bf-sp-foot">I dati provengono dai movimenti importati; il mese corrente è parziale. I trasferimenti classificati non costituiscono nuovi consumi o redditi. I bonifici non riconciliati richiedono verifica; il flusso dei conti non è il saldo bancario.</p>';
 }
 async function load(){
  const current=++seq,requested=scope;loading=true;error="";data=null;draw();
  try{const result=await rpc("dashboard_scope_actuals_v1",{p_scope:requested,p_months:period});
   if(current!==seq)return;
   if(result?.scope!==requested)throw Error("Risposta di un perimetro diverso");
   data=result;
  }catch(e){if(current!==seq)return;error=String(e?.message||e)}
  finally{if(current===seq){loading=false;draw()}}
 }
 function choose(value){if(!modes.includes(value))return;scope=value;classic=false;tab="SUMMARY";try{root.localStorage.setItem(key,value)}catch(e){}draw();load()}
 function classicMode(){if(scope!=="MASSIMO"&&!management)return;classic=true;seq++;draw();legacy?.()}
 function modern(){classic=false;draw();load()}
 bar.addEventListener("click",e=>{const m=e.target.closest("[data-sp-mode]");if(m){choose(m.dataset.spMode);return}if(e.target.closest("[data-sp-classic]"))classicMode();else if(e.target.closest("[data-sp-modern]"))modern()});
 panel.addEventListener("click",e=>{const t=e.target.closest("[data-sp-tab]"),p=e.target.closest("[data-sp-period]");if(t){tab=t.dataset.spTab;draw()}else if(p){period=+p.dataset.spPeriod;load()}else if(e.target.closest("[data-sp-classic]"))classicMode();else if(e.target.closest("[data-sp-retry]"))load()});
 root.addEventListener?.("storage",e=>{if(e.key===key&&modes.includes(e.newValue)&&e.newValue!==scope)choose(e.newValue)});
 app._bfScope={legacy:()=>classic};
 draw();if(!classic)load();return classic;
}
root.BudgetFamilyPerspectives={mount,totals,categories};
if(typeof module!=="undefined"&&module.exports)module.exports={mount,totals,categories};
})(typeof window!=="undefined"?window:globalThis);