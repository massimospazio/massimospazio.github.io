/* Pianificazione: un unico scenario di lavoro nel Tabellone.
   Bozza salvata esplicitamente nel browser, non approvata. Non modifica Baseline/Actual. */
(function(root){
"use strict";
const state={year:"",horizon:"CALENDAR",targets:{},monthTargets:{},notes:{},originals:{},bonus:"BASE",targetUnit:"TOTAL",showZero:true,onlyChanged:false,reserve:0,project:0};
const drafts={};
const savedDrafts={};
let justSaved=false;
const STORAGE_KEY="budget-family-scenario-drafts-v1";
let saveError=false;
let revisionSource=null;
let rollingTransfer=null;
let rollingApprovalNeedsRevision=false;
function revisionActive(){return !!revisionSource&&state.horizon==='CALENDAR'}
function cancelRevision(){
 if(!revisionActive())return false;
 if(isDirty()&&!root.confirm('Chiudere la revisione? Le modifiche non salvate verranno scartate.'))return false;
 const key=state.year+'|'+state.horizon;
 const saved=savedDrafts[key]||{};
 state.targets={...(saved.targets||{})};state.monthTargets=JSON.parse(JSON.stringify(saved.monthTargets||{}));
 state.notes={...(saved.notes||{})};revisionSource=null;
 persist();root.renderPlanningBoard?.();return true;
}
function startRevision(plan){
 const st=plan?.meta?.strategic_plan;
 if(st?.kind!=='STRATEGIC'||state.horizon!=='CALENDAR')return false;
 if(!rollingApprovalNeedsRevision&&isDirty()&&!root.confirm('La bozza ha modifiche non salvate. Caricare il Piano approvato per la revisione?'))return false;
 const rollingEdits=rollingApprovalNeedsRevision?{targets:{...state.targets},monthTargets:JSON.parse(JSON.stringify(state.monthTargets)),notes:{...state.notes}}:null;
 state.targets={...(st.targets||{})};
 state.notes={...(st.notes||{})};
 state.monthTargets=JSON.parse(JSON.stringify(st.month_targets||{}));
 if(rollingEdits){Object.assign(state.targets,rollingEdits.targets);Object.assign(state.monthTargets,rollingEdits.monthTargets);Object.assign(state.notes,rollingEdits.notes);rollingApprovalNeedsRevision=false;}
 revisionSource={revision:plan.revision,year:state.year};
 persist();root.renderPlanningBoard?.();return true;
}

function snapshot(){return {targets:{...state.targets},monthTargets:JSON.parse(JSON.stringify(state.monthTargets)),notes:{...state.notes},reserve:state.reserve,project:state.project,bonus:state.bonus,targetUnit:state.targetUnit}}
function persist(){
 if(!state.year)return false;
 drafts[state.year+"|"+state.horizon]=snapshot();justSaved=false;return true;
}
function isDirty(){
 if(!state.year)return false;
 const k=state.year+"|"+state.horizon;
 const saved=savedDrafts[k]||{targets:{},monthTargets:{},notes:{},reserve:0,project:0,bonus:"BASE",targetUnit:"TOTAL"};
 return JSON.stringify(snapshot())!==JSON.stringify(saved);
}
function discardUnsaved(){
 if(!isDirty())return false;
 const label=state.horizon==="ROLLING_12"?"prossimi 12 mesi":"anno "+state.year;
 if(!root.confirm("Annullare le modifiche non salvate per "+label+"?\n\nVerrà ripristinata l’ultima bozza salvata (oppure la Baseline se non ne esiste una)."))return false;
 const saved=savedDrafts[state.year+"|"+state.horizon]||{targets:{},monthTargets:{},notes:{},reserve:0,project:0,bonus:"BASE",targetUnit:"TOTAL"};
 state.targets={...saved.targets};state.monthTargets=JSON.parse(JSON.stringify(saved.monthTargets||{}));state.notes={...saved.notes};
 state.reserve=saved.reserve||0;state.project=saved.project||0;
 state.bonus=saved.bonus||"BASE";state.targetUnit=saved.targetUnit||"TOTAL";
 persist();saveError=false;
 root.renderPlanningBoard?.();
 return true;
}
function resetCategoryToBaseline(id){
 if(!Object.prototype.hasOwnProperty.call(state.originals,id)||
   (!Object.prototype.hasOwnProperty.call(state.targets,id)&&!Object.prototype.hasOwnProperty.call(state.monthTargets,id)))return false;
 delete state.targets[id];delete state.monthTargets[id];
 persist();root.renderPlanningBoard?.();
 return true;
}
function saveDraft(){
 persist();
 try{
  const newSaved={...savedDrafts,[state.year+"|"+state.horizon]:snapshot()};
  root.localStorage.setItem(STORAGE_KEY,JSON.stringify({format:1,drafts:newSaved}));
  savedDrafts[state.year+"|"+state.horizon]=JSON.parse(JSON.stringify(snapshot()));
  saveError=false;justSaved=true;return true;
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
   const monthTargets={};
   for(const [id,calendar] of Object.entries(v.monthTargets||{})){
    if(!/^(EXPENSE|INCOME):[a-f0-9-]{36}$/i.test(id)||!calendar||typeof calendar!=="object"||Array.isArray(calendar))continue;
    const months={};
    for(const [m,amount] of Object.entries(calendar)){
     if(/^\d{4}-\d{2}-01$/.test(m)&&Number.isFinite(Number(amount))&&Number(amount)>=0&&Number(amount)<=100000000)months[m]=Number(amount);
    }
    if(Object.keys(months).length)monthTargets[id]=months;
   }
   drafts[k]={targets,monthTargets,notes:v.notes||{},reserve:Number(v.reserve)||0,project:Number(v.project)||0,bonus:["LOW","BASE","HIGH"].includes(v.bonus)?v.bonus:"BASE",targetUnit:v.targetUnit==="MONTH"?"MONTH":"TOTAL"};
   savedDrafts[k]=JSON.parse(JSON.stringify(drafts[k]));
  }
 }catch(e){saveError=true}
}
restore();
const value=r=>Number(r||0);
const integer=n=>String(Math.round(value(n))).replace(/\B(?=(\d{3})+(?!\d))/g,".");
const parseInteger=s=>{const x=String(s??"").trim().replace(/[.\s\u00a0]/g,"").replace(",",".");return /^\d+(?:\.\d+)?$/.test(x)?Number(x):NaN};
const money=n=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(value(n));
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function key(r){return String(r.direction)+":"+String(r.category_id)}
function locked(r){return (r.months||[]).reduce((s,m)=>s+(m.kind==="actual"?value(m.amount):value(m.amount)-Math.max(0,value(m.futureAmount))),0)}
function round2(n){return Math.round((value(n)+Number.EPSILON)*100)/100}
function fixedMonth(m){return m.kind==="actual"?value(m.amount):Math.max(0,value(m.amount)-Math.max(0,value(m.futureAmount)))}
function applyRows(rows){
 return rows.map(r=>{
  const k=key(r),target=state.targets[k],manual=state.monthTargets[k]||{};
  if(target===undefined&&!Object.keys(manual).length)return r;
  const editable=(r.months||[]).filter(m=>m.kind!=="actual");
  const fixed=round2(locked(r));
  const manualFuture=round2(editable.reduce((sum,m)=>sum+
   (Object.prototype.hasOwnProperty.call(manual,m.month)?
    Math.max(0,value(manual[m.month])-fixedMonth(m)):0),0));
  const planned=round2(Math.max(fixed+manualFuture,value(target===undefined?r.annual:target)));
  const auto=editable.filter(m=>!Object.prototype.hasOwnProperty.call(manual,m.month));
  const autoWeight=auto.reduce((sum,m)=>sum+Math.max(0,value(m.futureAmount)),0);
  const remaining=round2(Math.max(0,planned-fixed-manualFuture));
  let left=remaining;
  const months=(r.months||[]).map(m=>{
   if(m.kind==="actual")return {...m};
   const own=Object.prototype.hasOwnProperty.call(manual,m.month);
   if(own){
    const amount=round2(Math.max(fixedMonth(m),value(manual[m.month])));
    return {...m,amount,futureAmount:round2(amount-fixedMonth(m)),scenarioOverride:true};
   }
   const share=autoWeight>.00001?Math.max(0,value(m.futureAmount))/autoWeight:1/Math.max(1,auto.length);
   const allocated=auto[auto.length-1]===m?left:Math.min(left,round2(remaining*share));
   left=round2(left-allocated);
   return {...m,amount:round2(fixedMonth(m)+allocated),futureAmount:allocated,scenarioOverride:false};
  });
  const annual=round2(months.reduce((sum,m)=>sum+value(m.amount),0));
  return {...r,annual,deltaAbs:annual-value(r.comparison),
    deltaPct:value(r.comparison)>0?(annual/value(r.comparison)-1)*100:null,months};
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
 state.targets={};state.monthTargets={};
 for(const row of exp){
  const kind=row.meta?.expense_nature;
  const factor=kind==="DISCRETIONARY"?d:kind==="NECESSARY"?n:1;
  if(factor===1)continue;
  const immutable=locked(row),future=Math.max(0,value(row.annual)-immutable);
  if(future>.005)state.targets[key(row)]=immutable+future*factor;
 }
 persist();root.renderPlanningBoard?.();
}
// Apply only discretionary decisions from the decision matrix.
// Income Min/Max remain scenario assumptions, never silently converted to sliders.
function applyDecisionTargets(changes){
 if(!state.year||!changes||typeof changes!=="object")return false;
 const discretionaries=Object.entries(state.originals).filter(([,r])=>
  r.direction==="EXPENSE"&&r.meta?.expense_nature==="DISCRETIONARY");
 if(!discretionaries.length)return false;
 // Validate the whole request before touching draft state (all-or-nothing).
 for(const [,r] of discretionaries){
  const raw=changes[String(r.category_id)];
  if(raw===undefined)continue;
  const n=Number(raw);
  if(!Number.isFinite(n)||n<locked(r)-.005||n<0)return false;
 }
 const replacing=discretionaries.some(([id])=>state.targets[id]!==undefined||
  Object.keys(state.monthTargets[id]||{}).length>0);
 if(replacing&&!root.confirm("Applicare le scelte D della matrice? I target discrezionali e gli eventuali mesi manuali della bozza saranno sostituiti. Le altre voci, le note e la Baseline rimarranno invariati."))return false;
 for(const [id,r] of discretionaries){
  delete state.targets[id];delete state.monthTargets[id];
  const raw=changes[String(r.category_id)];
  if(raw===undefined)continue;
  const n=Number(raw);
  if(Math.abs(n-value(r.annual))>.005)state.targets[id]=round2(n);
 }
 persist();root.renderPlanningBoard?.();
 return true;
}
function reviewRollingApproval(){
 const edits={},year=state.year;
 for(const [id,base] of Object.entries(state.originals)){
  if(state.targets[id]===undefined&&!Object.keys(state.monthTargets[id]||{}).length)continue;
  const months=applyRows([base])[0].months.filter(m=>m.kind!=="actual"&&String(m.month).slice(0,4)===year);
  if(months.length)edits[id]=Object.fromEntries(months.map(m=>[m.month,round2(m.amount)]));
 }
 if(!Object.keys(edits).length){
  if(root.confirm("La vista rolling non contiene modifiche all’anno corrente. Passare alla vista annuale per verificare e approvare il Piano?"))root.document.querySelector('[data-planning-horizon="CALENDAR"]')?.click();
  return;
 }
 if(!root.confirm("Trasferire i target rolling alla bozza annuale? Solo i mesi dell'anno corrente saranno approvabili; verifica gli importi prima di confermare."))return;
 rollingTransfer={year,edits,notes:{...state.notes}};
 root.document.querySelector('[data-planning-horizon="CALENDAR"]')?.click();
}
function applyRollingTransfer(exp,inc){
 const p=rollingTransfer;if(!p||state.horizon!=="CALENDAR"||state.year!==p.year)return;
 rollingTransfer=null;
 rollingApprovalNeedsRevision=true;
 const rows=new Map([...exp,...inc].map(r=>[key(r),r]));
 for(const [id,months] of Object.entries(p.edits)){
  const row=rows.get(id);if(!row)continue;
  const editable=row.months.filter(m=>m.kind!=="actual"&&Object.prototype.hasOwnProperty.call(months,m.month));
  if(!editable.length)continue;
  state.monthTargets[id]=Object.fromEntries(editable.map(m=>[m.month,months[m.month]]));
  state.targets[id]=round2(value(row.annual)+editable.reduce((n,m)=>n+months[m.month]-value(m.amount),0));
 }
 Object.assign(state.notes,p.notes);persist();
 root.alert("Bozza annuale aggiornata. Verifica i target e premi Approva Piano.");
}
function resetIfYearChanged(year,horizon){
 const next=year+"|"+horizon,prev=state.year+"|"+state.horizon;
 if(next===prev)return;
 if(state.year)persist();
 revisionSource=null;
 const saved=drafts[next]||{};
 state.year=year;state.horizon=horizon;state.targets={...(saved.targets||{})};state.monthTargets=JSON.parse(JSON.stringify(saved.monthTargets||{}));state.notes={...(saved.notes||{})};state.originals={};state.bonus=saved.bonus||"BASE";state.targetUnit=saved.targetUnit||"TOTAL";state.reserve=saved.reserve||0;state.project=saved.project||0;
}
async function approve(){
 if(state.horizon==="ROLLING_12"){reviewRollingApproval();return;}
 const hasTargets=Object.keys(state.targets).length>0||Object.keys(state.monthTargets).length>0;
 const planStart=state.originals&&Object.values(state.originals).flatMap(r=>r.months||[])
  .find(m=>m.kind!=="actual")?.month||"";
 const approvalText=(revisionActive()?'Approvare la revisione del Piano V'+revisionSource.revision+' per '+state.year+'?\\n\\n':'Approvare il Piano operativo '+state.year+'?\\n\\n')+
  (hasTargets?"Congeleremo i target che hai modificato rispetto alla Baseline.":"Nessun target è stato modificato: approverai esplicitamente la Baseline attuale come Piano operativo.")+
  "\\n\\nI mesi già chiusi restano consuntivi, il mese in corso include già il consuntivo e la previsione residua. Il tracking inizierà dall'approvazione, non retroattivamente da gennaio."+
  (state.reserve||state.project?"\\n\\nATTENZIONE: le quote Fondo / Progetto della bozza non sono ancora trasferite come obiettivi autonomi nello snapshot approvato. Verranno mantenute nella bozza.":"")+
  "\\n\\nLa Baseline e le ipotesi Min/Max rimarranno invariate.";
 if(!root.confirm(approvalText))return;
 const reason=root.prompt("Motivo dell'approvazione (8-600 caratteri)","Piano familiare: obiettivi e impegni di spesa concordati");
 if(reason===null)return;
 if(reason.trim().length<8||reason.trim().length>600){root.alert("Inserisci una motivazione di 8-600 caratteri.");return}
 const button=root.document.querySelector("[data-bf-draft-approve]");
 if(button)button.disabled=true;
 try{
  if(!root.budgetFamilyPlanRpc)throw new Error("Connessione al database non disponibile");
  const monthMaps={};
  for(const id of Object.keys(state.monthTargets)){
   const base=state.originals[id];if(!base)throw new Error("Categoria mensile non disponibile: "+id);
   const row=applyRows([base])[0];
   monthMaps[id]=Object.fromEntries(row.months.filter(m=>m.kind!=="actual").map(m=>[m.month,round2(m.amount)]));
  }
  const hasMonthTargets=Object.keys(monthMaps).length>0;
  const effectiveTargets={...state.targets};
  for(const id of Object.keys(effectiveTargets)){
   const base=state.originals[id];if(!base)throw new Error('Categoria del Piano non disponibile: '+id);
   effectiveTargets[id]=round2(applyRows([base])[0].annual);
  }
  const result=await root.budgetFamilyPlanRpc(hasMonthTargets?"dashboard_family_strategic_plan_v2":"dashboard_family_strategic_plan_v1",{
   p_year:Number(state.year),p_note:reason.trim(),p_targets:effectiveTargets,p_notes:state.notes,
   ...(hasMonthTargets?{p_months:monthMaps}:{})
  });
  if(!result||!result.plan)throw new Error("La risposta non contiene il Piano approvato");
  const savedTargets=result.plan.meta?.strategic_plan?.targets;
  if(!savedTargets||Object.entries(effectiveTargets).some(([id,amount])=>
    (!Object.prototype.hasOwnProperty.call(savedTargets,id)||!Number.isFinite(Number(savedTargets[id]))||Math.abs(Number(savedTargets[id])-amount)>.02))){
   await root.BudgetFamilyPlan?.reload?.();
   throw new Error('Versione creata, ma non è stato possibile verificare tutti i target. Controlla il Piano prima di riprovare.');
  }
  rollingApprovalNeedsRevision=false;
  revisionSource=null;
  state.targets={};state.monthTargets={};state.notes={};saveDraft();
  await root.BudgetFamilyPlan?.reload?.();
  root.renderPlanningBoard?.();
  root.alert("Piano approvato come versione V"+result.plan.revision+". Gli importi e le note sono congelati.");
 }catch(error){
  root.alert("Approvazione non completata: "+String(error?.message||error));
 }finally{if(button)button.disabled=false}
}
function render(originalExp,originalInc,isPlan,context,extra={}){
 const strategy=context==="STRATEGY";
 const wrapper=root.document.getElementById("bfSinglePlanDraft");if(!wrapper)return;
 wrapper.hidden=!isPlan;
 if(!isPlan){const bar=root.document.getElementById("bfDraftSaveToolbar");if(bar)bar.hidden=true;return;}
 const quick=root.document.getElementById("bfDraftSaveToolbar");
 if(quick){
  quick.hidden=false;
  const b=quick.querySelector("[data-bf-draft-save]"),cancel=quick.querySelector("[data-bf-draft-cancel]"),status=quick.querySelector("[data-bf-save-state]");
  if(b){b.disabled=!isDirty();b.classList.toggle("bf-draft-pending",isDirty());b.classList.toggle("ghost",!isDirty());}
  if(cancel)cancel.disabled=!isDirty();
  if(status)status.textContent=saveError?"Errore salvataggio":isDirty()?"● Modifiche non salvate":justSaved?"✓ Bozza salvata":"Bozza salvata";
 }
 const exp=applyRows(originalExp),inc=applyRows(originalInc);
 const baseline=totals(originalInc)-totals(originalExp),planned=totals(inc)-totals(exp),improvement=planned-baseline;
 let html='<div class="bf-plan-inline-head"><div class="bf-strategy-intro"><strong>'+
 (strategy?'Strategia · Elabora il tuo scenario':revisionActive()?'Revisione del Piano approvato · V'+revisionSource.revision:'Piano · Rifinisci e approva')+'</strong>'+
 '<span> '+(strategy?'Usa le leve o modifica i target L2 nella tabella sottostante.':'Lo scenario viene dalla Strategia e mantiene gli stessi target L2.')+'</span></div>'+
 '<div class="bf-plan-inline-actions">'+(strategy?'':'<label>Entrate <select data-bf-draft-risk>'+
 '<option value="LOW"'+(state.bonus==="LOW"?' selected':'')+'>Prudente</option>'+
 '<option value="BASE"'+(state.bonus==="BASE"?' selected':'')+'>Base</option>'+
 '<option value="HIGH"'+(state.bonus==="HIGH"?' selected':'')+'>Favorevole</option></select></label>')+


 '<button type="button" class="btn ghost compact" data-bf-draft-reset>Ripristina target</button>'+
 (strategy?'<button type="button" class="btn compact" data-bf-draft-to-plan>Prosegui al Piano →</button>':
 '<button type="button" class="btn compact" data-bf-draft-approve>Approva Piano</button>')+'</div></div>';
 const low=originalInc.reduce((sum,r)=>sum+value(r.rangeLow===undefined?r.annual:r.rangeLow),0);
 const high=originalInc.reduce((sum,r)=>sum+value(r.rangeHigh===undefined?r.annual:r.rangeHigh),0);
 const variation=state.bonus==="LOW"?low-totals(originalInc):state.bonus==="HIGH"?high-totals(originalInc):0;
 html+=strategy?
 '<p class="bf-plan-inline-hint">Avanzo della bozza: <strong>'+money(planned)+'</strong> · Baseline '+money(baseline)+' · '+(improvement>=0?'Miglioramento ':'Peggioramento ')+money(Math.abs(improvement))+'. La verifica Prudente / Base / Favorevole è nel pannello seguente; gli Actual non cambiano.</p>':
 '<p class="bf-plan-inline-hint">Stress test tecnico sulle entrate: <strong>'+money(planned+variation)+'</strong> · Gli Actual già registrati sono protetti.</p>';
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
  html+='<section id="planningBoardRiskScenarios" class="bf-risk-scenarios" aria-label="Scenari realistici prima della definizione del Piano"></section>';
  const cutsN=[0,-5,-10,-15,-20],cutsD=[0,-10,-25,-40,-50];
  const outcomes=(n,d)=>{
    const spend=originalExp.reduce((sum,r)=>{
      const nature=r.meta?.expense_nature;
      const rate=nature==="NECESSARY"?n:nature==="DISCRETIONARY"?d:0;
      return sum+value(r.annual)+Math.max(0,value(r.annual)-locked(r))*rate/100;
    },0);
    return totals(originalInc)-spend;
  };
  html+='<details class="bf-strategy-matrix"><summary>Leve di risparmio N / D · 25 combinazioni (azioni volontarie)</summary>'+
   '<p class="bf-plan-inline-hint">Riduzioni soltanto sulle quote future di spese Necessarie (N) e Discrezionali (D). Ogni cella mostra l’avanzo del periodo, prima degli obiettivi. Clicca per applicare.</p>'+
   '<div class="bf-strategy-matrix-scroll"><table><thead><tr><th>N / D</th>'+
   cutsD.map(d=>'<th>'+d+'%</th>').join('')+'</tr></thead><tbody>'+
   cutsN.map(n=>'<tr><th>'+n+'%</th>'+cutsD.map(d=>{
    const outcome=outcomes(n,d);
    return '<td><button type="button" class="'+(outcome>=0?'positive':'negative')+'" data-bf-matrix-n="'+n+'" data-bf-matrix-d="'+d+'" title="Necessarie '+n+'%, Discrezionali '+d+'%">'+money(outcome)+'</button></td>';
   }).join('')+'</tr>').join('')+'</tbody></table></div></details>';
 }
 
 wrapper.innerHTML=html;
 if(strategy&&root.BudgetFamilyUncertainty?.render){
  const kindExp=r=>({...r,kind:r.meta?.expense_nature||"OTHER"});
  const kindInc=r=>({...r,kind:r.meta?.income_nature||"OTHER_INCOME"});
  const current=extra.currentMonth||
   originalExp.flatMap(r=>r.months||[]).find(m=>m.kind!=="actual")?.month||"";
  root.BudgetFamilyUncertainty.render({
   mountId:"planningBoardRiskScenarios",exp:originalExp.map(kindExp),inc:originalInc.map(kindInc),
   plannedRows:{expenses:exp.map(kindExp),income:inc.map(kindInc)},
   horizon:state.horizon,currentMonth:current,
   reliability:extra.reliability||{},goal:state.reserve+state.project
  });
 }
}
function inlineAmount(row){
 const k=key(row),base=state.originals[k]||row,amount=state.targets[k]===undefined?value(base.annual):Math.max(locked(base),value(state.targets[k]));
 const monthly=root.document.getElementById("planningBoardDisplayUnit")?.value==="MONTH";
 const changed=isChanged(row);
 const title='Ripristina importo Baseline per '+row.l2_name+' ('+money(base.annual)+')';
 return '<div class="bf-plan-edit-cell"><input type="text" inputmode="numeric" pattern="[0-9.]*" '+(monthly?'data-bf-draft-month':'data-bf-draft-total')+'="'+escape(k)+'" value="'+integer(monthly?amount/12:amount)+'" aria-label="'+(monthly?'Media mensile':'Totale annuo')+' '+escape(row.l2_name)+'" title="'+(monthly?'Media mese (totale annuo diviso 12)':'Budget annuale')+'; già speso '+money(locked(base))+'">'+
 '<button type="button" class="bf-plan-row-baseline" data-bf-draft-row-reset="'+escape(k)+'" title="'+escape(title)+'" aria-label="'+escape(title)+'" '+(changed?'':'disabled ')+'>&#8634;</button></div>';
}
function inlineNote(row){
 const k=key(row),note=state.notes[k]||"",baselineNote=row.meta?.rationale_note||"";
 return '<button class="bf-plan-note-button '+(note?'has-note':'')+'" type="button" data-bf-note-open="'+escape(k)+'" title="'+escape('Baseline: '+(baselineNote||'nessuna nota')+' | Piano: '+(note||'aggiungi impegno'))+'" aria-label="'+escape('Note '+row.l2_name+(baselineNote?' — nota Baseline presente':''))+'">✎'+(baselineNote?' ⓘ':'')+(note?' ●':'')+'</button>';
}
function isChanged(row){
 const id=key(row);
 return Object.keys(state.monthTargets[id]||{}).length>0||
   (state.targets[id]!==undefined&&Math.abs(value(state.targets[id])-value(state.originals[id]?.annual))>=.005);
}
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
 if(e.target.hasAttribute("data-bf-draft-month-amount")){
  const id=e.target.getAttribute("data-bf-draft-month-amount"),month=e.target.getAttribute("data-bf-draft-month-id");
  const base=state.originals[id];if(!base)return;
  const original=base.months.find(m=>m.month===month);
  if(!original||original.kind==="actual")return;
  const n=parseInteger(e.target.value),minimum=round2(fixedMonth(original));
  if(!Number.isFinite(n)||n<minimum-.005||n>100000000){
   e.target.setCustomValidity("Importo non valido: minimo già registrato "+money(minimum));
   e.target.reportValidity();return;
  }
  e.target.setCustomValidity("");
  const previous=applyRows([base])[0],old=previous.months.find(m=>m.month===month);
  if(!old)return;
  const revised=round2(n),nextTotal=round2(previous.annual+revised-value(old.amount));
  if(Math.abs(revised-value(old.amount))<.005)return; // no-op: non bloccare un mese solo per averci cliccato
  if(!state.monthTargets[id])state.monthTargets[id]={};
  const otherManual=Object.keys(state.monthTargets[id]).some(m=>m!==month);
  // L'importo immesso resta fissato anche se coincide con la Baseline,
  // quando il resto della categoria ha un target differente.
  if(Math.abs(revised-value(original.amount))<.005&&
     Math.abs(nextTotal-value(base.annual))<.005&&!otherManual)delete state.monthTargets[id][month];
  else state.monthTargets[id][month]=revised;
  if(!Object.keys(state.monthTargets[id]).length)delete state.monthTargets[id];
  if(Math.abs(nextTotal-value(base.annual))<.005&&!state.monthTargets[id])delete state.targets[id];
  else state.targets[id]=nextTotal;
  persist();root.renderPlanningBoard?.();return;
 }
 if(!attr)return;
 const id=e.target.getAttribute(attr),base=state.originals[id];if(!base)return;
 const n=parseInteger(e.target.value);
 if(!Number.isFinite(n)||n<0){e.target.setCustomValidity("Inserisci un importo valido (es. 2.419)");e.target.reportValidity();return}
 e.target.setCustomValidity("");
 const manual=state.monthTargets[id]||{};
 const fixedMin=locked(base)+(base.months||[]).filter(m=>m.kind!=="actual"&&Object.prototype.hasOwnProperty.call(manual,m.month))
  .reduce((sum,m)=>sum+Math.max(0,value(manual[m.month])-fixedMonth(m)),0);
 const desired=round2(monthly?n*12:n);
 const adjustable=(base.months||[]).filter(m=>m.kind!=="actual"&&!Object.prototype.hasOwnProperty.call(manual,m.month));
 if(!adjustable.length&&Math.abs(desired-applyRows([base])[0].annual)>.005){
  e.target.setCustomValidity("Non ci sono mesi liberi: modifica un mese manuale o ripristina la categoria.");
  e.target.reportValidity();return;
 }
 if(desired<fixedMin-.005){
  e.target.setCustomValidity("Per ridurre sotto "+money(fixedMin)+" ripristina prima uno o più mesi manuali.");
  e.target.reportValidity();return;
 }
 const chosen=Math.max(round2(fixedMin),desired);
 if(Math.abs(chosen-value(base.annual))<.005&&!Object.keys(manual).length)delete state.targets[id];
 else state.targets[id]=chosen;
 persist();root.renderPlanningBoard?.();
}
function init(){
 const node=root.document.getElementById("planningBoardOverview");if(!node)return;
 const panel=root.document.createElement("section");panel.id="bfSinglePlanDraft";panel.className="bf-single-plan-draft";panel.hidden=true;
 node.parentElement.after(panel);
 const display=root.document.getElementById("planningBoardDisplayUnit");
 if(display&&!root.document.getElementById("bfDraftSaveToolbar")){
   const host=root.document.createElement("span");
   host.id="bfDraftSaveToolbar";host.className="bf-draft-toolbar";host.hidden=true;
   host.innerHTML='<span data-bf-save-state></span><button type="button" class="btn compact ghost" disabled data-bf-draft-save>Salva bozza</button><button type="button" class="btn compact ghost bf-draft-cancel" disabled data-bf-draft-cancel title="Scarta solo le modifiche non salvate">Annulla</button>';
   display.closest("label")?.after(host);
   host.addEventListener("click",e=>{
    if(e.target.closest("[data-bf-draft-save]")){saveDraft();root.renderPlanningBoard?.();return}
    if(e.target.closest("[data-bf-draft-cancel]"))discardUnsaved();
   });
 }

 panel.addEventListener("change",onChange);
 root.document.getElementById("planningBoardBody")?.addEventListener("change",onChange);
 root.document.getElementById("planningBoardBody")?.addEventListener("click",e=>{
  const reset=e.target.closest("[data-bf-draft-row-reset]");
  if(reset){resetCategoryToBaseline(reset.getAttribute("data-bf-draft-row-reset"));return}
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
    state.targets={};state.monthTargets={};
    Object.values(state.originals).filter(r=>r.direction==="EXPENSE").forEach(r=>{
      const nature=r.meta?.expense_nature,rate=nature==="NECESSARY"?n:nature==="DISCRETIONARY"?d:0;
      if(rate)state.targets[key(r)]=locked(r)+Math.max(0,value(r.annual)-locked(r))*(1+rate/100);
    });
    persist();root.renderPlanningBoard?.();return;
  }
  if(e.target.closest("[data-bf-draft-to-plan]")){root.showPlanningBoardView?.("PLAN");return}
  if(e.target.closest("[data-bf-draft-show-calendar]")){root.document.querySelector('[data-planning-horizon="CALENDAR"]')?.click();return}
  if(e.target.closest("[data-bf-draft-approve]")){approve();return}
  if(e.target.closest("[data-bf-draft-save]")){saveDraft();root.renderPlanningBoard?.();return}
  if(e.target.closest("[data-bf-draft-reset]")){state.targets={};state.monthTargets={};state.notes={};persist();root.renderPlanningBoard?.()}
 });
}
root.BudgetFamilySinglePlan={
 prepare(exp,inc,year,horizon){resetIfYearChanged(year,horizon||'CALENDAR');[...exp,...inc].forEach(r=>state.originals[key(r)]=r);applyRollingTransfer(exp,inc);return {exp:applyRows(exp),inc:applyRows(inc)}},
 render,inlineAmount,inlineNote,isChanged,showOnlyChanged,scenarioPreset,saveDraft,discardUnsaved,resetCategoryToBaseline,details(){return {year:state.year,targets:{...state.targets},monthTargets:JSON.parse(JSON.stringify(state.monthTargets)),notes:{...state.notes},reserve:state.reserve,project:state.project,targetUnit:state.targetUnit}},
 applyDecisionTargets,startRevision,cancelRevision,revisionActive,needsRollingRevision(){return rollingApprovalNeedsRevision},hasPendingRollingTransfer(){return !!rollingTransfer},isDraft(){return Object.keys(state.targets).length>0||Object.keys(state.monthTargets).length>0}
};
if(typeof module!=="undefined"&&module.exports)module.exports={locked,applyRows,scenarioPreset,state};
if(root.document){if(root.document.getElementById("planningBoardOverview"))init();else if(root.document.readyState==="loading")root.document.addEventListener("DOMContentLoaded",init);else init()}
})(typeof window!=="undefined"?window:globalThis);
