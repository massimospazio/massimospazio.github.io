/* V73.30.10.61 · Scenari di incertezza. Baseline = Base, senza mutare il Piano. */
(function(root){
"use strict";
const strategy=root.BudgetFamilyScenario||(typeof require==="function"?require("./scenario-strategy.js"):null);
const numeric=x=>Number.isFinite(Number(x))?Number(x):0;
const round=x=>Math.round((numeric(x)+Number.EPSILON)*100)/100;
const key=(r,m)=>String(r.direction)+":"+String(r.category_id)+"|"+String(m.month);
const floor=m=>m.kind==="actual"?numeric(m.amount):Math.max(0,round(numeric(m.amount)-numeric(m.futureAmount)));
const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=x=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(numeric(x));
const signed=x=>(x>0?"+":x<0?"−":"")+money(Math.abs(numeric(x)));
function accepted(entry,m,salary){
 if(!entry||m.kind==="actual"||Math.abs(numeric(entry.expected)-numeric(m.amount))>0.01)return false;
 if(salary&&(entry.type==="SALARY"||(entry.type==null&&entry.fixed!==undefined&&entry.variableMin!==undefined&&entry.variableMax!==undefined))){
  const fixed=Number(entry.fixed),lo=Number(entry.variableMin),hi=Number(entry.variableMax),expected=numeric(m.amount)-fixed;
  return [fixed,lo,hi].every(x=>Number.isFinite(x)&&x>=0)&&fixed<=numeric(m.amount)+.005&&
   lo<=expected+.005&&hi>=expected-.005&&lo<=hi&&fixed+lo>=floor(m)-.005;
 }
 const lo=Number(entry.min),hi=Number(entry.max);
 return Number.isFinite(lo)&&Number.isFinite(hi)&&lo>=floor(m)-.005&&
  lo<=numeric(m.amount)+.005&&hi>=numeric(m.amount)-.005&&hi>=lo;
}
function amountFor(m,entry,mode,salary){
 if(mode==="BASE"||!accepted(entry,m,salary))return numeric(m.amount);
 if(salary&&(entry.type==="SALARY"||(entry.type==null&&entry.fixed!==undefined&&entry.variableMin!==undefined&&entry.variableMax!==undefined))){
  const fixed=Number(entry.fixed);
  return round(fixed+Number(mode==="PRUDENT"?entry.variableMin:entry.variableMax));
 }
 return round(Number(mode==="PRUDENT"?entry.min:entry.max));
}
function vary(rows,mode,assumptions){
 return (rows||[]).map(r=>{
  const salary=r.direction==="INCOME"&&String(r.l2_name||"").trim().toLocaleLowerCase("it")==="stipendio";
  const months=(r.months||[]).map(m=>{
   const entry=assumptions[key(r,m)];
   const total=amountFor(m,entry,
    r.direction==="EXPENSE"?(mode==="PRUDENT"?"FAVORABLE":mode==="FAVORABLE"?"PRUDENT":mode):mode,salary);
   return {...m,amount:total,futureAmount:m.kind==="actual"?0:Math.max(0,round(total-floor(m)))};
  });
  return {...r,annual:round(months.reduce((sum,m)=>sum+numeric(m.amount),0)),months};
 });
}
function factor(base,adjustments={},targets={}){
 const kind=String(base.kind||"");
 const lock=(base.months||[]).reduce((s,m)=>s+floor(m),0);
 const flexible=(base.months||[]).reduce((s,m)=>s+Math.max(0,numeric(m.futureAmount)),0);
 const id=String(base.category_id||"");
 if(base.direction==="EXPENSE"&&["MANDATORY","NECESSARY","DISCRETIONARY"].includes(kind)&&
    Object.prototype.hasOwnProperty.call(targets,id)&&Number.isFinite(Number(targets[id]))){
  return flexible>.005?Math.max(0,(Math.max(lock,numeric(targets[id]))-lock)/flexible):1;
 }
 if(!["MANDATORY","NECESSARY","DISCRETIONARY","FIXED","PREDICTABLE","VARIABLE"].includes(kind))return 1;
 return Math.max(0,1+numeric(adjustments[kind])/100);
}
function applyActions(baselines,varied,adjustments,targets){
 return varied.map((r,i)=>{
  const multiplier=factor(baselines[i],adjustments,targets);
  const months=r.months.map(m=>{
   if(m.kind==="actual")return {...m};
   const fixed=floor(m),amount=round(fixed+Math.max(0,numeric(m.futureAmount)*multiplier));
   return {...m,amount,futureAmount:round(amount-fixed)};
  });
  return {...r,months,annual:round(months.reduce((s,m)=>s+numeric(m.amount),0))};
 });
}
function applyPlannedRows(baselines,varied,planned){
 if(!Array.isArray(planned)||planned.length!==baselines.length)throw Error("Piano mensile non coerente con la Baseline");
 return varied.map((r,i)=>{
  const original=baselines[i],target=planned[i];
  if(String(original.category_id)!==String(target?.category_id)||String(original.direction)!==String(target?.direction))
   throw Error("Identità L2 differente tra Baseline e Piano");
  const ref=new Map((original.months||[]).map(m=>[m.month,m]));
  const plan=new Map((target.months||[]).map(m=>[m.month,m]));
  const months=r.months.map(m=>{
   const b=ref.get(m.month),p=plan.get(m.month);
   if(!b||!p)throw Error("Mesi del Piano non corrispondenti alla Baseline");
   if(m.kind==="actual")return {...m};
   const paid=floor(b),baseFuture=Math.max(0,numeric(b.futureAmount));
   const plannedFuture=Math.max(0,round(numeric(p.amount)-paid));
   const changedFuture=Math.max(0,numeric(m.futureAmount));
   const adjustedFuture=baseFuture>.005?
     Math.max(0,round(changedFuture*(plannedFuture/baseFuture))):plannedFuture;
   const amount=round(paid+adjustedFuture);
   return {...m,amount,futureAmount:adjustedFuture};
  });
  return {...r,months,annual:round(months.reduce((sum,m)=>sum+numeric(m.amount),0))};
 });
}
function valueFrom(rows){return rows.reduce((s,r)=>s+numeric(r.annual),0)}
function drivers(baseExp,baseInc,caseExp,caseInc){
 const all=[];
 for(const [a,b,sign] of [[baseExp,caseExp,-1],[baseInc,caseInc,1]]){
  a.forEach((original,i)=>{
   const diff=round(sign*(numeric(b[i]?.annual)-numeric(original.annual)));
   if(Math.abs(diff)<.005)return;
   all.push({category_id:String(original.category_id),direction:original.direction,
     category:String(original.l2_name||"Categoria"),level:String(original.l1_name||""),impact:diff});
  });
 }
 return all.sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact));
}
function evaluate(exp,inc,assumptions={},adjustments={},opts={}){
 if(!strategy)throw Error("Motore delle leve non disponibile");
 const targets=opts.categoryTargets||{};
 const baselines=[exp||[],inc||[]];
 const modes=["PRUDENT","BASE","FAVORABLE"];
 const variants={};
 for(const mode of modes){
  const vExp=vary(baselines[0],mode,assumptions),vInc=vary(baselines[1],mode,assumptions);
  const aExp=opts.plannedRows?
   applyPlannedRows(baselines[0],vExp,opts.plannedRows.expenses):
   applyActions(baselines[0],vExp,adjustments,targets);
  const aInc=opts.plannedRows?
   applyPlannedRows(baselines[1],vInc,opts.plannedRows.income):
   applyActions(baselines[1],vInc,adjustments,{});
  const before=strategy.calculate(vExp,vInc);
  const after=strategy.calculate(aExp,aInc);
  variants[mode]={before:before.baselineBalance,after:after.baselineBalance,
    deltaActions:round(after.baselineBalance-before.baselineBalance),rows:{expenses:vExp,income:vInc},
    afterRows:{expenses:aExp,income:aInc},calculation:after};
 }
 variants.PRUDENT.drivers=drivers(variants.BASE.rows.expenses,variants.BASE.rows.income,variants.PRUDENT.rows.expenses,variants.PRUDENT.rows.income);
 variants.FAVORABLE.drivers=drivers(variants.BASE.rows.expenses,variants.BASE.rows.income,variants.FAVORABLE.rows.expenses,variants.FAVORABLE.rows.income);
 variants.PRUDENT.afterDrivers=drivers(variants.BASE.afterRows.expenses,variants.BASE.afterRows.income,variants.PRUDENT.afterRows.expenses,variants.PRUDENT.afterRows.income);
 variants.FAVORABLE.afterDrivers=drivers(variants.BASE.afterRows.expenses,variants.BASE.afterRows.income,variants.FAVORABLE.afterRows.expenses,variants.FAVORABLE.afterRows.income);
 const all=[...baselines[0],...baselines[1]],valid=all.flatMap(r=>(r.months||[]).map(m=>({r,m})))
  .filter(({r,m})=>accepted(assumptions[key(r,m)],m,r.direction==="INCOME"&&String(r.l2_name||"").toLowerCase()==="stipendio"));
 const stale=all.flatMap(r=>(r.months||[]).map(m=>({r,m})))
  .filter(({r,m})=>assumptions[key(r,m)]&&!accepted(assumptions[key(r,m)],m,r.direction==="INCOME"&&String(r.l2_name||"").toLowerCase()==="stipendio"));
 return {scenarios:variants,validCount:valid.length,staleCount:stale.length,
  beforeSpread:round(variants.FAVORABLE.before-variants.PRUDENT.before),
  afterSpread:round(variants.FAVORABLE.after-variants.PRUDENT.after),
  baseExact:Math.abs(variants.BASE.before-(valueFrom(inc||[])-valueFrom(exp||[])))<.01};
}
function validate(r,m,values,salary){
 const baseline=numeric(m.amount),already=floor(m);
 const parsed=v=>v===""||v===null||v===undefined?NaN:Number(String(v).replace(",","."));
 let entry;
 if(salary){
  const fixed=parsed(values.fixed),min=parsed(values.min),max=parsed(values.max);
  if(![fixed,min,max].every(Number.isFinite))return {error:"Inserisci quota fissa e minimo/massimo della sola componente variabile."};
  const expected=round(baseline-fixed);
  if(fixed<0||expected<0||min<0||min>expected+.005||max<expected-.005||fixed+min<already-.005)
   return {error:"Occorre 0 ≤ minimo variabile ≤ variabile già prevista ≤ massimo; il totale minimo deve coprire gli importi già registrati."};
  entry={expected:baseline,fixed:round(fixed),variableMin:round(min),variableMax:round(max),type:"SALARY"};
 }else{
  const min=parsed(values.min),max=parsed(values.max);
  if(![min,max].every(Number.isFinite))return {error:"Inserisci entrambi i limiti Min e Max."};
  if(min<already-.005||min>baseline+.005||max<baseline-.005||max<min)
   return {error:"Il minimo deve essere almeno il già registrato e non superare la Baseline; il massimo deve essere almeno la Baseline."};
  entry={expected:baseline,min:round(min),max:round(max),type:"CATEGORY"};
 }
 if(!accepted(entry,m,salary))return {error:"Intervallo incoerente con il valore del mese."};
 return {entry};
}

