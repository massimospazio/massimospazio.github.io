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
  '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Voce</th><th>Piano mese</th><th>Actual</th><th>Proiezione di chiusura</th><th>Impatto sull’avanzo</th></tr></thead><tbody>'+
  focus.map(r=>'<tr><td>'+esc(r.name)+(r.direction==="INCOME"?' <small>Entrata</small>':'')+'</td><td>'+money(r.planned)+'</td><td>'+money(r.actual)+'</td><td>'+money(r.forecast)+'</td><td class="'+(r.effect>=0?'bf-positive':'bf-negative')+'">'+(r.effect>0?'+':'')+money(r.effect)+'</td></tr>').join('')+
  '</tbody></table></div>':
  '<p class="bf-control-muted">Nessuna differenza significativa fra la previsione di chiusura mese e il Piano sulle singole categorie.</p>';
 rootEl.innerHTML='<div class="bf-control-header"><div><h2>Controllo · '+esc(label)+'</h2><p>Piano approvato V'+esc(model.planRevision)+
   ' · '+(model.approvedAt?'approvato il '+esc(fmtDate(model.approvedAt)):'riferimento annuale')+
   ' · confronto con consuntivi e proiezione tecnica</p></div><button type="button" class="btn compact ghost" data-bf-control-reload>↻ Aggiorna</button></div>'+
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
  const snapshot=approved?.[direction.toLowerCase()+"_at_approval"];
  const atApprovalMap=new Map((snapshot?.forecast_monthly||[]).map(m=>[String(m.category_id)+"|"+String(m.month),m]));
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
    const atApproval=atApprovalMap.get(id+"|"+month);
    const approvalEstimate=!old&&atApproval&&Number.isFinite(Number(atApproval.effective_amount))?num(atApproval.effective_amount):null;
    const actual=old?(a?num(a.amount):0):(month===current?num(f?.actual_to_date):0);
    const predicted=old?actual:(f?num(f.effective_amount):(cat._archived?null:0));
    const planned=has(entry,month)&&Number.isFinite(Number(entry[month]))?num(entry[month]):null;
    const status=old?"CLOSED":planned!==null?"APPROVED":"PROVISIONAL";
    const delta=(!old&&planned!==null&&predicted!==null)?
       round(direction==="EXPENSE"?planned-predicted:predicted-planned):null;
    rec.months[month]={month,actual,forecast:predicted,atApproval:approvalEstimate,plan:old?null:planned,status,delta};
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
 // Distinguish an inherited technical gap at approval from later recomputations.
 // If the stored approval snapshot is missing, the split is explicitly unavailable.
 const approvalCells=rows.flatMap(r=>months.filter(m=>m>=current).map(m=>({direction:r.direction,...r.months[m]})));
 const hasApprovalSnapshot=complete&&approvalCells.length>0&&approvalCells.every(x=>x.plan!==null&&x.forecast!==null&&x.atApproval!==null);
 const initialGap=hasApprovalSnapshot?round(approvalCells.reduce((n,x)=>n+(x.direction==="INCOME"?x.atApproval-x.plan:x.plan-x.atApproval),0)):null;
 const afterApprovalGap=hasApprovalSnapshot?round(approvalCells.reduce((n,x)=>n+(x.direction==="INCOME"?x.forecast-x.atApproval:x.atApproval-x.forecast),0)):null;
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
  totalForecast,futureForecast,planTotal,initialGap,afterApprovalGap,
  delta:futureForecast!==null&&planTotal!==null?round(futureForecast-planTotal):null,
  worst:worst?{month:worst.month,net:worst.net}:null,
  risksForMonth:selectedRisks,notes:"Il saldo cumulato è economico, non liquidità bancaria"};
}

