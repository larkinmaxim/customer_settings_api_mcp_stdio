# PowerShell Secure Setup Script for Transporeon Company Settings MCP Server
param(
    [switch]$BuildOnly,
    [switch]$DeployOnly,
    [switch]$TokensOnly,
    [switch]$Clean,
    [switch]$Help,
    [string]$ContainerName = "transporeon-mcp",
    [string]$ImageName = "transporeon-mcp-server",
    [string]$ImageTag = "latest"
)

function Write-Info { param($Message); Write-Host "[INFO] $Message" -ForegroundColor Green }
function Write-Warning { param($Message); Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Error { param($Message); Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Write-Step { param($Message); Write-Host "`n=== $Message ===" -ForegroundColor Cyan }

function Show-Usage {
    Write-Host @"
PowerShell Secure Setup Script for Transporeon Company Settings MCP Server

Usage: .\Secure-Setup.ps1 [OPTIONS]

Options:
    -BuildOnly          Only build the container image
    -DeployOnly         Only deploy container (assume secrets exist)
    -TokensOnly         Only rotate API tokens (no build)
    -Clean              Clean up existing setup first
    -Help               Show this help message
    
Examples:
    .\Secure-Setup.ps1                  # Full setup
    .\Secure-Setup.ps1 -TokensOnly      # Rotate tokens only
    .\Secure-Setup.ps1 -BuildOnly       # Build only
    .\Secure-Setup.ps1 -DeployOnly      # Deploy only
    .\Secure-Setup.ps1 -Clean           # Clean then setup

"@ -ForegroundColor Cyan
}

function Test-Requirements {
    Write-Step "Checking Requirements"
    
    if (-not (Test-Path "package.json")) {
        Write-Error "Not in project directory. Please run from project root."
        exit 1
    }
    
    try {
        podman --version | Out-Null
        Write-Info "[OK] Podman found"
    } catch {
        Write-Error "Podman required but not found"
        exit 1
    }
    
    try {
        npm --version | Out-Null
        Write-Info "[OK] npm found"
    } catch {
        Write-Error "npm required but not found"
        exit 1
    }
}

function Get-SecureToken {
    param([string]$DisplayName)

    do {
        Write-Host "`nEnter $DisplayName Token:" -ForegroundColor Cyan
        Write-Host "Paste token (CTRL + SHIFT + V)" -ForegroundColor Yellow
        $plainToken = Read-Host "Paste token here"

        # Clear the screen to remove visible token
        Clear-Host
        Write-Host "Token received and screen cleared." -ForegroundColor Green

        # Validate token format
        if ($plainToken -match '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' -and $plainToken.Length -ge 30) {
            Write-Info "[OK] $DisplayName token validated"
            return $plainToken
        } else {
            Write-Warning "[X] Invalid token format. Please enter a valid UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."
            Write-Host "Example: 36705197-0eec-40ac-86da-c07430d0aa22" -ForegroundColor Gray
        }
    } while ($true)
}

function New-PodmanSecrets {
    Write-Step "Creating Podman Secrets"
    
    # Remove old secrets
    $existingSecrets = podman secret ls --format "{{.Name}}" 2>$null | Where-Object { $_ -like "tp_token_*" }
    if ($existingSecrets) {
        Write-Warning "Removing old secrets..."
        $existingSecrets | ForEach-Object { podman secret rm $_ 2>$null }
    }
    
    # Get tokens securely
    Write-Info "Enter your new API tokens:"
    $pdToken = Get-SecureToken -DisplayName "Production (PD)"
    $acToken = Get-SecureToken -DisplayName "Acceptance (AC)"
    $inToken = Get-SecureToken -DisplayName "Integration (IN)"
    
    # Create temp directory and files
    $tempDir = New-Item -ItemType Directory -Path ([System.IO.Path]::GetTempPath()) -Name "tp-tokens-$(Get-Random)" -Force
    
    try {
        $pdFile = Join-Path $tempDir "token_pd.txt"
        $inFile = Join-Path $tempDir "token_in.txt"
        $acFile = Join-Path $tempDir "token_ac.txt"
        
        $pdToken | Out-File -FilePath $pdFile -Encoding ASCII -NoNewline
        $inToken | Out-File -FilePath $inFile -Encoding ASCII -NoNewline
        $acToken | Out-File -FilePath $acFile -Encoding ASCII -NoNewline
        
        # Clear from memory
        $pdToken = $inToken = $acToken = $null
        [System.GC]::Collect()
        
        # Create secrets
        Write-Info "Creating Podman secrets..."
        podman secret create tp_token_pd_secret $pdFile
        podman secret create tp_token_in_secret $inFile
        podman secret create tp_token_ac_secret $acFile
        
        if ($LASTEXITCODE -eq 0) {
            Write-Info "[OK] All secrets created successfully"
        } else {
            Write-Error "Failed to create secrets"
            exit 1
        }
        
    } finally {
        # Secure cleanup
        if (Test-Path $tempDir) {
            Get-ChildItem $tempDir -File | ForEach-Object {
                for ($i = 0; $i -lt 3; $i++) {
                    $randomBytes = New-Object byte[] $_.Length
                    (New-Object System.Random).NextBytes($randomBytes)
                    [System.IO.File]::WriteAllBytes($_.FullName, $randomBytes)
                }
            }
            Remove-Item -Path $tempDir -Recurse -Force
            Write-Info "[OK] Temporary files securely deleted"
        }
    }
}

function Build-Container {
    Write-Step "Building Container Image"
    
    Write-Info "Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }
    
    Write-Info "Building project..."
    npm run clean 2>$null
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }
    
    if (-not (Test-Path "dist\index.js")) {
        Write-Error "Build output missing"
        exit 1
    }
    
    Write-Info "Building container..."
    podman build -t "${ImageName}:${ImageTag}" .
    if ($LASTEXITCODE -ne 0) { Write-Error "Container build failed"; exit 1 }
    
    Write-Info "Cleaning up dangling images..."
    podman image prune -f | Out-Null
    Write-Info "[OK] Dangling images cleaned up"

    Write-Info "[OK] Container built successfully"
}

function Deploy-Container {
    Write-Step "Deploying Container"
    
    # Stop existing container
    podman stop $ContainerName 2>$null
    podman rm $ContainerName 2>$null
    
    # Create logs directory
    $logsDir = "logs"
    if (-not (Test-Path $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir -Force
    }
    
    Write-Info "Starting container with secrets..."
    
    podman run -d `
        --name $ContainerName `
        --restart unless-stopped `
        --security-opt no-new-privileges `
        --read-only `
        --tmpfs /tmp:rw,noexec,nosuid,size=100m `
        --user 1001:1001 `
        --secret tp_token_pd_secret,type=env,target=TP_SETTINGS_TOKEN_PD `
        --secret tp_token_in_secret,type=env,target=TP_SETTINGS_TOKEN_IN `
        --secret tp_token_ac_secret,type=env,target=TP_SETTINGS_TOKEN_AC `
        --env TP_SETTINGS_DEFAULT_ENV=pd `
        --env TP_SETTINGS_TIMEOUT=30000 `
        --env NODE_ENV=production `
        -p 3001:3001 `
        "${ImageName}:${ImageTag}"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to start container"
        exit 1
    }
    
    Start-Sleep -Seconds 3
    $running = podman ps --format "{{.Names}}" | Where-Object { $_ -eq $ContainerName }
    if ($running) {
        Write-Info "[OK] Container is running"
    } else {
        Write-Warning "[!] Container may have failed. Check logs:"
        podman logs $ContainerName
    }
}

function Test-Deployment {
    Write-Step "Verifying Deployment"
    
    $running = podman ps --format "{{.Names}}" | Where-Object { $_ -eq $ContainerName }
    if (-not $running) {
        Write-Error "[X] Container not running"
        podman logs $ContainerName
        exit 1
    }
    
    Write-Info "[OK] Container is running"
    Write-Info "Testing token validation..."
    
    $testScript = "const { verifyEnvironmentTokens } = require('./dist/handlers.js'); verifyEnvironmentTokens().then(r => { console.log('Tokens valid:', Object.values(r).every(x => x.valid)); process.exit(Object.values(r).every(x => x.valid) ? 0 : 1); }).catch(e => { console.log('Error:', e.message); process.exit(1); });"
    
    $result = podman exec $ContainerName node -e $testScript 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Info "[OK] Token validation successful"
    } else {
        Write-Warning "[!] Token validation failed:"
        Write-Host $result
    }
    
    Write-Info "[SUCCESS] Deployment complete!"
    Write-Info "Manage with: podman logs/stop/start $ContainerName"
}

