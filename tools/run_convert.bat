@echo off
REM Мини-запускатель: Excel -> data.js в той же папке
setlocal
set PY=python
echo === Excel -> data.js (products.xlsx -> data.js) ===
%PY% "xltojs.py"
echo.
echo Готово. Нажми любую клавишу для выхода.
pause >nul
