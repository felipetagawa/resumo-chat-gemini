# Gravações do CRM (diagnóstico dos retornos)

Aqui entram as gravações reais feitas com o **modo de diagnóstico** (Configurações › Retornos automáticos ›
Diagnóstico). Elas alimentam `tests/retornos-capture.test.js`, que reexecuta cada arquivo `.json` desta pasta.

Como gravar (só o Felipe, no trabalho normal; nada aqui salva ou finaliza por conta própria):

1. Ligue "Gravar o que o CRM mostra ao salvar" e recarregue a página do atendimento.
2. Faça **um Agendar** (reagendando um atendimento existente) e depois **uma finalização real**. Se quiser, provoque também uma recusa (por exemplo Agendar sem data) sem salvar.
3. Em cada caso, "Copiar gravação" e cole o JSON num arquivo, apagando a gravação antes do próximo caso.

Formato de cada arquivo: `{ "expect": { "outcome": "ok" | "refused", "mode": "agendar" | "finalizar" }, "log": [ ...entradas copiadas... ] }`.
Nomes sugeridos: `agendar-ok.json`, `finalizar-ok.json`, `recusado.json`.

O texto pessoal já sai mascarado (letras viram `a`, dígitos viram `9`); mesmo assim, confira o arquivo antes de commitar.
Com as gravações em mãos, preencha `RECORDED_SIGNATURES` em `modules/retornos-capture.js`: sem isso a detecção do salvamento
fica desligada de propósito (falha fechado: nada é criado nem removido).
