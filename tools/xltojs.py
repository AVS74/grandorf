# export_to_datajs.py
# Конвертер: products.xlsx -> data.js (window.PRODUCTS)
# Работает без сторонних сервисов. Запуск: python export_to_datajs.py
#
# Требования: Python 3.11+, пакеты pandas, openpyxl.
#
# ВАЖНО:
# - Читает Excel по именам колонок (порядок столбцов не важен).
# - pet_group в Excel: 'medium;maxi' (через ;) -> в data.js будет массив ['medium','maxi'].
# - purpose пусто = повседневный; purpose не пусто = ветеринарный (например gastrointestinal/renal/urinary).

import json, math, re, datetime
from pathlib import Path

import pandas as pd


# ---------- Утилиты ----------
def _is_nan(x) -> bool:
    return isinstance(x, float) and math.isnan(x)

def _to_str(x) -> str:
    if x is None or _is_nan(x):
        return ''
    return str(x).strip()

def _to_float(x):
    if x is None or _is_nan(x):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    if not s:
        return None
    s = s.replace(',', '.')
    s = re.sub(r'\s+', '', s)
    try:
        return float(s)
    except Exception:
        return None


def split_composition_smart(raw: str):
    """Делит состав по запятым, игнорируя запятые внутри скобок."""
    if not raw or not str(raw).strip():
        return []
    s = str(raw).strip()
    out, buf, depth = [], [], 0
    for ch in s:
        if ch == '(':
            depth += 1; buf.append(ch)
        elif ch == ')':
            depth = max(0, depth - 1); buf.append(ch)
        elif ch == ',' and depth == 0:
            part = ''.join(buf).strip().rstrip('.;')
            if part:
                out.append(part)
            buf = []
        else:
            buf.append(ch)
    last = ''.join(buf).strip().rstrip('.;')
    if last:
        out.append(last)
    return [re.sub(r'\s+', ' ', x).strip() for x in out if x.strip()]


def parse_sizes(sizes_raw):
    """Парсит '1 кг:1770; 3 кг:4000' -> [{weight, price}, ...]"""
    if sizes_raw is None or _is_nan(sizes_raw):
        return []
    s = str(sizes_raw).strip()
    if not s:
        return []
    parts = [p.strip() for p in s.split(';') if p.strip()]
    out = []
    for part in parts:
        chunks = re.split(r'\s*[:\-–—]\s*', part, maxsplit=1)
        if len(chunks) != 2:
            continue
        w = chunks[0].strip()
        price = _to_float(re.sub(r'[^\d\.,]', '', chunks[1]))
        if w and price is not None:
            out.append({'weight': w, 'price': int(round(price))})
    return out


def parse_keywords(tags_raw):
    if tags_raw is None or _is_nan(tags_raw):
        return []
    s = str(tags_raw).strip()
    if not s:
        return []
    items = [re.sub(r'\s+', ' ', t.strip()) for t in re.split(r'[;,\n]+', s) if t.strip()]
    seen, out = set(), []
    for it in items:
        key = it.lower()
        if key not in seen:
            seen.add(key); out.append(it)
    return out


def parse_pet_group(pg_raw):
    if pg_raw is None or _is_nan(pg_raw):
        return []
    s = str(pg_raw).strip()
    if not s:
        return []
    items = [t.strip().lower() for t in s.split(';') if t.strip()]
    seen, out = set(), []
    for it in items:
        if it not in seen:
            seen.add(it); out.append(it)
    return out


NUTRIENT_PATTERNS = {
    'protein_pct':   [r'(?:сыр(?:ой|ого)\s+)?протеин|белок'],
    'fat_pct':       [r'(?:сыр(?:ой|ого)\s+)?жир'],
    'fiber_pct':     [r'(?:сыр(?:ая|ой)\s+)?клетчатк'],
    'ash_pct':       [r'зол[аы]'],
    'moisture_pct':  [r'влаг[аы]'],
    'calcium_pct':   [r'кальци[йя]'],
    'phosphorus_pct':[r'фосфор'],
    'magnesium_pct': [r'магни[йя]'],
    'omega3_pct':    [r'омега-?\s*3|omega\s*3'],
    'omega6_pct':    [r'омега-?\s*6|omega\s*6'],
}


def parse_analysis_guaranteed(raw: str, energy_kcal=None):
    ga = {}
    if energy_kcal is not None and not _is_nan(energy_kcal):
        ga['energy_kcal'] = float(energy_kcal)
    if not raw or not str(raw).strip():
        return ga
    txt = str(raw).lower().replace('–', '-').replace('—', '-')
    for key, pats in NUTRIENT_PATTERNS.items():
        val = None
        for p in pats:
            m = re.search(rf'({p})[^0-9]{{0,30}}([0-9]+(?:[\.,][0-9]+)?)\s*%?', txt, flags=re.I)
            if m:
                val = _to_float(m.group(2))
                break
        if val is not None:
            ga[key] = val
    return ga


