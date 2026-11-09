param([string]$XamppRoot = 'C:\xampp')
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$xamppPath = [IO.Path]::GetFullPath($XamppRoot)
$destination = Join-Path $xamppPath 'htdocs\PWA-Life'
if (!(Test-Path (Join-Path $xamppPath 'php\php.exe'))) { throw 'No se encontró PHP de XAMPP.' }
# Copy only application files; preserve any local connection configuration and data.
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach ($folder in @('backend','database','scripts','js','css','icons','test')) {
    $sourceFolder = Join-Path $sourceRoot $folder
    foreach ($file in Get-ChildItem -LiteralPath $sourceFolder -File -Recurse -Force) {
        if ($file.Name -eq 'database.local.php') { continue }
        $relative = $file.FullName.Substring($sourceRoot.Length + 1)
        $target = Join-Path $destination $relative
        New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    }
}
foreach ($file in @('index.html','manifest.json','sw.js','.htaccess','README.md','DOCUMENTACION.md')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination (Join-Path $destination $file) -Force
}
$localConfig = Join-Path $destination 'backend\config\database.local.php'
if (!(Test-Path -LiteralPath $localConfig)) {
    Copy-Item -LiteralPath (Join-Path $destination 'backend\config\database.example.php') -Destination $localConfig
}
if (!(Get-Process mysqld -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath (Join-Path $xamppPath 'mysql\bin\mysqld.exe') -ArgumentList @('--defaults-file=' + (Join-Path $xamppPath 'mysql\bin\my.ini'), '--standalone') -WorkingDirectory (Join-Path $xamppPath 'mysql\bin') -WindowStyle Hidden
}
if (!(Get-Process httpd -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath (Join-Path $xamppPath 'apache\bin\httpd.exe') -WorkingDirectory (Join-Path $xamppPath 'apache\bin') -WindowStyle Hidden
}
Start-Sleep -Seconds 3
& (Join-Path $xamppPath 'php\php.exe') (Join-Path $destination 'scripts\import-database.php')
if ($LASTEXITCODE -ne 0) { throw 'La importación falló. Configura database.local.php y vuelve a ejecutar.' }
$health = Invoke-RestMethod 'http://localhost/PWA-Life/api/health'
if ($health.data.status -ne 'ok') { throw 'La API no confirmó la conexión.' }
Write-Output 'Instalación verificada: http://localhost/PWA-Life/ | API y MySQL disponibles.'
