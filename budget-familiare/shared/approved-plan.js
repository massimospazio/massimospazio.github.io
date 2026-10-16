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
function snapshotFor(y){return planningBoardHorizon==="CALENDAR" ? currentRecord(y) : null}
function dateHuman(iso){
 if(!iso)return"";
 const d=new Date(iso);return Number.isNaN(+d)?iso:new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
}
function message(m,error){state.status=m||"";state.error=!!error;paint()}
function paint(){
 const el=$("bfApprovedPlanBar");if(!el)return;
 const display=visible();
 el.classList.toggle("hidden",!display);
 if(!display)return;
 const year=boardYear(),rolling=planningBoardHorizon!=="CALENDAR";
 const p=state.year===year?state.record:null;
 const versions=state.year===year?state.versions:[];
 const sameYear=year===new Date().getFullYear();
 const live=planningBoardData&&planningBoardData.expense&&planningBoardData.income?planningBoardData:null;
 const info=rolling?'I prossimi 12 mesi sono il Rolling Forecast, non una versione del Piano annuale. Passa ad Anno corrente per vedere il Piano congelato.':
  p?'Piano V'+p.revision+' approvato il '+dateHuman(p.approved_at)+'. Snapshot immutabile; i mesi chiusi a quella data erano già Actual.':
    'Nessun Piano ufficiale approvato per '+year+'. Il tabellone mostra temporaneamente la Baseline corrente.';
 const delta=p&&live&&!rolling?surplus(live)-surplus(p):null;
 const showStatus=state.status?'<p class="bf-plan-status'+(state.error?' error':'')+'" role="status">'+esc(state.status)+'</p>':"";
 el.innerHTML='<div class="bf-plan-head"><div class="bf-plan-heading"><strong>'+ (p&&!rolling?'Piano approvato · V'+p.revision:'Piano annuale · '+year) +'</strong><span>'+esc(info)+'</span></div>'+
 '<div class="bf-plan-actions">'+
 (versions.length?'<label>Versione <select id="bfPlanVersion" '+(state.busy||rolling?'disabled':'')+'>'+versions.map(v=>'<option value="'+v.revision+'" '+(p&&v.revision===p.revision?'selected':'')+'>V'+v.revision+' · '+esc(dateHuman(v.approved_at))+'</option>').join("")+'</select></label>':'')+
 '<button type="button" id="bfPlanReload" class="btn ghost compact" '+(state.busy?'disabled':'')+'>↻ Piano</button>'+
 (!rolling&&sameYear?'<button type="button" id="bfPlanApprove" class="btn compact" '+(state.busy?'disabled':'')+'>'+(versions.length?'Approva una revisione':'Approva Piano V1')+'</button>':'')+
 '</div></div>'+
 (delta!==null?'<div class="bf-plan-delta">Risultato del Piano selezionato: <strong>'+eu(surplus(p))+'</strong> · Previsione corrente: <strong>'+eu(surplus(live))+'</strong> · Scostamento: <strong class="'+(delta>=0?'positive':'negative')+'">'+(delta>0?'+':'')+eu(delta)+'</strong></div>':'')+
 (p&&!rolling?'<p class="bf-plan-caveat">Il confronto riguarda il risultato del Tabellone (entrate meno uscite della proiezione), non necessariamente il Flusso economico riconciliato. La fotografia conserva anche gli importi reali dei mesi già trascorsi al momento dell’approvazione. La modifica della Baseline NON altera questo Piano.</p>':'')+
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
 }catch(e){state.record=null;state.versions=[];state.status=e.message||"Impossibile leggere il Piano approvato.";state.error=true}
 finally{state.busy=false;paint();if(visible()&&planningBoardHorizon==="CALENDAR")root.renderPlanningBoard?.()}
}
async function approve(){
 const year=boardYear();
 if(state.busy||planningBoardHorizon!=="CALENDAR"||year!==new Date().getFullYear())return;
 const rev=state.versions.length?Math.max(...state.versions.map(v=>Number(v.revision||0)))+1:1;
 const midyear=Number(String(planningBoardData?.expense?.current_month||"").slice(5,7))>1;
 const explanation=rev===1
 ? 'Questa approvazione congela l’intera proiezione corrente, NON il budget originale del 1° gennaio.'+(midyear?' I mesi già chiusi sono consuntivi storici, non obiettivi fissati a gennaio.':'')
 : 'Una nuova revisione viene congelata dalla Baseline corrente, ma non cancella le precedenti. Non è ancora disponibile un editor separato dei target.';
 if(!root.confirm('Approvare Piano V'+rev+' per '+year+'?\n\n'+explanation+'\n\nLa modifica della Baseline non cambierà questa versione.'))return;
 const reason=root.prompt('Motivazione per il Piano V'+rev+' (minimo 8 caratteri)',rev===1?'Prima approvazione della proiezione annuale':'Revisione del Piano dopo verifica delle previsioni');
 if(reason===null)return;
 if(reason.trim().length<8||reason.trim().length>600){message('Inserisci una motivazione di 8–600 caratteri.',true);return}
 state.busy=true;message("Salvo la fotografia server del Piano V"+rev+"…");
 try{
  const r=await rpc("dashboard_family_approved_plan_v1",{p_action:"APPROVE",p_year:year,p_note:reason.trim()});
  state.year=year;state.record=r.plan;state.versions=r.versions||[];
  state.status="Piano V"+(r.plan?.revision||rev)+" approvato e congelato.";state.error=false;
 }catch(e){state.status=e.message||"Impossibile approvare il Piano.";state.error=true}
 finally{state.busy=false;paint();if(visible()&&planningBoardHorizon==="CALENDAR")root.renderPlanningBoard?.()}
}
function onBoardRendered(){
 paint();
 const y=boardYear();
 if(visible()&&state.year!==y&&!state.busy)load(y);
}
function init(){
 const view=$("planningBoardView");
 if(!view||!$("planningBoardContextNote"))return;
 const bar=doc.createElement("section");
 bar.id="bfApprovedPlanBar";bar.className="bf-approved-plan-bar hidden";
 bar.setAttribute("aria-label","Piano annuale approvato e versioni");
 $("planningBoardContextNote").before(bar);
 bar.addEventListener("click",e=>{
  if(e.target.closest("#bfPlanApprove"))approve();
  else if(e.target.closest("#bfPlanReload"))load(boardYear());
 });
 bar.addEventListener("change",e=>{
  if(e.target.id==="bfPlanVersion")load(boardYear(),Number(e.target.value));
 });
 paint();
 if(visible()&&planningBoardData)onBoardRendered();
}
root.BudgetFamilyPlan=Object.freeze({snapshotFor,onBoardRendered,annualTotals,surplus});
if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",init);else init();
})(typeof window!=="undefined"?window:globalThis);
