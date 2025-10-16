# Transporeon MCP Server - Secure Deployment Guide

## 📋 **Prerequisites**

### **System Requirements**

- **Operating System**: Windows 10/11 or Windows Server 2019+
- **PowerShell**: Version 5.1+ (included with Windows)
- **Memory**: Minimum 4GB RAM, Recommended 8GB+
- **Disk Space**: At least 2GB free space for container images

### **Required Software**

#### **1. Node.js & npm**

- **Version**: Node.js 18 or higher
- **Download**: https://nodejs.org/
- **Verify Installation**:
  ```powershell
  node --version    # Should show v18.x.x or higher
  npm --version     # Should show 8.x.x or higher
  ```

#### **2. Podman for Windows**

- **Version**: 4.0 or higher
- **Download**: https://podman.io/getting-started/installation#windows
- **Verify Installation**:
  ```powershell
  podman --version  # Should show 4.x.x or higher
  ```

#### **3. Git (Optional but Recommended)**

- **Download**: https://git-scm.com/download/win
- **Purpose**: For cloning the repository and version control

### **Network Requirements**

- **VPN Access**: Must be connected to Transporeon internal network
- **Firewall**: Ensure outbound HTTPS (443) and HTTP (80) are allowed
- **Internal URLs**: Access to `tpadmin.pd.tp.nil`, `tpadmin.in.tp.nil`, `tpadmin.ac.tp.nil`

### **Security Prerequisites**

#### **API Tokens**

Before starting deployment, obtain **NEW** API tokens from Transporeon admin portal:

| Environment                | Token Type        | Required Permissions            |
| -------------------------- | ----------------- | ------------------------------- |
| **Production (PD)**  | UUID format token | Company Settings API Read/Write |
| **Integration (IN)** | UUID format token | Company Settings API Read/Write |
| **Acceptance (AC)**  | UUID format token | Company Settings API Read/Write |

**[!] Important**:

- **Request completely new tokens** from Transporeon API administrators
- **Tokens should be in UUID format**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

#### **PowerShell Execution Policy**

```powershell
# Check current policy
Get-ExecutionPolicy

# If restricted, enable script execution (run as Administrator)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

---

## **Next Steps**

### **Phase 1: Preparation (30 minutes)**

#### **Step 1: Get New API Tokens**

**TBD**

#### **Step 2: Prepare Environment**

```powershell
# Navigate to project directory
cd E:\MCPservers\customer_settings_api_mcp_http

# Verify prerequisites
.\Secure-Setup.ps1 -Help

# Clean up any existing insecure setup (optional)
.\Secure-Setup.ps1 -Clean
```

### **Phase 2: Secure Deployment (15 minutes)**

#### **Step 3: Run Secure Setup**

```powershell
# Full secure deployment
.\Secure-Setup.ps1
```

**You will be prompted for**:

- Production (PD) Token: `[secure input - masked]`
- Integration (IN) Token: `[secure input - masked]`
- Acceptance (AC) Token: `[secure input - masked]`

#### **Step 4: Verify Deployment**

```powershell
# Check status
podman ps --filter name=transporeon-mcp

# Test tokens manually (optional)
podman exec transporeon-mcp node -e "const { verifyEnvironmentTokens } = require('./dist/handlers.js'); verifyEnvironmentTokens().then(r => Object.entries(r).forEach(([env, res]) => console.log((res.valid ? '[OK]' : '[X]') + ' ' + env.toUpperCase() + ': ' + (res.valid ? 'Valid' : 'Invalid')))).catch(e => console.log('[X] Test failed:', e.message));"

