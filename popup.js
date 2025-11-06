document.getElementById("gerar").addEventListener("click", async () => {
  const texto = document.getElementById("texto").value.trim();
  const resultado = document.getElementById("resultado");

  if (!texto) {
    resultado.value = "⚠️ Por favor, cole o texto do atendimento.";
    return;
  }

  resultado.value = "⏳ Gerando resumo...";

  chrome.runtime.sendMessage({ action: "gerarResumo", texto }, (response) => {
    if (response?.erro) {
      resultado.value = "❌ " + response.erro;
    } else if (response?.resumo) {
      resultado.value = response.resumo;
    } else {
      resultado.value = "⚠️ Nenhum resumo retornado.";
    }
  });
});

// Botão copiar
document.getElementById("copiar").addEventListener("click", () => {
  const resumo = document.getElementById("resultado").value;
  if (resumo.trim()) {
    navigator.clipboard.writeText(resumo);
    const btn = document.getElementById("copiar");
    btn.textContent = "✅ Copiado!";
    setTimeout(() => (btn.textContent = "📋 Copiar Resumo"), 2000);
  }
});
