/* Pianificazione: un unico scenario di lavoro nel Tabellone.
   Bozza salvata automaticamente nel browser, non approvata. Non modifica Baseline/Actual. */
(function(root){
"use strict";
const state={year:"",horizon:"CALENDAR",targets:{},notes:{},originals:{},bonus:"BASE",targetUnit:"TOTAL",showZero:true,onlyChanged:false,reserve:0,project:0};
const drafts={};
const STORAGE_KEY="budget-family-scenario-drafts-v1";
let saveError=false;
function snapshot(){return {targets:{...state.targets},notes:{...state.notes},reserve:state.reserve,project:state.project,bonus:state.bonus,targetUnit:state.targetUnit}}
function persist(){
 if(!state.year)return false;
 drafts[state.year+"|"+state.horizon]=snapshot();
 try{
  root.localStorage?.setItem(STORAGE_KEY,JSON.stringify({format:1,drafts}));
  saveError=false;return true;
 }catch(e){saveError=true;return false}
}
function restore(){
 try{
  const raw=JSON.parse(root.localStorage?.getItem(STORAGE_KEY)||"null");
  if(!raw||raw.format!==1||typeof raw.drafts!=="object"||!raw.drafts)return;
  for(const [k,v] of Object.entries(raw.drafts)){
   if(!/^\d{4}\|(CALENDAR|ROLLING_12)$/.test(k)||!v||typeof v!=="object")continue;
   const targets={};
   for(const [id,amount] of Object.entries(v.targets||{})){
    if(/^(EXPENSE|INCOME):[a-f0-9-]{36}$/i.test(id)&&Number.isFinite(Number(amount))&&Number(amount)>=0)targets[id]=Number(amount);
   }
   drafts[k]={targets,notes:v.notes||{},reserve:Number(v.reserve)||0,project:Number(v.project)||0,bonus:["LOW","BASE","HIGH"].includes(v.bonus)?v.bonus:"BASE",targetUnit:v.targetUnit==="MONTH"?"MONTH":"TOTAL"};
  }
 }catch(e){saveError=true}
}
restore();
const value=r=>Number(r||0);
const integer=n=>Math.round(value(n)).toLocaleString("it-IT",{maximumFractionDigits:0});
const parseInteger=s=>{const x=String(s??"").trim().replace(/[.\s\u00a0]/g,"").replace(",",".");return /^\d+(?:\.\d+)?$/.test(x)?Number(x):NaN};
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
function scenarioPreset(preset){
 const rows=Object.values(state.originals);
 const exp=rows.filter(r=>r.direction==="EXPENSE");
 const baseline=rows.filter(r=>r.direction==="INCOME").reduce((n,r)=>n+value(r.annual),0)-exp.reduce((n,r)=>n+value(r.annual),0);
 const disc=exp.filter(r=>r.meta?.expense_nature==="DISCRETIONARY");
 const remainingD=disc.reduce((n,r)=>n+Math.max(0,value(r.annual)-locked(r)),0);
 let d=1,n=1;
 if(preset==="D25")d=.75;
 else if(preset==="D50")d=.5;
 else if(preset==="D100")d=0;
 else if(preset==="N10_D50"){d=.5;n=.9}
 else if(preset==="GOAL")d=remainingD>0?Math.max(0,1-Math.max(0,state.reserve+state.project-baseline)/remainingD):1;
 else if(preset!=="RESET")return;
 state.targets={};
 for(const row of exp){
  const kind=row.meta?.expense_nature;
  const factor=kind==="DISCRETIONARY"?d:kind==="NECESSARY"?n:1;
  if(factor===1)continue;
  const immutable=locked(row),future=Math.max(0,value(row.annual)-immutable);
  if(future>.005)state.targets[key(row)]=immutable+future*factor;
 }
 persist();root.renderPlanningBoard?.();
}
function resetIfYearChanged(year,horizon){
 const next=year+"|"+horizon,prev=state.year+"|"+state.horizon;
 if(next===prev)return;
 if(state.year)persist();
 const saved=drafts[next]||{};
 state.year=year;state.horizon=horizon;state.targets=saved.targets||{};state.notes=saved.notes||{};state.originals={};state.bonus=saved.bonus||"BASE";state.targetUnit=saved.targetUnit||"TOTAL";state.reserve=saved.reserve||0;state.project=saved.project||0;
}
async function approve(){
 if(state.horizon==="ROLLING_12"){root.alert("La simulazione rolling è una bozza di prova: approvazione disabilitata finché il piano pluriennale non è supportato.");return}
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
  state.targets={};state.notes={};persist();
  await root.BudgetFamilyPlan?.reload?.();
  root.renderPlanningBoard?.();
  root.alert("Piano approvato come versione V"+result.plan.revision+". Gli importi e le note sono congelati.");
 }catch(error){
  root.alert("Approvazione non completata: "+String(error?.message||error));
 }finally{if(button)button.disabled=false}
}
function render(originalExp,originalInc,isPlan,context){
 const strategy=context==="STRATEGY";
 const wrapper=root.document.getElementById("bfSinglePlanDraft");if(!wrapper)return;
 wrapper.hidden=!isPlan;
 if(!isPlan)return;
 const exp=applyRows(originalExp),inc=applyRows(originalInc);
 const baseline=totals(originalInc)-totals(originalExp),planned=totals(inc)-totals(exp),improvement=planned-baseline;
 let html='<div class="bf-plan-inline-head"><div class="bf-strategy-intro"><strong>'+
 (strategy?'Strategia · Elabora il tuo scenario':'Piano · Rifinisci e approva')+'</strong>'+
 '<span> '+(strategy?'Usa le leve o modifica i target L2 nella tabella sottostante.':'Lo scenario viene dalla Strategia e mantiene gli stessi target L2.')+'</span></div>'+
 '<div class="bf-plan-inline-actions"><label>Entrate <select data-bf-draft-risk>'+
 '<option value="LOW"'+(state.bonus==="LOW"?' selected':'')+'>Prudente</option>'+
 '<option value="BASE"'+(state.bonus==="BASE"?' selected':'')+'>Base</option>'+
 '<option value="HIGH"'+(state.bonus==="HIGH"?' selected':'')+'>Favorevole</option></select></label>'+
 '<label>Target L2 <select data-bf-target-unit><option value="TOTAL"'+(state.targetUnit==="TOTAL"?" selected":"")+'>Totale periodo</option><option value="MONTH"'+(state.targetUnit==="MONTH"?" selected":"")+'>Media mensile</option></select></label>'+
 '<button type="button" class="btn ghost compact" data-bf-draft-reset>Ripristina target</button>'+
 (strategy?'<button type="button" class="btn compact" data-bf-draft-to-plan>Prosegui al Piano →</button>':
 '<button type="button" class="btn compact" '+(state.horizon==='ROLLING_12'?'disabled title="Approvazione rolling in sviluppo" ':'')+'data-bf-draft-approve>Approva Piano</button>')+'</div></div>';
 const low=originalInc.reduce((sum,r)=>sum+value(r.rangeLow===undefined?r.annual:r.rangeLow),0);
 const high=originalInc.reduce((sum,r)=>sum+value(r.rangeHigh===undefined?r.annual:r.rangeHigh),0);
 const variation=state.bonus==="LOW"?low-totals(originalInc):state.bonus==="HIGH"?high-totals(originalInc):0;
 html+='<p class="bf-plan-inline-hint">Stress test avanzo: <strong>'+money(planned+variation)+'</strong> · Modifica gli importi direttamente nelle righe L2. Le categorie con Baseline 0 sono incluse. Gli Actual già registrati sono protetti.</p>';
 if(strategy){
 const goal=state.reserve+state.project,free=planned-goal;
 html+='<details class="bf-strategy-fund" '+(goal?'open':'')+'><summary>Fondi e obiettivi · '+(goal?money(goal)+' destinati':'configura quando serve')+'</summary><div class="bf-strategy-controls"><div class="bf-strategy-goals">'+
 '<label>Fondo da finanziare (€)<input type="text" inputmode="numeric" pattern="[0-9.]*" data-bf-draft-goal="reserve" value="'+integer(state.reserve)+'"></label>'+
 '<label>Progetto / viaggio (€)<input type="text" inputmode="numeric" pattern="[0-9.]*" data-bf-draft-goal="project" value="'+integer(state.project)+'"></label>'+
 '<div class="bf-strategy-result"><span>Avanzo dopo obiettivi</span><strong class="'+(free>=0?'bf-pos':'bf-neg')+'">'+money(free)+'</strong>'+
 '<small>Gap da coprire: '+money(Math.max(0,-free))+'</small></div></div></div></details>'+
 '<div class="bf-strategy-presets"><span>Leve rapide:</span>'+
 [['RESET','Baseline invariata'],['D25','D −25%'],['D50','D −50%'],['D100','D −100%'],['N10_D50','N −10% · D −50%'],['GOAL','Copri obiettivi con D']].map(([id,label])=>
 '<button type="button" class="btn ghost compact" data-bf-strategy-preset="'+id+'">'+label+'</button>').join('')+
 '</div><p class="bf-plan-inline-hint">Gli obiettivi sono destinazioni di avanzo, non nuove spese. Le leve modificano solo importi futuri delle categorie L2. La simulazione rolling 12m è una bozza di prova distinta dal piano annuale; non è approvabile. Passando da un periodo all’altro le modifiche rimangono in sessione.</p>';
 }
 if(strategy){
  const cutsN=[0,-5,-10,-15,-20],cutsD=[0,-10,-25,-40,-50];
  const outcomes=(n,d)=>{
    const spend=originalExp.reduce((sum,r)=>{
      const nature=r.meta?.expense_nature;
      const rate=nature==="NECESSARY"?n:nature==="DISCRETIONARY"?d:0;
      return sum+value(r.annual)+Math.max(0,value(r.annual)-locked(r))*rate/100;
    },0);
    return totals(originalInc)-spend;
  };
  html+='<details class="bf-strategy-matrix" open><summary>Scenari N / D · 25 combinazioni</summary>'+
   '<p class="bf-plan-inline-hint">Riduzioni soltanto sulle quote future di spese Necessarie (N) e Discrezionali (D). Ogni cella mostra l’avanzo del periodo, prima degli obiettivi. Clicca per applicare.</p>'+
   '<div class="bf-strategy-matrix-scroll"><table><thead><tr><th>N / D</th>'+
   cutsD.map(d=>'<th>'+d+'%</th>').join('')+'</tr></thead><tbody>'+
   cutsN.map(n=>'<tr><th>'+n+'%</th>'+cutsD.map(d=>{
    const outcome=outcomes(n,d);
    return '<td><button type="button" class="'+(outcome>=0?'positive':'negative')+'" data-bf-matrix-n="'+n+'" data-bf-matrix-d="'+d+'" title="Necessarie '+n+'%, Discrezionali '+d+'%">'+money(outcome)+'</button></td>';
   }).join('')+'</tr>').join('')+'</tbody></table></div></details>';
 }
 html+='<div class="bf-draft-save-status" role="status">'+(saveError?'⚠ Salvataggio automatico non disponibile in questo browser':'✓ Bozza salvata automaticamente su questo dispositivo')+' · <button class="btn ghost compact" type="button" data-bf-draft-save>Salva bozza</button></div>';
 wrapper.innerHTML=html;
}
function inlineAmount(row){
 const k=key(row),base=state.originals[k]||row,amount=state.targets[k]===undefined?value(base.annual):Math.max(locked(base),value(state.targets[k]));
 const monthly=state.targetUnit==="MONTH";
 return '<div class="bf-plan-edit-cell"><input type="text" inputmode="numeric" pattern="[0-9.]*" '+(monthly?'data-bf-draft-month':'data-bf-draft-total')+'="'+escape(k)+'" value="'+integer(monthly?amount/12:amount)+'" aria-label="'+(monthly?'Media mensile':'Totale annuo')+' '+escape(row.l2_name)+'" title="'+(monthly?'Media mese (totale annuo diviso 12)':'Budget annuale')+'; già speso '+money(locked(base))+'"><small>'+(monthly?'Totale '+money(amount):'Ø '+money(amount/12)+'/mese')+'</small></div>';
}
function inlineNote(row){
 const k=key(row),note=state.notes[k]||"",baselineNote=row.meta?.rationale_note||"";
 return '<button class="bf-plan-note-button '+(note?'has-note':'')+'" type="button" data-bf-note-open="'+escape(k)+'" title="'+escape('Baseline: '+(baselineNote||'nessuna nota')+' | Piano: '+(note||'aggiungi impegno'))+'" aria-label="'+escape('Note '+row.l2_name+(baselineNote?' — nota Baseline presente':''))+'">✎'+(baselineNote?' ⓘ':'')+(note?' ●':'')+'</button>';
}
function isChanged(row){return state.targets[key(row)]!==undefined && Math.abs(value(state.targets[key(row)])-value(state.originals[key(row)]?.annual))>=.5}
function showOnlyChanged(){return state.onlyChanged}

function onChange(e){
 if(e.target.hasAttribute("data-bf-draft-goal")){
  const name=e.target.getAttribute("data-bf-draft-goal"),n=parseInteger(e.target.value);
  if((name==="reserve"||name==="project")&&Number.isFinite(n)&&n>=0){state[name]=Math.min(n,10000000);persist();root.renderPlanningBoard?.();}
  return;
 }
 if(e.target.hasAttribute("data-bf-only-changed")){state.onlyChanged=!!e.target.checked;root.renderPlanningBoard?.();return}
 if(e.target.hasAttribute("data-bf-draft-zero")){state.showZero=!!e.target.checked;root.renderPlanningBoard?.();return}
 if(e.target.hasAttribute("data-bf-target-unit")){state.targetUnit=e.target.value==="MONTH"?"MONTH":"TOTAL";persist();root.renderPlanningBoard?.();return}
 if(e.target.hasAttribute("data-bf-draft-risk")){
  state.bonus=e.target.value;persist();root.renderPlanningBoard?.();return;
 }
 let attr,monthly=false;
 if(e.target.hasAttribute("data-bf-draft-total"))attr="data-bf-draft-total";
 if(e.target.hasAttribute("data-bf-draft-month")){attr="data-bf-draft-month";monthly=true}
 if(e.target.hasAttribute("data-bf-draft-note")){
  state.notes[e.target.getAttribute("data-bf-draft-note")]=e.target.value;persist();
  return;
 }
 if(!attr)return;
 const id=e.target.getAttribute(attr),base=state.originals[id];if(!base)return;
 const n=parseInteger(e.target.value);
 if(!Number.isFinite(n)||n<0)return;
 state.targets[id]=Math.max(locked(base),monthly?n*12:n);
 persist();root.renderPlanningBoard?.();
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
  state.notes[k]=note.slice(0,400);persist();root.renderPlanningBoard?.();
 });
 panel.addEventListener("click",e=>{
  const preset=e.target.closest("[data-bf-strategy-preset]");
  if(preset){scenarioPreset(preset.getAttribute("data-bf-strategy-preset"));return}
  const matrix=e.target.closest("[data-bf-matrix-n]");if(matrix){
    const n=Number(matrix.dataset.bfMatrixN),d=Number(matrix.dataset.bfMatrixD);
    state.targets={};
    Object.values(state.originals).filter(r=>r.direction==="EXPENSE").forEach(r=>{
      const nature=r.meta?.expense_nature,rate=nature==="NECESSARY"?n:nature==="DISCRETIONARY"?d:0;
      if(rate)state.targets[key(r)]=locked(r)+Math.max(0,value(r.annual)-locked(r))*(1+rate/100);
    });
    persist();root.renderPlanningBoard?.();return;
  }
  if(e.target.closest("[data-bf-draft-to-plan]")){root.showPlanningBoardView?.("PLAN");return}
  if(e.target.closest("[data-bf-draft-approve]")){approve();return}
  if(e.target.closest("[data-bf-draft-save]")){persist();root.renderPlanningBoard?.();return}
  if(e.target.closest("[data-bf-draft-reset]")){state.targets={};state.notes={};persist();root.renderPlanningBoard?.()}
 });
}
root.BudgetFamilySinglePlan={
 prepare(exp,inc,year,horizon){resetIfYearChanged(year,horizon||'CALENDAR');[...exp,...inc].forEach(r=>state.originals[key(r)]=r);return {exp:applyRows(exp),inc:applyRows(inc)}},
 render,inlineAmount,inlineNote,isChanged,showOnlyChanged,scenarioPreset,details(){return {year:state.year,targets:{...state.targets},notes:{...state.notes},reserve:state.reserve,project:state.project,targetUnit:state.targetUnit}},
 isDraft(){return Object.keys(state.targets).length>0}
};
if(typeof module!=="undefined"&&module.exports)module.exports={locked,applyRows,scenarioPreset,state};
if(root.document){if(root.document.getElementById("planningBoardOverview"))init();else if(root.document.readyState==="loading")root.document.addEventListener("DOMContentLoaded",init);else init()}
})(typeof window!=="undefined"?window:globalThis);
