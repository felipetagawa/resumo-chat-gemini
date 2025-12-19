/**
 * ============================================
 * UI-BUILDER.JS - Construtores de Interface
 * ============================================
 * Funções auxiliares para construir elementos de UI
 */

const UIBuilder = (() => {
    /**
     * Cria um acordeão expansível
     * @param {string} titulo - Título do acordeão
     * @param {boolean} aberto - Estado inicial
     * @param {string} id - ID do container
     * @returns {object} {container, content, toggle}
     */
    function criarAcordeon(titulo, aberto = true, id = "") {
        const container = document.createElement("div");
        container.id = id;
        container.style = "margin-bottom: 10px;";

        const header = document.createElement("div");
        header.style = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 15px;
      background: ${aberto ? '#f1f5f9' : '#f8fafc'};
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      cursor: pointer;
      user-select: none;
      font-weight: 600;
      font-size: 14px;
      color: #334155;
      transition: background 0.2s;
    `;

        header.innerHTML = `
      <span>${titulo}</span>
      <span style="font-size: 18px; transition: transform 0.3s;">${aberto ? '−' : '+'}</span>
    `;

        const content = document.createElement("div");
        content.style = `
      border: 1px solid #e2e8f0;
      border-top: none;
      border-radius: 0 0 6px 6px;
      background: white;
      max-height: ${aberto ? 'none' : '0'};
      overflow: ${aberto ? 'visible' : 'hidden'};
      opacity: ${aberto ? '1' : '0'};
      transition: all 0.3s ease;
      margin-top: ${aberto ? '0' : '-1px'};
    `;

        if (aberto) {
            content.style.padding = '15px 15px 5px 15px';
            content.style.borderTop = 'none';
        } else {
            content.style.padding = '0';
            content.style.border = 'none';
        }

        let isOpen = aberto;

        function toggleAcordeon() {
            isOpen = !isOpen;

            const icon = header.querySelector('span:last-child');
            icon.textContent = isOpen ? '−' : '+';

            header.style.background = isOpen ? '#f1f5f9' : '#f8fafc';
            header.style.borderRadius = isOpen ? '6px 6px 0 0' : '6px';

            if (isOpen) {
                content.style.padding = '15px 15px 5px 15px';
                content.style.maxHeight = 'none';
                content.style.overflow = 'visible';
                content.style.opacity = '1';
                content.style.border = '1px solid #e2e8f0';
                content.style.borderTop = 'none';
                content.style.marginTop = '0';
            } else {
                content.style.padding = '0';
                content.style.maxHeight = '0';
                content.style.overflow = 'hidden';
                content.style.opacity = '0';
                content.style.border = 'none';
                content.style.marginTop = '-1px';
            }
        }

        header.addEventListener('click', toggleAcordeon);

        header.addEventListener('mouseenter', () => {
            header.style.background = isOpen ? '#e2e8f0' : '#f1f5f9';
        });

        header.addEventListener('mouseleave', () => {
            header.style.background = isOpen ? '#f1f5f9' : '#f8fafc';
        });

        container.appendChild(header);
        container.appendChild(content);

        return {
            container: container,
            content: content,
            toggle: toggleAcordeon
        };
    }

    /**
     * Cria modal de formulário
     * @param {object} config - {title, fields, onSave, onDelete}
     */
    function criarModalFormulario(config) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-form-container';

        modalContainer.innerHTML = `
      <div class="modal-form-header">
        <div class="modal-form-title">${config.title}</div>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-form-body">
        <form id="modalForm">
          ${config.fields.map(field => {
            if (field.type === 'textarea') {
                return `
                <div class="form-group">
                  <label class="form-label ${field.required ? 'required' : ''}">${field.label}</label>
                  <textarea 
                    class="form-textarea" 
                    name="${field.name}" 
                    ${field.required ? 'required' : ''}
                    placeholder="${field.placeholder || ''}"
                  >${field.value || ''}</textarea>
                </div>
              `;
            } else if (field.type === 'select') {
                return `
                <div class="form-group">
                  <label class="form-label ${field.required ? 'required' : ''}">${field.label}</label>
                  <select class="form-select" name="${field.name}" ${field.required ? 'required' : ''}>
                    ${field.options.map(opt =>
                    `<option value="${opt.value}" ${opt.value === field.value ? 'selected' : ''}>${opt.label}</option>`
                ).join('')}
                  </select>
                </div>
              `;
            } else {
                return `
                <div class="form-group ${field.halfWidth ? 'form-group-half' : ''}">
                  <label class="form-label ${field.required ? 'required' : ''}">${field.label}</label>
                  <input 
                    type="${field.type || 'text'}" 
                    class="form-input" 
                    name="${field.name}"
                    value="${field.value || ''}"
                    ${field.required ? 'required' : ''}
                    placeholder="${field.placeholder || ''}"
                  />
                </div>
              `;
            }
        }).join('')}
        </form>
      </div>
      <div class="modal-form-footer">
        ${config.onDelete ? '<button class="btn-danger" id="btnDeleteModal">Excluir</button><div style="flex:1;"></div>' : ''}
        <button class="btn-secondary" id="btnCancelModal">Cancelar</button>
        <button class="btn-primary" id="btnSaveModal">Salvar</button>
      </div>
    `;

        overlay.appendChild(modalContainer);
        document.body.appendChild(overlay);

        // Event handlers
        const closeModal = () => overlay.remove();

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        modalContainer.querySelector('.modal-close-btn').addEventListener('click', closeModal);
        modalContainer.querySelector('#btnCancelModal').addEventListener('click', closeModal);

        if (config.onDelete) {
            modalContainer.querySelector('#btnDeleteModal').addEventListener('click', () => {
                if (confirm('Tem certeza que deseja excluir este item?')) {
                    config.onDelete();
                    closeModal();
                }
            });
        }

        modalContainer.querySelector('#btnSaveModal').addEventListener('click', () => {
            const form = modalContainer.querySelector('#modalForm');
            if (form.checkValidity()) {
                const formData = {};
                config.fields.forEach(field => {
                    const input = form.querySelector(`[name="${field.name}"]`);
                    formData[field.name] = input.value;
                });
                config.onSave(formData);
                closeModal();
            } else {
                form.reportValidity();
            }
        });

        // Focus first input
        setTimeout(() => {
            const firstInput = modalContainer.querySelector('.form-input, .form-textarea, .form-select');
            if (firstInput) firstInput.focus();
        }, 100);
    }

    /**
     * Funções auxiliares de formatação
     */
    function gerarIdUnico() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    function formatarDataEvento(dateStr) {
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    }

    function compararDatas(dataEvento) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const dataComp = new Date(dataEvento + 'T00:00:00');
        return dataComp < hoje;
    }

    return {
        criarAcordeon,
        criarModalFormulario,
        gerarIdUnico,
        formatarDataEvento,
        compararDatas
    };
})();

// Export
window.UIBuilder = UIBuilder;
