const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {el,createDocument,collect}=require('./mini-dom');
function setup(){
 const document=createDocument(),parent=el('div',{class:'active',id:'private-framework-id'}),a=el('div',{class:'sz_contact',id:'private-attendance-a'}),b=el('div',{class:'sz_contact',id:'private-attendance-b'});
 document.body.appendChild(parent);parent.appendChild(a);parent.appendChild(b);
 for(const n of collect(document.body)){n.hasAttribute=k=>n.getAttribute(k)!==null;n.closest=()=>n.classList.contains('sz_contact')?n:null;}
 const query=document.querySelectorAll;document.querySelectorAll=selector=>selector==='[id]'?collect(document.body).filter(n=>n.id):query(selector);
 const context={window:{},document};vm.createContext(context);vm.runInContext(fs.readFileSync('docs/sz-dom-diagnostic.js','utf8'),context);
 return {document,parent,a,b,api:context.window.atendeaiSZDiagnostic,context};
}
test('read-only identity diagnostic never exports IDs or marks shared active ancestors as individual selection',()=>{
 const h=setup(),before=h.a.id;const report=h.api.snapshot('A',h.a);
 assert.doesNotMatch(JSON.stringify(report),/private-attendance|private-framework/);assert.equal(report.ancestors[1].cardsContained,2);
 assert.equal(report.ancestors[1].selectionSignalIsIndividual,false);assert.equal(report.ancestors[1].identifierAppearsInCardChains,2);
 assert.equal(h.a.id,before);assert.equal(h.document.querySelectorAll('.sz_contact').length,2);
});
test('diagnostic reports stability, changed IDs and reuse between manually distinguished attendances',()=>{
 const h=setup();h.api.snapshot('A',h.a);assert.equal(h.api.snapshot('A',h.a).sameLabelComparison.identifiersAtSameDepthUnchanged,true);
 h.a.id='private-changed-id';assert.equal(h.api.snapshot('A',h.a).sameLabelComparison.identifiersAtSameDepthUnchanged,false);
 h.b.id=h.a.id;const report=h.api.snapshot('B',h.b);assert.equal(report.otherAttendanceComparisons[0].reusedIdentifierCount,2);
 assert.equal(report.ancestors[0].matchingDOMIdentifierCount,2);assert.doesNotMatch(JSON.stringify(report),/private-changed/);
});
test('diagnostic refuses unlabelled cards and clears its temporary memory',()=>{
 const h=setup();assert.ok(h.api.snapshot('real customer name',h.a).error);assert.ok(h.api.snapshot('A',h.parent).error);
 h.api.snapshot('A',h.a);h.api.clear();assert.equal(h.context.window.atendeaiSZDiagnostic,undefined);
 assert.equal(h.api.snapshot('A',h.a).sameLabelComparison,null);
});

test('diagnostic detects arbitrary individual selection changes without exporting class or attribute values',()=>{
 const h=setup();h.api.snapshot('A',h.a);h.a.className+=' private-selection-class';h.b.setAttribute('data-state','private-state-value');
 const report=h.api.snapshot('B',h.b);assert.equal(report.selectionChangesSincePreviousSnapshot[0].classChangedOnIndividualAncestors,1);
 assert.equal(report.selectionChangesSincePreviousSnapshot[0].stateAttributesChangedOnIndividualAncestors,1);
 assert.doesNotMatch(JSON.stringify(report),/private-selection|private-state/);
});
