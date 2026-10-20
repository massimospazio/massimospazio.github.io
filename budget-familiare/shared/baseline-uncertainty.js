/* V73.30.10.47 Baseline uncertainty: period % by L2, exceptional monthly values. */
(function(root){
"use strict";
const numerical=x=>Number.isFinite(Number(x))?Number(x):0;
const money=x=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(numerical(x));
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const round=x=>Math.round((numerical(x)+Number.EPSILON)*100)/100;
const k=(direction,id)=>direction+":"+id;
const floor=m=>m.kind==="actual"?numerical(m.amount):Math.max(0,round(numerical(m.amount)-numerical(m.futureAmount)));
const salary=r=>r.direction==="INCOME"&&String(r.l2_name||"").trim().toLocaleLowerCase("it")==="stipendio";
let readRpc=null,changeListener=()=>{},loaded=false,pending=null,loadError="";
let settings={},drafts={},monthLists={};
function validPcts(lo,hi){
 return (lo===null&&hi===null)||
   (Number.isFinite(lo)&&Number.isFinite(hi)&&lo>=-100&&lo<=0&&hi>=0&&hi<=500);
}
function buildAssumptions(exp,inc,values=settings){
 const result={},invalid=[];
 for(const r of [...(exp||[]),...(inc||[])]){
  const entry=values[k(r.direction,r.category_id)];
  if(!entry)continue;
  const hasPct=entry.min_pct!==null&&entry.min_pct!==undefined&&entry.max_pct!==null&&entry.max_pct!==undefined;
  for(const m of r.months||[]){
   if(m.kind==="actual")continue;
   const id=k(r.direction,r.category_id)+"|"+m.month;
   const special=entry.exceptions?.[m.month];
   let prediction=null;
   if(special?.type==="TOTAL"){
    prediction={type:"CATEGORY",expected:numerical(m.amount),min:numerical(special.min),max:numerical(special.max)};
   }else if(special?.type==="SALARY"&&salary(r)){
    prediction={type:"SALARY",expected:numerical(m.amount),fixed:numerical(special.fixed),
      variableMin:numerical(special.variableMin),variableMax:numerical(special.variableMax)};
   }else if(hasPct){
    const baseFuture=Math.max(0,numerical(m.futureAmount)),paid=floor(m);
    prediction={type:"CATEGORY",expected:numerical(m.amount),
       min:round(paid+baseFuture*(1+Number(entry.min_pct)/100)),
       max:round(paid+baseFuture*(1+Number(entry.max_pct)/100))};
   }
   if(!prediction)continue;
   const evaluator=root.BudgetFamilyUncertainty;
   const valid=evaluator?.accepted?evaluator.accepted(prediction,m,salary(r)):
     prediction.min<=numerical(m.amount)&&prediction.max>=numerical(m.amount);
   if(valid)result[id]=prediction;
   else invalid.push({category:r.l2_name,month:m.month});
  }
 }
 return {assumptions:result,invalid};
}
function settingsFor(direction,id){return settings[k(direction,id)]||{min_pct:null,max_pct:null,exceptions:{}}}
function load(rpc,onChanged){
 if(rpc)readRpc=rpc;
 if(onChanged)changeListener=onChanged;
 if(loaded)return Promise.resolve(settings);
 if(pending)return pending;
 if(!readRpc)return Promise.resolve(settings);
 pending=Promise.resolve().then(()=>readRpc("dashboard_reporting_baseline_uncertainty_v1",{p_action:"READ"}))
  .then(data=>{settings=data&&typeof data==="object"?data:{};loaded=true;loadError="";changeListener();return settings})
  .catch(e=>{loadError=String(e.message||e);return settings})
  .finally(()=>{pending=null});
 return pending;
}
function monthName(m){
 const [year,month]=String(m).split("-");
 return new Date(Date.UTC(Number(year),Number(month)-1,1)).toLocaleDateString("it-IT",{month:"short",year:"2-digit",timeZone:"UTC"});
}
function periodInputs(direction,id,value){
 const isSet=value.min_pct!==null&&value.min_pct!==undefined;
 return '<div class="bf-baseline-range-pcts">'+
 '<label>Min rispetto alla Baseline (%)<input type="number" step="1" min="-100" max="0" data-range-minpct value="'+(isSet?esc(value.min_pct):"")+'" placeholder="es. −10"></label>'+
 '<label>Max rispetto alla Baseline (%)<input type="number" step="1" min="0" max="500" data-range-maxpct value="'+(isSet?esc(value.max_pct):"")+'" placeholder="es. +20"></label>'+
 '</div><small>Percentuali sulla sola quota futura, con Actual invariati. Vuoto = intervallo generale non definito.</small>';
}
function previousLocal(direction,id){
 try{
  const raw=JSON.parse(root.localStorage?.getItem("budget-family-uncertainty-v1")||"{}");
  const data={};
  for(const snapshot of Object.values(raw||{})){
   if(!snapshot||typeof snapshot!=="object")continue;
   for(const [key,value] of Object.entries(snapshot)){
    if(key.startsWith(k(direction,id)+"|")&&!data[key.slice(k(direction,id).length+1)])data[key.slice(k(direction,id).length+1)]=value;
   }
  }
  return data;
 }catch(_){return {}}
}
function editorHtml({direction,categoryId,months=[],label=""}){
 if(!["INCOME","EXPENSE"].includes(direction)||!categoryId)return "";
 const id=k(direction,categoryId);
 monthLists[id]=(months||[]).map(m=>({month:String(m.month),kind:String(m.kind||"plan"),
  amount:numerical(m.amount),futureAmount:numerical(m.futureAmount)}));
 const view=drafts[id]||settingsFor(direction,categoryId);
 const special=view.exceptions||{};
 const available=monthLists[id].filter(m=>m.kind!=="actual");
 const legacy=Object.entries(previousLocal(direction,categoryId)).filter(([month])=>available.some(m=>m.month===month));
 const rows=Object.entries(special).sort(([a],[b])=>a.localeCompare(b)).map(([month,entry])=>{
  const m=available.find(x=>x.month===month);
  return '<div class="bf-baseline-range-exception">'+
    '<span>'+esc(monthName(month))+'</span><strong>Prudente '+money(entry.type==="SALARY"?
      numerical(entry.fixed)+numerical(entry.variableMin):entry.min)+
      ' · Base '+(m?money(m.amount):'Baseline non disponibile')+
      ' · Favorevole '+money(entry.type==="SALARY"?
      numerical(entry.fixed)+numerical(entry.variableMax):entry.max)+'</strong>'+
    '<button class="btn ghost compact" type="button" data-range-remove="'+esc(month)+'">Rimuovi</button>'+
    (!m?'<small>Mese fuori dal periodo corrente (conservato)</small>':'')+
    '</div>';
 }).join("");
 return '<details class="bf-baseline-range" data-baseline-range="'+esc(id)+'" data-baseline-range-label="'+esc(label)+'">'+
  '<summary>Incertezza della previsione <span class="bf-baseline-range-indicator">'+
  (view.min_pct!==null&&view.min_pct!==undefined?'Min '+esc(view.min_pct)+'% / Max +'+esc(view.max_pct)+'%':'Intervallo generale non definito')+
  (Object.keys(special).length?' · '+Object.keys(special).length+' eccezioni':'')+'</span></summary>'+
  '<div class="bf-baseline-range-body">'+
  (loadError?'<p class="bf-baseline-range-error">Caricamento non riuscito: '+esc(loadError)+'</p>':'')+
  (!loaded?'<p class="bf-baseline-range-help">Caricamento impostazioni…</p>':'')+
  '<p class="bf-baseline-range-help">Intervallo L2 per il periodo di previsione. <b>Base = Baseline</b>; Min e Max sono ipotesi prudenti/favorevoli, non limiti garantiti e non cambiano né il metodo di previsione né gli override mensili.</p>'+
  periodInputs(direction,categoryId,view)+
  '<details class="bf-baseline-range-exceptions"><summary>Eccezioni mensili ('+Object.keys(special).length+') · facoltative</summary>'+
  rows+
  (available.length?'<div class="bf-baseline-range-add"><label>Mese <select data-range-month>'+
   available.map(m=>'<option value="'+esc(m.month)+'">'+esc(monthName(m.month))+' · Baseline '+esc(money(m.amount))+'</option>').join("")+
   '</select></label>'+
   '<label>Prudente · Min totale €<input type="number" data-range-monthmin min="0" step=".01" placeholder="es. 9000"></label>'+
   '<label>Favorevole · Max totale €<input type="number" data-range-monthmax min="0" step=".01" placeholder="es. 15000"></label>'+
   '<small>Base = Baseline del mese selezionato (non si reinserisce). Il Prudente non è un minimo garantito: è una delle ipotesi sfavorevoli plausibili.</small>'+
   '<button type="button" class="btn ghost compact" data-range-add>Aggiungi eccezione</button></div>':
   '<p>Nessun mese futuro modificabile.</p>')+
  '</details>'+
  (legacy.length?'<button type="button" class="btn ghost compact" data-range-import>Importa '+legacy.length+' vecchie ipotesi locali di questa categoria</button>':'')+
  '<div class="bf-baseline-range-actions"><span data-range-feedback></span>'+
  '<button type="button" class="btn ghost compact" data-range-reset>Ripristina</button>'+
  '<button type="button" class="btn compact" data-range-save '+(!loaded?'disabled':'')+'>Salva incertezza</button></div>'+
  '<small>Salvataggio condiviso Supabase, indipendente dal tasto «Salva previsione».</small></div></details>';
}
function updatePanels(id){
 if(!root.document)return;
 for(const el of root.document.querySelectorAll("[data-baseline-range]")){
  if(el.getAttribute("data-baseline-range")!==id)continue;
  const open=el.open;
  const openMonths=!!el.querySelector(".bf-baseline-range-exceptions")?.open;
  const monthSelected=el.querySelector("[data-range-month]")?.value;
  const [direction,categoryId]=id.split(":");
  const label=el.getAttribute("data-baseline-range-label")||"";
  const host=root.document.createElement("div");
  host.innerHTML=editorHtml({direction,categoryId,months:monthLists[id],label});
  const next=host.firstElementChild;
  if(next){
   next.open=open;
   const exceptions=next.querySelector(".bf-baseline-range-exceptions");
   if(exceptions)exceptions.open=openMonths;
   const picker=next.querySelector("[data-range-month]");
   if(picker&&monthSelected&&Array.from(picker.options).some(x=>x.value===monthSelected))picker.value=monthSelected;
   el.replaceWith(next);
  }
 }
}
function readPercents(panel,draft){
 const min=panel.querySelector("[data-range-minpct]")?.value.trim()??"";
 const max=panel.querySelector("[data-range-maxpct]")?.value.trim()??"";
 if((min==="")!==(max===""))throw Error("Inserisci entrambi i valori percentuali oppure lasciali entrambi vuoti.");
 const lo=min===""?null:Number(min.replace(",",".")),hi=max===""?null:Number(max.replace(",","."));
 if(!validPcts(lo,hi))throw Error("Min deve essere tra −100% e 0%, Max tra 0% e +500%.");
 draft.min_pct=lo;draft.max_pct=hi;
}
function getDraft(id){
 if(!drafts[id])drafts[id]=JSON.parse(JSON.stringify(settingsFor(...id.split(":"))));
 return drafts[id];
}
function message(panel,s,isError=false){
 const el=panel.querySelector("[data-range-feedback]");
 if(el){el.textContent=s;el.style.color=isError?"#b91c1c":"#166534"}
}
function install(){
 const doc=root.document;if(!doc)return;
 doc.addEventListener("click",async e=>{
  const button=e.target.closest?.("[data-range-save],[data-range-add],[data-range-remove],[data-range-reset],[data-range-import]");
  if(!button)return;
  const panel=button.closest("[data-baseline-range]");
  if(!panel)return;
  const id=panel.getAttribute("data-baseline-range"),[direction,categoryId]=id.split(":");
  const draft=getDraft(id);
  try{
   readPercents(panel,draft);
   if(button.hasAttribute("data-range-add")){
    const month=panel.querySelector("[data-range-month]")?.value;
    const m=monthLists[id]?.find(x=>x.month===month&&x.kind!=="actual");
    if(!m)throw Error("Seleziona un mese futuro valido.");
    const minText=panel.querySelector("[data-range-monthmin]")?.value.trim()||"";
    const maxText=panel.querySelector("[data-range-monthmax]")?.value.trim()||"";
    if(!minText||!maxText)throw Error("Indica Min e Max del mese.");
    const lo=Number(minText),hi=Number(maxText),paid=floor(m),base=numerical(m.amount);
    if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo<0||hi<lo)throw Error("Intervallo del mese non valido.");
    if(lo>base+.005||hi<base-.005||lo<paid-.005)
     throw Error("Occorre Prudente ≤ Base (Baseline) ≤ Favorevole; il Prudente non può essere inferiore agli Actual già registrati.");
    // Anche lo stipendio usa valori TOTALI del mese. Non sommare una nuova quota variabile.
    draft.exceptions[month]={type:"TOTAL",min:round(lo),max:round(hi)};
    updatePanels(id);return;
   }
   if(button.hasAttribute("data-range-remove")){
    delete draft.exceptions[button.getAttribute("data-range-remove")];updatePanels(id);return;
   }
   if(button.hasAttribute("data-range-reset")){
    draft.min_pct=null;draft.max_pct=null;draft.exceptions={};updatePanels(id);message(root.document.querySelector('[data-baseline-range="'+id+'"]'),"Premi Salva incertezza per azzerare i valori.");return;
   }
   if(button.hasAttribute("data-range-import")){
    let imported=0;
    for(const [month,value] of Object.entries(previousLocal(direction,categoryId))){
     if(draft.exceptions[month])continue;
     const m=monthLists[id]?.find(x=>x.month===month&&x.kind!=="actual");
     if(!m||Math.abs(numerical(value.expected)-numerical(m.amount))>.005)continue;
     // Una vecchia ipotesi stipendio con componenti separati viene convertita
     // negli stessi totali prudente/favorevole, senza cambiarne l'effetto economico.
     const lo=value.type==="SALARY"?numerical(value.fixed)+numerical(value.variableMin):numerical(value.min);
     const hi=value.type==="SALARY"?numerical(value.fixed)+numerical(value.variableMax):numerical(value.max);
     const paid=floor(m);
     if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo<paid-.005||lo>m.amount+.005||hi<m.amount-.005)continue;
     draft.exceptions[month]={type:"TOTAL",min:round(lo),max:round(hi)};
     imported++;
    }
    updatePanels(id);
    message(root.document.querySelector('[data-baseline-range="'+id+'"]'),imported+" eccezioni importate nella bozza. Verifica e salva.");
    return;
   }
   if(button.hasAttribute("data-range-save")){
    if(!loaded||!readRpc)throw Error("Database non disponibile: riprova dopo il caricamento.");
    button.disabled=true;
    await readRpc("dashboard_reporting_baseline_uncertainty_v1",{
     p_action:"SAVE",p_category_id:categoryId,p_direction:direction,
     p_min_pct:draft.min_pct,p_max_pct:draft.max_pct,p_exceptions:draft.exceptions
    });
    settings[id]=JSON.parse(JSON.stringify(draft));delete drafts[id];updatePanels(id);
    message(root.document.querySelector('[data-baseline-range="'+id+'"]'),"Incertezza salvata in Supabase.");
    return;
   }
  }catch(err){message(panel,err.message||String(err),true)}
  finally{button.disabled=false}
 });
}
const api={buildAssumptions,validPcts,editorHtml,load,settings:()=>settings,settingsFor};
root.BudgetFamilyBaselineUncertainty=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==="loading")root.document.addEventListener("DOMContentLoaded",install);else install()}
})(typeof window!=="undefined"?window:globalThis);
