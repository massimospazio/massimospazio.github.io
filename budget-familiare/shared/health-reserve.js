// V73.30.1.25 — Report sanitario e fondo imprevisti. Non cambia il forecast.
(function(root){
"use strict";
const doc=root.document;
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function norm(v){return String(v||"").trim().toLowerCase()}
function monthOffset(iso,d){const z=new Date(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1+d,1);return z.getFullYear()+"-"+String(z.getMonth()+1).padStart(2,"0")+"-01"}
function priorMonth(date){const d=date||new Date();return monthOffset(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-01",-1)}
function medicalType(r){
 const a=norm(r.l1_name),b=norm(r.l2_name);
 if(r.direction==="EXPENSE"&&a==="salute"&&b==="medici e visite")return "medical";
 if(r.direction==="EXPENSE"&&a==="salute"&&b==="analisi / diagnostica")return "diagnostics";
 if(r.direction==="INCOME"&&b==="assicurazione sanitaria")return "insurance";
 return null;
}
function summary(rows,start,length){
 const months=Array.from({length:length},(_,i)=>({month:monthOffset(start,i),medical:0,diagnostics:0,insurance:0}));
 const map=new Map(months.map(x=>[x.month,x]));
 for(const r of rows||[]){const key=medicalType(r),m=map.get(String(r.month_start||"").slice(0,10));if(key&&m)m[key]+=Math.max(0,n(r.total_amount))}
 const totals=months.reduce((s,r)=>({medical:s.medical+r.medical,diagnostics:s.diagnostics+r.diagnostics,insurance:s.insurance+r.insurance}),{medical:0,diagnostics:0,insurance:0});
 totals.eligible=totals.medical+totals.diagnostics;totals.net=totals.eligible-totals.insurance;
 return {months:months,totals:totals};
}
function estimate(med,diag,pct){const cost=Math.max(0,n(med))+Math.max(0,n(diag));return {cost:cost,reimbursement:cost*Math.min(100,Math.max(0,n(pct)))/100}}

/* Monthly matching compares one FIXED 12-month expense cohort with reimbursements
   at lags 0..3. End expenses three months before the last completed month so that
   every lag can be observed. Rates are NOT identified claims or policy coverage. */
function pearson(pairs){
 if(!Array.isArray(pairs)||pairs.length<4)return null;
 const x=pairs.map(v=>n(v.cost)),y=pairs.map(v=>n(v.refund));
 const xm=x.reduce((s,v)=>s+v,0)/x.length,ym=y.reduce((s,v)=>s+v,0)/y.length;
 let xx=0,yy=0,xy=0;
 for(let i=0;i<x.length;i++){const dx=x[i]-xm,dy=y[i]-ym;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy}
 return xx>1e-12&&yy>1e-12?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))):null;
}
function lagReport(rows,lastCompleted,monthsCount=12,maxLag=3){
 const end=monthOffset(lastCompleted,-maxLag),start=monthOffset(end,1-monthsCount);
 const months=summary(rows,start,monthsCount+maxLag).months;
 const expenses=months.slice(0,monthsCount);
 const comparisons=Array.from({length:maxLag+1},(_,lag)=>{
   const paired=expenses.map((x,i)=>{
     const refund=n(months[i+lag]&&months[i+lag].insurance);
     return {month:x.month,refundMonth:monthOffset(x.month,lag),
       medical:x.medical,diagnostics:x.diagnostics,cost:x.medical+x.diagnostics,refund:refund};
   });
   const cost=paired.reduce((v,x)=>v+x.cost,0),refund=paired.reduce((v,x)=>v+x.refund,0);
   return {lag:lag,paired:paired,cost:cost,refund:refund,rate:cost>0?refund*100/cost:null,
     correlation:pearson(paired),expenseMonths:paired.filter(x=>x.cost>0).length,
     reimbursementMonths:paired.filter(x=>x.refund>0).length};
 });
 return {start:start,end:end,through:lastCompleted,comparisons:comparisons};
}
const pure={medicalType:medicalType,summary:summary,monthOffset:monthOffset,priorMonth:priorMonth,estimate:estimate,pearson:pearson,lagReport:lagReport};
if(typeof module!=="undefined"&&module.exports)module.exports=pure;
if(!doc)return;
const $=id=>doc.getElementById(id),eu=v=>n(v).toLocaleString("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0});
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let rows=null,calc=null,last=null,observedChart=null,shiftedChart=null,selectedLag=0,chartMonths=18,year=(new Date()).getFullYear(),fund=null,loadLock=false;
function status(id,message,bad){const el=$(id);if(el){el.textContent=message||"";el.classList.toggle("hr-error",!!bad)}}
function metric(title,amount){return '<div class="hr-metric"><small>'+esc(title)+'</small><strong>'+eu(amount)+'</strong></div>'}
function open(tab){
 $("hrDialog").classList.remove("hidden");$("hrDialog").setAttribute("aria-hidden","false");
 doc.body.style.overflow="hidden";show(tab==="fund"?"fund":"health");
}
function close(){killCharts();$("hrDialog").classList.add("hidden");$("hrDialog").setAttribute("aria-hidden","true");doc.body.style.overflow=""}
function show(tab){
 $("hrHealth").classList.toggle("hidden",tab!=="health");$("hrFund").classList.toggle("hidden",tab!=="fund");
 doc.querySelectorAll("[data-hr-tab]").forEach(b=>{const selected=b.dataset.hrTab===tab;b.classList.toggle("active",selected);b.setAttribute("aria-selected",String(selected))});
 if(tab==="health")loadHealth(false);else{killCharts();loadFund();}
}
async function loadHealth(force){
 if(rows&&!force){renderHealth();return}
 status("hrHealthStatus","Carico lo storico sanitario…");
 try{
   const data=await rpc("dashboard_reporting_scenario_actual_v3",{p_months:36});
   rows=Array.isArray(data&&data.category_monthly)?data.category_monthly:[];
   last=priorMonth();calc=null;status("hrHealthStatus","");renderHealth();
 }catch(e){status("hrHealthStatus",e.message||"Errore nello storico sanitario.",true)}
}

function eu2(v){return n(v).toLocaleString("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2})}
function metric2(title,amount){return '<div class="hr-metric"><small>'+esc(title)+'</small><strong>'+eu2(amount)+'</strong></div>'}
function percent(v,digits){return v===null||!Number.isFinite(v)?"—":v.toLocaleString("it-IT",{minimumFractionDigits:digits||0,maximumFractionDigits:digits||0})+"%"}
function signedCorrelation(v){return v===null?"—":(v>=0?"+":"")+v.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})}
function killCharts(){
 if(observedChart){observedChart.destroy();observedChart=null}
 if(shiftedChart){shiftedChart.destroy();shiftedChart=null}
}
function graph(canvas,datasets,labels){
 if(!root.Chart||!canvas)return null;
 return new root.Chart(canvas,{
  type:"bar",
  data:{labels:labels,datasets:datasets},
  options:{
    responsive:true,maintainAspectRatio:false,animation:false,
    interaction:{mode:"index",intersect:false},
    plugins:{legend:{position:"bottom",labels:{boxWidth:13,font:{size:12}}},
      tooltip:{callbacks:{label:function(c){return c.dataset.label+": "+eu2(c.parsed.y)}}}},
    scales:{
      x:{stacked:true,grid:{display:false},ticks:{maxRotation:55,minRotation:0,font:{size:11}}},
      y:{stacked:true,beginAtZero:true,ticks:{callback:v=>n(v).toLocaleString("it-IT")+" €"}}
    }
  }
 });
}
function datasetsFor(months,shifted){
 const meds=months.map(x=>n(x.medical)),diags=months.map(x=>n(x.diagnostics)),refunds=months.map(x=>n(x.insurance));
 return [
  {label:"Medici e visite",data:meds,backgroundColor:"#3f79c9",stack:"spese",borderRadius:2,maxBarThickness:19},
  {label:"Analisi / Diagnostica",data:diags,backgroundColor:"#23a48d",stack:"spese",borderRadius:2,maxBarThickness:19},
  {label:shifted?"Rimborsi (traslati)":"Rimborsi incassati",data:refunds,backgroundColor:"#e9a03e",stack:"rimborsi",borderRadius:2,maxBarThickness:19}
 ];
}
function renderRealChart(){
 if(observedChart){observedChart.destroy();observedChart=null}
 const start=monthOffset(last,1-chartMonths),all=summary(rows,start,chartMonths).months;
 const canvas=$("hrRealChart");if(!canvas)return;
 observedChart=graph(canvas,datasetsFor(all,false),all.map(x=>x.month.slice(0,7)));
}
function renderLagDetail(){
 const rep=lagReport(rows,last),result=rep.comparisons[selectedLag]||rep.comparisons[0];
 if(!result)return;
 const details=$("hrLagDetail"),goodRate=result.rate!==null&&result.rate<=100;
 const high=result.rate!==null&&result.rate>100;
 details.innerHTML='<div class="hr-lag-summary">'+
 '<div><small>Spese · finestra fissa</small><strong>'+eu2(result.cost)+'</strong></div>'+
 '<div><small>Rimborsi con ritardo '+selectedLag+'m</small><strong>'+eu2(result.refund)+'</strong></div>'+
 '<div><small>Rapporto osservato</small><strong class="'+(high?"hr-error":"")+'">'+percent(result.rate,1)+'</strong></div>'+
 '<div><small>Correlazione mensile (r)</small><strong>'+signedCorrelation(result.correlation)+'</strong></div></div>'+
 '<p class="hr-help">Per esempio, spese di luglio → rimborsi di '+(selectedLag===0?"luglio":selectedLag===1?"agosto":selectedLag===2?"settembre":"ottobre")+'. Tutte le righe usano le <strong>stesse spese</strong> ('+rep.start.slice(0,7)+' — '+rep.end.slice(0,7)+'); cambiano solo i mesi dei rimborsi confrontati.</p>'+
 '<p class="hr-help">Mesi con spese: '+result.expenseMonths+'/12 · mesi con rimborsi: '+result.reimbursementMonths+'/12. La correlazione misura la somiglianza dei picchi mensili, non certifica a quali fatture appartengono i rimborsi.'+
 (high?' <strong>Rapporto oltre il 100%: non usarlo come copertura assicurativa attesa.</strong>':'')+'</p>'+
 '<button type="button" id="hrApplyRate" class="btn ghost compact" '+(!goodRate?'disabled title="Non si può usare una percentuale superiore al 100% oppure non disponibile"':'')+'>Usa '+percent(result.rate,1)+' come ipotesi nel calcolatore</button>';
 doc.querySelectorAll("[data-hr-lag]").forEach(b=>{
   const current=Number(b.dataset.hrLag)===selectedLag;
   b.classList.toggle("active",current);b.setAttribute("aria-pressed",String(current));
 });
 if(shiftedChart){shiftedChart.destroy();shiftedChart=null}
 const aligned=result.paired.map(x=>({month:x.month,medical:x.medical,diagnostics:x.diagnostics,insurance:x.refund}));
 shiftedChart=graph($("hrShiftChart"),datasetsFor(aligned,true),aligned.map(x=>x.month.slice(0,7)));
}
function renderHealth(){
 killCharts();
 const start=monthOffset(last,-11),earlier=monthOffset(start,-12),
       current=summary(rows,start,12),previous=summary(rows,earlier,12),t=current.totals,
       rate=t.eligible>0?t.insurance/t.eligible*100:null,
       lagged=lagReport(rows,last);
 if(!calc){
   const base=lagged.comparisons[0].rate;
   calc={med:Math.round(t.medical),diag:Math.round(t.diagnostics),pct:base===null?0:Math.min(100,Math.round(base))};
 }
 $("hrHealthBody").innerHTML=
 '<p class="hr-help">Ultimi 12 mesi completi: '+esc(start.slice(0,7))+' — '+esc(last.slice(0,7))+'. Spese: solo Medici e visite + Analisi / Diagnostica. Rimborsi: Assicurazione Sanitaria. Eventi eccezionali inclusi.</p>'+
 '<div class="hr-metrics">'+metric2("Medici e visite",t.medical)+metric2("Analisi / Diagnostica",t.diagnostics)+metric2("Assicurazione Sanitaria",t.insurance)+metric2("Costo netto del periodo (spese − rimborsi)",t.net)+'</div>'+
 '<p class="hr-help">Rapporto rimborsi/spese senza sfasamento, sugli ultimi 12 mesi: <strong>'+percent(rate,1)+'</strong>. Nei 12 mesi precedenti: spese '+eu2(previous.totals.eligible)+'; rimborsi '+eu2(previous.totals.insurance)+'.</p>'+
 (t.net<0?'<p class="hr-warning">Rimborsi superiori alle spese del periodo di '+eu2(-t.net)+'. Potrebbero riguardare prestazioni precedenti: questo saldo non misura la copertura effettiva della polizza.</p>':"")+
 '<section class="hr-analysis"><div class="hr-chart-heading"><div><h3>Quando spendiamo e quando incassiamo?</h3><p class="hr-help">Barre blu e verdi: spese mediche e diagnostiche impilate. Arancione: rimborsi effettivamente incassati nel mese. Calendario reale, senza spostamenti.</p></div><div class="hr-choices" role="group" aria-label="Mesi nel grafico storico">'+
 '<button type="button" data-hr-months="12" '+(chartMonths===12?'class="active"':'')+'>12m</button><button type="button" data-hr-months="18" '+(chartMonths===18?'class="active"':'')+'>18m</button><button type="button" data-hr-months="24" '+(chartMonths===24?'class="active"':'')+'>24m</button></div></div>'+
 '<div class="hr-graph-scroll"><div class="hr-graph-body"><canvas id="hrRealChart" aria-label="Spese e rimborsi per mese" role="img"></canvas></div></div></section>'+
 '<section class="hr-analysis"><h3>Quale ritardo spiega meglio i rimborsi?</h3>'+
 '<p class="hr-help">Confronto corretto su <strong>12 mesi identici di spesa</strong> ('+lagged.start.slice(0,7)+' — '+lagged.end.slice(0,7)+'). La finestra termina tre mesi prima di '+last.slice(0,7)+' perché anche i rimborsi ipotizzati a +3 mesi devono essere già osservabili.</p>'+
 '<div class="hr-lag-table-wrap"><table class="hr-table hr-lag-table"><thead><tr><th>Ritardo</th><th>Spese</th><th>Rimborsi abbinati</th><th>Rapporto</th><th>Correlazione r</th><th></th></tr></thead><tbody>'+
 lagged.comparisons.map(function(x){return '<tr><td><strong>'+x.lag+' '+(x.lag===1?'mese':'mesi')+'</strong></td><td>'+eu2(x.cost)+'</td><td>'+eu2(x.refund)+'</td><td class="'+(x.rate>100?'hr-error':'')+'">'+percent(x.rate,1)+'</td><td>'+signedCorrelation(x.correlation)+'</td><td><button type="button" class="hr-lag-pick" data-hr-lag="'+x.lag+'">Confronta</button></td></tr>'}).join("")+
 '</tbody></table></div><p class="hr-help">I rapporti possono superare il 100% per rimborsi relativi a spese diverse dalla finestra. Correlazioni basse o negative non escludono ritardi reali: i rimborsi potrebbero essere accorpati, parziali o distribuiti su più mesi.</p>'+
 '<div id="hrLagDetail"></div><h3>Confronto dei mesi riallineati</h3><div class="hr-graph-scroll"><div class="hr-graph-body hr-graph-body-compare"><canvas id="hrShiftChart" aria-label="Spese e rimborsi riallineati con il ritardo selezionato" role="img"></canvas></div></div>'+
 '<p class="hr-help">L’asse X indica il <strong>mese della spesa</strong>. La barra arancione mostra il rimborso incassato '+(selectedLag===0?'nello stesso mese':'nel mese spostato in avanti')+'. L’allineamento è statistico e non associa singole fatture.</p></section>'+
 '<div class="hr-scroll"><table class="hr-table"><thead><tr><th>Mese reale</th><th>Medici</th><th>Diagnostica</th><th>Rimborsi</th><th>Netto</th></tr></thead><tbody>'+
 current.months.map(x=>'<tr><td>'+esc(x.month.slice(0,7))+'</td><td>'+eu2(x.medical)+'</td><td>'+eu2(x.diagnostics)+'</td><td>'+eu2(x.insurance)+'</td><td>'+eu2(x.medical+x.diagnostics-x.insurance)+'</td></tr>').join("")+
 '</tbody></table></div>'+
 '<section class="hr-calc"><h3>Stima da riportare nella baseline</h3><p class="hr-help">Scegli una copertura prudente: i rapporti storici sopra non sono percentuali contrattuali. La percentuale iniziale deriva dal confronto a 0 mesi sulla finestra omogenea e va verificata. Il calcolatore non modifica le previsioni; l’inserimento nella baseline resta manuale.</p>'+
 '<div class="hr-fields"><label>Medici e visite previste (€)<input id="hrMed" type="number" step="10" min="0" value="'+esc(calc.med)+'"></label>'+
 '<label>Analisi / Diagnostica previste (€)<input id="hrDiag" type="number" step="10" min="0" value="'+esc(calc.diag)+'"></label>'+
 '<label>Copertura stimata (%)<input id="hrPct" type="number" step="1" min="0" max="100" value="'+esc(calc.pct)+'"></label></div>'+
 '<div id="hrCalcResults" class="hr-result"></div><div class="hr-actions"><button id="hrCopy" class="btn compact" type="button">Copia per baseline</button><button id="hrReload" class="btn ghost compact" type="button">↻ Ricarica dati</button></div><p id="hrCopyMsg" class="hr-help" role="status"></p></section>';
 updateCalc();
 renderRealChart();
 renderLagDetail();
 $("hrHealthBody").oninput=function(e){
   if(e.target.id==="hrMed")calc.med=Math.max(0,n(e.target.value));
   else if(e.target.id==="hrDiag")calc.diag=Math.max(0,n(e.target.value));
   else if(e.target.id==="hrPct")calc.pct=Math.min(100,Math.max(0,n(e.target.value)));
   else return;
   updateCalc();
 };
 $("hrHealthBody").onclick=async function(e){
   const period=e.target.closest("[data-hr-months]");
   if(period){
     chartMonths=Number(period.dataset.hrMonths);
     doc.querySelectorAll("[data-hr-months]").forEach(b=>b.classList.toggle("active",Number(b.dataset.hrMonths)===chartMonths));
     renderRealChart();return;
   }
   const shift=e.target.closest("[data-hr-lag]");
   if(shift){selectedLag=Number(shift.dataset.hrLag);renderLagDetail();return}
   if(e.target.closest("#hrApplyRate")){
     const rate=lagReport(rows,last).comparisons[selectedLag].rate;
     if(rate!==null&&rate>=0&&rate<=100){calc.pct=Math.round(rate*10)/10;$("hrPct").value=String(calc.pct);updateCalc();$("hrPct").focus();}
     return;
   }
   if(e.target.closest("#hrReload")){rows=null;loadHealth(true);return}
   if(!e.target.closest("#hrCopy"))return;
   const x=estimate(calc.med,calc.diag,calc.pct);
   const text="Baseline sanitaria (annuale)\nMedici e visite: "+eu2(calc.med)+"\nAnalisi / Diagnostica: "+eu2(calc.diag)+"\nEntrate · Assicurazione Sanitaria: "+eu2(x.reimbursement)+"\nCosto netto: "+eu2(x.cost-x.reimbursement);
   try{await navigator.clipboard.writeText(text);status("hrCopyMsg","Valori copiati. Inserisci manualmente gli importi nella baseline.")}
   catch(err){status("hrCopyMsg","Copia non disponibile. Usa i valori visibili nel report.",true)}
 };
}
function updateCalc(){
 if(!calc||!$("hrCalcResults"))return;
 const x=estimate(calc.med,calc.diag,calc.pct);
 $("hrCalcResults").innerHTML='<span>Spesa lorda: <strong>'+eu(x.cost)+'</strong></span><span>Rimborso stimato: <strong>'+eu(x.reimbursement)+'</strong></span><span>Netto atteso: <strong>'+eu(x.cost-x.reimbursement)+'</strong></span>';
}
async function fundRPC(action,args){return rpc("dashboard_family_emergency_fund_v1",Object.assign({p_action:action,p_year:year},args||{}))}
async function loadFund(){
 if(loadLock)return;
 loadLock=true;fund=null;status("hrFundStatus","Carico il fondo…");
 try{fund=await fundRPC("READ");status("hrFundStatus","");renderFund();inline()}
 catch(e){status("hrFundStatus",e.message||"Impossibile caricare il fondo.",true);inline()}
 finally{loadLock=false}
}
function inline(){
 const el=$("hrFundInline"),plan=$("planningBoardView")?.dataset.boardContext==="PLAN";
 if(!el)return;
 el.classList.toggle("hidden",!plan);if(!plan)return;
 if(!fund){el.innerHTML='<span>Fondo imprevisti '+year+' · '+(loadLock?'Caricamento…':'Dati non ancora caricati')+'</span><button type="button" class="btn ghost compact" data-hr-open="fund">Apri</button>';return}
 const a=n(fund.allocated),u=n(fund.used),remaining=a-u;
 let available='';
 // Only calendar-year totals can be compared with a calendar-year reserve.
 try{
   if(planningBoardHorizon==="CALENDAR"&&planningBoardData&&String(planningBoardData.expense.current_year_start).slice(0,4)===String(year)){
     const exp=planningBuildRows(planningBoardData.expense,"EXPENSE");
     const inc=planningBuildRows(planningBoardData.income,"INCOME");
     const surplus=planningOverviewModel(exp,inc).baseline.surplus;
     available=' · <strong title="Avanzo previsto meno la riserva ancora accantonata. Gli utilizzi del fondo devono essere già inclusi nel forecast.">Avanzo libero (forecast) '+eu(surplus-Math.max(0,remaining))+'</strong>';
   }
 }catch(err){/* Fund remains visible even when board figures cannot be calculated. */}
 el.innerHTML='<span><strong>Fondo imprevisti '+year+'</strong> · Stanziato '+eu(a)+' · Utilizzato '+eu(u)+' · <strong class="'+(remaining<0?"hr-error":"")+'">Residuo '+eu(remaining)+'</strong>'+available+'</span><button type="button" class="btn ghost compact" data-hr-open="fund">Gestisci</button>';
}
function renderFund(){
 const a=n(fund.allocated),u=n(fund.used),remaining=a-u,percentage=a>0?Math.max(0,Math.min(100,100*u/a)):0;
 const useDate=year===(new Date()).getFullYear()?(function(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")})():year+"-01-01";
 $("hrFundBody").innerHTML=
 '<p class="hr-help">Fondo '+year+' · quota dell’avanzo riservata agli imprevisti. <strong>Non è una spesa e non altera il forecast.</strong> La riduzione della riserva libera meno risorse vincolate, non genera nuove entrate.</p>'+
 '<div class="hr-metrics hr-metrics-3">'+metric("Fondo stanziato",a)+metric("Utilizzi dichiarati",u)+metric("Residuo",remaining)+'</div><div class="hr-progress"><span style="width:'+percentage+'%"></span></div>'+
 (remaining<0?'<p class="hr-warning">La riserva è stata superata di '+eu(-remaining)+'. Valuta una revisione dei target discrezionali futuri.</p>':"")+
 '<form id="hrSetForm" class="hr-inline"><label>Stanziamento annuale (€)<input id="hrSetAmount" type="number" min="0" step="50" value="'+esc(a)+'" required></label><button type="submit" class="btn compact">Salva fondo</button></form>'+
 '<p class="hr-help">Registra manualmente solo utilizzi per imprevisti reali. Il relativo movimento bancario deve essere classificato normalmente: l’utilizzo del fondo non crea una seconda spesa.</p>'+
 '<h3>Nuovo utilizzo</h3><form id="hrUseForm" class="hr-fields"><label>Data<input id="hrDate" type="date" min="'+year+'-01-01" max="'+year+'-12-31" value="'+esc(useDate)+'" required></label>'+
 '<label>Importo (€)<input id="hrAmount" type="number" step="0.01" min="0.01" placeholder="Es. 250" required></label>'+
 '<label>Motivo<input id="hrNote" type="text" maxlength="250" minlength="2" placeholder="Es. Guasto frigorifero" required></label><button type="submit" class="btn compact">Registra utilizzo</button></form>'+
 '<h3>Utilizzi</h3><div class="hr-scroll"><table class="hr-table"><thead><tr><th>Data</th><th>Motivo</th><th>Importo</th><th></th></tr></thead><tbody>'+
 ((fund.uses||[]).length?fund.uses.map(x=>'<tr><td>'+esc(x.use_date)+'</td><td>'+esc(x.note)+'</td><td>'+eu(x.amount)+'</td><td><button type="button" class="hr-delete" data-hr-remove="'+esc(x.id)+'">Elimina</button></td></tr>').join(""):'<tr><td colspan="4">Nessun utilizzo registrato.</td></tr>')+'</tbody></table></div>'+
 '<p class="hr-help">Il fondo è condiviso tra gli utenti autorizzati. Il residuo è calcolato dagli utilizzi dichiarati, non automaticamente dagli scostamenti di categoria.</p>';
 $("hrSetForm").onsubmit=async e=>{e.preventDefault();const a=Number($("hrSetAmount").value);if(!Number.isFinite(a)||a<0){status("hrFundStatus","Importo non valido.",true);return}await write("SET",{p_amount:a},"Fondo salvato.")};
 $("hrUseForm").onsubmit=async e=>{e.preventDefault();const a=Number($("hrAmount").value),date=$("hrDate").value,note=$("hrNote").value.trim();if(!Number.isFinite(a)||a<=0||date.slice(0,4)!==String(year)||note.length<2){status("hrFundStatus","Inserisci data, importo e motivo validi.",true);return}await write("USE",{p_amount:a,p_use_date:date,p_note:note},"Utilizzo registrato.")};
 $("hrFundBody").onclick=async e=>{const b=e.target.closest("[data-hr-remove]");if(!b)return;if(root.confirm("Eliminare questo utilizzo?"))await write("DELETE",{p_use_id:b.dataset.hrRemove},"Utilizzo eliminato.")};
}
async function write(action,args,success){
 status("hrFundStatus","Salvataggio…");$("hrFundBody").querySelectorAll("button").forEach(b=>b.disabled=true);
 try{fund=await fundRPC(action,args);renderFund();inline();status("hrFundStatus",success)}
 catch(e){status("hrFundStatus",e.message||"Errore salvataggio.",true);$("hrFundBody").querySelectorAll("button").forEach(b=>b.disabled=false)}
}
function init(){
 const baselineToolbar=$("analysisOpenBaselineBoard")?.parentElement,boardToolbar=$("planningBoardRefresh")?.parentElement;
 if(!baselineToolbar||!boardToolbar)return;
 function addButton(node,tab,label){const b=doc.createElement("button");b.type="button";b.className="btn ghost compact";b.dataset.hrOpen=tab;b.textContent=label;node.appendChild(b)}
 addButton(baselineToolbar,"health","⚕ Report sanitario");
 addButton(boardToolbar,"health","⚕ Sanità");
 addButton(boardToolbar,"fund","◈ Fondo imprevisti");
 const inlineNode=doc.createElement("div");inlineNode.id="hrFundInline";inlineNode.className="hr-fund-inline hidden";$("planningBaselineReview").before(inlineNode);
 const modal=doc.createElement("div");modal.id="hrDialog";modal.className="hr-overlay hidden";modal.setAttribute("aria-hidden","true");
 modal.innerHTML='<div class="hr-modal" role="dialog" aria-modal="true" aria-labelledby="hrTitle"><div class="hr-head"><h2 id="hrTitle">Pianificazione · approfondimenti</h2><button type="button" data-hr-close aria-label="Chiudi">×</button></div><div class="hr-tabs" role="tablist"><button type="button" data-hr-tab="health">Sanità e assicurazione</button><button type="button" data-hr-tab="fund">Fondo imprevisti</button></div><div class="hr-content"><section id="hrHealth"><p id="hrHealthStatus" role="status"></p><div id="hrHealthBody"></div></section><section id="hrFund" class="hidden"><label class="hr-help">Anno solare <select id="hrYear"></select></label><p id="hrFundStatus" role="status"></p><div id="hrFundBody"></div></section></div></div>';
 doc.body.appendChild(modal);
 $("hrYear").innerHTML=Array.from({length:5},(_,i)=>year-1+i).map(y=>'<option value="'+y+'">'+y+'</option>').join("");
 $("hrYear").value=String(year);$("hrYear").onchange=function(){year=Number(this.value);loadFund()};
 doc.addEventListener("click",function(e){const b=e.target.closest("[data-hr-open]");if(b){open(b.dataset.hrOpen);return}const t=e.target.closest("[data-hr-tab]");if(t){show(t.dataset.hrTab);return}if(e.target.closest("[data-hr-close]")||e.target===modal)close()});
 doc.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.classList.contains("hidden"))close()});
 new MutationObserver(function(){inline();if($("planningBoardView").dataset.boardContext==="PLAN"&&!fund&&!loadLock)loadFund()}).observe($("planningBoardView"),{attributes:true,attributeFilter:["data-board-context"]});
 inline();
}
if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",init);else init();
})(typeof window!=="undefined"?window:globalThis);
