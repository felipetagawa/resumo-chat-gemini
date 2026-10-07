// Compact, inline management inside the Smart Reply preview.
const SmartReplyProfilesUI = (() => {
  const store = () => SmartReplyProfilesModule;
  function node(tag, text = "", kind = "") {
    const el = document.createElement(tag); el.textContent = text;
    if (kind) el.className = `smart-reply-profiles-${kind}`; return el;
  }
  function mount(host) {
    const panel = node("section", "", "panel"); panel.hidden = true;
    panel.setAttribute("aria-label", "Gerenciar perfis de resposta"); host.appendChild(panel);
    const body = node("div", "", "body"), status = node("div", "", "status"); status.setAttribute("role", "status");
    panel.appendChild(body); panel.appendChild(status);
    const clear = () => { Array.from(body.children).forEach(el => el.remove()); body.scrollTop = 0; };
    function action(parent, label, fn, kind = "action") {
      const b = node("button", label, kind); b.type = "button";
      b.addEventListener("click", async () => {
        b.disabled = true; status.textContent = "";
        try { await fn(); } catch (err) { status.textContent = err?.message || "Não foi possível alterar o perfil."; }
        finally { b.disabled = false; }
      }); parent.appendChild(b); return b;
    }
    function editor(profile = null) {
      clear();
      const form = node("div", "", "editor"); body.appendChild(form);
      form.appendChild(node("h3", profile ? "Editar perfil" : "Novo perfil", "title"));
      const name = node("input", "", "name"); name.id = "atendeai-reply-profile-name";
      name.type = "text"; name.maxLength = 40; name.value = profile?.name || "";
      const nameLabel = node("label", "Nome"); nameLabel.setAttribute("for", name.id);
      const instruction = node("textarea", "", "instruction"); instruction.id = "atendeai-reply-profile-instruction";
      instruction.maxLength = 600; instruction.rows = 3; instruction.value = profile?.instruction || "";
      const styleLabel = node("label", "Como responder"); styleLabel.setAttribute("for", instruction.id);
      const help = node("p", "Defina somente estilo, tom e forma da resposta. As regras de segurança e factualidade do AtendeAI continuam sempre aplicadas.", "help");
      const counter = node("span", `${instruction.value.length}/600`, "counter");
      instruction.addEventListener("input", () => { counter.textContent = `${instruction.value.length}/600`; });
      for (const el of [nameLabel, name, styleLabel, instruction, help, counter]) form.appendChild(el);
      const actions = node("div", "", "actions"); form.appendChild(actions);
      action(actions, "Salvar perfil", async () => {
        await store().save({ id: profile?.id, name: name.value, instruction: instruction.value });
        render(); status.textContent = "Perfil salvo. Use Outra resposta para aplicar ao rascunho.";
      });
      action(actions, "Cancelar", render); name.focus();
    }
    function render() {
      clear(); status.textContent = "";
      const profiles = store().list();
      function section(title) {
        const el = node("section", "", "section"); el.setAttribute("aria-label", title);
        body.appendChild(el); return el;
      }
      const current = section("Perfil atual");
      current.appendChild(node("h3", "Perfil atual", "title"));
      current.appendChild(node("span", store().get(store().defaultId()).name, "chip"));
      const custom = section("Meus perfis"), header = node("div", "", "section-header");
      custom.appendChild(header); header.appendChild(node("h3", "Meus perfis", "title"));
      const create = action(header, "+ Novo perfil", () => editor()); create.disabled = profiles.filter(p => !p.builtin).length >= 8;
      for (const profile of profiles.filter(p => !p.builtin)) {
        const row = node("div", "", "row"); row.setAttribute("data-profile-id", profile.id);
        const heading = node("div", "", "row-header"); row.appendChild(heading);
        heading.appendChild(node("h4", profile.name, "name-title"));
        if (store().defaultId() === profile.id) heading.appendChild(node("span", "Padrão", "chip"));
        const actions = node("div", "", "actions"); row.appendChild(actions);
        action(actions, "Definir como padrão", async () => { await store().setDefault(profile.id); render(); status.textContent = "Perfil padrão salvo. Use Outra resposta para aplicar."; });
        action(actions, "Editar", () => editor(profile));
        action(actions, "Excluir", () => {
          Array.from(actions.children).forEach(el => el.remove());
          row.appendChild(node("span", "Excluir este perfil?", "help"));
          action(actions, "Confirmar exclusão", async () => { await store().remove(profile.id); render(); status.textContent = "Perfil excluído."; });
          action(actions, "Cancelar", render);
        }, "danger"); custom.appendChild(row);
      }
      const builtins = section("Perfis padrão"); builtins.appendChild(node("h3", "Perfis padrão", "title"));
      for (const profile of profiles.filter(p => p.builtin)) {
        const row = node("div", "", "row"); row.setAttribute("data-profile-id", profile.id);
        row.appendChild(node("h4", profile.name, "name-title")); row.appendChild(node("p", profile.instruction, "help"));
        const actions = node("div", "", "actions"); row.appendChild(actions);
        action(actions, "Duplicar e personalizar", async () => { editor(await store().duplicate(profile.id)); }); builtins.appendChild(row);
      }
      const rules = node("details", "", "rules"); rules.appendChild(node("summary", "Regras sempre aplicadas"));
      const list = node("ul");
      for (const rule of ["Usa somente fatos do atendimento e do adendo.", "Não inventa solução ou ação realizada.", "Não promete prazo.",
        "Não assume culpa sem evidência.", "Questões fiscais não substituem o contador.", "A resposta sempre passa por revisão.", "Nenhuma mensagem é enviada automaticamente."]) list.appendChild(node("li", rule));
      rules.appendChild(list); body.appendChild(rules);
    }
    return { toggle() { panel.hidden = !panel.hidden; host.setAttribute("data-profiles-open", String(!panel.hidden)); if (!panel.hidden) render(); return !panel.hidden; }, panel };
  }
  return { mount };
})();
window.SmartReplyProfilesUI = SmartReplyProfilesUI;
