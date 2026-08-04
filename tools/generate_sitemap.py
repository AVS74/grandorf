import json
from pathlib import Path
from xml.sax.saxutils import escape

BASE_URL = "https://grandorf74.ru"
DATA_JS = Path("data.js")
OUT_SITEMAP = Path("sitemap.xml")

def load_products_from_datajs(path: Path):
    text = path.read_text(encoding="utf-8")

    # Находим JSON-массив PRODUCTS
    marker = "const PRODUCTS ="
    start = text.index(marker)
    start = text.index("[", start)
    end = text.index("];", start)
    json_str = text[start:end+1]

    products = json.loads(json_str)

    # Фильтруем мусорные id (nan, nan-2 и т.п.)
    good = []
    for p in products:
        pid = str(p.get("id", "")).strip()
        if not pid:
            continue
        if pid.startswith("nan"):
            continue
        good.append(pid)

    # Убираем возможные дубликаты, сохраняя порядок
    seen = set()
    result = []
    for pid in good:
        if pid in seen:
            continue
        seen.add(pid)
        result.append(pid)
    return result

def build_sitemap(product_ids):
    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    def add_url(loc, changefreq, priority):
        lines.append("  <url>")
        lines.append(f"    <loc>{escape(loc)}</loc>")
        lines.append(f"    <changefreq>{changefreq}</changefreq>")
        lines.append(f"    <priority>{priority}</priority>")
        lines.append("  </url>")

    # Главная
    add_url(f"{BASE_URL}/", "daily", "1.0")

    # Каталог
    add_url(f"{BASE_URL}/catalog.html", "daily", "0.9")

    # Страница политики cookies
    add_url(f"{BASE_URL}/cookies.html", "yearly", "0.4")

    # Карточки товаров
    for pid in product_ids:
        loc = f"{BASE_URL}/product.html?id={pid}"
        add_url(loc, "weekly", "0.7")

    lines.append("</urlset>")
    return "\n".join(lines)

def main():
    if not DATA_JS.exists():
        raise SystemExit(f"Не найден {DATA_JS}")

    product_ids = load_products_from_datajs(DATA_JS)
    sitemap_xml = build_sitemap(product_ids)
    OUT_SITEMAP.write_text(sitemap_xml, encoding="utf-8")
    print(f"OK: записано {len(product_ids)} карточек в {OUT_SITEMAP}")

if __name__ == "__main__":
    main()
