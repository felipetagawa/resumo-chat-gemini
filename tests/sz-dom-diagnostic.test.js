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

test('diagnostic inspectVue identifies attendance session props vs contact-only props without leaking data',()=>{
 const h=setup();
 h.a.__vue__ = { $props: { contact: { _id: 'private-cust-123', name: 'Private Customer' } } };
 const reportContact = h.api.inspectVue(h.a);
 assert.equal(reportContact.hasVueInstance, true);
 assert.equal(reportContact.hasContactId, true);
 assert.equal(reportContact.hasAttendanceSessionProp, false);
 assert.match(reportContact.semanticAssessment, /BLOQUEADO/);
 assert.doesNotMatch(JSON.stringify(reportContact), /private-cust|Private Customer/);

 h.b.__vue__ = { $props: { attendance: { _id: 'private-att-456' }, contact: { _id: 'private-cust-789' } } };
 const reportAtt = h.api.inspectVue(h.b);
 assert.equal(reportAtt.hasAttendanceSessionProp, true);
 assert.match(reportAtt.semanticAssessment, /detectada com sucesso/);
 assert.doesNotMatch(JSON.stringify(reportAtt), /private-att|private-cust/);

 h.a.__vue__ = { $props: { contact: { protocol: 'SZ-PROT-1', isAttendance: true, _id: 'priv-1' } } };
 const reportProtActive = h.api.inspectVue(h.a);
 assert.equal(reportProtActive.hasProtocol, true);
 assert.equal(reportProtActive.isAttendance, true);
 assert.equal(reportProtActive.hasAttendanceSessionProp, true);
 assert.match(reportProtActive.semanticAssessment, /detectada com sucesso/);

 h.b.__vue__ = { $props: { contact: { protocol: 'SZ-PROT-2', isAttendance: false } } };
 const reportProtInactive = h.api.inspectVue(h.b);
 assert.equal(reportProtInactive.hasProtocol, true);
 assert.equal(reportProtInactive.isAttendance, false);
 assert.equal(reportProtInactive.hasAttendanceSessionProp, false);
 assert.match(reportProtInactive.semanticAssessment, /isAttendance !== true/);

 // When card.__vue__ lacks contact but parentElement.__vue__ has contact
 h.a.__vue__ = { $props: { internalComponent: true } };
 h.parent.__vue__ = { $props: { contact: { protocol: 'SZ-PARENT-PROT', isAttendance: true } } };
 const reportParentProt = h.api.inspectVue(h.a);
 assert.equal(reportParentProt.hasProtocol, true);
 assert.equal(reportParentProt.isAttendance, true);
 assert.equal(reportParentProt.hasAttendanceSessionProp, true);
 assert.doesNotMatch(JSON.stringify(reportParentProt), /SZ-PARENT-PROT/);
});

test('diagnostic audit reports counts and states without leaking any private customer or protocol data', () => {
 const h = setup();
 h.document.documentElement = el('html');
 h.document.documentElement.setAttribute('data-atendeai-sz-bridge', 'ready');
 h.a.setAttribute('data-sz-protocol', 'SZ-SECRET-001');
 h.a.setAttribute('data-sz-attendance', 'true');
 const slot = el('div', { class: 'atendeai-focus-card-slot' });
 const trigger = el('button', { class: 'atendeai-focus-trigger' });
 h.a.appendChild(slot);
 slot.appendChild(trigger);

 const smartBtn = el('button', { id: 'btnSmartReply' });
 const icon = el('svg', { class: 'atendeai-focus-icon' });
 icon.getBoundingClientRect = () => ({ width: 16, height: 16 });
 smartBtn.appendChild(icon);
 h.document.body.appendChild(smartBtn);

 const report = h.api.audit();
 assert.equal(report.cartoes, 2);
 assert.equal(report.pontePronta, true);
 assert.equal(report.ponteComProtocolo, 1);
 assert.equal(report.ponteComAtendimento, 1);
 assert.equal(report.slotsPrioridade, 1);
 assert.equal(report.gatilhosPrioridade, 1);
 assert.equal(report.iconeSmartReplyLargura, 16);
 assert.equal(report.iconeSmartReplyAltura, 16);
 assert.equal(typeof report.diagnosticoPonte, 'object');
 assert.doesNotMatch(JSON.stringify(report), /SZ-SECRET-001/);
});

test('diagnoseBridge groups accepted and rejected counts by reason without leaking PII', () => {
 const h = setup();
 // Card a has valid numeric protocol
 h.a.__vue__ = { $props: { contact: { protocol: '20261013140512', isAttendance: true, _id: 'cust-1' } } };
 // Card b has phone-like protocol
 h.b.__vue__ = { $props: { contact: { protocol: '5511999998888', isAttendance: true, _id: 'cust-2' } } };

 const diag = h.api.diagnoseBridge();
 assert.equal(diag.totalCartoes, 2);
 assert.equal(diag.aceitos, 1);
 assert.equal(diag.rejeitadosPorMotivo.padraoTelefone, 1);
 assert.equal(diag.rejeitadosPorMotivo.atendimentoInativo, 0);
 assert.equal(diag.rejeitadosPorMotivo.semPropContact, 0);
 assert.doesNotMatch(JSON.stringify(diag), /20261013140512|5511999998888|cust-1|cust-2/);
});