// Self-contained, actionable help for every key metric and section. No external service.
const controlHelp={
 outcome:["Risultato stimato (proiezione tecnica)","Somma delle entrate previste meno le uscite previste nel periodo visualizzato.","Σ (entrate forecast − uscite forecast) mese per mese. Il mese corrente include gli importi già registrati.","Positivo indica avanzo economico, negativo disavanzo. Non è il denaro disponibile sul conto: non include un saldo bancario iniziale."],
 deviation:["Scostamento dal Piano","Misura quanto il risultato economico futuro si discosta dagli obiettivi che hai approvato.","Σ (Forecast entrate − Piano entrate) − Σ (Forecast uscite − Piano uscite), sui mesi futuri confrontabili.","Negativo = peggioramento, positivo = miglioramento. Se manca un target o una previsione, il totale appare come «—» e non viene inventato."],
 remaining:["Budget spese residuo","Quota del budget di spesa mensile che non risulta ancora utilizzata alla data dei movimenti importati.","Spese previste nel Piano approvato per il mese − spese effettivamente registrate fino a oggi.","Non è denaro sul conto. Se il mese è chiuso non c'è un residuo utilizzabile; con obiettivi mancanti la cifra è parziale."],
 overspend:["Possibili sforamenti (stima)","Numero di categorie con forecast significativamente superiore al target approvato nel mese.","Per ogni uscita confronta Proiezione tecnica e Piano: segnala solo scostamenti superiori sia alla soglia minima in euro sia alla percentuale configurata.","Indica un rischio previsto, non uno sforamento già avvenuto. Regola la sensibilità degli avvisi se necessario."],
 sensitivity:["Sensibilità degli avvisi","Stabilisce quando un peggioramento viene evidenziato in rosso o genera un messaggio.","Sono richieste entrambe le condizioni: scostamento di almeno 15€/30€/75€ e di almeno 5%/10%/20% del valore Piano, secondo il livello scelto.","Alta individua scostamenti più piccoli; Bassa lascia emergere solo quelli maggiori. I calcoli economici non cambiano."],
 coverage:["Copertura degli obiettivi","Percentuale delle coppie categoria–mese del periodo futuro con target esplicitamente approvato.","100 × obiettivi categoria–mese approvati / totale categoria–mese attesi nel periodo.","100% è una condizione di qualità della pianificazione, non un risultato economico. Se è inferiore, alcuni confronti non sono attendibili."],
 worst:["Mese con flusso più negativo","Mese futuro con il saldo economico previsto più basso nella finestra.","Minimo di (Entrate forecast − Uscite forecast) per singolo mese futuro.","Un mese negativo non è automaticamente fuori Piano: vacanze e spese programmate possono renderlo normale. Verifica lo scostamento dal Piano."],
 months:["Calendario mensile","Ti permette di passare rapidamente dal mese corrente ai mesi successivi e osservare i diversi andamenti.","Ogni valore è il saldo economico forecast del mese. Il colore segnala lo scostamento dal Piano, non soltanto il segno del saldo.","Blu o grigio = in linea/da verificare; rosso = peggioramento significativo del risultato; ambra = categoria a rischio pur con risultato mensile complessivamente vicino al Piano; verde = miglioramento significativo."],
 trend:["Andamento sui 12 mesi","Mostra a colpo d'occhio come evolve il risultato mensile rispetto al Piano approvato.","Barre: saldo economico forecast; linea tratteggiata: saldo mensile previsto dal Piano, se interamente approvato.","Le barre sotto lo zero non sono necessariamente anomale. Rosso segnala peggioramento significativo del saldo; ambra una singola categoria a rischio; blu un valore neutro, verde un miglioramento rispetto al Piano. Non è liquidità bancaria."],
 actions:["Priorità e prossime azioni","Raccoglie i rischi e i dati da verificare, prima di decidere come intervenire.","Gli avvisi derivano dai target approvati, dal forecast aggiornato e dalla copertura dei dati.","Prima controlla importazioni, categorie e qualità del forecast. Una previsione peggiore del Piano non comporta la sua modifica automatica."],
 monthbalance:["Bilancio del mese","Riepiloga le entrate, le uscite e il saldo economico del mese selezionato.","Saldo mese = entrate forecast − uscite forecast; Piano = entrate target − uscite target quando tutti i target sono approvati.","Actual indica solo quanto registrato; forecast comprende la previsione complessiva del mese. Non confondere saldo economico e liquidità."],
 periodimpact:["Chi contribuisce allo scostamento","Evidenzia le categorie che peggiorano e quelle che compensano il risultato dell'intero periodo.","Per una spesa: Piano − Forecast; per un'entrata: Forecast − Piano. Somma solo mesi futuri e target approvati.","Barre rosse = contributi negativi all'avanzo, verdi = positivi. I compensatori non cancellano la necessità di verificare gli sforamenti."],
 categories:["Controllo categorie L1/L2","Permette di individuare le categorie che hanno consumato budget o rischiano di superare gli obiettivi.","Piano = target approvato, Actual = uscite/entrate registrate, Forecast = stima di fine mese, Δ = impatto sull'avanzo.","Apri una L1 e seleziona una L2 per la sequenza dei 12 mesi. Una previsione non diventa automaticamente un obiettivo."],
 categorytrend:["Evoluzione di una categoria","Segue una L2 mese per mese, evidenziando la distanza tra Piano e proiezione tecnica.","Il delta delle uscite è Piano − Forecast; per le entrate Forecast − Piano.","Il valore «—» indica assenza di target o previsione attendibile. Il mese chiuso mostra consuntivo, non un obiettivo retroattivo."],
 flows:["Flussi economici mensili","Confronta il saldo mese per mese e mostra il risultato cumulato dell'intero intervallo.","Saldo mese = Entrate − Uscite; cumulato = somma progressiva dei saldi mensili, partendo convenzionalmente da zero.","Non è il saldo previsto dei conti. Per la liquidità servono anche saldi iniziali verificati, giroconti, investimenti e tempi di pagamento."],
 chartflows:["Grafico dei flussi","Rappresenta il saldo mensile previsto e il saldo pianificato; aiuta a individuare mesi da analizzare.","Barre = Forecast entrate − uscite; linea = Piano entrate − uscite, quando il mese è coperto.","Il colore delle barre segnala se il forecast è peggiore o migliore del Piano, non il fatto che il saldo sia negativo."],
 breakdown:["Sforamenti del mese","Elenca le uscite il cui forecast supera il target approvato nel mese selezionato.","Sforamento = Forecast uscite − Piano uscite; delta sul risultato = −sforamento.","Una previsione di sforamento non significa che sia già avvenuto: controlla Actual, residuo e comportamenti futuri."],
};
function infoButton(id){
 const h=controlHelp[id];if(!h)return "";
 const opened=controlUi.openHelp===id;
 return '<span class="bf-info-wrap"><button type="button" class="bf-info-trigger" data-bf-control-help="'+esc(id)+'" aria-label="Informazioni: '+esc(h[0])+'" aria-expanded="'+opened+'" title="Spiegazione di '+esc(h[0])+'">i</button>'+
 (opened?'<span class="bf-help-card" role="note"><strong>'+esc(h[0])+'</strong>'+
 '<span><b>Cos’è e a cosa serve</b>'+esc(h[1])+'</span>'+
 '<span><b>Come si calcola</b>'+esc(h[2])+'</span>'+
 '<span><b>Come leggerlo</b>'+esc(h[3])+'</span>'+
 '<button type="button" data-bf-control-help-close aria-label="Chiudi spiegazione">Chiudi ×</button></span>':'')+'</span>';
}
function sectionHeading(title,id){
 return '<div class="bf-section-heading"><h3>'+esc(title)+'</h3>'+infoButton(id)+'</div>';
}
function kpi(title,id,amount,detail,tone=""){
 return '<div class="bf-kpi-card '+(tone?'bf-kpi-'+tone:'')+'"><div class="bf-kpi-caption">'+
 '<span>'+esc(title)+'</span>'+infoButton(id)+'</div><strong>'+amount+'</strong><span>'+detail+'</span></div>';
}
function monthTone(m,model){
 if(!m.active||m.missing||m.planNet===null||m.net===null)return "neutral";
 const diff=round(m.net-m.planNet);
 if(materialDelta(diff,m.planNet))return diff<0?"danger":"success";
 if(model?.risksForMonth(m.month).some(r=>materialDelta(r.metric.delta,r.metric.plan)))return "caution";
 return "neutral";
}

