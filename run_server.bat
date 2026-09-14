@echo off
title Arayeshi Retail ERP - Port 4200
echo =======================================================
echo  Kayhan Beauty Retail ERP + POS + FEFO + Accounting
echo  Running on dedicated isolated port: 4200 (No Conflict)
echo =======================================================
cd /d "%~dp0"
node server.js
pause
