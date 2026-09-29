# Free ports used by LogHR API/Web before restart
$ErrorActionPreference = "SilentlyContinue"
$ports = @(3000, 3001)
foreach ($port in $ports) {
  $pids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    if ($procId -and $procId -ne 0) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      Write-Host "Killed PID $procId on :$port"
    }
  }
}
Write-Host "Ports 3000/3001 cleared. Start: npm run dev:api / npm run dev:web"
