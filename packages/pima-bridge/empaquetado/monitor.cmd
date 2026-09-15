@echo off
title Puente PIMA - monitor
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0monitor.ps1"