const controlUi={period:"ROLLING_12",tab:"SUMMARY",month:null,direction:"EXPENSE",onlyRisks:false,expanded:{},sort:"IMPACT",selectedCategory:null,openHelp:null,sensitivity:"STANDARD"};
try{const saved=root.localStorage?.getItem("bf-control-sensitivity");if(["HIGH","STANDARD","LOW"].includes(saved))controlUi.sensitivity=saved}catch(e){}
const sensitivityLimits={HIGH:{eur:15,pct:.05},STANDARD:{eur:30,pct:.10},LOW:{eur:75,pct:.20}};
function materialDelta(delta,plan){
 if(delta===null||delta===undefined)return false;
 const config=sensitivityLimits[controlUi.sensitivity]||sensitivityLimits.STANDARD;
 return Math.abs(delta)>=config.eur&&Math.abs(delta)>=Math.abs(num(plan))*config.pct;
}

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
  text:model.coverage.missing+" obiettivi mensili non approvati nel periodo. Le proiezioni di questi mesi non vengono conteggiati come Piano.",
  action:"Rivedi la copertura e approva i nuovi mesi quando sono stati decisi."});
 const risks=model.risksForMonth(month).filter(r=>materialDelta(r.metric.delta,r.metric.plan)).slice(0,3);
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
  if(controlUi.onlyRisks&&!g.items.some(r=>materialDelta(r.metric.delta,r.metric.plan)&&r.metric.delta<0))continue;
  const expanded=!!controlUi.expanded[g.key],id=encodeURIComponent(g.key);
  const status=ag.missing?"PROVISIONAL":month<model.current?"CLOSED":"APPROVED";
  out+=line('<button class="bf-tree-toggle" type="button" data-bf-control-expand="'+esc(id)+'" aria-expanded="'+expanded+'">'+(expanded?"▾":"▸")+' '+esc(g.name)+' <small>('+g.items.length+')</small></button>',
    'bf-control-group',ag,ag.missing,status,null);
  if(expanded){
   let items=[...g.items];
   if(controlUi.onlyRisks)items=items.filter(r=>materialDelta(r.metric.delta,r.metric.plan)&&r.metric.delta<0);
   items.sort((a,b)=>controlUi.sort==="NAME"?a.name.localeCompare(b.name,"it"):
     controlUi.sort==="AMOUNT"?(b.metric.forecast??-Infinity)-(a.metric.forecast??-Infinity):
      (a.metric.delta??Infinity)-(b.metric.delta??Infinity));
   for(const r of items){
    const observed=month===model.current?r.metric.actual:r.metric.forecast;
    const ratio=r.metric.plan!==null&&r.metric.plan>0&&observed!==null?
     Math.min(100,Math.max(0,100*observed/r.metric.plan)):null;
    const bar=ratio===null?'':' <span class="bf-budget-mini" title="'+
     (month===model.current?'Actual / Piano':'Proiezione / Piano')+' · '+Math.round(100*observed/r.metric.plan)+'%">'+
     '<i class="'+(r.metric.forecast!==null&&r.metric.plan!==null&&r.metric.forecast>r.metric.plan+.005?'bf-budget-mini-over':'')+
     '" style="width:'+ratio+'%"></i></span>';
    out+=line('<button type="button" class="bf-tree-toggle bf-control-indent" data-bf-control-category="'+esc(r.id)+'">'+
      esc(r.name)+'</button>'+bar+' <small>'+esc(r.nature==="DISCRETIONARY"?"D":r.nature==="NECESSARY"?"N":r.nature==="MANDATORY"?"O":"")+'</small>',
     'bf-control-child',r.metric,false,r.metric.status,r.id);
   }
  }
 }
 return out||'<tr><td colspan="7">Nessuna categoria per il filtro selezionato.</td></tr>';
}
function categoryTimeline(model){
 const selected=model.rows.find(r=>r.id===controlUi.selectedCategory&&r.direction===controlUi.direction);
 if(!selected)return "";
 return '<section class="bf-panel bf-control-category-timeline"><div class="bf-control-section-head">'+sectionHeading(selected.l1Name+" / "+selected.name+" · 12 mesi","categorytrend")+
  '<button type="button" data-bf-control-category="CLOSE" class="btn compact ghost">✕ Chiudi dettaglio</button></div>'+
  '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Mese</th><th>Piano</th><th>Actual</th><th>Proiezione tecnica</th><th>Δ sul risultato</th><th>Stato</th></tr></thead><tbody>'+
   model.months.map(m=>{
    const x=selected.months[m];
    return '<tr><td>'+esc(displayMonth(m))+'</td><td>'+eur(x.plan)+'</td><td>'+eur(x.actual)+'</td><td>'+eur(x.forecast)+'</td>'+
    '<td class="'+safeClass(x.delta)+'">'+humanDelta(x.delta)+'</td><td><span class="bf-status bf-status-'+x.status.toLowerCase()+'">'+esc(statusText(x.status))+'</span></td></tr>';
   }).join('')+'</tbody></table></div>'+
   '<p class="bf-control-muted">La proiezione tecnica di una categoria è una stima calcolata dai dati disponibili: non è un Forecast revisionato, né un nuovo obiettivo approvato. Un valore di Piano «—» indica assenza di approvazione per quel mese.</p></section>';
}


