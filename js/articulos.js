// articulos.js — lógica del carrusel y tabs
// (aquí irá también la lectura de Firebase cuando se conecte)

// --- CARRUSEL ---
const carrusel = document.querySelector('.carrusel');
const btnPrev = document.querySelector('.carrusel-prev');
const btnNext = document.querySelector('.carrusel-next');

if (carrusel && btnPrev && btnNext) {
  const anchoPaso = () => carrusel.querySelector('.tarjeta').offsetWidth + 12;

  btnNext.addEventListener('click', () => {
    carrusel.scrollBy({ left: anchoPaso(), behavior: 'smooth' });
  });

  btnPrev.addEventListener('click', () => {
    carrusel.scrollBy({ left: -anchoPaso(), behavior: 'smooth' });
  });
}

// --- TABS ---
const tabs = document.querySelectorAll('.tab');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('activo'));
    tab.classList.add('activo');
    // TODO: filtrar tarjetas por categoría cuando haya datos reales
  });
});
