# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

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

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
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

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
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
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Check for expected states
                        const states = await harness.states.getStatesAsync('your-adapter.0.*');
                        
                        // Verify critical states exist
                        const requiredStates = [
                            'your-adapter.0.info.connection'
                        ];
                        
                        for (const stateName of requiredStates) {
                            if (!states[stateName]) {
                                return reject(new Error(`Required state ${stateName} was not created`));
                            }
                        }
                        
                        console.log('✅ All expected states created');
                        resolve();
                        
                    } catch (error) {
                        console.error('❌ Test failed:', error);
                        reject(error);
                    }
                });
            }).timeout(120000); // 2 minutes timeout
        });
    }
});
```

#### Miele-Specific Testing Considerations
For the Miele adapter, integration tests should account for:
- **Network Dependencies**: UDP broadcast listening and RPC communication
- **Mock Device Data**: Create sample device broadcast messages for testing
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

## Architecture and Best Practices

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
      // Close connections, clean up resources
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
  const client = new rpc.Client({
    host: ip,
    port: 80,
    path: '/'
  });
  
  return new Promise((resolve, reject) => {
    client.call('GetCurrentState', [deviceId], (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

**Miele Adapter Specific Standards:**
- Use camelCase for device state names (e.g. `remainingTime`, `programPhase`)
- Create localized state values when available from device metadata
- Implement proper error handling for network timeouts and connection failures
- Use consistent device naming: `{DeviceType}_{SerialNumber}` format
- Always validate received UDP messages before processing

## Device State Management

### State Creation Pattern
```javascript
async createDeviceStates(device) {
  const devicePath = `${device.DeviceType}_${device.SerialNumber}`;
  
  // Create device object
  await this.setObjectNotExistsAsync(devicePath, {
    type: 'device',
    common: {
      name: device.Name || devicePath,
      type: 'mixed'
    },
    native: {
      uid: device.UID,
      deviceType: device.DeviceType
    }
  });
  
  // Create channel for states
  await this.setObjectNotExistsAsync(`${devicePath}.states`, {
    type: 'channel',
    common: { name: 'Device States' },
    native: {}
  });
  
  // Create individual states
  for (const [stateName, stateData] of Object.entries(device.States)) {
    await this.createStateObject(devicePath, stateName, stateData);
  }
}
```

## CI/CD and Testing Integration

### GitHub Actions for Hardware Testing
For adapters with hardware dependencies like the Miele adapter, implement separate CI/CD jobs:

```yaml
# Tests basic functionality without hardware (runs on every commit)
unit-tests:
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run unit tests
      run: npm run test:unit

# Tests with mock hardware data (runs separately)
integration-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run integration tests with mock data
      run: npm run test:integration
```

### CI/CD Best Practices
- Run hardware-independent tests on every commit
- Use mock data for integration tests to avoid hardware dependencies  
- Don't make hardware connectivity tests required for deployment
- Provide clear failure messages for network connectivity issues
- Use appropriate timeouts for UDP socket operations (30+ seconds)

### Package.json Script Integration
Add dedicated scripts for different test types:
```json
{
  "scripts": {
    "test:unit": "mocha test/unit --exit",
    "test:integration": "mocha test/integration --exit",
    "test:all": "npm run test:unit && npm run test:integration"
  }
}
```

## Practical Examples

### Complete Device Message Handler
```javascript
function handleDeviceMessage(message, remoteInfo) {
  try {
    // Parse JSON message
    const deviceData = JSON.parse(message.toString());
    
    // Validate required fields
    if (!deviceData.UID || !deviceData.DeviceType) {
      this.log.warn('Received invalid device message: missing UID or DeviceType');
      return;
    }
    
    // Store device IP for RPC communication
    this.deviceIPs[deviceData.UID] = remoteInfo.address;
    
    // Update device states
    this.updateDeviceStates(deviceData);
    
    // Query for additional state information via RPC
    this.queryDeviceState(remoteInfo.address, deviceData.UID);
    
  } catch (error) {
    this.log.error('Failed to process device message: ' + error.message);
  }
}
```

### Error Handling Best Practices
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

## Security Considerations

- Validate all incoming UDP messages before processing
- Implement rate limiting for RPC calls to prevent gateway overload
- Use proper input sanitization for device names and state values
- Log security-relevant events (connection attempts, malformed messages)
- Consider implementing access control for sensitive device operations

## Performance Optimization

- Batch state updates when possible to reduce database operations
- Implement caching for frequently accessed device states
- Use connection pooling for RPC clients
- Implement proper cleanup of inactive device connections
- Monitor memory usage for long-running adapter instances

This file provides comprehensive guidance for GitHub Copilot when working on the ioBroker Miele adapter, covering testing, architecture, best practices, and practical implementation examples specific to Miele appliance integration.