// Camera compatibility test utility
export interface CameraTestResult {
  supported: boolean;
  httpsRequired: boolean;
  mediaDevicesAvailable: boolean;
  getUserMediaAvailable: boolean;
  error?: string;
  userAgent: string;
  protocol: string;
  hostname: string;
}

export function testCameraSupport(): CameraTestResult {
  const result: CameraTestResult = {
    supported: false,
    httpsRequired: false,
    mediaDevicesAvailable: false,
    getUserMediaAvailable: false,
    userAgent: navigator.userAgent,
    protocol: location.protocol,
    hostname: location.hostname,
  };

  try {
    // Check basic mediaDevices support
    result.mediaDevicesAvailable = !!navigator.mediaDevices;
    
    // Check getUserMedia support
    result.getUserMediaAvailable = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    
    // Check HTTPS requirement - be more lenient for localhost
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '0.0.0.0';
    const isHttps = location.protocol === 'https:';
    
    // For localhost, we'll allow HTTP but warn about potential issues
    if (!isHttps && !isLocalhost) {
      result.httpsRequired = true;
    } else if (!isHttps && isLocalhost) {
      // Allow HTTP on localhost but mark as potentially problematic
      result.httpsRequired = false;
    }
    
    // Overall support - be more lenient for localhost
    const basicSupport = result.mediaDevicesAvailable && result.getUserMediaAvailable;
    const securityOk = isHttps || isLocalhost;
    
    result.supported = basicSupport && securityOk;
    
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

export function getCameraCompatibilityInfo(): string {
  const test = testCameraSupport();
  
  if (test.supported) {
    return "✅ Camera fully supported";
  }
  
  const issues = [];
  
  if (!test.mediaDevicesAvailable) {
    issues.push("MediaDevices API not available");
  }
  
  if (!test.getUserMediaAvailable) {
    issues.push("getUserMedia not available");
  }
  
  if (test.httpsRequired) {
    issues.push("HTTPS required (not on localhost)");
  }
  
  if (test.error) {
    issues.push(`Error: ${test.error}`);
  }
  
  return `❌ Camera issues: ${issues.join(', ')}`;
}
