import React, { useState, useEffect } from 'react';
import { useConfig } from '../hooks/useConfig';
import { validationService } from '../services/ValidationService';
import { createNetworkService } from '../services/NetworkService';
import { createHttpAdapter } from '../adapters/HttpAdapter';
import { createMqttAdapter } from '../adapters/MqttAdapter';
import type { NetworkResult } from '../types/network';
import type { ValidationError, ThemeMode, AppConfig } from '../types';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormState {
  esp32: {
    host: string;
    port: string;
  };
  mqtt: {
    host: string;
    port: string;
    username: string;
    password: string;
    ssl: boolean;
  };
  theme: ThemeMode;
}

interface FormErrors {
  esp32: {
    host?: string;
    port?: string;
  };
  mqtt: {
    host?: string;
    port?: string;
    username?: string;
    password?: string;
  };
  theme?: {
    theme?: string;
  };
}

type TabType = 'esp32' | 'mqtt' | 'theme';

const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose }) => {
  const { config, validateAndSave, updateReachabilityStatus, loading } = useConfig();
  const [activeTab, setActiveTab] = useState<TabType>('esp32');
  
  const [formState, setFormState] = useState<FormState>({
    esp32: {
      host: '',
      port: ''
    },
    mqtt: {
      host: '',
      port: '',
      username: '',
      password: '',
      ssl: false
    },
    theme: 'system'
  });
  
  const [formErrors, setFormErrors] = useState<FormErrors>({
    esp32: {},
    mqtt: {},
    theme: {}
  });
  
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form state when modal opens
  useEffect(() => {
    if (isOpen && !loading) {
      setFormState({
        esp32: {
          host: config.esp32.host,
          // Only show port if host exists, otherwise empty string
          port: config.esp32.host ? config.esp32.port.toString() : ''
        },
        mqtt: {
          host: config.mqtt.host,
          // Only show port if host exists, otherwise empty string
          port: config.mqtt.host ? config.mqtt.port.toString() : '',
          username: config.mqtt.username || '',
          password: config.mqtt.password || '',
          ssl: config.mqtt.ssl
        },
        theme: config.theme
      });
      setFormErrors({ esp32: {}, mqtt: {}, theme: {} });
    }
  }, [isOpen, loading]); // Only depend on modal open state and loading
  
  // Separate effect to update form state when config loads initially
  useEffect(() => {
    if (!loading && config && formState.esp32.host === '' && formState.mqtt.host === '' && formState.theme === 'system') {
      // Only update if form is in initial empty state and config has loaded
      setFormState({
        esp32: {
          host: config.esp32.host,
          port: config.esp32.host ? config.esp32.port.toString() : ''
        },
        mqtt: {
          host: config.mqtt.host,
          port: config.mqtt.host ? config.mqtt.port.toString() : '',
          username: config.mqtt.username || '',
          password: config.mqtt.password || '',
          ssl: config.mqtt.ssl
        },
        theme: config.theme
      });
    }
  }, [loading, config, formState.esp32.host, formState.mqtt.host, formState.theme]);

  // Connection test states
  const [testingConnection, setTestingConnection] = useState<{
    esp32: boolean;
    mqtt: boolean;
  }>({ esp32: false, mqtt: false });
  
  const [connectionResults, setConnectionResults] = useState<{
    esp32?: boolean;
    mqtt?: boolean;
  }>({});

  // Validate form using centralized ValidationService
  const validateForm = (): FormErrors => {
    const errors: FormErrors = { esp32: {}, mqtt: {} };

    console.log('[ConfigModal] validateForm called with state:', formState);

    // Validate ESP32 configuration ONLY if host is provided
    if (formState.esp32.host.trim()) {
      const esp32Config = {
        host: formState.esp32.host.trim(),
        port: parseInt(formState.esp32.port.trim()) || 0,
        reachabilityStatus: 'unknown' as const
      };

      const esp32ValidationResult = validationService.validateESP32Config(esp32Config);
      if (!esp32ValidationResult.isValid) {
        // Map validation errors to form errors
        esp32ValidationResult.errors.forEach((error: ValidationError) => {
          if (error.field === 'host') {
            errors.esp32.host = error.message;
          } else if (error.field === 'port') {
            errors.esp32.port = error.message;
          }
        });
      }
    } else if (formState.esp32.port.trim() && !formState.esp32.host.trim()) {
      // Special case: port provided without host
      console.log('[ConfigModal] ESP32 port without host error:', formState.esp32.port);
      errors.esp32.host = 'Host is required when port is specified';
    }

    // Validate MQTT configuration ONLY if host is provided
    if (formState.mqtt.host.trim()) {
      const mqttConfig = {
        host: formState.mqtt.host.trim(),
        port: parseInt(formState.mqtt.port.trim()) || 1883,
        username: formState.mqtt.username.trim() || undefined,
        password: formState.mqtt.password.trim() || undefined,
        ssl: formState.mqtt.ssl,
        reachabilityStatus: 'unknown' as const
      };

      const mqttValidationResult = validationService.validateMQTTConfig(mqttConfig);
      if (!mqttValidationResult.isValid) {
        // Map validation errors to form errors
        mqttValidationResult.errors.forEach((error: ValidationError) => {
          if (error.field === 'host') {
            errors.mqtt.host = error.message;
          } else if (error.field === 'port') {
            errors.mqtt.port = error.message;
          } else if (error.field === 'username') {
            errors.mqtt.username = error.message;
          } else if (error.field === 'password') {
            errors.mqtt.password = error.message;
          }
        });
      }
    } else if (formState.mqtt.port.trim() && !formState.mqtt.host.trim()) {
      // Special case: port provided without host
      console.log('[ConfigModal] MQTT port without host error:', formState.mqtt.port);
      errors.mqtt.host = 'Host is required when port is specified';
    }

    return errors;
  };

  // Handle input changes
  const handleInputChange = (section: keyof FormState, field: string, value: string | boolean | ThemeMode) => {
    if (section === 'theme') {
      // Handle theme changes directly
      setFormState(prev => ({
        ...prev,
        theme: value as ThemeMode
      }));
    } else {
      // Handle nested object changes for esp32 and mqtt
      setFormState(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value
        }
      }));
    }

    // Clear error for this field when user starts typing
    if (typeof value === 'string' && section !== 'theme') {
      setFormErrors(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          [field]: undefined
        }
      }));
    }
    
    // Clear connection test results when form changes (not for theme)
    if (section !== 'theme') {
      setConnectionResults({});
    }
  };

  // Handle connection testing
  const handleTestConnection = async (type: 'esp32' | 'mqtt') => {
    setTestingConnection(prev => ({ ...prev, [type]: true }));
    setConnectionResults(prev => ({ ...prev, [type]: undefined }));
    
    // Set reachability status to unknown while testing
    await updateReachabilityStatus(type, 'unknown');
    
    try {
      // Validate form before testing
      const errors = validateForm();
      const hasErrors = type === 'esp32' 
        ? Object.values(errors.esp32).some(error => error !== undefined)
        : Object.values(errors.mqtt).some(error => error !== undefined);
      
      if (hasErrors) {
        setFormErrors(errors);
        setConnectionResults(prev => ({ ...prev, [type]: false }));
        return;
      }

      // Create NetworkService and appropriate adapter
      const networkService = createNetworkService();
      let testResult: NetworkResult[] = [];
      
      if (type === 'esp32') {
        const esp32Config = {
          host: formState.esp32.host.trim(),
          port: parseInt(formState.esp32.port.trim(), 10),
          reachabilityStatus: 'unknown' as const
        };
        
        const httpAdapter = createHttpAdapter(esp32Config);
        await networkService.addAdapter(httpAdapter);
        
        console.log('[ConfigModal] Testing ESP32 HTTP connection...');
        testResult = await networkService.testAllConnections();
        
        await networkService.cleanup();
      } else {
        // Only test MQTT if host is provided
        if (!formState.mqtt.host.trim()) {
          setConnectionResults(prev => ({ ...prev, [type]: false }));
          return;
        }
        
        const mqttConfig = {
          host: formState.mqtt.host.trim(),
          port: parseInt(formState.mqtt.port.trim() || '1883', 10),
          username: formState.mqtt.username.trim() || undefined,
          password: formState.mqtt.password.trim() || undefined,
          ssl: formState.mqtt.ssl,
          reachabilityStatus: 'unknown' as const
        };
        
        const mqttAdapter = createMqttAdapter(mqttConfig);
        await networkService.addAdapter(mqttAdapter);
        
        console.log('[ConfigModal] Testing MQTT connection...');
        testResult = await networkService.testAllConnections();
        
        await networkService.cleanup();
      }
      
      // Process test results
      const success = testResult.length > 0 && testResult[0].success;
      setConnectionResults(prev => ({ ...prev, [type]: success }));
      
      // Update reachability status in configuration with real-time feedback
      const reachabilityStatus = success ? 'reachable' : 'unreachable';
      await updateReachabilityStatus(type, reachabilityStatus);
      
      if (success) {
        console.log(`[ConfigModal] ${type.toUpperCase()} connection test: SUCCESS`);
      } else {
        const error = testResult[0]?.error;
        console.error(`[ConfigModal] ${type.toUpperCase()} connection test: FAILED`, error?.message);
      }
      
    } catch (error) {
      console.error(`[ConfigModal] ${type.toUpperCase()} connection test failed:`, error);
      setConnectionResults(prev => ({ ...prev, [type]: false }));
      
      // Update reachability status to unreachable on error
      await updateReachabilityStatus(type, 'unreachable');
    } finally {
      setTestingConnection(prev => ({ ...prev, [type]: false }));
    }
  };

  // Handle form submission - UNIFIED CONFIG SAVE
  const handleSave = async () => {
    console.log('[ConfigModal] Save button clicked - UNIFIED SAVE APPROACH');
    console.log('[ConfigModal] Form state:', formState);

    setIsSaving(true);
    
    try {
      // Create unified config update from form state
      const configUpdate: Partial<AppConfig> = {
        theme: formState.theme,
        esp32: formState.esp32.host.trim() ? {
          host: formState.esp32.host.trim(),
          port: parseInt(formState.esp32.port.trim(), 10) || 80,
          reachabilityStatus: config.esp32.reachabilityStatus // Preserve current status
        } : config.esp32, // Keep existing ESP32 config if no host provided
        mqtt: formState.mqtt.host.trim() ? {
          host: formState.mqtt.host.trim(),
          port: parseInt(formState.mqtt.port.trim(), 10) || 1883,
          username: formState.mqtt.username.trim() || undefined,
          password: formState.mqtt.password.trim() || undefined,
          ssl: formState.mqtt.ssl,
          reachabilityStatus: config.mqtt.reachabilityStatus // Preserve current status
        } : config.mqtt // Keep existing MQTT config if no host provided
      };

      console.log('[ConfigModal] Unified config update:', configUpdate);
      
      // Save all changes atomically
      const validationResult = await validateAndSave(configUpdate);
      
      if (validationResult.isValid) {
        console.log('[ConfigModal] Configuration saved successfully');
        onClose();
      } else {
        console.warn('[ConfigModal] Configuration validation warnings:', validationResult.errors);
        // Still close modal even with warnings - validation service handles this gracefully
        onClose();
      }
    } catch (error) {
      console.error('[ConfigModal] Failed to save configuration:', error);
      // Still close modal to avoid getting stuck
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    // Reset form state to current config
    setFormState({
      esp32: {
        host: config.esp32.host,
        port: config.esp32.port.toString()
      },
      mqtt: {
        host: config.mqtt.host,
        port: config.mqtt.port.toString(),
        username: config.mqtt.username || '',
        password: config.mqtt.password || '',
        ssl: config.mqtt.ssl
      },
      theme: config.theme
    });
    setFormErrors({ esp32: {}, mqtt: {}, theme: {} });
    setConnectionResults({});
    setActiveTab('esp32');
    onClose();
  };

  // Handle backdrop click to close modal
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Configuration</h2>
          <button className="modal-close" onClick={handleCancel} aria-label="Close">
            ×
          </button>
        </div>
        
        <div className="modal-body">
          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button 
              className={`tab-button ${activeTab === 'esp32' ? 'active' : ''}`}
              onClick={() => setActiveTab('esp32')}
              disabled={isSaving}
            >
              ESP32 Settings
            </button>
            <button 
              className={`tab-button ${activeTab === 'mqtt' ? 'active' : ''}`}
              onClick={() => setActiveTab('mqtt')}
              disabled={isSaving}
            >
              MQTT Settings
            </button>
            <button 
              className={`tab-button ${activeTab === 'theme' ? 'active' : ''}`}
              onClick={() => setActiveTab('theme')}
              disabled={isSaving}
            >
              Theme
            </button>
          </div>

          {/* ESP32 Configuration Tab */}
          {activeTab === 'esp32' && (
            <div className="config-section">
              <div className="section-header">
                <h3>ESP32 HTTP Settings</h3>
                <div className={`reachability-status ${testingConnection.esp32 ? 'testing' : config.esp32.reachabilityStatus}`}>
                  <span className="status-dot"></span>
                  <span className="status-text">
                    {testingConnection.esp32 && 'Testing Connection...'}
                    {!testingConnection.esp32 && config.esp32.reachabilityStatus === 'reachable' && 'Connected'}
                    {!testingConnection.esp32 && config.esp32.reachabilityStatus === 'unreachable' && 'Disconnected'}
                    {!testingConnection.esp32 && config.esp32.reachabilityStatus === 'unknown' && 'Status Unknown'}
                  </span>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="esp32-host">Host</label>
                <input
                  id="esp32-host"
                  type="text"
                  value={formState.esp32.host}
                  onChange={(e) => handleInputChange('esp32', 'host', e.target.value)}
                  placeholder="192.168.1.100 or esp32.local"
                  disabled={isSaving || loading}
                  className={formErrors.esp32.host ? 'error' : ''}
                />
                {formErrors.esp32.host && <span className="error-message">{formErrors.esp32.host}</span>}
              </div>
              
              <div className="form-group">
                <label htmlFor="esp32-port">Port</label>
                <input
                  id="esp32-port"
                  type="text"
                  value={formState.esp32.port}
                  onChange={(e) => handleInputChange('esp32', 'port', e.target.value)}
                  placeholder="80"
                  disabled={isSaving || loading}
                  className={formErrors.esp32.port ? 'error' : ''}
                />
                {formErrors.esp32.port && <span className="error-message">{formErrors.esp32.port}</span>}
              </div>

              {/* ESP32 Connection Test */}
              <div className="connection-test">
                <button
                  className={`btn-test ${testingConnection.esp32 ? 'testing' : ''}`}
                  onClick={() => handleTestConnection('esp32')}
                  disabled={testingConnection.esp32 || isSaving || loading}
                >
                  {testingConnection.esp32 ? (
                    <>
                      <span className="test-spinner"></span>
                      Testing Connection...
                    </>
                  ) : (
                    'Test HTTP Connection'
                  )}
                </button>
                {connectionResults.esp32 !== undefined && (
                  <span className={`connection-result ${connectionResults.esp32 ? 'success' : 'error'}`}>
                    <span className="result-icon">
                      {connectionResults.esp32 ? '✓' : '✗'}
                    </span>
                    {connectionResults.esp32 ? 'Connection successful' : 'Connection failed'}
                  </span>
                )}
                {testingConnection.esp32 && (
                  <span className="connection-testing">
                    <span className="test-spinner"></span>
                    Testing ESP32 HTTP connection...
                  </span>
                )}
              </div>
            </div>
          )}

          {/* MQTT Configuration Tab */}
          {activeTab === 'mqtt' && (
            <div className="config-section">
              <div className="section-header">
                <h3>MQTT over WebSocket Settings</h3>
                <div className={`reachability-status ${testingConnection.mqtt ? 'testing' : config.mqtt.reachabilityStatus}`}>
                  <span className="status-dot"></span>
                  <span className="status-text">
                    {testingConnection.mqtt && 'Testing Connection...'}
                    {!testingConnection.mqtt && config.mqtt.reachabilityStatus === 'reachable' && 'Connected'}
                    {!testingConnection.mqtt && config.mqtt.reachabilityStatus === 'unreachable' && 'Disconnected'}
                    {!testingConnection.mqtt && config.mqtt.reachabilityStatus === 'unknown' && 'Status Unknown'}
                  </span>
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="mqtt-host">Host</label>
                <input
                  id="mqtt-host"
                  type="text"
                  value={formState.mqtt.host}
                  onChange={(e) => handleInputChange('mqtt', 'host', e.target.value)}
                  placeholder="broker.example.com or 192.168.1.50"
                  disabled={isSaving || loading}
                  className={formErrors.mqtt.host ? 'error' : ''}
                />
                {formErrors.mqtt.host && <span className="error-message">{formErrors.mqtt.host}</span>}
              </div>
              
              <div className="form-group">
                <label htmlFor="mqtt-port">Port</label>
                <input
                  id="mqtt-port"
                  type="text"
                  value={formState.mqtt.port}
                  onChange={(e) => handleInputChange('mqtt', 'port', e.target.value)}
                  placeholder="1883 (default) or 8883 (SSL)"
                  disabled={isSaving || loading}
                  className={formErrors.mqtt.port ? 'error' : ''}
                />
                {formErrors.mqtt.port && <span className="error-message">{formErrors.mqtt.port}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="mqtt-username">Username</label>
                <input
                  id="mqtt-username"
                  type="text"
                  value={formState.mqtt.username}
                  onChange={(e) => handleInputChange('mqtt', 'username', e.target.value)}
                  placeholder="Optional - leave empty for anonymous"
                  disabled={isSaving || loading}
                  className={formErrors.mqtt.username ? 'error' : ''}
                />
                {formErrors.mqtt.username && <span className="error-message">{formErrors.mqtt.username}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="mqtt-password">Password</label>
                <input
                  id="mqtt-password"
                  type="password"
                  value={formState.mqtt.password}
                  onChange={(e) => handleInputChange('mqtt', 'password', e.target.value)}
                  placeholder="Optional - leave empty for anonymous"
                  disabled={isSaving || loading}
                  className={formErrors.mqtt.password ? 'error' : ''}
                />
                {formErrors.mqtt.password && <span className="error-message">{formErrors.mqtt.password}</span>}
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formState.mqtt.ssl}
                    onChange={(e) => handleInputChange('mqtt', 'ssl', e.target.checked)}
                    disabled={isSaving || loading}
                  />
                  <span className="checkbox-text">Use SSL/TLS (Secure Connection)</span>
                </label>
              </div>

              {/* MQTT Connection Test */}
              <div className="connection-test">
                <button
                  className={`btn-test ${testingConnection.mqtt ? 'testing' : ''}`}
                  onClick={() => handleTestConnection('mqtt')}
                  disabled={testingConnection.mqtt || isSaving || loading || !formState.mqtt.host.trim()}
                >
                  {testingConnection.mqtt ? (
                    <>
                      <span className="test-spinner"></span>
                      Testing Connection...
                    </>
                  ) : (
                    'Test MQTT Connection'
                  )}
                </button>
                {connectionResults.mqtt !== undefined && (
                  <span className={`connection-result ${connectionResults.mqtt ? 'success' : 'error'}`}>
                    <span className="result-icon">
                      {connectionResults.mqtt ? '✓' : '✗'}
                    </span>
                    {connectionResults.mqtt ? 'Connection successful' : 'Connection failed'}
                  </span>
                )}
                {testingConnection.mqtt && (
                  <span className="connection-testing">
                    <span className="test-spinner"></span>
                    Testing MQTT over WSS connection...
                  </span>
                )}
                {!formState.mqtt.host.trim() && (
                  <span className="connection-hint">Enter host to test connection</span>
                )}
              </div>
            </div>
          )}

          {/* Theme Configuration Tab */}
          {activeTab === 'theme' && (
            <div className="config-section">
              <div className="section-header">
                <h3>Theme Settings</h3>
                <div className="theme-description">
                  <span className="theme-help-text">
                    Choose your preferred appearance theme
                  </span>
                </div>
              </div>
              
              <div className="form-group radio-group">
                <fieldset>
                  <legend>Theme Mode</legend>
                  
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="theme"
                      value="bright"
                      checked={formState.theme === 'bright'}
                      onChange={(e) => handleInputChange('theme', 'theme', e.target.value as ThemeMode)}
                      disabled={isSaving || loading}
                    />
                    <span className="radio-text">
                      <strong>Bright</strong>
                      <span className="radio-description">Light theme with bright colors</span>
                    </span>
                  </label>
                  
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="theme"
                      value="dark"
                      checked={formState.theme === 'dark'}
                      onChange={(e) => handleInputChange('theme', 'theme', e.target.value as ThemeMode)}
                      disabled={isSaving || loading}
                    />
                    <span className="radio-text">
                      <strong>Dark</strong>
                      <span className="radio-description">Dark theme with muted colors</span>
                    </span>
                  </label>
                  
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="theme"
                      value="system"
                      checked={formState.theme === 'system'}
                      onChange={(e) => handleInputChange('theme', 'theme', e.target.value as ThemeMode)}
                      disabled={isSaving || loading}
                    />
                    <span className="radio-text">
                      <strong>System</strong>
                      <span className="radio-description">Follow your device's theme setting</span>
                    </span>
                  </label>
                </fieldset>
              </div>
              
              <div className="theme-preview">
                <span className="preview-label">Current theme: </span>
                <span className="preview-value">
                  {formState.theme === 'bright' && 'Bright Mode'}
                  {formState.theme === 'dark' && 'Dark Mode'}
                  {formState.theme === 'system' && 'System Setting'}
                </span>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button 
            className="btn-secondary" 
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button 
            className="btn-primary" 
            onClick={(e) => {
              console.log('[ConfigModal] Save button clicked - event triggered');
              console.log('[ConfigModal] Button state - isSaving:', isSaving, 'loading:', loading);
              e.preventDefault();
              handleSave();
            }}
            disabled={isSaving || loading}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigModal;