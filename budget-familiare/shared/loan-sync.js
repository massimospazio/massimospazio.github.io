(function(){
"use strict";
const sb=window.appSupabase;
const ids=['younited4','younited25','ing8','mortgage'];
const romeToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let payments=[],bases=loans.map((x,i)=>({...x,key:ids[i],anchorDate:x.anchorDate||romeToday()}));
const legacyRender=render,legacyEditors=renderEditors;
function scheduleFor(base){
 const items=payments.filter(x=>x.loan_key===base.key).sort((a,b)=>a.transaction_date.localeCompare(b.transaction_date));
 const today=romeToday();
 const lastDate=items.length?items[items.length-1].transaction_date:null;
 const latestPayment=items.length?Number(items[items.length-1].amount_paid):Number(base.payment||0);
 let amount=Math.max(0,Number(base.balance||0)),used=0,projected=0;
 const rate=Number(base.rate||0);
 if(amount>0&&rate>0&&base.anchorDate&&latestPayment>0){
  const monthsWithBank=new Map(items.filter(x=>x.transaction_date>base.anchorDate)
    .map(x=>[x.transaction_date.slice(0,7),Number(x.amount_paid)]));
  // Scheduled calendar day is inferred from the most recently observed bank debit.
  // Projections are explicitly not confirmations of payment.
  const anchor=new Date(base.anchorDate+'T12:00:00Z');
  const todayParts=today.split('-').map(Number),endMonth=todayParts[0]*12+todayParts[1]-1;
  let cursor=anchor.getUTCFullYear()*12+anchor.getUTCMonth();
  const dueDay=lastDate?Number(lastDate.slice(8,10)):1;
  for(;cursor<=endMonth&&used+projected<Math.max(0,Number(base.months||0));cursor++){
   const year=Math.floor(cursor/12),month=cursor%12+1;
   const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
   const day=String(Math.min(dueDay,lastDay)).padStart(2,'0');
   const due=year+'-'+String(month).padStart(2,'0')+'-'+day;
   const monthKey=due.slice(0,7);
   const actual=monthsWithBank.get(monthKey);
   if(actual===undefined&&(due<=base.anchorDate||due>today))continue;
   const pay=actual??latestPayment;
   const interest=amount*rate/1200;
   amount=Math.max(0,amount-Math.max(0,pay-interest));
   if(actual!==undefined)used++;else projected++;
   if(amount<.005)break;
  }
 }
 return {amount,used,projected,payment:latestPayment,lastDate};
}
function updateDerived(){
 loans=bases.map((base,i)=>{
   const p=scheduleFor(base);
   return {...initial[i],...base,balance:p.amount,months:Math.max(0,Number(base.months||0)-p.used-p.projected),payment:p.payment};
 });
 const available=payments.length;
 document.getElementById('syncStatus').textContent=
 'Rate bancarie lette: '+available+'. Residui stimati dalla data base: rate importate e, dove il TAN è noto, rate teoriche scadute ma non ancora registrate. Le rate teoriche non sono conferme di pagamento; il mutuo variabile è sempre indicativo. '+
 (bases.some(b=>!Number(b.balance)||!Number(b.rate))?'Completa i TAN mancanti e verifica i saldi precedenti: le simulazioni restano indicative.':'Dati di partenza disponibili.')+
 (bases.some(b=>b.isEstimated)?' Le basi precaricate dalla precedente simulazione sono STIME, non saldi ufficiali.':'');
}
async function saveOne(base){
 const {data:{session}}=await sb.auth.getSession();
 if(!session)return;
 const {error}=await sb.rpc('dashboard_loan_profile_upsert_v1',{
  p_key:base.key,p_name:String(base.name),p_balance:Number(base.balance),
  p_anchor_date:base.anchorDate,p_rate:Number(base.rate),
  p_months:Math.round(Number(base.months)),p_min:Number(base.min),p_close:Math.round(Number(base.close))
 });
 if(error)throw error;
}
function persistLocal(){localStorage.setItem(key,JSON.stringify(bases))}
render=function(){updateDerived();legacyRender();if(bases.some(b=>b.isEstimated||!Number(b.rate))){document.getElementById('status').textContent+=' Attenzione: stime precedenti e/o TAN mancanti. Non usare il risultato per disporre estinzioni senza verifica bancaria.';}};
renderEditors=function(){
 legacyEditors();
 const root=document.getElementById('editors');
 root.querySelectorAll('.loanedit').forEach((block,i)=>{
  const b=bases[i],view=scheduleFor(b);
  const dateBox=document.createElement('div');
  const label=document.createElement('label');label.textContent='Data residuo ufficiale';
  const date=document.createElement('input');date.type='date';date.max=romeToday();date.value=b.anchorDate;
  dateBox.append(label,date);block.append(dateBox);
  const foot=document.createElement('p');foot.className='muted';foot.style.gridColumn='1/-1';foot.style.margin='0';
  foot.textContent=(b.isEstimated?'⚠️ STIMA PRECARICATA DA VERIFICARE · ':'Saldo di partenza salvato · ')+ 'Base: '+money(Number(b.balance||0))+' al '+b.anchorDate+
   ' · Residuo stimato: '+money(view.amount)+
   ' · '+view.used+' rate successive contabilizzate · '+view.projected+' rate teoriche non ancora riscontrate'+
   (view.lastDate?' · Ultima rata importata: '+view.lastDate:'')+
 (Number(b.rate)===0?' · TAN mancante: nessuna riduzione automatica del residuo finché non viene inserito':'');
  block.append(foot);
  date.addEventListener('change',()=>{
   if(!date.value||date.value>romeToday())return;
   b.anchorDate=date.value;persistLocal();render();renderEditors();
   saveOne(b).catch(e=>{document.getElementById('syncStatus').textContent='Salvataggio account non riuscito: '+e.message});
  });
  for(const field of block.querySelectorAll('input[data-key]')){
   // Capture before legacy input listener updates the rendered effective loan.
   field.addEventListener('change',(event)=>{
    event.stopImmediatePropagation();
    const k=field.dataset.key;
    if(k==='payment')return;
    b[k]=k==='name'?field.value:Math.max(0,Number(field.value)||0);
    if(k==='balance'){b.anchorDate=romeToday();b.isEstimated=false;}
    persistLocal();render();renderEditors();
    saveOne(b).catch(e=>{document.getElementById('syncStatus').textContent='Salvataggio account non riuscito: '+e.message});
   },true);
   if(field.dataset.key==='payment')field.readOnly=true;
  }
 });
};
async function start(){
 try{
  const {data:{session}}=await sb.auth.getSession();
  if(!session){document.getElementById('syncStatus').textContent='Accedi prima a Budget Familiare per sincronizzare rate e profili. Dati locali ancora disponibili.';render();renderEditors();return}
  const [r1,r2]=await Promise.all([sb.rpc('dashboard_loan_installments_v1'),sb.rpc('dashboard_loan_profiles_read_v1')]);
  if(r1.error)throw r1.error;if(r2.error)throw r2.error;
  payments=Array.isArray(r1.data)?r1.data:[];
  const remote=Array.isArray(r2.data)?r2.data:[];
  if(remote.length){
   bases=bases.map(b=>{const d=remote.find(x=>x.key===b.key);return d?{...b,...d,anchorDate:d.anchorDate}:b});
  }else{
   // Transfer existing browser-only profiles to the authenticated user's private account.
   for(const b of bases.filter(x=>Number(x.balance)>0&&Number(x.rate)>0))await saveOne(b);
  }
  persistLocal();render();renderEditors();
 }catch(e){document.getElementById('syncStatus').textContent='Sincronizzazione non riuscita: '+String(e.message||e);render();renderEditors()}
}
const reset=document.getElementById('reset');
reset.textContent='Ricarica dati salvati';
reset.addEventListener('click',event=>{
 event.stopImmediatePropagation();event.preventDefault();window.location.reload();
},true);
start();
})();