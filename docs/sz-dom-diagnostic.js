// Paste into authenticated SZ DevTools. Read-only DOM inspection; no network/storage.
// Raw IDs stay only in this closure and are never returned, logged or hashed for export.
window.atendeaiSZDiagnostic = (() => {
  const history = new Map();
  let previousNodes = new WeakMap();
  const stateAttributes = ["aria-selected", "aria-current", "aria-checked", "data-selected", "data-active", "data-state", "tabindex"];
  const cards = () => [...document.querySelectorAll('.sz_contact')];
  const chain = card => { const out=[]; for(let n=card,depth=0;n&&n!==document.body&&depth<12;n=n.parentElement,depth++)out.push(n); return out; };
  const signals = n => ['active','selected','open'].filter(c=>n.classList.contains(c))
    .concat(n.getAttribute('aria-selected')==='true'?['aria-selected']:[])
    .concat(n.hasAttribute('aria-current')&&n.getAttribute('aria-current')!=='false'?['aria-current']:[]);
  const round = n => Math.round(n*100)/100;
  const rect = n => {if(!n)return null;const r=n.getBoundingClientRect();return {x:round(r.x),y:round(r.y),width:round(r.width),height:round(r.height)};};
  const extension = n => !!n.closest('#containerBotoesGemini, .atendeai-focus-central, .atendeai-focus-editor, .atendeai-focus-preview');
  function snapshot(label, inspected) {
    if(!/^[ABC]$/.test(label))return {error:'Use A, B ou C como rótulo manual de atendimento.'};
    const all=cards(), selected=inspected?.closest?.('.sz_contact');
    if(!selected||!all.includes(selected))return {error:'Selecione no painel Elements um cartão do atendimento aberto e passe $0.'};
    const chains=all.map(chain), chosen=chain(selected);
    const ids=chosen.map(n=>n.getAttribute('id')||null);
    const previous=history.get(label), comparisons=[];
    for(const [other,values] of history)if(other!==label)comparisons.push({otherLabel:other,
      reusedIdentifierCount:ids.filter(v=>v&&values.includes(v)).length});
    history.set(label,ids);
    const depths = Math.max(...chains.map(nodes=>nodes.length),0);
    const changes = Array.from({length:depths},(_,depth)=>{
      const nodes = [...new Set(chains.map(nodes=>nodes[depth]).filter(Boolean))];
      return {depth, previouslyObservedNodes:nodes.filter(n=>previousNodes.has(n)).length,
        classChangedOnIndividualAncestors:nodes.filter(n=>previousNodes.has(n)&&previousNodes.get(n).classes!==n.className&&all.filter(c=>n===c||n.contains(c)).length===1).length,
        stateAttributesChangedOnIndividualAncestors:nodes.filter(n=>previousNodes.has(n)&&stateAttributes.some((attr,i)=>previousNodes.get(n).state[i]!==n.getAttribute(attr))&&all.filter(c=>n===c||n.contains(c)).length===1).length};
    });
    for(const n of new Set(chains.flat()))previousNodes.set(n,{classes:n.className,state:stateAttributes.map(attr=>n.getAttribute(attr))});
    return {label,selectionChangesSincePreviousSnapshot:changes,cardCount:all.length,explicitChatIdCount:all.filter(n=>n.hasAttribute('data-chat-id')).length,
      sameLabelComparison:previous?{identifiersAtSameDepthUnchanged:ids.length===previous.length&&ids.every((v,i)=>v===previous[i]),
        presentBefore:previous.filter(Boolean).length,presentNow:ids.filter(Boolean).length}:null,
      otherAttendanceComparisons:comparisons,
      ancestors:chosen.map((n,depth)=>{const id=ids[depth];const related=all.filter(c=>n===c||n.contains(c));return {depth,
        hasIdentifier:!!id,cardsContained:related.length,identifierAppearsInCardChains:id?chains.filter(nodes=>nodes.some(el=>el.getAttribute('id')===id)).length:0,
        matchingDOMIdentifierCount:id?[...document.querySelectorAll('[id]')].filter(el=>el.getAttribute('id')===id).length:0,
        selectionSignals:signals(n),selectionSignalIsIndividual:signals(n).length>0&&related.length===1};}),
      selectionCensus:Array.from({length:Math.max(...chains.map(nodes=>nodes.length),0)},(_,depth)=>({depth,
        signalsOnSingleCardAncestors:chains.filter(nodes=>nodes[depth]&&signals(nodes[depth]).length&&all.filter(c=>nodes[depth]===c||nodes[depth].contains(c)).length===1).length,
        signalsOnSharedAncestors:chains.filter(nodes=>nodes[depth]&&signals(nodes[depth]).length&&all.filter(c=>nodes[depth]===c||nodes[depth].contains(c)).length>1).length}))};
  }
  function geometry() {
    const dock=document.querySelector('#containerBotoesGemini'),central=document.querySelector('.atendeai-focus-central');
    const d=dock?.getBoundingClientRect();
    const categories={queue:'.scroll-list, .chats-list, .contacts-list, .contact-list',composer:'textarea, [contenteditable="true"]',inputs:'input',messages:'.msg',controls:'button, [role="button"]'};
    const conflicts=Object.entries(categories).map(([category,selector])=>{
      const intersections=[...document.querySelectorAll(selector)].filter(n=>!extension(n)).map(n=>{
        const r=n.getBoundingClientRect();if(!d||r.width<=0||r.height<=0)return null;
        const left=Math.max(d.left,r.left),right=Math.min(d.right,r.right),top=Math.max(d.top,r.top),bottom=Math.min(d.bottom,r.bottom);
        if(right<=left||bottom<=top)return null;
        const stack=document.elementsFromPoint((left+right)/2,(top+bottom)/2);
        return {area:(right-left)*(bottom-top),dockReceivesPointerAtCenter:!!stack[0]&&(stack[0]===dock||dock.contains(stack[0]))};
      }).filter(Boolean);
      return {category,intersectingElements:intersections.length,totalBoundingBoxArea:round(intersections.reduce((sum,r)=>sum+r.area,0)),
        pointerBlockedAtIntersectionCenter:intersections.filter(r=>r.dockReceivesPointerAtCenter).length};
    });
    return {viewport:{width:innerWidth,height:innerHeight},dock:rect(dock),central:rect(central),conflicts,
      queues:[...document.querySelectorAll(categories.queue)].map(n=>({rect:rect(n),parent:rect(n.parentElement),cardCount:n.querySelectorAll('.sz_contact').length,
        overflowY:getComputedStyle(n).overflowY,parentFlexColumn:getComputedStyle(n.parentElement).display==='flex'&&getComputedStyle(n.parentElement).flexDirection==='column',scrollTop:round(n.scrollTop)}))};
  }
  return {snapshot,geometry,clear(){history.clear();previousNodes=new WeakMap();delete window.atendeaiSZDiagnostic;return 'Diagnóstico removido.';}};
})();
'AtendeAI: diagnóstico somente leitura pronto. Nenhuma identidade foi aprovada.';
