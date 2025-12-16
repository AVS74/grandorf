Мини-конвертер (всё в одной папке)
==================================
В этой же директории:
- Вход:  products.xlsx
- Выход: data.js  (const PRODUCTS = [...];)

Как использовать (Windows):
1) Установи Python 3.11+ и пакеты:
   pip install pandas openpyxl
2) Положи рядом: products.xlsx, xlsx_to_datajs.py, run_convert.bat
3) Запусти run_convert.bat (двойной клик). В той же папке появится data.js

Правила таблицы (лист Products):
- code — нумерация 1xx..10x (бренд/животное/тип берутся автоматически)
- id — можно пусто, будет сгенерирован (латиница, тире)
- title — название (обязательно)
- desc — описание
- images — "path/to/pack.webp; path/to/granule.webp" ИЛИ image_pack + image_granule
- sizes — "400 г:890; 2 кг:3590; 10 кг:14990"
- tokens — "стерилизованные; без курицы"
- protein_pct, fat_pct, ash_pct, calcium_pct, phosphorus_pct, fiber_pct, moisture_pct — проценты
- energy_kcal — в ккал/100г; если >500, конвертируется из ккал/кг -> /10

На странице:
<script src="data.js"></script>
Теперь доступна переменная PRODUCTS и window.PRODUCTS.
