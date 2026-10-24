// V73.30.2.0 — Piano versionato read-only: le proiezioni sono acquisite server-side.
(function(root){
"use strict";
const doc=root.document;
const $=id=>doc.getElementById(id);
const eu=n=>Number(n||0).toLocaleString("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0});
const esc=x=>String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function annualTotals(d){
 if(!d)return 0;
 const year=String(d.current_year_start||"").slice(0,4),current=String(d.current_month||"");
 if(!/^\d{4}$/.test(year))return 0;
 const actual=(d.actual_monthly||[]).filter(x=>String(x.month||"").startsWith(year)&&String(x.month)<current);
 const future=(d.forecast_monthly||[]).filter(x=>String(x.month||"").startsWith(year)&&String(x.month)>=current);
 return actual.reduce((s,x)=>s+Number(x.amount||0),0)+future.reduce((s,x)=>s+Number(x.effective_amount||0),0);
}
function surplus(p){return p?annualTotals(p.income)-annualTotals(p.expense):0}
if(typeof module!=="undefined"&&module.exports)module.exports={annualTotals,surplus};
if(!doc)return;
const state={year:null,record:null,versions:[],busy:false,status:"",error:false,seq:0};
function boardYear(){
 try{return Number(String(planningBoardData?.expense?.current_year_start||"").slice(0,4))||new Date().getFullYear()}
 catch(e){return new Date().getFullYear()}
}
function visible(){
 return $("planningBoardView")&&!$("planningBoardView").classList.contains("hidden")&&planningBoardContext==="PLAN";
}
function currentRecord(y){return !state.busy&&state.year===y?state.record:null}
function snapshotFor(y){return planningBoardHorizon==="CALENDAR"&&!root.BudgetFamilySinglePlan?.revisionActive?.() ? currentRecord(y) : null}
function dateHuman(iso){
 if(!iso)return"";
 const d=new Date(iso);return Number.isNaN(+d)?iso:new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
}
function message(m,error){state.status=m||"";state.error=!!error;paint()}
function paint(){
 const el=$("bfApprovedPlanBar");if(!el)return;
 if(root.BudgetFamilySinglePlan?.continuousEnabled?.()){el.classList.add("hidden");return;}
 const display=visible();
 el.classList.toggle("hidden",!display);
 if(!display)return;
 const year=boardYear(),rolling=planningBoardHorizon!=="CALENDAR";
 const p=state.year===year?state.record:null;
 const strategic=p?.meta?.strategic_plan?.kind==="STRATEGIC";
 const versions=state.year===year?state.versions:[];
 const sameYear=year===new Date().getFullYear();
 const live=planningBoardData&&planningBoardData.expense&&planningBoardData.income?planningBoardData:null;
 const info=rolling?'I prossimi 12 mesi sono il Rolling Forecast, non una versione del Piano annuale. Passa ad Anno corrente per vedere il Piano congelato.':
  p?(strategic?'Piano strategico V'+p.revision+' approvato il '+dateHuman(p.approved_at)+'. Target e note conservati nella versione; gli Actual già trascorsi sono congelati.':'Fotografia tecnica V'+p.revision+' nell archivio. Il nuovo Piano si elabora e si approva nel Tabellone, non tramite questa fotografia.'):
    'Nessuna fotografia tecnica salvata per '+year+'. Il tabellone mostra temporaneamente la Baseline corrente.';
 const delta=p&&live&&!rolling?surplus(live)-surplus(p):null;
 const showStatus=state.status?'<p class="bf-plan-status'+(state.error?' error':'')+'" role="status">'+esc(state.status)+'</p>':"";
 el.innerHTML='<div class="bf-plan-head"><div class="bf-plan-heading"><strong>'+ (p&&!rolling?(strategic?'Piano approvato · V':'Fotografia tecnica · V')+p.revision:'Fotografie e Piani · '+year) +'</strong><span>'+esc(info)+'</span></div>'+
 '<div class="bf-plan-actions">'+
 (versions.length?'<label>Versione <select id="bfPlanVersion" '+(state.busy||rolling?'disabled':'')+'>'+versions.map(v=>'<option value="'+v.revision+'" '+(p&&v.revision===p.revision?'selected':'')+'>V'+v.revision+' · '+esc(dateHuman(v.approved_at))+'</option>').join("")+'</select></label>':'')+
 (strategic&&!rolling?root.BudgetFamilySinglePlan?.revisionActive?.()?'<button type="button" id="bfPlanCancelRevision" class="btn ghost compact">Chiudi revisione</button>':'<button type="button" id="bfPlanRevise" class="btn compact" '+(state.busy?'disabled':'')+'>Modifica Piano · nuova revisione</button>':'')+
 '<button type="button" id="bfPlanReload" class="btn ghost compact" '+(state.busy?'disabled':'')+'>↻ Piano</button>'+
 ''+
 '</div></div>'+
 (delta!==null?'<div class="bf-plan-delta">Risultato della fotografia selezionata: <strong>'+eu(surplus(p))+'</strong> · Previsione corrente: <strong>'+eu(surplus(live))+'</strong> · Scostamento: <strong class="'+(delta>=0?'positive':'negative')+'">'+(delta>0?'+':'')+eu(delta)+'</strong></div>':'')+
 (p&&!rolling&&!strategic?'<p class="bf-plan-caveat">Il confronto riguarda il risultato del Tabellone (entrate meno uscite della proiezione), non necessariamente il Flusso economico riconciliato. La fotografia conserva anche gli importi reali dei mesi già trascorsi al momento dell’approvazione. La modifica della Baseline NON altera la fotografia, che non rappresenta ancora il Piano strategico.</p>':'')+
 showStatus;
}
async function load(y,rev){
 if(state.busy)return;
 const seq=++state.seq;state.busy=true;state.year=y;message("Carico le versioni del Piano…");
 try{
   const result=await rpc("dashboard_family_approved_plan_v1",{p_action:"READ",p_year:y,p_revision:rev===undefined?null:rev});
   if(seq!==state.seq)return;
   state.record=result.plan||null;state.versions=Array.isArray(result.versions)?result.versions:[];
   state.status="";state.error=false;
 }catch(e){state.record=null;state.versions=[];state.status=e.message||"Impossibile leggere le fotografie tecniche.";state.error=true}
 finally{state.busy=false;paint();if(visible()&&planningBoardHorizon==="CALENDAR")root.renderPlanningBoard?.()}
}
async function approve(){
 const year=boardYear();
 if(state.busy||planningBoardHorizon!=="CALENDAR"||year!==new Date().getFullYear())return;
 const rev=state.versions.length?Math.max(...state.versions.map(v=>Number(v.revision||0)))+1:1;
 const midyear=Number(String(planningBoardData?.expense?.current_month||"").slice(5,7))>1;
 const explanation=rev===1
 ? 'Questa fotografia tecnica congela la proiezione corrente, NON un Piano strategico validato né il budget originale del 1° gennaio.'+(midyear?' I mesi già chiusi sono consuntivi storici, non obiettivi fissati a gennaio.':'')
 : 'Una nuova revisione viene congelata dalla Baseline corrente, ma non cancella le precedenti. Non è ancora disponibile un editor separato dei target.';
 if(!root.confirm('Salvare fotografia V'+rev+' per '+year+'?\n\n'+explanation+'\n\nLa modifica della Baseline non cambierà questa versione.'))return;
 const reason=root.prompt('Motivo della fotografia V'+rev+' (minimo 8 caratteri)',rev===1?'Prima fotografia tecnica della proiezione annuale':'Nuova fotografia tecnica dopo verifica delle previsioni');
 if(reason===null)return;
 if(reason.trim().length<8||reason.trim().length>600){message('Inserisci una motivazione di 8–600 caratteri.',true);return}
 state.busy=true;message("Salvo fotografia tecnica V"+rev+"…");
 try{
  const r=await rpc("dashboard_family_approved_plan_v1",{p_action:"APPROVE",p_year:year,p_note:reason.trim()});
  state.year=year;state.record=r.plan;state.versions=r.versions||[];
  state.status="Fotografia V"+(r.plan?.revision||rev)+" salvata e congelata; il Piano strategico non è ancora finalizzato.";state.error=false;
 }catch(e){state.status=e.message||"Impossibile salvare la fotografia.";state.error=true}
 finally{state.busy=false;paint();if(visible()&&planningBoardHorizon==="CALENDAR")root.renderPlanningBoard?.()}
}
function onBoardRendered(){
 if(root.BudgetFamilySinglePlan?.continuousEnabled?.()){paint();return}
 paint();
 const y=boardYear();
 if(visible()&&state.year!==y&&!state.busy)load(y);
}
function init(){
 const view=$("planningBoardView");
 if(!view||!$("planningBoardContextNote"))return;
 const bar=doc.createElement("section");
 bar.id="bfApprovedPlanBar";bar.className="bf-approved-plan-bar hidden";
 bar.setAttribute("aria-label","Fotografie tecniche annuali versionate");
 $("planningBoardContextNote").before(bar);
 bar.addEventListener("click",e=>{
  if(e.target.closest("#bfPlanReload"))load(boardYear());
  if(e.target.closest("#bfPlanCancelRevision"))root.BudgetFamilySinglePlan?.cancelRevision?.();
  if(e.target.closest("#bfPlanRevise")){
   if(root.BudgetFamilySinglePlan?.revisionActive?.())return;
   const source=state.record;
   if(source?.meta?.strategic_plan?.kind==="STRATEGIC"){
    if(root.BudgetFamilySinglePlan?.startRevision?.(source))message("Revisione in elaborazione: modifica le categorie, salva la bozza, poi approva una nuova versione.");
   }
  }
 });
 bar.addEventListener("change",e=>{
  if(e.target.id==="bfPlanVersion")load(boardYear(),Number(e.target.value));
 });
 paint();
 if(visible()&&planningBoardData)onBoardRendered();
}
root.BudgetFamilyPlan=Object.freeze({snapshotFor,onBoardRendered,annualTotals,surplus,reload:()=>load(boardYear())});
if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",init);else init();
})(typeof window!=="undefined"?window:globalThis);
