(() => {
  const back = document.querySelector('#backToFieldVisitBtn');
  if (!back) return;
  back.onclick = () => {
    if (!state.currentVisit) return;
    hideViews();
    document.querySelector('#fieldVisitDetailView').classList.remove('hidden');
  };
})();
