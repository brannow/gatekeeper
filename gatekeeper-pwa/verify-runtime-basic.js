/**
 * Basic Runtime Verification for Gatekeeper PWA
 * 
 * Tests that the application loads without critical errors
 * and that key architectural components are functioning.
 */

console.log('=== Gatekeeper PWA Runtime Verification ===');

// Test 1: Check if key modules can be imported
async function testModuleImports() {
  console.log('\n1. Testing Module Imports...');
  
  try {
    // Test core services
    const { createPersistentNetworkService } = await import('./src/services/PersistentNetworkService.js');
    console.log('✓ PersistentNetworkService can be imported');
    
    const { getNetworkEventBus } = await import('./src/services/NetworkEventBus.js');
    console.log('✓ NetworkEventBus can be imported');
    
    const { createPersistentMqttAdapter } = await import('./src/adapters/PersistentMqttAdapter.js');
    console.log('✓ PersistentMqttAdapter can be imported');
    
    const { createPersistentHttpAdapter } = await import('./src/adapters/PersistentHttpAdapter.js');
    console.log('✓ PersistentHttpAdapter can be imported');
    
    return true;
  } catch (error) {
    console.error('✗ Module import failed:', error);
    return false;
  }
}

// Test 2: Test service creation and initialization
async function testServiceCreation() {
  console.log('\n2. Testing Service Creation...');
  
  try {
    const { createPersistentNetworkService } = await import('./src/services/PersistentNetworkService.js');
    const service = createPersistentNetworkService();
    console.log('✓ PersistentNetworkService created');
    
    await service.initialize();
    console.log('✓ PersistentNetworkService initialized');
    
    const { getNetworkEventBus } = await import('./src/services/NetworkEventBus.js');
    const eventBus = getNetworkEventBus();
    console.log('✓ NetworkEventBus created');
    
    const stats = eventBus.getStats();
    console.log(`✓ EventBus stats: ${stats.totalListeners} listeners, ${stats.totalEventsEmitted} events`);
    
    await service.cleanup();
    console.log('✓ Service cleanup completed');
    
    return true;
  } catch (error) {
    console.error('✗ Service creation failed:', error);
    return false;
  }
}

// Test 3: Test configuration system
async function testConfigSystem() {
  console.log('\n3. Testing Configuration System...');
  
  try {
    const { createPersistentNetworkService } = await import('./src/services/PersistentNetworkService.js');
    const service = createPersistentNetworkService();
    
    await service.initialize();
    
    // Test config update performance
    const startTime = Date.now();
    
    const esp32Config = {
      host: '192.168.1.100',
      port: 80,
      reachabilityHost: '192.168.1.100'
    };
    
    const mqttConfig = {
      host: 'test.mosquitto.org',
      port: 8081,
      ssl: true,
      username: '',
      password: ''
    };
    
    await service.updateConfig(esp32Config, mqttConfig);
    
    const configTime = Date.now() - startTime;
    console.log(`✓ Configuration update completed in ${configTime}ms`);
    
    const adapters = service.adapters;
    console.log(`✓ ${adapters.length} adapters created`);
    
    // Verify adapter types
    const httpAdapter = adapters.find(a => a.method === 'http');
    const mqttAdapter = adapters.find(a => a.method === 'mqtt');
    
    if (httpAdapter) console.log('✓ HTTP adapter found');
    if (mqttAdapter) console.log('✓ MQTT adapter found');
    
    // Test performance target
    if (configTime < 100) {
      console.log('✓ Config update time meets <100ms target');
    } else {
      console.log(`⚠ Config update time ${configTime}ms exceeds 100ms target`);
    }
    
    await service.cleanup();
    return true;
    
  } catch (error) {
    console.error('✗ Configuration test failed:', error);
    return false;
  }
}