function Remove-ExistingSetup {
    Write-Step "Cleaning Up"
    
    podman stop $ContainerName 2>$null
    podman rm $ContainerName 2>$null
    
    $secrets = podman secret ls --format "{{.Name}}" 2>$null | Where-Object { $_ -like "tp_token_*" }
    if ($secrets) {
        $secrets | ForEach-Object { podman secret rm $_ 2>$null }
    }
    
    $image = podman images --format "{{.Repository}}:{{.Tag}}" | Where-Object { $_ -eq "${ImageName}:${ImageTag}" }
    if ($image) {
        podman rmi "${ImageName}:${ImageTag}" 2>$null
    }
    
    Write-Info "Cleaning up dangling images..."
    podman image prune -f | Out-Null

    Write-Info "[OK] Cleanup complete"
}

# Main execution
if ($Help) {
    Show-Usage
    return
}

Write-Host @"

================================================================
           Transporeon MCP Server - Secure Setup              
                     (PowerShell Edition)                     
                                                               
  [*] Secure API token management with Podman secrets         
  [*] Hardened container deployment                           
  [*] Security-first configuration                            
================================================================

"@ -ForegroundColor Blue

Test-Requirements

if ($Clean) {
    Remove-ExistingSetup
}

if (-not $DeployOnly -and -not $TokensOnly) {
    New-PodmanSecrets
    Build-Container
} elseif ($TokensOnly) {
    # Check if container is running
    $running = podman ps --format "{{.Names}}" | Where-Object { $_ -eq $ContainerName }
    if (-not $running) {
        Write-Error "Container $ContainerName is not running. Use full setup first: .\Secure-Setup.ps1"
        exit 1
    }
    New-PodmanSecrets
}

if (-not $BuildOnly) {
    Deploy-Container
    Test-Deployment
}

if ($TokensOnly) {
    Write-Step "Token Rotation Complete"
    Write-Info "[OK] API tokens rotated successfully!"
} else {
    Write-Step "Setup Complete"
    Write-Info "[OK] Transporeon MCP Server deployed securely!"
}
Write-Info "[TOOLS] Management commands:"
Write-Host "  podman logs $ContainerName     # View logs"
Write-Host "  podman stop $ContainerName     # Stop service"
Write-Host "  podman start $ContainerName    # Start service"
