// Live Server veya statik dosya sunucusu koruması:
// Vite dev sunucusu yerine VS Code Live Server (5500/5501) veya file:// üzerinden kök index.html açılırsa,
// .ts modüllerinin MIME hatasıyla reddedilmesini önlemek için derlenmiş dist/index.html sürümüne yönlendir.
(function () {
  var isLiveServer = location.port === '5501' || location.port === '5500';
  var isFileProtocol = location.protocol === 'file:';
  if (location.pathname.indexOf('/dist/') !== -1) return;

  if (isFileProtocol) {
    location.replace('./dist/index.html' + location.search + location.hash);
  } else if (isLiveServer) {
    fetch('./dist/index.html', { method: 'HEAD' })
      .then(function (res) {
        if (res.ok) {
          location.replace('./dist/index.html' + location.search + location.hash);
        }
      })
      .catch(function () {
        // Zaten dist/ klasöründen servis ediliyorsa yönlendirme yapma
      });
  }
})();
