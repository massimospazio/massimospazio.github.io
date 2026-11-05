(function(){
"use strict";
const sb=window.appSupabase;
const ids=['younited4','younited25','ing8','mortgage'];
const romeToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let payments=[],bases=loans.map((x,i)=>({...x,key:ids[i],anchorDate:x.anchorDate||romeToday()}));
const legacyRender=render,legacyEditors=renderEditors;
function scheduleFor(base){
 const items=payments.filter(x=>x.loan_key===base.key).sort((a,b)=>a.transaction_date.localeCompare(b.transaction_date));
 let amount=Number(base.balance||0),used=0;
 const rate=Number(base.rate||0);
 if(amount>0&&rate>0){
  for(const x of items){
   if(x.transaction_date<=base.anchorDate)continue;
   const principal=Math.max(0,Number(x.amount_paid)-amount*rate/1200);
   amount=Math.max(0,amount-principal);used++;
  }
 }
 return {amount,used,payment:items.length?Number(items[items.length-1].amount_paid):Number(base.payment||0),lastDate:items.length?items[items.length-1].transaction_date:null};
}
function updateDerived(){
 loans=bases.map((base,i)=>{
   const p=scheduleFor(base);
   return {...initial[i],...base,balance:p.amount,months:Math.max(0,Number(base.months||0)-p.used),payment:p.payment};
 });
 const available=payments.length;
 document.getElementById('syncStatus').textContent=
 'Rate bancarie lette: '+available+'. Residui ricostruiti solo per rate successive alla data base; per il mutuo variabile il risultato è una stima. '+
 (bases.some(b=>!Number(b.balance)||!Number(b.rate))?'Inserisci saldo ufficiale e TAN una volta per completare i calcoli.':'Dati di partenza disponibili.');
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
render=function(){updateDerived();legacyRender()};
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
  foot.textContent='Base: '+money(Number(b.balance||0))+' al '+b.anchorDate+
   ' · Residuo stimato: '+money(view.amount)+
   ' · '+view.used+' rate successive contabilizzate'+
   (view.lastDate?' · Ultima rata importata: '+view.lastDate:'');
  block.append(foot);
  date.addEventListener('change',()=>{
   if(!date.value||date.value>romeToday())return;
   b.anchorDate=date.value;persistLocal();renderEditors();render();
   saveOne(b).catch(e=>{document.getElementById('syncStatus').textContent='Salvataggio account non riuscito: '+e.message});
  });
  for(const field of block.querySelectorAll('input[data-key]')){
   // Capture before legacy input listener updates the rendered effective loan.
   field.addEventListener('change',()=>{
    const k=field.dataset.key;
    if(k==='payment')return;
    b[k]=k==='name'?field.value:Math.max(0,Number(field.value)||0);
    if(k==='balance')b.anchorDate=romeToday();
    persistLocal();
    saveOne(b).catch(e=>{document.getElementById('syncStatus').textContent='Salvataggio account non riuscito: '+e.message});
   },true);
   if(field.dataset.key==='payment')field.readOnly=true;
  }
 });
};
async function start(){
 try{
  const {data:{session}}=await sb.auth.getSession();
  if(!session){document.getElementById('syncStatus').textContent='Accedi prima a Budget Familiare per sincronizzare rate e profili. Dati locali ancora disponibili.';renderEditors();render();return}
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
  persistLocal();renderEditors();render();
 }catch(e){document.getElementById('syncStatus').textContent='Sincronizzazione non riuscita: '+String(e.message||e);renderEditors();render()}
}
start();
})();