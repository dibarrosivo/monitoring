# Monitor del puente: muestra en vivo lo que entra por el receptor y lo que
# sale al servidor. Lee el diario que escribe el puente (logs\puente-AAAA-MM-DD.log)
# y lo presenta en el formato del software viejo: una linea por trama.
# No toca al puente: cerrar esta ventana no afecta nada.

$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$Host.UI.RawUI.WindowTitle = "Puente PIMA - monitor"

# Configuracion del puente, para mostrar de donde lee y a donde manda
$cfg = @{}
$rutaEnv = Join-Path $carpeta ".env"
if (Test-Path $rutaEnv) {
  Get-Content $rutaEnv | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_]+)\s*=\s*(.*)$') { $cfg[$matches[1]] = $matches[2].Trim() }
  }
}
$origen = if ($cfg.BRIDGE_FUENTE -eq 'tcp') { "$($cfg.BRIDGE_TCP_HOST):$($cfg.BRIDGE_TCP_PUERTO)" } else { $cfg.BRIDGE_PUERTO_SERIE }
if (-not $origen) { $origen = "COM?" }
$servidor = $cfg.BRIDGE_SERVIDOR
if (-not $servidor) { $servidor = "servidor" }
$servidorCorto = $servidor -replace '^https?://', ''
$cola = Join-Path $carpeta ($(if ($cfg.BRIDGE_ARCHIVO_COLA) { $cfg.BRIDGE_ARCHIVO_COLA } else { "cola-pendiente.jsonl" }))

function EstadoServicio {
  $s = Get-Service puente-pima -ErrorAction SilentlyContinue
  if ($s) { return [string]$s.Status }
  if (Get-Process puente -ErrorAction SilentlyContinue) { return "Running (sin servicio)" }
  return "Stopped"
}

function Pendientes {
  if (Test-Path $cola) { return (Get-Content $cola -ErrorAction SilentlyContinue | Measure-Object).Count }
  return 0
}

function Encabezado {
  Clear-Host
  Write-Host "PUENTE PIMA -> CENTRAL DE MONITOREO" -ForegroundColor Cyan
  Write-Host ("  entrada : " + $origen + "   salida : " + $servidorCorto) -ForegroundColor Gray
  $estado = EstadoServicio
  $color = if ($estado -like "Running*") { "Green" } else { "Red" }
  Write-Host "  puente  : " -NoNewline -ForegroundColor Gray
  Write-Host $estado -ForegroundColor $color -NoNewline
  Write-Host ("   pendientes de envio : " + (Pendientes)) -ForegroundColor Gray
  Write-Host ("  " + ("-" * 70)) -ForegroundColor DarkGray
  return $estado
}

function Mostrar([string]$linea) {
  # Formato del diario: 2026-09-15T12:00:00.000Z [INFO] mensaje {"clave":"valor"}
  if ($linea -match '^(\S+) \[(\w+)\] ([^{]+?)\s*(\{.*\})?$') {
    $hora = ([datetime]$matches[1]).ToLocalTime().ToString('HH:mm:ss')
    $nivel = $matches[2]; $msg = $matches[3].Trim(); $json = $matches[4]
    $d = $null
    if ($json) { try { $d = $json | ConvertFrom-Json } catch { $d = $null } }
    switch ($msg) {
      'Trama recibida' {
        Write-Host ("$hora IN  " + $origen.PadRight(6) + " -> cola     = ") -NoNewline -ForegroundColor DarkGray
        Write-Host $d.cruda -ForegroundColor White
        return
      }
      'Lote entregado' {
        Write-Host ("$hora OUT cola   -> servidor = OK  (" + $d.tramas + " tramas, " + $d.pendientes + " pendientes)") -ForegroundColor Green
        return
      }
      'Puerto serie abierto' {
        Write-Host ("$hora " + $msg + " " + $d.puerto + " a " + $d.baudios + " baudios, paridad " + $d.paridad) -ForegroundColor Cyan
        return
      }
    }
    $color = switch ($nivel) { 'ERROR' { 'Red' } 'WARN' { 'Yellow' } default { 'DarkGray' } }
    Write-Host ("$hora " + $msg + $(if ($json) { "  " + $json } else { "" })) -ForegroundColor $color
  } else {
    Write-Host $linea -ForegroundColor DarkGray
  }
}

$estadoAnterior = Encabezado
$archivoActual = $null
$lector = $null
$ultimoChequeo = Get-Date

while ($true) {
  # El puente nombra el diario por fecha UTC
  $hoy = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
  $ruta = Join-Path $carpeta ("logs\puente-" + $hoy + ".log")

  if ($ruta -ne $archivoActual) {
    if ($lector) { $lector.Close(); $lector = $null }
    if (Test-Path $ruta) {
      $fs = [IO.File]::Open($ruta, 'Open', 'Read', 'ReadWrite')
      $lector = New-Object IO.StreamReader($fs)
      # Al abrir, se muestran las ultimas 30 lineas y despues solo lo nuevo
      $todas = @()
      while (($l = $lector.ReadLine()) -ne $null) { $todas += $l }
      $desde = [Math]::Max(0, $todas.Count - 30)
      for ($i = $desde; $i -lt $todas.Count; $i++) { Mostrar $todas[$i] }
      $archivoActual = $ruta
    } else {
      Write-Host ((Get-Date).ToString('HH:mm:ss') + " esperando el diario de hoy (" + $ruta + ")") -ForegroundColor DarkGray
      $archivoActual = $ruta
    }
  } elseif (-not $lector -and (Test-Path $ruta)) {
    $archivoActual = $null
    continue
  }

  if ($lector) {
    while (($l = $lector.ReadLine()) -ne $null) { Mostrar $l }
  }

  # Cada 15 s se revisa si el servicio cambio de estado
  if (((Get-Date) - $ultimoChequeo).TotalSeconds -ge 15) {
    $ultimoChequeo = Get-Date
    $estado = EstadoServicio
    if ($estado -ne $estadoAnterior) {
      $color = if ($estado -like "Running*") { "Green" } else { "Red" }
      Write-Host ((Get-Date).ToString('HH:mm:ss') + " el puente cambio de estado: " + $estado) -ForegroundColor $color
      $estadoAnterior = $estado
    }
  }

  Start-Sleep -Milliseconds 500
}