# Expected output:
# [OK] Container is running
# [OK] PD: Valid
# [OK] AC: Valid
# [OK] IN: Valid
```

### **Phase 3: Integration (10 minutes)**

#### **Step 5: Update MCP Configuration**

Your existing MCP configuration in Cursor needs to be updated to use the containerized version.

**New configuration** (secure containerized version):

```json
{
  "mcpServers": {
    "company-settings": {
      "command": "podman",
      "args": ["exec", "-i", "transporeon-mcp", "node", "dist/index.js"],
      "env": {}
    }
  }
}
```

**Key differences**:

- [OK] **No hardcoded tokens** in configuration
- [OK] **Uses containerized version** via `podman exec`
- [OK] **Tokens injected securely** at container runtime

#### **Step 6: Test Integration**

1. **Restart Cursor** to pick up new MCP configuration
2. **Test MCP functionality** in Cursor
3. **Verify API calls work** with new tokens

---

## ⚙️ **What Happens During Setup**

### **Phase 1: Security Validation (2 minutes)**

```powershell
[INFO] Checking Requirements
[INFO] [OK] Podman found
[INFO] [OK] npm found
[INFO] [OK] Node.js found
```

**What it checks**:

- [OK] Project directory structure (`package.json`, `src/index.ts`)
- [OK] Required tools (Podman, npm, Node.js)
- [OK] PowerShell execution permissions

### **Phase 2: Secure Token Collection (3 minutes)**

```powershell
=== Creating Podman Secrets ===
[WARN] Removing old secrets...

Enter Production (PD) Token:
Paste token (CTRL + SHIFT + V)
Paste token here: 36705197-0eec-40ac-86da-c07430d0aa22
Token received and screen cleared.
[INFO] [OK] Production (PD) token validated

Enter Acceptance (AC) Token:
Paste token (CTRL + SHIFT + V)
Paste token here: 7e02a525-f7f4-4525-8179-9dd224f29324
Token received and screen cleared.
[INFO] [OK] Acceptance (AC) token validated

Enter Integration (IN) Token:
Paste token (CTRL + SHIFT + V)
Paste token here: 35309cbd-73fe-4b8b-b504-7b482cd55f42
Token received and screen cleared.
[INFO] [OK] Integration (IN) token validated
```

**What it does**:

- [*] **Simple paste input** (with automatic screen clearing for security)
- [*] **Validates token format** (UUID pattern, minimum length)  
- [*] **Removes old secrets** (if any exist)
- [*] **Creates temporary secure files** (600 permissions)
- [*] **Creates Podman secrets** (encrypted storage)
- [*] **Secure cleanup** (overwrites temp files 3x with random data)

### **Phase 3: Container Build (5-8 minutes)**

```powershell
=== Building Container Image ===
[INFO] Installing dependencies...
[INFO] Building project...
[INFO] Building container...
[INFO] [OK] Container built successfully
```

**What it does**:

- [*] **npm install** - Downloads Node.js dependencies
- [*] **npm run build** - Compiles TypeScript to JavaScript
- [*] **podman build** - Creates secure container image with:
  - [OK] **Multi-stage build** (smaller final image)
  - [OK] **Non-root user** (security hardening)
  - [OK] **Minimal base image** (reduced attack surface)
  - [OK] **No secrets in image** (runtime injection only)

### **Phase 4: Secure Deployment (2 minutes)**

```powershell
=== Deploying Container ===
[INFO] Starting container with secrets...
[INFO] [OK] Container is running
```

**What it does**:

- [*] **Stops existing container** (if running)
- [*] **Creates logs directory** (`./logs/`)
- [*] **Starts secure container** with:
  - [*] **Secret injection** (runtime environment variables)
  - [*] **Security options** (`no-new-privileges`, read-only filesystem)
  - [*] **Non-root execution** (user 1001:1001)
  - [*] **Host network** (for VPN access)
  - [*] **Tmpfs mount** (secure temporary storage)

### **Phase 5: Verification (1 minute)**

```powershell
=== Verifying Deployment ===
[INFO] [OK] Container is running
[INFO] Testing token validation...
[INFO] [OK] Token validation successful
[INFO] [SUCCESS] Deployment complete!
```

**What it tests**:

- [*] **Container health** (running status)
- [*] **Token validation** (API connectivity test)
- [*] **Network connectivity** (VPN and internal URLs)
- [*] **MCP server response** (application functionality)

---

## **Success Criteria**

### **Deployment Success Indicators**

[OK] All prerequisites installed and verified
[OK] New API tokens obtained from Transporeon admin
[OK] Container builds without errors
[OK] Container starts and runs successfully
[OK] All three environment tokens validate successfully
[OK] MCP server responds to requests
[OK] Cursor integration works with containerized version

### **Security Success Indicators**

[OK] No tokens visible in configuration files
[OK] Podman secrets created and encrypted
[OK] Container runs as non-root user
[OK] Container filesystem is read-only
[OK] Old hardcoded tokens removed from system
[OK] Git history cleaned of token exposure

---

## 🔄 **Token Management**

### **Token Rotation (Routine Maintenance)**

When your API tokens expire or need to be rotated, use the `-TokensOnly` flag to update tokens without rebuilding the container:

```powershell
# Navigate to project directory
cd E:\MCPservers\customer_settings_api_mcp_http

