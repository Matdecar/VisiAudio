@echo off
chcp 65001 > nul
title Visiaudio — Serveur local
echo.
echo  ===================================
echo   Visiaudio — Serveur local
echo  ===================================
echo.

:: Essai Python (prioritaire, installé dans 99%% des cas)
where python >nul 2>&1
if %errorlevel% == 0 (
  echo  Serveur demarré sur http://localhost:8000
  echo  Ctrl+C pour arreter.
  echo.
  start "" http://localhost:8000
  python -m http.server 8000
  goto end
)

:: Essai Python3 explicite (macOS/Linux style)
where python3 >nul 2>&1
if %errorlevel% == 0 (
  echo  Serveur demarré sur http://localhost:8000
  echo  Ctrl+C pour arreter.
  echo.
  start "" http://localhost:8000
  python3 -m http.server 8000
  goto end
)

:: Essai Node.js / npx serve
where node >nul 2>&1
if %errorlevel% == 0 (
  echo  Serveur Node.js demarré sur http://localhost:3000
  echo  Ctrl+C pour arreter.
  echo.
  start "" http://localhost:3000
  npx --yes serve . -l 3000
  goto end
)

echo  ERREUR : Python ou Node.js introuvable.
echo  Installez Python depuis https://python.org/downloads
echo  puis relancez ce fichier.
echo.

:end
pause
