const NotificationsModule = (() => {
    let lastCheckedClientName = "";

    function verificarNotificacoesChat() {
        const chatContainer = document.querySelector('.chats-list');
        if (!chatContainer) return;

        const activeChat = chatContainer.querySelector('.chat.active');
        if (!activeChat) return;

        const clientNameEl = activeChat.querySelector('.chat-name');
        if (!clientNameEl) return;

        const clientName = clientNameEl.textContent.trim();

        if (clientName && clientName !== lastCheckedClientName) {
            lastCheckedClientName = clientName;
            checkAndShowNotification(clientName);
        }
    }

    async function checkAndShowNotification(clientName) {
        const data = await StorageHelper.get(['usuarioAgendaEventsV2', 'usuarioAgendaCRM']);

        const calendarEvents = data.usuarioAgendaEventsV2 || {};
        const crmItems = data.usuarioAgendaCRM || [];

        const matches = [];

        Object.values(calendarEvents).forEach(evt => {
            if (evt.client && evt.client.toLowerCase().includes(clientName.toLowerCase())) {
                matches.push({ type: 'event', data: evt });
            }
        });

        crmItems.forEach(item => {
            if (item.cliente && item.cliente.toLowerCase().includes(clientName.toLowerCase())) {
                matches.push({ type: 'crm', data: item });
            }
        });

        if (matches.length > 0) {
            exibirNotificacaoSistema(clientName, matches);
        }
    }

    function exibirNotificacaoSistema(clientName, matches) {
        DOMHelpers.removeElement('gemini-notification-toast');

        const toast = document.createElement('div');
        toast.id = 'gemini-notification-toast';
        toast.style = `
      position: fixed; top: 90px; right: 20px; background: #fff;
      border-left: 6px solid #1a73e8; padding: 16px 20px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.15); border-radius: 6px;
      z-index: 1000000; font-family: 'Segoe UI', sans-serif;
      animation: slideIn 0.5s ease-out; min-width: 300px;
    `;

        let detailsHtml = '';
        matches.forEach(match => {
            if (match.type === 'event') {
                const evt = match.data;
                detailsHtml += `<div style="margin-top:8px;">📅 Evento: <strong>${evt.title}</strong> - ${evt.date}</div>`;
            } else if (match.type === 'crm') {
                const item = match.data;
                detailsHtml += `<div style="margin-top:8px;">📋 CRM: <strong>${item.assunto}</strong> - Status: ${item.status}</div>`;
            }
        });

        toast.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:start;">
         <div style="flex:1;">
           <div style="font-weight:700; color:#1a73e8; margin-bottom:4px; font-size:14px;">📌 Informações do Cliente</div>
           <div style="color:#555; font-size:13px;">Cliente: <strong>${clientName}</strong></div>
           ${detailsHtml}
         </div>
         <button id="closeToast" style="background:none; border:none; cursor:pointer; color:#999; font-size:18px; margin-left:10px;">&times;</button>
      </div>
      <div style="margin-top:12px; text-align:right;">
          <button id="btnVerAgenda" style="background:#1a73e8; color:white; border:none; padding:8px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Ver Agenda</button>
      </div>
    `;

        document.body.appendChild(toast);

        toast.querySelector('#closeToast').addEventListener('click', () => toast.remove());
        toast.querySelector('#btnVerAgenda').addEventListener('click', () => {
            AgendaModule.exibirAgenda();
            toast.remove();
        });

        setTimeout(() => {
            if (document.body.contains(toast)) {
                toast.style.animation = 'fadeOut 0.5s ease-in';
                setTimeout(() => toast.remove(), 450);
            }
        }, 10000);
    }

    async function verificarEventosVencidos() {
        const calData = await StorageHelper.get(['usuarioAgendaEventsV2']);
        const calendarEvents = calData.usuarioAgendaEventsV2 || {};

        const crmData = await StorageHelper.get(['usuarioAgendaCRM']);
        const crmItems = crmData.usuarioAgendaCRM || [];

        const overdueCalendar = [];
        const overdueCRM = [];

        Object.values(calendarEvents).forEach(evt => {
            if (evt.date && UIBuilder.compararDatas(evt.date)) {
                overdueCalendar.push(evt);
            }
        });

        crmItems.forEach(item => {
            if (item.dataAgendada && item.status === 'pendente' && UIBuilder.compararDatas(item.dataAgendada)) {
                overdueCRM.push(item);
            }
        });

        const totalOverdue = overdueCalendar.length + overdueCRM.length;

        if (totalOverdue > 0) {
            const notifData = await StorageHelper.get(['lastOverdueNotification']);
            const lastNotif = notifData.lastOverdueNotification || 0;
            const now = Date.now();

            if (now - lastNotif > 30 * 60 * 1000) {
                exibirNotificacaoEventoVencido(overdueCalendar, overdueCRM);
                await StorageHelper.set({ lastOverdueNotification: now });
            }
        }
    }

    function exibirNotificacaoEventoVencido(calendarEvents, crmEvents) {
        DOMHelpers.removeElement('gemini-overdue-toast');

        const total = calendarEvents.length + crmEvents.length;
        if (total === 0) return;

        const toast = document.createElement('div');
        toast.id = 'gemini-overdue-toast';
        toast.style = `
      position: fixed; top: 90px; right: 20px; background: #fff;
      border-left: 6px solid #d32f2f; padding: 16px 20px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.15); border-radius: 6px;
      z-index: 1000000; font-family: 'Segoe UI', sans-serif;
      animation: slideIn 0.5s ease-out; min-width: 320px; max-width: 400px;
    `;

        let detailsHtml = '';

        if (calendarEvents.length > 0) {
            detailsHtml += `<div style="margin-top: 8px;">
        <strong style="color:#d32f2f;">📅 Calendário (${calendarEvents.length}):</strong>
        <ul style="margin: 4px 0 0 20px; padding: 0; font-size: 12px;">
          ${calendarEvents.slice(0, 3).map(evt =>
                `<li>${evt.title} ${evt.date ? '- ' + UIBuilder.formatarDataEvento(evt.date) : ''}</li>`
            ).join('')}
          ${calendarEvents.length > 3 ? `<li><em>e mais ${calendarEvents.length - 3}...</em></li>` : ''}
        </ul>
      </div>`;
        }

        if (crmEvents.length > 0) {
            detailsHtml += `<div style="margin-top: 8px;">
        <strong style="color:#d32f2f;">📋 CRM (${crmEvents.length}):</strong>
        <ul style="margin: 4px 0 0 20px; padding: 0; font-size: 12px;">
          ${crmEvents.slice(0, 3).map(item =>
                `<li>${item.cliente} - ${item.assunto}</li>`
            ).join('')}
          ${crmEvents.length > 3 ? `<li><em>e mais ${crmEvents.length - 3}...</em></li>` : ''}
        </ul>
      </div>`;
        }

        toast.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:start;">
         <div style="flex:1;">
           <div style="font-weight:700; color:#d32f2f; margin-bottom:4px; font-size:14px;">⚠️ Eventos Vencidos</div>
           <div style="color:#555; font-size:13px; margin-bottom:2px;">Você tem ${total} evento(s) com data vencida</div>
           ${detailsHtml}
         </div>
         <button id="closeOverdueToast" style="background:none; border:none; cursor:pointer; color:#999; font-size:18px; margin-left:10px;">&times;</button>
      </div>
      <div style="margin-top:12px; text-align:right;">
          <button id="btnVerAgendaOverdue" style="background:#d32f2f; color:white; border:none; padding:8px 14px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px;">Ver Agenda</button>
      </div>
    `;

        document.body.appendChild(toast);

        toast.querySelector('#closeOverdueToast').addEventListener('click', () => {
            toast.remove();
        });

        toast.querySelector('#btnVerAgendaOverdue').addEventListener('click', () => {
            AgendaModule.exibirAgenda();
            toast.remove();
        });

        setTimeout(() => {
            if (document.body.contains(toast)) {
                toast.style.animation = 'fadeOut 0.5s ease-in';
                setTimeout(() => toast.remove(), 450);
            }
        }, 15000);
    }

    function init() {

        setInterval(() => {
            verificarEventosVencidos();
        }, 5 * 60 * 1000);

        setTimeout(() => {
            verificarEventosVencidos();
        }, 10000);
    }

    return {
        verificarNotificacoesChat,
        verificarEventosVencidos,
        init
    };
})();

window.NotificationsModule = NotificationsModule;
