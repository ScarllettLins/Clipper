// Carregado no <head> (script comum, sem módulo) para a página já nascer com o tema certo, sem piscar.
try {
  document.documentElement.dataset.theme = localStorage.getItem('clipper-tema') || 'light';
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