/* V73.30.10.61 · Matrice decisionale (nessun dato persistito).
   Le entrate vengono variate coi Min/Max salvati. Le D rappresentano scelte:
   Min realistico, Baseline e Max plausibile. Soltanto per coprire un gap
   si puo' andare sotto Min fino alla quota futura azzerabile. Gli Actual restano protetti.
   Gli altri costi, incluso SAVINGS, sono invariati: stress emergenze separato. */
function decisionMatrix(exp,inc,assumptions={},opts={}){
 if(!strategy)throw Error("Motore decisionale non disponibile");
 const expenses=Array.isArray(exp)?exp:[],incomes=Array.isArray(inc)?inc:[];
 const goal=Math.max(0,numeric(opts.goal));
 const baseline=strategy.calculate(expenses,incomes);
 const disc=expenses.filter(r=>r.kind==="DISCRETIONARY");
 const specs=disc.map(r=>{
  let minimum=0,maximum=0,locked=0,covered=0,possible=0;
  for(const m of r.months||[]){
   const paid=floor(m),baselineAmount=numeric(m.amount);
   locked+=paid;
   if(m.kind!=="actual")possible++;
   const entry=assumptions[key(r,m)];
   const valid=accepted(entry,m,false);
   if(valid){covered++;minimum+=numeric(entry.min);maximum+=numeric(entry.max)}
   else {minimum+=baselineAmount;maximum+=baselineAmount}
  }
  return {id:String(r.category_id),name:String(r.l2_name||"Categoria"),
   baseline:round(numeric(r.annual)),locked:round(locked),
   minimum:round(Math.max(locked,minimum)),maximum:round(Math.max(numeric(r.annual),maximum)),
   covered,possible};
 });
 const total=field=>round(specs.reduce((a,r)=>a+r[field],0));
 const sumBase=total("baseline"),sumMin=total("minimum"),sumMax=total("maximum"),sumLocked=total("locked");
 // Allocate a required cut proportionally within a tranche; no arbitrary
 // preference ordering is inferred from category names.
 function cut(targets,needed,lowerField){
  let remaining=Math.max(0,needed);
  const available=specs.map(r=>Math.max(0,(targets[r.id]??r.baseline)-r[lowerField]));
  const capacity=available.reduce((a,x)=>a+x,0),applied=Math.min(capacity,remaining);
  let remainder=round(applied);
  specs.forEach((r,i)=>{
   const amount=i===specs.length-1?remainder:round(applied*(capacity?available[i]/capacity:0));
   const used=Math.max(0,Math.min(available[i],amount,remainder));
   targets[r.id]=round(Math.max(r[lowerField],(targets[r.id]??r.baseline)-used));
   remainder=round(remainder-used);
  });
  // Handle residual rounding and zero-capacity last rows deterministically.
  if(remainder>.005)for(const r of specs){
   const space=Math.max(0,(targets[r.id]??r.baseline)-r[lowerField]);
   const used=Math.min(space,remainder);
   targets[r.id]=round((targets[r.id]??r.baseline)-used);remainder=round(remainder-used);
   if(remainder<.005)break;
  }
  remaining=round(Math.max(0,remaining-(applied-remainder)));
  return remaining;
 }
 function raise(targets,budget){
  let remaining=Math.max(0,budget);
  const capacities=specs.map(r=>Math.max(0,r.maximum-(targets[r.id]??r.baseline)));
  const capacity=capacities.reduce((a,b)=>a+b,0),totalUp=Math.min(remaining,capacity);
  let left=round(totalUp);
  specs.forEach((r,i)=>{
   const inc=i===specs.length-1?left:round(totalUp*(capacity?capacities[i]/capacity:0));
   const take=Math.max(0,Math.min(inc,capacities[i],left));
   targets[r.id]=round((targets[r.id]??r.baseline)+take);left=round(left-take);
  });
  if(left>.005)for(const r of specs){
   const cap=Math.max(0,r.maximum-(targets[r.id]??r.baseline)),take=Math.min(cap,left);
   targets[r.id]=round((targets[r.id]??r.baseline)+take);left=round(left-take);
   if(left<.005)break;
  }
 }
 const modes=[
  {id:"LOW",label:"Entrate minime",uncertainty:"PRUDENT"},
  {id:"BASE",label:"Entrate base",uncertainty:"BASE"},
  {id:"HIGH",label:"Entrate favorevoli",uncertainty:"FAVORABLE"}
 ];
 const strategies=[
  {id:"PROTECT",label:"Protezione"},
  {id:"BALANCE",label:"Equilibrio"},
  {id:"LIFE",label:"Qualità di vita"}
 ];
 const cells=[];
 for(const incomeMode of modes){
  const varied=vary(incomes,incomeMode.uncertainty,assumptions);
  const untouched=strategy.calculate(expenses,varied);
  for(const policy of strategies){
   const targets=Object.fromEntries(specs.map(r=>[r.id,r.baseline]));
   let beyondMin=0;
   if(policy.id==="PROTECT"){
    specs.forEach(r=>{targets[r.id]=r.minimum});
    const first=strategy.calculate(expenses,varied,{}, {categoryTargets:targets});
    const gap=Math.max(0,goal-first.simulatedBalance);
    if(gap>.005){const remains=cut(targets,gap,"locked");beyondMin=round(gap-remains)}
   }else if(policy.id==="BALANCE"){
    let gap=Math.max(0,goal-untouched.simulatedBalance);
    gap=cut(targets,gap,"minimum");
    if(gap>.005){const stays=gap;gap=cut(targets,gap,"locked");beyondMin=round(stays-gap)}
   }else{
    raise(targets,Math.max(0,untouched.simulatedBalance-goal));
   }
   const result=strategy.calculate(expenses,varied,{}, {categoryTargets:targets});
   const spending=round(specs.reduce((a,r)=>a+(targets[r.id]??r.baseline),0));
   const deltaD=round(spending-sumBase);
   const activeTargets=Object.fromEntries(specs.filter(r=>Math.abs((targets[r.id]??r.baseline)-r.baseline)>.005)
     .map(r=>[r.id,round(targets[r.id])]));
   cells.push({
    id:incomeMode.id+"|"+policy.id,income:incomeMode.id,policy:policy.id,
    balance:round(result.simulatedBalance),gap:round(Math.max(0,goal-result.simulatedBalance)),
    free:round(result.simulatedBalance-goal),incomeAmount:round(result.simulatedIncome),
    spendingD:spending,deltaD,baselineD:sumBase,belowMin:round(beyondMin),
    targets:activeTargets,adjustableD:round(sumBase-sumLocked),
    goal,baselineBalance:round(baseline.baselineBalance),
    sustainable:result.simulatedBalance>=goal-.005,
    incomeDelta:round(result.simulatedIncome-baseline.baseIncome),
    investments:round(result.expenses.SAVINGS.simulated),
    extraSavings:round((result.simulatedBalance-baseline.baselineBalance))
   });
  }
 }
 const incomeConfigured=incomes.flatMap(r=>(r.months||[]).map(m=>({r,m})))
  .filter(({r,m})=>accepted(assumptions[key(r,m)],m,
    r.direction==="INCOME"&&String(r.l2_name||"").trim().toLocaleLowerCase("it")==="stipendio")).length;
 const incomeFuture=incomes.reduce((s,r)=>s+(r.months||[]).filter(m=>m.kind!=="actual").length,0);
 return {cells,modes,strategies,goal,
  baselineBalance:round(baseline.baselineBalance),incomeConfigured,incomeFuture,
  discretionaryConfigured:specs.reduce((a,r)=>a+r.covered,0),
  discretionaryFuture:specs.reduce((a,r)=>a+r.possible,0),
  d:{baseline:sumBase,min:sumMin,max:sumMax,locked:sumLocked},categories:specs};
}

