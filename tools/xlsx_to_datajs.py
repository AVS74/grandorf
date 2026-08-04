# -*- coding: utf-8 -*-
"""
Мини-конвертер: Excel -> data.js (всё в одной папке).
Запуск: python xlsx_to_datajs.py
Вход:  products.xlsx
Выход: data.js (const PRODUCTS = [...];)
"""
import json, re, unicodedata
from pathlib import Path
import pandas as pd

IN_XLSX = Path("products.xlsx")
OUT_JS  = Path("data.js")

CODE_MAP = [
    (r"^1\d{2}$",  ("Grandorf Holistic","dog","dry")),
    (r"^2\d{2}$",  ("Grandorf Holistic","cat","dry")),
    (r"^3\d{2}$",  ("Grandorf Holistic","dog","wet")),
    (r"^4\d{2}$",  ("Grandorf Holistic","cat","wet")),
    (r"^5\d{2}$",  ("Grandorf Fresh","dog","dry")),
    (r"^6\d{2}$",  ("Grandorf Fresh","cat","dry")),
    (r"^7\d{2}$",  ("Grandorf Fresh","dog","wet")),
    (r"^8\d{2}$",  ("Grandorf Fresh","cat","wet")),
    (r"^9\d{2}$",  ("Premier","dog","dry")),
    (r"^10\d$",    ("Premier","cat","dry")),
    (r"^10\d{2}$", ("Premier","cat","dry")),
]

def infer_from_code(code:str):
    s = str(code).strip()
    for pat, vals in CODE_MAP:
        if re.match(pat, s):
            return vals
    return (None, None, None)

def slugify(text:str):
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    tr = str.maketrans({
        "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"j","к":"k",
        "л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"c",
        "ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"
    })
    text = text.translate(tr)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text

def parse_sizes(s):
    out = []
    if not isinstance(s,str) or not s.strip():
        return out
    for pair in s.split(";"):
        pair = pair.strip()
        if not pair:
            continue
        if ":" not in pair:
            continue
        w, p = pair.split(":",1)
        w = w.strip()
        pclean = p.replace(" ", "").replace(",", ".")
        m = re.search(r"[-+]?\d+(\.\d+)?", pclean)
        if not m:
            continue
        out.append({"weight": w, "price": float(m.group(0))})
    return out

def main():
    if not IN_XLSX.exists():
        raise SystemExit("Нет файла products.xlsx рядом со скриптом.")
    df = pd.read_excel(IN_XLSX, sheet_name="Products")
    # лист Additives опциональный
    add_map = {}
    try:
        df_add = pd.read_excel(IN_XLSX, sheet_name="Additives")
        for _, r in df_add.iterrows():
            add_map.setdefault(str(r["id"]).strip(), []).append(str(r["value"]).strip())
    except Exception:
        pass

    products = []
    seen = set()

    for _, row in df.iterrows():
        title = str(row.get("title","")).strip()
        if not title:
            continue
        code = str(row.get("code","")).strip()

        inf_brand, inf_animal, inf_kind = infer_from_code(code)
        brand = (str(row.get("brand") or "").strip() or inf_brand or "")
        animal = (str(row.get("animal") or "").strip().lower() or inf_animal or "")
        kind = (str(row.get("kind") or "").strip().lower() or inf_kind or "")

        pid = str(row.get("id") or "").strip()
        if not pid:
            pid = slugify(f"{brand} {title}") or slugify(title)
        if pid in seen:
            i = 2
            while f"{pid}-{i}" in seen:
                i += 1
            pid = f"{pid}-{i}"
        seen.add(pid)

        # Картинки: images "pack; granule" ИЛИ image_pack + image_granule
        imgs_cell = str(row.get("images","")).strip()
        imgs = [x.strip() for x in imgs_cell.split(";") if x.strip()]
        pack = str(row.get("image_pack","")).strip() or (imgs[0] if imgs else "")
        gran = str(row.get("image_granule","")).strip() or (imgs[1] if len(imgs)>1 else "")

        sizes = parse_sizes(str(row.get("sizes","")))

        # Гарантированный анализ
        ga = {}
        def put(name, col):
            val = row.get(col)
            if pd.isna(val) or val == "":
                return
            try:
                v = float(str(val).replace(",", "."))
            except Exception:
                return
            ga[name] = v
        for (n,c) in [("protein_pct","protein_pct"),("fat_pct","fat_pct"),("ash_pct","ash_pct"),
                      ("calcium_pct","calcium_pct"),("phosphorus_pct","phosphorus_pct"),
                      ("fiber_pct","fiber_pct"),("moisture_pct","moisture_pct")]:
            put(n,c)
        energy_raw = str(row.get("energy_kcal","")).strip().replace(",", ".")
        if energy_raw:
            try:
                e = float(energy_raw)
                if e > 500:
                    e = e / 10.0  # ккал/кг -> ккал/100г
                ga["energy_kcal"] = round(e, 1)
            except Exception:
                pass

        item = {
            "id": pid,
            "brand": brand,
            "animal": animal,
            "kind": kind,
            "title": title,
            "desc": str(row.get("desc","")).strip(),
            "images": {"pack": pack, "granule": gran},
            "sizes": sizes
        }
        if ga:
            item["analysis_guaranteed"] = ga

        tokens = str(row.get("tokens","")).strip()
        if tokens:
            item.setdefault("additives", []).extend([t.strip() for t in tokens.split(";") if t.strip()])
        if pid in add_map:
            item.setdefault("additives", []).extend(add_map[pid])

        products.append(item)

    # data.js
    with OUT_JS.open("w", encoding="utf-8") as f:
        f.write("/* Автогенерация из products.xlsx. Не редактируй вручную. */\n")
        f.write("const PRODUCTS = ")
        json.dump(products, f, ensure_ascii=False, indent=2)
        f.write(";\n\n")
        f.write("if (typeof window !== 'undefined') window.PRODUCTS = PRODUCTS;\n")

    print(f"OK: записано {len(products)} товаров в {OUT_JS}")

if __name__ == "__main__":
    main()