function periodEffects(model){
 return model.rows.map(r=>{
  const comparable=model.months.filter(m=>m>=model.current).map(m=>r.months[m])
    .filter(x=>x.plan!==null&&x.forecast!==null&&x.delta!==null);
  return {id:r.id,direction:r.direction,name:r.name,l1Name:r.l1Name,
    effect:round(comparable.reduce((total,x)=>total+x.delta,0)),count:comparable.length};
 }).filter(x=>x.count>0&&Math.abs(x.effect)>.005)
  .sort((a,b)=>a.effect-b.effect);
}
function impactBars(model){
 const rows=periodEffects(model),neg=rows.filter(r=>r.effect<0).slice(0,5),
  pos=rows.filter(r=>r.effect>0).reverse().slice(0,5);
 const max=Math.max(1,...neg.map(r=>-r.effect),...pos.map(r=>r.effect));
 const render=(arr,type)=>arr.length?arr.map(r=>{
  const w=Math.max(3,Math.round(100*Math.abs(r.effect)/max));
  return '<div class="bf-impact-row"><div class="bf-impact-head"><span>'+esc(r.l1Name)+' / <b>'+esc(r.name)+'</b></span>'+
   '<strong class="'+(type==="negative"?'bf-negative':'bf-positive')+'">'+humanDelta(r.effect)+'</strong></div>'+
   '<div class="bf-impact-track"><div class="bf-impact-fill bf-impact-'+type+'" style="width:'+w+'%"></div></div></div>';
 }).join(''):'<p class="bf-control-muted">Nessun contributo significativo nei mesi confrontabili.</p>';
 const worst=neg[0]||null;
 const offset=model.delta!==null&&worst?round(model.delta-worst.effect):null;
 return '<div class="bf-impact-grid"><div><h4>Penalizzazioni</h4>'+render(neg,"negative")+'</div>'+
 '<div><h4>Compensazioni</h4>'+render(pos,"positive")+'</div></div>'+
 (offset!==null?'<p class="bf-impact-insight">La voce peggiore pesa '+money(Math.abs(worst.effect))+
 ' sul risultato; il contributo netto delle altre categorie è <strong>'+humanDelta(offset)+
 '</strong>. Questi valori si riferiscono agli scostamenti Piano/Forecast, non ai pagamenti già avvenuti.</p>':'');
}
let visualControlChart=null;
function drawControlChart(host,model){
 if(visualControlChart){visualControlChart.destroy();visualControlChart=null}
 const canvas=host?.querySelector?.("[data-bf-control-chart]");
 const ChartCtor=root.Chart;
 if(!canvas||!ChartCtor||!canvas.getContext)return;
 const ctx=canvas.getContext("2d");
 if(!ctx)return;
 const shown=model.series;
 const values=shown.map(m=>m.net);
 const targets=shown.map(m=>m.planNet);
 const colors=shown.map(m=>monthTone(m,model)==="danger"?"#D04D56":
  monthTone(m,model)==="success"?"#20936D":
   monthTone(m,model)==="caution"?"#D69A43":"#5086CF");
 visualControlChart=new ChartCtor(ctx,{
  type:"bar",
  data:{labels:shown.map(m=>displayMonth(m.month)),datasets:[
   {type:"bar",label:"Saldo stimato (tecnico)",data:values,
    backgroundColor:colors,borderRadius:4,maxBarThickness:36,order:2},
   {type:"line",label:"Saldo Piano",data:targets,borderColor:"#7C87A3",
    backgroundColor:"#7C87A3",borderDash:[6,4],pointRadius:2,
    borderWidth:2.5,tension:.15,spanGaps:false,order:1}
  ]},
  options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:"index",intersect:false},
   onClick(_event,elements){if(elements.length){
    controlUi.month=shown[elements[0].index].month;
    renderTracking(currentControlHost,currentControlRecord,currentControlLive,currentControlMeta);
   }},
   plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:10,font:{size:11}}},
    tooltip:{callbacks:{label(context){return context.dataset.label+": "+
      (context.parsed.y===null?"—":money(context.parsed.y))}}}},
   scales:{
    x:{grid:{display:false},ticks:{maxRotation:0,minRotation:0,font:{size:10}}},
    y:{grid:{color:"rgba(103,122,148,.13)"},ticks:{callback:v=>new Intl.NumberFormat("it-IT",{notation:"compact",maximumFractionDigits:0}).format(v)+" €"}}
   }
  }
 });
}

