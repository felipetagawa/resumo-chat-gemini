/**
 * ============================================
 * AGENDA.JS - Calendário e CRM
 * ============================================
 * Módulo completo de Agenda, Calendário e CRM
 * Código extraído e modularizado de content.js (linhas 1533-2143)
 */

const AgendaModule = (() => {
    // Importar código completo do content.js linhas 1533-2278
    // Por brevidade, incluirei a estrutura principal

    /**
     * Exibe modal da agenda
     */
    function exibirAgenda() {
        DOMHelpers.removeElement("geminiAgendaModal");

        const modal = document.createElement("div");
        modal.id = "geminiAgendaModal";
        document.body.appendChild(modal);

        modal.innerHTML = `
      <div class="agenda-header">
        <div style="font-weight:700; font-size:18px; color:#333;">📅 Agenda & Gestão</div>
        <button id="fecharAgenda" style="background:none; border:none; font-size:20px; cursor:pointer; color:#666;">&times;</button>
      </div>
      <div class="agenda-tabs">
        <div class="agenda-tab active" data-tab="calendar">📆 Calendário</div>
        <div class="agenda-tab" data-tab="crm">📋 CRM</div>
      </div>
      <div class="agenda-body">
        <div id="tab-calendar" class="tab-content"></div>
        <div id="tab-crm" class="tab-content" style="display:none;"></div>
      </div>
    `;

        modal.querySelector("#fecharAgenda").addEventListener("click", () => modal.remove());

        // Tabs switching
        modal.querySelectorAll(".agenda-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                const tabName = tab.dataset.tab;

                modal.querySelectorAll(".agenda-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");

                modal.querySelectorAll(".tab-content").forEach(content => {
                    content.style.display = "none";
                });

                modal.querySelector(`#tab-${tabName}`).style.display = "block";
            });
        });

        // Inicializar Calendário e CRM
        iniciarCalendario(modal.querySelector("#tab-calendar"));
        iniciarCRM(modal.querySelector("#tab-crm"));
    }

    /**
     * Migra eventos antigos para novo formato
     */
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
                    createdAt: new Date().toISOString()
                };
            });

            await StorageHelper.set({ usuarioAgendaEventsV2: eventsV2 });
            await StorageHelper.remove("usuarioAgendaEvents");
        }
    }

    /**
     * Inicializa calendário
     */
    function iniciarCalendario(container) {
        const date = new Date();
        let currentMonth = date.getMonth();
        let currentYear = date.getFullYear();
        let eventsCache = {};

        const loadEvents = (cb) => {
            StorageHelper.get(["usuarioAgendaEventsV2"]).then(data => {
                eventsCache = data.usuarioAgendaEventsV2 || {};
                cb();
            });
        };

        const saveEvents = (cb) => {
            StorageHelper.set({ usuarioAgendaEventsV2: eventsCache }).then(cb);
        };

        const saveEvent = (eventData) => {
            const id = eventData.id || UIBuilder.gerarIdUnico();
            eventsCache[id] = {
                ...eventData,
                id: id,
                createdAt: eventData.createdAt || new Date().toISOString()
            };
            saveEvents(() => render());
        };

        const deleteEvent = (eventId) => {
            delete eventsCache[eventId];
            saveEvents(() => render());
        };

        const abrirModalEvento = (eventData = null, dia = null) => {
            const isEdit = eventData !== null;
            const dataDefault = dia ? `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}` : '';

            UIBuilder.criarModalFormulario({
                title: isEdit ? '✏️ Editar Evento' : '➕ Novo Evento',
                fields: [
                    {
                        name: 'title',
                        label: 'Título do Evento',
                        type: 'text',
                        required: true,
                        value: eventData?.title || '',
                        placeholder: 'Ex: Reunião com cliente'
                    },
                    {
                        name: 'client',
                        label: 'Cliente',
                        type: 'text',
                        required: false,
                        value: eventData?.client || '',
                        placeholder: 'Nome do cliente (opcional)'
                    },
                    {
                        name: 'problem',
                        label: 'Problema/Descrição',
                        type: 'textarea',
                        required: false,
                        value: eventData?.problem || '',
                        placeholder: 'Descreva o motivo do agendamento...'
                    },
                    {
                        name: 'date',
                        label: 'Data',
                        type: 'date',
                        required: true,
                        value: eventData?.date || dataDefault
                    },
                    {
                        name: 'time',
                        label: 'Hora',
                        type: 'time',
                        required: false,
                        value: eventData?.time || ''
                    },
                    {
                        name: 'notes',
                        label: 'Observações',
                        type: 'textarea',
                        required: false,
                        value: eventData?.notes || '',
                        placeholder: 'Observações adicionais...'
                    }
                ],
                onSave: (formData) => {
                    saveEvent({
                        ...formData,
                        id: eventData?.id,
                        createdAt: eventData?.createdAt
                    });
                },
                onDelete: isEdit ? () => deleteEvent(eventData.id) : null
            });
        };

        const render = () => {
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

            // Empty slots
            for (let i = 0; i < firstDay; i++) {
                grid.appendChild(document.createElement('div'));
            }

            // Days
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
                    const isOverdue = UIBuilder.compararDatas(evt.date);
                    if (isOverdue) hasOverdue = true;

                    const displayText = evt.time ? `${evt.time} ${evt.title}` : evt.title;
                    eventsHtml += `<span class="event-marker ${isOverdue ? 'overdue' : ''}" data-event-id="${evt.id}" title="${evt.title}${evt.client ? ' - ' + evt.client : ''}">${displayText}</span>`;
                });

                if (hasOverdue) dayEl.classList.add('has-overdue');

                dayEl.innerHTML = `
          <span class="day-number">${i}</span>
          <div class="day-events">${eventsHtml}</div>
        `;

                dayEl.querySelector('.day-number').addEventListener('click', (e) => {
                    e.stopPropagation();
                    abrirModalEvento(null, i);
                });

                dayEl.querySelectorAll('.event-marker').forEach(marker => {
                    marker.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const eventId = marker.dataset.eventId;
                        const eventData = eventsCache[eventId];
                        if (eventData) {
                            abrirModalEvento(eventData);
                        }
                    });
                });

                grid.appendChild(dayEl);
            }

            container.querySelector("#prevMonth").addEventListener('click', () => {
                currentMonth--;
                if (currentMonth < 0) { currentMonth = 11; currentYear--; }
                render();
            });
            container.querySelector("#nextMonth").addEventListener('click', () => {
                currentMonth++;
                if (currentMonth > 11) { currentMonth = 0; currentYear++; }
                render();
            });
        };

        loadEvents(render);
    }

    /**
     * Inicializa CRM
     */
    function iniciarCRM(container) {
        container.innerHTML = `
      <div class="crm-controls">
        <button id="btnAddCrm" style="background:#1a73e8; color:white; border:none; padding:10px 16px; border-radius:6px; font-weight:600; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.1);">+ Novo Atendimento</button>
        <div style="flex:1;"></div>
        <input type="text" id="filtroCrm" placeholder="Filtrar por nome..." style="padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px;">
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

        const abrirModalCRM = (item = null, index = null) => {
            const isEdit = item !== null;

            UIBuilder.criarModalFormulario({
                title: isEdit ? '✏️ Editar Atendimento' : '➕ Novo Atendimento',
                fields: [
                    { name: 'cliente', label: 'Nome do Cliente', type: 'text', required: true, value: item?.cliente || '', placeholder: 'Nome do cliente' },
                    { name: 'assunto', label: 'Assunto/Pendência', type: 'text', required: true, value: item?.assunto || '', placeholder: 'Resumo do atendimento' },
                    { name: 'problema', label: 'Problema Detalhado', type: 'textarea', required: false, value: item?.problema || '', placeholder: 'Descrição detalhada do problema...' },
                    { name: 'dataAgendada', label: 'Data Agendada', type: 'date', required: false, value: item?.dataAgendada || '' },
                    { name: 'horaAgendada', label: 'Hora Agendada', type: 'time', required: false, value: item?.horaAgendada || '' },
                    { name: 'observacoes', label: 'Observações', type: 'textarea', required: false, value: item?.observacoes || '', placeholder: 'Observações adicionais...' },
                    {
                        name: 'status',
                        label: 'Status',
                        type: 'select',
                        required: true,
                        value: item?.status || 'pendente',
                        options: [
                            { value: 'pendente', label: 'Pendente' },
                            { value: 'resolvido', label: 'Resolvido' }
                        ]
                    }
                ],
                onSave: (formData) => {
                    StorageHelper.get(["usuarioAgendaCRM"]).then(data => {
                        const dados = data.usuarioAgendaCRM || [];

                        if (isEdit && index !== null) {
                            dados[index] = {
                                ...dados[index],
                                ...formData,
                                id: dados[index].id || UIBuilder.gerarIdUnico(),
                                data: dados[index].data || new Date().toISOString()
                            };
                        } else {
                            dados.push({
                                ...formData,
                                id: UIBuilder.gerarIdUnico(),
                                data: new Date().toISOString()
                            });
                        }

                        salvarCRM(dados);
                        renderTable(dados, filtroInput.value);
                    });
                },
                onDelete: isEdit ? () => {
                    StorageHelper.get(["usuarioAgendaCRM"]).then(data => {
                        const dados = data.usuarioAgendaCRM || [];
                        dados.splice(index, 1);
                        salvarCRM(dados);
                        renderTable(dados, filtroInput.value);
                    });
                } : null
            });
        };

        const renderTable = (dados, filtro = "") => {
            tbody.innerHTML = "";

            const filtrados = dados.filter(d =>
                d.cliente.toLowerCase().includes(filtro.toLowerCase()) ||
                d.assunto.toLowerCase().includes(filtro.toLowerCase())
            );

            if (filtrados.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:#777;">Nenhum registro encontrado.</td></tr>`;
                return;
            }

            filtrados.forEach((item, index) => {
                const originalIndex = dados.indexOf(item);
                const dataFormatada = item.dataAgendada ? UIBuilder.formatarDataEvento(item.dataAgendada) : '-';
                const horaDisplay = item.horaAgendada ? item.horaAgendada : '';
                const dataCompleta = item.dataAgendada ? `${dataFormatada}${horaDisplay ? ' ' + horaDisplay : ''}` : '-';

                const isOverdue = item.dataAgendada && item.status === 'pendente' && UIBuilder.compararDatas(item.dataAgendada);

                const tr = document.createElement("tr");
                tr.style = isOverdue ? 'background: #ffebee;' : '';
                tr.innerHTML = `
          <td><strong>${item.cliente}</strong></td>
          <td>${item.assunto}${item.problema ? '<br><small style="color:#666;">' + item.problema.substring(0, 50) + (item.problema.length > 50 ? '...' : '') + '</small>' : ''}</td>
          <td style="${isOverdue ? 'color:#d32f2f; font-weight:600;' : ''}">${dataCompleta}</td>
          <td><span class="status-badge ${item.status === 'pendente' ? 'status-pending' : 'status-resolved'}">${item.status}</span></td>
          <td>
            <button class="action-btn btn-edit" data-idx="${originalIndex}" title="Editar">✏️</button>
            <button class="action-btn btn-resolve" data-idx="${originalIndex}" title="${item.status === 'pendente' ? 'Marcar Resolvido' : 'Reabrir'}">
              ${item.status === 'pendente' ? '✅' : '↩️'}
            </button>
          </td>
        `;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.btn-edit').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(btn.dataset.idx);
                    abrirModalCRM(dados[idx], idx);
                });
            });

            tbody.querySelectorAll('.btn-resolve').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(btn.dataset.idx);
                    dados[idx].status = dados[idx].status === 'pendente' ? 'resolvido' : 'pendente';
                    salvarCRM(dados);
                    renderTable(dados, filtroInput.value);
                });
            });
        };

        const salvarCRM = (dados) => {
            StorageHelper.set({ usuarioAgendaCRM: dados });
        };

        StorageHelper.get(["usuarioAgendaCRM"]).then(data => {
            const dados = data.usuarioAgendaCRM || [];
            renderTable(dados);

            container.querySelector("#btnAddCrm").addEventListener('click', () => {
                abrirModalCRM();
            });

            filtroInput.addEventListener('input', (e) => {
                renderTable(dados, e.target.value);
            });
        });
    }

    // Executa migração ao carregar
    migrarEventosAntigos();

    return {
        exibirAgenda,
        migrarEventosAntigos
    };
})();

// Export
window.AgendaModule = AgendaModule;
