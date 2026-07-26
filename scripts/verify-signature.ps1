# Reports the Authenticode status of every built executable.
# Run after `npm run build:win:signed`:  npm run verify:signature
#
# Status meanings:
#   Valid          - signed and trusted; SmartScreen will not warn
#   NotSigned      - no signature (SmartScreen will warn on download)
#   UnknownError   - signed but the chain cannot be verified on this machine
#   HashMismatch   - the file was modified after signing (do not ship)

$ErrorActionPreference = 'Stop'
$release = Join-Path $PSScriptRoot '..\release'

if (-not (Test-Path $release)) {
    Write-Host "No release folder yet. Run 'npm run build:win' or 'npm run build:win:signed' first."
    exit 0
}

$files = Get-ChildItem $release -Recurse -Include *.exe, *.dll -ErrorAction SilentlyContinue
if (-not $files) {
    Write-Host "No executables found under $release."
    exit 0
}

$anyUnsigned = $false
Write-Host ''
Write-Host ('{0,-50} {1,-14} {2}' -f 'FILE', 'STATUS', 'SIGNED BY')
Write-Host ('-' * 100)

foreach ($f in $files) {
    $sig = Get-AuthenticodeSignature $f.FullName
    $subject = ''
    if ($sig.SignerCertificate) {
        $subject = $sig.SignerCertificate.Subject -replace '^CN=([^,]+).*', '$1'
    }
    if ($sig.Status -ne 'Valid') { $anyUnsigned = $true }
    Write-Host ('{0,-50} {1,-14} {2}' -f $f.Name, $sig.Status, $subject)
}

Write-Host ''
if ($anyUnsigned) {
    Write-Host 'Some files are not validly signed. See docs/CODE-SIGNING.md.' -ForegroundColor Yellow
    exit 1
}
Write-Host 'All executables are validly signed.' -ForegroundColor Green
