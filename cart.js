/* cart.js — корзина и оформление заказа для сайта зоомагазина «Чемпион»
   Подключается на любой странице (index.html, catalog.html, product.html).
   Ничего не требует от страницы — сам добавляет плавающую кнопку корзины,
   панель корзины и модалку оформления заказа.

   Публичный API (для добавления товара с других страниц):
     window.Cart.add({ id, weight, price, title, brand, img, qty })

   Правила расчёта итоговой цены:
     — самовывоз            → цена не меняется
     — доставка, сумма ≥7000 ₽ → доставка бесплатно, цена не меняется
     — доставка, сумма <7000 ₽ → скидка 7%, если доставку клиент организует сам
*/
(function () {
  'use strict';

  if (window.__championCartInitialized) return; // защита от повторного подключения
  window.__championCartInitialized = true;

  var STORAGE_KEY = 'champion_cart_v1';
  var FREE_DELIVERY_THRESHOLD = 7000;
  var DISCOUNT_RATE = 0.07;
  var ORDER_ENDPOINT = 'order.php';
  var SHOP_PHONE = '+7 (962) 485-46-25';

  // Часы работы магазина: 1=Пн ... 6=Сб, 0=Вс (закрыто). Значения — минуты от полуночи.
  var BUSINESS_HOURS = {
    1: [11 * 60, 20 * 60],
    2: [11 * 60, 20 * 60],
    3: [11 * 60, 20 * 60],
    4: [11 * 60, 20 * 60],
    5: [11 * 60, 20 * 60],
    6: [10 * 60, 14 * 60 + 30],
    0: null
  };
  var SLOT_STEP_MIN = 30;
  var MAX_ADVANCE_MS = 24 * 60 * 60 * 1000; // максимум на сутки вперёд (мягко расширяется, если окон нет)

  var cart = loadCart();

  // ---------- хранилище ----------
  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch (e) {}
  }

  function keyOf(id, weight) { return id + '::' + weight; }

  // ---------- операции с корзиной ----------
  function add(input) {
    input = input || {};
    var id = input.id, weight = input.weight, price = Number(input.price);
    if (!id || !weight || isNaN(price)) return;
    var qtyToAdd = (input.qty && input.qty > 0) ? input.qty : 1;
    var k = keyOf(id, weight);
    var existing = null;
    for (var i = 0; i < cart.length; i++) { if (cart[i].key === k) { existing = cart[i]; break; } }
    if (existing) {
      existing.qty += qtyToAdd;
    } else {
      cart.push({
        key: k, id: id, weight: weight, price: price,
        title: input.title || '', brand: input.brand || '', img: input.img || '',
        qty: qtyToAdd
      });
    }
    persist();
    pulseCartButton();
  }

  function setQty(key, qty) {
    var it = null;
    for (var i = 0; i < cart.length; i++) { if (cart[i].key === key) { it = cart[i]; break; } }
    if (!it) return;
    if (qty <= 0) { removeItem(key); return; }
    it.qty = qty;
    persist();
  }

  function removeItem(key) {
    cart = cart.filter(function (i) { return i.key !== key; });
    persist();
  }

  function clearCart() {
    cart = [];
    persist();
  }

  function subtotal() {
    return cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
  }

  function count() {
    return cart.reduce(function (s, i) { return s + i.qty; }, 0);
  }

  function persist() {
    saveCart();
    renderBadge();
    renderDrawer();
    renderCheckoutSummary();
  }

  // ---------- вспомогательное ----------
  function fmt(n) { return Number(n).toLocaleString('ru-RU') + ' ₽'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // ---------- стили ----------
  function injectStyles() {
    if (document.getElementById('champion-cart-styles')) return;
    var css = ''
      + '.cart-toggle{position:fixed;top:16px;right:16px;z-index:1900;display:flex;align-items:center;gap:8px;'
      + 'background:color-mix(in srgb, var(--beige,#F5E9C9) 85%, white);color:var(--ink,#1C1C1C);'
      + 'border:1px solid color-mix(in srgb, var(--ink,#1C1C1C) 12%, transparent);border-radius:999px;'
      + 'padding:10px 16px;font:600 14px/1 var(--font-cta,Inter,sans-serif);cursor:pointer;'
      + 'box-shadow:var(--shadow-soft,0 4px 20px rgba(0,0,0,.08));transition:transform .15s ease;}'
      + '.cart-toggle:hover{transform:translateY(-1px);}'
      + '.cart-toggle-icon{font-size:18px;line-height:1;}'
      + '.cart-count{background:var(--olive,#A6B48C);color:#102010;border-radius:999px;min-width:20px;height:20px;'
      + 'display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;padding:0 5px;}'
      + '.cart-count[hidden]{display:none;}'
      + '.cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1950;}'
      + '.cart-overlay[hidden]{display:none;}'
      + '.cart-drawer{position:fixed;top:0;right:0;bottom:0;width:min(400px,100%);background:var(--white,#fff);'
      + 'z-index:1960;box-shadow:-8px 0 30px rgba(0,0,0,.15);display:flex;flex-direction:column;'
      + 'transform:translateX(100%);transition:transform .25s ease;}'
      + '.cart-drawer.is-open{transform:translateX(0);}'
      + '.cart-drawer[hidden]{display:flex;}' /* hidden управляется через is-open, но оставляем flex */
      + '.cart-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;'
      + 'border-bottom:1px solid color-mix(in srgb, var(--ink,#1C1C1C) 10%, transparent);}'
      + '.cart-drawer-head h3{margin:0;}'
      + '.cart-close{background:none;border:none;font-size:26px;line-height:1;cursor:pointer;color:var(--muted,#666);padding:0 4px;}'
      + '.cart-close:hover{color:var(--ink,#1C1C1C);}'
      + '.cart-items{flex:1;overflow-y:auto;padding:10px 14px;}'
      + '.cart-empty{padding:40px 20px;text-align:center;color:var(--muted,#666);}'
      + '.cart-item{display:grid;grid-template-columns:52px 1fr;gap:10px;padding:12px 0;'
      + 'border-bottom:1px solid color-mix(in srgb, var(--ink,#1C1C1C) 8%, transparent);}'
      + '.cart-item-img{width:52px;height:52px;object-fit:contain;background:var(--beige,#F5E9C9);border-radius:10px;}'
      + '.cart-item-title{font-weight:600;font-size:14px;line-height:1.3;}'
      + '.cart-item-meta{font-size:12px;color:var(--muted,#666);margin:2px 0 6px;}'
      + '.cart-item-price{font-size:13px;color:var(--ink,#1C1C1C);margin-bottom:6px;}'
      + '.cart-item-actions{display:flex;align-items:center;gap:8px;}'
      + '.cart-qty-btn{width:26px;height:26px;border-radius:8px;border:1px solid color-mix(in srgb, var(--ink,#1C1C1C) 15%, transparent);'
      + 'background:var(--beige,#F5E9C9);cursor:pointer;font-size:15px;line-height:1;}'
      + '.cart-qty-val{min-width:18px;text-align:center;font-weight:600;font-size:13px;}'
      + '.cart-remove-btn{margin-left:auto;background:none;border:none;color:var(--muted,#666);font-size:18px;cursor:pointer;}'
      + '.cart-remove-btn:hover{color:#b3311f;}'
      + '.cart-footer{padding:14px 18px 18px;border-top:1px solid color-mix(in srgb, var(--ink,#1C1C1C) 10%, transparent);}'
      + '.cart-subtotal{display:flex;justify-content:space-between;font-size:15px;margin-bottom:12px;}'
      + '.cart-checkout-btn{width:100%;}'
      + '.cart-checkout-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;}'
      + '.cart-freeship{padding:10px 14px 4px;}'
      + '.cart-freeship-text{font-size:12.5px;color:var(--muted,#666);margin-bottom:6px;line-height:1.4;}'
      + '.cart-freeship-text strong{color:var(--ink,#1C1C1C);}'
      + '.cart-freeship-track{height:6px;border-radius:999px;background:color-mix(in srgb, var(--ink,#1C1C1C) 8%, transparent);overflow:hidden;}'
      + '.cart-freeship-fill{height:100%;border-radius:999px;background:var(--olive,#A6B48C);transition:width .3s ease;}'
      + '.cart-freeship.is-complete .cart-freeship-text{color:#3a6b2e;font-weight:600;}'
      + '.checkout-modal{position:fixed;inset:0;z-index:1980;display:flex;align-items:center;justify-content:center;padding:16px;}'
      + '.checkout-modal[hidden]{display:none;}'
      + '.checkout-card{position:relative;background:var(--white,#fff);border-radius:var(--radius-lg,16px);'
      + 'padding:24px 22px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);}'
      + '.checkout-card .cart-close{position:absolute;top:12px;right:14px;}'
      + '.checkout-block{margin-bottom:16px;}'
      + '.checkout-label{display:block;font-weight:600;font-size:14px;margin-bottom:8px;}'
      + '.checkout-radio{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid color-mix(in srgb, var(--ink,#1C1C1C) 15%, transparent);'
      + 'border-radius:var(--radius-sm,12px);margin-bottom:8px;cursor:pointer;font-size:14px;}'
      + '.checkout-radio input{margin-top:3px;flex-shrink:0;}'
      + '.checkout-radio-body{display:flex;flex-direction:column;gap:2px;}'
      + '.checkout-radio-title{font-weight:600;}'
      + '.checkout-radio-hint{font-size:12.5px;color:var(--muted,#666);}'
      + '.delivery-terms{background:color-mix(in srgb, var(--beige,#F5E9C9) 60%, white);border-radius:var(--radius-sm,12px);'
      + 'padding:12px 14px;margin:2px 0 10px;}'
      + '.delivery-terms-title{font-weight:600;font-size:13.5px;margin-bottom:6px;}'
      + '.delivery-terms-list{margin:0;padding-left:18px;font-size:13px;color:var(--ink,#1C1C1C);line-height:1.5;}'
      + '.delivery-terms-list li{margin-bottom:2px;}'
      + '.checkout-radio:has(input:checked){border-color:var(--olive,#A6B48C);background:color-mix(in srgb, var(--olive,#A6B48C) 15%, white);}'
      + '.method-confirm{display:flex;align-items:center;gap:8px;background:color-mix(in srgb, var(--olive,#A6B48C) 22%, white);'
      + 'border:1px solid var(--olive,#A6B48C);border-radius:var(--radius-sm,12px);padding:10px 12px;font-size:13.5px;'
      + 'color:#2c4a22;font-weight:600;margin-top:2px;}'
      + '.method-confirm[hidden]{display:none;}'
      + '.checkout-note{font-size:12px;color:var(--muted,#666);margin-top:6px;line-height:1.45;}'
      + '.checkout-input{width:100%;border:1px solid color-mix(in srgb, var(--ink,#1C1C1C) 18%, transparent);'
      + 'border-radius:var(--radius-sm,12px);padding:11px 12px;font-size:15px;outline:none;font-family:inherit;}'
      + '.checkout-input.input-error{border-color:#b3311f;}'
      + '.checkout-error-msg{color:#b3311f;font-size:12px;margin-top:6px;display:none;}'
      + '.checkout-error-msg.is-visible{display:block;}'
      + '.checkout-summary{background:var(--beige,#F5E9C9);border-radius:var(--radius-sm,12px);padding:12px 14px;margin-bottom:16px;}'
      + '.checkout-row{display:flex;justify-content:space-between;font-size:14px;padding:3px 0;}'
      + '.checkout-row--accent{color:#3a6b2e;font-weight:600;}'
      + '.checkout-row--total{font-weight:700;font-size:16px;border-top:1px solid color-mix(in srgb, var(--ink,#1C1C1C) 15%, transparent);'
      + 'margin-top:6px;padding-top:8px;}'
      + '.checkout-confirm-btn{width:100%;}'
      + '.checkout-success{text-align:center;padding:10px 4px 4px;}'
      + '.checkout-success-icon{width:56px;height:56px;border-radius:50%;background:var(--olive,#A6B48C);color:#102010;'
      + 'font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;}'
      + '.checkout-success p{font-size:15px;line-height:1.5;margin:0 0 18px;}'
      + '@media (max-width:480px){.cart-drawer{width:100%;} .cart-toggle{padding:9px 12px;}}';
    var style = document.createElement('style');
    style.id = 'champion-cart-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- разметка ----------
  function injectMarkup() {
    if (document.getElementById('cartDrawer')) return;

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'cartToggleBtn';
    toggle.className = 'cart-toggle';
    toggle.setAttribute('aria-label', 'Корзина');
    toggle.innerHTML = '<span class="cart-toggle-icon">🛒</span><span>Корзина</span>' +
      '<span id="cartCount" class="cart-count" hidden>0</span>';
    document.body.appendChild(toggle);

    var overlay = document.createElement('div');
    overlay.id = 'cartOverlay';
    overlay.className = 'cart-overlay';
    overlay.hidden = true;
    document.body.appendChild(overlay);

    var drawer = document.createElement('aside');
    drawer.id = 'cartDrawer';
    drawer.className = 'cart-drawer';
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML =
      '<div class="cart-drawer-head">' +
        '<h3 class="h3">Корзина</h3>' +
        '<button type="button" id="cartCloseBtn" class="cart-close" aria-label="Закрыть корзину">×</button>' +
      '</div>' +
      '<div id="cartItems" class="cart-items"></div>' +
      '<div id="cartEmpty" class="cart-empty" hidden>Ваша корзина пуста</div>' +
      '<div id="cartFreeShipProgress" class="cart-freeship" hidden>' +
        '<div class="cart-freeship-text" id="cartFreeShipText"></div>' +
        '<div class="cart-freeship-track"><div class="cart-freeship-fill" id="cartFreeShipFill"></div></div>' +
      '</div>' +
      '<div class="cart-footer">' +
        '<div class="cart-subtotal"><span>Сумма товаров</span><strong id="cartSubtotal">0 ₽</strong></div>' +
        '<button type="button" id="cartCheckoutBtn" class="btn btn-primary cart-checkout-btn">Оформить заказ</button>' +
      '</div>';
    document.body.appendChild(drawer);

    var checkoutOverlay = document.createElement('div');
    checkoutOverlay.id = 'checkoutOverlay';
    checkoutOverlay.className = 'cart-overlay';
    checkoutOverlay.hidden = true;
    document.body.appendChild(checkoutOverlay);

    var modal = document.createElement('div');
    modal.id = 'checkoutModal';
    modal.className = 'checkout-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'checkoutTitle');
    modal.innerHTML =
      '<div class="checkout-card">' +
        '<button type="button" id="checkoutCloseBtn" class="cart-close" aria-label="Закрыть">×</button>' +
        '<h3 class="h3" id="checkoutTitle">Оформление заказа</h3>' +
        '<div id="checkoutForm">' +
          '<div class="checkout-block">' +
            '<span class="checkout-label">Способ получения</span>' +
            '<label class="checkout-radio" data-method="pickup">' +
              '<input type="radio" name="deliveryMethod" value="pickup">' +
              '<span class="checkout-radio-title">Самовывоз</span>' +
            '</label>' +
            '<label class="checkout-radio" data-method="delivery">' +
              '<input type="radio" name="deliveryMethod" value="delivery">' +
              '<span class="checkout-radio-title">Доставка</span>' +
            '</label>' +
            '<div class="delivery-terms">' +
              '<div class="delivery-terms-title">Условия доставки</div>' +
              '<ul class="delivery-terms-list">' +
                '<li>до 7000 ₽ — скидка 7%, если доставку организуете и оплачиваете сами (например, своим курьером или такси)</li>' +
                '<li>от 7000 ₽ — бесплатная доставка нашими силами (Яндекс.Такси)</li>' +
              '</ul>' +
            '</div>' +
            '<div id="methodConfirm" class="method-confirm" hidden></div>' +
          '</div>' +
          '<div class="checkout-block" id="addressBlock" hidden>' +
            '<label class="checkout-label" for="checkoutAddress">Адрес</label>' +
            '<input type="text" id="checkoutAddress" class="checkout-input" placeholder="Улица, дом, квартира/офис" autocomplete="street-address">' +
            '<div class="checkout-note">Нужен, чтобы курьер точно забрал ваш заказ, если в это время у нас готово несколько заказов.</div>' +
            '<div id="checkoutAddressError" class="checkout-error-msg">Укажите адрес</div>' +
          '</div>' +
          '<div class="checkout-block">' +
            '<label class="checkout-label" id="timeLabel" for="checkoutTime">Желаемое время самовывоза</label>' +
            '<select id="checkoutTime" class="checkout-input"></select>' +
            '<div id="checkoutTimeNote" class="checkout-note"></div>' +
          '</div>' +
          '<div class="checkout-block">' +
            '<label class="checkout-label" for="checkoutPhone">Телефон</label>' +
            '<input type="tel" id="checkoutPhone" class="checkout-input" placeholder="+7 (___) ___-__-__" inputmode="tel" autocomplete="tel">' +
            '<div id="checkoutPhoneError" class="checkout-error-msg">Проверьте номер телефона</div>' +
          '</div>' +
          '<div id="checkoutSummary" class="checkout-summary"></div>' +
          '<div id="checkoutSubmitError" class="checkout-error-msg"></div>' +
          '<button type="button" id="checkoutConfirmBtn" class="btn btn-primary checkout-confirm-btn">Подтвердить заказ</button>' +
        '</div>' +
        '<div id="checkoutSuccess" class="checkout-success" hidden>' +
          '<div class="checkout-success-icon">✓</div>' +
          '<p>Заказ принят, с вами свяжутся для уточнения деталей заказа.</p>' +
          '<button type="button" id="checkoutSuccessCloseBtn" class="btn btn-ghost">Закрыть</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  // ---------- рендер ----------
  function renderBadge() {
    var badge = document.getElementById('cartCount');
    if (!badge) return;
    var c = count();
    badge.textContent = c;
    badge.hidden = c === 0;
  }

  function renderDrawer() {
    var wrap = document.getElementById('cartItems');
    var empty = document.getElementById('cartEmpty');
    var subtotalEl = document.getElementById('cartSubtotal');
    var checkoutBtn = document.getElementById('cartCheckoutBtn');
    if (!wrap) return;

    if (!cart.length) {
      wrap.innerHTML = '';
      empty.hidden = false;
      checkoutBtn.disabled = true;
    } else {
      empty.hidden = true;
      checkoutBtn.disabled = false;
      wrap.innerHTML = cart.map(function (i) {
        return (
          '<div class="cart-item" data-key="' + esc(i.key) + '">' +
            (i.img ? '<img class="cart-item-img" src="' + esc(i.img) + '" alt="" onerror="this.remove()">' : '<div></div>') +
            '<div>' +
              '<div class="cart-item-title">' + esc(i.title || i.id) + '</div>' +
              '<div class="cart-item-meta">' + (i.brand ? esc(i.brand) + ' • ' : '') + esc(i.weight) + '</div>' +
              '<div class="cart-item-price">' + fmt(i.price) + ' × ' + i.qty + ' = ' + fmt(i.price * i.qty) + '</div>' +
              '<div class="cart-item-actions">' +
                '<button type="button" class="cart-qty-btn" data-action="dec">−</button>' +
                '<span class="cart-qty-val">' + i.qty + '</span>' +
                '<button type="button" class="cart-qty-btn" data-action="inc">+</button>' +
                '<button type="button" class="cart-remove-btn" data-action="remove" aria-label="Удалить товар">×</button>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }
    subtotalEl.textContent = fmt(subtotal());
    renderFreeShipProgress();
  }

  function renderFreeShipProgress() {
    var box = document.getElementById('cartFreeShipProgress');
    var text = document.getElementById('cartFreeShipText');
    var fill = document.getElementById('cartFreeShipFill');
    if (!box) return;
    var sub = subtotal();
    if (!cart.length) { box.hidden = true; return; }
    box.hidden = false;
    if (sub >= FREE_DELIVERY_THRESHOLD) {
      box.classList.add('is-complete');
      text.innerHTML = '✓ При доставке — <strong>бесплатно</strong>';
      fill.style.width = '100%';
    } else {
      box.classList.remove('is-complete');
      var remain = FREE_DELIVERY_THRESHOLD - sub;
      text.innerHTML = 'До бесплатной доставки осталось <strong>' + fmt(remain) + '</strong>';
      fill.style.width = Math.max(4, Math.round((sub / FREE_DELIVERY_THRESHOLD) * 100)) + '%';
    }
  }

  // считает итог по текущему способу получения; возвращает { total, sub, deliveryFree, discount }
  function computeTotal(method) {
    var sub = subtotal();
    if (method === 'delivery') {
      if (sub >= FREE_DELIVERY_THRESHOLD) {
        return { total: sub, sub: sub, deliveryFree: true, discount: 0 };
      }
      var discount = Math.round(sub * DISCOUNT_RATE);
      return { total: sub - discount, sub: sub, deliveryFree: false, discount: discount };
    }
    return { total: sub, sub: sub, deliveryFree: null, discount: 0 };
  }

  function currentMethod() {
    var checked = document.querySelector('input[name="deliveryMethod"]:checked');
    return checked ? checked.value : null;
  }

  function renderCheckoutSummary() {
    var summaryEl = document.getElementById('checkoutSummary');
    var confirmBtn = document.getElementById('checkoutConfirmBtn');
    if (!summaryEl) return;
    var method = currentMethod();

    if (!method) {
      summaryEl.innerHTML =
        '<div class="checkout-row"><span>Сумма товаров</span><span>' + fmt(subtotal()) + '</span></div>' +
        '<div class="checkout-note" style="margin-top:8px;">Выберите способ получения — покажем точную итоговую цену</div>';
      if (confirmBtn) confirmBtn.disabled = true;
      return subtotal();
    }

    var r = computeTotal(method);
    var rows = '<div class="checkout-row"><span>Сумма товаров</span><span>' + fmt(r.sub) + '</span></div>';
    if (method === 'delivery') {
      if (r.deliveryFree) {
        rows += '<div class="checkout-row checkout-row--accent"><span>Доставка</span><span>Бесплатно</span></div>';
      } else {
        rows += '<div class="checkout-row checkout-row--accent"><span>Скидка 7% (доставка самостоятельно)</span><span>−' + fmt(r.discount) + '</span></div>';
      }
    }
    rows += '<div class="checkout-row checkout-row--total"><span>Итого</span><span>' + fmt(r.total) + '</span></div>';
    summaryEl.innerHTML = rows;

    if (confirmBtn) confirmBtn.disabled = cart.length === 0;
    return r.total;
  }

  function pulseCartButton() {
    var btn = document.getElementById('cartToggleBtn');
    if (!btn) return;
    btn.style.transform = 'scale(1.08)';
    setTimeout(function () { btn.style.transform = ''; }, 150);
  }

  // ---------- открытие/закрытие ----------
  function openDrawer() {
    document.getElementById('cartOverlay').hidden = false;
    var d = document.getElementById('cartDrawer');
    d.hidden = false;
    requestAnimationFrame(function () { d.classList.add('is-open'); });
    d.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    var d = document.getElementById('cartDrawer');
    d.classList.remove('is-open');
    document.getElementById('cartOverlay').hidden = true;
    d.setAttribute('aria-hidden', 'true');
    setTimeout(function () { d.hidden = true; }, 200);
    document.body.style.overflow = '';
  }

  function openCheckout() {
    if (!cart.length) return;
    closeDrawer();
    resetCheckoutForm();
    renderTimeOptions();
    updateMethodUI();
    renderCheckoutSummary();
    document.getElementById('checkoutOverlay').hidden = false;
    document.getElementById('checkoutModal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeCheckout() {
    document.getElementById('checkoutOverlay').hidden = true;
    document.getElementById('checkoutModal').hidden = true;
    document.body.style.overflow = '';
  }

  function resetCheckoutForm() {
    document.getElementById('checkoutForm').hidden = false;
    document.getElementById('checkoutSuccess').hidden = true;
    var checked = document.querySelector('input[name="deliveryMethod"]:checked');
    if (checked) checked.checked = false;
    var phone = document.getElementById('checkoutPhone');
    if (phone) { phone.value = ''; phone.classList.remove('input-error'); }
    var err = document.getElementById('checkoutPhoneError');
    if (err) err.classList.remove('is-visible');
    var address = document.getElementById('checkoutAddress');
    if (address) { address.value = ''; address.classList.remove('input-error'); }
    var addrErr = document.getElementById('checkoutAddressError');
    if (addrErr) addrErr.classList.remove('is-visible');
    var submitErr = document.getElementById('checkoutSubmitError');
    if (submitErr) submitErr.classList.remove('is-visible');
    var confirmBtn = document.getElementById('checkoutConfirmBtn');
    if (confirmBtn) { confirmBtn.textContent = 'Подтвердить заказ'; confirmBtn.disabled = true; }
  }

  // ---------- слоты времени (график работы магазина) ----------
  function dayHours(dow) { return BUSINESS_HOURS[dow] || null; }

  function slotsForDay(baseMidnight, hours, minTime, maxTime) {
    var out = [];
    var t = new Date(baseMidnight); t.setMinutes(hours[0]);
    var end = new Date(baseMidnight); end.setMinutes(hours[1]);
    while (t <= end) {
      if (t >= minTime && t <= maxTime) out.push(new Date(t));
      t = new Date(t.getTime() + SLOT_STEP_MIN * 60000);
    }
    return out;
  }

  // Возвращает { slots: Date[], soft: bool }.
  // soft=true означает, что в ближайшие 24 часа рабочих окон нет,
  // и показан ближайший доступный день целиком (мягкое расширение).
  function generateSlots() {
    var now = new Date();
    var hardLimit = new Date(now.getTime() + MAX_ADVANCE_MS);

    var hard = [];
    for (var i = 0; i < 3; i++) {
      var day = new Date(now); day.setDate(day.getDate() + i); day.setHours(0, 0, 0, 0);
      var hrs = dayHours(day.getDay());
      if (!hrs) continue;
      hard = hard.concat(slotsForDay(day, hrs, now, hardLimit));
    }
    if (hard.length) return { slots: hard, soft: false };

    for (var j = 0; j < 10; j++) {
      var day2 = new Date(now); day2.setDate(day2.getDate() + j); day2.setHours(0, 0, 0, 0);
      var hrs2 = dayHours(day2.getDay());
      if (!hrs2) continue;
      var dayEnd = new Date(day2); dayEnd.setMinutes(hrs2[1]);
      var daySlots = slotsForDay(day2, hrs2, now, dayEnd);
      if (daySlots.length) return { slots: daySlots, soft: true };
    }
    return { slots: [], soft: true };
  }

  function formatSlotLabel(date) {
    var now = new Date();
    var startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    var startOfTarget = new Date(date); startOfTarget.setHours(0, 0, 0, 0);
    var diffDays = Math.round((startOfTarget - startOfToday) / (24 * 3600 * 1000));
    var time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return 'Сегодня, ' + time;
    if (diffDays === 1) return 'Завтра, ' + time;
    var wd = date.toLocaleDateString('ru-RU', { weekday: 'short' });
    var dm = date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    return wd + ', ' + dm + ', ' + time;
  }

  var currentSlotsInfo = { slots: [], soft: false };

  function renderTimeOptions() {
    var select = document.getElementById('checkoutTime');
    if (!select) return;
    currentSlotsInfo = generateSlots();
    if (!currentSlotsInfo.slots.length) {
      select.innerHTML = '<option value="">Нет доступного времени</option>';
      select.disabled = true;
    } else {
      select.disabled = false;
      select.innerHTML = currentSlotsInfo.slots.map(function (d) {
        return '<option value="' + d.toISOString() + '">' + formatSlotLabel(d) + '</option>';
      }).join('');
    }
    updateTimeNote();
  }

  function updateTimeNote() {
    var note = document.getElementById('checkoutTimeNote');
    if (!note) return;
    var method = currentMethod();
    var parts = [];
    if (!currentSlotsInfo.slots.length) {
      parts.push('Нет доступного времени по графику работы — позвоните нам: ' + SHOP_PHONE + '.');
    } else if (currentSlotsInfo.soft) {
      parts.push('В ближайшие сутки нет рабочих часов — показано ближайшее доступное время. Нужно раньше? Звоните: ' + SHOP_PHONE + '.');
    } else {
      parts.push('Часы работы: Пн–Пт 11:00–20:00, Сб 10:00–14:30, Вс — выходной.');
    }
    if (method === 'delivery') {
      if (subtotal() >= FREE_DELIVERY_THRESHOLD) {
        parts.push('Мы сами передадим заказ курьеру (Яндекс.Такси) в выбранное время, возможна задержка до 30 минут по согласованию. Точное время доставки клиенту не гарантируем.');
      } else {
        parts.push('К этому времени заказ должен забрать ваш курьер/такси — сообщите ему точный адрес и время.');
      }
    }
    note.textContent = parts.join(' ');
  }

  // ---------- выбор способа получения ----------
  function updateMethodUI() {
    var method = currentMethod();
    var addressBlock = document.getElementById('addressBlock');
    var timeLabel = document.getElementById('timeLabel');
    var confirmBox = document.getElementById('methodConfirm');
    var confirmBtn = document.getElementById('checkoutConfirmBtn');

    if (addressBlock) addressBlock.hidden = (method !== 'delivery');
    if (timeLabel) timeLabel.textContent = method === 'delivery' ? 'Желаемое время передачи курьеру' : 'Желаемое время самовывоза';

    if (confirmBox) {
      if (!method) {
        confirmBox.hidden = true;
      } else if (method === 'pickup') {
        confirmBox.hidden = false;
        confirmBox.textContent = '✓ Самовывоз — цена не меняется';
      } else {
        var sub = subtotal();
        confirmBox.hidden = false;
        confirmBox.textContent = sub >= FREE_DELIVERY_THRESHOLD
          ? '✓ Доставка бесплатна — привезём сами'
          : '✓ Скидка 7% — доставку организуете самостоятельно';
      }
    }
    if (confirmBtn) confirmBtn.disabled = !method || cart.length === 0;
    updateTimeNote();
  }

  // ---------- телефон ----------
  function formatPhone(value) {
    var digits = value.replace(/\D/g, '');
    if (digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    if (digits.charAt(0) !== '7') digits = '7' + digits;
    digits = digits.slice(0, 11);
    var out = '+7';
    if (digits.length > 1) out += ' (' + digits.slice(1, 4);
    if (digits.length >= 4) out += ')';
    if (digits.length >= 4) out += ' ' + digits.slice(4, 7);
    if (digits.length >= 7) out += '-' + digits.slice(7, 9);
    if (digits.length >= 9) out += '-' + digits.slice(9, 11);
    return out;
  }
  function phoneDigitsValid(value) {
    var digits = value.replace(/\D/g, '');
    if (digits.charAt(0) === '8') digits = '7' + digits.slice(1);
    return digits.length === 11 && digits.charAt(0) === '7';
  }

  // ---------- подтверждение заказа ----------
  function confirmOrder() {
    var confirmBtn = document.getElementById('checkoutConfirmBtn');
    var submitErr = document.getElementById('checkoutSubmitError');
    submitErr.classList.remove('is-visible');

    var method = currentMethod();
    if (!method) return; // кнопка и так задизейблена без метода

    // адрес — только для доставки
    if (method === 'delivery') {
      var addressInput = document.getElementById('checkoutAddress');
      var addrErr = document.getElementById('checkoutAddressError');
      if (!addressInput.value.trim()) {
        addressInput.classList.add('input-error');
        addrErr.classList.add('is-visible');
        addressInput.focus();
        return;
      }
      addressInput.classList.remove('input-error');
      addrErr.classList.remove('is-visible');
    }

    // время
    var timeSelect = document.getElementById('checkoutTime');
    if (!timeSelect.value) {
      timeSelect.focus();
      return;
    }

    // телефон
    var phoneInput = document.getElementById('checkoutPhone');
    var errEl = document.getElementById('checkoutPhoneError');
    if (!phoneDigitsValid(phoneInput.value)) {
      phoneInput.classList.add('input-error');
      errEl.classList.add('is-visible');
      phoneInput.focus();
      return;
    }
    phoneInput.classList.remove('input-error');
    errEl.classList.remove('is-visible');

    var r = computeTotal(method);
    var selectedOption = timeSelect.options[timeSelect.selectedIndex];

    var order = {
      items: cart.map(function (i) {
        return { id: i.id, title: i.title, weight: i.weight, price: i.price, qty: i.qty };
      }),
      deliveryMethod: method,
      address: method === 'delivery' ? document.getElementById('checkoutAddress').value.trim() : '',
      desiredTime: timeSelect.value,
      desiredTimeLabel: selectedOption ? selectedOption.textContent : '',
      phone: phoneInput.value,
      subtotal: r.sub,
      total: r.total,
      createdAt: new Date().toISOString()
    };

    confirmBtn.disabled = true;
    var originalLabel = confirmBtn.textContent;
    confirmBtn.textContent = 'Отправляем…';

    fetch(ORDER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok || !result.data || !result.data.ok) {
          throw new Error('server');
        }
        document.getElementById('checkoutForm').hidden = true;
        document.getElementById('checkoutSuccess').hidden = false;
        clearCart();
      })
      .catch(function () {
        submitErr.textContent = 'Не удалось отправить заказ. Проверьте соединение и попробуйте ещё раз, либо позвоните нам: ' + SHOP_PHONE + '.';
        submitErr.classList.add('is-visible');
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalLabel;
      });
  }

  // ---------- события ----------
  function bindEvents() {
    document.getElementById('cartToggleBtn').addEventListener('click', openDrawer);
    document.getElementById('cartCloseBtn').addEventListener('click', closeDrawer);
    document.getElementById('cartOverlay').addEventListener('click', closeDrawer);

    document.getElementById('cartCheckoutBtn').addEventListener('click', openCheckout);

    document.getElementById('checkoutCloseBtn').addEventListener('click', closeCheckout);
    document.getElementById('checkoutOverlay').addEventListener('click', closeCheckout);
    document.getElementById('checkoutSuccessCloseBtn').addEventListener('click', closeCheckout);

    document.getElementById('checkoutConfirmBtn').addEventListener('click', confirmOrder);

    document.getElementById('checkoutPhone').addEventListener('input', function (e) {
      var pos = e.target.value.length;
      e.target.value = formatPhone(e.target.value);
      e.target.classList.remove('input-error');
      document.getElementById('checkoutPhoneError').classList.remove('is-visible');
    });

    var radios = document.querySelectorAll('input[name="deliveryMethod"]');
    radios.forEach(function (r) {
      r.addEventListener('change', function () {
        updateMethodUI();
        renderCheckoutSummary();
      });
    });

    document.getElementById('checkoutAddress').addEventListener('input', function (e) {
      e.target.classList.remove('input-error');
      document.getElementById('checkoutAddressError').classList.remove('is-visible');
    });

    document.getElementById('checkoutTime').addEventListener('change', updateTimeNote);

    document.getElementById('cartItems').addEventListener('click', function (e) {
      var actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      var itemEl = e.target.closest('.cart-item');
      if (!itemEl) return;
      var key = itemEl.getAttribute('data-key');
      var it = null;
      for (var i = 0; i < cart.length; i++) { if (cart[i].key === key) { it = cart[i]; break; } }
      if (!it) return;
      var action = actionBtn.getAttribute('data-action');
      if (action === 'inc') setQty(key, it.qty + 1);
      else if (action === 'dec') setQty(key, it.qty - 1);
      else if (action === 'remove') removeItem(key);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('checkoutModal').hidden) closeCheckout();
      else if (!document.getElementById('cartDrawer').hidden) closeDrawer();
    });
  }

  // ---------- инициализация ----------
  ready(function () {
    injectStyles();
    injectMarkup();
    bindEvents();
    renderBadge();
    renderDrawer();
    renderCheckoutSummary();
  });

  // ---------- публичный API ----------
  window.Cart = {
    add: add,
    remove: removeItem,
    setQty: setQty,
    clear: clearCart,
    subtotal: subtotal,
    count: count,
    open: openDrawer
  };
})();