const api={decisionMatrix,evaluate,vary,validate,accepted,floor,applyActions,applyPlannedRows,drivers};
if(typeof module!=="undefined"&&module.exports)module.exports=api;
root.BudgetFamilyUncertainty=api;
const doc=root.document;if(!doc)return;
const storeKey="budget-family-uncertainty-v1";
const state={cache:{},saved:{},key:"",selected:"",mountId:"planningRiskScenarios",notice:"",exp:[],inc:[],plannedRows:null,adjustments:{},targets:{},reliability:{},goals:0};
function persisted(){
 try{const data=JSON.parse(root.localStorage?.getItem(storeKey)||"{}");return data&&typeof data==="object"?data:{}}catch(_){return {}}
}
function initStore(){
 const data=persisted();state.saved=data;state.cache=JSON.parse(JSON.stringify(data));
}
initStore();
function save(){
 try{root.localStorage.setItem(storeKey,JSON.stringify(state.saved));return true}
 catch(e){state.notice="Errore salvataggio locale: "+String(e.message||e);return false}
}
function selectedEntries(){return state.cache[state.key]||(state.cache[state.key]={})}
function changed(){return JSON.stringify(selectedEntries())!==JSON.stringify(state.saved[state.key]||{})}
function allRows(){return state.exp.concat(state.inc)}
function selectedRow(){return allRows().find(r=>String(r.direction)+":"+String(r.category_id)===state.selected)}
function sortedChoices(){
 return allRows().slice().sort((a,b)=>{
  const al=state.reliability[a.category_id]||0,bl=state.reliability[b.category_id]||0;
  const rating=r=>[0,1,2,3,4,5].indexOf(Number(state.reliability[r.category_id])||0);
  const exposure=r=>r.months.reduce((s,m)=>s+(m.kind==="actual"?0:Math.max(0,numeric(m.futureAmount))),0);
  return ((rating(b)>=4?1:0)-(rating(a)>=4?1:0))||exposure(b)-exposure(a);
 });
}
function formatMonth(s){
 const d=new Date(String(s).slice(0,7)+"-01T12:00:00Z");
 return Number.isNaN(+d)?s:d.toLocaleString("it-IT",{month:"short",year:"2-digit",timeZone:"UTC"});
}
function formatAssumption(r,m){
 const found=selectedEntries()[key(r,m)],salary=r.direction==="INCOME"&&String(r.l2_name||"").toLowerCase()==="stipendio";
 const valid=accepted(found,m,salary);
 if(m.kind==="actual")return '<span class="bf-risk-locked">Consuntivo</span>';
 const min=valid?(salary?found.variableMin:found.min):"";
 const max=valid?(salary?found.variableMax:found.max):"";
 const fixed=salary&&valid?found.fixed:"";
 const f=salary?'<input type="number" step=".01" min="0" class="bf-risk-field" data-risk-fixed value="'+escape(fixed)+'" aria-label="Quota fissa '+formatMonth(m.month)+'" placeholder="Fissa">':"";
 const expectedVar=salary&&valid?round(numeric(m.amount)-fixed):null;
 const title=salary?'Min/Max della sola quota variabile. Fissa + variabile attesa = Baseline.':
   'Min/Max totali del mese. La Baseline è il valore atteso.';
 return '<div class="bf-risk-editor-fields" title="'+escape(title)+'">'+f+
  '<input class="bf-risk-field" type="number" step=".01" min="0" data-risk-min value="'+escape(min)+'" placeholder="Min" aria-label="Minimo '+formatMonth(m.month)+'">'+
  '<input class="bf-risk-field" type="number" step=".01" min="0" data-risk-max value="'+escape(max)+'" placeholder="Max" aria-label="Massimo '+formatMonth(m.month)+'">'+
  '<button type="button" data-risk-apply="'+escape(m.month)+'" class="btn compact">Applica</button>'+
  (found?'<button type="button" class="btn ghost compact" data-risk-remove="'+escape(m.month)+'" title="Rimuovi intervallo">↶</button>':'')+
  '</div>'+(salary?(valid?'<small>Variabile attesa '+money(expectedVar)+'</small>':'<small>Indica la quota fissa; l’atteso variabile verrà dedotto dalla Baseline.</small>'):'')+
  (found&&!valid?'<small class="bf-risk-error">Intervallo da ricontrollare: la Baseline è cambiata o i valori non sono validi.</small>':'');
}
function renderUI(){
 const panel=doc.getElementById(state.mountId);if(!panel||!state.key)return;
 const readOnly=state.mountId==="planningBoardRiskScenarios";
 const baselineRanges=readOnly?root.BudgetFamilyBaselineUncertainty?.buildAssumptions(state.exp,state.inc):null;
 const assumptions=readOnly?(baselineRanges?.assumptions||{}):selectedEntries();
 const result=evaluate(state.exp,state.inc,assumptions,state.adjustments,
  {categoryTargets:state.targets,plannedRows:state.plannedRows});
 const ready=result.validCount>0;
 const goal=numeric(state.goals);
 const s=result.scenarios;
 const acts=state.plannedRows?
   state.exp.some((r,i)=>Math.abs(numeric(r.annual)-numeric(state.plannedRows.expenses[i]?.annual))>.005)||
   state.inc.some((r,i)=>Math.abs(numeric(r.annual)-numeric(state.plannedRows.income[i]?.annual))>.005):
   Object.values(state.adjustments).some(x=>Math.abs(numeric(x))>.005)||Object.keys(state.targets).length>0;
 const cards=[["PRUDENT","Prudente","Ipotesi cautelative"],["BASE","Base = Baseline","Previsione senza interventi"],["FAVORABLE","Favorevole","Ipotesi favorevoli"]]
  .map(([id,name,subtitle])=>{
   const x=s[id];return '<div class="bf-risk-card '+id.toLowerCase()+'"><strong>'+name+'</strong><small>'+subtitle+'</small>'+
    '<span class="bf-risk-number">'+money(x.before)+'</span>'+
    '<span class="bf-risk-after">'+(acts?'Dopo interventi: ' +money(x.after)+' <b>('+signed(x.deltaActions)+')</b>':'Nessuna leva volontaria selezionata')+'</span>'+
    (goal>0?'<small>'+(x.after<goal?'Gap obiettivi '+money(goal-x.after):'Obiettivi coperti')+'</small>':'')+
    '</div>';
  }).join("");
 const driverItems=[];
 const map=new Map();
 for(const direction of ["PRUDENT","FAVORABLE"]){
  const data=s[direction].drivers;
  for(const d of data){
   const id=d.direction+":"+d.category_id;
   const old=map.get(id)||{...d,prudent:0,favorable:0};
   old[direction.toLowerCase()]=d.impact;map.set(id,old);
  }
 }
 driverItems.push(...[...map.values()].sort((a,b)=>(Math.abs(b.prudent)+Math.abs(b.favorable))-(Math.abs(a.prudent)+Math.abs(a.favorable))).slice(0,5));
 const ranks=driverItems.length?driverItems.map(d=>'<tr><td>'+escape(d.category)+'</td>'+
  '<td>'+signed(d.prudent)+'</td><td>'+signed(d.favorable)+'</td></tr>').join(""):
  '<tr><td colspan="3">Nessun intervallo valido configurato: i tre scenari coincidono con la Baseline.</td></tr>';
 const choices=sortedChoices(),current=selectedRow(),salary=current&&current.direction==="INCOME"&&String(current.l2_name||"").toLowerCase()==="stipendio";
 const rows=current?current.months.map(m=>
  '<tr data-risk-month="'+escape(m.month)+'"><td>'+escape(formatMonth(m.month))+'</td><td>'+money(m.amount)+'</td>'+
  '<td>'+money(floor(m))+'</td><td>'+formatAssumption(current,m)+'</td></tr>').join(""):"";
 const reliabilityLabels=["Non valutata","Certa","Alta","Consolidata","Stimata","Incerta"];
 const reliability=current?reliabilityLabels[Number(state.reliability[current.category_id])||0]||reliabilityLabels[0]:"";
 const configHtml=readOnly?
  '<div><h4>Intervalli definiti nella Baseline</h4><p class="bf-risk-tip">Min/Max si impostano una sola volta per categoria L2 nella <strong>Definizione Baseline</strong>; si applicano alle quote future. I mesi specifici sono eccezioni facoltative.</p>'+
  '<p class="bf-risk-tip">Qui puoi valutare l’effetto dei target della Strategia prima di approvare il Piano: nessuna modifica della Baseline.</p>'+
  '<button type="button" class="btn ghost compact" data-risk-open-baseline>Vai alla Baseline per modificare l’incertezza →</button></div>':
  '<div><h4>Configura le assunzioni mensili (modalità precedente)</h4><div class="bf-risk-toolbar"><label>Categoria L2 <select id="bfRiskCategory">'+
  choices.map(r=>'<option value="'+escape(r.direction+":"+r.category_id)+'" '+(current===r?'selected':'')+'>'+escape((r.direction==="INCOME"?"Entrate · ":"Spese · ")+r.l2_name)+'</option>').join("")+
  '</select></label><span>Affidabilità Baseline: <b>'+escape(reliability)+'</b></span></div>'+
  '<p class="bf-risk-tip">'+(salary?'Stipendio: inserisci la quota <b>fissa</b> e il Min/Max della sola <b>variabile</b>.':
   'Min e Max totali per il singolo mese.')+'</p>'+
  '<div class="bf-risk-table-wrap"><table class="bf-risk-table"><thead><tr><th>Mese</th><th>Baseline</th><th>Già registrato</th><th>'+(salary?'Fissa · Min/Max variabile':'Min / Max totali')+'</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
 panel.innerHTML=
  '<div class="bf-risk-title"><div><h3>Scenari realistici · prima del Piano</h3><p><strong>Scenario Base = Baseline.</strong> Prudente e Favorevole usano gli intervalli per categoria definiti nella Baseline.</p></div><span class="bf-risk-status">Quote future con intervallo '+result.validCount+(readOnly?' · configurazione Baseline':changed()?' · modifiche da salvare':' · ipotesi locali')+'</span></div>'+
  '<div class="bf-risk-cards">'+cards+'</div>'+
  '<p class="bf-risk-help">Forbice complessiva '+money(result.beforeSpread)+
  (acts?' · dopo le leve '+money(result.afterSpread):'')+
  '. Sono estremi costruiti dalle ipotesi impostate, <strong>non probabilità statistiche</strong>. Il valore Prudente che combina tutti gli estremi negativi può rappresentare uno stress test severo. Risultato del Tabellone, da riconciliare con il Flusso economico (investimenti inclusi secondo le regole correnti).</p>'+
  '<div class="bf-risk-two"><div><h4>Fattori che cambiano l’avanzo</h4><table class="bf-risk-driver"><thead><tr><th>Categoria</th><th>Prudente vs Base</th><th>Favorevole vs Base</th></tr></thead><tbody>'+ranks+'</tbody></table></div>'+
  configHtml+'</div>'+
  '<div class="bf-risk-actions"><span>'+(result.staleCount||baselineRanges?.invalid?.length?
   '⚠ Verifica '+(result.staleCount+(baselineRanges?.invalid?.length||0))+' ipotesi fuori intervallo o obsolete.':
   'Gli Actual restano protetti e non vengono modificati.')+'</span>'+
  (readOnly?'':'<button class="btn ghost compact" type="button" data-risk-discard '+(!changed()?'disabled':'')+'>Annulla modifiche</button>'+
  '<button class="btn compact" type="button" data-risk-save '+(!changed()?'disabled':'')+'>Salva ipotesi</button>')+
  '</div>'+
  (state.notice?'<p class="bf-risk-message" role="status">'+escape(state.notice)+'</p>':'')+
  (readOnly?'<p class="bf-risk-local">Intervalli condivisi in Supabase; i target restano una bozza separata fino all’approvazione del Piano.</p>':
   '<p class="bf-risk-local">Vecchia modalità locale: importa le eccezioni nella Baseline prima di usarle in Strategia.</p>');
}
function rerender(){renderUI()}
function update(payload){
 if(!payload||!Array.isArray(payload.exp)||!Array.isArray(payload.inc))return;
 state.exp=payload.exp;state.inc=payload.inc;state.mountId=payload.mountId||"planningRiskScenarios";state.plannedRows=payload.plannedRows||null;state.adjustments=payload.adjustments||{};
 state.targets=payload.categoryTargets||{};state.goals=numeric(payload.goal);
 state.reliability=payload.reliability||{};
 const current=String(payload.currentMonth||"");
 const next=(payload.horizon||"CALENDAR")+"|"+current;
 if(state.key!==next){state.key=next;state.selected="";state.notice="";}
 const sel=selectedRow();
 if(!sel){
  const salary=allRows().find(r=>r.direction==="INCOME"&&String(r.l2_name||"").toLowerCase()==="stipendio");
  const r=salary||sortedChoices()[0];state.selected=r?String(r.direction)+":"+String(r.category_id):"";
 }
 renderUI();
}
function applyMonth(button){
 const row=selectedRow(),line=button.closest("[data-risk-month]");
 if(!row||!line)return;
 const month=line.getAttribute("data-risk-month"),m=row.months.find(x=>x.month===month);
 if(!m||m.kind==="actual")return;
 const salary=row.direction==="INCOME"&&String(row.l2_name||"").toLowerCase()==="stipendio";
 const inputs={fixed:line.querySelector("[data-risk-fixed]")?.value??"",
  min:line.querySelector("[data-risk-min]")?.value??"",max:line.querySelector("[data-risk-max]")?.value??""};
 const checked=validate(row,m,inputs,salary);
 if(checked.error){state.notice=checked.error;renderUI();return}
 selectedEntries()[key(row,m)]=checked.entry;state.notice="Ipotesi applicata alla simulazione. Premi «Salva ipotesi» per conservarla.";rerender();
}
function init(){
 const validHost=e=>!!e.target?.closest?.("#planningRiskScenarios,#planningBoardRiskScenarios");
 doc.addEventListener("change",e=>{
  if(!validHost(e))return;
  if(e.target.id==="bfRiskCategory"){state.selected=e.target.value;state.notice="";renderUI()}
 });
 doc.addEventListener("click",e=>{
  if(!validHost(e))return;
  const b=e.target.closest("button");if(!b)return;
  if(b.hasAttribute("data-risk-open-baseline")){root.showPlanningBoardView?.("BASELINE");return}
  if(b.hasAttribute("data-risk-apply")){applyMonth(b);return}
  if(b.hasAttribute("data-risk-remove")){
   const row=selectedRow(),month=b.getAttribute("data-risk-remove");
   if(row){delete selectedEntries()[key(row,{month})];state.notice="Intervallo eliminato dalla simulazione (non ancora salvato).";rerender()}return;
  }
  if(b.hasAttribute("data-risk-save")){
   state.saved[state.key]=JSON.parse(JSON.stringify(selectedEntries()));
   if(save())state.notice="Ipotesi salvate nel browser (non nella Baseline).";renderUI();return;
  }
  if(b.hasAttribute("data-risk-discard")){
   state.cache[state.key]=JSON.parse(JSON.stringify(state.saved[state.key]||{}));state.notice="Ripristinate le ultime ipotesi salvate.";rerender();
  }
 });
}
api.render=update;
if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",init);else init();
})(typeof window!=="undefined"?window:globalThis);
