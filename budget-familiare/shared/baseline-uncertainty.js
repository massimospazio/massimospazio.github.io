/* V73.30.10.60: allineamento base incertezza al piano mensile salvato. */
(function(root){
"use strict";
const numerical=x=>Number.isFinite(Number(x))?Number(x):0;
const money=x=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(numerical(x));
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const euroInput=x=>new Intl.NumberFormat("it-IT",{maximumFractionDigits:2}).format(Math.round(numerical(x)*100)/100);
const parseEuroInput=x=>{
 const t=String(x??"").trim().replace(/\s/g,"");
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(t))return NaN;
 return Number(t.replace(/\./g,"").replace(",","."));
};
const round=x=>Math.round((numerical(x)+Number.EPSILON)*100)/100;
const k=(direction,id)=>direction+":"+id;
const floor=m=>m.kind==="actual"?numerical(m.amount):Math.max(0,round(numerical(m.amount)-numerical(m.futureAmount)));
const salary=r=>r.direction==="INCOME"&&String(r.l2_name||"").trim().toLocaleLowerCase("it")==="stipendio";
// Always derive uncertainty from the same freshly loaded monthly amounts shown
// in the baseline editor. The board projection cache may be intentionally cleared
// immediately after saving a monthly amount; an empty cache is not a zero baseline.
function monthsFromPlan(monthlyPlan){
 return (Array.isArray(monthlyPlan)?monthlyPlan:[]).filter(x=>/^\d{4}-(0[1-9]|1[0-2])-01$/.test(String(x.month||""))).map(x=>{
  const isCurrent=!!x.is_current_month;
  const paid=isCurrent?Math.max(0,numerical(x.actual_to_date)):0;
  const planned=Math.max(0,numerical(x.planned_amount));
  const amount=round(Math.max(planned,paid));
  return {month:String(x.month),kind:"plan",amount,
   futureAmount:isCurrent?round(Math.max(0,amount-paid)):amount,current:isCurrent};
 });
}
// Dated bounds can be inherited by the same calendar month in future years.
// The nearest past year's explicit value wins; Actual months remain immutable.
function exceptionForMonth(config,month){
 const exact=config?.exceptions?.[month];if(exact)return exact;
 const target=String(month||""),year=Number(target.slice(0,4)),mm=target.slice(5,7);
 if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(target))return null;
 let latest=-Infinity,result=null;
 for(const [date,value] of Object.entries(config?.exceptions||{})){
  if(!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(date)||date.slice(5,7)!==mm)continue;
  const y=Number(date.slice(0,4));
  if(y<=year&&y>latest){latest=y;result=value}
 }
 return result;
}
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
   const special=exceptionForMonth(entry,m.month);
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
/* Period summary used by the shared Baseline/Strategia/Piano board.
   Show only effective future-month exceptions in the badge; already-closed months
   remain stored but no longer affect the uncertainty forecast. */
function summarize(row,values=settings){
 const direction=String(row?.direction||""),id=String(row?.category_id||"");
 const config=values[k(direction,id)];
 const months=Array.isArray(row?.months)?row.months:[];
 const future=months.filter(m=>m.kind!=="actual");
 const futureKeys=new Set(future.map(m=>String(m.month)));
 const general=!!config&&config.min_pct!==null&&config.min_pct!==undefined&&
   config.max_pct!==null&&config.max_pct!==undefined;
 const exceptionKeys=future.filter(m=>exceptionForMonth(config,m.month)).map(m=>m.month).sort();
 const configured=general||exceptionKeys.length>0;
 const kind=general?(exceptionKeys.length?"MIXED":"PERIOD"):(exceptionKeys.length?"MONTHS":"NONE");
 const effective=buildAssumptions(direction==="EXPENSE"?[row]:[],direction==="INCOME"?[row]:[],values);
 let base=0,min=0,max=0,active=0;
 for(const m of months){
  const standard=numerical(m.amount);
  base+=standard;
  const entry=effective.assumptions[k(direction,id)+"|"+m.month];
  if(!entry){min+=standard;max+=standard;continue}
  const salaryException=entry.type==="SALARY";
  const lo=salaryException?numerical(entry.fixed)+numerical(entry.variableMin):numerical(entry.min);
  const hi=salaryException?numerical(entry.fixed)+numerical(entry.variableMax):numerical(entry.max);
  min+=lo;max+=hi;active++;
 }
 return {
  configured,kind,hasPeriod:general,monthCount:exceptionKeys.length,
  months:exceptionKeys,base:round(base),min:round(min),max:round(max),
  active,invalidCount:effective.invalid.length
 };
}
function status(){return {loaded,error:loadError}}

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

