/* Мини-датабаза витрины: расширяйте без боли. */
const PRODUCTS = [
  {
    id: 101,
    brand: "Grandorf Holistic",
    title: "Ягнёнок и Индейка для щенков (Puppy) — Single Grain",
    animal: "dog",            // 'cat' | 'dog'
    kind: "dry",              // 'dry' | 'wet'
    desc: "Для щенков всех пород с 3 недель, а также беременных и кормящих собак. Гипоаллергенный состав, поддержка пищеварения и иммунитета.",
    analysis: [
      "Протеин не менее 28%",
      "Жир не менее 16%",
      "Клетчатка не более 3%",
      "Зола не более 7%",
      "Влажность не более 9%"
    ],
    additives: [
      "Омега-3 и Омега-6",
      "Хондропротекторы",
      "Пребиотики MOS/FOS",
      "Витамины A, D3, E"
    ],
    sizes: [
      { weight: "1 кг", price: 1450 },
      { weight: "3 кг", price: 3550 },
      { weight: "10 кг", price: 8700 }
    ],
    images: {
      pack: "assets/grandorf-holistic-puppy-pack.jpg",
      kibble: "assets/grandorf-kibble.jpg"
    }
  },
  {
    id: 102,
    brand: "Grandorf Fresh",
    title: "Утка для стерилизованных кошек",
    animal: "cat",
    kind: "dry",
    desc: "Свежая утка, контролируемый уровень жиров, поддержка оптимального веса у стерилизованных кошек.",
    analysis: [
      "Протеин ≥ 32%",
      "Жир ≥ 12%",
      "Клетчатка ≤ 4.5%",
      "Зола ≤ 7.5%",
      "Влажность ≤ 9%"
    ],
    additives: [
      "Таурин",
      "Омега-3 из рыбы",
      "DL-метионин",
      "Комплекс витаминов и минералов"
    ],
    sizes: [
      { weight: "400 г", price: 560 },
      { weight: "2 кг", price: 3100 },
      { weight: "6 кг", price: 7350 }
    ],
    images: {
      pack: "assets/grandorf-fresh-duck-pack.jpg",
      kibble: "assets/grandorf-kibble.jpg"
    }
  },
  {
    id: 201,
    brand: "Grandorf Vet",
    title: "Gastro Intestinal — диета для кошек",
    animal: "cat",
    kind: "dry",
    desc: "Диетический рацион для снижения острых нарушений всасывания в кишечнике. Использовать по рекомендации ветеринарного врача.",
    analysis: [
      "Протеин ≥ 30%",
      "Жир ≥ 14%",
      "Клетчатка ≤ 2.5%",
      "Зола ≤ 6.8%",
      "Влажность ≤ 8%"
    ],
    additives: [
      "Электролиты",
      "Пребиотики",
      "Антиоксидантный комплекс"
    ],
    sizes: [
      { weight: "400 г", price: 690 },
      { weight: "2 кг", price: 3450 }
    ],
    images: {
      pack: "assets/grandorf-vet-gi-pack.jpg"
    }
  },
  {
    id: 301,
    brand: "Premier",
    title: "Лосось и Индейка для взрослых кошек",
    animal: "cat",
    kind: "dry",
    desc: "Сбалансированный сухой рацион с лососем и индейкой для взрослых кошек. Поддержка шерсти и кожи.",
    analysis: [
      "Протеин ≥ 30%",
      "Жир ≥ 12%",
      "Клетчатка ≤ 4%",
      "Зола ≤ 7%",
      "Влажность ≤ 9%"
    ],
    additives: [
      "Таурин",
      "Витамины A, D3, E",
      "Цинк, медь, селен"
    ],
    sizes: [
      { weight: "400 г", price: 450 },
      { weight: "2 кг", price: 2050 },
      { weight: "8 кг", price: 7050 }
    ],
    images: {
      pack: "assets/premier-salmon-turkey-pack.jpg"
    }
  },
  {
    id: 103,
    brand: "Grandorf Fresh",
    title: "Индейка и Кролик — влажный корм для кошек",
    animal: "cat",
    kind: "wet",
    desc: "Нежные кусочки индейки и кролика в соусе, полная дневная норма таурина.",
    analysis: [
      "Протеин ≥ 10%",
      "Жир ≥ 5%",
      "Клетчатка ≤ 1%",
      "Зола ≤ 2%",
      "Влажность ≤ 80%"
    ],
    additives: [
      "Таурин",
      "Витамин E"
    ],
    sizes: [
      { weight: "85 г", price: 97 }
    ],
    images: {
      pack: "assets/grandorf-fresh-pouch.jpg"
    }
  }
];
