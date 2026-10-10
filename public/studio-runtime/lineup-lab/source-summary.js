(() => {
  const sourceSelect = document.getElementById("dataSourceInput");
  const sourceSummary = document.getElementById("dataSourceSummary");
  if (!sourceSelect || !sourceSummary) return;

  const syncSelectionSummary = () => {
    sourceSummary.textContent = sourceSelect.selectedOptions[0]?.textContent?.trim() || "";
  };

  document.addEventListener("change", (event) => {
    if (event.target === sourceSelect) syncSelectionSummary();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncSelectionSummary, { once: true });
  } else {
    syncSelectionSummary();
  }
})();
