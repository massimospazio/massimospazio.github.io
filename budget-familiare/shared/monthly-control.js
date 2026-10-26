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
// Adapt immutable continuous monthly targets to the existing Plan-vs-Actual cockpit.
function fromContinuous(record,live){
 if(!record?.revision||!record.month_targets||!live?.expense||!live?.income)return null;
 const make=(direction)=>{
  const original=live[direction],approved=record[direction+"_at_approval"];
  const initial=new Map((approved?.forecast_monthly||[]).map(m=>[String(m.category_id)+":"+m.month,num(m.actual_to_date)]));
  const prefix=direction==="expense"?"EXPENSE:":"INCOME:";
  return {...original,forecast_monthly:(original.forecast_monthly||[]).map(m=>{
   const target=record.month_targets[prefix+String(m.category_id)]?.[m.month];
   const atApproval=initial.get(String(m.category_id)+":"+m.month)||0;
   return {...m,effective_amount:target===undefined?num(m.effective_amount):num(target),actual_to_date:atApproval};
  })};
 };
 return {revision:record.revision,approved_at:record.approved_at,
  snapshot_month:String(record.approved_at||"").slice(0,7)+"-01",
  expense:make("expense"),income:make("income")};
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

// V74.2 — one approved monthly ledger; never convert missing targets to Plan values.
const addMonth=(iso,offset)=>{
 const y=Number(String(iso).slice(0,4)),m=Number(String(iso).slice(5,7));
 const d=new Date(Date.UTC(y,m-1+offset,1));
 return d.toISOString().slice(0,10);
};
const displayMonth=m=>new Intl.DateTimeFormat("it-IT",{month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(m+"T12:00:00Z"));
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const eur=n=>n===null||n===undefined?"—":money(n);
function buildControl(approved,live,meta={},horizon="ROLLING_12"){
 const exp=live?.expense,inc=live?.income;
 if(!exp||!inc||!approved?.month_targets)return {error:"Piano o proiezione mancanti"};
 const current=String(exp.current_month||"");
 if(!/^\d{4}-\d\d-01$/.test(current))return {error:"Mese di proiezione non valido"};
 const start=horizon==="CALENDAR"?current.slice(0,4)+"-01-01":current;
 const months=Array.from({length:12},(_,i)=>addMonth(start,i));
 const metaMap=new Map((meta?.rows||[]).map(r=>[String(r.category_id),r]));
 const rows=[];
 for(const [direction,data] of [["EXPENSE",exp],["INCOME",inc]]){
  const forecast=new Map((data.forecast_monthly||[]).map(m=>[String(m.category_id)+"|"+String(m.month),m]));
  const historic=new Map((data.actual_monthly||[]).map(m=>[String(m.category_id)+"|"+String(m.month),m]));
  const categories=[...(data.categories||[])];
  const categoryIds=new Set(categories.map(c=>String(c.category_id)));
  for(const compound of Object.keys(approved.month_targets)){
   if(!compound.startsWith(direction+":"))continue;
   const id=compound.slice(direction.length+1);
   // Historic/archived categories may still be present in approved revisions.
  // Retain the saved target but do not silently invent forecast for them.
  if(!categoryIds.has(id))categories.push({category_id:id,l2_name:"Categoria archiviata",l1_name:"Da verificare",_archived:true});
  }
  for(const cat of categories){
   const id=String(cat.category_id),entry=approved.month_targets[direction+":"+id]||{};
   const natureMeta=metaMap.get(id)||{};
   const rec={id:direction+":"+id,direction,categoryId:id,
    name:String(cat.l2_name||cat.name||"Categoria"),
    l1Id:String(cat.l1_id||cat.l1_name||"Senza L1"),
    l1Name:String(cat.l1_name||"Senza L1"),
    nature:String(direction==="EXPENSE"?(natureMeta.expense_nature||cat.expense_nature||""):(natureMeta.income_nature||cat.income_nature||"")),
    months:{}};
   for(const month of months){
    const old=month<current;
    const f=forecast.get(id+"|"+month),a=historic.get(id+"|"+month);
    const actual=old?(a?num(a.amount):0):(month===current?num(f?.actual_to_date):0);
    const predicted=old?actual:(f?num(f.effective_amount):(cat._archived?null:0));
    const planned=has(entry,month)&&Number.isFinite(Number(entry[month]))?num(entry[month]):null;
    const status=old?"CLOSED":planned!==null?"APPROVED":"PROVISIONAL";
    const delta=(!old&&planned!==null&&predicted!==null)?
       round(direction==="EXPENSE"?planned-predicted:predicted-planned):null;
    rec.months[month]={month,actual,forecast:predicted,plan:old?null:planned,status,delta};
   }
   rows.push(rec);
  }
 }
 const series=months.map(month=>{
  const active=month>=current,records=rows.map(r=>({...r.months[month],direction:r.direction}));
  const incRows=records.filter(x=>x.direction==="INCOME"),expRows=records.filter(x=>x.direction==="EXPENSE");
  const total=(a,k)=>a.reduce((n,x)=>n+num(x[k]),0);
  const completeForecast=records.every(r=>r.forecast!==null);
  const missing=active?records.filter(x=>x.plan===null).length:0;
  const comparable=active?records.filter(x=>x.plan!==null&&x.forecast!==null):[];
  const incForecast=completeForecast?round(total(incRows,"forecast")):null;
  const expForecast=completeForecast?round(total(expRows,"forecast")):null;
  const forecastNet=completeForecast?round(incForecast-expForecast):null;
  const planIncome=active?round(total(incRows.filter(x=>x.plan!==null),"plan")):null;
  const planExpense=active?round(total(expRows.filter(x=>x.plan!==null),"plan")):null;
  const planNet=active&&missing===0?round(planIncome-planExpense):null;
  const deltaComparable=active?round(comparable.reduce((n,x)=>n+num(x.delta),0)):null;
  return {month,active,income:incForecast,expense:expForecast,net:forecastNet,
   planIncome,planExpense,planNet,actualIncome:round(total(incRows,"actual")),
   actualExpense:round(total(expRows,"actual")),
   missing,totalCategories:records.length,compared:comparable.length,deltaComparable,
   completeForecast};
 });
 let cumulative=0,cumulativeKnown=true;
 for(const m of series){
  if(m.net===null)cumulativeKnown=false;
  if(cumulativeKnown)cumulative=round(cumulative+m.net);
  m.cumulative=cumulativeKnown?cumulative:null;
 }
 const activeRows=series.filter(m=>m.active);
 const complete=activeRows.length>0&&activeRows.every(m=>m.missing===0&&m.completeForecast);
 const totalForecast=series.every(m=>m.net!==null)?round(series.reduce((n,m)=>n+m.net,0)):null;
 const futureForecast=activeRows.every(m=>m.net!==null)?round(activeRows.reduce((n,m)=>n+m.net,0)):null;
 const planTotal=complete&&series.every(m=>m.planNet!==null||!m.active)?
   round(activeRows.reduce((n,m)=>n+m.planNet,0)):null;
 const coverage={approved:activeRows.reduce((n,m)=>n+(m.totalCategories-m.missing),0),
   expected:activeRows.reduce((n,m)=>n+m.totalCategories,0),
   missing:activeRows.reduce((n,m)=>n+m.missing,0)};
 const selectedRisks=(month)=>rows
   .filter(r=>r.direction==="EXPENSE"&&r.months[month]?.delta!==null&&r.months[month].delta<-.005)
   .map(r=>({...r,metric:r.months[month]}))
   .sort((a,b)=>a.metric.delta-b.metric.delta);
 const worst=activeRows.filter(r=>r.net!==null).sort((a,b)=>a.net-b.net)[0]||null;
 return {kind:"extended",revision:approved.revision,approvedAt:approved.approved_at||"",
  current,horizon,months,series,rows,complete,coverage,
  totalForecast,planTotal,delta:futureForecast!==null&&planTotal!==null?round(futureForecast-planTotal):null,
  worst:worst?{month:worst.month,net:worst.net}:null,
  risksForMonth:selectedRisks,notes:"Il saldo cumulato è economico, non liquidità bancaria"};
}
const controlUi={period:"ROLLING_12",tab:"SUMMARY",month:null,direction:"EXPENSE",onlyRisks:false,expanded:{},sort:"IMPACT",selectedCategory:null};
let currentControlRecord=null,currentControlLive=null,currentControlMeta=null,currentControlHost=null;
function safeClass(n){return n===null?"":n<-.005?"bf-negative":n>.005?"bf-positive":""}
function humanDelta(n){return n===null?"—":(n>0?"+":"")+money(n)}
function statusText(s){return s==="APPROVED"?"Approvato":s==="CLOSED"?"Consuntivo":"Provvisorio"}
function showMonth(model,month){
 const m=model.series.find(x=>x.month===month);return m||model.series.find(x=>x.active)||model.series[0];
}
function monthCategory(model,month){
 return model.rows.map(r=>({...r,metric:r.months[month]}))
  .filter(r=>r.direction===controlUi.direction);
}
function alerts(model,month){
 const items=[];
 if(model.series.some(m=>m.active&&!m.completeForecast))items.push({type:"quality",title:"Previsioni incomplete",
  text:"Almeno una categoria non ha una previsione mensile disponibile. I totali dipendenti da questi dati non vengono calcolati.",
  action:"Verifica la configurazione della Baseline e aggiorna i dati prima di trarre conclusioni."});
 if(model.coverage.missing>0)items.push({type:"quality",title:"Copertura del Piano incompleta",
  text:model.coverage.missing+" obiettivi mensili non approvati nel periodo. I forecast di questi mesi non vengono conteggiati come Piano.",
  action:"Rivedi la copertura e approva i nuovi mesi quando sono stati decisi."});
 const risks=model.risksForMonth(month).slice(0,3);
 for(const r of risks){
  const amount=round(-r.metric.delta);
  items.push({type:"risk",title:r.name+" · rischio di sforamento",
   text:"Forecast "+money(r.metric.forecast)+" contro Piano "+money(r.metric.plan)+" ("+money(amount)+" in più).",
   action:r.nature==="DISCRETIONARY"?"Valuta di contenere le spese residue; non alzare automaticamente il Piano.":"Verifica le scadenze e l'attendibilità della previsione."});
 }
 if(model.totalForecast!==null&&model.totalForecast<0)
  items.push({type:"risk",title:"Avanzo previsto negativo nel periodo",
   text:"Il saldo economico previsto è "+money(model.totalForecast)+". Non equivale al saldo bancario.",
   action:"Esamina i mesi con disavanzo e le categorie che contribuiscono maggiormente."});
 if(!items.length)items.push({type:"ok",title:"Nessun rischio significativo rilevato",
   text:"Nelle categorie con Piano approvato non emergono sforamenti previsti per "+displayMonth(month)+".",
   action:"Continua ad aggiornare e classificare i movimenti."});
 return items;
}
function tableMonth(model,month){
 const rows=monthCategory(model,month);
 const groups=new Map();
 for(const row of rows){
  const k=row.l1Id+"|"+row.l1Name;
  if(!groups.has(k))groups.set(k,{key:k,name:row.l1Name,items:[]});
  groups.get(k).items.push(row);
 }
 const sorted=[...groups.values()].map(g=>{
  const valid=g.items.filter(r=>r.metric.plan!==null);
  const forecastComplete=g.items.every(r=>r.metric.forecast!==null);
  const agg={plan:valid.reduce((n,r)=>n+r.metric.plan,0),actual:g.items.reduce((n,r)=>n+r.metric.actual,0),
   forecast:forecastComplete?round(g.items.reduce((n,r)=>n+r.metric.forecast,0)):null,
   missing:g.items.filter(r=>r.metric.status==="PROVISIONAL").length,
   delta:null};
  if(!agg.missing&&agg.forecast!==null)
    agg.delta=round(g.items.reduce((n,r)=>n+(r.metric.delta||0),0));
  g.aggregate=agg;
  return g;
 }).sort((a,b)=>controlUi.sort==="IMPACT"?
  (a.aggregate.delta??Infinity)-(b.aggregate.delta??Infinity):
  a.name.localeCompare(b.name,"it"));
 const amountCell=(a,isPlan,missing)=>isPlan&&missing?'<span title="Totale parziale: target non approvati">Parziale '+money(a)+'</span>':eur(a);
 const line=(name,cls,metric,missing,status,id,expand)=>{
  const remaining=metric.plan===null?null:round(metric.plan-metric.actual);
  return '<tr class="'+cls+'">'+
  '<td>'+name+'</td>'+
  '<td>'+amountCell(metric.plan,cls==='bf-control-group',missing)+'</td>'+
  '<td>'+money(metric.actual)+'</td>'+
  '<td>'+eur(metric.forecast)+'</td>'+
  '<td class="'+safeClass(metric.delta)+'">'+humanDelta(metric.delta)+'</td>'+
  '<td>'+eur(remaining)+'</td>'+
  '<td><span class="bf-status bf-status-'+esc(status.toLowerCase())+'">'+esc(statusText(status))+'</span></td></tr>';
 };
 let out='';
 for(const g of sorted){
  const ag=g.aggregate;
  if(controlUi.onlyRisks&&!g.items.some(r=>r.metric.delta!==null&&r.metric.delta<-.005))continue;
  const expanded=!!controlUi.expanded[g.key],id=encodeURIComponent(g.key);
  const status=ag.missing?"PROVISIONAL":month<model.current?"CLOSED":"APPROVED";
  out+=line('<button class="bf-tree-toggle" type="button" data-bf-control-expand="'+esc(id)+'" aria-expanded="'+expanded+'">'+(expanded?"▾":"▸")+' '+esc(g.name)+' <small>('+g.items.length+')</small></button>',
    'bf-control-group',ag,ag.missing,status,null);
  if(expanded){
   let items=[...g.items];
   if(controlUi.onlyRisks)items=items.filter(r=>r.metric.delta!==null&&r.metric.delta<-.005);
   items.sort((a,b)=>controlUi.sort==="NAME"?a.name.localeCompare(b.name,"it"):
     controlUi.sort==="AMOUNT"?(b.metric.forecast??-Infinity)-(a.metric.forecast??-Infinity):
      (a.metric.delta??Infinity)-(b.metric.delta??Infinity));
   for(const r of items)out+=line('<button type="button" class="bf-tree-toggle bf-control-indent" data-bf-control-category="'+esc(r.id)+'">'+esc(r.name)+'</button> <small>'+esc(r.nature==="DISCRETIONARY"?"D":r.nature==="NECESSARY"?"N":r.nature==="MANDATORY"?"O":"")+'</small>',
    'bf-control-child',r.metric,false,r.metric.status,r.id);
  }
 }
 return out||'<tr><td colspan="7">Nessuna categoria per il filtro selezionato.</td></tr>';
}
function categoryTimeline(model){
 const selected=model.rows.find(r=>r.id===controlUi.selectedCategory&&r.direction===controlUi.direction);
 if(!selected)return "";
 return '<section class="bf-panel bf-control-category-timeline"><div class="bf-control-section-head"><h3>'+esc(selected.l1Name)+' / '+esc(selected.name)+' · 12 mesi</h3>'+
  '<button type="button" data-bf-control-category="CLOSE" class="btn compact ghost">✕ Chiudi dettaglio</button></div>'+
  '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Mese</th><th>Piano</th><th>Actual</th><th>Forecast</th><th>Δ sul risultato</th><th>Stato</th></tr></thead><tbody>'+
   model.months.map(m=>{
    const x=selected.months[m];
    return '<tr><td>'+esc(displayMonth(m))+'</td><td>'+eur(x.plan)+'</td><td>'+eur(x.actual)+'</td><td>'+eur(x.forecast)+'</td>'+
    '<td class="'+safeClass(x.delta)+'">'+humanDelta(x.delta)+'</td><td><span class="bf-status bf-status-'+x.status.toLowerCase()+'">'+esc(statusText(x.status))+'</span></td></tr>';
   }).join('')+'</tbody></table></div>'+
   '<p class="bf-control-muted">Il forecast di una categoria è una stima aggiornata, non un nuovo obiettivo. Un valore di Piano «—» indica assenza di approvazione per quel mese.</p></section>';
}

function renderExtended(host,model){
 if(!host||!model||model.error){if(host)host.innerHTML='<p class="bf-control-notice">'+esc(model?.error||"Dati assenti")+'</p>';return}
 const sm=showMonth(model,controlUi.month);
 controlUi.month=sm.month;
 const label=controlUi.period==="CALENDAR"?"Anno "+model.current.slice(0,4):"12 mesi · "+displayMonth(model.months[0])+" – "+displayMonth(model.months[11]);
 const closed=sm.month<model.current;
 const coveragePct=model.coverage.expected?Math.round(100*model.coverage.approved/model.coverage.expected):0;
 const focus=model.risksForMonth(sm.month);
 const bodyAlerts=alerts(model,sm.month).slice(0,5).map(a=>
  '<div class="bf-control-message bf-control-message-'+a.type+'"><strong>'+esc(a.title)+'</strong><p>'+esc(a.text)+'</p><small>'+esc(a.action)+'</small></div>').join('');
 const buttons='<div class="bf-control-buttons">'+
  ["SUMMARY","CATEGORIES","FLOWS"].map((v,i)=>'<button type="button" data-bf-control-tab="'+v+'" class="btn compact '+(controlUi.tab===v?'':'ghost')+'">'+["Sintesi","Categorie","Flussi mensili"][i]+'</button>').join('')+'</div>';
 const select='<div class="bf-control-buttons">'+
  ['ROLLING_12','CALENDAR'].map((v,i)=>'<button type="button" data-bf-control-period="'+v+'" class="btn compact '+(controlUi.period===v?'':'ghost')+'">'+['12 mesi rolling','Anno corrente'][i]+'</button>').join('')+'</div>';
 const partial=model.coverage.missing>0;
 const monthlyResidue=closed?"—":sm.missing?"Parziale "+money(sm.planExpense-sm.actualExpense):money(sm.planExpense-sm.actualExpense);
 const top='<div class="bf-control-header"><div><h2>Controllo · '+esc(label)+'</h2>'+
  '<p>Piano V'+esc(model.revision)+' · confronto con Actual e Forecast · '+esc(model.current.slice(0,7))+
  ' · nessuna revisione automatica</p></div><button class="btn compact ghost" data-bf-control-reload>↻ Aggiorna dati</button></div>'+
  '<div class="bf-control-controls">'+select+buttons+'</div>'+
  '<div class="bf-control-kpis bf-control-kpis-v2">'+
  '<div><small>Saldo economico previsto · periodo</small><strong class="'+safeClass(model.totalForecast)+'">'+eur(model.totalForecast)+'</strong><span>Entrate meno uscite; non liquidità bancaria</span></div>'+
  '<div><small>Δ vs Piano · mesi comparabili</small><strong class="'+safeClass(model.delta)+'">'+
   (model.delta===null?'—':humanDelta(model.delta))+'</strong><span>'+(model.delta===null?'Piano o forecast incompleto: non calcolabile sul totale':'Confronto del periodo selezionato')+'</span></div>'+
  '<div><small>Budget spese residuo · '+esc(displayMonth(sm.month))+'</small><strong>'+esc(monthlyResidue)+'</strong><span>'+(closed?'Consuntivo chiuso: nessun budget residuo':sm.missing?'Piano − Actual · copertura incompleta':'Piano − Actual · target approvati')+'</span></div>'+
  '<div><small>Sforamenti previsti · mese</small><strong class="'+(focus.length?'bf-negative':'')+'">'+focus.length+'</strong><span>'+money(focus.reduce((n,r)=>n-r.metric.delta,0))+' di impatto sulle uscite</span></div>'+
  '<div><small>Copertura target del periodo</small><strong>'+coveragePct+'%</strong><span>'+model.coverage.approved+' / '+model.coverage.expected+' categoria-mesi'+(partial?' · parte provvisoria':'')+'</span></div>'+
  '<div><small>Mese più critico · flusso netto</small><strong>'+esc(model.worst?displayMonth(model.worst.month):"—")+'</strong><span>'+eur(model.worst?.net)+' · prima dei saldi iniziali</span></div></div>'+
  (partial?'<p class="bf-control-notice">La copertura del Piano è incompleta: i mesi/categorie senza target esplicito rimangono <strong>provvisori</strong>. Non sono assimilati a un Piano approvato nei confronti o nei totali.</p>':'');
 const monthMenu='<div class="bf-month-strip" aria-label="Scegli mese del controllo">'+model.series.map(m=>
  '<button type="button" data-bf-control-month="'+m.month+'" class="'+(m.month===sm.month?'active':'')+'">'+
   '<span>'+esc(displayMonth(m.month))+'</span><small class="'+(m.net!==null&&m.net<0?'bf-negative':'')+'">'+eur(m.net)+'</small>'+
   (m.active&&m.missing?'<i title="Target provvisori"></i>':'')+
   '</button>').join('')+'</div>';
 let panel='';
 if(controlUi.tab==="SUMMARY"){
  panel='<div class="bf-control-columns"><section class="bf-panel"><h3>Attenzioni e prossime azioni · '+esc(displayMonth(sm.month))+'</h3>'+
    '<div class="bf-control-messages">'+bodyAlerts+'</div></section>'+
   '<section class="bf-panel"><h3>Bilancio del mese</h3>'+
    '<div class="bf-control-quickrows"><div><span>Entrate previste</span><strong>'+eur(sm.income)+'</strong></div>'+
    '<div><span>Uscite previste</span><strong>'+eur(sm.expense)+'</strong></div>'+
    '<div><span>Saldo economico mese</span><strong class="'+safeClass(sm.net)+'">'+eur(sm.net)+'</strong></div>'+
    '<div><span>Saldo mese da Piano</span><strong>'+eur(sm.planNet)+'</strong></div>'+
    '<div><span>Entrate già registrate</span><strong>'+money(sm.actualIncome)+'</strong></div>'+
    '<div><span>Uscite già registrate</span><strong>'+money(sm.actualExpense)+'</strong></div></div>'+
    '<p class="bf-control-muted">Il confronto col Piano è disponibile solo con copertura completa. Il saldo previsto dei conti richiede saldi bancari e timing dei movimenti.</p></section></div>'+
    '<section class="bf-panel"><h3>Principali scostamenti sulle uscite · '+esc(displayMonth(sm.month))+'</h3>'+riskTable(focus)+'</section>'+
    '<section class="bf-panel"><h3>Spese con peggioramento previsto · intero periodo</h3>'+periodRiskTable(model)+'</section>';
 }else if(controlUi.tab==="CATEGORIES"){
  const table='<div class="bf-control-overflow"><table class="bf-control-table bf-control-detail"><thead><tr><th>Categoria L1 / L2</th><th>Piano</th><th>Actual</th><th>Forecast</th><th>Δ sul risultato</th><th>Residuo</th><th>Stato</th></tr></thead><tbody>'+
   tableMonth(model,sm.month)+'</tbody></table></div>';
  panel='<section class="bf-panel"><div class="bf-control-section-head"><h3>Dettaglio per categoria · '+esc(displayMonth(sm.month))+'</h3><div class="bf-control-buttons">'+
   ["EXPENSE","INCOME"].map((v,i)=>'<button class="btn compact '+(controlUi.direction===v?'':'ghost')+'" data-bf-control-direction="'+v+'">'+['Uscite','Entrate'][i]+'</button>').join('')+
   '<button class="btn compact ghost" data-bf-control-risk-filter="'+(controlUi.onlyRisks?'ALL':'RISK')+'">'+(controlUi.onlyRisks?'Mostra tutte':'Solo sforamenti')+'</button>'+
   '<button class="btn compact ghost" data-bf-control-sort="'+(controlUi.sort==="IMPACT"?'NAME':'IMPACT')+'">Ordine: '+(controlUi.sort==="IMPACT"?'impatto':'nome')+'</button></div></div>'+
   table+'<p class="bf-control-muted">Espandi una L1 e seleziona una L2 per vedere il tracking su tutti i 12 mesi. Gli importi parziali o provvisori non sono target approvati.</p></section>'+categoryTimeline(model);
 }else{
  panel='<section class="bf-panel"><h3>Flusso economico mese per mese · '+esc(label)+'</h3>'+
  '<div class="bf-control-overflow"><table class="bf-control-table bf-control-timeline"><thead><tr><th>Mese</th><th>Entrate previste</th><th>Uscite previste</th><th>Saldo mese</th><th>Saldo cumulato*</th><th>Saldo Piano**</th><th>Copertura</th></tr></thead><tbody>'+
   model.series.map(m=>'<tr><td><button class="bf-tree-toggle" data-bf-control-month="'+m.month+'">'+esc(displayMonth(m.month))+'</button></td>'+
   '<td>'+eur(m.income)+'</td><td>'+eur(m.expense)+'</td><td class="'+safeClass(m.net)+'">'+eur(m.net)+'</td>'+
   '<td class="'+safeClass(m.cumulative)+'">'+eur(m.cumulative)+'</td><td>'+eur(m.planNet)+'</td>'+
   '<td>'+(m.active?(m.missing?'<span class="bf-status bf-status-provisional">'+m.missing+' non approvati</span>':'<span class="bf-status bf-status-approved">Approvato</span>'):'Consuntivo')+'</td></tr>').join('')+'</tbody></table></div>'+
   '<p class="bf-control-muted">* Cumulato dei flussi economici del periodo, con partenza convenzionale da zero. ** Solo mesi coperti interamente da Piano approvato; non è un saldo bancario. Le uscite e gli investimenti mantengono le semantiche delle proiezioni L2 attuali.</p></section>';
 }
 host.innerHTML=top+monthMenu+panel;
}
function periodRiskTable(model){
 const items=model.rows.filter(r=>r.direction==="EXPENSE").map(r=>{
  const cells=model.months.filter(m=>m>=model.current).map(m=>r.months[m])
   .filter(c=>c.plan!==null&&c.forecast!==null);
  return {...r,totalDelta:round(cells.reduce((n,c)=>n+c.delta,0)),months:cells.length};
 }).filter(r=>r.totalDelta<-.005).sort((a,b)=>a.totalDelta-b.totalDelta).slice(0,8);
 if(!items.length)return '<p class="bf-control-muted">Nessun peggioramento del forecast nelle categorie con target approvato.</p>';
 return '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Categoria</th><th>Mesi confrontabili</th><th>Impatto periodo</th></tr></thead><tbody>'+
  items.map(r=>'<tr><td>'+esc(r.l1Name)+' / '+esc(r.name)+'</td><td>'+r.months+'</td><td class="bf-negative">'+humanDelta(r.totalDelta)+'</td></tr>').join('')+
 '</tbody></table></div><p class="bf-control-muted">Somma dei soli mesi con target esplicitamente approvato e forecast disponibile; le categorie senza target non vengono confrontate.</p>';
}
function riskTable(items){
 if(!items.length)return '<p class="bf-control-muted">Nessuna categoria di uscita approvata presenta uno sforamento previsto significativo nel mese selezionato.</p>';
 return '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Categoria</th><th>Piano</th><th>Forecast</th><th>Δ sul risultato</th></tr></thead><tbody>'+
  items.slice(0,12).map(r=>'<tr><td>'+esc(r.l1Name)+' / '+esc(r.name)+'</td><td>'+money(r.metric.plan)+'</td><td>'+money(r.metric.forecast)+'</td><td class="bf-negative">'+humanDelta(r.metric.delta)+'</td></tr>').join('')+'</tbody></table></div>';
}
function renderTracking(host,approved,live,meta){
 currentControlHost=host;currentControlRecord=approved;currentControlLive=live;currentControlMeta=meta;
 const result=buildControl(approved,live,meta,controlUi.period);
 return renderExtended(host,result);
}
function handleControlClick(e){
 if(!currentControlHost)return false;
 const attr=[
  ["data-bf-control-tab","tab"],
  ["data-bf-control-period","period"],
  ["data-bf-control-month","month"],
  ["data-bf-control-direction","direction"],
  ["data-bf-control-expand","expand"],
  ["data-bf-control-category","category"],
  ["data-bf-control-risk-filter","risk"],
  ["data-bf-control-sort","sort"]
 ];
 for(const [name,field] of attr){
  const el=e.target?.closest?.("["+name+"]");if(!el)continue;
  const value=el.getAttribute(name);
  if(field==="expand"){const key=decodeURIComponent(value);controlUi.expanded[key]=!controlUi.expanded[key]}
  else if(field==="category")controlUi.selectedCategory=value==="CLOSE"?null:value;
  else if(field==="risk")controlUi.onlyRisks=value==="RISK";
  else controlUi[field]=value;
  renderTracking(currentControlHost,currentControlRecord,currentControlLive,currentControlMeta);
  return true;
 }
 return false;
}

const api={annualTotal,monthTotals,categoryRows,fromContinuous,compare,render,buildControl,renderTracking,handleControlClick};
root.BudgetFamilyMonthlyControl=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
