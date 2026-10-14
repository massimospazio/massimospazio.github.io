// Shared online help: presentation only; never changes transactions or forecast settings.
(function(){
  'use strict';
  if(window.BudgetFamiliareHelp)return;
  const topics={
    'loan-coverage':{
      title:'Quota coperta da prestito',
      sections:[
        {heading:'Come viene letto l’acquisto',paragraphs:['Il prestito è liquidità da restituire e resta escluso dalle entrate economiche. Flusso economico e Confronto mostrano la parte della spesa pagata con fondi propri. Il Cash flow conserva l’incasso del prestito e il pagamento integrale.','Esempio: spesa di 1.000 €, copertura del prestito di 600 € → 400 € a carico del budget. Le rate successive continuano a pesare nel budget. Il prezzo dell’acquisto rimane 1.000 €.']},
        {heading:'Temporalità e previsione sono scelte distinte',paragraphs:['La copertura non cambia R/P/E: una spesa P rimane P. Nella versione attuale, salvare una copertura maggiore di zero esclude l’intero movimento dalla base di previsione, anche la parte pagata con fondi propri. Questa parte resta nel consuntivo del Flusso.','La regola è pensata per acquisti una tantum. Un prestito, da solo, non dimostra che la spesa non si ripeterà: verifica l’esclusione in Analisi e usa Ripristina se quel movimento deve contribuire alla previsione.']},
        {heading:'Salvare e modificare',bullets:['Seleziona il prestito ricevuto e l’importo coperto, poi premi Salva copertura.','L’importo deve essere entro il totale della spesa e la quota del prestito ancora utilizzabile. Lo stesso importo non può coprire due spese.','Verifica la previsione delle rate nella loro categoria: collegare la copertura non crea automaticamente un piano rate.','Per rimuovere la copertura seleziona Nessuna copertura e salva 0 €. L’esclusione dal forecast rimane finché non premi Ripristina in Analisi.','Una spesa può collegare un solo prestito. Prima di ripartire un movimento collegato, rimuovi la copertura.']}
      ],related:['forecast-exclusion','temporal','budget-vs-cashflow']
    },
    'forecast-exclusion':{
      title:'Esclusione dalla base di previsione',
      sections:[
        {heading:'Quali movimenti vengono esclusi',bullets:['Eventi E: esclusi dalla base storica ordinaria usata per la previsione.','Esclusione manuale: attivata con Escludi dal forecast sul singolo movimento.','Copertura da prestito: una copertura salvata maggiore di zero attiva l’esclusione dell’intero movimento.','P, da sola, non esclude la spesa dalla base di previsione.']},
        {heading:'Quando usarla',paragraphs:['Escludi un movimento quando non rappresenta il comportamento futuro che vuoi stimare: ad esempio un acquisto una tantum che non si ripeterà. Una spesa elevata o finanziata può invece essere ripetibile; la scelta va verificata.','Il movimento resta registrato. L’esclusione modifica la base di Analisi e i metodi che derivano dallo storico, senza cancellare la spesa dal Cash flow o dal consuntivo del Flusso. Non rimuove importi manuali o override mensili già salvati.']},
        {heading:'Dove controllarla e ripristinarla',steps:['Dove siamo → Analisi & Baseline → Spese.','Apri la categoria L2 e scegli Storico. Clicca il mese sul grafico per aprire i movimenti.','Nella colonna Previsione trovi Escluso forecast e Ripristina, oppure Escludi dal forecast.','Per un movimento E, cambia la temporalità nei dettagli del movimento se la classificazione E è sbagliata.']}
      ],related:['forecast-baseline','temporal','loan-coverage']
    },
    'forecast-baseline':{
      title:'Dove si costruisce la previsione',
      sections:[
        {heading:'La previsione automatica è la Baseline',paragraphs:['È il valore calcolato dalla regola scelta per la categoria L2 o per le sue controparti: Media 6/12 mesi, Mediana 12 mesi, Stesso mese A-1 o Ultimo valore. La stessa Baseline è usata da Proiezione e Tabellone.','Importo manuale, Intervallo e modifiche ai singoli mesi sono assunzioni esplicite. La Baseline descrive ciò che prevedi accadrà; gli obiettivi di riduzione appartengono alla strategia e al piano.','Non si ripeterà azzera la previsione della categoria o controparte selezionata. Per escludere soltanto un acquisto, usa invece Escludi dal forecast sul singolo movimento.']},
        {heading:'Dove trovarla',steps:['Dove siamo → Analisi & Baseline → Spese o Entrate.','Espandi una macro-categoria L1 e seleziona una categoria L2.','Nel dettaglio apri il pannello Previsione: scegli metodo, cadenza e variazione; premi Salva previsione.','Proiezione mostra storico e futuro. Il Tabellone riusa la stessa previsione per il riepilogo e le correzioni mensili.']},
        {heading:'Prima di interpretare il risultato',bullets:['Controlla quali movimenti compongono la base storica: E ed esclusioni dal forecast possono cambiarla.','Una spesa P può contribuire allo storico, ma non deve essere riproposta se è un evento che non prevedi di ripetere.','Nel dettaglio mensile Reale indica i movimenti registrati; Base forecast indica la parte usata per stimare il futuro.']}
      ],related:['forecast-exclusion','temporal']
    },
    'temporal':{
      title:'Temporalità R / P / E / X',
      sections:[
        {heading:'Come scegliere',bullets:['R · Ricorrente: fa parte del funzionamento abituale, anche se annuale o stagionale.','P · Occasionale / programmabile: spesa non ricorrente che appartiene al normale budget, ad esempio una vacanza programmata.','E · Eccezionale: evento da separare dall’andamento ordinario. Può essere stato previsto: eccezionale non significa necessariamente imprevisto.','X · Non applicabile: R/P non descrivono correttamente la voce; X non significa esclusa dal bilancio.']},
        {heading:'Default e singolo movimento',paragraphs:['Il movimento usa la temporalità predefinita della categoria, salvo un override. E si assegna al singolo movimento, non come default della categoria. Nel dettaglio, M segnala un mix di temporalità nel periodo.','Ordinario esclude gli eventi E; Totale li comprende nel consuntivo. La copertura da prestito è indipendente dalla temporalità. P, da sola, non esclude dalla previsione: per un evento non ripetibile usa l’esclusione dal forecast.']}
      ],related:['perimeter','forecast-exclusion','loan-coverage']
    },
    'budget-surplus':{
      title:'Margine strutturale e avanzo',
      sections:[
        {heading:'Due domande diverse',bullets:['Margine strutturale = entrate economiche − Obbligatorie − Necessarie − NC. È il margine prima delle Discrezionali e delle allocazioni di risparmio.','Avanzo ordinario = quanto resta dopo le spese del budget, le rate e il risparmio pianificato, escludendo gli eventi E.','Nel perimetro Totale il risultato comprende anche gli eventi E e si chiama Avanzo complessivo.']},
        {heading:'Come leggere i finanziamenti',paragraphs:['Il prestito non aumenta le entrate economiche. Una spesa con copertura collegata pesa sul Flusso per i soli fondi propri; le rate successive restano nel budget. Il dettaglio conserva totale, finanziati e fondi propri.','L’avanzo è un risultato della gestione del periodo. Per decidere quanto puoi spendere considera anche saldo dei conti, impegni futuri e fondi già destinati ad altri obiettivi. Non coincide con la liquidità del conto.']}
      ],related:['budget-vs-cashflow','perimeter','investment-funding']
    },
    'budget-vs-cashflow':{
      title:'Flusso del budget e Cash flow',
      sections:[
        {heading:'Flusso economico / Confronto',paragraphs:['Mostrano come il reddito viene assorbito dal budget. Prestiti ricevuti esclusi dalle entrate; acquisti al netto delle quote finanziate esplicitamente collegate. Gli importi completi si leggono nel dettaglio.']},
        {heading:'Cash flow',paragraphs:['Mostra incassi e pagamenti integrali: il prestito in entrata, l’acquisto in uscita e le rate quando vengono pagate. I giroconti interni sono esclusi per evitare duplicazioni. Con Ordinario anche questa vista esclude gli eventi E; scegli Totale per comprenderli.','Il saldo del periodo è la differenza fra incassi e pagamenti. Il cumulato parte da zero nel periodo selezionato e non è il saldo dei conti. Se prestito e acquisto avvengono in mesi diversi, la lettura mensile del budget e del Cash flow può differire.']}
      ],related:['loan-coverage','budget-surplus','perimeter']
    },
    'perimeter':{
      title:'Ordinario o Totale?',
      sections:[
        {heading:'Cosa cambia con il filtro',bullets:['Ordinario: analizza la gestione R/P/X, separando gli eventi E.','Totale incl. eccezionali: comprende anche E nel consuntivo del periodo.','L’esclusione dal forecast è una scelta separata: un movimento P escluso dal forecast continua a pesare nel consuntivo ordinario.']},
        {heading:'Cosa resta distinto',paragraphs:['Flusso e Confronto escludono i prestiti dal reddito e usano i fondi propri degli acquisti coperti, in entrambi i perimetri. Il Cash flow conserva gli importi integrali per i movimenti inclusi dal filtro.','Totale non reinserisce automaticamente E nella base della previsione. Per la previsione controlla i metodi e le esclusioni in Analisi & Baseline.']}
      ],related:['temporal','forecast-exclusion','budget-vs-cashflow']
    },
    'flow-period-comparison':{
      title:'Flusso economico: periodi, confronto e quote',
      sections:[
        {heading:'Periodo singolo e confronto',paragraphs:['Scegli Un periodo per una sola cascata, oppure Confronto A/B per due cascate affiancate con identica scala verticale. I periodi A e B sono indipendenti e possono rappresentare anni solari distinti.','Ultimi 12 e ultimi 24 mesi usano soltanto mesi chiusi. Nell’anno corrente sono considerati gennaio–ultimo mese concluso; se uno storico non è completamente disponibile viene segnalata la copertura. I confronti fra periodi di durata diversa o con stagionalità diversa richiedono cautela.']},
        {heading:'Totale o Media mensile',paragraphs:['Totale mostra la somma dei valori del periodo selezionato. Media mensile divide ogni voce per il numero di mesi completi selezionati. Per confrontare durate diverse è generalmente più leggibile la media mensile, pur senza eliminare gli effetti stagionali.','I drill-down mostrano sempre movimenti e importi effettivi dell’intero periodo cliccato: non si dividono gli importi dei singoli movimenti per il numero di mesi.']},
        {heading:'Scala logica delle percentuali',paragraphs:['Con € + %: obbligatorie (O), necessarie (N), NC e margine strutturale sono percentuali delle entrate; discrezionali (D), risparmio e avanzo sono percentuali del margine strutturale. Nel tooltip di D/Risparmio/Avanzo è disponibile anche la quota sulle entrate.','Le percentuali non cambiano passando dai totali alle medie mensili dello stesso periodo. Le NC (prelievi in contanti e voci da classificare) restano incluse nel bilancio. Gli eventi E sono mostrati come passaggio aggiuntivo nel perimetro Totale.']},
        {heading:'Esplora i dettagli',paragraphs:['Clicca Entrate, O, N, NC, D, Risparmio o Altre operative nella cascata A o B: si apre un unico pannello per L1 → L2 → controparti → movimenti, riferito esclusivamente al periodo cliccato. Il dettaglio usa i valori di consuntivo, non la media mensile.','La sezione separata Confronto periodi rimane temporaneamente disponibile per confrontare i risultati prima del consolidamento definitivo delle viste.']}
      ],related:['comparison-bridge','budget-surplus','loan-coverage','perimeter']
    },
    'comparison-bridge':{
      title:'Confronto periodi: variazione dell’avanzo',
      sections:[
        {heading:'Riconciliare A e B',paragraphs:['I contributi al Δ Avanzo sono Δ entrate meno Δ obbligatorie, necessarie, NC, discrezionali, altre uscite operative e risparmio. La somma deve corrispondere alla variazione dell’avanzo.','Un contributo positivo del risparmio può significare che hai risparmiato meno: migliora il risultato contabile ma non è necessariamente un buon comportamento. La classificazione O/N/D serve per distinguere spese rigide, necessarie e comprimibili.']},
        {heading:'NC incluse nel confronto',paragraphs:['NC comprende Prelievo contanti e Da classificare: pesano sia sul margine strutturale sia sull’avanzo. Il riepilogo le separa per evidenziare quanto resta da descrivere.','I prelievi sono una proxy delle spese in contanti: possono essere consumati in periodi successivi. Se registri un acquisto in contanti, evita di conteggiarlo anche come nuovo esborso senza compensare il prelievo.']},
        {heading:'Solidità e segnalazioni',paragraphs:['Il periodo più solido ha sia avanzo sia risparmio migliori; quando le due misure divergono l’esito è misto. Non è un giudizio assoluto di virtuosità.','Il segno ! compare solo per variazioni estreme, non per qualunque percentuale elevata. La natura selezionata filtra solo i contributori, non KPI e riconciliazione. Il confronto non modifica le transazioni o la previsione.']}
      ],related:['budget-surplus','budget-vs-cashflow','perimeter']
    },
    'investment-funding':{
      title:'Origine fondi dell’investimento',
      sections:[
        {heading:'Investimenti P: quale denaro stai usando?',bullets:['Surplus / liquidità corrente: l’investimento utilizza risorse prodotte dalla gestione del periodo e riduce l’avanzo ordinario. È il default prudenziale.','Patrimonio pregresso / disinvestimento: rialloca denaro già accumulato e resta fuori dal flusso corrente, pur essendo presente nel Cash flow.']},
        {heading:'Da ricordare',paragraphs:['Questa scelta descrive la provenienza dei fondi di un investimento occasionale. Per un acquisto coperto da un prestito usa invece Quota coperta da prestito nei dettagli della spesa. Un PAC ricorrente continua a pesare nelle allocazioni di risparmio.']}
      ],related:['budget-surplus','loan-coverage','budget-vs-cashflow']
    }
  };
  const selector='[data-context-help],.help[data-tip],.info-tip[title],.category-info-tip[title],.balance-temporal-badge[title]';
  function getTopic(key){return Object.prototype.hasOwnProperty.call(topics,key)?topics[key]:null}
  let dialog,title,content,closeButton,opener;
  function element(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el}
  function ensureDialog(){
    if(dialog)return;
    const style=element('style');style.textContent=`
      .context-help-trigger{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;min-width:30px;margin-left:5px;padding:0;border:1px solid #b8cee9;border-radius:50%;background:#eef5ff;color:#245791;font:700 16px/1 "Segoe UI",system-ui,sans-serif;vertical-align:middle;cursor:pointer}
      .context-help-trigger:hover{background:#dcecff}.context-help-trigger:focus-visible,.help[data-tip]:focus-visible,.info-tip[title]:focus-visible,.category-info-tip[title]:focus-visible,.balance-temporal-badge[title]:focus-visible,.budget-help-dialog button:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
      .help[data-tip],.info-tip[title],.category-info-tip[title],.balance-temporal-badge[title]{min-width:24px;min-height:24px;cursor:pointer}
      .context-help-chart-tools{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      .budget-help-dialog{box-sizing:border-box;width:min(640px,calc(100vw - 28px));max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);padding:0;border:1px solid #cbd9ec;border-radius:16px;background:#fff;color:#17263e;box-shadow:0 22px 70px rgba(15,35,70,.28);font:400 16px/1.6 "Segoe UI",system-ui,-apple-system,sans-serif;overflow:auto;overscroll-behavior:contain}
      .budget-help-dialog::backdrop{background:rgba(15,30,55,.5)}
      .budget-help-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 22px;background:#15365d;color:#fff}
      .budget-help-head h2{margin:0;font-size:21px;line-height:1.35;font-weight:700;color:#fff}.budget-help-close{flex:none;padding:8px 12px;border:1px solid #b8cee9;border-radius:8px;background:#fff;color:#17375b;font:600 14px "Segoe UI",system-ui,sans-serif;cursor:pointer}
      .budget-help-body{padding:4px 22px 20px}.budget-help-body section{margin-top:20px}.budget-help-body h3{margin:0 0 8px;font-size:17px;line-height:1.45;color:#214d80}.budget-help-body p{margin:8px 0}.budget-help-body ul,.budget-help-body ol{margin:8px 0;padding-left:22px}.budget-help-body li+li{margin-top:8px}
      .budget-help-current-context{margin-top:16px!important;padding:10px 12px;border:1px solid #c9dcf4;border-radius:9px;background:#f0f6ff;color:#214d80}
      .budget-help-related-wrap{margin-top:20px;padding-top:16px;border-top:1px solid #dce4ee}.budget-help-related-label{margin:0 0 8px;font-size:14px;color:#58677d}.budget-help-related-list{display:flex;gap:8px;flex-wrap:wrap}.budget-help-related{padding:7px 10px;border:1px solid #c7d9ee;border-radius:8px;background:#f0f6ff;color:#245791;font:600 14px/1.5 "Segoe UI",system-ui,sans-serif;text-align:left;cursor:pointer}
      html.budget-help-open{overflow:hidden}@media(max-width:480px){.budget-help-head{padding:15px;gap:10px}.budget-help-head h2{font-size:19px}.budget-help-body{padding:2px 15px 16px}}
    `;document.head.appendChild(style);
    dialog=element('dialog',undefined,'budget-help-dialog');dialog.id='budgetContextHelpDialog';dialog.setAttribute('aria-labelledby','budgetContextHelpTitle');
    const head=element('div',undefined,'budget-help-head');title=element('h2');title.id='budgetContextHelpTitle';
    closeButton=element('button','Chiudi','budget-help-close');closeButton.type='button';closeButton.autofocus=true;closeButton.setAttribute('aria-label','Chiudi l’aiuto');closeButton.addEventListener('click',()=>dialog.close());
    head.append(title,closeButton);content=element('div',undefined,'budget-help-body');dialog.append(head,content);document.body.appendChild(dialog);
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
    dialog.addEventListener('close',()=>{document.documentElement.classList.remove('budget-help-open');if(opener&&opener.isConnected)opener.focus()});
  }
  function decorate(root){
    if(!root||root.nodeType!==1)return;
    const nodes=Array.from(root.querySelectorAll(selector));if(root.matches(selector))nodes.unshift(root);
    nodes.forEach(el=>{
      if(el.matches('.balance-temporal-badge[title]'))el.dataset.contextHelp='temporal';
      if(el.tagName!=='BUTTON'){el.setAttribute('role','button');el.tabIndex=0;}
      el.setAttribute('aria-haspopup','dialog');el.setAttribute('aria-controls','budgetContextHelpDialog');
      if(!el.hasAttribute('aria-label')){
        const topic=getTopic(el.dataset.contextHelp);
        const context=el.closest('label,th,.label');const label=topic?topic.title:context?context.textContent.replace(/[?i]\s*$/,'').trim().slice(0,90):'spiegazione';
        el.setAttribute('aria-label','Aiuto: '+label);
      }
    });
  }
  function open(trigger){
    const key=trigger.dataset.contextHelp,topic=getTopic(key);
    const fallback=trigger.dataset.tip||trigger.getAttribute('title');if(!topic&&!fallback)return;
    ensureDialog();if(!dialog.open)opener=trigger;
    title.textContent=topic?topic.title:'Informazioni';content.replaceChildren();
    if(trigger.matches('.balance-temporal-badge[title]'))content.appendChild(element('p',trigger.closest('.balance-temporal-summary-item')?.getAttribute('title')||trigger.getAttribute('title'),'budget-help-current-context'));
    const sections=topic?topic.sections:[{paragraphs:[fallback]}];
    sections.forEach(part=>{
      const section=element('section');if(part.heading)section.appendChild(element('h3',part.heading));
      (part.paragraphs||[]).forEach(text=>section.appendChild(element('p',text)));
      ['bullets','steps'].forEach(kind=>{if(part[kind]){const list=element(kind==='steps'?'ol':'ul');part[kind].forEach(text=>list.appendChild(element('li',text)));section.appendChild(list)}});
      content.appendChild(section);
    });
    if(topic&&topic.related){
      const wrap=element('div',undefined,'budget-help-related-wrap');wrap.appendChild(element('p','Vedi anche','budget-help-related-label'));const list=element('div',undefined,'budget-help-related-list');
      topic.related.forEach(key=>{const button=element('button',topics[key].title,'budget-help-related');button.type='button';button.dataset.contextHelp=key;list.appendChild(button)});wrap.appendChild(list);content.appendChild(wrap);
    }
    decorate(content);if(!dialog.open)dialog.showModal();content.scrollTop=0;dialog.scrollTop=0;document.documentElement.classList.add('budget-help-open');closeButton.focus();
  }
  function onActivate(event){
    if(event.type==='keydown'&&event.key!=='Enter'&&event.key!==' ')return;
    const trigger=event.target.closest&&event.target.closest(selector);if(!trigger)return;
    event.preventDefault();event.stopPropagation();open(trigger);
  }
  function init(){
    ensureDialog();decorate(document.body);
    document.addEventListener('click',onActivate,true);document.addEventListener('keydown',onActivate,true);
    const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(decorate)));observer.observe(document.body,{childList:true,subtree:true});
  }
  window.BudgetFamiliareHelp=Object.freeze({topics:Object.keys(topics)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
