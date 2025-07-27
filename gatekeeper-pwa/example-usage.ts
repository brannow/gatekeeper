/**
 * Example usage of NetworkService with adapter chain pattern
 * This demonstrates how to integrate the new Phase 2 architecture
 */

import { createNetworkService } from './src/services/NetworkService';
import { createHttpAdapter } from './src/adapters/HttpAdapter';
import { createMqttAdapter } from './src/adapters/MqttAdapter';
import type { NetworkServiceDelegate, NetworkAdapter, NetworkError } from './src/types/network';
import type { ESP32Config, MQTTConfig } from './src/types';

// Example configurations
const esp32Config: ESP32Config = {
  host: '192.168.1.100',
  port: 80,
  reachabilityStatus: 'unknown'
};

const mqttConfig: MQTTConfig = {
  host: 'mqtt.example.com',
  port: 8883,
  username: 'gate-user',
  password: 'gate-password',
  ssl: true,
  reachabilityStatus: 'unknown'
};

// Example delegate implementation
class ExampleDelegate implements NetworkServiceDelegate {
  onTriggerSuccess(adapter: NetworkAdapter, duration: number): void {
    console.log(`✅ Gate triggered successfully via ${adapter.name} in ${duration}ms`);
  }

  onTriggerFailure(adapter: NetworkAdapter, error: NetworkError): void {
    console.log(`❌ Gate trigger failed via ${adapter.name}: ${error.message}`);
  }

  onConnectionTest(adapter: NetworkAdapter, success: boolean, duration: number): void {
    console.log(`🔗 Connection test for ${adapter.name}: ${success ? 'PASS' : 'FAIL'} (${duration}ms)`);
  }
}

// Example usage function
async function exampleUsage() {
  console.log('🚀 Starting NetworkService example...');

  // Create the service
  const networkService = createNetworkService();
  networkService.delegate = new ExampleDelegate();

  try {
    // Create adapters (HTTP first, MQTT fallback)
    const httpAdapter = createHttpAdapter(esp32Config);
    const mqttAdapter = createMqttAdapter(mqttConfig);

    // Add adapters to service (order matters - HTTP first)
    await networkService.addAdapter(httpAdapter);
    await networkService.addAdapter(mqttAdapter);

    console.log(`📡 Added ${networkService.adapters.length} adapters to chain`);

    // Initialize the service
    await networkService.initialize();
    console.log('✅ NetworkService initialized');

    // Test all connections
    console.log('\n🔍 Testing all connections...');
    const results = await networkService.testAllConnections();
    
    for (const result of results) {
      console.log(`  ${result.adapter?.name}: ${result.success ? '✅' : '❌'} (${result.duration}ms)`);
    }

    // Trigger the gate using adapter chain
    console.log('\n🎯 Triggering gate...');
    const success = await networkService.triggerGate();
    
    if (success) {
      console.log('🎉 Gate triggered successfully!');
    } else {
      console.log('💥 All adapters failed to trigger gate');
    }

  } catch (error) {
    console.error('💥 Error during example:', error);
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await networkService.cleanup();
    console.log('✅ Cleanup completed');
  }
}

// Example of dynamic adapter management
async function dynamicAdapterExample() {
  const networkService = createNetworkService();
  
  // Start with just HTTP
  const httpAdapter = createHttpAdapter(esp32Config);
  await networkService.addAdapter(httpAdapter);
  
  console.log(`Current adapters: ${networkService.adapters.length}`);
  
  // Add MQTT later
  const mqttAdapter = createMqttAdapter(mqttConfig);
  await networkService.addAdapter(mqttAdapter);
  
  console.log(`Current adapters: ${networkService.adapters.length}`);
  
  // Remove HTTP adapter
  await networkService.removeAdapter(httpAdapter);
  
  console.log(`Current adapters: ${networkService.adapters.length}`);
  
  // Clean up
  await networkService.cleanup();
}

// Export for potential usage in app
export { exampleUsage, dynamicAdapterExample };

// For testing purposes, you could run:
// exampleUsage().catch(console.error);