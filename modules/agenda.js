const AgendaModule = (() => {

    const eventListeners = {
        'event-changed': [],
        'event-deleted': []
    };

    function on(eventName, callback) {
        if (!eventListeners[eventName]) {
            eventListeners[eventName] = [];
        }
        eventListeners[eventName].push(callback);
    }

    function emit(eventName, data) {
        if (eventListeners[eventName]) {
            eventListeners[eventName].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Error in event listener:', error);
                }
            });
        }
    }

    let currentCalendarContainer = null;
    let currentCRMContainer = null;
    let currentKanbanContainer = null;

    function atualizarCalendarioSeAberto() {
        if (currentCalendarContainer) {
            iniciarCalendario(currentCalendarContainer);
        }
    }

    function atualizarCRMSeAberto() {
        if (currentCRMContainer) {
            iniciarCRM(currentCRMContainer);
        }
    }

    function atualizarKanbanSeAberto() {
        if (currentKanbanContainer) {
            iniciarKanban(currentKanbanContainer);
        }
    }

    on('event-changed', () => {
        atualizarCalendarioSeAberto();
        atualizarCRMSeAberto();
        atualizarKanbanSeAberto();
    });

    on('event-deleted', () => {
        atualizarCalendarioSeAberto();
        atualizarCRMSeAberto();
        atualizarKanbanSeAberto();
    });

    function exibirAgenda() {
        DOMHelpers.removeElement("geminiAgendaModal");

        function loadTabOrder() {
            const savedOrder = localStorage.getItem('agenda_tab_order');
            if (savedOrder) {
                return JSON.parse(savedOrder);
            }
            return ['calendar', 'crm', 'kanban', 'notes'];
        }

        function saveTabOrder(order) {
            localStorage.setItem('agenda_tab_order', JSON.stringify(order));
        }

        const tabOrder = loadTabOrder();
        const tabs = [
            { id: 'calendar', label: 'Calendário' },
            { id: 'crm', label: 'CRM' },
            { id: 'kanban', label: 'Kanban' },
            { id: 'notes', label: 'Notas' }
        ];

        const sortedTabs = tabOrder.map(tabId =>
            tabs.find(tab => tab.id === tabId)
        ).filter(tab => tab);

        const allTabIds = tabs.map(tab => tab.id);
        sortedTabs.forEach(tab => {
            const index = allTabIds.indexOf(tab.id);
            if (index > -1) {
                allTabIds.splice(index, 1);
            }
        });
        allTabIds.forEach(tabId => {
            const missingTab = tabs.find(tab => tab.id === tabId);
            if (missingTab) sortedTabs.push(missingTab);
        });

        const firstTabId = sortedTabs.length > 0 ? sortedTabs[0].id : 'calendar';

        const modal = document.createElement("div");
        modal.id = "geminiAgendaModal";
        document.body.appendChild(modal);

        modal.innerHTML = `
        <div class="agenda-header">
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="font-weight:700; font-size:18px; color:#333;">Agenda & Gestão</div>
                <button id="btnEditTabs" style="background:#f0f0f0; border:1px solid #ddd; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:4px; transition:all 0.2s;" title="Reordenar abas">
                <span>↕️</span>
                <span>Reordenar</span>
                </button>
            </div>
            <button id="fecharAgenda" style="background:none; border:none; font-size:20px; cursor:pointer; color:#666; padding:5px;">&times;</button>
            </div>
        </div>
        <div class="agenda-tabs-container">
            <div class="agenda-tabs" id="agendaTabs">
            ${sortedTabs.map(tab => `
                <div class="agenda-tab ${tab.id === firstTabId ? 'active' : ''}" 
                    data-tab="${tab.id}">
                ${tab.label}
                </div>
            `).join('')}
            </div>
        </div>
        <div class="agenda-body">
            <div id="tab-calendar" class="tab-content" ${firstTabId === 'calendar' ? '' : 'style="display:none;"'}></div>
            <div id="tab-crm" class="tab-content" ${firstTabId === 'crm' ? '' : 'style="display:none;"'}></div>
            <div id="tab-kanban" class="tab-content" ${firstTabId === 'kanban' ? '' : 'style="display:none;"'}></div>
            <div id="tab-notes" class="tab-content" ${firstTabId === 'notes' ? '' : 'style="display:none;"'}></div>
        </div>
        `;

        modal.querySelector("#fecharAgenda").addEventListener("click", () => {
            currentCalendarContainer = null;
            currentCRMContainer = null;
            currentKanbanContainer = null;
            modal.remove();
        });

        let isEditingMode = false;
        let draggedTab = null;

        function toggleEditMode() {
            isEditingMode = !isEditingMode;
            const editBtn = modal.querySelector("#btnEditTabs");
            const tabsContainer = modal.querySelector(".agenda-tabs-container");
            const tabElements = modal.querySelectorAll('.agenda-tab');

            if (isEditingMode) {
                editBtn.innerHTML = '<span>✅</span><span>Salvar Ordem</span>';
                editBtn.style.background = '#e8f5e9';
                editBtn.style.borderColor = '#4caf50';
                tabsContainer.classList.add('editing');

                tabElements.forEach(tab => {
                    tab.setAttribute('draggable', 'true');
                    tab.style.cursor = 'grab';
                    tab.innerHTML = tab.textContent + ' <span class="drag-handle">⋮⋮</span>';

                    tab.addEventListener('dragstart', handleDragStart);
                    tab.addEventListener('dragover', handleDragOver);
                    tab.addEventListener('dragenter', handleDragEnter);
                    tab.addEventListener('dragleave', handleDragLeave);
                    tab.addEventListener('drop', handleDrop);
                    tab.addEventListener('dragend', handleDragEnd);
                });

            } else {
                editBtn.innerHTML = '<span>↕️</span><span>Reordenar</span>';
                editBtn.style.background = '#f0f0f0';
                editBtn.style.borderColor = '#ddd';
                tabsContainer.classList.remove('editing');

                tabElements.forEach(tab => {
                    tab.removeAttribute('draggable');
                    tab.style.cursor = 'pointer';
                    tab.innerHTML = tab.textContent.replace(' ⋮⋮', '');

                    tab.removeEventListener('dragstart', handleDragStart);
                    tab.removeEventListener('dragover', handleDragOver);
                    tab.removeEventListener('dragenter', handleDragEnter);
                    tab.removeEventListener('dragleave', handleDragLeave);
                    tab.removeEventListener('drop', handleDrop);
                    tab.removeEventListener('dragend', handleDragEnd);
                });

                const newOrder = Array.from(modal.querySelectorAll('.agenda-tab'))
                    .map(tab => tab.dataset.tab);
                saveTabOrder(newOrder);

                editBtn.innerHTML = '<span>✅</span><span>Salvo!</span>';
                setTimeout(() => {
                    editBtn.innerHTML = '<span>↕️</span><span>Reordenar</span>';
                }, 1000);
            }
        }

        modal.querySelector("#btnEditTabs").addEventListener("click", toggleEditMode);

        function handleDragStart(e) {
            draggedTab = this;
            this.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
        }

        function handleDragOver(e) {
            e.preventDefault();
            return false;
        }

        function handleDragEnter(e) {
            e.preventDefault();
            if (this !== draggedTab) {
                this.classList.add('drag-over');
            }
        }

        function handleDragLeave(e) {
            this.classList.remove('drag-over');
        }

        function handleDrop(e) {
            e.preventDefault();
            e.stopPropagation();

            if (draggedTab && draggedTab !== this) {
                const tabsContainer = this.parentNode;
                const allTabs = Array.from(tabsContainer.children);
                const draggedIndex = allTabs.indexOf(draggedTab);
                const targetIndex = allTabs.indexOf(this);

                allTabs.forEach(tab => tab.classList.remove('drag-over'));

                if (draggedIndex < targetIndex) {
                    this.parentNode.insertBefore(draggedTab, this.nextSibling);
                } else {
                    this.parentNode.insertBefore(draggedTab, this);
                }

                draggedTab.style.opacity = '1';
            }

            return false;
        }

        function handleDragEnd(e) {
            const allTabs = modal.querySelectorAll('.agenda-tab');
            allTabs.forEach(tab => {
                tab.classList.remove('drag-over');
                tab.style.opacity = '1';
            });
            draggedTab = null;
        }

        function switchTab(tabName) {
            if (isEditingMode) return;

            modal.querySelectorAll(".agenda-tab").forEach(t => t.classList.remove("active"));
            modal.querySelectorAll(".tab-content").forEach(content => {
                content.style.display = "none";
            });

            const tabElement = modal.querySelector(`.agenda-tab[data-tab="${tabName}"]`);
            if (tabElement) {
                tabElement.classList.add("active");
            }

            const contentElement = modal.querySelector(`#tab-${tabName}`);
            if (contentElement) {
                contentElement.style.display = "block";

                if (contentElement.innerHTML.trim() === '') {
                    switch (tabName) {
                        case 'calendar':
                            iniciarCalendario(contentElement);
                            currentCalendarContainer = contentElement;
                            break;
                        case 'crm':
                            iniciarCRM(contentElement);
                            currentCRMContainer = contentElement;
                            break;
                        case 'kanban':
                            iniciarKanban(contentElement);
                            currentKanbanContainer = contentElement;
                            break;
                        case 'notes':
                            iniciarNotas(contentElement);
                            break;
                    }
                } else {
                    if (tabName === 'calendar') currentCalendarContainer = contentElement;
                    if (tabName === 'crm') currentCRMContainer = contentElement;
                    if (tabName === 'kanban') currentKanbanContainer = contentElement;
                }
            }
        }

        modal.querySelectorAll('.agenda-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (!isEditingMode) {
                    const tabName = tab.dataset.tab;
                    switchTab(tabName);
                }
            });
        });

        switchTab(firstTabId);

        currentCalendarContainer = modal.querySelector("#tab-calendar");
        currentCRMContainer = modal.querySelector("#tab-crm");
        currentKanbanContainer = modal.querySelector("#tab-kanban");
    }

    async function migrarEventosAntigos() {
        const data = await StorageHelper.get(["usuarioAgendaEvents", "usuarioAgendaEventsV2"]);

        if (data.usuarioAgendaEvents && Object.keys(data.usuarioAgendaEvents).length > 0 && !data.usuarioAgendaEventsV2) {
            const eventsV1 = data.usuarioAgendaEvents;
            const eventsV2 = {};

            Object.keys(eventsV1).forEach(key => {
                const oldEvent = eventsV1[key];
                eventsV2[key] = {
                    id: key,
                    title: oldEvent.title || oldEvent.evento || "Evento sem título",
                    date: oldEvent.data || oldEvent.date,
                    time: oldEvent.hora || oldEvent.time || "",
                    notes: oldEvent.observacao || oldEvent.notes || "",
                    client: "",
                    problem: "",
                    status: 'todo',
                    createdAt: new Date().toISOString()
                };
            });

            await StorageHelper.set({ usuarioAgendaEventsV2: eventsV2 });
            await StorageHelper.remove("usuarioAgendaEvents");
        }
    }

    async function salvarEventoCompleto(eventData) {
        const id = eventData.id || UIBuilder.gerarIdUnico();

        const eventoCompleto = {
            ...eventData,
            id: id,
            status: eventData.status || 'todo',
            createdAt: eventData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const eventsData = await StorageHelper.get(["usuarioAgendaEventsV2"]);
        const eventsCache = eventsData.usuarioAgendaEventsV2 || {};
        eventsCache[id] = eventoCompleto;
        await StorageHelper.set({ usuarioAgendaEventsV2: eventsCache });

        emit('event-changed', eventoCompleto);

        return eventoCompleto;
    }

    async function deletarEventoCompleto(eventId) {
        const eventsData = await StorageHelper.get(["usuarioAgendaEventsV2"]);
        const eventsCache = eventsData.usuarioAgendaEventsV2 || {};
        delete eventsCache[eventId];
        await StorageHelper.set({ usuarioAgendaEventsV2: eventsCache });

        emit('event-deleted', eventId);
    }

    async function obterTodosEventos() {
        const data = await StorageHelper.get(["usuarioAgendaEventsV2"]);
        return data.usuarioAgendaEventsV2 || {};
    }

    function getStatusColor(status) {
        switch (status) {
            case 'todo': return '#ff6b6b';
            case 'inprogress': return '#4ecdc4';
            case 'done': return '#1dd1a1';
            default: return '#999';
        }
    }

    function getStatusIcon(status) {
        switch (status) {
            case 'todo': return '📋';
            case 'inprogress': return '⚡';
            case 'done': return '✅';
            default: return '📌';
        }
    }

    function getStatusLabel(status) {
        switch (status) {
            case 'todo': return 'A Fazer';
            case 'inprogress': return 'Em Progresso';
            case 'done': return 'Concluído';
            default: return 'Indefinido';
        }
    }

    function abrirModalAtendimento(item = null, dia = null, currentMonth = null, currentYear = null, onSaveSuccess = null) {
        const isEdit = item !== null;
        let dataDefault = '';

        if (dia && currentMonth !== null && currentYear !== null) {
            dataDefault = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        }

        UIBuilder.criarModalFormulario({
            title: isEdit ? 'Editar Atendimento' : 'Novo Atendimento',
            fields: [
                {
                    name: 'client',
                    label: 'Nome do Cliente',
                    type: 'text',
                    required: true,
                    value: item?.client || '',
                    placeholder: 'Nome do cliente'
                },
                {
                    name: 'title',
                    label: 'Assunto/Pendência',
                    type: 'text',
                    required: true,
                    value: item?.title || '',
                    placeholder: 'Resumo do atendimento'
                },
                {
                    name: 'problem',
                    label: 'Problema Detalhado',
                    type: 'textarea',
                    required: false,
                    value: item?.problem || '',
                    placeholder: 'Descrição detalhada do problema...'
                },
                {
                    name: 'date',
                    label: 'Data Agendada',
                    type: 'date',
                    required: true,
                    value: item?.date || dataDefault
                },
                {
                    name: 'time',
                    label: 'Hora Agendada',
                    type: 'time',
                    required: false,
                    value: item?.time || ''
                },
                {
                    name: 'notes',
                    label: 'Observações',
                    type: 'textarea',
                    required: false,
                    value: item?.notes || '',
                    placeholder: 'Observações adicionais...'
                },
                {
                    name: 'status',
                    label: 'Status',
                    type: 'select',
                    required: true,
                    value: item?.status || 'todo',
                    options: [
                        { value: 'todo', label: 'A Fazer' },
                        { value: 'inprogress', label: 'Em Progresso' },
                        { value: 'done', label: 'Concluído' }
                    ]
                }
            ],
            onSave: async (formData) => {
                await salvarEventoCompleto({
                    ...formData,
                    id: item?.id,
                    createdAt: item?.createdAt
                });
                if (onSaveSuccess) onSaveSuccess();
            },
            onDelete: isEdit ? async () => {
                await deletarEventoCompleto(item.id);
                if (onSaveSuccess) onSaveSuccess();
            } : null
        });
    }

    function iniciarCalendario(container) {
        const date = new Date();
        let currentMonth = date.getMonth();
        let currentYear = date.getFullYear();

        const loadAndRender = () => {
            obterTodosEventos().then(eventsCache => {
                render(eventsCache);
            });
        };

        const abrirModalVisualizacao = (eventData) => {
            const statusLabel = getStatusLabel(eventData.status);
            const statusColor = getStatusColor(eventData.status);
            const statusIcon = getStatusIcon(eventData.status);

            const modalContent = `
                <div style="margin-bottom: 20px;">
                    <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 10px;">
                            <div style="flex: 1; min-width: 200px;">
                                <h3 style="margin: 0 0 5px 0; color: #333; font-size: 18px; font-weight: 600; word-break: break-word;">${eventData.title || 'Sem título'}</h3>
                                ${eventData.client ? `<p style="margin: 0 0 10px 0; color: #666; font-size: 14px; word-break: break-word;"><strong>Cliente:</strong> ${eventData.client}</p>` : ''}
                            </div>
                            <span style="display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 12px; background: ${statusColor}20; color: ${statusColor}; font-size: 12px; font-weight: 500; border: 1px solid ${statusColor}40; white-space: nowrap;">
                                ${statusIcon} ${statusLabel}
                            </span>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 15px;">
                        <div>
                            <p style="margin: 0 0 5px 0; font-size: 13px; color: #888; font-weight: 500;"><strong>Data:</strong></p>
                            <p style="margin: 0; font-size: 14px; color: #333; word-break: break-word;">${eventData.date || 'Não definida'}</p>
                        </div>
                        ${eventData.time ? `
                        <div>
                            <p style="margin: 0 0 5px 0; font-size: 13px; color: #888; font-weight: 500;"><strong>Hora:</strong></p>
                            <p style="margin: 0; font-size: 14px; color: #333; word-break: break-word;">${eventData.time}</p>
                        </div>
                        ` : ''}
                    </div>
                    
                    ${eventData.problem ? `
                    <div style="margin-bottom: 15px;">
                        <p style="margin: 0 0 5px 0; font-size: 13px; color: #888; font-weight: 500;"><strong>Problema/Descrição:</strong></p>
                        <div style="
                            margin: 0;
                            font-size: 14px;
                            color: #333;
                            line-height: 1.5;
                            padding: 8px;
                            background: #f8f9fa;
                            border-radius: 4px;
                            word-break: break-word;
                            overflow-wrap: break-word;
                        ">
                            ${eventData.problem.split('\n').map(line => line.trim()).filter(line => line).join(' ')}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${eventData.notes ? `
                    <div style="margin-bottom: 15px;">
                        <p style="margin: 0 0 5px 0; font-size: 13px; color: #888; font-weight: 500;"><strong>Observações:</strong></p>
                        <div style="
                            margin: 0;
                            font-size: 14px;
                            color: #333;
                            line-height: 1.5;
                            padding: 8px;
                            background: #f8f9fa;
                            border-radius: 4px;
                            word-break: break-word;
                            overflow-wrap: break-word;
                        ">
                            ${eventData.notes.split('\n').map(line => line.trim()).filter(line => line).join(' ')}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${eventData.createdAt ? `
                    <div style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
                        <p style="margin: 0; font-size: 12px; color: #999; word-break: break-word;"><strong>Criado em:</strong> ${eventData.createdAt}</p>
                    </div>
                    ` : ''}
                </div>
            `;

            const existingModal = document.getElementById('viewEventModal');
            if (existingModal) {
                existingModal.remove();
            }

            const modalDiv = document.createElement('div');
            modalDiv.id = 'viewEventModal';
            modalDiv.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 2147483647;
                padding: 20px;
                box-sizing: border-box;
            `;

            modalDiv.innerHTML = `
                <div style="
                    background: white;
                    border-radius: 8px;
                    width: 100%;
                    max-width: min(500px, 95vw);
                    max-height: min(85vh, 90%);
                    overflow-y: auto;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                    border: 1px solid #ddd;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                ">
                    <div style="
                        padding: 15px 20px;
                        border-bottom: 1px solid #eee;
                        background: #f8f9fa;
                        border-radius: 8px 8px 0 0;
                        position: sticky;
                        top: 0;
                        z-index: 1;
                        flex-shrink: 0;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                            <h2 style="
                                margin: 0;
                                font-size: clamp(16px, 4vw, 18px);
                                color: #333;
                                font-weight: 600;
                                word-break: break-word;
                            ">Visualização de Evento</h2>
                            <button id="closeViewModal" style="
                            border: none;
                            background: transparent;
                            color: #333;
                            font-size: 24px;
                            cursor: pointer;
                            width: 32px;
                            height: 32px;
                            min-width: 32px;
                            min-height: 32px;
                            border-radius: 4px;
                            display: flex;
                            align-items: center;
                            justify-content: center;    
                            padding: 0;
                            line-height: 1;
                            flex-shrink: 0;
                            font-weight: 500;
                            transition: background-color 0.2s;
                        ">×</button>
                        </div>
                    </div>
                    
                    <div style="
                        padding: 20px;
                        flex: 1;
                        overflow-y: auto;
                        box-sizing: border-box;
                    ">
                        ${modalContent}
                    </div>
                    
                    <div style="
                        padding: 15px 20px;
                        border-top: 1px solid #eee;
                        background: #f8f9fa;
                        border-radius: 0 0 8px 8px;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                        justify-content: flex-end;
                        position: sticky;
                        bottom: 0;
                        flex-shrink: 0;
                    ">
                        <button id="editEventBtn" style="
                            padding: 8px 16px;
                            background: #4CAF50;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: clamp(13px, 3vw, 14px);
                            font-weight: 500;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            white-space: nowrap;
                            flex: 1;
                            min-width: 100px;
                            justify-content: center;
                        ">
                            Editar
                        </button>
                        <button id="deleteEventBtn" style="
                            padding: 8px 16px;
                            background: #f44336;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: clamp(13px, 3vw, 14px);
                            font-weight: 500;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            white-space: nowrap;
                            flex: 1;
                            min-width: 100px;
                            justify-content: center;
                        ">
                            Excluir
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modalDiv);

            const closeModal = () => {
                if (modalDiv && modalDiv.parentNode) {
                    modalDiv.parentNode.removeChild(modalDiv);
                }
            };

            const closeBtn1 = modalDiv.querySelector('#closeViewModal');
            const closeBtn2 = modalDiv.querySelector('#closeViewModal2');
            const editBtn = modalDiv.querySelector('#editEventBtn');
            const deleteBtn = modalDiv.querySelector('#deleteEventBtn');

            if (closeBtn1) closeBtn1.addEventListener('click', closeModal);
            if (closeBtn2) closeBtn2.addEventListener('click', closeModal);

            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    closeModal();
                    setTimeout(() => {
                        abrirModalAtendimento(eventData, null, null, null, loadAndRender);
                    }, 50);
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    if (confirm('Tem certeza que deseja excluir este evento?')) {
                        await deletarEventoCompleto(eventData.id);
                        closeModal();
                        setTimeout(() => {
                            loadAndRender();
                        }, 50);
                    }
                });
            }

            modalDiv.addEventListener('click', (e) => {
                if (e.target === modalDiv) {
                    closeModal();
                }
            });

            const handleEscKey = (e) => {
                if (e.key === 'Escape') {
                    closeModal();
                    document.removeEventListener('keydown', handleEscKey);
                }
            };

            document.addEventListener('keydown', handleEscKey);

            modalDiv._escListener = handleEscKey;

            setTimeout(() => {
                if (closeBtn1) closeBtn1.focus();
            }, 10);
        };



        const render = (eventsCache) => {
            const firstDay = new Date(currentYear, currentMonth, 1).getDay();
            const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

            const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

            container.innerHTML = `
            <div class="calendar-controls">
            <button id="prevMonth" style="border:none; background:none; cursor:pointer; font-size:18px; padding:5px;">◀</button>
            <div style="font-weight:700; font-size:16px; color:#333;">${monthNames[currentMonth]} ${currentYear}</div>
            <button id="nextMonth" style="border:none; background:none; cursor:pointer; font-size:18px; padding:5px;">▶</button>
            </div>
            <div class="calendar-grid">
            ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => `<div class="calendar-day-header">${d}</div>`).join('')}
            </div>
        `;

            const grid = container.querySelector('.calendar-grid');

            for (let i = 0; i < firstDay; i++) {
                grid.appendChild(document.createElement('div'));
            }

            for (let i = 1; i <= daysInMonth; i++) {
                const dayEl = document.createElement('div');
                dayEl.className = 'calendar-day';

                const isToday = i === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
                if (isToday) dayEl.classList.add('today');

                const currentDayDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const dayEvents = Object.values(eventsCache).filter(evt => evt.date === currentDayDate);

                let eventsHtml = '';
                let hasOverdue = false;

                dayEvents.forEach(evt => {
                    const isOverdue = evt.status !== 'done' && UIBuilder.compararDatas(evt.date);
                    if (isOverdue) hasOverdue = true;

                    const statusColor = getStatusColor(evt.status);
                    const statusIcon = getStatusIcon(evt.status);
                    const displayText = evt.time ? `${evt.time} ${evt.title}` : evt.title;

                    eventsHtml += `
                        <div class="event-marker ${isOverdue ? 'overdue' : ''}" 
                            data-event-id="${evt.id}" 
                            title="Clique para ver detalhes\n${evt.title}${evt.client ? ' - ' + evt.client : ''}\nStatus: ${getStatusLabel(evt.status)}"
                            style="border-left: 3px solid ${statusColor}; background: ${statusColor}20; color: ${statusColor}; margin-top: 2px; cursor: pointer; padding: 2px 5px; border-radius: 3px;">
                            ${statusIcon} ${displayText.length > 20 ? displayText.substring(0, 20) + '...' : displayText}
                        </div>`;
                });

                if (hasOverdue) dayEl.classList.add('has-overdue');

                dayEl.innerHTML = `
                <span class="day-number" style="padding: 2px 5px; border-radius: 3px; display: inline-block;">${i}</span>
                <div class="day-events">${eventsHtml}</div>
                `;

                dayEl.style.cursor = 'pointer';
                dayEl.title = 'Clique para criar um novo atendimento';
                dayEl.addEventListener('click', (e) => {
                    // Se clicar exatamente no evento, não criar novo
                    if (e.target.closest('.event-marker')) return;

                    abrirModalAtendimento(null, i, currentMonth, currentYear, loadAndRender);
                });

                dayEl.querySelectorAll('.event-marker').forEach(marker => {
                    marker.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const eventId = marker.dataset.eventId;
                        const eventData = Object.values(eventsCache).find(evt => evt.id === eventId);
                        if (eventData) {
                            console.log('Abrindo modal para evento:', eventData);
                            abrirModalVisualizacao(eventData);
                        } else {
                            console.error('Evento não encontrado:', eventId);
                        }
                    });
                });

                grid.appendChild(dayEl);
            }

            container.querySelector("#prevMonth").addEventListener('click', () => {
                currentMonth--;
                if (currentMonth < 0) { currentMonth = 11; currentYear--; }
                loadAndRender();
            });

            container.querySelector("#nextMonth").addEventListener('click', () => {
                currentMonth++;
                if (currentMonth > 11) { currentMonth = 0; currentYear++; }
                loadAndRender();
            });
        };

        loadAndRender();
    }

    function iniciarCRM(container) {
        container.innerHTML = `
      <div class="crm-controls">
        <button id="btnAddCrm" style="background:#1a73e8; color:white; border:none; padding:10px 16px; border-radius:6px; font-weight:600; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.1);">+ Novo Atendimento</button>
        <div style="flex:1;"></div>
        <div style="display:flex; gap:10px; align-items:center;">
            <input type="text" id="filtroCrm" placeholder="Filtrar por nome..." style="padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;">
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="font-size:12px; color:#666;">De:</div>
                <input type="date" id="dataInicio" style="padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;">
                <div style="font-size:12px; color:#666;">Até:</div>
                <input type="date" id="dataFim" style="padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;">
            </div>
        </div>
      </div>
      <div style="overflow-x:auto; border:1px solid #eee; border-radius:6px;">
        <table class="crm-table">
          <thead style="background:#f8f9fa;">
            <tr>
              <th>Cliente</th>
              <th>Assunto/Pendência</th>
              <th>Data Agendada</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="crmBody"></tbody>
        </table>
      </div>
    `;

        const tbody = container.querySelector("#crmBody");
        const filtroInput = container.querySelector("#filtroCrm");
        const dataInicio = container.querySelector("#dataInicio");
        const dataFim = container.querySelector("#dataFim");

        const hoje = new Date();
        const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

        const formatarDataParaInput = (data) => {
            return data.toISOString().split('T')[0];
        };

        dataInicio.value = formatarDataParaInput(primeiroDiaMes);
        dataFim.value = formatarDataParaInput(ultimoDiaMes);



        const aplicarFiltroData = (dados) => {
            const dataInicioVal = dataInicio.value;
            const dataFimVal = dataFim.value;

            if (!dataInicioVal && !dataFimVal) {
                return dados;
            }

            let dadosFiltrados = dados;

            if (dataInicioVal) {
                dadosFiltrados = dadosFiltrados.filter(d => {
                    if (!d.date) return false;
                    return d.date >= dataInicioVal;
                });
            }

            if (dataFimVal) {
                dadosFiltrados = dadosFiltrados.filter(d => {
                    if (!d.date) return false;
                    return d.date <= dataFimVal;
                });
            }

            return dadosFiltrados;
        };

        const ordenarPorDataMaisProxima = (dados) => {
            const hoje = new Date();

            return dados.sort((a, b) => {
                if (a.date && b.date) {
                    const dataA = new Date(a.date);
                    const dataB = new Date(b.date);

                    const diffA = Math.abs(dataA - hoje);
                    const diffB = Math.abs(dataB - hoje);

                    return diffA - diffB;
                }

                if (a.date && !b.date) return -1;

                if (!a.date && b.date) return 1;

                return 0;
            });
        };

        const renderTable = () => {
            obterTodosEventos().then(eventsCache => {
                let dados = Object.values(eventsCache)
                    .filter(event => event.client && event.client.trim() !== '')
                    .map(event => ({
                        id: event.id,
                        client: event.client || '',
                        title: event.title || '',
                        problem: event.problem || '',
                        date: event.date || '',
                        time: event.time || '',
                        notes: event.notes || '',
                        status: event.status || 'todo',
                        createdAt: event.createdAt
                    }));

                dados = aplicarFiltroData(dados);

                dados = ordenarPorDataMaisProxima(dados);

                const filtro = filtroInput.value.toLowerCase();
                if (filtro) {
                    dados = dados.filter(d =>
                        d.client.toLowerCase().includes(filtro) ||
                        d.title.toLowerCase().includes(filtro) ||
                        (d.problem && d.problem.toLowerCase().includes(filtro))
                    );
                }

                tbody.innerHTML = "";

                if (dados.length === 0) {
                    tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align:center; padding:24px; color:#777;">
                            Nenhum atendimento encontrado para o período selecionado.
                        </td>
                    </tr>
                `;
                    return;
                }

                dados.forEach((item) => {
                    const dataFormatada = item.date ? UIBuilder.formatarDataEvento(item.date) : '-';
                    const horaDisplay = item.time ? item.time : '';
                    const dataCompleta = item.date ? `${dataFormatada}${horaDisplay ? ' ' + horaDisplay : ''}` : '-';

                    const isOverdue = item.date && item.status !== 'done' && UIBuilder.compararDatas(item.date);

                    const tr = document.createElement("tr");
                    tr.style = isOverdue ? 'background: #ffebee;' : '';
                    tr.innerHTML = `
                    <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <strong>${item.client}</strong>
                    </td>
                    <td style="max-width: 250px;">
                        <div style="font-weight: 500; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${item.title}
                        </div>
                        ${item.problem ?
                            '<div style="font-size: 11px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px;">' +
                            item.problem +
                            '</div>' :
                            ''}
                    </td>
                    <td style="${isOverdue ? 'color:#d32f2f; font-weight:600;' : ''}; min-width: 120px;">
                        ${dataCompleta}
                    </td>
                    <td style="min-width: 120px;">
                        <span class="status-badge" style="background: ${getStatusColor(item.status)}20; color: ${getStatusColor(item.status)}; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; display: inline-block; white-space: nowrap;">
                            ${getStatusIcon(item.status)} ${getStatusLabel(item.status)}
                        </span>
                    </td>
                    <td style="min-width: 100px;">
                        <button class="action-btn btn-edit" data-id="${item.id}" title="Editar" style="background:none; border:none; cursor:pointer; font-size:14px; margin-right:5px;">✏️</button>
                        <button class="action-btn btn-status" data-id="${item.id}" data-current="${item.status}" title="Alterar Status" style="background:none; border:none; cursor:pointer; font-size:14px; margin-right:5px;">🔄</button>
                        <button class="action-btn btn-delete" data-id="${item.id}" title="Excluir" style="background:none; border:none; cursor:pointer; font-size:14px; color:#d93025;">🗑️</button>
                    </td>
                `;
                    tbody.appendChild(tr);
                });

                tbody.querySelectorAll('.btn-edit').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const eventId = btn.dataset.id;
                        const eventsCache = await obterTodosEventos();
                        const event = eventsCache[eventId];

                        if (event) {
                            abrirModalCRM(event);
                        }
                    });
                });

                tbody.querySelectorAll('.btn-status').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const eventId = btn.dataset.id;
                        const currentStatus = btn.dataset.current;
                        const eventsCache = await obterTodosEventos();
                        const event = eventsCache[eventId];

                        if (event) {
                            let newStatus;
                            switch (currentStatus) {
                                case 'todo':
                                    newStatus = 'inprogress';
                                    break;
                                case 'inprogress':
                                    newStatus = 'done';
                                    break;
                                case 'done':
                                default:
                                    newStatus = 'todo';
                                    break;
                            }

                            await salvarEventoCompleto({
                                ...event,
                                status: newStatus
                            });
                            renderTable();
                        }
                    });
                });

                tbody.querySelectorAll('.btn-delete').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const eventId = btn.dataset.id;
                        if (confirm('Tem certeza que deseja excluir este atendimento?')) {
                            await deletarEventoCompleto(eventId);
                            renderTable();
                        }
                    });
                });
            });
        };

        renderTable();

        container.querySelector("#btnAddCrm").addEventListener('click', () => {
            abrirModalAtendimento(null, null, null, null, renderTable);
        });

        filtroInput.addEventListener('input', () => {
            renderTable();
        });

        dataInicio.addEventListener('change', () => {
            renderTable();
        });

        dataFim.addEventListener('change', () => {
            renderTable();
        });
    }

    function iniciarKanban(container) {
        container.innerHTML = `
        <div class="kanban-header">
            <div style="display:flex; gap:10px; margin-bottom:15px; align-items:center; flex-wrap:wrap;">
                <button id="btnAddKanban" style="background:#1a73e8; color:white; border:none; padding:6px 12px; border-radius:4px; font-weight:600; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.1); font-size:12px; white-space:nowrap;">+ Novo Card</button>
                <input type="text" id="filtroKanban" placeholder="Filtrar..." style="padding:6px; border:1px solid #ccc; border-radius:4px; font-size:12px; width:180px; flex-shrink:0;">
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                    <div style="font-size:11px; color:#666; white-space:nowrap;">De:</div>
                    <input type="date" id="dataInicioKanban" style="padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:11px; width:110px; flex-shrink:0;">
                    <div style="font-size:11px; color:#666; white-space:nowrap;">Até:</div>
                    <input type="date" id="dataFimKanban" style="padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:11px; width:110px; flex-shrink:0;">
                </div>
            </div>
        </div>
        <div class="kanban-board" style="display: flex; gap: 8px; overflow-x: auto; padding: 8px 0; min-height: 450px;">
            <div class="kanban-column" data-status="todo" style="flex: 1; min-width: 220px; max-width: 240px; background: #f5f5f5; border-radius: 6px; padding: 8px;">
                <div class="kanban-column-header" style="background: #ff6b6b; color: white; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                    <span>📋 A Fazer</span>
                    <span class="column-count" style="background: rgba(255,255,255,0.3); padding: 1px 5px; border-radius: 10px; font-size: 10px;">0</span>
                </div>
                <div class="kanban-cards" data-status="todo" style="min-height: 80px; transition: all 0.3s; border: 2px dashed transparent; border-radius: 4px;"></div>
            </div>
            
            <div class="kanban-column" data-status="inprogress" style="flex: 1; min-width: 220px; max-width: 240px; background: #f5f5f5; border-radius: 6px; padding: 8px;">
                <div class="kanban-column-header" style="background: #4ecdc4; color: white; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                    <span>⚡ Em Progresso</span>
                    <span class="column-count" style="background: rgba(255,255,255,0.3); padding: 1px 5px; border-radius: 10px; font-size: 10px;">0</span>
                </div>
                <div class="kanban-cards" data-status="inprogress" style="min-height: 80px; transition: all 0.3s; border: 2px dashed transparent; border-radius: 4px;"></div>
            </div>
            
            <div class="kanban-column" data-status="done" style="flex: 1; min-width: 220px; max-width: 240px; background: #f5f5f5; border-radius: 6px; padding: 8px;">
                <div class="kanban-column-header" style="background: #1dd1a1; color: white; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                    <span>✅ Concluído</span>
                    <span class="column-count" style="background: rgba(255,255,255,0.3); padding: 1px 5px; border-radius: 10px; font-size: 10px;">0</span>
                </div>
                <div class="kanban-cards" data-status="done" style="min-height: 80px; transition: all 0.3s; border: 2px dashed transparent; border-radius: 4px;"></div>
            </div>
        </div>
    `;

        const hoje = new Date();
        const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const ultimoDiaMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

        const dataInicioKanban = container.querySelector("#dataInicioKanban");
        const dataFimKanban = container.querySelector("#dataFimKanban");
        const filtroKanban = container.querySelector("#filtroKanban");

        const formatarDataParaInput = (data) => {
            return data.toISOString().split('T')[0];
        };

        dataInicioKanban.value = formatarDataParaInput(primeiroDiaMes);
        dataFimKanban.value = formatarDataParaInput(ultimoDiaMes);

        const getInsertPosition = (container, y, draggedCardId) => {
            const cards = Array.from(container.querySelectorAll('.kanban-card'));
            const otherCards = cards.filter(card => card.dataset.id !== draggedCardId);

            if (otherCards.length === 0) return 0;

            for (let i = 0; i < otherCards.length; i++) {
                const card = otherCards[i];
                const rect = card.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) {
                    return i;
                }
            }

            return otherCards.length;
        };

        const reordenarCardsNaColuna = async (status, movedCardId, newPosition) => {
            const eventsCache = await obterTodosEventos();
            const allCards = Object.values(eventsCache);
            const columnCards = allCards.filter(card => card.status === status);

            const movedCard = columnCards.find(card => card.id === movedCardId);
            if (!movedCard) return;

            const otherCards = columnCards.filter(card => card.id !== movedCardId);

            otherCards.sort((a, b) => (a.order || 0) - (b.order || 0));

            const reorderedCards = [];
            let currentOrder = 0;

            for (let i = 0; i <= otherCards.length; i++) {
                if (i === newPosition) {
                    reorderedCards.push({
                        ...movedCard,
                        order: currentOrder
                    });
                    currentOrder++;
                }

                if (i < otherCards.length) {
                    reorderedCards.push({
                        ...otherCards[i],
                        order: currentOrder
                    });
                    currentOrder++;
                }
            }

            for (const card of reorderedCards) {
                await salvarEventoCompleto(card);
            }
        };

        const abrirModalVisualizacaoKanban = (eventData) => {
            const statusLabel = getStatusLabel(eventData.status);
            const statusColor = getStatusColor(eventData.status);
            const statusIcon = getStatusIcon(eventData.status);

            const modalContent = `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                    <div>
                        <h3 style="margin: 0 0 5px 0; color: #333; font-size: 18px; font-weight: 600; word-break: break-word;">${eventData.title || 'Sem título'}</h3>
                        ${eventData.client ? `<p style="margin: 0 0 10px 0; color: #666; font-size: 14px; word-break: break-word;"><strong>Cliente:</strong> ${eventData.client}</p>` : ''}
                    </div>
                    <span style="display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 12px; background: ${statusColor}20; color: ${statusColor}; font-size: 12px; font-weight: 500; border: 1px solid ${statusColor}40; white-space: nowrap;">
                        ${statusIcon} ${statusLabel}
                    </span>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 15px;">
                    <div>
                        <p style="margin: 0 0 5px 0; font-size: 13px; color: #888; font-weight: 500;"><strong>Data:</strong></p>
                        <p style="margin: 0; font-size: 14px; color: #333; word-break: break-word;">${eventData.date || 'Não definida'}</p>
                    </div>
                    ${eventData.time ? `
                    <div>
                        <p style="margin: 0 0 5px 0; font-size: 13px; color: #888; font-weight: 500;"><strong>Hora:</strong></p>
                        <p style="margin: 0; font-size: 14px; color: #333; word-break: break-word;">${eventData.time}</p>
                    </div>
                    ` : ''}
                </div>
                
                ${eventData.problem ? `
                <div style="margin-bottom: 15px;">
                    <p style="margin: 0 0 5px 0; font-size: 13px; color: #888; font-weight: 500;"><strong>Problema/Descrição:</strong></p>
                    <div style="
                        margin: 0;
                        font-size: 14px;
                        color: #333;
                        line-height: 1.5;
                        padding: 8px;
                        background: #f8f9fa;
                        border-radius: 4px;
                        word-break: break-word;
                        overflow-wrap: break-word;
                    ">
                        ${eventData.problem.split('\n').map(line => line.trim()).filter(line => line).join(' ')}
                    </div>
                </div>
                ` : ''}
                
                ${eventData.notes ? `
                <div style="margin-bottom: 15px;">
                    <p style="margin: 0 0 5px 0; font-size: 13px; color: #888; font-weight: 500;"><strong>Observações:</strong></p>
                    <div style="
                        margin: 0;
                        font-size: 14px;
                        color: #333;
                        line-height: 1.5;
                        padding: 8px;
                        background: #f8f9fa;
                        border-radius: 4px;
                        word-break: break-word;
                        overflow-wrap: break-word;
                    ">
                        ${eventData.notes.split('\n').map(line => line.trim()).filter(line => line).join(' ')}
                    </div>
                </div>
                ` : ''}
                
                ${eventData.createdAt ? `
                <div style="border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px;">
                    <p style="margin: 0; font-size: 12px; color: #999; word-break: break-word;"><strong>Criado em:</strong> ${eventData.createdAt}</p>
                </div>
                ` : ''}
            </div>
        `;

            const existingModal = document.getElementById('viewEventModalKanban');
            if (existingModal) {
                existingModal.remove();
            }

            const modalDiv = document.createElement('div');
            modalDiv.id = 'viewEventModalKanban';
            modalDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2147483647;
            padding: 20px;
            box-sizing: border-box;
        `;

            modalDiv.innerHTML = `
            <div style="
                background: white;
                border-radius: 8px;
                width: 100%;
                max-width: min(500px, 95vw);
                max-height: min(85vh, 90%);
                overflow-y: auto;
                box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                border: 1px solid #ddd;
                position: relative;
                display: flex;
                flex-direction: column;
            ">
                <div style="
                    padding: 15px 20px;
                    border-bottom: 1px solid #eee;
                    background: #f8f9fa;
                    border-radius: 8px 8px 0 0;
                    position: sticky;
                    top: 0;
                    z-index: 2147483647;
                    flex-shrink: 0;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                        <h2 style="
                            margin: 0;
                            font-size: clamp(16px, 4vw, 18px);
                            color: #333;
                            font-weight: 600;
                            word-break: break-word;
                        ">Visualização de Evento</h2>
                        <button id="closeViewModalKanban" style="
                            border: none;
                            background: transparent;
                            color: #333;
                            font-size: 24px;
                            cursor: pointer;
                            width: 32px;
                            height: 32px;
                            min-width: 32px;
                            min-height: 32px;
                            border-radius: 4px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 0;
                            line-height: 1;
                            flex-shrink: 0;
                            font-weight: 500;
                            transition: background-color 0.2s;
                        ">×</button>
                    </div>
                </div>
                
                <div style="
                    padding: 20px;
                    flex: 1;
                    overflow-y: auto;
                    box-sizing: border-box;
                ">
                    ${modalContent}
                </div>
                
                <div style="
                    padding: 15px 20px;
                    border-top: 1px solid #eee;
                    background: #f8f9fa;
                    border-radius: 0 0 8px 8px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    justify-content: flex-end;
                    position: sticky;
                    bottom: 0;
                    flex-shrink: 0;
                ">
                    <button id="editEventBtnKanban" style="
                        padding: 8px 16px;
                        background: #4CAF50;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: clamp(13px, 3vw, 14px);
                        font-weight: 500;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        white-space: nowrap;
                        flex: 1;
                        min-width: 100px;
                        justify-content: center;
                    ">
                        Editar
                    </button>
                    <button id="deleteEventBtnKanban" style="
                        padding: 8px 16px;
                        background: #f44336;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: clamp(13px, 3vw, 14px);
                        font-weight: 500;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        white-space: nowrap;
                        flex: 1;
                        min-width: 100px;
                        justify-content: center;
                    ">
                        Excluir
                    </button>
                </div>
            </div>
        `;

            document.body.appendChild(modalDiv);

            const closeModal = () => {
                if (modalDiv && modalDiv.parentNode) {
                    modalDiv.parentNode.removeChild(modalDiv);
                }
            };

            const closeBtn1 = modalDiv.querySelector('#closeViewModalKanban');
            const closeBtn2 = modalDiv.querySelector('#closeViewModalKanban2');
            const editBtn = modalDiv.querySelector('#editEventBtnKanban');
            const deleteBtn = modalDiv.querySelector('#deleteEventBtnKanban');

            if (closeBtn1) closeBtn1.addEventListener('click', closeModal);
            if (closeBtn2) closeBtn2.addEventListener('click', closeModal);

            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    closeModal();
                    setTimeout(() => {
                        abrirModalKanban(eventData);
                    }, 50);
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    if (confirm('Tem certeza que deseja excluir este evento?')) {
                        await deletarEventoCompleto(eventData.id);
                        closeModal();
                        setTimeout(() => {
                            renderKanban(filtroKanban.value);
                        }, 50);
                    }
                });
            }

            modalDiv.addEventListener('click', (e) => {
                if (e.target === modalDiv) {
                    closeModal();
                }
            });

            const handleEscKey = (e) => {
                if (e.key === 'Escape') {
                    closeModal();
                    document.removeEventListener('keydown', handleEscKey);
                }
            };

            document.addEventListener('keydown', handleEscKey);

            modalDiv._escListener = handleEscKey;
        };

        const aplicarFiltroDataKanban = (cards) => {
            const dataInicioVal = dataInicioKanban.value;
            const dataFimVal = dataFimKanban.value;

            if (!dataInicioVal && !dataFimVal) {
                return cards;
            }

            let cardsFiltrados = cards;

            if (dataInicioVal) {
                cardsFiltrados = cardsFiltrados.filter(card => {
                    if (!card.date) return false;
                    return card.date >= dataInicioVal;
                });
            }

            if (dataFimVal) {
                cardsFiltrados = cardsFiltrados.filter(card => {
                    if (!card.date) return false;
                    return card.date <= dataFimVal;
                });
            }

            return cardsFiltrados;
        };

        const ordenarPorOrdem = (cards) => {
            return cards.sort((a, b) => {
                const orderA = a.order || 0;
                const orderB = b.order || 0;
                return orderA - orderB;
            });
        };

        const renderKanban = (filtroTexto = "") => {
            obterTodosEventos().then(eventsCache => {
                let allCards = Object.values(eventsCache);

                allCards = aplicarFiltroDataKanban(allCards);

                const columns = container.querySelectorAll('.kanban-column');

                columns.forEach(column => {
                    const status = column.dataset.status;
                    const cardsContainer = column.querySelector('.kanban-cards');
                    const countElement = column.querySelector('.column-count');

                    let filteredCards = allCards.filter(card => card.status === status);
                    filteredCards = ordenarPorOrdem(filteredCards);

                    if (filtroTexto) {
                        filteredCards = filteredCards.filter(card =>
                            card.title.toLowerCase().includes(filtroTexto.toLowerCase()) ||
                            (card.client && card.client.toLowerCase().includes(filtroTexto.toLowerCase())) ||
                            (card.problem && card.problem.toLowerCase().includes(filtroTexto.toLowerCase()))
                        );
                    }

                    countElement.textContent = filteredCards.length;
                    cardsContainer.innerHTML = '';

                    filteredCards.forEach((card, index) => {
                        if (card.order !== index) {
                            card.order = index;
                        }

                        const cardEl = document.createElement('div');
                        cardEl.className = 'kanban-card';
                        cardEl.dataset.id = card.id;
                        cardEl.dataset.status = card.status;
                        cardEl.dataset.order = card.order || 0;
                        cardEl.draggable = true;
                        cardEl.style.cssText = `
                        background: white;
                        border-radius: 4px;
                        padding: 6px;
                        margin-bottom: 4px;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.08);
                        cursor: grab;
                        border-left: 2px solid ${getStatusColor(card.status)};
                        transition: all 0.2s;
                        user-select: none;
                        position: relative;
                    `;

                        const isOverdue = card.date && card.status !== 'done' && UIBuilder.compararDatas(card.date);

                        const dataFormatada = card.date ?
                            new Date(card.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) :
                            '';

                        const atualizacaoFormatada = card.updatedAt ?
                            new Date(card.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) :
                            '';

                        cardEl.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3px;">
                            <h4 style="margin: 0; font-size: 11px; color: #333; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${card.title}</h4>
                            <button class="btn-edit-kanban" data-id="${card.id}" style="background: none; border: none; cursor: pointer; font-size: 9px; color: #666; flex-shrink: 0; padding: 1px 3px; border-radius: 2px; transition: background 0.2s; line-height: 1; z-index: 10;">✏️</button>
                        </div>
                        ${card.client ? `<div style="font-size: 9px; color: #666; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;"><strong>C:</strong> ${card.client}</div>` : ''}
                        ${card.problem ? `<div style="font-size: 9px; color: #777; margin-bottom: 4px; max-height: 24px; overflow: hidden; word-break: break-word; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${card.problem.split('\n').map(line => line.trim()).filter(line => line).join(' ')}</div>` : ''}
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                            <div style="font-size: 8px; color: ${isOverdue ? '#d32f2f' : '#999'}; font-weight: ${isOverdue ? '600' : 'normal'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70px;">
                                ${dataFormatada}
                                ${card.time ? `<br><span style="font-size:7px;">${card.time}</span>` : ''}
                                ${isOverdue ? ' ⚠️' : ''}
                            </div>
                            <div style="font-size: 8px; color: #999; flex-shrink: 0; text-align: right;">
                                ${atualizacaoFormatada}
                            </div>
                        </div>
                    `;

                        let mouseDownTime = 0;
                        let startX = 0;
                        let startY = 0;

                        cardEl.addEventListener('mousedown', (e) => {
                            mouseDownTime = Date.now();
                            startX = e.clientX;
                            startY = e.clientY;
                        });

                        cardEl.addEventListener('mouseup', (e) => {
                            const clickDuration = Date.now() - mouseDownTime;
                            const moveX = Math.abs(e.clientX - startX);
                            const moveY = Math.abs(e.clientY - startY);

                            if (clickDuration < 200 && moveX < 5 && moveY < 5) {
                                if (!e.target.closest('.btn-edit-kanban')) {
                                    abrirModalVisualizacaoKanban(card);
                                }
                            }
                        });

                        cardEl.addEventListener('dragstart', handleDragStart);
                        cardEl.addEventListener('dragend', handleDragEnd);

                        cardEl.querySelector('.btn-edit-kanban').addEventListener('click', (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            abrirModalKanban(card);
                        });

                        cardEl.addEventListener('mouseenter', () => {
                            cardEl.style.transform = 'translateY(-1px)';
                            cardEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.12)';
                        });

                        cardEl.addEventListener('mouseleave', () => {
                            cardEl.style.transform = 'translateY(0)';
                            cardEl.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
                        });

                        cardsContainer.appendChild(cardEl);
                    });

                    cardsContainer.addEventListener('dragover', handleDragOver);
                    cardsContainer.addEventListener('drop', handleDrop);
                    cardsContainer.addEventListener('dragenter', handleDragEnter);
                    cardsContainer.addEventListener('dragleave', handleDragLeave);
                });
            });
        };

        let draggedCard = null;

        const handleDragStart = (e) => {
            draggedCard = e.target;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedCard.dataset.id);

            setTimeout(() => {
                draggedCard.style.opacity = '0.4';
            }, 0);
        };

        const handleDragEnd = (e) => {
            if (draggedCard) {
                draggedCard.style.opacity = '1';
            }

            document.querySelectorAll('.kanban-cards').forEach(container => {
                container.style.border = '2px dashed transparent';
                container.style.backgroundColor = '';
            });

            draggedCard = null;
        };

        const handleDragOver = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const cardsContainer = e.target.closest('.kanban-cards');
            if (cardsContainer) {
                cardsContainer.style.border = '2px dashed #1a73e8';
            }
        };

        const handleDrop = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!draggedCard) return;

            const cardsContainer = e.target.closest('.kanban-cards');
            if (!cardsContainer) return;

            const newStatus = cardsContainer.dataset.status;
            const cardId = draggedCard.dataset.id;
            const oldStatus = draggedCard.closest('.kanban-cards').dataset.status;

            cardsContainer.style.border = '2px dashed transparent';
            cardsContainer.style.backgroundColor = '';

            const newPosition = getInsertPosition(cardsContainer, e.clientY, cardId);

            const eventsCache = await obterTodosEventos();
            const card = eventsCache[cardId];

            if (card) {
                if (oldStatus !== newStatus) {
                    const cardsNovaColuna = Object.values(eventsCache)
                        .filter(c => c.status === newStatus)
                        .sort((a, b) => (a.order || 0) - (b.order || 0));

                    const newOrder = cardsNovaColuna.length > 0 ?
                        Math.max(...cardsNovaColuna.map(c => c.order || 0)) + 1 : 0;

                    await salvarEventoCompleto({
                        ...card,
                        status: newStatus,
                        order: newOrder,
                        updatedAt: new Date().toISOString()
                    });
                } else {
                    await reordenarCardsNaColuna(newStatus, cardId, newPosition);
                }

                renderKanban(filtroKanban.value);
            }
        };

        const handleDragEnter = (e) => {
            e.preventDefault();
            const cardsContainer = e.target.closest('.kanban-cards');
            if (cardsContainer) {
                cardsContainer.style.border = '2px dashed #1a73e8';
                cardsContainer.style.backgroundColor = 'rgba(26, 115, 232, 0.03)';
            }
        };

        const handleDragLeave = (e) => {
            const cardsContainer = e.target.closest('.kanban-cards');
            if (cardsContainer && !cardsContainer.contains(e.relatedTarget)) {
                cardsContainer.style.border = '2px dashed transparent';
                cardsContainer.style.backgroundColor = '';
            }
        };

        const abrirModalKanban = (cardData = null) => {
            const isEdit = cardData !== null;

            UIBuilder.criarModalFormulario({
                title: isEdit ? '✏️ Editar Card' : '➕ Novo Card',
                fields: [
                    {
                        name: 'title',
                        label: 'Título',
                        type: 'text',
                        required: true,
                        value: cardData?.title || '',
                        placeholder: 'Título do card'
                    },
                    {
                        name: 'client',
                        label: 'Cliente',
                        type: 'text',
                        required: false,
                        value: cardData?.client || '',
                        placeholder: 'Nome do cliente'
                    },
                    {
                        name: 'problem',
                        label: 'Descrição',
                        type: 'textarea',
                        required: false,
                        value: cardData?.problem || '',
                        placeholder: 'Descrição detalhada...'
                    },
                    {
                        name: 'date',
                        label: 'Data',
                        type: 'date',
                        required: true,
                        value: cardData?.date || ''
                    },
                    {
                        name: 'time',
                        label: 'Hora',
                        type: 'time',
                        required: false,
                        value: cardData?.time || ''
                    },
                    {
                        name: 'status',
                        label: 'Status',
                        type: 'select',
                        required: true,
                        value: cardData?.status || 'todo',
                        options: [
                            { value: 'todo', label: 'A Fazer' },
                            { value: 'inprogress', label: 'Em Progresso' },
                            { value: 'done', label: 'Concluído' }
                        ]
                    }
                ],
                onSave: async (formData) => {
                    await salvarEventoCompleto({
                        ...formData,
                        id: cardData?.id,
                        createdAt: cardData?.createdAt,
                        order: cardData?.order || 0,
                        updatedAt: new Date().toISOString()
                    });
                    renderKanban(filtroKanban.value);
                },
                onDelete: isEdit ? async () => {
                    await deletarEventoCompleto(cardData.id);
                    renderKanban(filtroKanban.value);
                } : null
            });
        };

        renderKanban();

        container.querySelector('#btnAddKanban').addEventListener('click', () => {
            abrirModalKanban();
        });

        filtroKanban.addEventListener('input', (e) => {
            renderKanban(e.target.value);
        });

        dataInicioKanban.addEventListener('change', () => {
            renderKanban(filtroKanban.value);
        });

        dataFimKanban.addEventListener('change', () => {
            renderKanban(filtroKanban.value);
        });
    }

    function iniciarNotas(container) {
        container.innerHTML = `
        <div class="notes-container" style="display: flex; flex-direction: column; height: 550px; background: #f8f9fa; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08);">
            <div class="notes-header" style="padding: 16px 20px; background: white; border-bottom: 1px solid #e9ecef; display: flex; align-items: center; gap: 10px;">
                <div style="font-size: 24px;">📝</div>
                <div style="flex: 1;">
                    <div style="font-weight: 700; font-size: 16px; color: #333;">Notas Rápidas</div>
                    <div style="font-size: 12px; color: #666;">Digite e salve automaticamente</div>
                </div>
                <div id="notesCount" style="background: #1a73e8; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">0</div>
            </div>
            
            <div class="notes-list" id="notesList" style="flex: 1; overflow-y: auto; padding: 16px 20px; background: #f8f9fa; min-height: 250px;">
                <div style="text-align: center; padding: 40px 20px; color: #777;">
                    <div style="font-size: 48px; margin-bottom: 8px;">📝</div>
                    <h3 style="margin: 0 0 8px 0; color: #555; font-weight: 500;">Nenhuma nota ainda</h3>
                    <p style="margin: 0; color: #777; font-size: 14px;">Comece digitando abaixo</p>
                </div>
            </div>
            
            <div class="notes-input-container" style="padding: 16px 20px; background: white; border-top: 1px solid #e9ecef;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                    <div style="font-size: 12px; color: #666; font-weight: 600;">Tipo:</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; flex: 1;">
                        <button class="note-type-btn" data-type="info" style="background: #f0f7ff; color: #1a73e8; border: 1px solid #d0e2ff; padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;">
                            💡 Info
                        </button>
                        <button class="note-type-btn" data-type="idea" style="background: #fff8e6; color: #fbbc04; border: 1px solid #ffeeb5; padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;">
                            ✨ Ideia
                        </button>
                        <button class="note-type-btn" data-type="task" style="background: #e8f6ed; color: #34a853; border: 1px solid #b8e6cb; padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;">
                            ✅ Tarefa
                        </button>
                        <button class="note-type-btn" data-type="important" style="background: #fdeaea; color: #ea4335; border: 1px solid #f9c6c6; padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;">
                            🚨 Importante
                        </button>
                        <button class="note-type-btn" data-type="reminder" style="background: #f4e9ff; color: #8e44ad; border: 1px solid #e0c6ff; padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;">
                            ⏰ Lembrete
                        </button>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; align-items: flex-end;">
                    <div style="flex: 1; position: relative;">
                        <textarea id="noteText" placeholder="Digite sua nota aqui..." 
                                  style="width: 100%; padding: 12px 14px; border: 1px solid #e0e0e0; border-radius: 10px; font-size: 14px; resize: none; min-height: 50px; max-height: 100px; font-family: inherit; background: #fafafa; transition: border 0.2s; line-height: 1.4;"
                                  rows="2"></textarea>
                        <div id="charCount" style="position: absolute; bottom: 8px; right: 12px; font-size: 11px; color: #999; background: #fafafa; padding: 2px 6px; border-radius: 10px;">
                            0/1000
                        </div>
                    </div>
                    
                    <button id="btnAddNote" style="background: #1a73e8; color: white; border: none; padding: 12px 18px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s; min-width: 90px; height: 50px;">
                        <span>Enviar</span>
                    </button>
                </div>
                
                <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 11px; color: #666;">
                        Tipo: <span id="selectedTypeLabel" style="font-weight: 600; color: #1a73e8;">💡 Info</span>
                    </div>
                    <div style="font-size: 11px; color: #999;">
                        Ctrl + Enter para enviar
                    </div>
                </div>
            </div>
        </div>
        
        <style>
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .note-type-btn.active {
                font-weight: 700 !important;
                transform: scale(1.05);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .note-type-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            #btnAddNote:hover {
                background: #0d62d9 !important;
                transform: translateY(-1px);
                box-shadow: 0 3px 6px rgba(26, 115, 232, 0.2);
            }
            
            #noteText:focus {
                outline: none;
                border-color: #1a73e8 !important;
                background: white !important;
            }
        </style>
    `;

        let notas = [];
        let selectedType = 'info';

        const loadNotas = () => {
            return StorageHelper.get(["usuarioNotas"]).then(data => {
                notas = data.usuarioNotas || [];
                renderNotas();
                return notas;
            });
        };

        const saveNotas = () => {
            return StorageHelper.set({ usuarioNotas: notas });
        };

        const renderNotas = () => {
            const notesList = container.querySelector('#notesList');
            const notesCount = container.querySelector('#notesCount');

            notas.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            notesList.innerHTML = '';

            if (notas.length === 0) {
                notesList.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #777;">
                    <h3 style="margin: 0 0 8px 0; color: #555; font-weight: 500;">Nenhuma nota ainda</h3>
                    <p style="margin: 0; color: #777; font-size: 14px;">Comece digitando abaixo</p>
                </div>
            `;
                notesCount.textContent = '0';
                return;
            }

            notesCount.textContent = notas.length;

            const notesContainer = document.createElement('div');
            notesContainer.className = 'notes-group';
            notesContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

            notas.forEach((nota, index) => {
                const noteElement = document.createElement('div');
                noteElement.className = 'note-item';
                noteElement.style.cssText = `
                background: white;
                border-radius: 10px;
                padding: 12px 14px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.04);
                border-left: 3px solid ${getNoteTypeColor(nota.type)};
                animation: slideIn 0.2s ease-out ${index * 0.03}s both;
                max-width: 100%;
            `;

                const date = new Date(nota.createdAt);
                const timeString = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                noteElement.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 16px;">${getNoteTypeIcon(nota.type)}</span>
                        <span style="font-size: 11px; color: ${getNoteTypeColor(nota.type)}; background: ${getNoteTypeColor(nota.type)}10; padding: 4px 8px; border-radius: 10px; font-weight: 600;">
                            ${getNoteTypeLabel(nota.type)}
                        </span>
                    </div>
                    <button class="btn-delete-note" data-id="${nota.id}" style="background: none; border: none; cursor: pointer; font-size: 12px; color: #ddd; padding: 4px; transition: all 0.2s; border-radius: 4px;">
                        🗑️
                    </button>
                </div>
                <div style="font-size: 13px; color: #333; line-height: 1.5; margin-bottom: 10px; white-space: pre-wrap; word-break: break-word;">
                    ${nota.text.replace(/\n/g, '<br>')}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 10px; color: #999;">
                        ${timeString}
                    </div>
                    <div style="font-size: 10px; color: #999; font-style: italic;">
                        ${getTimeAgo(nota.createdAt)}
                    </div>
                </div>
            `;

                noteElement.querySelector('.btn-delete-note').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const noteId = e.target.dataset.id;
                    const noteIndex = notas.findIndex(n => n.id === noteId);
                    if (noteIndex !== -1) {
                        notas.splice(noteIndex, 1);
                        saveNotas().then(() => renderNotas());
                    }
                });

                noteElement.querySelector('.btn-delete-note').addEventListener('mouseenter', function () {
                    this.style.color = '#ea4335';
                    this.style.background = '#ffebee';
                });

                noteElement.querySelector('.btn-delete-note').addEventListener('mouseleave', function () {
                    this.style.color = '#ddd';
                    this.style.background = 'none';
                });

                notesContainer.appendChild(noteElement);
            });

            notesList.appendChild(notesContainer);

            setTimeout(() => {
                notesList.scrollTop = notesList.scrollHeight;
            }, 100);
        };

        const getNoteTypeColor = (type) => {
            switch (type) {
                case 'info': return '#1a73e8';
                case 'idea': return '#fbbc04';
                case 'task': return '#34a853';
                case 'important': return '#ea4335';
                case 'reminder': return '#8e44ad';
                default: return '#666';
            }
        };

        const getNoteTypeIcon = (type) => {
            switch (type) {
                case 'info': return '💡';
                case 'idea': return '✨';
                case 'task': return '✅';
                case 'important': return '🚨';
                case 'reminder': return '⏰';
                default: return '📝';
            }
        };

        const getNoteTypeLabel = (type) => {
            switch (type) {
                case 'info': return 'Info';
                case 'idea': return 'Ideia';
                case 'task': return 'Tarefa';
                case 'important': return 'Importante';
                case 'reminder': return 'Lembrete';
                default: return 'Nota';
            }
        };

        const getTimeAgo = (dateString) => {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'agora mesmo';
            if (diffMins < 60) return `há ${diffMins} min`;
            if (diffHours < 24) return `há ${diffHours} h`;
            if (diffDays === 1) return 'ontem';
            if (diffDays < 7) return `há ${diffDays} dias`;
            return `há ${Math.floor(diffDays / 7)} sem`;
        };

        const updateSelectedType = (type) => {
            selectedType = type;

            container.querySelectorAll('.note-type-btn').forEach(btn => {
                const btnType = btn.dataset.type;
                const isSelected = btnType === type;

                if (isSelected) {
                    btn.classList.add('active');
                    btn.style.background = getNoteTypeColor(type);
                    btn.style.color = 'white';
                    btn.style.borderColor = getNoteTypeColor(type);
                    btn.style.fontWeight = '700';
                } else {
                    btn.classList.remove('active');
                    const color = getNoteTypeColor(btnType);
                    btn.style.background = `${color}15`;
                    btn.style.color = color;
                    btn.style.borderColor = `${color}40`;
                    btn.style.fontWeight = '500';
                }
            });

            const label = container.querySelector('#selectedTypeLabel');
            label.textContent = `${getNoteTypeIcon(type)} ${getNoteTypeLabel(type)}`;
            label.style.color = getNoteTypeColor(type);
        };

        const updateCharCount = () => {
            const textarea = container.querySelector('#noteText');
            const charCount = container.querySelector('#charCount');
            const length = textarea.value.length;
            charCount.textContent = `${length}/1000`;

            if (length > 900) {
                charCount.style.color = '#ea4335';
                charCount.style.fontWeight = '600';
            } else if (length > 800) {
                charCount.style.color = '#fbbc04';
                charCount.style.fontWeight = '600';
            } else {
                charCount.style.color = '#999';
                charCount.style.fontWeight = 'normal';
            }
        };

        loadNotas();

        const textarea = container.querySelector('#noteText');
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            const newHeight = Math.min(this.scrollHeight, 100);
            this.style.height = newHeight + 'px';
            updateCharCount();
        });

        updateCharCount();

        container.querySelectorAll('.note-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                updateSelectedType(btn.dataset.type);
            });
        });

        updateSelectedType('info');

        container.querySelector('#btnAddNote').addEventListener('click', () => {
            const noteText = textarea.value.trim();

            if (noteText) {
                if (noteText.length > 1000) {
                    alert('A nota é muito longa! Máximo de 1000 caracteres.');
                    return;
                }

                const novaNota = {
                    id: UIBuilder.gerarIdUnico(),
                    text: noteText,
                    type: selectedType,
                    createdAt: new Date().toISOString()
                };

                notas.push(novaNota);
                saveNotas().then(() => {
                    renderNotas();
                    textarea.value = '';
                    textarea.style.height = '50px';
                    updateCharCount();
                    textarea.focus();
                });
            }
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                container.querySelector('#btnAddNote').click();
            }
        });

        setTimeout(() => {
            textarea.focus();
        }, 100);
    }

    migrarEventosAntigos();

    return {
        exibirAgenda,
        migrarEventosAntigos
    };
})();

window.AgendaModule = AgendaModule;