def split_analysis_sections(raw: str):
    if not raw or not str(raw).strip():
        return {}
    text = str(raw).strip()
    label_re = re.compile(
        r'(аналитические\s+составляющие|метаболическая\s+энергия|энергетическая\s+ценность|'
        r'пищевые\s+добавки|микроэлементы|антиоксиданты)\s*[:\-]',
        re.I
    )
    labels = []
    for m in label_re.finditer(text):
        lab = m.group(1).lower()
        if 'аналит' in lab:
            k = 'analytical'
        elif 'метабол' in lab or 'энерг' in lab:
            k = 'metabolic_energy'
        elif 'пищев' in lab or 'добавк' in lab:
            k = 'additives'
        elif 'микро' in lab:
            k = 'microelements'
        elif 'антиокс' in lab:
            k = 'antioxidants'
        else:
            k = 'other'
        labels.append((m.start(), m.end(), k))
    if not labels:
        return {'raw': text}
    labels.sort(key=lambda x: x[0])
    sections = {}
    for i, (spos, epos, k) in enumerate(labels):
        end = labels[i + 1][0] if i + 1 < len(labels) else len(text)
        body = text[epos:end].strip()
        body = re.sub(r'^\s*[:\-]\s*', '', body)
        body = re.sub(r'\s+', ' ', body).strip()
        if body:
            sections[k] = (sections.get(k, '') + (' ' if k in sections else '') + body).strip()
    return sections or {'raw': text}


def build_products(df: pd.DataFrame):
    products = []
    for _, row in df.iterrows():
        pid = _to_str(row.get('id'))
        if not pid:
            continue

        item = {
            'id': pid,
            'brand': _to_str(row.get('brand')),
            'animal': _to_str(row.get('animal')),
            'kind': _to_str(row.get('kind')),          # dry/wet
            'purpose': _to_str(row.get('purpose')),    # пусто или vet-подтип (gastrointestinal/renal/...)
            'life_stage': _to_str(row.get('life_stage')),
            'pet_group': parse_pet_group(row.get('pet_group')),

            'title': _to_str(row.get('title')),
            'title_ru_catalog': _to_str(row.get('title_ru_catalog')),
            'subtitle_ru': '',
            'desc': _to_str(row.get('desc')),

            'images': {
                'pack': _to_str(row.get('image_pack')),
                'granule': _to_str(row.get('image_granule')),
            },

            'sizes': parse_sizes(row.get('sizes')),
            'keywords': parse_keywords(row.get('tags_auto')),

            'composition': split_composition_smart(_to_str(row.get('composition_raw'))),
            'composition_raw': _to_str(row.get('composition_raw')),

            'analysis_full_raw': _to_str(row.get('analysis_full_raw')),
            'analysis_guaranteed': parse_analysis_guaranteed(_to_str(row.get('analysis_full_raw')), row.get('energy_kcal')),
            'analysis_sections': split_analysis_sections(_to_str(row.get('analysis_full_raw'))),
        }

        # Промо (если есть)
        promo = row.get('promo')
        if promo is not None and not _is_nan(promo):
            item['promo'] = _to_str(promo)
        promo_text = row.get('promo_text')
        if promo_text is not None and not _is_nan(promo_text):
            item['promo_text'] = _to_str(promo_text)
        promo_details = row.get('promo_details')
        if promo_details is not None and not _is_nan(promo_details):
            item['promo_details'] = _to_str(promo_details)

        products.append(item)
    return products


def main():
    here = Path(__file__).resolve().parent
    xlsx = here / 'products.xlsx'
    out_js = here / 'data.js'

    if not xlsx.exists():
        raise SystemExit(f'Не найден файл: {xlsx}')

    df = pd.read_excel(xlsx)
    products = build_products(df)

    # Базовая валидация (чтобы не выложить пустоты)
    if not products:
        raise SystemExit('В Excel не найдено ни одного товара с заполненным id.')

    # Вывод
    payload = json.dumps(products, ensure_ascii=False, indent=2)
    js = (
        '// data.js — autogenerated from products.xlsx\n'
        f'// generated: {datetime.datetime.now().isoformat(timespec="seconds")}\n\n'
        'window.PRODUCTS = ' + payload + ';\n'
        'const PRODUCTS = window.PRODUCTS;\n'
    )
    out_js.write_text(js, encoding='utf-8')
    print(f'OK: {out_js} (товаров: {len(products)})')


if __name__ == '__main__':
    main()