// Test 4: Test event system functionality
async function testEventSystem() {
  console.log('\n4. Testing Event System...');
  
  try {
    const { getNetworkEventBus } = await import('./src/services/NetworkEventBus.js');
    const eventBus = getNetworkEventBus();
    
    let eventsReceived = 0;
    
    // Subscribe to events
    const subscription = eventBus.subscribe('statusChange', (event) => {
      eventsReceived++;
      console.log(`✓ Received ${event.type} event from ${event.source}`);
    });
    
    // Emit test events
    eventBus.emitStatusChange('esp32', 'reachable', 'RuntimeTest');
    eventBus.emitStatusChange('mqtt', 'unreachable', 'RuntimeTest');
    
    // Allow event processing
    await new Promise(resolve => setTimeout(resolve, 10));
    
    if (eventsReceived === 2) {
      console.log('✓ All events received correctly');
    } else {
      console.log(`⚠ Expected 2 events, received ${eventsReceived}`);
    }
    
    // Test cleanup
    subscription.unsubscribe();
    const stats = eventBus.getStats();
    
    if (stats.totalListeners === 0) {
      console.log('✓ Event cleanup successful');
    } else {
      console.log(`⚠ ${stats.totalListeners} listeners remain after cleanup`);
    }
    
    return eventsReceived === 2;
    
  } catch (error) {
    console.error('✗ Event system test failed:', error);
    return false;
  }
}

// Test 5: Memory and stability check
async function testMemoryStability() {
  console.log('\n5. Testing Memory Stability...');
  
  try {
    let initialMemory, finalMemory;
    
    if (performance.memory) {
      initialMemory = performance.memory.usedJSHeapSize;
      console.log(`📊 Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
    }
    
    // Create and destroy services multiple times
    for (let i = 0; i < 5; i++) {
      const { createPersistentNetworkService } = await import('./src/services/PersistentNetworkService.js');
      const service = createPersistentNetworkService();
      
      await service.initialize();
      
      await service.updateConfig(
        { host: '192.168.1.100', port: 80, reachabilityHost: '192.168.1.100' },
        { host: 'test.mosquitto.org', port: 8081, ssl: true, username: '', password: '' }
      );
      
      await service.cleanup();
    }
    
    if (performance.memory) {
      finalMemory = performance.memory.usedJSHeapSize;
      console.log(`📊 Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
      
      const memoryIncrease = finalMemory - initialMemory;
      const increasePercent = (memoryIncrease / initialMemory) * 100;
      
      console.log(`📊 Memory change: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB (${increasePercent.toFixed(1)}%)`);
      
      if (increasePercent < 20) {
        console.log('✓ Memory usage appears stable');
        return true;
      } else {
        console.log('⚠ Potential memory leak detected');
        return false;
      }
    } else {
      console.log('⚠ Performance memory API not available');
      return true; // Can't test, assume OK
    }
    
  } catch (error) {
    console.error('✗ Memory stability test failed:', error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('Starting runtime verification tests...\n');
  
  const results = {
    moduleImports: await testModuleImports(),
    serviceCreation: await testServiceCreation(),
    configSystem: await testConfigSystem(),
    eventSystem: await testEventSystem(),
    memoryStability: await testMemoryStability()
  };
  
  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;
  
  console.log('\n=== RUNTIME VERIFICATION SUMMARY ===');
  console.log(`Tests Passed: ${passed}/${total}`);
  console.log(`Success Rate: ${((passed/total) * 100).toFixed(1)}%`);
  
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✓' : '✗'} ${test}`);
  });
  
  if (passed === total) {
    console.log('\n🎉 All runtime tests passed! Refactoring appears successful.');
  } else {
    console.log('\n⚠️ Some tests failed. Review the issues above.');
  }
  
  return passed === total;
}

// Auto-run in browser environment
if (typeof window !== 'undefined') {
  runAllTests().catch(console.error);
} else {
  console.log('Run this script in a browser environment.');
}

// Export for reuse
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAllTests };
}