function monthBounds(m,config){
 const special=exceptionForMonth(config,m.month);
 if(special?.type==="TOTAL")return {min:numerical(special.min),max:numerical(special.max),active:true};
 if(special?.type==="SALARY")return {min:numerical(special.fixed)+numerical(special.variableMin),max:numerical(special.fixed)+numerical(special.variableMax),active:true};
 if(config?.min_pct!==null&&config?.min_pct!==undefined&&config?.max_pct!==null&&config?.max_pct!==undefined){
  const paid=floor(m),future=Math.max(0,numerical(m.futureAmount));
  return {min:round(paid+future*(1+Number(config.min_pct)/100)),
   max:round(paid+future*(1+Number(config.max_pct)/100)),active:true,legacy:true};
 }
 return {min:round(m.amount),max:round(m.amount),active:false};
}
function periodSummary(direction,id,config,label){
 return summarize({direction,category_id:id,l2_name:label,months:monthLists[k(direction,id)]||[]},
  {[k(direction,id)]:config});
}
function percentDelta(value,base){
 return base>.005?((value/base-1)*100).toLocaleString("it-IT",{maximumFractionDigits:1})+"%":"n.d.";
}
function periodInputs(direction,id,value,label){
 const totals=periodSummary(direction,id,value,label);
 const lower=direction==="INCOME"?"Prudente":"Favorevole";
 const upper=direction==="INCOME"?"Favorevole":"Prudente";
 return '<div class="bf-baseline-range-period">'+
 '<label>Base del periodo (€)<strong>'+money(totals.base)+'</strong><small>Media '+money(totals.base/Math.max(1,(monthLists[k(direction,id)]||[]).length))+'/mese</small></label>'+
 '<label>'+lower+' · Min del periodo (€)<input type="text" inputmode="decimal" data-range-periodmin value="'+esc(euroInput(totals.min))+'"></label>'+
 '<label>'+upper+' · Max del periodo (€)<input type="text" inputmode="decimal" data-range-periodmax value="'+esc(euroInput(totals.max))+'"></label>'+
 '</div><div class="bf-baseline-range-derived">Variazioni calcolate: Min '+esc(percentDelta(totals.min,totals.base))+
 ' · Max '+esc(percentDelta(totals.max,totals.base))+
 ' · '+totals.monthCount+' mesi configurati.</div>'+
 '<small class="bf-baseline-range-period-help">Modifica Min/Max del periodo e premi direttamente <strong>Salva incertezza</strong>: la differenza viene ripartita proporzionalmente tra i mesi con spesa prevista. Nessun altro pulsante necessario.</small>'+ 
 '<details class="bf-baseline-range-distribute"><summary>Anteprima ripartizione sui mesi (facoltativa)</summary>'+
 '<small>Mostra i nuovi valori mensili nella bozza prima del salvataggio. Se sono già presenti intervalli mensili, la ripartizione del periodo li sostituisce dopo conferma.</small>'+
 '<button class="btn ghost compact" type="button" data-range-period-apply>Visualizza ripartizione sui mesi</button></details>';
}
// Compatibilità: le vecchie percentuali sono convertite una sola volta in importi
// mensili espliciti quando l’utente inizia a modificare o salva questa categoria.
function upgradeLegacy(draft,months){
 if(draft.min_pct===null||draft.min_pct===undefined||draft.max_pct===null||draft.max_pct===undefined)return draft;
 draft.exceptions=draft.exceptions||{};
 for(const m of months||[]){
  if(m.kind==="actual"||draft.exceptions[m.month])continue;
  const b=monthBounds(m,draft);
  if(Math.abs(b.min-numerical(m.amount))>.005||Math.abs(b.max-numerical(m.amount))>.005)
   draft.exceptions[m.month]={type:"TOTAL",min:b.min,max:b.max};
 }
 draft.min_pct=null;draft.max_pct=null;
 return draft;
}
// Ripartizione proporzionale in centesimi, senza scostamenti di arrotondamento.
function weightedCents(total,weights){
 const n=weights.length;if(!n)return [];
 let sum=weights.reduce((a,b)=>a+b,0);
 const w=sum?weights:Array(n).fill(1);if(!sum)sum=n;
 const raw=w.map(x=>x*total/sum),out=raw.map(Math.floor);
 let remain=total-out.reduce((a,b)=>a+b,0);
 const order=raw.map((x,i)=>({i,fraction:x-out[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
 for(let j=0;j<remain;j++)out[order[j%order.length].i]++;
 return out;
}
function distributePeriod(months,min,max){
 const all=months||[],future=all.filter(m=>m.kind!=="actual");
 const base=round(all.reduce((n,m)=>n+numerical(m.amount),0));
 const paid=round(all.reduce((n,m)=>n+floor(m),0));
 const lo=Number(min),hi=Number(max);
 if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo<0||hi>100000000||
    lo>base+.005||hi<base-.005||lo<paid-.005||lo>hi+.005)
  throw Error("Il totale deve rispettare quota già consuntivata ≤ Min ≤ Base ≤ Max.");
 if(!future.length&& (Math.abs(lo-base)>.005||Math.abs(hi-base)>.005))
  throw Error("Nessun mese futuro modificabile in questo periodo.");
 const weights=future.map(m=>Math.max(0,Math.round(numerical(m.futureAmount)*100)));
 const futureCents=weights.reduce((a,b)=>a+b,0);
 const diffMin=Math.round((base-lo)*100),diffMax=Math.round((hi-base)*100);
 if(diffMin>futureCents)throw Error("Min inferiore alla quota già consuntivata.");
 const cut=weightedCents(diffMin,weights),extra=weightedCents(diffMax,weights);
 const result={};
 for(let i=0;i<future.length;i++){
  const m=future[i],baseCents=Math.round(numerical(m.amount)*100);
  const low=(baseCents-cut[i])/100,high=(baseCents+extra[i])/100;
  if(Math.abs(low-numerical(m.amount))>.005||Math.abs(high-numerical(m.amount))>.005)
   result[m.month]={type:"TOTAL",min:round(low),max:round(high)};
 }
 return result;
}
// Salva direttamente i campi Min/Max del periodo: nessun click su
// «Distribuisci» deve essere necessario per rendere persistenti gli importi.
// Se non sono variati, rispetta gli intervalli mensili gia' configurati.
function preparePeriodEdit(months,minText,maxText,currentMin,currentMax){
 const lo=parseEuroInput(minText),hi=parseEuroInput(maxText);
 if(!Number.isFinite(lo)||!Number.isFinite(hi))
  throw Error("Inserisci valori Min e Max del periodo validi in euro.");
 const changed=Math.abs(lo-currentMin)>.005||Math.abs(hi-currentMax)>.005;
 return {changed,min:lo,max:hi,months:changed?distributePeriod(months,lo,hi):null};
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
 const knownMonths=new Map(monthLists[id].map(m=>[m.month,m]));
 const legacy=Object.entries(previousLocal(direction,categoryId)).filter(([month])=>available.some(m=>m.month===month));
 const lower=direction==="INCOME"?"Prudente":"Favorevole";
 const upper=direction==="INCOME"?"Favorevole":"Prudente";
 const info=periodSummary(direction,categoryId,view,label);
 const configured=info.monthCount||(view.min_pct!==null&&view.min_pct!==undefined);
 const chosen=available.find(m=>!exceptionForMonth(view,m.month))||available[0];
 const selection=chosen&&exceptionForMonth(view,chosen.month);
 const selectedMin=selection?(selection.type==="SALARY"?numerical(selection.fixed)+numerical(selection.variableMin):numerical(selection.min)):null;
 const selectedMax=selection?(selection.type==="SALARY"?numerical(selection.fixed)+numerical(selection.variableMax):numerical(selection.max)):null;
 const entries=Object.entries(special).sort(([a],[b])=>a.localeCompare(b)).map(([month,entry])=>{
  const m=knownMonths.get(month),totalMin=entry.type==="SALARY"?
   numerical(entry.fixed)+numerical(entry.variableMin):numerical(entry.min);
  const totalMax=entry.type==="SALARY"?
   numerical(entry.fixed)+numerical(entry.variableMax):numerical(entry.max);
  const archived=m?.kind==="actual",outside=!m;
  return '<div class="bf-baseline-range-exception">'+
   '<span class="bf-baseline-range-exception-month">'+esc(monthName(month))+'</span>'+
   '<strong>'+lower+' '+money(totalMin)+' · Base '+(m?money(m.amount):'non disponibile')+
   ' · '+upper+' '+money(totalMax)+'</strong>'+
   (archived||outside?'<small>'+(archived?'Mese consuntivato: Actual invariato':'Intervallo annuale: disponibile negli anni successivi')+'</small>':'')+
   (m&&!archived?'<button class="btn ghost compact" type="button" data-range-edit="'+esc(month)+'">Modifica</button>':'')+
   '<button class="btn ghost compact" type="button" data-range-remove="'+esc(month)+'">Rimuovi</button>'+
   '</div>';
 }).join("");
 return '<details class="bf-baseline-range" data-baseline-range="'+esc(id)+'" data-baseline-range-label="'+esc(label)+'">'+
 '<summary>Incertezza della previsione <span class="bf-baseline-range-indicator">'+
 (configured?'Min '+money(info.min)+' · Base '+money(info.base)+' · Max '+money(info.max):
 'Nessun intervallo definito')+'</span></summary>'+
 '<div class="bf-baseline-range-body">'+
 (loadError?'<p class="bf-baseline-range-error">Caricamento non riuscito: '+esc(loadError)+'</p>':'')+
 (!loaded?'<p class="bf-baseline-range-help">Caricamento impostazioni…</p>':'')+
 '<p class="bf-baseline-range-help">Base = Baseline. Min e Max sono ipotesi plausibili, non limiti garantiti. Gli intervalli mensili seguono il modello annuale della Baseline e possono essere rivisti ogni anno.</p>'+
 periodInputs(direction,categoryId,view,label)+
 '<details class="bf-baseline-range-exceptions" open><summary>Mesi con incertezza ('+Object.keys(special).length+')</summary>'+
 (entries||'<p class="bf-baseline-range-empty">Nessun mese specifico aggiunto.</p>')+
 (available.length?'<div class="bf-baseline-range-add">'+
 '<label>Mese <select data-range-month>'+
 available.map(m=>'<option value="'+esc(m.month)+'"'+(chosen?.month===m.month?' selected':'')+'>'+
 esc(monthName(m.month))+' · Base '+esc(money(m.amount))+'</option>').join("")+'</select></label>'+
 '<label>'+lower+' · Min totale €<input type="text" inputmode="decimal" data-range-monthmin value="'+(selectedMin===null?'':esc(euroInput(selectedMin)))+'" placeholder="Min €"></label>'+
 '<label>'+upper+' · Max totale €<input type="text" inputmode="decimal" data-range-monthmax value="'+(selectedMax===null?'':esc(euroInput(selectedMax)))+'" placeholder="Max €"></label>'+
 '<button class="btn ghost compact" type="button" data-range-add>'+(selection?'Aggiorna mese':'Aggiungi mese')+'</button></div>'+
 '<small>Seleziona soltanto i mesi incerti. Il valore Base è preso dalla Baseline e non va reinserito. Ogni importo rappresenta il totale del mese, non una variazione percentuale.</small>':
 '<p>Nessun mese futuro modificabile.</p>')+
 '</details>'+
 (view.min_pct!==null&&view.min_pct!==undefined?
 '<small class="bf-baseline-range-legacy">Vecchie percentuali generali ancora presenti: al prossimo salvataggio saranno convertite in importi per i mesi futuri visualizzati.</small>':'')+
 (legacy.length?'<button type="button" class="btn ghost compact" data-range-import>Importa '+legacy.length+' vecchie ipotesi locali di questa categoria</button>':'')+
 '<div class="bf-baseline-range-actions"><span data-range-feedback></span>'+
 '<button type="button" class="btn ghost compact" data-range-reset>Ripristina</button>'+
 '<button type="button" class="btn compact" data-range-save '+(!loaded?'disabled':'')+'>Salva incertezza</button></div>'+
 '<small>Salvataggio condiviso Supabase, distinto da «Salva previsione». Il riepilogo del periodo somma Actual e mesi selezionati.</small></div></details>';
}
function populateSelectedMonth(panel){
 const id=panel.getAttribute("data-baseline-range"),month=panel.querySelector("[data-range-month]")?.value;
 const config=drafts[id]||settings[id]||{};
 const entry=exceptionForMonth(config,month);
 const lo=entry?.type==="SALARY"?numerical(entry.fixed)+numerical(entry.variableMin):entry?.type==="TOTAL"?numerical(entry.min):null;
 const hi=entry?.type==="SALARY"?numerical(entry.fixed)+numerical(entry.variableMax):entry?.type==="TOTAL"?numerical(entry.max):null;
 const a=panel.querySelector("[data-range-monthmin]"),b=panel.querySelector("[data-range-monthmax]");
 if(a)a.value=lo===null?"":euroInput(lo);
 if(b)b.value=hi===null?"":euroInput(hi);
 const add=panel.querySelector("[data-range-add]");
 if(add)add.textContent=entry?"Aggiorna mese":"Aggiungi mese";
}
function updatePanels(id){
 if(!root.document)return;
 for(const el of root.document.querySelectorAll("[data-baseline-range]")){
  if(el.getAttribute("data-baseline-range")!==id)continue;
  const opened=el.open;
  const openedExceptions=el.querySelector(".bf-baseline-range-exceptions")?.open;
  const priorMonth=el.querySelector("[data-range-month]")?.value;
  const [direction,categoryId]=id.split(":");
  const label=el.getAttribute("data-baseline-range-label")||"";
  const host=root.document.createElement("div");
  host.innerHTML=editorHtml({direction,categoryId,months:monthLists[id],label});
  const next=host.firstElementChild;
  if(next){
   next.open=opened;
   const detail=next.querySelector(".bf-baseline-range-exceptions");
   if(detail&&openedExceptions!==undefined)detail.open=openedExceptions;
   const picker=next.querySelector("[data-range-month]");
   if(picker&&priorMonth&&Array.from(picker.options).some(o=>o.value===priorMonth)){
    picker.value=priorMonth;populateSelectedMonth(next);
   }
   el.replaceWith(next);
  }
 }
}
function getDraft(id){
 if(!drafts[id])drafts[id]=JSON.parse(JSON.stringify(settingsFor(...id.split(":"))));
 return drafts[id];
}
function hasPending(direction,id){
 const key=k(direction,id),draft=drafts[key];if(!draft)return false;
 const saved=settingsFor(direction,id);
 const normalize=x=>JSON.stringify({min_pct:x.min_pct??null,max_pct:x.max_pct??null,exceptions:x.exceptions||{}});
 return normalize(draft)!==normalize(saved);
}
function discardDraft(direction,id){delete drafts[k(direction,id)]}

function message(panel,s,isError=false){
 const el=panel.querySelector("[data-range-feedback]");
 if(el){el.textContent=s;el.style.color=isError?"#b91c1c":"#166534"}
}


function install(){
 const doc=root.document;if(!doc)return;
 doc.addEventListener("input",e=>{
  const input=e.target.closest?.("[data-range-periodmin],[data-range-periodmax]");
  if(!input)return;
  const panel=input.closest("[data-baseline-range]");if(!panel)return;
  message(panel,"Valori del periodo modificati: premi Salva incertezza per applicarli ai mesi.",false);
 });
 doc.addEventListener("change",e=>{
  const selector=e.target.closest?.("[data-range-month]");
  if(selector){const panel=selector.closest("[data-baseline-range]");if(panel)populateSelectedMonth(panel)}
 });
 doc.addEventListener("click",async e=>{
  const button=e.target.closest?.("[data-range-save],[data-range-period-apply],[data-range-add],[data-range-edit],[data-range-remove],[data-range-reset],[data-range-import]");
  if(!button)return;
  const panel=button.closest("[data-baseline-range]");if(!panel)return;
  const id=panel.getAttribute("data-baseline-range"),[direction,categoryId]=id.split(":");
  try{
   if(button.hasAttribute("data-range-edit")){
    const picker=panel.querySelector("[data-range-month]");
    if(picker){picker.value=button.getAttribute("data-range-edit");populateSelectedMonth(panel);
     panel.querySelector("[data-range-monthmin]")?.focus()}
    return;
   }
   if(button.hasAttribute("data-range-add")){
    const month=panel.querySelector("[data-range-month]")?.value;
    const m=monthLists[id]?.find(x=>x.month===month&&x.kind!=="actual");
    if(!m)throw Error("Seleziona un mese futuro valido.");
    const a=panel.querySelector("[data-range-monthmin]")?.value.trim()||"";
    const b=panel.querySelector("[data-range-monthmax]")?.value.trim()||"";
    if(!a||!b)throw Error("Inserisci Min e Max del mese selezionato.");
    const lo=parseEuroInput(a),hi=parseEuroInput(b),base=numerical(m.amount),paid=floor(m);
    if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo<paid-.005||lo>base+.005||hi<base-.005||hi<lo-.005||hi>100000000)
     throw Error("Serve quota già consuntivata ≤ Min ≤ Base ≤ Max.");
    if(Math.abs(lo-base)<.005&&Math.abs(hi-base)<.005)throw Error("Min e Max coincidono con la Base: nessuna incertezza da aggiungere.");
    const draft=upgradeLegacy(getDraft(id),monthLists[id]);
    draft.exceptions[month]={type:"TOTAL",min:round(lo),max:round(hi)};
    updatePanels(id);
    message(root.document.querySelector('[data-baseline-range="'+id+'"]'),"Mese impostato nella bozza: premi Salva incertezza.");
    return;
   }
   if(button.hasAttribute("data-range-period-apply")){
    const a=panel.querySelector("[data-range-periodmin]")?.value.trim();
    const b=panel.querySelector("[data-range-periodmax]")?.value.trim();
    if(!a||!b)throw Error("Indica Min e Max del periodo.");
    const newMonths=distributePeriod(monthLists[id],parseEuroInput(a),parseEuroInput(b));
    const draft=upgradeLegacy(getDraft(id),monthLists[id]);
    const visible=new Set(monthLists[id].filter(m=>m.kind!=="actual").map(m=>m.month));
    const hasOld=Object.keys(draft.exceptions).some(m=>visible.has(m));
    if(hasOld&&root.confirm&&!root.confirm("Distribuire Min/Max su tutti i mesi futuri? Sostituirà i mesi già configurati in questo periodo."))return;
    for(const month of visible)delete draft.exceptions[month];
    Object.assign(draft.exceptions,newMonths);
    updatePanels(id);
    message(root.document.querySelector('[data-baseline-range="'+id+'"]'),"Totali distribuiti. Verifica i mesi aggiunti e premi Salva incertezza.");
    return;
   }
   if(button.hasAttribute("data-range-remove")){
    const draft=upgradeLegacy(getDraft(id),monthLists[id]);
    delete draft.exceptions[button.getAttribute("data-range-remove")];
    updatePanels(id);return;
   }
   if(button.hasAttribute("data-range-reset")){
    const draft=getDraft(id);draft.min_pct=null;draft.max_pct=null;draft.exceptions={};
    updatePanels(id);message(root.document.querySelector('[data-baseline-range="'+id+'"]'),"Premi Salva incertezza per azzerare gli intervalli.");return;
   }
   if(button.hasAttribute("data-range-import")){
    const draft=upgradeLegacy(getDraft(id),monthLists[id]);let imported=0;
    for(const [month,value] of Object.entries(previousLocal(direction,categoryId))){
     if(draft.exceptions[month])continue;
     const m=monthLists[id]?.find(x=>x.month===month&&x.kind!=="actual");
     if(!m||Math.abs(numerical(value.expected)-numerical(m.amount))>.005)continue;
     const lo=value.type==="SALARY"?numerical(value.fixed)+numerical(value.variableMin):numerical(value.min);
     const hi=value.type==="SALARY"?numerical(value.fixed)+numerical(value.variableMax):numerical(value.max);
     if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo<floor(m)-.005||lo>m.amount+.005||hi<m.amount-.005)continue;
     draft.exceptions[month]={type:"TOTAL",min:round(lo),max:round(hi)};imported++;
    }
    updatePanels(id);message(root.document.querySelector('[data-baseline-range="'+id+'"]'),imported+" ipotesi importate nella bozza. Verifica e salva.");return;
   }
   if(button.hasAttribute("data-range-save")){
    if(!loaded||!readRpc)throw Error("Database non disponibile: riprova dopo il caricamento.");
    const draft=upgradeLegacy(getDraft(id),monthLists[id]);
    const label=panel.getAttribute("data-baseline-range-label")||"";
    const current=periodSummary(direction,categoryId,draft,label);
    const lowText=panel.querySelector("[data-range-periodmin]")?.value??"";
    const highText=panel.querySelector("[data-range-periodmax]")?.value??"";
    const change=preparePeriodEdit(monthLists[id],lowText,highText,current.min,current.max);
    if(change.changed){
      const visible=new Set(monthLists[id].filter(m=>m.kind!=="actual").map(m=>m.month));
      const already=Object.keys(draft.exceptions||{}).some(m=>visible.has(m));
      if(already&&root.confirm&&!root.confirm("I nuovi Min/Max del periodo sostituiranno gli intervalli mensili già configurati nei mesi visibili. Vuoi continuare?"))return;
      for(const month of visible)delete draft.exceptions[month];
      Object.assign(draft.exceptions,change.months);
    }
    const checkRow={direction,category_id:categoryId,l2_name:label,months:monthLists[id]};
    const effective=buildAssumptions(direction==="EXPENSE"?[checkRow]:[],direction==="INCOME"?[checkRow]:[],{[id]:draft});
    if(effective.invalid.length)throw Error("Ci sono intervalli incompatibili con la Baseline: rivedi Min/Max dei mesi configurati.");
    button.disabled=true;
    await readRpc("dashboard_reporting_baseline_uncertainty_v1",{
     p_action:"SAVE",p_category_id:categoryId,p_direction:direction,
     p_min_pct:null,p_max_pct:null,p_exceptions:draft.exceptions
    });
    settings[id]=JSON.parse(JSON.stringify(draft));delete drafts[id];updatePanels(id);
    message(root.document.querySelector('[data-baseline-range="'+id+'"]'),change.changed
      ?"Min/Max del periodo salvati in Supabase e ripartiti nei mesi interessati."
      :"Intervalli salvati in Supabase.");
    changeListener();return;
   }
  }catch(err){message(panel,err.message||String(err),true)}
  finally{button.disabled=false}
 });
}

const api={monthsFromPlan,buildAssumptions,validPcts,editorHtml,load,settings:()=>settings,settingsFor,summarize,status,distributePeriod,upgradeLegacy,euroInput,parseEuroInput,preparePeriodEdit,exceptionForMonth,hasPending,discardDraft};
root.BudgetFamilyBaselineUncertainty=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==="loading")root.document.addEventListener("DOMContentLoaded",install);else install()}
})(typeof window!=="undefined"?window:globalThis);
