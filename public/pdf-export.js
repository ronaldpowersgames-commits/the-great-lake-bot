(function () {
  function open(documentData) {
    const created = Date.now();
    const id = 'lake-transcript-' + crypto.randomUUID();
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (!key?.startsWith('lake-transcript-')) continue;
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (!saved?.created || created - saved.created > 86400000) localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(id, JSON.stringify({
      ...documentData, created, exported: new Date(created).toLocaleString()
    }));
    const url = '/transcript-print.html?id=' + encodeURIComponent(id);
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      location.assign(url);
      return;
    }
    tab.opener = null;
    tab.location.replace(url);
  }

  window.LakePdfExport = { open };
})();
