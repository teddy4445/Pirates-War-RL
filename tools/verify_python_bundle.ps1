param(
  [string]$Bundle = "public/downloads/FleetRL_Python_Training_Bundle.zip",
  [string]$OutputDirectory = "artifacts/python-bundle-smoke",
  [string]$BootstrapPython = "python/.venv/Scripts/python.exe"
)

$ErrorActionPreference = "Stop"
function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try { $algorithm = [Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "").ToLowerInvariant() } finally { $algorithm.Dispose() } }
  finally { $stream.Dispose() }
}
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$bundlePath = (Resolve-Path (Join-Path $repositoryRoot $Bundle)).Path
$bootstrapPythonPath = (Resolve-Path (Join-Path $repositoryRoot $BootstrapPython)).Path
$outputPath = Join-Path $repositoryRoot $OutputDirectory
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$temporaryParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryRoot = Join-Path $temporaryParent ("fleetrl-python-bundle-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
$resolvedTemporaryRoot = (Resolve-Path $temporaryRoot).Path
if (-not $resolvedTemporaryRoot.StartsWith($temporaryParent, [StringComparison]::OrdinalIgnoreCase) -or -not (Split-Path $resolvedTemporaryRoot -Leaf).StartsWith("fleetrl-python-bundle-")) { throw "Refusing to use an unsafe temporary path: $resolvedTemporaryRoot" }

try {
  $extractPath = Join-Path $resolvedTemporaryRoot "package"
  Expand-Archive -LiteralPath $bundlePath -DestinationPath $extractPath
  $manifest = Get-Content -Raw (Join-Path $extractPath "BUNDLE_MANIFEST.json") | ConvertFrom-Json
  foreach ($entry in $manifest.files) {
    $filePath = Join-Path $extractPath $entry.path
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) { throw "Bundle manifest file is missing: $($entry.path)" }
    $actual = Get-Sha256 $filePath
    if ($actual -ne $entry.sha256) { throw "Bundle checksum mismatch: $($entry.path)" }
  }
  $environmentPath = Join-Path $resolvedTemporaryRoot "venv"
  & $bootstrapPythonPath -m venv $environmentPath
  $python = Join-Path $environmentPath "Scripts/python.exe"
  & $python -m pip install --disable-pip-version-check -e "$extractPath[all]"
  & $python -m pytest $extractPath
  & $python -m fleetrl.rollout --mode duel --seed 7 --decisions 12 | Tee-Object -FilePath (Join-Path $outputPath "rollout.json")
  $runPath = Join-Path $resolvedTemporaryRoot "run"
  & $python -m fleetrl.train --algorithm dqn --mode duel --steps 40 --batch-size 8 --target-every 10 --episode-decisions 20 --seed 7 --output $runPath | Tee-Object -FilePath (Join-Path $outputPath "training.json")
  & $python -m fleetrl.evaluate --checkpoint (Join-Path $runPath "checkpoint.pt") --episodes 2 --max-decisions 20 --seed 10000 | Tee-Object -FilePath (Join-Path $outputPath "evaluation.json")
  $agentPath = Join-Path $outputPath "downloaded-bundle.agent.json"
  & $python -m fleetrl.export --checkpoint (Join-Path $runPath "checkpoint.pt") --format dense-json --output $agentPath --name "Downloaded Bundle Smoke" | Tee-Object -FilePath (Join-Path $outputPath "export.json")
  Copy-Item -LiteralPath (Join-Path $runPath "metrics.json") -Destination (Join-Path $outputPath "metrics.json") -Force
  $summary = [ordered]@{ bundle = $bundlePath; bundleSha256 = Get-Sha256 $bundlePath; manifestFiles = $manifest.files.Count; python = (& $python --version 2>&1 | Out-String).Trim(); outputAgent = $agentPath; outputAgentSha256 = Get-Sha256 $agentPath }
  $summary | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $outputPath "verification-summary.json")
  $summary | ConvertTo-Json
}
finally {
  if (Test-Path -LiteralPath $resolvedTemporaryRoot) {
    $checked = (Resolve-Path $resolvedTemporaryRoot).Path
    if ($checked.StartsWith($temporaryParent, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $checked -Leaf).StartsWith("fleetrl-python-bundle-")) { Remove-Item -LiteralPath $checked -Recurse -Force }
  }
}
