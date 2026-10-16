/* Budget Familiare · Simulatore dalla Baseline, funzioni pure e testabili */
(function(root){
"use strict";
const KEYS=["MANDATORY","NECESSARY","DISCRETIONARY","FIXED","PREDICTABLE","VARIABLE"];
const EXP=["MANDATORY","NECESSARY","DISCRETIONARY","UNCLASSIFIED","SAVINGS","OTHER"];
const INC=["FIXED","PREDICTABLE","VARIABLE","OTHER_INCOME"];
const num=v=>Number.isFinite(Number(v))?Number(v):0;
function section(rows,keys){
 const out={};keys.forEach(k=>out[k]={baseline:0,locked:0,flexible:0,simulated:0});
 (rows||[]).forEach(r=>{
  const key=out[r.kind]?r.kind:(keys===EXP?"OTHER":"OTHER_INCOME");
  const entry=out[key];
  const lines=Array.isArray(r.months)?r.months:[];
  const total=lines.reduce((s,m)=>s+num(m.amount),0);
  // Past months and actual part of current month cannot be re-written by a scenario.
  const flexible=lines.reduce((s,m)=>s+(m.kind==="actual"?0:Math.max(0,num(m.futureAmount))),0);
  const locked=total-flexible;
  entry.baseline+=total;entry.locked+=locked;entry.flexible+=flexible;
 });
 return out;
}
function sum(group,field){return Object.values(group).reduce((s,v)=>s+v[field],0)}
function calculate(expRows,incRows,adjustments={},options={}){
 const expenses=section(expRows,EXP),income=section(incRows,INC);
 const modify=(groups,keys)=>{
  Object.entries(groups).forEach(([k,entry])=>{
   const pct=keys.includes(k)?num(adjustments[k]):0;
   const changed=Math.max(0,entry.flexible*(1+pct/100));
   entry.simulated=entry.locked+changed;
  });
 };
 modify(expenses,["MANDATORY","NECESSARY","DISCRETIONARY"]);
 modify(income,["FIXED","PREDICTABLE","VARIABLE"]);
 const baseIncome=sum(income,"baseline"),baseExpenses=sum(expenses,"baseline"),
       simulatedIncome=sum(income,"simulated"),simulatedExpenses=sum(expenses,"simulated"),
       structuralBaseline=baseIncome-expenses.MANDATORY.baseline-expenses.NECESSARY.baseline-expenses.UNCLASSIFIED.baseline,
       structuralSimulated=simulatedIncome-expenses.MANDATORY.simulated-expenses.NECESSARY.simulated-expenses.UNCLASSIFIED.simulated,
       dAndSavings=expenses.DISCRETIONARY.baseline+expenses.SAVINGS.baseline,
       dAndSavingsSim=expenses.DISCRETIONARY.simulated+expenses.SAVINGS.simulated,
       other=expenses.OTHER.baseline,otherSim=expenses.OTHER.simulated,
       baselineBalance=baseIncome-baseExpenses,simulatedBalance=simulatedIncome-simulatedExpenses,
       reserve=Math.max(0,num(options.reserve)),project=Math.max(0,num(options.project)),
       goal=reserve+project;
 return {
  income,expenses,baseIncome,baseExpenses,simulatedIncome,simulatedExpenses,
  structuralBaseline,structuralSimulated,dAndSavings,dAndSavingsSim,other,otherSim,
  baselineBalance,simulatedBalance,impact:simulatedBalance-baselineBalance,
  gapBefore:Math.max(0,-baselineBalance),
  gapAfter:Math.max(0,-simulatedBalance),
  coverageGap:Math.max(0,dAndSavings+other-structuralBaseline),
  target:goal,
  gapToTarget:Math.max(0,goal-simulatedBalance),
  freeAfterGoals:simulatedBalance-goal,
  maxFutureDReduction:expenses.DISCRETIONARY.flexible,
  availableDCurrent:expenses.DISCRETIONARY.simulated,
  monthsScope:expRows?.[0]?.months?.length||12,
  reconciled:Math.abs((structuralBaseline-dAndSavings-other)-baselineBalance)<.01 &&
              Math.abs((structuralSimulated-dAndSavingsSim-otherSim)-simulatedBalance)<.01
 };
}
function reductionForGoal(model,amount){
 const needed=Math.max(0,num(amount)-model.simulatedBalance),
       available=Math.max(0,model.expenses.DISCRETIONARY.flexible);
 if(needed<=.005)return {pct:0,shortfall:0,needed:0,available};
 if(available<=.005)return {pct:0,shortfall:needed,needed,available};
 const pct=Math.min(100,Math.ceil(needed/available*100-1e-9));
 return {pct,shortfall:Math.max(0,needed-available),needed,available};
}
const api=Object.freeze({calculate,reductionForGoal});
if(typeof module!=="undefined"&&module.exports)module.exports=api;
root.BudgetFamilyScenario=api;
})(typeof window!=="undefined"?window:globalThis);
