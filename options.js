document.addEventListener("DOMContentLoaded", async () => {
  const input = document.getElementById("apiKey");
  const status = document.getElementById("status");

  // 🔹 Carregar chave salva (ao abrir a página)
  chrome.storage.sync.get("geminiApiKey", (data) => {
    if (data.geminiApiKey) {
      input.value = data.geminiApiKey;
      status.textContent = "🔒 Chave carregada.";
    }
  });

  // 🔹 Salvar chave (ao clicar no botão)
  document.getElementById("salvar").addEventListener("click", async () => {
    const apiKey = input.value.trim();

    if (!apiKey) {
      status.textContent = "⚠️ Por favor, insira a chave API.";
      return;
    }

    await chrome.storage.sync.set({ geminiApiKey: apiKey });
    status.textContent = "✅ Chave salva com sucesso!";
  });
});
