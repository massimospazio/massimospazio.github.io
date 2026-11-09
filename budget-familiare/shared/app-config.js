// Canonical source: massimospazio/budget-familiare; public files are deployed automatically.
(function(){
  const APP_VERSION='V74.3.47';
  const APP_RELEASE='Anagrafica scontrini: conversione sicura tipo e categoria';
  window.BudgetFamiliareApp=Object.freeze({version:APP_VERSION,release:APP_RELEASE});
  function apply(){
    document.querySelectorAll('[data-app-version]').forEach(function(el){el.textContent=APP_VERSION});
    document.querySelectorAll('[data-app-release]').forEach(function(el){el.textContent=APP_RELEASE});
  }
  window.applyBudgetFamiliareAppMeta=apply;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);
  else apply();
})();



