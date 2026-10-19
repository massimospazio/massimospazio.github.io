/* Pianificazione: un unico scenario di lavoro nel Tabellone.
   Draft in sessione, non approvato né persistito. Non modifica Baseline/Actual. */
(function(root){
"use strict";
const state={year:"",targets:{},notes:{},originals:{},bonus:"BASE",showZero:true,onlyChanged:false};
const value=r=>Number(r||0);
const money=n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value(n));
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function key(r){return String(r.direction)+":"+String(r.category_id)}
function locked(r){return (r.months||[]).reduce((s,m)=>s+(m.kind==="actual"?value(m.amount):value(m.amount)-Math.max(0,value(m.futureAmount))),0)}
function applyRows(rows){
 return rows.map(r=>{
  const k=key(r),target=state.targets[k];
  if(target===undefined)return r;
  const immutable=locked(r),planned=Math.max(immutable,value(target));
  const available=(r.months||[]).reduce((s,m)=>s+(m.kind==="actual"?0:Math.max(0,value(m.futureAmount))),0);
  const remaining=Math.max(0,planned-immutable);
  let left=remaining;
  const eligible=r.months.filter(m=>m.kind!=="actual");
  const months=r.months.map(m=>{
    if(m.kind==="actual")return {...m};
    const share=available>0?Math.max(0,value(m.futureAmount))/available:1/Math.max(1,eligible.length);
    const allocated=eligible[eligible.length-1]===m?left:Math.min(left,remaining*share);
    left-=allocated;
    return {...m,amount:value(m.amount)-Math.max(0,value(m.futureAmount))+allocated,futureAmount:allocated};
  });
  return {...r,annual:planned,deltaAbs:planned-value(r.comparison),deltaPct:value(r.comparison)>0?(planned/value(r.comparison)-1)*100:null,months};
 });
}
function totals(rows){return rows.reduce((a,r)=>a+value(r.annual),0)}
function resetIfYearChanged(year){
 if(state.year===year)return;
 state.year=year;state.targets={};state.notes={};state.originals={};state.bonus="BASE";
}
async function approve(){
 if(Object.keys(state.targets).length===0){root.alert("Non hai modificato alcun target: non c'è un nuovo Piano strategico da approvare.");return}
 if(!root.confirm("Approvare il Piano per "+state.year+"?\\n\\nI target e le note saranno congelati in una nuova versione e la Baseline resterà invariata."))return;
 const reason=root.prompt("Motivo dell'approvazione (8-600 caratteri)","Piano familiare: obiettivi e impegni di spesa concordati");
 if(reason===null)return;
 if(reason.trim().length<8||reason.trim().length>600){root.alert("Inserisci una motivazione di 8-600 caratteri.");return}
 const button=root.document.querySelector("[data-bf-draft-approve]");
 if(button)button.disabled=true;
 try{
  if(!root.budgetFamilyPlanRpc)throw new Error("Connessione al database non disponibile");
  const result=await root.budgetFamilyPlanRpc("dashboard_family_strategic_plan_v1",{
   p_year:Number(state.year),p_note:reason.trim(),p_targets:state.targets,p_notes:state.notes
  });
  if(!result||!result.plan)throw new Error("La risposta non contiene il Piano approvato");
  state.targets={};state.notes={};
  await root.BudgetFamilyPlan?.reload?.();
  root.renderPlanningBoard?.();
  root.alert("Piano approvato come versione V"+result.plan.revision+". Gli importi e le note sono congelati.");
 }catch(error){
  root.alert("Approvazione non completata: "+String(error?.message||error));
 }finally{if(button)button.disabled=false}
}
function render(originalExp,originalInc,isPlan){
 const wrapper=root.document.getElementById("bfSinglePlanDraft");if(!wrapper)return;
 wrapper.hidden=!isPlan;
 if(!isPlan)return;
 const exp=applyRows(originalExp),inc=applyRows(originalInc);
 const baseline=totals(originalInc)-totals(originalExp),planned=totals(inc)-totals(exp),improvement=planned-baseline;
 let html='<div class="bf-plan-inline-head"><div class="bf-plan-inline-kpis">'+
 [['Avanzo Baseline',baseline],['Avanzo Piano',planned],['Δ vs Baseline',improvement]].map(([name,n])=>
 '<div class="bf-plan-inline-kpi"><span>'+name+'</span><strong class="'+(n>=0?'bf-pos':'bf-neg')+'">'+money(n)+'</strong></div>').join('')+
 '</div><div class="bf-plan-inline-actions"><label>Entrate <select data-bf-draft-risk><option value="LOW"'+(state.bonus==="LOW"?' selected':'')+'>Prudente</option><option value="BASE"'+(state.bonus==="BASE"?' selected':'')+'>Base</option><option value="HIGH"'+(state.bonus==="HIGH"?' selected':'')+'>Favorevole</option></select></label>'+
 '<button type="button" class="btn ghost compact" data-bf-draft-reset>Ripristina</button>'+
 '<button type="button" class="btn compact" data-bf-draft-approve>Approva Piano</button></div></div>';
 const low=originalInc.reduce((sum,r)=>sum+value(r.rangeLow===undefined?r.annual:r.rangeLow),0);
 const high=originalInc.reduce((sum,r)=>sum+value(r.rangeHigh===undefined?r.annual:r.rangeHigh),0);
 const variation=state.bonus==="LOW"?low-totals(originalInc):state.bonus==="HIGH"?high-totals(originalInc):0;
 html+='<p class="bf-plan-inline-hint">Stress test avanzo: <strong>'+money(planned+variation)+'</strong> · Modifica gli importi direttamente nelle righe L2. Le categorie con Baseline 0 sono incluse. Gli Actual già registrati sono protetti.</p>';
 wrapper.innerHTML=html;
}
function inlineAmount(row){
 const k=key(row),base=state.originals[k]||row,amount=state.targets[k]===undefined?value(base.annual):Math.max(locked(base),value(state.targets[k]));
 return '<div class="bf-plan-edit-cell"><input type="number" step="1" min="'+locked(base).toFixed(2)+'" data-bf-draft-total="'+escape(k)+'" value="'+amount.toFixed(2)+'" aria-label="Piano annuale '+escape(row.l2_name)+'" title="Budget annuale; già speso '+money(locked(base))+'"><small>Ø '+money(amount/12)+'/mese</small></div>';
}
function inlineNote(row){
 const k=key(row),note=state.notes[k]||"",baselineNote=row.meta?.rationale_note||"";
 return '<button class="bf-plan-note-button '+(note?'has-note':'')+'" type="button" data-bf-note-open="'+escape(k)+'" title="'+escape('Baseline: '+(baselineNote||'nessuna nota')+' | Piano: '+(note||'aggiungi impegno'))+'">✎'+(note?' ●':'')+'</button>';
}
function isChanged(row){return state.targets[key(row)]!==undefined && Math.abs(value(state.targets[key(row)])-value(state.originals[key(row)]?.annual))>=.5}
function showOnlyChanged(){return state.onlyChanged}

function onChange(e){
 if(e.target.hasAttribute("data-bf-only-changed")){state.onlyChanged=!!e.target.checked;root.renderPlanningBoard?.();return}
 if(e.target.hasAttribute("data-bf-draft-zero")){state.showZero=!!e.target.checked;root.renderPlanningBoard?.();return}
 if(e.target.hasAttribute("data-bf-draft-risk")){
  state.bonus=e.target.value;root.renderPlanningBoard?.();return;
 }
 let attr,monthly=false;
 if(e.target.hasAttribute("data-bf-draft-total"))attr="data-bf-draft-total";
 if(e.target.hasAttribute("data-bf-draft-month")){attr="data-bf-draft-month";monthly=true}
 if(e.target.hasAttribute("data-bf-draft-note")){
  state.notes[e.target.getAttribute("data-bf-draft-note")]=e.target.value;
  return;
 }
 if(!attr)return;
 const id=e.target.getAttribute(attr),base=state.originals[id];if(!base)return;
 const n=Number(e.target.value);
 if(!Number.isFinite(n)||n<0)return;
 state.targets[id]=Math.max(locked(base),monthly?n*12:n);
 root.renderPlanningBoard?.();
}
function init(){
 const node=root.document.getElementById("planningBoardOverview");if(!node)return;
 const panel=root.document.createElement("section");panel.id="bfSinglePlanDraft";panel.className="bf-single-plan-draft";panel.hidden=true;
 node.parentElement.after(panel);
 panel.addEventListener("change",onChange);
 root.document.getElementById("planningBoardBody")?.addEventListener("change",onChange);
 root.document.getElementById("planningBoardBody")?.addEventListener("click",e=>{
  const k=e.target.closest("[data-bf-note-open]")?.getAttribute("data-bf-note-open");if(!k)return;
  const row=state.originals[k];if(!row)return;
  const baseline=row.meta?.rationale_note||"Nessuna nota";
  const note=root.prompt("Nota Baseline (sola lettura): "+baseline+"\\n\\nNota Piano / impegno:",state.notes[k]||"");
  if(note===null)return;
  state.notes[k]=note.slice(0,400);root.renderPlanningBoard?.();
 });
 panel.addEventListener("click",e=>{if(e.target.closest("[data-bf-draft-approve]")){approve();return}if(e.target.closest("[data-bf-draft-reset]")){state.targets={};state.notes={};root.renderPlanningBoard?.()}});
}
root.BudgetFamilySinglePlan={
 prepare(exp,inc,year){resetIfYearChanged(year);[...exp,...inc].forEach(r=>state.originals[key(r)]=r);return {exp:applyRows(exp),inc:applyRows(inc)}},
 render,inlineAmount,inlineNote,isChanged,showOnlyChanged,details(){return {year:state.year,targets:{...state.targets},notes:{...state.notes}}},
 isDraft(){return Object.keys(state.targets).length>0}
};
if(typeof module!=="undefined"&&module.exports)module.exports={locked,applyRows,state};
if(root.document){if(root.document.getElementById("planningBoardOverview"))init();else if(root.document.readyState==="loading")root.document.addEventListener("DOMContentLoaded",init);else init()}
})(typeof window!=="undefined"?window:globalThis);