# Rotate all API tokens
.\Secure-Setup.ps1 -TokensOnly
```

**What happens during token rotation:**

1. **Verification**: Checks if container is running
2. **Token Collection**: Prompts for all three new tokens (PD → AC → IN)
3. **Secret Update**: Updates Podman secrets securely
4. **Container Restart**: Restarts container to apply new tokens
5. **Validation**: Tests all tokens to ensure they work

**When to rotate tokens:**

- [!] **Token Expiration**: Before tokens expire (check with API administrators)
- [!] **Security Incident**: If tokens may have been compromised
- [!] **Routine Maintenance**: According to Transporeon security policies
- [!] **Environment Changes**: When tokens are updated on Transporeon side

### **Alternative Token Management Commands**

```powershell
# Check token status without rotation
podman exec transporeon-mcp node -e "const { verifyEnvironmentTokens } = require('./dist/handlers.js'); verifyEnvironmentTokens().then(console.log).catch(console.error);"

# Check container status
podman ps --filter name=transporeon-mcp

# View container logs for token-related issues
podman logs transporeon-mcp --tail 50

# Restart container if needed (tokens remain unchanged)
podman restart transporeon-mcp
```

### **Token Security Best Practices**

- ✅ **Never share tokens** via email, chat, or insecure channels
- ✅ **Always use -TokensOnly** for routine token updates (faster, no rebuild)
- ✅ **Keep tokens in Podman secrets** (never in configuration files)
- ✅ **Rotate tokens regularly** according to security policies
- ✅ **Test tokens immediately** after rotation
- ⛔ **Never commit tokens** to version control
- ⛔ **Never store tokens** in plain text files

---

## 🚨 **Troubleshooting Quick Reference**

### **Common Issues & Solutions**

| Issue                            | Symptom                                          | Solution                                                    |
| -------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| **Script won't run**       | `execution of scripts is disabled`             | Run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| **Podman not found**       | `podman : The term 'podman' is not recognized` | Install Podman for Windows from official site               |
| **Token validation fails** | `[X] Token validation failed`                   | Check VPN connection and token validity                     |
| **Container won't start**  | `Failed to start container`                    | Check Podman logs:`podman logs transporeon-mcp`           |
| **Build fails**            | `npm run build failed`                         | Check Node.js version (needs 18+)                           |

### **Emergency Contacts**

- **Security Issues**: `security@transporeon.com`
- **API Token Issues**: `api-admin@transporeon.com`
- **Infrastructure Issues**: `devops@transporeon.com`

---

## 📚 **Additional Resources**

- **Full Analysis**: See `Documentation/Project-Analysis-and-Secure-Containerization.md`
- **Podman Documentation**: https://docs.podman.io/
- **MCP Protocol**: https://modelcontextprotocol.io/
- **Security Best Practices**: Internal Transporeon security guidelines

---

**[SECURITY] Note**: This deployment eliminates all critical security vulnerabilities present in the original `setup.ps1` script by implementing proper secrets management, container security, and eliminating hardcoded credentials.
