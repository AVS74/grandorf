document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');

  menuToggle.addEventListener('click', () => {
    nav.classList.toggle('active');
  });

  // Данные продуктов (замени на data.json)
  let products = [
    { name: "Grandorf Fresh для собак", type: "dry", animal: "dogs", brand: "fresh", weight: "2 кг", price: 2500, image: "fresh-dog-2kg.jpg", ingredients: "Курица, рис...", analysis: "Протеин 24%...", feeding: "100 г/день" },
    { name: "Grandorf Premier для кошек", type: "wet", animal: "cats", brand: "premier", weight: "400 г", price: 1500, image: "premier-cat-400g.jpg", ingredients: "Индейка, овощи...", analysis: "Протеин 20%...", feeding: "80 г/день" }
  ];

  let cart = [];

  // Рендер предпросмотра на главной
  function renderPreviewCards() {
    const preview = document.getElementById('preview-cards');
    preview.innerHTML = '';
    products.slice(0, 3).forEach(product => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h3>${product.name}</h3><p>${product.price} руб.</p>`;
      preview.appendChild(card);
    });
  }

  // Фильтры и рендер каталога
  function filterProducts() {
    const animalFilter = document.getElementById('animal-filter').value;
    const brandFilter = document.getElementById('brand-filter').value;
    const typeFilter = document.getElementById('type-filter').value;
    const productList = document.getElementById('product-list');
    productList.innerHTML = '';

    products.filter(product =>
      (animalFilter === 'all' || product.animal === animalFilter) &&
      (brandFilter === 'all' || product.brand === brandFilter) &&
      (typeFilter === 'all' || product.type === typeFilter)
    ).forEach(product => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <h3>${product.name}</h3>
        <p>Вес: ${product.weight}</p>
        <p>Цена: ${product.price} руб.</p>
        <button onclick="toggleDetails(this)">Подробнее</button>
        <div class="details">
          <p><strong>Ингредиенты:</strong> ${product.ingredients}</p>
          <p><strong>Анализ:</strong> ${product.analysis}</p>
          <p><strong>Норма:</strong> ${product.feeding}</p>
        </div>
        <button onclick="addToCart('${product.name}', ${product.price})">В корзину</button>
      `;
      productList.appendChild(card);
    });
  }

  function toggleDetails(button) {
    const card = button.parentElement;
    card.classList.toggle('active');
  }

  function addToCart(name, price) {
    const item = cart.find(item => item.name === name);
    if (item) item.quantity++;
    else cart.push({ name, price, quantity: 1 });
    updateCart();
  }

  function updateCart() {
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    cartItems.innerHTML = '';
    let total = 0;

    cart.forEach(item => {
      const itemTotal = item.price * item.quantity;
      total += itemTotal;
      const li = document.createElement('li');
      li.textContent = `${item.name} x${item.quantity} = ${itemTotal} руб.`;
      cartItems.appendChild(li);
    });

    if (total >= 7000) total = 0; // Бесплатная доставка
    else if (cart.length > 0) total *= 0.9; // 10% скидка

    cartTotal.textContent = `${total} руб.`;
  }

  // Форма заказа
  const orderForm = document.getElementById('order-form');
  if (orderForm) {
    orderForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const message = document.getElementById('order-message');
      message.textContent = 'Заказ отправлен! Скоро с вами свяжутся.';
      message.className = 'message success';
      orderForm.reset();
      setTimeout(() => message.className = 'message', 5000);
    });
  }

  // Инициализация
  renderPreviewCards();
  filterProducts();
  document.querySelectorAll('#animal-filter, #brand-filter, #type-filter').forEach(select => {
    select.addEventListener('change', filterProducts);
  });
});