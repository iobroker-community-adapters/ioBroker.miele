# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.5.7
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

---

## 📑 Table of Contents

1. [Project Context](#project-context)
2. [Code Quality & Standards](#code-quality--standards)
   - [Code Style Guidelines](#code-style-guidelines)
   - [ESLint Configuration](#eslint-configuration)
3. [Testing](#testing)
   - [Unit Testing](#unit-testing)
   - [Integration Testing](#integration-testing)
   - [API Testing with Credentials](#api-testing-with-credentials)
4. [Development Best Practices](#development-best-practices)
   - [Dependency Management](#dependency-management)
   - [HTTP Client Libraries](#http-client-libraries)
   - [Error Handling](#error-handling)
5. [Admin UI Configuration](#admin-ui-configuration)
   - [JSON-Config Setup](#json-config-setup)
   - [Translation Management](#translation-management)
6. [Documentation](#documentation)
   - [README Updates](#readme-updates)
   - [Changelog Management](#changelog-management)
7. [CI/CD & GitHub Actions](#cicd--github-actions)
   - [Workflow Configuration](#workflow-configuration)
   - [Testing Integration](#testing-integration)

---

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

**ioBroker Miele Adapter Context:**
This adapter connects ioBroker to Miele home appliances through the Miele XGW 3000/2000 gateway. The adapter receives UDP broadcasts from Miele appliances and can interact with them via RPC calls. Key characteristics:
- Works with Miele@home enabled appliances (washing machines, dryers, dishwashers, ovens, etc.)
- Requires a Miele XGW 3000 or XGW 2000 gateway on the local network
- Uses UDP multicast (239.255.68.139:2810) to receive device status broadcasts
- Uses JSON-RPC over HTTP to query device states and send commands
- Automatically creates device objects and states when appliances are first detected
- No initial configuration required - devices are discovered automatically

---

## Code Quality & Standards

### Code Style Guidelines

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

**Timer and Resource Cleanup Example:**
```javascript
private connectionTimer?: NodeJS.Timeout;

async onReady() {
  this.connectionTimer = setInterval(() => this.checkConnection(), 30000);
}

onUnload(callback) {
  try {
    if (this.connectionTimer) {
      clearInterval(this.connectionTimer);
      this.connectionTimer = undefined;
    }
    callback();
  } catch (e) {
    callback();
  }
}
```

### ESLint Configuration

**CRITICAL:** ESLint validation must run FIRST in your CI/CD pipeline, before any other tests. This "lint-first" approach catches code quality issues early.

#### Setup
```bash
npm install --save-dev eslint @iobroker/eslint-config
```

#### Configuration (.eslintrc.json)
```json
{
  "extends": "@iobroker/eslint-config",
  "rules": {
    // Add project-specific rule overrides here if needed
  }
}
```

#### Package.json Scripts
```json
{
  "scripts": {
    "lint": "eslint --max-warnings 0 .",
    "lint:fix": "eslint . --fix"
  }
}
```

#### Best Practices
1. ✅ Run ESLint before committing — fix ALL warnings, not just errors
2. ✅ Use `lint:fix` for auto-fixable issues
3. ✅ Don't disable rules without documentation
4. ✅ Lint all relevant files (main code, tests, build scripts)
5. ✅ Keep `@iobroker/eslint-config` up to date
6. ✅ **ESLint warnings are treated as errors in CI** (`--max-warnings 0`). The `lint` script above already includes this flag — run `npm run lint` to match CI behavior locally

#### Common Issues
- **Unused variables**: Remove or prefix with underscore (`_variable`)
- **Missing semicolons**: Run `npm run lint:fix`
- **Indentation**: Use 4 spaces (ioBroker standard)
- **console.log**: Replace with `adapter.log.debug()` or remove

---

## Testing

### Unit Testing

- Use Jest as the primary testing framework
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files

**Example Structure:**
```javascript
describe('AdapterName', () => {
  let adapter;
  
  beforeEach(() => {
    // Setup test adapter instance
  });
  
  test('should initialize correctly', () => {
    // Test adapter initialization
  });
});
```

### Integration Testing

**CRITICAL:** Use the official `@iobroker/testing` framework. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation:** https://github.com/ioBroker/testing

#### Framework Structure

**✅ Correct Pattern:**
```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        // Get adapter object
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.miele.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) return reject(new Error('Adapter object not found'));

                        harness.objects.setObject(obj._id, obj);
                        
                        // Start and wait
                        await harness.startAdapterAndWait();
                        await new Promise(resolve => setTimeout(resolve, 15000));

                        // Verify states
                        const stateIds = await harness.dbConnection.getStateIDs('miele.0.*');
                        
                        if (stateIds.length > 0) {
                            console.log('✅ Adapter successfully created states');
                            await harness.stopAdapter();
                            resolve(true);
                        } else {
                            reject(new Error('Adapter did not create any states'));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).timeout(40000);
        });
    }
});
```

#### Miele-Specific Testing Considerations

For the Miele adapter, integration tests should account for:
- **Network Dependencies**: UDP broadcast listening and RPC communication — use mocks
- **Mock Device Data**: Create sample device broadcast messages for testing without live hardware
- **Gateway Simulation**: Mock the XGW gateway responses for comprehensive testing
- **Device Discovery**: Test automatic device creation from broadcast messages

Example mock data structure for Miele devices:
```javascript
const mockMieleDevice = {
    "Name": "WashingMachine_001",
    "UID": "001DA1234567#WM_001",
    "DeviceType": "WashingMachine",
    "State": {
        "ProgramPhase": { "Value": 1792, "Name": "PreWash" },
        "Status": { "Value": 5, "Name": "Running" },
        "RemainingTime": { "Value": 3600, "Name": "01:00:00" }
    }
};
```

#### Key Rules

1. ✅ Use `@iobroker/testing` framework
2. ✅ Configure via `harness.objects.setObject()`
3. ✅ Start via `harness.startAdapterAndWait()`
4. ✅ Verify states via `harness.states.getState()`
5. ✅ Allow proper timeouts for async operations
6. ❌ NEVER test API URLs directly
7. ❌ NEVER bypass the harness system

#### Workflow Dependencies

Integration tests should run ONLY after lint and adapter tests pass:

```yaml
integration-tests:
  needs: [check-and-lint, adapter-tests]
  runs-on: ubuntu-22.04
```

### API Testing with Credentials

For adapters connecting to external APIs requiring authentication:

#### Password Encryption for Integration Tests

```javascript
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    if (!systemConfig?.native?.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    return result;
}
```

---

## Development Best Practices

### Dependency Management

- Always use `npm` for dependency management
- Use `npm ci` for installing existing dependencies (respects package-lock.json)
- Use `npm install` only when adding or updating dependencies
- Keep dependencies minimal and focused
- Only update dependencies in separate Pull Requests

**When modifying package.json:**
1. Run `npm install` to sync package-lock.json
2. Commit both package.json and package-lock.json together

**Best Practices:**
- Prefer built-in Node.js modules when possible
- Use `@iobroker/adapter-core` for adapter base functionality
- Avoid deprecated packages
- Document specific version requirements

### HTTP Client Libraries

- **Preferred:** Use native `fetch` API (Node.js 20+ required)
- **Avoid:** `axios` unless specific features are required

**Example with fetch:**
```javascript
try {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
} catch (error) {
  this.log.error(`API request failed: ${error.message}`);
}
```

**Other Recommendations:**
- **Logging:** Use adapter built-in logging (`this.log.*`)
- **Scheduling:** Use adapter built-in timers and intervals
- **File operations:** Use Node.js `fs/promises`
- **Configuration:** Use adapter config system

### Error Handling

- Always catch and log errors appropriately
- Use adapter log levels (error, warn, info, debug)
- Provide meaningful, user-friendly error messages
- Handle network failures gracefully
- Implement retry mechanisms where appropriate
- Always clean up timers, intervals, and resources in `unload()` method

**Example:**
```javascript
try {
  await this.connectToDevice();
} catch (error) {
  this.log.error(`Failed to connect to device: ${error.message}`);
  this.setState('info.connection', false, true);
  // Implement retry logic if needed
}
```

---

## Admin UI Configuration

### JSON-Config Setup

Use JSON-Config format for modern ioBroker admin interfaces.

**Example Structure:**
```json
{
  "type": "panel",
  "items": {
    "host": {
      "type": "text",
      "label": "Host address",
      "help": "IP address or hostname of the device"
    }
  }
}
```

**Guidelines:**
- ✅ Use consistent naming conventions
- ✅ Provide sensible default values
- ✅ Include validation for required fields
- ✅ Add tooltips for complex options
- ✅ Ensure translations for all supported languages (minimum English and German)
- ✅ Write end-user friendly labels, avoid technical jargon

### Translation Management

**CRITICAL:** Translation files must stay synchronized with `admin/jsonConfig.json`. Orphaned keys or missing translations cause UI issues and PR review delays.

#### Overview
- **Location:** `admin/i18n/{lang}/translations.json` for 11 languages (de, en, es, fr, it, nl, pl, pt, ru, uk, zh-cn)
- **Source of truth:** `admin/jsonConfig.json` - all `label` and `help` properties must have translations
- **Command:** `npm run translate` - auto-generates translations but does NOT remove orphaned keys
- **Formatting:** English uses tabs, other languages use 4 spaces

#### Critical Rules
1. ✅ Keys must match exactly with jsonConfig.json
2. ✅ No orphaned keys in translation files
3. ✅ All translations must be in native language (no English fallbacks)
4. ✅ Keys must be sorted alphabetically

#### Workflow for Translation Updates

**When modifying admin/jsonConfig.json:**

1. Make your changes to labels/help texts
2. Run automatic translation: `npm run translate`
3. Run validation and remove orphaned keys
4. Add missing translations in native languages
5. Run: `npm run lint && npm run test`

#### Translation Checklist

Before committing changes to admin UI or translations:
1. ✅ No orphaned keys in any translation file
2. ✅ All translations in native language
3. ✅ Keys alphabetically sorted
4. ✅ `npm run lint` passes
5. ✅ `npm run test` passes

---

## Documentation

### README Updates

#### Required Sections
1. **Installation** - Clear npm/ioBroker admin installation steps
2. **Configuration** - Detailed configuration options with examples
3. **Usage** - Practical examples and use cases
4. **Changelog** - Version history (use "## **WORK IN PROGRESS**" for ongoing changes)
5. **License** - License information (typically MIT for ioBroker adapters)
6. **Support** - Links to issues, discussions, community support

#### Mandatory README Updates for PRs

For **every PR or new feature**, always add a user-friendly entry to README.md:

- Add entries under `## **WORK IN PROGRESS**` section
- Use format: `* (author) **TYPE**: Description of user-visible change`
- Types: **NEW** (features), **FIXED** (bugs), **ENHANCED** (improvements), **TESTING** (test additions), **CI/CD** (automation)
- Focus on user impact, not technical details

### Changelog Management

Follow the [AlCalzone release-script](https://github.com/AlCalzone/release-script) standard.

#### Format Requirements

```markdown
# Changelog

<!--
  Placeholder for the next version (at the beginning of the line):
  ## **WORK IN PROGRESS**
-->

## **WORK IN PROGRESS**

- (author) **NEW**: Added new feature X
- (author) **FIXED**: Fixed bug Y (fixes #25)

## v0.1.0 (2023-01-01)
Initial release
```

#### Change Entry Format
- Format: `- (author) **TYPE**: User-friendly description`
- Types: **NEW**, **FIXED**, **ENHANCED**
- Focus on user impact, not technical implementation
- Reference issues: "fixes #XX" or "solves #XX"

---

## CI/CD & GitHub Actions

### Workflow Configuration

#### GitHub Actions Best Practices

**Must use ioBroker official testing actions:**
- `ioBroker/testing-action-check@v1` for lint and package validation
- `ioBroker/testing-action-adapter@v1` for adapter tests
- `ioBroker/testing-action-deploy@v1` for automated releases with Trusted Publishing (OIDC)

**Configuration:**
- **Node.js versions:** Test on 20.x, 22.x, 24.x
- **Platform:** Use ubuntu-22.04
- **Automated releases:** Deploy to npm on version tags (requires NPM Trusted Publishing)

#### Critical: Lint-First Validation Workflow

**ALWAYS run ESLint checks BEFORE other tests.**

**Workflow Dependency Configuration:**
```yaml
jobs:
  check-and-lint:
    # Runs ESLint and package validation
    # Uses: ioBroker/testing-action-check@v1
    
  adapter-tests:
    needs: [check-and-lint]  # Wait for linting to pass
    # Run adapter unit tests
    
  integration-tests:
    needs: [check-and-lint, adapter-tests]  # Wait for both
    # Run integration tests
```

### Testing Integration

#### Miele Hardware Testing in CI/CD

Since the Miele adapter requires physical hardware (XGW gateway), use mock data for all CI/CD tests:

```yaml
# Tests basic functionality without hardware (runs on every commit)
unit-tests:
  runs-on: ubuntu-22.04
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
    - run: npm ci
    - run: npm run test:unit

# Integration tests with mock data (no live hardware required)
integration-tests:
  needs: [check-and-lint, adapter-tests]
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  runs-on: ubuntu-22.04
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
    - run: npm ci
    - run: npm run test:integration
```

#### Testing Best Practices
- Run hardware-independent tests on every commit
- Use mock data for integration tests to avoid hardware dependencies
- Don't make hardware connectivity tests required for deployment
- Provide clear failure messages for network connectivity issues
- Use appropriate timeouts for UDP socket operations (30+ seconds)

---

## Miele Adapter Specific Patterns

### Adapter Lifecycle Management

```javascript
// Standard ioBroker adapter structure
class MieleAdapter extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: 'miele',
    });
    this.on('ready', this.onReady.bind(this));
    this.on('unload', this.onUnload.bind(this));
  }

  async onReady() {
    // Initialize UDP listener
    this.startUdpListener();
    // Initialize RPC clients
    this.initializeRpcClients();
  }

  async onUnload(callback) {
    try {
      // Clean shutdown of network connections
      if (this.udpSocket) {
        this.udpSocket.close();
        this.udpSocket = null;
      }
      // Clear any running timers
      if (this.connectionTimer) {
        this.clearTimeout(this.connectionTimer);
        this.connectionTimer = undefined;
      }
      callback();
    } catch (e) {
      callback();
    }
  }
}
```

### Network Communication Patterns

```javascript
// UDP Broadcast Listener
function startUdpListener() {
  this.udpSocket = dgram.createSocket('udp4');
  this.udpSocket.bind(2810, () => {
    this.udpSocket.addMembership('239.255.68.139');
    this.log.info('UDP listener started on port 2810');
  });
  this.udpSocket.on('message', (msg, rinfo) => {
    this.handleDeviceMessage(msg, rinfo);
  });
  this.udpSocket.on('error', (err) => {
    this.log.error('UDP Socket error: ' + err);
  });
}

// RPC Communication
function queryDevice(ip, deviceId) {
  const client = new rpc.Client({ host: ip, port: 80, path: '/' });
  return new Promise((resolve, reject) => {
    client.call('GetCurrentState', [deviceId], (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}
```

### Miele Adapter Specific Standards

- Use camelCase for device state names (e.g. `remainingTime`, `programPhase`)
- Create localized state values when available from device metadata
- Implement proper error handling for network timeouts and connection failures
- Use consistent device naming: `{DeviceType}_{SerialNumber}` format
- Always validate received UDP messages before processing

### Device State Management

```javascript
async createDeviceStates(device) {
  const devicePath = `${device.DeviceType}_${device.SerialNumber}`;
  await this.setObjectNotExistsAsync(devicePath, {
    type: 'device',
    common: { name: device.Name || devicePath, type: 'mixed' },
    native: { uid: device.UID, deviceType: device.DeviceType }
  });
  await this.setObjectNotExistsAsync(`${devicePath}.states`, {
    type: 'channel',
    common: { name: 'Device States' },
    native: {}
  });
  for (const [stateName, stateData] of Object.entries(device.States)) {
    await this.createStateObject(devicePath, stateName, stateData);
  }
}
```

### Complete Device Message Handler

```javascript
function handleDeviceMessage(message, remoteInfo) {
  try {
    const deviceData = JSON.parse(message.toString());
    if (!deviceData.UID || !deviceData.DeviceType) {
      this.log.warn('Received invalid device message: missing UID or DeviceType');
      return;
    }
    this.deviceIPs[deviceData.UID] = remoteInfo.address;
    this.updateDeviceStates(deviceData);
    this.queryDeviceState(remoteInfo.address, deviceData.UID);
  } catch (error) {
    this.log.error('Failed to process device message: ' + error.message);
  }
}
```

### RPC Retry Pattern

```javascript
async function safeRpcCall(ip, method, params) {
  const maxRetries = 3;
  const retryDelay = 1000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.rpcClient.call(method, params);
    } catch (error) {
      this.log.warn(`RPC call attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxRetries) {
        this.log.error(`RPC call to ${ip} failed after ${maxRetries} attempts`);
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
}
```

### Security Considerations

- Validate all incoming UDP messages before processing
- Implement rate limiting for RPC calls to prevent gateway overload
- Use proper input sanitization for device names and state values
- Log security-relevant events (connection attempts, malformed messages)
- Consider implementing access control for sensitive device operations

### Performance Optimization

- Batch state updates when possible to reduce database operations
- Implement caching for frequently accessed device states
- Use connection pooling for RPC clients
- Implement proper cleanup of inactive device connections
- Monitor memory usage for long-running adapter instances