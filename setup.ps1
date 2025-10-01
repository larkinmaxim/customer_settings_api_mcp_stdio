# PowerShell script to setup the company-settings-mcp project
# This script will install dependencies, build the project, and generate mcp.json

param(
    [string]$McpJsonPath = "$env:USERPROFILE\.cursor\mcp.json"
)

Write-Host "Starting setup for company-settings-mcp..." -ForegroundColor Green

# Get the current directory (project root)
$ProjectRoot = Get-Location
$DistPath = Join-Path $ProjectRoot "dist\index.js"

Write-Host "Project root: $ProjectRoot" -ForegroundColor Cyan
Write-Host "Built file will be at: $DistPath" -ForegroundColor Cyan

# Step 1: Install dependencies
Write-Host "`n=== Installing Dependencies ===" -ForegroundColor Yellow
try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed"
    }
    Write-Host "Dependencies installed successfully!" -ForegroundColor Green
} catch {
    Write-Host "Error installing dependencies: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Clean and build the project
Write-Host "`n=== Building Project ===" -ForegroundColor Yellow
try {
    # Clean previous build
    npm run clean
    
    # Build the project
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed"
    }
    Write-Host "Project built successfully!" -ForegroundColor Green
} catch {
    Write-Host "Error building project: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Verify the built file exists
if (-not (Test-Path $DistPath)) {
    Write-Host "Error: Built file not found at $DistPath" -ForegroundColor Red
    exit 1
}

# Step 4: Generate mcp.json configuration
Write-Host "`n=== Generating MCP Configuration ===" -ForegroundColor Yellow

# Define the new server configuration
$newServerConfig = @{
    command = "node"
    args = @($DistPath)
    env = @{
        TP_SETTINGS_TOKEN_PD = "36705197-0eec-40ac-86da-c07430d0aa22"
        TP_SETTINGS_TOKEN_IN = "35309cbd-73fe-4b8b-b504-7b482cd55f42"
        TP_SETTINGS_TOKEN_AC = "7e02a525-f7f4-4525-8179-9dd224f29324"
    }
}

# Convert Windows path to use forward slashes for JSON compatibility
$jsonPath = $DistPath -replace '\\', '/'
$copyableServerConfig = @"
    "company-settings": {
      "command": "node",
      "args": ["$jsonPath"],
      "env": {
        "TP_SETTINGS_TOKEN_PD": "36705197-0eec-40ac-86da-c07430d0aa22",
        "TP_SETTINGS_TOKEN_IN": "35309cbd-73fe-4b8b-b504-7b482cd55f42",
        "TP_SETTINGS_TOKEN_AC": "7e02a525-f7f4-4525-8179-9dd224f29324"
      }
    }
"@

try {
    # Ensure the directory exists
    $mcpDir = Split-Path $McpJsonPath -Parent
    if (-not (Test-Path $mcpDir)) {
        New-Item -Path $mcpDir -ItemType Directory -Force | Out-Null
    }
    
    # Check if mcp.json already exists
    $existingConfig = $null
    $mcpConfigUpdated = $false
    
    if (Test-Path $McpJsonPath) {
        Write-Host "Existing mcp.json found. Merging configuration..." -ForegroundColor Cyan
        try {
            $existingContent = Get-Content -Path $McpJsonPath -Raw -Encoding UTF8
            $existingConfig = $existingContent | ConvertFrom-Json
            
            # Check if mcpServers exists, if not create it
            if (-not $existingConfig.mcpServers) {
                $existingConfig | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value @{}
            }
            
            # Check if company-settings already exists
            if ($existingConfig.mcpServers.PSObject.Properties["company-settings"]) {
                Write-Host "Warning: 'company-settings' server already exists. Updating configuration..." -ForegroundColor Yellow
            } else {
                Write-Host "Adding 'company-settings' server to existing configuration..." -ForegroundColor Green
            }
            
            # Add or update the company-settings server
            $existingConfig.mcpServers | Add-Member -MemberType NoteProperty -Name "company-settings" -Value $newServerConfig -Force
            $mcpConfigUpdated = $true
            
        } catch {
            Write-Host "Error reading existing mcp.json: $_" -ForegroundColor Yellow
            Write-Host "Creating new configuration..." -ForegroundColor Cyan
            $existingConfig = $null
        }
    }
    
    # If no existing config or failed to read, create new one
    if (-not $existingConfig) {
        Write-Host "Creating new mcp.json configuration..." -ForegroundColor Cyan
        $existingConfig = @{
            mcpServers = @{
                "company-settings" = $newServerConfig
            }
        }
        $mcpConfigUpdated = $true
    }
    
    if ($mcpConfigUpdated) {
        # Convert to JSON with proper formatting
        $jsonContent = $existingConfig | ConvertTo-Json -Depth 4
        
        # Write the JSON file
        $jsonContent | Out-File -FilePath $McpJsonPath -Encoding UTF8
        Write-Host "MCP configuration updated at: $McpJsonPath" -ForegroundColor Green
        
        # Display the copyable configuration for manual setup
        Write-Host "`n=== Manual Configuration (if needed) ===" -ForegroundColor Cyan
        Write-Host "If you need to manually add this server configuration, use:" -ForegroundColor White
        Write-Host ""
        Write-Host $copyableServerConfig -ForegroundColor Gray
        Write-Host ""
        Write-Host "Add the above configuration to your mcpServers section." -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "Error updating mcp.json: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "[OK] Dependencies installed" -ForegroundColor Green
Write-Host "[OK] Project built successfully" -ForegroundColor Green
Write-Host "[OK] MCP configuration updated" -ForegroundColor Green
Write-Host "`nYou can now use the MCP server with the updated configuration." -ForegroundColor Cyan
Write-Host "Configuration file: $McpJsonPath" -ForegroundColor Cyan

# Optional: Test the built server
Write-Host "`n=== Testing Server ===" -ForegroundColor Yellow
Write-Host "Testing if the built server can start..." -ForegroundColor Cyan

try {
    # Test if the server can start (will timeout after 5 seconds)
    $testProcess = Start-Process -FilePath "node" -ArgumentList $DistPath -NoNewWindow -PassThru
    Start-Sleep -Seconds 2
    
    if (-not $testProcess.HasExited) {
        Write-Host "[OK] Server appears to start correctly" -ForegroundColor Green
        $testProcess.Kill()
    } else {
        Write-Host "[WARNING] Server exited immediately - check for errors" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[WARNING] Could not test server startup: $_" -ForegroundColor Yellow
}

Write-Host "`nSetup completed successfully!" -ForegroundColor Green