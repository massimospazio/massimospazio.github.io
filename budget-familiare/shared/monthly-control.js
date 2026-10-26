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
 const reliabilityMap=meta?.reliability&&typeof meta.reliability==="object"?meta.reliability:null;
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
   const actualHistory=(data.actual_monthly||[]).filter(a=>String(a.category_id)===id&&String(a.month)<current).map(a=>({month:String(a.month),amount:num(a.amount)}));
   const reliabilityValue=reliabilityMap?Number(reliabilityMap[id]):NaN;
   const rec={id:direction+":"+id,direction,categoryId:id,
    name:String(cat.l2_name||cat.name||"Categoria"),
    l1Id:String(cat.l1_id||cat.l1_name||"Senza L1"),
    l1Name:String(cat.l1_name||"Senza L1"),
    nature:String(direction==="EXPENSE"?(natureMeta.expense_nature||cat.expense_nature||""):(natureMeta.income_nature||cat.income_nature||"")),
    temporality:String(natureMeta.temporality||""),
    method:String(natureMeta.forecast_method||""),
    scope:String(natureMeta.forecast_scope||"CATEGORY"),
    counterpartyMethods:String(natureMeta.counterparty_methods||""),
    reliability:reliabilityMap?(Number.isInteger(reliabilityValue)&&reliabilityValue>=1&&reliabilityValue<=5?reliabilityValue:0):null,
    history:actualHistory,
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
 outcome:["Piano approvato","Risultato economico programmato nei mesi del periodo selezionato.","Somma dei target mensili approvati di entrata meno i target di uscita.","È il riferimento principale: non cambia quando si aggiornano i movimenti. Non è il saldo del conto."],
 deviation:["Confronto tecnico non validato","Accosta la stima live al Piano approvato, senza presentarla come un Forecast deliberato.","Differenza = saldo economico della stima tecnica meno saldo economico del Piano, per gli stessi mesi. Dove disponibile si distingue la differenza iniziale da quella sorta nei ricalcoli successivi.","Una differenza negativa non prova nuove spese o un peggioramento dopo l’approvazione. Controlla le categorie, il consuntivo e l’origine del divario."],
 remaining:["Budget residuo del mese","Quanto rimane del budget di uscita del mese approvato dopo i movimenti registrati.","Budget mensile di spesa del Piano − uscite registrate nel mese.","Non è disponibilità bancaria; il mese può ancora avere altre spese, e non è una proiezione di chiusura."],
 overspend:["Categorie oltre budget effettivo","Numero di categorie con uscite effettive già superiori al target mensile.","Per ciascuna L2 di uscita: consuntivo registrato > budget mensile approvato.","Sono sforamenti già registrati, da verificare per possibili errori di classificazione o importazione."],
 sensitivity:["Sensibilità degli avvisi","Stabilisce quando un peggioramento viene evidenziato in rosso o genera un messaggio.","Sono richieste entrambe le condizioni: scostamento di almeno 15€/30€/75€ e di almeno 5%/10%/20% del valore Piano, secondo il livello scelto.","Alta individua scostamenti più piccoli; Bassa lascia emergere solo quelli maggiori. I calcoli economici non cambiano."],
 coverage:["Copertura degli obiettivi","Percentuale delle coppie categoria–mese del periodo futuro con target esplicitamente approvato.","100 × obiettivi categoria–mese approvati / totale categoria–mese attesi nel periodo.","100% è una condizione di qualità della pianificazione, non un risultato economico. Se è inferiore, alcuni confronti non sono attendibili."],
 worst:["Saldo mese stimato più basso","Identifica il mese con entrate meno uscite più basse nella stima tecnica.","Minimo del saldo economico mensile stimato tra i mesi ancora aperti.","Non è il saldo del conto. Può essere previsto dal Piano, ad esempio per vacanze o acquisti programmati."],
 months:["Mesi del Piano approvato","Mostra i saldi economici pianificati dei dodici mesi.","Saldo Piano = entrate target meno uscite target. Nel mese corrente compare anche il consuntivo netto parziale.","I mesi futuri mostrano obiettivi, non previsioni aggiornate. Non confrontare un consuntivo parziale con un mese intero come se fosse una chiusura."],
 trend:["Saldi mensili del Piano","Mostra come si distribuiscono i saldi economici mensili approvati.","Barre = entrate Piano meno uscite Piano. Punto del mese corrente = entrate già registrate meno uscite già registrate.","Il punto del consuntivo è parziale, non una previsione di chiusura; il grafico non rappresenta la liquidità dei conti."],
 actions:["Verifiche su movimenti e budget","Segnala solo spese già registrate oltre target mensile e qualità dei dati del mese.","Confronto delle spese effettive L2 con i rispettivi obiettivi approvati del mese.","Non genera allarmi da stime tecniche non validate."],
 monthbalance:["Obiettivi e consuntivo del mese","Riepiloga entrate, uscite e saldo del Piano e i movimenti effettivamente registrati.","Entrate e uscite Piano provengono dai target approvati; i consuntivi sono la somma dei movimenti importati e classificati.","Il consuntivo è parziale fino alla chiusura del mese e non è automaticamente confrontabile con un budget per il mese completo."],
 periodimpact:["Differenze tecniche per categoria","Mostra quale categoria contribuisce maggiormente alla differenza fra Piano approvato e stima tecnica nei mesi confrontabili.","Uscite: Piano − stima tecnica; entrate: stima tecnica − Piano. La somma degli impatti ricompone il delta complessivo.","Clicca la categoria per confrontare i mesi, distinguere l’eventuale gap iniziale e verificare il reale andamento prima di intervenire."],
 categories:["Tracking delle categorie L1/L2","Mostra per ciascuna categoria il budget approvato, il consuntivo e il residuo.","Residuo budget = target mensile − movimenti effettivi registrati.","Le categorie con spese già oltre budget possono essere filtrate. Non compare la stima tecnica in questa vista ordinaria."],
 categorytrend:["Dettaglio categoria","Mostra gli obiettivi della categoria mese per mese con il consuntivo corrente disponibile.","Il grafico mostra budget mensile e consuntivo parziale del mese corrente.","Non interpreta la mancata spesa nei mesi futuri come risparmio reale."],
 flows:["Flussi economici del Piano","Mostra entrate, uscite, saldi e cumulati derivati dal Piano approvato.","Saldo Piano = entrate target − uscite target; cumulato = somma progressiva dei saldi del Piano da zero.","Non è il saldo previsto dei conti: non include liquidità iniziale, giroconti e timing effettivo dei pagamenti."],
 chartflows:["Grafico dei flussi del Piano","Visualizza i saldi economici mensili dell'intervallo.","Barre = saldo mensile del Piano; punto = consuntivo parziale del mese corrente.","Non include proiezioni automatiche non validate né saldi bancari."],
 breakdown:["Categorie oltre budget","Conta le uscite già registrate sopra i rispettivi target mensili.","Per ogni uscita, se consuntivo > Piano, la differenza è il superamento effettivo del budget.","Verifica prima la qualità dei movimenti e la categoria. Non confonderlo con le differenze tecniche fra due previsioni."],
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
 // Unvalidated technical differences are signals to inspect, not verified overspends.
 // Reserve red for actual spending that already exceeded a monthly approved target.
 const verifiedExpenseBreach=m.month===model.current&&model.rows.some(r=>{
  if(r.direction!=="EXPENSE")return false;
  const x=r.months[m.month];
  return x?.plan!==null&&x?.plan!==undefined&&x?.actual>x.plan+.005&&materialDelta(x.actual-x.plan,x.plan);
 });
 if(verifiedExpenseBreach)return "danger";
 const diff=round(m.net-m.planNet);
 if(materialDelta(diff,m.planNet))return "caution";
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

let currentControlRecord=null,currentControlLive=null,currentControlMeta=null,currentControlHost=null,currentControlModel=null;
function safeClass(n){return n===null?"":n<-.005?"bf-negative":n>.005?"bf-positive":""}
function humanDelta(n){return n===null?"—":(n>0?"+":"")+money(n)}
function statusText(s){return s==="APPROVED"?"Target approvato":s==="CLOSED"?"Consuntivo":"Target provvisorio"}
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
  items.push({type:"quality",title:r.name+" · differenza tecnica da verificare",
   text:"Stima live "+money(r.metric.forecast)+" contro Piano "+money(r.metric.plan)+" ("+money(amount)+" in più nella stima).",
   action:"Non è uno sforamento accertato: verifica i movimenti e le ipotesi di previsione prima di modificare il Piano."});
 }
 if(model.totalForecast!==null&&model.totalForecast<0)
  items.push({type:"quality",title:"La stima tecnica del periodo è negativa",
   text:"Il saldo ricalcolato è "+money(model.totalForecast)+", ma non è una previsione revisionata o approvata; non equivale al saldo bancario.",
   action:"Confronta prima le differenze già presenti all’approvazione e quelle emerse dopo."});
 if(!items.length)items.push({type:"ok",title:"Nessun rischio significativo rilevato",
   text:"Nelle categorie con Piano approvato non emergono differenze tecniche negative significative per "+displayMonth(month)+".",
   action:"Continua ad aggiornare e classificare i movimenti."});
 return items;
}
function tableMonth(model,month){
 const rows=monthCategory(model,month);
 const groups=new Map();
 for(const r of rows){
  const id=r.l1Id+"|"+r.l1Name;
  if(!groups.has(id))groups.set(id,{id,name:r.l1Name,items:[]});
  groups.get(id).items.push(r);
 }
 const isCurrent=month===model.current;
 const exceeded=r=>isCurrent&&r.metric.plan!==null&&r.metric.actual>r.metric.plan+.005;
 let ordered=[...groups.values()].sort((x,y)=>controlUi.sort==="NAME"
   ?x.name.localeCompare(y.name,"it")
   :y.items.reduce((n,r)=>n+Math.max(0,r.metric.actual-num(r.metric.plan)),0)-
    x.items.reduce((n,r)=>n+Math.max(0,r.metric.actual-num(r.metric.plan)),0));
 let result="";
 function makeRow(label,metric,cls,partial,status){
  const plan=partial?null:metric.plan;
  const actual=month>model.current?null:metric.actual;
  const remaining=plan===null||month<model.current?null:round(plan-num(actual));
  return '<tr class="'+cls+'"><td>'+label+'</td>'+
    '<td>'+eur(plan)+'</td><td>'+eur(actual)+'</td>'+
    '<td class="'+safeClass(remaining)+'">'+eur(remaining)+'</td>'+
    '<td><span class="bf-status bf-status-'+esc(status.toLowerCase())+'">'+esc(statusText(status))+'</span></td></tr>';
 }
 for(const group of ordered){
  const visible=controlUi.onlyRisks?group.items.filter(exceeded):group.items;
  if(!visible.length)continue;
  const full=group.items;
  const partial=full.some(r=>r.metric.plan===null);
  const aggregate={plan:partial?null:round(full.reduce((n,r)=>n+num(r.metric.plan),0)),
    actual:round(full.reduce((n,r)=>n+num(r.metric.actual),0))};
  const expanded=!!controlUi.expanded[group.id],code=encodeURIComponent(group.id);
  result+=makeRow('<button class="bf-tree-toggle" type="button" data-bf-control-expand="'+esc(code)+'" aria-expanded="'+expanded+'">'+(expanded?"▾":"▸")+' '+esc(group.name)+' <small>('+full.length+')</small></button>',
    aggregate,"bf-control-group",partial,partial?"PROVISIONAL":month<model.current?"CLOSED":"APPROVED");
  if(expanded){
   const sorted=visible.slice().sort((x,y)=>controlUi.sort==="NAME"
    ?x.name.localeCompare(y.name,"it")
    :(y.metric.actual-num(y.metric.plan))-(x.metric.actual-num(x.metric.plan)));
   for(const r of sorted)
    result+=makeRow('<button type="button" class="bf-tree-toggle bf-control-indent" data-bf-control-category="'+esc(r.id)+'">'+esc(r.name)+'</button>',
     r.metric,"bf-control-child",r.metric.plan===null,r.metric.status);
  }
 }
 return result||'<tr><td colspan="5">'+(controlUi.onlyRisks?"Nessuna categoria ha già superato il target nel mese selezionato.":"Nessuna categoria disponibile.")+'</td></tr>';
}
function categoryTimeline(model){
 const selected=model.rows.find(r=>r.id===controlUi.selectedCategory&&r.direction===controlUi.direction);
 if(!selected)return "";
 const currentData=selected.months[model.current];
 return '<section class="bf-panel bf-control-category-timeline"><div class="bf-control-section-head">'+
  sectionHeading(selected.l1Name+" / "+selected.name+" · dettaglio del Piano","categorytrend")+
  '<button type="button" data-bf-control-category="CLOSE" class="btn compact ghost">✕ Chiudi dettaglio</button></div>'+
  '<p class="bf-control-muted">Lungo i 12 mesi sono mostrati gli obiettivi approvati. Per il mese corrente è disponibile il consuntivo parziale, non una previsione di chiusura.</p>'+
  '<div class="bf-category-compare"><div><small>Budget mese corrente</small><strong>'+eur(currentData?.plan)+'</strong></div>'+
  '<div><small>Già registrato</small><strong>'+money(currentData?.actual)+'</strong></div>'+
  '<div><small>Budget residuo</small><strong>'+eur(currentData?.plan===null?null:round(currentData.plan-currentData.actual))+'</strong></div></div>'+
  '<div class="bf-control-visual bf-control-category-visual"><canvas data-bf-control-category-chart role="img" aria-label="Target mensili approvati e consuntivo parziale per '+esc(selected.name)+'"></canvas></div>'+
  '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Mese</th><th>Budget approvato</th><th>Consuntivo</th><th>Residuo budget</th><th>Stato target</th></tr></thead><tbody>'+
  model.months.map(m=>{
   const x=selected.months[m],seen=m<=model.current?x.actual:null;
   const remaining=x.plan===null||m<model.current?null:round(x.plan-num(seen));
   return '<tr><td>'+esc(displayMonth(m))+'</td><td>'+eur(x.plan)+'</td><td>'+eur(seen)+'</td>'+
    '<td class="'+safeClass(remaining)+'">'+eur(remaining)+'</td>'+
    '<td><span class="bf-status bf-status-'+esc(x.status.toLowerCase())+'">'+esc(statusText(x.status))+'</span></td></tr>';
  }).join('')+'</tbody></table></div></section>';
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
  return '<button type="button" class="bf-impact-row bf-impact-action" data-bf-control-open-risk="'+encodeURIComponent(r.id)+'" title="Apri confronto mensile di '+esc(r.name)+'"><div class="bf-impact-head"><span>'+esc(r.l1Name)+' / <b>'+esc(r.name)+'</b></span>'+
   '<strong class="'+(type==="negative"?'bf-negative':'bf-positive')+'">'+humanDelta(r.effect)+'</strong></div>'+
   '<div class="bf-impact-track"><div class="bf-impact-fill bf-impact-'+type+'" style="width:'+w+'%"></div></div></button>';
 }).join(''):'<p class="bf-control-muted">Nessun contributo significativo nei mesi confrontabili.</p>';
 const worst=neg[0]||null;
 const offset=model.delta!==null&&worst?round(model.delta-worst.effect):null;
 return '<div class="bf-impact-grid"><div><h4>Penalizzazioni</h4>'+render(neg,"negative")+'</div>'+
 '<div><h4>Compensazioni</h4>'+render(pos,"positive")+'</div></div>'+
 (offset!==null?'<p class="bf-impact-insight">La voce peggiore pesa '+money(Math.abs(worst.effect))+
 ' sul risultato; il contributo netto delle altre categorie è <strong>'+humanDelta(offset)+
 '</strong>. Questi valori sono differenze tecniche fra Piano e stima live, non pagamenti già avvenuti.</p>':'');
}
let visualControlChart=null;
let visualCategoryChart=null;
function drawControlChart(host,model){
 if(visualControlChart){visualControlChart.destroy();visualControlChart=null}
 const canvas=host?.querySelector?.("[data-bf-control-chart]");
 const ChartCtor=root.Chart;
 if(!canvas||!ChartCtor||!canvas.getContext)return;
 const ctx=canvas.getContext("2d");
 if(!ctx)return;
 const shown=model.series;
 const values=shown.map(m=>m.planNet);
 const actualMarks=shown.map(m=>m.month===model.current?round(m.actualIncome-m.actualExpense):null);
 const colors=shown.map(m=>m.month===model.current&&actualOverBudget(model,m.month).length?"#C95B61":"#5887C7");
 visualControlChart=new ChartCtor(ctx,{
  type:"bar",
  data:{labels:shown.map(m=>displayMonth(m.month)),datasets:[
   {type:"bar",label:"Saldo del Piano approvato",data:values,backgroundColor:colors,borderRadius:4,maxBarThickness:36,order:2},
   {type:"line",label:"Consuntivo parziale (solo mese corrente)",data:actualMarks,borderColor:"#247D68",
    backgroundColor:"#247D68",pointRadius:6,pointHoverRadius:8,showLine:false,borderWidth:0,spanGaps:false,order:1}
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

function drawCategoryChart(host,model){
 if(visualCategoryChart){visualCategoryChart.destroy();visualCategoryChart=null}
 const canvas=host?.querySelector?.("[data-bf-control-category-chart]");
 const selected=model.rows.find(r=>r.id===controlUi.selectedCategory&&r.direction===controlUi.direction);
 const ChartCtor=root.Chart;
 if(!canvas||!selected||!ChartCtor||!canvas.getContext)return;
 const ctx=canvas.getContext("2d");if(!ctx)return;
 visualCategoryChart=new ChartCtor(ctx,{
  type:"bar",
  data:{labels:model.months.map(displayMonth),datasets:[
   {type:"bar",label:"Budget mensile approvato",data:model.months.map(m=>selected.months[m].plan),
    backgroundColor:"#6F83A6",borderRadius:3,maxBarThickness:23},
   {type:"line",label:"Consuntivo parziale mese corrente",data:model.months.map(m=>m===model.current?selected.months[m].actual:null),
    borderColor:"#247D68",backgroundColor:"#247D68",pointRadius:6,showLine:false,borderWidth:0}
  ]},
  options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:"index",intersect:false},
   plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:10,font:{size:11}}},
    tooltip:{callbacks:{label(c){return c.dataset.label+": "+(c.parsed.y===null?"—":money(c.parsed.y))}}}},
   scales:{x:{grid:{display:false},ticks:{maxRotation:0,minRotation:0,font:{size:10}}},
    y:{beginAtZero:true,grid:{color:"rgba(103,122,148,.13)"},ticks:{callback:v=>new Intl.NumberFormat("it-IT",{notation:"compact",maximumFractionDigits:0}).format(v)+" €"}}}
  }
 });
}
function actualOverBudget(model,month){
 return model.rows.filter(r=>r.direction==="EXPENSE").map(r=>({...r,metric:r.months[month]}))
 .filter(r=>r.metric&&r.metric.plan!==null&&r.metric.actual>r.metric.plan+.005)
 .sort((a,b)=>(b.metric.actual-b.metric.plan)-(a.metric.actual-a.metric.plan));
}
function actualControlAlerts(model,month){
 if(month!==model.current)return [{type:"ok",title:"Mese futuro · verifica del Piano",
  text:"I risultati effettivi di questo mese non sono ancora disponibili: qui puoi esaminare gli obiettivi approvati.",
  action:"Le differenze tecniche della Baseline non sono segnali di spesa già avvenuta."}];
 const overs=actualOverBudget(model,month);
 if(overs.length)return overs.slice(0,5).map(r=>({type:"risk",title:r.name+" · budget già superato",
  text:"Spesa registrata "+money(r.metric.actual)+" contro target mese "+money(r.metric.plan)+"; superamento effettivo "+money(r.metric.actual-r.metric.plan)+".",
  action:"Verifica transazioni, categorie e possibili errori di importazione prima di intervenire."}));
 return [{type:"ok",title:"Nessuna categoria ha già superato il budget mensile",
  text:"Con i movimenti attualmente importati, le uscite registrate restano entro i target del mese approvato.",
  action:"Il mese non è chiuso. Questo non costituisce una previsione di fine mese: aggiorna regolarmente i movimenti."}];
}
function technicalCategoryDetail(model,risk){
 const record=model.rows.find(r=>r.id===risk.id);
 if(!record)return "";
 const cells=model.months.filter(m=>m>=model.current).map(m=>record.months[m]);
 const comparable=cells.filter(x=>x.plan!==null&&x.forecast!==null);
 const sum=x=>round(comparable.reduce((a,c)=>a+num(c[x]),0));
 const planSum=sum("plan"),technicalSum=sum("forecast");
 const snapshotComplete=comparable.length===cells.length&&comparable.every(c=>c.atApproval!==null);
 const approvalSum=snapshotComplete?sum("atApproval"):null;
 const impact=record.direction==="EXPENSE"?planSum-technicalSum:technicalSum-planSum;
 const max=Math.max(1,...comparable.flatMap(c=>[c.plan,c.forecast]).map(num));
 const bar=(val,kind)=>'<span class="bf-tech-bar '+kind+'" style="width:'+Math.max(val>0?2:0,Math.round(100*num(val)/max))+'%"></span>';
 return '<div class="bf-tech-category-compare"><span><b>Piano:</b> '+money(planSum)+'</span><span><b>Stima:</b> '+money(technicalSum)+'</span><span><b>Impatto:</b> '+humanDelta(impact)+'</span></div>'+
  '<p class="bf-control-muted">'+(snapshotComplete?
   'Differenza già presente all’approvazione: '+humanDelta(record.direction==="EXPENSE"?planSum-approvalSum:approvalSum-planSum)+
   '. Differenza da aggiornamenti successivi: '+humanDelta(record.direction==="EXPENSE"?approvalSum-technicalSum:technicalSum-approvalSum)+'.':
   'Non esiste una fotografia iniziale completa per questa categoria; origine della differenza non attribuibile.')+'</p>'+
  '<div class="bf-tech-legend"><span><i class="bf-tech-plan"></i>Piano</span><span><i class="bf-tech-live"></i>Stima tecnica</span></div>'+
  '<div class="bf-tech-months">'+model.months.filter(m=>m>=model.current).map(m=>{
    const c=record.months[m];return '<div class="bf-tech-month-row"><b>'+esc(displayMonth(m))+'</b>'+
     '<div class="bf-tech-bars"><span>'+bar(c.plan,"plan")+'</span><span>'+bar(c.forecast,"live")+'</span></div>'+
     '<small>'+eur(c.plan)+' / '+eur(c.forecast)+'</small></div>';
  }).join('')+'</div>'+
  '<p class="bf-control-muted">Il confronto è fra due previsioni, non fra movimenti reali. Apri la scheda Categorie per vedere anche il consuntivo disponibile.</p>';
}
function technicalDetails(model){
 const effects=periodEffects(model);
 const penalties=effects.filter(r=>r.effect<-.005).slice(0,8);
 const compensations=effects.filter(r=>r.effect>.005).reverse().slice(0,8);
 const showCategory=r=>'<details class="bf-tech-category"><summary><span>'+esc(r.l1Name)+' / <b>'+esc(r.name)+'</b></span><strong class="'+safeClass(r.effect)+'">'+humanDelta(r.effect)+'</strong><span class="bf-tech-open-hint">Apri grafico mensile</span></summary>'+
  technicalCategoryDetail(model,r)+'</details>';
 const gap=model.initialGap===null||model.afterApprovalGap===null
 ?'Fotografia tecnica iniziale incompleta: origine del divario non calcolabile.'
 :'Differenza già presente al momento dell’approvazione: <b>'+humanDelta(model.initialGap)+
 '</b>; differenza successiva: <b>'+humanDelta(model.afterApprovalGap)+'</b>.';
 return '<details class="bf-technical-panel"><summary>Approfondimento facoltativo · come funziona la stima tecnica (non validata)</summary>'+
  '<div class="bf-technical-inner"><p>Questa stima <b>non è un Forecast revisionato</b> e non misura automaticamente il peggioramento dopo l’approvazione. Il motore calcola le previsioni L2 tramite le regole della Baseline e gli eventuali override mensili; per il mese corrente usa il maggiore fra previsione e consuntivo registrato. Il saldo tecnico è la somma delle entrate previste meno le uscite previste dei mesi selezionati.</p>'+
  '<div class="bf-tech-category-compare"><span><b>Piano:</b> '+eur(model.planTotal)+'</span><span><b>Stima:</b> '+eur(model.futureForecast)+'</span><span><b>Differenza:</b> '+humanDelta(model.delta)+'</span></div>'+
  '<p>'+gap+'</p>'+
  '<p class="bf-control-muted">Le differenze esistenti già all’approvazione non sono spese nuove. Il metodo di proiezione futura non è ancora stato validato statisticamente.</p>'+
  '<h4>Penalizzazioni (aumentano la differenza negativa)</h4>'+
  (penalties.length?penalties.map(showCategory).join(''):'<p>Nessuna penalizzazione tecnica.</p>')+
  '<h4>Compensazioni (riduccono la differenza negativa)</h4>'+
  (compensations.length?compensations.map(showCategory).join(''):'<p>Nessuna compensazione tecnica.</p>')+
  '</div></details>';
}
function renderExtended(host,model){
 if(!host||!model||model.error){if(host)host.innerHTML='<p class="bf-control-notice">'+esc(model?.error||"Dati assenti")+'</p>';return}
 const sm=showMonth(model,controlUi.month);
 controlUi.month=sm.month;
 const label=controlUi.period==="CALENDAR"?"Anno "+model.current.slice(0,4):"12 mesi · "+displayMonth(model.months[0])+" – "+displayMonth(model.months[11]);
 const closed=sm.month<model.current;
 const coveragePct=model.coverage.expected?Math.round(100*model.coverage.approved/model.coverage.expected):0;
 const buttons='<div class="bf-control-buttons">'+
  ["SUMMARY","CATEGORIES","FLOWS"].map((v,i)=>'<button type="button" data-bf-control-tab="'+v+'" class="btn compact '+(controlUi.tab===v?'':'ghost')+'">'+["Sintesi","Categorie","Flussi del Piano"][i]+'</button>').join('')+'</div>';
 const select='<div class="bf-control-buttons">'+
  ['ROLLING_12','CALENDAR'].map((v,i)=>'<button type="button" data-bf-control-period="'+v+'" class="btn compact '+(controlUi.period===v?'':'ghost')+'">'+['12 mesi rolling','Anno corrente'][i]+'</button>').join('')+'</div>';
 const sensitivity='<div class="bf-control-sensitivity"><label for="bfControlSensitivity">Avvisi</label>'+
  '<select id="bfControlSensitivity" data-bf-control-sensitivity aria-label="Sensibilità dei warning">'+
  [["HIGH","Alta"],["STANDARD","Standard"],["LOW","Bassa"]].map(([val,label])=>
   '<option value="'+val+'"'+(controlUi.sensitivity===val?' selected':'')+'>'+label+'</option>').join('')+
  '</select>'+infoButton("sensitivity")+'</div>';
 const partial=model.coverage.missing>0;
 const monthlyResidue=closed?"—":sm.missing?"Parziale "+money(sm.planExpense-sm.actualExpense):money(sm.planExpense-sm.actualExpense);

 const actualOvers=actualOverBudget(model,sm.month);
 const actualAlerts=actualControlAlerts(model,sm.month);
 const bodyActualAlerts=actualAlerts.map(a=>'<div class="bf-control-message bf-control-message-'+a.type+'"><strong>'+esc(a.title)+'</strong><p>'+esc(a.text)+'</p><small>'+esc(a.action)+'</small></div>').join('');
 const actualPlan=sm.planExpense!==null?sm.planExpense:0;
 const monthSpent=sm.actualExpense;
 const monthRemaining=closed?null:sm.missing?null:round(actualPlan-monthSpent);
 const spentRatio=actualPlan>0?Math.min(100,Math.max(0,Math.round(100*monthSpent/actualPlan))):monthSpent>0?100:0;
 const hero='<div class="bf-hero-kpis bf-control-first-row bf-control-actual-first">'+
  kpi("Piano approvato · "+(controlUi.period==="CALENDAR"?"anno corrente":"12 mesi"),"outcome",eur(model.planTotal),
   'Avanzo economico obiettivo · riferimento fisso',"neutral")+
  '<div class="bf-kpi-card bf-kpi-actual"><div class="bf-kpi-caption"><span>Movimenti registrati · '+esc(displayMonth(sm.month))+'</span>'+infoButton("monthbalance")+'</div>'+
    '<div class="bf-tech-comparison"><div><small>Entrate effettive</small><strong>'+money(sm.actualIncome)+'</strong></div>'+
    '<div><small>Uscite effettive</small><strong>'+money(sm.actualExpense)+'</strong></div></div>'+
    '<span>'+(closed?'Mese chiuso':sm.month>model.current?'Mese futuro: movimenti non ancora disponibili':'Consuntivo parziale, fino agli ultimi movimenti importati')+'</span></div>'+
  '<div class="bf-kpi-card '+(monthRemaining!==null&&monthRemaining<0?'bf-kpi-danger':'bf-kpi-neutral')+'"><div class="bf-kpi-caption"><span>Budget spese '+esc(displayMonth(sm.month))+' · residuo</span>'+infoButton("remaining")+'</div>'+
   '<strong>'+eur(monthRemaining)+'</strong>'+
   '<span>Budget mensile '+eur(sm.missing?null:sm.planExpense)+' − spese registrate '+money(sm.actualExpense)+'</span>'+
   (!closed&&!sm.missing?'<div class="bf-actual-budget-track" aria-label="Budget consumato '+spentRatio+'%"><span style="width:'+spentRatio+'%"></span></div>':'')+
   '<span>'+(sm.missing?'Target incompleti':closed?'Mese già concluso':spentRatio+'% del budget mensile utilizzato')+'</span></div></div>';
 const minor='<div class="bf-control-kpis bf-kpi-minor bf-control-actual-minor">'+
  kpi("Categorie già oltre il budget","breakdown",String(actualOvers.length),
    'Solo uscite effettivamente registrate nel mese',actualOvers.length?"danger":"neutral")+
  kpi("Copertura obiettivi Piano","coverage",coveragePct+"%",
    model.coverage.approved+' / '+model.coverage.expected+' categoria-mesi',partial?"caution":"neutral")+
  '</div>';
 const stageNotice='<p class="bf-control-notice"><strong>Il Controllo parte da ciò che è certo:</strong> obiettivi del Piano approvato e movimenti effettivamente registrati. La previsione automatica del futuro è ancora sperimentale: non viene usata per giudicare l’andamento né per generare allarmi. Puoi consultarla separatamente nell’approfondimento in fondo alla Sintesi.</p>';
 const top='<div class="bf-control-header"><div><h2>Controllo · '+esc(label)+'</h2>'+
  '<p>Piano approvato V'+esc(model.revision)+' · Consuntivi aggiornati · Proiezione tecnica non revisionata</p></div>'+
  '<button class="btn compact ghost" data-bf-control-reload>↻ Aggiorna dati</button></div>'+
  '<div class="bf-control-controls">'+select+buttons+sensitivity+'</div>'+
  stageNotice+hero+minor+
  (partial?'<p class="bf-control-notice">La copertura del Piano è incompleta: i mesi/categorie senza target esplicito rimangono <strong>provvisori</strong>. Non vengono scambiati per obiettivi approvati.</p>':'');
 const monthMenu='<div class="bf-months-block">'+sectionHeading("Il Piano mese per mese · saldo economico programmato","months")+
  '<p class="bf-control-muted">Il numero grande è il <b>saldo del Piano</b> (entrate programmate − uscite programmate). Solo per il mese in corso compare anche il <b>consuntivo parziale</b>; i mesi futuri non sono ancora un consuntivo.</p>'+
  '<div class="bf-month-strip" aria-label="Mesi del Piano approvato">'+model.series.map(m=>{
    const isCurrent=m.month===model.current;
    const confirmedOver=isCurrent&&actualOverBudget(model,m.month).length>0;
    const tileTone=confirmedOver?"danger":"neutral";
    return '<button type="button" data-bf-control-month="'+m.month+'" aria-pressed="'+(m.month===sm.month)+'" class="'+(m.month===sm.month?'active ':'')+'bf-month-'+tileTone+'" title="Saldo programmato: '+eur(m.planNet)+'">'+
     '<span>'+esc(displayMonth(m.month))+'</span>'+
     '<small>Saldo Piano</small><strong>'+eur(m.planNet)+'</strong>'+
     '<small>'+(isCurrent?'Consuntivo parziale: '+money(round(m.actualIncome-m.actualExpense)):m.active?'Obiettivo approvato':'Mese chiuso')+'</small>'+
     (confirmedOver?'<small class="bf-real-over">Budget spese già superato</small>':'')+
     '</button>';
   }).join('')+'</div></div>';
 let panel='';
 if(controlUi.tab==="SUMMARY"){
  panel='<section class="bf-panel bf-chart-panel">'+sectionHeading("Saldo economico programmato · Piano approvato","trend")+
   '<div class="bf-control-visual"><canvas data-bf-control-chart="overview" role="img" aria-label="Saldi economici programmati mese per mese e consuntivo parziale del mese corrente"></canvas></div>'+
   '<p class="bf-control-muted">Le barre rappresentano il Piano: entrate mensili programmate meno uscite programmate. Il punto separato indica solo il consuntivo parziale del mese corrente, non una previsione di chiusura. Non è un saldo bancario.</p></section>'+
   '<div class="bf-control-columns"><section class="bf-panel">'+sectionHeading("Verifica movimenti e budget · "+displayMonth(sm.month),"actions")+
    '<div class="bf-control-messages">'+bodyActualAlerts+'</div></section>'+
    '<section class="bf-panel">'+sectionHeading("Obiettivi e consuntivo del mese","monthbalance")+
    '<div class="bf-control-quickrows"><div><span>Entrate da Piano</span><strong>'+eur(sm.missing?null:sm.planIncome)+'</strong></div>'+
    '<div><span>Uscite da Piano</span><strong>'+eur(sm.missing?null:sm.planExpense)+'</strong></div>'+
    '<div><span>Saldo economico da Piano</span><strong>'+eur(sm.planNet)+'</strong></div>'+
    '<div><span>Entrate registrate</span><strong>'+money(sm.actualIncome)+'</strong></div>'+
    '<div><span>Uscite registrate</span><strong>'+money(sm.actualExpense)+'</strong></div>'+
    '<div><span>Residuo budget spese</span><strong>'+eur(sm.missing?null:round(sm.planExpense-sm.actualExpense))+'</strong></div></div>'+
    '<p class="bf-control-muted">Il consuntivo di un mese in corso è parziale e non è direttamente confrontabile con un budget mensile intero come previsione. Nessuna interpolazione giornaliera è applicata.</p></section></div>'+
    technicalDetails(model);
 }else if(controlUi.tab==="CATEGORIES"){
  const table='<div class="bf-control-overflow"><table class="bf-control-table bf-control-detail"><thead><tr><th>Categoria L1 / L2</th><th>Budget Piano</th><th>Consuntivo registrato</th><th>Residuo</th><th>Stato target</th></tr></thead><tbody>'+
   tableMonth(model,sm.month)+'</tbody></table></div>';
  panel='<section class="bf-panel"><div class="bf-control-section-head">'+sectionHeading("Dettaglio per categoria · "+displayMonth(sm.month),"categories")+'<div class="bf-control-buttons">'+
   ["EXPENSE","INCOME"].map((v,i)=>'<button class="btn compact '+(controlUi.direction===v?'':'ghost')+'" data-bf-control-direction="'+v+'">'+['Uscite','Entrate'][i]+'</button>').join('')+
   '<button class="btn compact ghost" data-bf-control-risk-filter="'+(controlUi.onlyRisks?'ALL':'RISK')+'">'+(controlUi.onlyRisks?'Mostra tutte':'Solo oltre budget')+'</button>'+
   '<button class="btn compact ghost" data-bf-control-sort="'+(controlUi.sort==="IMPACT"?'NAME':'IMPACT')+'">Ordine: '+(controlUi.sort==="IMPACT"?'spesa oltre budget':'nome')+'</button></div></div>'+
   table+'<p class="bf-control-muted">Espandi una L1 e seleziona una L2 per vedere Piano e consuntivo mensile. Il residuo è budget non ancora utilizzato: non è liquidità bancaria. Nei mesi futuri il consuntivo non è disponibile.</p></section>'+categoryTimeline(model);
 }else{
  let cumulativePlan=0,completeCumulative=true;
  panel='<section class="bf-panel">'+sectionHeading("Flussi economici del Piano · "+label,"flows")+
   '<div class="bf-control-visual bf-control-visual-short"><canvas data-bf-control-chart="flows" role="img" aria-label="Saldo mensile economico previsto dal Piano approvato"></canvas></div>'+
   '<div class="bf-control-overflow"><table class="bf-control-table bf-control-timeline"><thead><tr><th>Mese</th><th>Entrate Piano</th><th>Uscite Piano</th><th>Saldo Piano</th><th>Cumulato Piano*</th><th>Consuntivo mese**</th><th>Copertura target</th></tr></thead><tbody>'+
   model.series.map(m=>{
    if(m.planNet===null)completeCumulative=false;
    if(completeCumulative)cumulativePlan=round(cumulativePlan+m.planNet);
    const actual=m.month===model.current?money(round(m.actualIncome-m.actualExpense)):'—';
    return '<tr><td><button class="bf-tree-toggle" data-bf-control-month="'+m.month+'">'+esc(displayMonth(m.month))+'</button></td>'+
    '<td>'+eur(m.planIncome)+'</td><td>'+eur(m.planExpense)+'</td><td>'+eur(m.planNet)+'</td>'+
    '<td>'+eur(completeCumulative?cumulativePlan:null)+'</td><td>'+actual+'</td>'+
    '<td>'+(m.active?(m.missing?'<span class="bf-status bf-status-provisional">'+m.missing+' obiettivi mancanti</span>':'<span class="bf-status bf-status-approved">Approvato</span>'):'Consuntivo')+'</td></tr>';
   }).join('')+'</tbody></table></div>'+
   '<p class="bf-control-muted">* Cumulato dei saldi del Piano, a partire convenzionalmente da zero: non è la giacenza dei conti. ** Per il mese corrente sono mostrati solo i movimenti registrati, senza proiezioni automatiche.</p></section>';

 }
 host.innerHTML=top+monthMenu+panel;
 drawControlChart(host,model);
 drawCategoryChart(host,model);
}
function periodRiskTable(model){
 const items=model.rows.filter(r=>r.direction==="EXPENSE").map(r=>{
  const cells=model.months.filter(m=>m>=model.current).map(m=>r.months[m])
   .filter(c=>c.plan!==null&&c.forecast!==null);
  return {...r,totalDelta:round(cells.reduce((n,c)=>n+c.delta,0)),months:cells.length};
 }).filter(r=>r.totalDelta<-.005).sort((a,b)=>a.totalDelta-b.totalDelta).slice(0,8);
 if(!items.length)return '<p class="bf-control-muted">Nessuna differenza tecnica negativa nelle categorie con target approvato.</p>';
 return '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Categoria</th><th>Mesi confrontabili</th><th>Impatto periodo</th></tr></thead><tbody>'+
  items.map(r=>'<tr><td>'+esc(r.l1Name)+' / '+esc(r.name)+'</td><td>'+r.months+'</td><td class="bf-negative">'+humanDelta(r.totalDelta)+'</td></tr>').join('')+
 '</tbody></table></div><p class="bf-control-muted">Somma dei soli mesi con target esplicitamente approvato e forecast disponibile; le categorie senza target non vengono confrontate.</p>';
}
function riskTable(items){
 if(!items.length)return '<p class="bf-control-muted">Nessuna categoria di uscita mostra differenze tecniche negative significative nel mese selezionato.</p>';
 return '<div class="bf-control-overflow"><table class="bf-control-table"><thead><tr><th>Categoria</th><th>Piano</th><th>Proiezione tecnica</th><th>Δ sul risultato</th></tr></thead><tbody>'+
  items.slice(0,12).map(r=>'<tr><td>'+esc(r.l1Name)+' / '+esc(r.name)+'</td><td>'+money(r.metric.plan)+'</td><td>'+money(r.metric.forecast)+'</td><td class="bf-negative">'+humanDelta(r.metric.delta)+'</td></tr>').join('')+'</tbody></table></div>';
}
function renderTracking(host,approved,live,meta){
 currentControlHost=host;currentControlRecord=approved;currentControlLive=live;currentControlMeta=meta;
 const result=buildControl(approved,live,meta,controlUi.period);
 currentControlModel=result;
 return renderExtended(host,result);
}
function handleControlClick(e){
 if(!currentControlHost)return false;
 const jump=e.target?.closest?.("[data-bf-control-open-risk]");
 if(jump){
  const id=decodeURIComponent(jump.getAttribute("data-bf-control-open-risk")||"");
  const category=currentControlModel?.rows?.find(r=>r.id===id);
  if(!category)return false;
  controlUi.tab="CATEGORIES";controlUi.direction=category.direction;controlUi.onlyRisks=false;
  controlUi.selectedCategory=id;
  controlUi.expanded[category.l1Id+"|"+category.l1Name]=true;
  renderTracking(currentControlHost,currentControlRecord,currentControlLive,currentControlMeta);
  currentControlHost.querySelector?.(".bf-control-category-timeline")?.scrollIntoView?.({behavior:"smooth",block:"start"});
  return true;
 }
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
