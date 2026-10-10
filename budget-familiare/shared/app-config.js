// Canonical source: massimospazio/budget-familiare; public files are deployed automatically.
(function(){
  const APP_VERSION='V73.11';
  const APP_RELEASE='Mese in corso · piano modificabile, reale a oggi e Scenario coerente';
  window.BudgetFamiliareApp=Object.freeze({version:APP_VERSION,release:APP_RELEASE});
  function apply(){
    document.querySelectorAll('[data-app-version]').forEach(function(el){el.textContent=APP_VERSION});
    document.querySelectorAll('[data-app-release]').forEach(function(el){el.textContent=APP_RELEASE});
  }
  window.applyBudgetFamiliareAppMeta=apply;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);
  else apply();
})();
