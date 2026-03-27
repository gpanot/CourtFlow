import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { mockFaceRecognitionService } from "@/lib/face-recognition-mock";

// Face quality analysis function (extracted from staff-add-walk-in-with-face)
async function analyzeFaceQuality(imageBase64: string): Promise<{
  overall: 'good' | 'fair' | 'poor';
  checks: {
    faceDetected: boolean;
    lighting: 'good' | 'fair' | 'poor';
    focus: 'good' | 'fair' | 'poor';
    size: 'good' | 'fair' | 'poor';
  };
  message: string;
  canForce: boolean;
}> {
  try {
    // Convert base64 to buffer for analysis
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    
    // Basic image validation
    if (imageBuffer.length < 1000) {
      return {
        overall: 'poor',
        checks: {
          faceDetected: false,
          lighting: 'poor',
          focus: 'poor',
          size: 'poor',
        },
        message: 'Image too small or corrupted. Please retake photo.',
        canForce: false,
      };
    }

    // Use mock face recognition service for detection
    const faceDetectionResult = await mockFaceRecognitionService.detectFace(imageBase64);
    
    let checks = {
      faceDetected: faceDetectionResult.faceDetected,
      lighting: 'good' as 'good' | 'fair' | 'poor',
      focus: 'good' as 'good' | 'fair' | 'poor',
      size: 'good' as 'good' | 'fair' | 'poor',
    };

    let overall: 'good' | 'fair' | 'poor' = 'good';
    let message = 'Photo quality looks good!';
    let canForce = false;

    if (!checks.faceDetected) {
      overall = 'poor';
      message = 'No face detected. Please ensure your face is clearly visible in the photo.';
      canForce = false;
    } else {
      // Analyze face size and position if face is detected
      const faceInfo = faceDetectionResult.faceInfo;
      
      if (faceInfo) {
        // Check face size (should be at least 20% of image dimensions)
        const faceSizeRatio = (faceInfo.width * faceInfo.height) / (faceInfo.imageWidth * faceInfo.imageHeight);
        if (faceSizeRatio < 0.05) {
          checks.size = 'poor';
          overall = 'poor';
          message = 'Face too small. Please move closer to the camera.';
          canForce = true;
        } else if (faceSizeRatio < 0.1) {
          checks.size = 'fair';
          if (overall === 'good') overall = 'fair';
          message = 'Face could be larger for better recognition.';
          canForce = true;
        }

        // Check face position (should be reasonably centered)
        const faceCenterX = faceInfo.x + faceInfo.width / 2;
        const faceCenterY = faceInfo.y + faceInfo.height / 2;
        const imageCenterX = faceInfo.imageWidth / 2;
        const imageCenterY = faceInfo.imageHeight / 2;
        
        const maxOffset = Math.min(faceInfo.imageWidth, faceInfo.imageHeight) * 0.3;
        const offsetX = Math.abs(faceCenterX - imageCenterX);
        const offsetY = Math.abs(faceCenterY - imageCenterY);
        
        if (offsetX > maxOffset || offsetY > maxOffset) {
          if (overall === 'good') overall = 'fair';
          message = 'Please center your face in the photo for better results.';
          canForce = true;
        }
      }

      // Simulate lighting analysis based on image brightness
      const brightness = faceDetectionResult.brightness || 0.5;
      if (brightness < 0.3) {
        checks.lighting = 'poor';
        overall = 'poor';
        message = 'Poor lighting. Please take photo in better lighting conditions.';
        canForce = true;
      } else if (brightness < 0.6) {
        checks.lighting = 'fair';
        if (overall === 'good') overall = 'fair';
        message = 'Lighting could be better. Consider using more light.';
        canForce = true;
      }

      // Simulate focus analysis
      const sharpness = faceDetectionResult.sharpness || 0.7;
      if (sharpness < 0.4) {
        checks.focus = 'poor';
        overall = 'poor';
        message = 'Image appears blurry. Please keep camera steady and retake photo.';
        canForce = true;
      } else if (sharpness < 0.6) {
        checks.focus = 'fair';
        if (overall === 'good') overall = 'fair';
        message = 'Image could be sharper. Please keep camera steady.';
        canForce = true;
      }

      // Update message for good quality
      if (overall === 'good') {
        message = 'Perfect! Face detected with good quality.';
      }
    }

    return {
      overall,
      checks,
      message,
      canForce,
    };
  } catch (e) {
    console.error('Face quality analysis error:', e);
    return {
      overall: 'poor',
      checks: {
        faceDetected: false,
        lighting: 'poor',
        focus: 'poor',
        size: 'poor',
      },
      message: 'Unable to analyze photo quality. Please retake.',
      canForce: false,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<{
      imageBase64: string;
    }>(request);

    const { imageBase64 } = body;
    
    if (!imageBase64?.trim()) return error("Image is required", 400);

    // Analyze face quality
    const qualityAnalysis = await analyzeFaceQuality(imageBase64);

    return json({
      success: true,
      qualityCheck: qualityAnalysis,
    }, 200);
  } catch (e) {
    console.error("[Face Quality Analysis] Error:", e);
    return error((e as Error).message, 500);
  }
}
