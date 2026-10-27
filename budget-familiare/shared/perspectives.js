/* V74.3.1: one selector, the existing screens. No alternative reporting interface. */
(function(root){
"use strict";
const STORAGE="bf-perspective-v1";
const MODES={MASSIMO:"Massimo",LUISA:"Luisa",FAMILY:"Famiglia"};
function stored(){
 try{const value=root.localStorage?.getItem(STORAGE);return Object.hasOwn(MODES,value)?value:"MASSIMO"}catch(_){return "MASSIMO"}
}
function mount({app,area="reporting",onChange}={}){
 if(!app)return stored();
 if(app.querySelector("[data-bf-perspective-header]"))return stored();
 const top=app.querySelector(".top");if(!top)return stored();
 const bar=root.document.createElement("div");
 bar.className="bf-sp-bar";bar.setAttribute("data-bf-perspective-header","");
 bar.setAttribute("role","group");bar.setAttribute("aria-label","Prospettiva finanziaria");
 const current=stored();
 bar.innerHTML='<div class="bf-sp-label"><small>MODALITÀ DI ANALISI</small><strong>'+MODES[current]+'</strong></div>'+
  '<div class="bf-sp-switch">'+Object.entries(MODES).map(([code,name])=>
   '<button type="button" data-sp-mode="'+code+'" class="'+(current===code?"active":"")+'" aria-pressed="'+(code===current)+'">'+name+'</button>').join("")+'</div>'+
  '<span class="bf-sp-context">'+(area==="management"?
   'Panoramica filtrata per modalità. Import, movimenti da verificare, regole e anagrafiche operano su tutti i conti.':
   current==="MASSIMO"?'Analisi e Piano storico Massimo':'Analisi storica · Piano e Controllo non ancora disponibili per '+MODES[current])+'</span>';
 top.insertAdjacentElement("afterend",bar);
 bar.addEventListener("click",e=>{
  const target=e.target.closest?.("[data-sp-mode]");if(!target)return;
  const value=target.getAttribute("data-sp-mode");
  if(!Object.hasOwn(MODES,value)||value===stored())return;
  try{root.localStorage?.setItem(STORAGE,value)}catch(_){}
  if(typeof onChange==="function")onChange(value);
  else root.location?.reload?.();
 });
 root.addEventListener?.("storage",e=>{if(e.key===STORAGE&&e.newValue!==null&&Object.hasOwn(MODES,e.newValue))root.location?.reload?.()});
 return current;
}
root.BudgetFamilyPerspectives={mount,current:stored,labels:MODES};
if(typeof module!=="undefined"&&module.exports)module.exports={mount,current:stored,labels:MODES};
})(typeof window!=="undefined"?window:globalThis);