@echo off
chcp 65001 >nul
REM ------------------------------------------------------
REM  Автоматическое обновление базы и data.js (UTF-8)
REM ------------------------------------------------------

echo Обновление товаров...
echo.

cd /d "%~dp0"

echo 1. Импорт Excel → SQLite (products.db)
python import_excel_to_sqlite.py
if errorlevel 1 (
    echo Ошибка при выполнении import_excel_to_sqlite.py
    pause
    exit /b
)
echo.

echo 2. Экспорт SQLite → data.js
python export_to_datajs.py
if errorlevel 1 (
    echo Ошибка при выполнении export_to_datajs.py
    pause
    exit /b
)
echo.

echo Готово! Файлы products.db и data.js обновлены.
pause

