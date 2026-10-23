/* V74.0.0 · Monthly control cockpit. Read only.
   An approved Plan is the immutable benchmark. Actual and Forecast are live.
   Never convert historic Actual into a retroactive target. */
(function(root){
"use strict";
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const round=x=>Math.round((num(x)+Number.EPSILON)*100)/100;
const money=x=>new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0,useGrouping:"always"}).format(num(x));
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&quot;","'":"&#39;"}[c]));
function annualTotal(d){
 if(!d)return 0;
 const year=String(d.current_year_start||"").slice(0,4),current=String(d.current_month||"");
 const actual=(d.actual_monthly||[]).filter(m=>String(m.month||"").startsWith(year)&&String(m.month||"")<current);
 const forecast=(d.forecast_monthly||[]).filter(m=>String(m.month||"").startsWith(year)&&String(m.month||"")>=current);
 return round(actual.reduce((a,m)=>a+num(m.amount),0)+forecast.reduce((a,m)=>a+num(m.effective_amount),0));
}
function monthTotals(d,month){
 const items=(d?.forecast_monthly||[]).filter(m=>String(m.month||"")===month);
 return {forecast:round(items.reduce((a,m)=>a+num(m.effective_amount),0)),
  actual:round(items.reduce((a,m)=>a+num(m.actual_to_date),0))};
}
function categoryRows(approved,live,month,direction){
 const from=(d)=>new Map((d?.forecast_monthly||[]).filter(m=>String(m.month||"")===month).map(m=>[String(m.category_id),m]));
 const plan=from(approved),now=from(live);
 const labels=new Map([...((approved?.categories)||[]),...((live?.categories)||[])].map(c=>[String(c.category_id),String(c.l2_name||c.name||"Categoria")]));
 const ids=[...new Set([...plan.keys(),...now.keys()])];
 return ids.map(id=>{
  const a=plan.get(id),b=now.get(id),planned=num(a?.effective_amount),
   current=num(b?.effective_amount),actual=num(b?.actual_to_date),
   atApproval=num(a?.actual_to_date);
  return {id,direction,name:labels.get(id)||"Categoria",
   planned:round(planned),forecast:round(current),actual:round(actual),
   initialActual:round(atApproval),sinceApproval:round(Math.max(0,actual-atApproval)),
   remaining:round(planned-actual),delta:round(current-planned)};
 });
}
function compare(plan,live){
 if(!plan?.expense||!plan?.income||!live?.expense||!live?.income)return {error:"Piano o proiezione incompleti"};
 const year=String(live.expense.current_year_start||"").slice(0,4);
 const month=String(live.expense.current_month||"");
 const planYear=String(plan.expense.current_year_start||"").slice(0,4);
 if(year!==planYear)return {error:"Il Piano approvato riguarda un anno diverso dal controllo"};
 const totalPlan=round(annualTotal(plan.income)-annualTotal(plan.expense));
 const totalLive=round(annualTotal(live.income)-annualTotal(live.expense));
 const planExp=monthTotals(plan.expense,month),exp=monthTotals(live.expense,month);
 const planInc=monthTotals(plan.income,month),inc=monthTotals(live.income,month);
 const rows=categoryRows(plan.expense,live.expense,month,"EXPENSE")
  .concat(categoryRows(plan.income,live.income,month,"INCOME"));
 const worsening=rows.map(r=>({...r,effect:r.direction==="INCOME"?r.delta:-r.delta}))
  .filter(r=>Math.abs(r.effect)>=.5).sort((a,b)=>a.effect-b.effect);
 const begun=String(plan.snapshot_month||plan.expense.current_month||"")<=month;
 return {
  year,month,planRevision:plan.revision,
  approvedAt:plan.approved_at||"",snapshotMonth:plan.snapshot_month||"",
  annual:{plan:totalPlan,forecast:totalLive,delta:round(totalLive-totalPlan)},
  expenses:{plan:planExp.forecast,forecast:exp.forecast,actual:exp.actual,
   atApproval:planExp.actual,sinceApproval:round(Math.max(0,exp.actual-planExp.actual)),
   remaining:round(planExp.forecast-exp.actual),delta:round(exp.forecast-planExp.forecast)},
  incomes:{plan:planInc.forecast,forecast:inc.forecast,actual:inc.actual,delta:round(inc.forecast-planInc.forecast)},
  rows,worsening,trackingValid:begun
 };
}
function render(rootEl,model){
 if(!rootEl)return;
 if(model.error){rootEl.innerHTML='<p class="bf-control-notice">'+esc(model.error)+'</p>';return}
 const fmtDate=s=>{const d=new Date(s);return Number.isNaN(+d)?s:new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d)};
 const label=new Intl.DateTimeFormat("it-IT",{month:"long",year:"numeric"}).format(new Date(model.month+"T12:00:00"));
 const status=model.annual.delta<-.005?
  "L'avanzo previsto è inferiore al Piano: verifica gli scostamenti prima di modificare i target.":
  model.annual.delta>.005?"L'avanzo previsto è superiore al Piano: non trasformare automaticamente tutto il margine in nuovi consumi.":
  "Il risultato di fine anno è in linea con il Piano approvato.";
 const focus=model.worsening.slice(0,6);
 const table=focus.length?
  '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Voce</th><th>Piano mese</th><th>Actual</th><th>Forecast chiusura</th><th>Impatto sull’avanzo</th></tr></thead><tbody>'+
  focus.map(r=>'<tr><td>'+esc(r.name)+(r.direction==="INCOME"?' <small>Entrata</small>':'')+'</td><td>'+money(r.planned)+'</td><td>'+money(r.actual)+'</td><td>'+money(r.forecast)+'</td><td class="'+(r.effect>=0?'bf-positive':'bf-negative')+'">'+(r.effect>0?'+':'')+money(r.effect)+'</td></tr>').join('')+
  '</tbody></table></div>':
  '<p class="bf-control-muted">Nessuna differenza significativa fra la previsione di chiusura mese e il Piano sulle singole categorie.</p>';
 rootEl.innerHTML='<div class="bf-control-header"><div><h2>Controllo · '+esc(label)+'</h2><p>Piano approvato V'+esc(model.planRevision)+
   ' · '+(model.approvedAt?'approvato il '+esc(fmtDate(model.approvedAt)):'riferimento annuale')+
   ' · confronto con Actual e Forecast aggiornati</p></div><button type="button" class="btn compact ghost" data-bf-control-reload>↻ Aggiorna</button></div>'+
   '<p class="bf-control-notice"><strong>Da quando vale il confronto?</strong> Per il mese in corso, il Piano contiene anche gli importi già spesi quando è stato approvato. Li conserviamo come punto di partenza, non come spese evitabili: i movimenti successivi alimentano il controllo. I mesi precedenti sono storia, non obiettivi fissati retroattivamente.</p>'+
   '<div class="bf-control-kpis">'+
   '<div><small>Avanzo previsto fine '+esc(model.year)+'</small><strong>'+money(model.annual.forecast)+'</strong><span>Piano '+money(model.annual.plan)+'</span></div>'+
   '<div><small>Δ Avanzo vs Piano</small><strong class="'+(model.annual.delta>=0?'bf-positive':'bf-negative')+'">'+(model.annual.delta>0?'+':'')+money(model.annual.delta)+'</strong><span>Confronto dell’intero anno</span></div>'+
   '<div><small>Spese registrate '+esc(label)+'</small><strong>'+money(model.expenses.actual)+'</strong><span>Dopo approvazione '+money(model.expenses.sinceApproval)+'</span></div>'+
   '<div><small>Budget spese ancora disponibile</small><strong class="'+(model.expenses.remaining>=0?'':'bf-negative')+'">'+money(model.expenses.remaining)+'</strong><span>Piano del mese − Actual a oggi</span></div></div>'+
   '<div class="bf-control-monthly"><div><h3>Previsione chiusura mese</h3><p>Spese: '+money(model.expenses.forecast)+' vs Piano '+money(model.expenses.plan)+' (Δ '+money(model.expenses.delta)+')</p><p>Entrate: '+money(model.incomes.forecast)+' vs Piano '+money(model.incomes.plan)+' (Δ '+money(model.incomes.delta)+')</p></div>'+
   '<div><h3>Cosa significa</h3><p>'+esc(status)+'</p></div></div>'+
   '<h3>Le voci che spiegano il cambiamento del mese</h3>'+table+
   '<p class="bf-control-muted">L’Actual riflette soltanto i movimenti importati e classificati fino all’ultimo aggiornamento. Il residuo non è una disponibilità di liquidità bancaria. Gli investimenti seguono la semantica del Tabellone e non vanno confusi con il consumo. Non stimiamo ancora automaticamente il ritmo di spesa giornaliero né suggeriamo tagli sulla base del solo calendario.</p>';
}
const api={annualTotal,monthTotals,categoryRows,compare,render};
root.BudgetFamilyMonthlyControl=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
