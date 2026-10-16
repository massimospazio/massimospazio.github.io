// V73.30.1.25 — Report sanitario e fondo imprevisti. Non cambia il forecast.
(function(root){
"use strict";
const doc=root.document;
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function norm(v){return String(v||"").trim().toLowerCase()}
function monthOffset(iso,d){const z=new Date(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1+d,1);return z.getFullYear()+"-"+String(z.getMonth()+1).padStart(2,"0")+"-01"}
function priorMonth(date){const d=date||new Date();return monthOffset(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-01",-1)}
function medicalType(r){
 const a=norm(r.l1_name),b=norm(r.l2_name);
 if(r.direction==="EXPENSE"&&a==="salute"&&b==="medici e visite")return "medical";
 if(r.direction==="EXPENSE"&&a==="salute"&&b==="analisi / diagnostica")return "diagnostics";
 if(r.direction==="INCOME"&&b==="assicurazione sanitaria")return "insurance";
 return null;
}
function summary(rows,start,length){
 const months=Array.from({length:length},(_,i)=>({month:monthOffset(start,i),medical:0,diagnostics:0,insurance:0}));
 const map=new Map(months.map(x=>[x.month,x]));
 for(const r of rows||[]){const key=medicalType(r),m=map.get(String(r.month_start||"").slice(0,10));if(key&&m)m[key]+=Math.max(0,n(r.total_amount))}
 const totals=months.reduce((s,r)=>({medical:s.medical+r.medical,diagnostics:s.diagnostics+r.diagnostics,insurance:s.insurance+r.insurance}),{medical:0,diagnostics:0,insurance:0});
 totals.eligible=totals.medical+totals.diagnostics;totals.net=totals.eligible-totals.insurance;
 return {months:months,totals:totals};
}
function estimate(med,diag,pct){const cost=Math.max(0,n(med))+Math.max(0,n(diag));return {cost:cost,reimbursement:cost*Math.min(100,Math.max(0,n(pct)))/100}}
const pure={medicalType:medicalType,summary:summary,monthOffset:monthOffset,priorMonth:priorMonth,estimate:estimate};
if(typeof module!=="undefined"&&module.exports)module.exports=pure;
if(!doc)return;
const $=id=>doc.getElementById(id),eu=v=>n(v).toLocaleString("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0});
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let rows=null,calc=null,last=null,year=(new Date()).getFullYear(),fund=null,loadLock=false;
function status(id,message,bad){const el=$(id);if(el){el.textContent=message||"";el.classList.toggle("hr-error",!!bad)}}
function metric(title,amount){return '<div class="hr-metric"><small>'+esc(title)+'</small><strong>'+eu(amount)+'</strong></div>'}
function open(tab){
 $("hrDialog").classList.remove("hidden");$("hrDialog").setAttribute("aria-hidden","false");
 doc.body.style.overflow="hidden";show(tab==="fund"?"fund":"health");
}
function close(){$("hrDialog").classList.add("hidden");$("hrDialog").setAttribute("aria-hidden","true");doc.body.style.overflow=""}
function show(tab){
 $("hrHealth").classList.toggle("hidden",tab!=="health");$("hrFund").classList.toggle("hidden",tab!=="fund");
 doc.querySelectorAll("[data-hr-tab]").forEach(b=>{const selected=b.dataset.hrTab===tab;b.classList.toggle("active",selected);b.setAttribute("aria-selected",String(selected))});
 if(tab==="health")loadHealth(false);else loadFund();
}
async function loadHealth(force){
 if(rows&&!force){renderHealth();return}
 status("hrHealthStatus","Carico lo storico sanitario…");
 try{
   const data=await rpc("dashboard_reporting_scenario_actual_v3",{p_months:36});
   rows=Array.isArray(data&&data.category_monthly)?data.category_monthly:[];
   last=priorMonth();calc=null;status("hrHealthStatus","");renderHealth();
 }catch(e){status("hrHealthStatus",e.message||"Errore nello storico sanitario.",true)}
}
function renderHealth(){
 const start=monthOffset(last,-11),earlier=monthOffset(start,-12),current=summary(rows,start,12),previous=summary(rows,earlier,12),t=current.totals;
 const rate=t.eligible>0?t.insurance/t.eligible*100:null;
 if(!calc)calc={med:Math.round(t.medical),diag:Math.round(t.diagnostics),pct:rate===null?0:Math.min(100,Math.round(rate))};
 $("hrHealthBody").innerHTML=
 '<p class="hr-help">Ultimi 12 mesi completi: '+esc(start.slice(0,7))+' — '+esc(last.slice(0,7))+'. Dati reali, inclusi eventi eccezionali. Farmacia, dentista e altre spese non entrano nel calcolo assicurativo.</p>'+
 '<div class="hr-metrics">'+metric("Medici e visite",t.medical)+metric("Analisi / Diagnostica",t.diagnostics)+metric("Assicurazione Sanitaria",t.insurance)+metric("Costo netto osservato",t.net)+'</div>'+
 '<p class="hr-help">Copertura storica effettiva: <strong>'+(rate===null?"n.d.":rate.toLocaleString("it-IT",{maximumFractionDigits:1})+"%")+'</strong>. Nei 12 mesi precedenti: spese mediche e diagnostiche '+eu(previous.totals.eligible)+', rimborsi '+eu(previous.totals.insurance)+'.</p>'+
 (rate>100?'<p class="hr-warning">I rimborsi superano le spese del periodo: potrebbero riferirsi a spese precedenti. La percentuale suggerita viene limitata al 100%.</p>':"")+
 '<div class="hr-scroll"><table class="hr-table"><thead><tr><th>Mese</th><th>Medici</th><th>Diagnostica</th><th>Rimborsi</th><th>Netto</th></tr></thead><tbody>'+
 current.months.map(x=>'<tr><td>'+esc(x.month.slice(0,7))+'</td><td>'+eu(x.medical)+'</td><td>'+eu(x.diagnostics)+'</td><td>'+eu(x.insurance)+'</td><td>'+eu(x.medical+x.diagnostics-x.insurance)+'</td></tr>').join("")+
 '</tbody></table></div>'+
 '<section class="hr-calc"><h3>Stima da riportare nella baseline</h3><p class="hr-help">Il calcolatore non modifica alcuna previsione. Copia i tre importi e inseriscili manualmente nelle rispettive categorie.</p>'+
 '<div class="hr-fields"><label>Medici e visite previste (€)<input id="hrMed" type="number" step="10" min="0" value="'+esc(calc.med)+'"></label>'+
 '<label>Analisi / Diagnostica previste (€)<input id="hrDiag" type="number" step="10" min="0" value="'+esc(calc.diag)+'"></label>'+
 '<label>Copertura stimata (%)<input id="hrPct" type="number" step="1" min="0" max="100" value="'+esc(calc.pct)+'"></label></div>'+
 '<div id="hrCalcResults" class="hr-result"></div><div class="hr-actions"><button id="hrCopy" class="btn compact" type="button">Copia per baseline</button><button id="hrReload" class="btn ghost compact" type="button">↻ Ricarica dati</button></div><p id="hrCopyMsg" class="hr-help" role="status"></p></section>';
 updateCalc();
 $("hrHealthBody").oninput=function(e){
   if(e.target.id==="hrMed")calc.med=Math.max(0,n(e.target.value));
   else if(e.target.id==="hrDiag")calc.diag=Math.max(0,n(e.target.value));
   else if(e.target.id==="hrPct")calc.pct=Math.min(100,Math.max(0,n(e.target.value)));
   else return;
   updateCalc();
 };
 $("hrHealthBody").onclick=async function(e){
   if(e.target.closest("#hrReload")){rows=null;loadHealth(true);return}
   if(!e.target.closest("#hrCopy"))return;
   const x=estimate(calc.med,calc.diag,calc.pct);
   const text="Baseline sanitaria (annuale)\nMedici e visite: "+eu(calc.med)+"\nAnalisi / Diagnostica: "+eu(calc.diag)+"\nEntrate · Assicurazione Sanitaria: "+eu(x.reimbursement)+"\nCosto netto: "+eu(x.cost-x.reimbursement);
   try{await navigator.clipboard.writeText(text);status("hrCopyMsg","Valori copiati. Inserisci manualmente gli importi nella baseline.")}
   catch(err){status("hrCopyMsg","Copia non disponibile. Usa i valori visibili nel report.",true)}
 };
}
function updateCalc(){
 if(!calc||!$("hrCalcResults"))return;
 const x=estimate(calc.med,calc.diag,calc.pct);
 $("hrCalcResults").innerHTML='<span>Spesa lorda: <strong>'+eu(x.cost)+'</strong></span><span>Rimborso stimato: <strong>'+eu(x.reimbursement)+'</strong></span><span>Netto atteso: <strong>'+eu(x.cost-x.reimbursement)+'</strong></span>';
}
async function fundRPC(action,args){return rpc("dashboard_family_emergency_fund_v1",Object.assign({p_action:action,p_year:year},args||{}))}
async function loadFund(){
 if(loadLock)return;
 loadLock=true;fund=null;status("hrFundStatus","Carico il fondo…");
 try{fund=await fundRPC("READ");status("hrFundStatus","");renderFund();inline()}
 catch(e){status("hrFundStatus",e.message||"Impossibile caricare il fondo.",true);inline()}
 finally{loadLock=false}
}
function inline(){
 const el=$("hrFundInline"),plan=$("planningBoardView")?.dataset.boardContext==="PLAN";
 if(!el)return;
 el.classList.toggle("hidden",!plan);if(!plan)return;
 const a=n(fund&&fund.allocated),u=n(fund&&fund.used),d=a-u;
 el.innerHTML='<span><strong>Fondo imprevisti '+year+'</strong> · Stanziato '+eu(a)+' · Utilizzato '+eu(u)+' · <strong class="'+(d<0?"hr-error":"")+'">Residuo '+eu(d)+'</strong> '+(!fund?'<small>(da configurare)</small>':"")+'</span><button type="button" class="btn ghost compact" data-hr-open="fund">Gestisci</button>';
}
function renderFund(){
 const a=n(fund.allocated),u=n(fund.used),remaining=a-u,percentage=a>0?Math.max(0,Math.min(100,100*u/a)):0;
 const useDate=year===(new Date()).getFullYear()?new Date().toLocaleDateString("en-CA"):year+"-01-01";
 $("hrFundBody").innerHTML=
 '<p class="hr-help">Fondo '+year+' · quota dell’avanzo riservata agli imprevisti. <strong>Non è una spesa e non altera il forecast.</strong> La riduzione della riserva libera meno risorse vincolate, non genera nuove entrate.</p>'+
 '<div class="hr-metrics hr-metrics-3">'+metric("Fondo stanziato",a)+metric("Utilizzi dichiarati",u)+metric("Residuo",remaining)+'</div><div class="hr-progress"><span style="width:'+percentage+'%"></span></div>'+
 (remaining<0?'<p class="hr-warning">La riserva è stata superata di '+eu(-remaining)+'. Valuta una revisione dei target discrezionali futuri.</p>':"")+
 '<form id="hrSetForm" class="hr-inline"><label>Stanziamento annuale (€)<input id="hrSetAmount" type="number" min="0" step="50" value="'+esc(a)+'" required></label><button type="submit" class="btn compact">Salva fondo</button></form>'+
 '<p class="hr-help">Registra manualmente solo utilizzi per imprevisti reali. Il relativo movimento bancario deve essere classificato normalmente: l’utilizzo del fondo non crea una seconda spesa.</p>'+
 '<h3>Nuovo utilizzo</h3><form id="hrUseForm" class="hr-fields"><label>Data<input id="hrDate" type="date" min="'+year+'-01-01" max="'+year+'-12-31" value="'+esc(useDate)+'" required></label>'+
 '<label>Importo (€)<input id="hrAmount" type="number" step="0.01" min="0.01" placeholder="Es. 250" required></label>'+
 '<label>Motivo<input id="hrNote" type="text" maxlength="250" minlength="2" placeholder="Es. Guasto frigorifero" required></label><button type="submit" class="btn compact">Registra utilizzo</button></form>'+
 '<h3>Utilizzi</h3><div class="hr-scroll"><table class="hr-table"><thead><tr><th>Data</th><th>Motivo</th><th>Importo</th><th></th></tr></thead><tbody>'+
 ((fund.uses||[]).length?fund.uses.map(x=>'<tr><td>'+esc(x.use_date)+'</td><td>'+esc(x.note)+'</td><td>'+eu(x.amount)+'</td><td><button type="button" class="hr-delete" data-hr-remove="'+esc(x.id)+'">Elimina</button></td></tr>').join(""):'<tr><td colspan="4">Nessun utilizzo registrato.</td></tr>')+'</tbody></table></div>'+
 '<p class="hr-help">Il fondo è condiviso tra gli utenti autorizzati. Il residuo è calcolato dagli utilizzi dichiarati, non automaticamente dagli scostamenti di categoria.</p>';
 $("hrSetForm").onsubmit=async e=>{e.preventDefault();const a=Number($("hrSetAmount").value);if(!Number.isFinite(a)||a<0){status("hrFundStatus","Importo non valido.",true);return}await write("SET",{p_amount:a},"Fondo salvato.")};
 $("hrUseForm").onsubmit=async e=>{e.preventDefault();const a=Number($("hrAmount").value),date=$("hrDate").value,note=$("hrNote").value.trim();if(!Number.isFinite(a)||a<=0||date.slice(0,4)!==String(year)||note.length<2){status("hrFundStatus","Inserisci data, importo e motivo validi.",true);return}await write("USE",{p_amount:a,p_use_date:date,p_note:note},"Utilizzo registrato.")};
 $("hrFundBody").onclick=async e=>{const b=e.target.closest("[data-hr-remove]");if(!b)return;if(root.confirm("Eliminare questo utilizzo?"))await write("DELETE",{p_use_id:b.dataset.hrRemove},"Utilizzo eliminato.")};
}
async function write(action,args,success){
 status("hrFundStatus","Salvataggio…");$("hrFundBody").querySelectorAll("button").forEach(b=>b.disabled=true);
 try{fund=await fundRPC(action,args);renderFund();inline();status("hrFundStatus",success)}
 catch(e){status("hrFundStatus",e.message||"Errore salvataggio.",true);$("hrFundBody").querySelectorAll("button").forEach(b=>b.disabled=false)}
}
function init(){
 const baselineToolbar=$("analysisOpenBaselineBoard")?.parentElement,boardToolbar=$("planningBoardRefresh")?.parentElement;
 if(!baselineToolbar||!boardToolbar)return;
 function addButton(node,tab,label){const b=doc.createElement("button");b.type="button";b.className="btn ghost compact";b.dataset.hrOpen=tab;b.textContent=label;node.appendChild(b)}
 addButton(baselineToolbar,"health","⚕ Report sanitario");
 addButton(boardToolbar,"health","⚕ Sanità");
 addButton(boardToolbar,"fund","◈ Fondo imprevisti");
 const inlineNode=doc.createElement("div");inlineNode.id="hrFundInline";inlineNode.className="hr-fund-inline hidden";$("planningBaselineReview").before(inlineNode);
 const modal=doc.createElement("div");modal.id="hrDialog";modal.className="hr-overlay hidden";modal.setAttribute("aria-hidden","true");
 modal.innerHTML='<div class="hr-modal" role="dialog" aria-modal="true" aria-labelledby="hrTitle"><div class="hr-head"><h2 id="hrTitle">Pianificazione · approfondimenti</h2><button type="button" data-hr-close aria-label="Chiudi">×</button></div><div class="hr-tabs" role="tablist"><button type="button" data-hr-tab="health">Sanità e assicurazione</button><button type="button" data-hr-tab="fund">Fondo imprevisti</button></div><div class="hr-content"><section id="hrHealth"><p id="hrHealthStatus" role="status"></p><div id="hrHealthBody"></div></section><section id="hrFund" class="hidden"><label class="hr-help">Anno solare <select id="hrYear"></select></label><p id="hrFundStatus" role="status"></p><div id="hrFundBody"></div></section></div></div>';
 doc.body.appendChild(modal);
 $("hrYear").innerHTML=Array.from({length:5},(_,i)=>year-1+i).map(y=>'<option value="'+y+'">'+y+'</option>').join("");
 $("hrYear").value=String(year);$("hrYear").onchange=function(){year=Number(this.value);loadFund()};
 doc.addEventListener("click",function(e){const b=e.target.closest("[data-hr-open]");if(b){open(b.dataset.hrOpen);return}const t=e.target.closest("[data-hr-tab]");if(t){show(t.dataset.hrTab);return}if(e.target.closest("[data-hr-close]")||e.target===modal)close()});
 doc.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.classList.contains("hidden"))close()});
 new MutationObserver(inline).observe($("planningBoardView"),{attributes:true,attributeFilter:["data-board-context"]});
 inline();
}
if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",init);else init();
})(typeof window!=="undefined"?window:globalThis);
