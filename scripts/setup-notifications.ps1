param([string]$XamppRoot='C:\xampp', [string]$Subject='https://github.com/utp0157676-hash/-PWA-Life')
$ErrorActionPreference='Stop'
$appRoot=Join-Path $XamppRoot 'htdocs\PWA-Life'
$php=Join-Path $XamppRoot 'php\php.exe'
if (!(Test-Path (Join-Path $appRoot 'vendor\autoload.php'))) { throw 'Instala primero Composer y actualiza la copia de XAMPP.' }
# CLI-only extensions: no global php.ini change and no Apache restart required.
$phpOptions=@('-d','extension=openssl','-d','extension=curl','-d','extension=gmp')
$env:OPENSSL_CONF = Join-Path $appRoot 'scripts\openssl-pwa.cnf'
& $php @phpOptions (Join-Path $appRoot 'scripts\generate-vapid.php') $Subject
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron generar las claves VAPID.' }
# Public trust anchors from Windows; TLS verification remains enabled.
$bundle=foreach($certificate in Get-ChildItem Cert:\CurrentUser\Root,Cert:\LocalMachine\Root,Cert:\LocalMachine\CA) {
    '-----BEGIN CERTIFICATE-----'
    [Convert]::ToBase64String($certificate.RawData,[Base64FormattingOptions]::InsertLineBreaks)
    '-----END CERTIFICATE-----'
}
$bundle | Set-Content -LiteralPath (Join-Path $appRoot 'backend\config\windows-ca.pem') -Encoding ascii
$worker=Join-Path $appRoot 'scripts\run-reminders.ps1'
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$worker+'" -XamppRoot "'+$XamppRoot+'"') -WorkingDirectory $appRoot
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'PWA-Life-Reminders' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Recordatorios Web Push PWA Life, cada minuto durante la sesión Windows.' -Force | Out-Null
Start-ScheduledTask -TaskName 'PWA-Life-Reminders'
Write-Output 'Programador PWA-Life-Reminders registrado. No requiere pestaña abierta; sí sesión Windows activa, MySQL y conectividad.'
