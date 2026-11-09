param([string]$XamppRoot='C:\xampp')
$ErrorActionPreference='Stop'
$env:OPENSSL_CONF=Join-Path $PSScriptRoot 'openssl-pwa.cnf'
$logDir=Join-Path $PSScriptRoot '..\logs'
$logFile=Join-Path $logDir 'reminders.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$started=Get-Date -Format 'yyyy-MM-dd HH:mm:ss K'
try {
    $output=& (Join-Path $XamppRoot 'php\php.exe') -d extension=openssl -d extension=curl -d extension=gmp (Join-Path $PSScriptRoot 'process-reminders.php') 2>&1
    $exitCode=$LASTEXITCODE
    Add-Content -LiteralPath $logFile -Value ("[$started] exit=$exitCode`n" + (($output | Out-String).Trim()) + "`n")
    exit $exitCode
} catch {
    Add-Content -LiteralPath $logFile -Value ("[$started] wrapper_error=" + $_.Exception.Message + "`n")
    exit 1
}