function renderExtended(host,model){
 if(!host||!model||model.error){if(host)host.innerHTML='<p class="bf-control-notice">'+esc(model?.error||"Dati assenti")+'</p>';return}
 const sm=showMonth(model,controlUi.month);
 controlUi.month=sm.month;
 const label=controlUi.period==="CALENDAR"?"Anno "+model.current.slice(0,4):"12 mesi · "+displayMonth(model.months[0])+" – "+displayMonth(model.months[11]);
 const closed=sm.month<model.current;
 const coveragePct=model.coverage.expected?Math.round(100*model.coverage.approved/model.coverage.expected):0;
 const focus=model.risksForMonth(sm.month).filter(r=>materialDelta(r.metric.delta,r.metric.plan));
 const bodyAlerts=alerts(model,sm.month).slice(0,5).map(a=>
  '<div class="bf-control-message bf-control-message-'+a.type+'"><strong>'+esc(a.title)+'</strong><p>'+esc(a.text)+'</p><small>'+esc(a.action)+'</small></div>').join('');
 const buttons='<div class="bf-control-buttons">'+
  ["SUMMARY","CATEGORIES","FLOWS"].map((v,i)=>'<button type="button" data-bf-control-tab="'+v+'" class="btn compact '+(controlUi.tab===v?'':'ghost')+'">'+["Sintesi","Categorie","Flussi mensili"][i]+'</button>').join('')+'</div>';
 const select='<div class="bf-control-buttons">'+
  ['ROLLING_12','CALENDAR'].map((v,i)=>'<button type="button" data-bf-control-period="'+v+'" class="btn compact '+(controlUi.period===v?'':'ghost')+'">'+['12 mesi rolling','Anno corrente'][i]+'</button>').join('')+'</div>';
 const sensitivity='<div class="bf-control-sensitivity"><label for="bfControlSensitivity">Avvisi</label>'+
  '<select id="bfControlSensitivity" data-bf-control-sensitivity aria-label="Sensibilità dei warning">'+
  [["HIGH","Alta"],["STANDARD","Standard"],["LOW","Bassa"]].map(([val,label])=>
   '<option value="'+val+'"'+(controlUi.sensitivity===val?' selected':'')+'>'+label+'</option>').join('')+
  '</select>'+infoButton("sensitivity")+'</div>';
 const partial=model.coverage.missing>0;
 const monthlyResidue=closed?"—":sm.missing?"Parziale "+money(sm.planExpense-sm.actualExpense):money(sm.planExpense-sm.actualExpense);

 const effects=periodEffects(model),mainRisk=effects.find(x=>x.effect<-.005);
 const riskName=mainRisk?mainRisk.name:"Nessuno scostamento";
 const riskAmount=mainRisk?humanDelta(mainRisk.effect):"—";
 const compareTone=model.delta===null?"neutral":model.delta<-.005?"danger":model.delta>.005?"success":"neutral";
 const outcomeTone=model.totalForecast!==null&&model.totalForecast<0&&model.delta!==null&&model.delta<0?"caution":"neutral";
 const splitLabel=model.initialGap!==null&&model.afterApprovalGap!==null
  ?'Di cui '+humanDelta(model.initialGap)+' già presenti all’approvazione; '+humanDelta(model.afterApprovalGap)+' da ricalcoli successivi.'
  :'Non è ancora disponibile la scomposizione tra differenze iniziali e variazioni successive.';
 const periodScope=controlUi.period==="CALENDAR"?"mesi aperti dell’anno":"12 mesi del Piano";
 const hero='<div class="bf-hero-kpis bf-control-first-row">'+
  kpi("Piano approvato · "+periodScope,"outcome",eur(model.planTotal),
   'Avanzo economico programmato · riferimento da controllare',"neutral")+
  '<div class="bf-kpi-card bf-kpi-caution bf-kpi-projection"><div class="bf-kpi-caption"><span>Confronto tecnico · NON validato</span>'+infoButton("deviation")+'</div>'+
   '<div class="bf-tech-comparison"><div><small>Stima live</small><strong>'+eur(model.futureForecast)+'</strong></div>'+
   '<div><small>Differenza vs Piano</small><strong class="'+safeClass(model.delta)+'">'+humanDelta(model.delta)+'</strong></div></div>'+
   '<p class="bf-control-muted">La differenza non dimostra uno sforamento. '+esc(splitLabel)+'</p></div>'+
  '<div class="bf-kpi-card bf-kpi-caution bf-risk-summary"><div class="bf-kpi-caption"><span>Maggiore differenza da verificare</span>'+infoButton("periodimpact")+'</div>'+
   '<strong>'+esc(riskName)+' · '+riskAmount+'</strong>'+
   '<span>'+(mainRisk?mainRisk.count+' mesi confrontati · stima, non spesa effettiva':'Nessuna differenza rilevante')+'</span>'+
   (mainRisk?'<button type="button" class="bf-risk-jump" data-bf-control-open-risk="'+encodeURIComponent(mainRisk.id)+'">Vedi Piano, stima e differenze per mese →</button>':'')+
   '</div></div>';
 const minor='<div class="bf-control-kpis bf-kpi-minor">'+
  kpi("Budget spese residuo · "+displayMonth(sm.month),"remaining",monthlyResidue,
   closed?"Consuntivo chiuso":sm.missing?"Valore parziale, alcuni target non sono approvati":"Piano meno Actual del mese")+
  kpi("Possibili sforamenti (stima) · mese","overspend",String(focus.length),
   money(focus.reduce((n,r)=>n-r.metric.delta,0))+' · maggiore spesa prevista',focus.length?"caution":"neutral")+
  kpi("Copertura del Piano","coverage",coveragePct+"%",
   model.coverage.approved+' / '+model.coverage.expected+' categoria-mesi',partial?"caution":"neutral")+
  kpi("Flusso netto più basso","worst",model.worst?displayMonth(model.worst.month):"—",
   eur(model.worst?.net)+' · non indica da solo uno sforamento')+
  '</div>';
 const stageNotice='<p class="bf-control-notice"><strong>Come leggere questo Controllo:</strong> il Piano approvato è il riferimento. La stima tecnica è un ricalcolo preliminare, <strong>non un Forecast approvato</strong> e non dimostra nuove spese o un peggioramento già avvenuto. Verifica i movimenti e apri le categorie per capire le differenze. Nessun dato modifica il Piano.</p>';
 const top='<div class="bf-control-header"><div><h2>Controllo · '+esc(label)+'</h2>'+
  '<p>Piano approvato V'+esc(model.revision)+' · Consuntivi aggiornati · Proiezione tecnica non revisionata</p></div>'+
  '<button class="btn compact ghost" data-bf-control-reload>↻ Aggiorna dati</button></div>'+
  '<div class="bf-control-controls">'+select+buttons+sensitivity+'</div>'+
  stageNotice+hero+minor+
  (partial?'<p class="bf-control-notice">La copertura del Piano è incompleta: i mesi/categorie senza target esplicito rimangono <strong>provvisori</strong>. Non vengono scambiati per obiettivi approvati.</p>':'');
 const monthMenu='<div class="bf-months-block">'+sectionHeading("Saldo economico mensile · entrate − uscite (non saldo bancario)","months")+
  '<p class="bf-control-muted">Ogni riquadro mostra il saldo del mese della <strong>stima tecnica</strong>, il saldo del <strong>Piano approvato</strong> e la loro differenza (Δ). Seleziona un mese per aprire il dettaglio.</p>'+
  '<div class="bf-month-strip" aria-label="Scegli mese del controllo">'+model.series.map(m=>
  '<button type="button" data-bf-control-month="'+m.month+'" aria-pressed="'+(m.month===sm.month)+'" class="'+(m.month===sm.month?'active ':'')+'bf-month-'+monthTone(m,model)+'" title="Saldo stimato: '+eur(m.net)+' · Piano: '+eur(m.planNet)+' · differenza: '+(m.planNet!==null&&m.net!==null?humanDelta(round(m.net-m.planNet)):'non disponibile')+'">'+
   '<span>'+esc(displayMonth(m.month))+'</span>'+
   '<small>Saldo stimato</small><strong>'+eur(m.net)+'</strong>'+
   '<small>Piano: '+eur(m.planNet)+'</small>'+
   '<small>'+(m.planNet!==null&&m.net!==null?'Δ: '+humanDelta(round(m.net-m.planNet)):(m.active&&m.missing?'Obiettivo mancante':'Consuntivo / non confrontabile'))+'</small>'+
   (m.active&&m.missing?'<i title="Target provvisori"></i>':'')+
   '</button>').join('')+'</div></div>';
 let panel='';
 if(controlUi.tab==="SUMMARY"){
  panel='<section class="bf-panel bf-chart-panel">'+sectionHeading("Piano approvato e proiezione tecnica · mese per mese","trend")+
   '<div class="bf-control-visual"><canvas data-bf-control-chart="overview" role="img" aria-label="Grafico del saldo economico proiezione tecnica e Piano nei 12 mesi"></canvas></div>'+
   '<div class="bf-control-legend"><span><i class="bf-legend-blue"></i>In linea o da verificare</span>'+
   '<span><i class="bf-legend-red"></i>Peggio del Piano</span><span><i class="bf-legend-amber"></i>Categoria a rischio</span><span><i class="bf-legend-green"></i>Meglio del Piano</span>'+
   '<span><i class="bf-legend-line"></i>Piano</span></div>'+
   '<p class="bf-control-muted">Il colore confronta la proiezione tecnica e il Piano, non identifica automaticamente come critico ogni mese con saldo negativo. Se manca un target il confronto non viene inventato.</p></section>'+
   '<div class="bf-control-columns"><section class="bf-panel">'+sectionHeading("Attenzioni e prossime azioni · "+displayMonth(sm.month),"actions")+
    '<div class="bf-control-messages">'+bodyAlerts+'</div></section>'+
    '<section class="bf-panel">'+sectionHeading("Bilancio del mese","monthbalance")+
    '<div class="bf-control-quickrows"><div><span>Entrate previste</span><strong>'+eur(sm.income)+'</strong></div>'+
    '<div><span>Uscite previste</span><strong>'+eur(sm.expense)+'</strong></div>'+
    '<div><span>Saldo economico mese</span><strong>'+eur(sm.net)+'</strong></div>'+
    '<div><span>Saldo mese da Piano</span><strong>'+eur(sm.planNet)+'</strong></div>'+
    '<div><span>Entrate già registrate</span><strong>'+money(sm.actualIncome)+'</strong></div>'+
    '<div><span>Uscite già registrate</span><strong>'+money(sm.actualExpense)+'</strong></div></div>'+
    '<p class="bf-control-muted">La proiezione tecnica non è un Forecast revisionato o approvato. Il confronto col Piano richiede target approvati e stime attendibili; per la liquidità servono anche i saldi e il calendario dei pagamenti.</p></section></div>'+
    '<section class="bf-panel">'+sectionHeading("Chi migliora e chi peggiora il risultato · intero periodo","periodimpact")+
     impactBars(model)+'</section>'+
    '<section class="bf-panel">'+sectionHeading("Possibili sforamenti (stima) · "+displayMonth(sm.month),"breakdown")+
      riskTable(focus)+'</section>';
 }else if(controlUi.tab==="CATEGORIES"){
  const table='<div class="bf-control-overflow"><table class="bf-control-table bf-control-detail"><thead><tr><th>Categoria L1 / L2</th><th>Piano</th><th>Actual</th><th>Proiezione tecnica</th><th>Δ sul risultato</th><th>Residuo</th><th>Stato</th></tr></thead><tbody>'+
   tableMonth(model,sm.month)+'</tbody></table></div>';
  panel='<section class="bf-panel"><div class="bf-control-section-head">'+sectionHeading("Dettaglio per categoria · "+displayMonth(sm.month),"categories")+'<div class="bf-control-buttons">'+
   ["EXPENSE","INCOME"].map((v,i)=>'<button class="btn compact '+(controlUi.direction===v?'':'ghost')+'" data-bf-control-direction="'+v+'">'+['Uscite','Entrate'][i]+'</button>').join('')+
   '<button class="btn compact ghost" data-bf-control-risk-filter="'+(controlUi.onlyRisks?'ALL':'RISK')+'">'+(controlUi.onlyRisks?'Mostra tutte':'Solo sforamenti')+'</button>'+
   '<button class="btn compact ghost" data-bf-control-sort="'+(controlUi.sort==="IMPACT"?'NAME':'IMPACT')+'">Ordine: '+(controlUi.sort==="IMPACT"?'impatto':'nome')+'</button></div></div>'+
   table+'<p class="bf-control-muted">Espandi una L1 e seleziona una L2 per vedere il tracking su tutti i 12 mesi. Gli importi parziali o provvisori non sono target approvati.</p></section>'+categoryTimeline(model);
 }else{
  panel='<section class="bf-panel">'+sectionHeading("Flusso economico mese per mese · "+label,"flows")+
   '<div class="bf-control-visual bf-control-visual-short"><canvas data-bf-control-chart="flows" role="img" aria-label="Grafico di confronto saldo economico Piano e proiezione tecnica"></canvas></div>'+
  '<div class="bf-control-overflow"><table class="bf-control-table bf-control-timeline"><thead><tr><th>Mese</th><th>Entrate previste</th><th>Uscite previste</th><th>Saldo mese</th><th>Saldo cumulato*</th><th>Saldo Piano**</th><th>Copertura</th></tr></thead><tbody>'+
   model.series.map(m=>'<tr><td><button class="bf-tree-toggle" data-bf-control-month="'+m.month+'">'+esc(displayMonth(m.month))+'</button></td>'+
   '<td>'+eur(m.income)+'</td><td>'+eur(m.expense)+'</td><td class="'+safeClass(m.net)+'">'+eur(m.net)+'</td>'+
   '<td class="'+safeClass(m.cumulative)+'">'+eur(m.cumulative)+'</td><td>'+eur(m.planNet)+'</td>'+
   '<td>'+(m.active?(m.missing?'<span class="bf-status bf-status-provisional">'+m.missing+' non approvati</span>':'<span class="bf-status bf-status-approved">Approvato</span>'):'Consuntivo')+'</td></tr>').join('')+'</tbody></table></div>'+
   '<p class="bf-control-muted">* Cumulato dei flussi economici del periodo, con partenza convenzionale da zero. ** Solo mesi coperti interamente da Piano approvato; non è un saldo bancario. Le uscite e gli investimenti mantengono le semantiche delle proiezioni L2 attuali.</p></section>';
 }
 host.innerHTML=top+monthMenu+panel;
 drawControlChart(host,model);
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
 return '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Categoria</th><th>Piano</th><th>Proiezione tecnica</th><th>Δ sul risultato</th></tr></thead><tbody>'+
  items.slice(0,12).map(r=>'<tr><td>'+esc(r.l1Name)+' / '+esc(r.name)+'</td><td>'+money(r.metric.plan)+'</td><td>'+money(r.metric.forecast)+'</td><td class="bf-negative">'+humanDelta(r.metric.delta)+'</td></tr>').join('')+'</tbody></table></div>';
}
function renderTracking(host,approved,live,meta){
 currentControlHost=host;currentControlRecord=approved;currentControlLive=live;currentControlMeta=meta;
 const result=buildControl(approved,live,meta,controlUi.period);
 return renderExtended(host,result);
}
function handleControlClick(e){
 if(!currentControlHost)return false;
 const help=e.target?.closest?.("[data-bf-control-help]");
 if(help){
  const id=help.getAttribute("data-bf-control-help");
  if(!Object.prototype.hasOwnProperty.call(controlHelp,id))return false;
  controlUi.openHelp=controlUi.openHelp===id?null:id;
  renderTracking(currentControlHost,currentControlRecord,currentControlLive,currentControlMeta);
  currentControlHost.querySelector?.('[data-bf-control-help="'+id+'"]')?.focus?.();
  return true;
 }
 if(e.target?.closest?.("[data-bf-control-help-close]")){
  controlUi.openHelp=null;
  renderTracking(currentControlHost,currentControlRecord,currentControlLive,currentControlMeta);
  return true;
 }
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

function handleControlChange(e){
 const el=e.target?.closest?.("[data-bf-control-sensitivity]");
 if(!el||!currentControlHost)return false;
 const value=el.value;
 if(!Object.prototype.hasOwnProperty.call(sensitivityLimits,value))return false;
 controlUi.sensitivity=value;
 try{root.localStorage?.setItem("bf-control-sensitivity",value)}catch(e){}
 renderTracking(currentControlHost,currentControlRecord,currentControlLive,currentControlMeta);
 return true;
}
function handleControlKey(e){
 if(e?.key!=="Escape"||!controlUi.openHelp||!currentControlHost)return false;
 const id=controlUi.openHelp;controlUi.openHelp=null;
 renderTracking(currentControlHost,currentControlRecord,currentControlLive,currentControlMeta);
 currentControlHost.querySelector?.('[data-bf-control-help="'+id+'"]')?.focus?.();
 return true;
}
const api={annualTotal,monthTotals,categoryRows,fromContinuous,compare,render,buildControl,renderTracking,handleControlClick,handleControlKey,handleControlChange};
root.BudgetFamilyMonthlyControl=api;
if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
