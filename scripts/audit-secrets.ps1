[CmdletBinding()]
param(
  [switch]$Staged,
  [switch]$TrackedOnly,
  [switch]$ExcludePublicPackageArtifacts,
  [switch]$IncludeLocalSecurityFiles
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$excludedPrefixes = @(".git/", "assets/", "vendor/")
$excludedFiles = @("scripts/audit-secrets.ps1")
$publicPackagePrefixes = @(
  "feeds/",
  "lineup-lab/data/",
  "tools/swishiq-studio/data/"
)
$placeholderPattern = "(?i)(replace[_-]?with|your[_-]|example|placeholder|change[_-]?me|from[_-]?stripe|<[^>]+>|\$\{[^}]+\}|%[A-Z0-9_]+%|Deno\.env|process\.env|os\.environ|\`$env:)"

$rules = @(
  [pscustomobject]@{ Name = "Stripe secret or restricted key"; Pattern = "\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b" },
  [pscustomobject]@{ Name = "Stripe webhook secret"; Pattern = "\bwhsec_[A-Za-z0-9]{16,}\b" },
  [pscustomobject]@{ Name = "Supabase secret key"; Pattern = "\bsb_secret_[A-Za-z0-9_-]{16,}\b" },
  [pscustomobject]@{ Name = "JWT or service-role token"; Pattern = "\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b" },
  [pscustomobject]@{ Name = "Private key"; Pattern = "-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----" },
  [pscustomobject]@{ Name = "GitHub token"; Pattern = "\bgh[pousr]_[A-Za-z0-9_]{20,}\b" },
  [pscustomobject]@{ Name = "AWS access key"; Pattern = "\bAKIA[0-9A-Z]{16}\b" },
  [pscustomobject]@{ Name = "Basic-auth URL"; Pattern = "\b(?:https?|ftp|ftps)://[^/\s:@]+:[^/\s@]+@" },
  [pscustomobject]@{ Name = "Sensitive environment assignment"; Pattern = "(?im)^\s*(?:STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|SUPABASE_SERVICE_ROLE_KEY|CPANEL_FTPS_PASSWORD|CPANEL_PASSWORD|FTP_PASSWORD)\s*=\s*[^\s#]{8,}" },
  [pscustomobject]@{ Name = "Plaintext credential field"; Pattern = "(?i)[`"'](?:password|passwd|serviceRoleKey|service_role_key)[`"']\s*:\s*[`"'][^`"']{4,}[`"']" }
)

function Convert-ToRelativePath {
  param([string]$Path)

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $rootPrefix = $repoRoot.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
  return ($fullPath.Substring($rootPrefix.Length) -replace "\\", "/")
}

function Test-IsExcluded {
  param([string]$RelativePath)

  $normalized = $RelativePath -replace "\\", "/"
  if ($excludedFiles -contains $normalized) {
    return $true
  }

  foreach ($prefix in $excludedPrefixes) {
    if ($normalized.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }

  if ($ExcludePublicPackageArtifacts) {
    foreach ($prefix in $publicPackagePrefixes) {
      if ($normalized.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
      }
    }

    if ($normalized -match "(?i)^products[^/]*\.(?:json|js)$") {
      return $true
    }
  }

  return $false
}

function Test-IsLocalSecurityFile {
  param([string]$RelativePath)

  $normalized = $RelativePath -replace "\\", "/"
  return $normalized -match "(?i)^(?:codex_account_keys\.env|\.env(?:\.[^/]*)?)$" -or
    $normalized.StartsWith(".deploy/", [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-IsExpectedLocalCredentialStore {
  param([string]$RelativePath)

  $normalized = $RelativePath -replace "\\", "/"
  return $normalized.Equals("codex_account_keys.env", [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-LocalSecurityPaths {
  $paths = @()
  $rootFiles = Get-ChildItem -LiteralPath $repoRoot -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "codex_account_keys.env" -or $_.Name -like ".env*" }
  $paths += @($rootFiles | ForEach-Object { Convert-ToRelativePath -Path $_.FullName })

  $deployDirectory = Join-Path $repoRoot ".deploy"
  if (Test-Path -LiteralPath $deployDirectory -PathType Container) {
    $paths += @(Get-ChildItem -LiteralPath $deployDirectory -Force -File -ErrorAction SilentlyContinue |
      ForEach-Object { Convert-ToRelativePath -Path $_.FullName })
  }

  return @($paths | Sort-Object -Unique)
}

function Get-CandidatePaths {
  $paths = @()
  if ($Staged) {
    $paths = @(& git -C $repoRoot -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR -- . ":!assets/**" ":!vendor/**")
  } elseif ($TrackedOnly) {
    $paths = @(& git -C $repoRoot -c core.quotepath=false ls-files -- . ":!assets/**" ":!vendor/**")
  } else {
    # Scan every tracked or non-ignored candidate that could enter a commit while
    # skipping machine-local credentials, generated dependencies, and outputs
    # already protected by .gitignore.
    $paths = @(& git -C $repoRoot -c core.quotepath=false ls-files --cached --others --exclude-standard -- . ":!assets/**" ":!vendor/**")
  }

  if ($IncludeLocalSecurityFiles) {
    $paths += Get-LocalSecurityPaths
  }

  return @($paths)
}

function Get-CandidateContent {
  param([string]$RelativePath)

  if ($Staged) {
    $content = & git -C $repoRoot show ":$RelativePath" 2>$null
    if ($LASTEXITCODE -ne 0) {
      return $null
    }
    return ($content -join "`n")
  }

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    return $null
  }

  $file = Get-Item -LiteralPath $path
  if ($file.Length -gt 25MB) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $path -Raw -ErrorAction Stop
  } catch {
    return $null
  }
}

$findings = New-Object System.Collections.Generic.HashSet[string]
$candidatePaths = @(Get-CandidatePaths | Sort-Object -Unique)
$localSecurityCount = @($candidatePaths | Where-Object { Test-IsLocalSecurityFile -RelativePath $_ }).Count
foreach ($relativePath in $candidatePaths) {
  if (-not $relativePath -or (Test-IsExcluded -RelativePath $relativePath)) {
    continue
  }

  $content = Get-CandidateContent -RelativePath $relativePath
  if ([string]::IsNullOrEmpty($content)) {
    continue
  }

  $activeRules = @($rules)
  if ($relativePath -match "(?i)(^|/)(?:\.deploy/|[^/]*(?:cpanel|ftps?|deploy)[^/]*\.(?:json|toml|ya?ml))") {
    $activeRules += [pscustomobject]@{ Name = "Stored deploy username"; Pattern = "(?i)[`"']username[`"']\s*:\s*[`"'][^`"']{3,}[`"']" }
    $activeRules += [pscustomobject]@{ Name = "Insecure FTPS certificate bypass"; Pattern = "(?i)[`"']?allowInsecureCertificate[`"']?\s*:\s*true" }
  }

  foreach ($rule in $activeRules) {
    if ($IncludeLocalSecurityFiles -and (Test-IsExpectedLocalCredentialStore -RelativePath $relativePath)) {
      continue
    }

    if ($IncludeLocalSecurityFiles -and (Test-IsLocalSecurityFile -RelativePath $relativePath) -and $rule.Name -eq "Sensitive environment assignment") {
      continue
    }

    foreach ($match in [regex]::Matches($content, $rule.Pattern)) {
      if ($match.Value -match $placeholderPattern) {
        continue
      }

      $lineNumber = ([regex]::Matches($content.Substring(0, $match.Index), "`n")).Count + 1
      [void]$findings.Add("${relativePath}:${lineNumber}: $($rule.Name)")
    }
  }
}

if ($findings.Count -gt 0) {
  Write-Error ("Secret audit failed. Values are intentionally redacted.`n" + (($findings | Sort-Object) -join "`n"))
  exit 1
}

$scope = if ($ExcludePublicPackageArtifacts) { "; known generated public package artifacts excluded" } else { "" }
$localScope = if ($IncludeLocalSecurityFiles) { "; checked $localSecurityCount local env/deployment files; the expected ignored credential store was handled by hygiene checks" } else { "" }
Write-Output "Secret audit passed; no blocked credential patterns were found$scope$localScope."
