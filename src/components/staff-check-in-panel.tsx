"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { SKILL_LEVELS, SKILL_DESCRIPTIONS, type SkillLevelType } from "@/lib/constants";
import { AlertTriangle, Loader2, UserPlus, Camera, Play, Bug } from "lucide-react";
import { testCameraSupport } from "@/lib/camera-test";

const GENDERS = ["male", "female"] as const;

export interface StaffCheckInRecent {
  id: string;
  name: string;
  gender: string;
  skillLevel: string;
  queueNumber?: number;
}

interface StaffCheckInPanelProps {
  venueId: string;
  /** Lowercased display names already in this session queue (waiting / on court / break). */
  queueNamesLower: string[];
  onAdded: () => void;
}

const FLASH_MS = 3200;

export function StaffCheckInPanel({ venueId, queueNamesLower, onAdded }: StaffCheckInPanelProps) {
  const { t } = useTranslation();

  const skillLabel = (level: SkillLevelType) => {
    const keys = {
      beginner: "staff.checkIn.skillBeginner",
      intermediate: "staff.checkIn.skillIntermediate",
      advanced: "staff.checkIn.skillAdvanced",
      pro: "staff.checkIn.skillPro",
    } as const;
    return t(keys[level]);
  };

  const genderLabel = (g: (typeof GENDERS)[number]) =>
    g === "male" ? t("staff.checkIn.genderMale") : t("staff.checkIn.genderFemale");

  const duplicateNameMsg = t("staff.checkIn.duplicateName");
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<(typeof GENDERS)[number] | "">("");
  const [skill, setSkill] = useState<SkillLevelType | "">("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [testSeedLoading, setTestSeedLoading] = useState(false);
  const [faceCaptureLoading, setFaceCaptureLoading] = useState(false);
  const [capturedFace, setCapturedFace] = useState<string | null>(null);
  const [showFacePreview, setShowFacePreview] = useState(false);
  const [faceQuality, setFaceQuality] = useState<{
    overall: 'good' | 'fair' | 'poor' | null;
    checks: {
      faceDetected: boolean;
      lighting: 'good' | 'fair' | 'poor';
      focus: 'good' | 'fair' | 'poor';
      size: 'good' | 'fair' | 'poor';
    } | null;
    message: string;
    canForce: boolean;
  } | null>(null);
  const [confirmTestCreate5, setConfirmTestCreate5] = useState<{ step: 1 | 2 } | null>(null);
  const [err, setErr] = useState("");
  const [recent, setRecent] = useState<StaffCheckInRecent[]>([]);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const showFlash = (message: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMessage(message);
    flashTimerRef.current = setTimeout(() => {
      setFlashMessage(null);
      flashTimerRef.current = null;
    }, FLASH_MS);
  };

  const trimmedName = name.trim();
  const nameIsDuplicate =
    trimmedName.length > 0 && queueNamesLower.includes(trimmedName.toLowerCase());
  /** After name + gender, surface duplicate immediately (no need to tap Add). */
  const showDuplicateWarning = nameIsDuplicate && gender !== "";

  const submitWithFace = async () => {
    setErr("");
    const trimmed = name.trim();
    if (!trimmed || !gender || !skill) {
      setErr(t("staff.checkIn.requiredFields"));
      return;
    }
    if (queueNamesLower.includes(trimmed.toLowerCase())) {
      setErr(duplicateNameMsg);
      return;
    }
    if (!capturedFace) {
      setErr("Please capture a face photo first");
      return;
    }
    
    setLoading(true);
    try {
      const phoneTrimmed = phone.trim();
      const imageBase64 = capturedFace.split(',')[1]; // Remove data URL prefix
      
      const res = await api.post<{
        success: boolean;
        player: { id: string; name: string; gender: string; skillLevel: string };
        queueNumber?: number;
        qualityCheck?: {
          overall: 'good' | 'fair' | 'poor';
          checks: {
            faceDetected: boolean;
            lighting: 'good' | 'fair' | 'poor';
            focus: 'good' | 'fair' | 'poor';
            size: 'good' | 'fair' | 'poor';
          };
          message: string;
          canForce: boolean;
        };
        requiresRetake?: boolean;
      }>("/api/queue/staff-add-walk-in-with-face", {
        venueId,
        name: trimmed,
        gender,
        skillLevel: skill,
        ...(phoneTrimmed ? { phone: phoneTrimmed } : {}),
        imageBase64,
      });
      
      if (res.requiresRetake && res.qualityCheck) {
        // Photo quality check failed
        setFaceQuality(res.qualityCheck);
        setErr(res.qualityCheck.message);
        return;
      }
      
      if (res.player) {
        showFlash(t("staff.checkIn.addedFlash", { name: res.player.name }));
        setRecent((prev) => {
          const next = [
            {
              id: res.player.id,
              name: res.player.name,
              gender: res.player.gender,
              skillLevel: res.player.skillLevel,
              queueNumber: res.queueNumber,
            },
            ...prev.filter((p) => p.id !== res.player.id),
          ];
          return next.slice(0, 5);
        });
      }
      
      // Reset form
      setName("");
      setGender("");
      setSkill("");
      setPhone("");
      setCapturedFace(null);
      setShowFacePreview(false);
      setFaceQuality(null);
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const forceAddWithFace = async () => {
    setErr("");
    const trimmed = name.trim();
    if (!trimmed || !gender || !skill) {
      setErr(t("staff.checkIn.requiredFields"));
      return;
    }
    if (queueNamesLower.includes(trimmed.toLowerCase())) {
      setErr(duplicateNameMsg);
      return;
    }
    if (!capturedFace) {
      setErr("Please capture a face photo first");
      return;
    }
    
    setLoading(true);
    try {
      const phoneTrimmed = phone.trim();
      const imageBase64 = capturedFace.split(',')[1]; // Remove data URL prefix
      
      const res = await api.post<{
        success: boolean;
        player: { id: string; name: string; gender: string; skillLevel: string };
        queueNumber?: number;
      }>("/api/queue/staff-add-walk-in-with-face", {
        venueId,
        name: trimmed,
        gender,
        skillLevel: skill,
        ...(phoneTrimmed ? { phone: phoneTrimmed } : {}),
        imageBase64,
        forceAdd: true,
      });
      
      if (res.player) {
        showFlash(t("staff.checkIn.addedFlash", { name: res.player.name }));
        setRecent((prev) => {
          const next = [
            {
              id: res.player.id,
              name: res.player.name,
              gender: res.player.gender,
              skillLevel: res.player.skillLevel,
              queueNumber: res.queueNumber,
            },
            ...prev.filter((p) => p.id !== res.player.id),
          ];
          return next.slice(0, 5);
        });
      }
      
      // Reset form
      setName("");
      setGender("");
      setSkill("");
      setPhone("");
      setCapturedFace(null);
      setShowFacePreview(false);
      setFaceQuality(null);
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setErr("");
    const trimmed = name.trim();
    if (!trimmed || !gender || !skill) {
      setErr(t("staff.checkIn.requiredFields"));
      return;
    }
    if (queueNamesLower.includes(trimmed.toLowerCase())) {
      setErr(duplicateNameMsg);
      return;
    }
    setLoading(true);
    try {
      const phoneTrimmed = phone.trim();
      const res = await api.post<{
        success: boolean;
        player: { id: string; name: string; gender: string; skillLevel: string };
      }>("/api/queue/staff-add-walk-in", {
        venueId,
        name: trimmed,
        gender,
        skillLevel: skill,
        ...(phoneTrimmed ? { phone: phoneTrimmed } : {}),
      });
      if (res.player) {
        showFlash(t("staff.checkIn.addedFlash", { name: res.player.name }));
        setRecent((prev) => {
          const next = [
            {
              id: res.player.id,
              name: res.player.name,
              gender: res.player.gender,
              skillLevel: res.player.skillLevel,
            },
            ...prev.filter((p) => p.id !== res.player.id),
          ];
          return next.slice(0, 5);
        });
      }
      setName("");
      setGender("");
      setSkill("");
      setPhone("");
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const captureFace = async () => {
    setErr("");
    setFaceCaptureLoading(true);
    
    try {
      // Run camera compatibility test
      const cameraTest = testCameraSupport();
      console.log('Camera compatibility test:', cameraTest);
      
      if (!cameraTest.supported) {
        let errorMessage = "Camera not available. ";
        
        if (!cameraTest.mediaDevicesAvailable) {
          errorMessage += "MediaDevices API not supported. ";
        }
        
        if (!cameraTest.getUserMediaAvailable) {
          errorMessage += "getUserMedia not supported. ";
        }
        
        if (cameraTest.httpsRequired) {
          errorMessage += "HTTPS required. ";
        }
        
        errorMessage += "Please try Chrome, Safari, or Firefox on a secure connection.";
        
        throw new Error(errorMessage);
      }

      // Request camera access with better constraints for desktop
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
            // Add fallback constraints for desktop
            aspectRatio: { ideal: 16/9 },
            frameRate: { ideal: 30 }
          } 
        });
      } catch (mediaError) {
        console.log('Primary camera request failed, trying fallback:', mediaError);
        // Try with minimal constraints
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: true 
        });
      }
      
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true'); // Important for iOS
      video.setAttribute('autoplay', 'true');
      video.setAttribute('muted', 'true');
      
      // Wait for video to be ready with timeout
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => {
            video.play().then(resolve).catch(reject);
          };
          video.onerror = reject;
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Camera timeout")), 5000)
        )
      ]);
      
      // Wait a bit for the video to actually start playing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Create canvas to capture image
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error("Could not get canvas context");
      }
      
      // Draw the video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);
      
      if (!imageBase64) {
        throw new Error("Failed to capture image from camera");
      }
      
      // Stop camera
      stream.getTracks().forEach(track => {
        track.stop();
      });
      
      // Store captured face and show preview
      setCapturedFace(imageBase64);
      setShowFacePreview(true);
      
      // Perform immediate quality analysis for instant feedback
      try {
        const response = await api.post<{
          qualityCheck: {
            overall: 'good' | 'fair' | 'poor';
            checks: {
              faceDetected: boolean;
              lighting: 'good' | 'fair' | 'poor';
              focus: 'good' | 'fair' | 'poor';
              size: 'good' | 'fair' | 'poor';
            };
            message: string;
            canForce: boolean;
          };
        }>("/api/queue/analyze-face-quality", {
          imageBase64,
        });
        
        if (response.qualityCheck) {
          setFaceQuality(response.qualityCheck);
        }
      } catch (qualityError) {
        console.error("Quality analysis failed:", qualityError);
        // Set a default quality state if analysis fails
        setFaceQuality({
          overall: 'fair',
          checks: {
            faceDetected: true,
            lighting: 'fair',
            focus: 'fair',
            size: 'fair',
          },
          message: 'Photo captured. Quality assessment pending.',
          canForce: true,
        });
      }
      
    } catch (e) {
      console.error("Camera capture error:", e);
      const errorMessage = e instanceof Error ? e.message : "Unknown camera error";
      
      // Provide more helpful error messages
      if (errorMessage.includes("Permission denied") || errorMessage.includes("NotAllowed")) {
        setErr("Camera access denied. Please allow camera access in your browser settings and try again.");
      } else if (errorMessage.includes("NotFound")) {
        setErr("No camera found. Please connect a camera and try again.");
      } else if (errorMessage.includes("Camera not supported")) {
        setErr("Camera not supported in this browser. Please use Chrome, Safari, or Firefox.");
      } else if (errorMessage.includes("HTTPS")) {
        setErr("Camera access requires HTTPS. Please use a secure connection or localhost.");
      } else {
        setErr(`Camera error: ${errorMessage}`);
      }
    } finally {
      setFaceCaptureLoading(false);
    }
  };

  // Test face recognition without camera
  const testFaceWithoutCamera = async () => {
    setErr("");
    setFaceCaptureLoading(true);
    
    try {
      // Use mock face recognition with test image
      const response = await api.post<{
        success: boolean;
        resultType: string;
        playerId?: string;
        displayName?: string;
        queueNumber?: number;
        alreadyCheckedIn?: boolean;
        error?: string;
      }>("/api/kiosk/process-face", {
        venueId,
        imageBase64: "test_image_no_camera", // Special signal to use test image
      });
      
      if (response.success) {
        if (response.resultType === "matched") {
          showFlash(t("staff.checkIn.faceCheckInSuccess", { 
            name: response.displayName, 
            number: response.queueNumber 
          }));
        } else if (response.resultType === "new_player") {
          showFlash(t("staff.checkIn.faceNewPlayerSuccess", { 
            number: response.queueNumber 
          }));
        } else if (response.resultType === "already_checked_in") {
          showFlash(t("staff.checkIn.faceAlreadyCheckedIn", { 
            name: response.displayName 
          }));
        } else if (response.resultType === "needs_review") {
          showFlash(t("staff.checkIn.faceNeedsReview"));
        }
        
        // Add to recent list if we have player info
        if (response.playerId && response.queueNumber) {
          setRecent((prev) => {
            const next = [
              {
                id: response.playerId!,
                name: response.displayName || "Unknown Player",
                gender: "",
                skillLevel: "",
                queueNumber: response.queueNumber,
              },
              ...prev.filter((p) => p.id !== response.playerId),
            ];
            return next.slice(0, 5);
          });
        }
        
        onAdded();
      } else {
        setErr(response.error || "Face recognition test failed");
      }
    } catch (e) {
      console.error("Face recognition test error:", e);
      setErr(e instanceof Error ? e.message : "Face recognition test failed");
    } finally {
      setFaceCaptureLoading(false);
    }
  };

  // Debug camera support
  const debugCamera = () => {
    const test = testCameraSupport();
    console.log('Camera Debug Info:', test);
    
    const debugMessage = `
Camera Debug Info:
- Supported: ${test.supported ? '✅' : '❌'}
- MediaDevices: ${test.mediaDevicesAvailable ? '✅' : '❌'}
- getUserMedia: ${test.getUserMediaAvailable ? '✅' : '❌'}
- HTTPS Required: ${test.httpsRequired ? '❌' : '✅'}
- Protocol: ${test.protocol}
- Hostname: ${test.hostname}
- User Agent: ${test.userAgent}
${test.error ? `Error: ${test.error}` : ''}
    `.trim();
    
    alert(debugMessage);
  };
  const getBrowserInfo = () => {
    const userAgent = navigator.userAgent;
    console.log('User Agent:', userAgent);
    console.log('navigator.mediaDevices:', navigator.mediaDevices);
    console.log('navigator.mediaDevices.getUserMedia:', navigator.mediaDevices?.getUserMedia);
    
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Edg')) return 'Edge';
    return 'Unknown';
  };

  const addFiveTestPlayers = async () => {
    setErr("");
    setTestSeedLoading(true);
    const added: StaffCheckInRecent[] = [];
    try {
      const base = Date.now();
      for (let i = 0; i < 5; i++) {
        const suffix = `${base}-${i}-${Math.random().toString(36).slice(2, 8)}`;
        const testName = `Test ${suffix}`;
        const g: (typeof GENDERS)[number] = Math.random() < 0.5 ? "male" : "female";
        const s = SKILL_LEVELS[Math.floor(Math.random() * SKILL_LEVELS.length)];
        const res = await api.post<{
          success: boolean;
          player: { id: string; name: string; gender: string; skillLevel: string };
        }>("/api/queue/staff-add-walk-in", {
          venueId,
          name: testName,
          gender: g,
          skillLevel: s,
        });
        if (res.player) {
          added.push({
            id: res.player.id,
            name: res.player.name,
            gender: res.player.gender,
            skillLevel: res.player.skillLevel,
          });
        }
      }
      if (added.length > 0) {
        showFlash(t("staff.checkIn.testCreate5Flash"));
        setRecent((prev) => {
          const next = [...added, ...prev.filter((p) => !added.some((a) => a.id === p.id))];
          return next.slice(0, 5);
        });
      }
      onAdded();
    } catch (e) {
      if (added.length > 0) onAdded();
      setErr((e as Error).message);
    } finally {
      setTestSeedLoading(false);
      setConfirmTestCreate5(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6 max-sm:space-y-2">
      <div
        className={cn(
          "flex h-[5.25rem] items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 max-sm:h-[4.5rem] max-sm:gap-2 max-sm:rounded-lg max-sm:px-3 max-sm:py-2",
          flashMessage ? "border-green-500/50 bg-green-600/15" : "border-green-500/25 bg-green-600/10"
        )}
      >
        <UserPlus className="h-6 w-6 shrink-0 text-green-400 max-sm:h-5 max-sm:w-5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-green-300 max-sm:text-sm">{t("staff.checkIn.title")}</p>
          {flashMessage ? (
            <p
              className="line-clamp-2 text-sm font-medium leading-snug text-green-200 max-sm:text-xs"
              role="status"
              aria-live="polite"
              title={flashMessage}
            >
              {flashMessage}
            </p>
          ) : (
            <p className="line-clamp-2 text-xs leading-snug text-neutral-400 max-sm:text-[11px]">
              {t("staff.checkIn.subtitle")}
            </p>
          )}
        </div>
      </div>

      {showDuplicateWarning && (
        <div
          id="checkin-duplicate-name"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 max-sm:px-2.5 max-sm:py-1.5 max-sm:text-xs"
          role="alert"
          aria-live="polite"
        >
          {duplicateNameMsg}
        </div>
      )}
      {err && !showDuplicateWarning && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 max-sm:px-2.5 max-sm:py-1.5 max-sm:text-xs">
          {err}
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 max-sm:space-y-2.5 max-sm:rounded-lg max-sm:p-3">
        {/* Name + Gender Row */}
        <div className="flex gap-2 max-sm:gap-1.5">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-neutral-400 max-sm:mb-1">
              {t("staff.checkIn.name")}
            </label>
            <input
              type="text"
              placeholder={t("staff.checkIn.playerNamePlaceholder")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErr("");
              }}
              className={cn(
                "w-full rounded-xl border bg-neutral-950 px-4 py-3 text-base text-white placeholder:text-neutral-500 focus:outline-none max-sm:rounded-lg max-sm:px-3 max-sm:py-2",
                showDuplicateWarning ? "border-red-500/50 focus:border-red-500" : "border-neutral-700 focus:border-green-500"
              )}
              aria-invalid={showDuplicateWarning}
              aria-describedby={showDuplicateWarning ? "checkin-duplicate-name" : undefined}
              autoComplete="off"
              autoCapitalize="words"
            />
          </div>
          
          {/* Gender Icons */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-400 max-sm:mb-1">{t("staff.checkIn.gender")}</p>
            <div className="flex gap-1.5 max-sm:gap-1">
              {GENDERS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  className={cn(
                    "flex h-11 w-[58px] items-center justify-center rounded-xl border-2 transition-colors max-sm:h-10 max-sm:w-[52px] max-sm:rounded-lg",
                    gender === g
                      ? g === 'male'
                        ? "border-blue-500 bg-blue-600/20 text-blue-400"
                        : "border-pink-500 bg-pink-600/20 text-pink-400"
                      : g === 'male'
                        ? "border-blue-500/50 bg-blue-600/10 text-blue-300"
                        : "border-pink-500/50 bg-pink-600/10 text-pink-300"
                  )}
                  title={genderLabel(g)}
                >
                  {g === 'male' ? (
                    <svg className="h-5 w-5 max-sm:h-4 max-sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="5"/>
                      <path d="M12 13v8"/>
                      <path d="M9 18h6"/>
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 max-sm:h-4 max-sm:w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="9" r="5"/>
                      <path d="M12 14v7"/>
                      <path d="M9 18h6"/>
                      <path d="M12 14l-3 3"/>
                      <path d="M12 14l3 3"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Skill Levels - Single row on all devices */}
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-400 max-sm:mb-1">{t("staff.checkIn.skillLevel")}</p>
          <div className="grid grid-cols-3 gap-2 max-sm:gap-1.5">
            {SKILL_LEVELS.filter(level => level !== "pro").map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setSkill(level)}
                className={cn(
                  "w-full rounded-xl border-2 p-3 text-center transition-colors max-sm:rounded-lg max-sm:p-2 max-sm:text-sm",
                  skill === level ? "border-green-500 bg-green-600/20" : "border-neutral-700 hover:border-neutral-500"
                )}
              >
                <span className="font-medium capitalize text-white">{skillLabel(level)}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-400 max-sm:mb-1">
            {t("staff.checkIn.phoneOptional")}
          </label>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("staff.checkIn.phonePlaceholder")}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setErr("");
            }}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-base text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none max-sm:rounded-lg max-sm:px-3 max-sm:py-2"
          />
        </div>

        <button
          type="button"
          onClick={captureFace}
          disabled={faceCaptureLoading || testSeedLoading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-500/50 bg-blue-600/10 py-4 text-lg font-semibold text-blue-400 transition-colors hover:border-blue-500 hover:bg-blue-600/20 disabled:opacity-50 max-sm:rounded-lg max-sm:py-2.5 max-sm:text-base"
        >
          {faceCaptureLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin max-sm:h-4 max-sm:w-4" />
              {t("staff.checkIn.faceCapturing")}
            </>
          ) : (
            <>
              <Camera className="h-5 w-5 max-sm:h-4 max-sm:w-4" />
              {capturedFace ? "Retake Photo" : t("staff.checkIn.captureFace")}
            </>
          )}
        </button>

        {capturedFace && (
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-xs font-medium text-neutral-400 mb-2">Face Preview</p>
              <div className="relative inline-block">
                <img 
                  src={capturedFace} 
                  alt="Captured face" 
                  className={cn(
                    "w-32 h-32 rounded-lg object-cover border-2",
                    faceQuality?.overall === 'good' ? 'border-green-500' :
                    faceQuality?.overall === 'fair' ? 'border-yellow-500' :
                    faceQuality?.overall === 'poor' ? 'border-red-500' :
                    'border-neutral-700'
                  )}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCapturedFace(null);
                    setFaceQuality(null);
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Quality Feedback */}
            {faceQuality && (
              <div className={cn(
                "rounded-lg p-3 border",
                faceQuality.overall === 'good' ? 'bg-green-600/10 border-green-500/50' :
                faceQuality.overall === 'fair' ? 'bg-yellow-600/10 border-yellow-500/50' :
                'bg-red-600/10 border-red-500/50'
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {faceQuality.overall === 'good' && (
                    <>
                      <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                      <span className="text-green-400 text-sm font-medium">Photo Quality: Good</span>
                    </>
                  )}
                  {faceQuality.overall === 'fair' && (
                    <>
                      <div className="w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">!</span>
                      </div>
                      <span className="text-yellow-400 text-sm font-medium">Photo Quality: Fair</span>
                    </>
                  )}
                  {faceQuality.overall === 'poor' && (
                    <>
                      <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">×</span>
                      </div>
                      <span className="text-red-400 text-sm font-medium">Photo Quality: Poor</span>
                    </>
                  )}
                </div>
                
                <p className={cn(
                  "text-xs mb-2",
                  faceQuality.overall === 'good' ? 'text-green-300' :
                  faceQuality.overall === 'fair' ? 'text-yellow-300' :
                  'text-red-300'
                )}>
                  {faceQuality.message}
                </p>
                
                {/* Quality Checks */}
                {faceQuality.checks && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={faceQuality.checks.faceDetected ? 'text-green-400' : 'text-red-400'}>
                        {faceQuality.checks.faceDetected ? '✓' : '✗'}
                      </span>
                      <span className="text-neutral-400">Face detected</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={faceQuality.checks.lighting === 'good' ? 'text-green-400' : faceQuality.checks.lighting === 'fair' ? 'text-yellow-400' : 'text-red-400'}>
                        {faceQuality.checks.lighting === 'good' ? '✓' : faceQuality.checks.lighting === 'fair' ? '!' : '✗'}
                      </span>
                      <span className="text-neutral-400">Lighting</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={faceQuality.checks.focus === 'good' ? 'text-green-400' : faceQuality.checks.focus === 'fair' ? 'text-yellow-400' : 'text-red-400'}>
                        {faceQuality.checks.focus === 'good' ? '✓' : faceQuality.checks.focus === 'fair' ? '!' : '✗'}
                      </span>
                      <span className="text-neutral-400">Focus</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={faceQuality.checks.size === 'good' ? 'text-green-400' : faceQuality.checks.size === 'fair' ? 'text-yellow-400' : 'text-red-400'}>
                        {faceQuality.checks.size === 'good' ? '✓' : faceQuality.checks.size === 'fair' ? '!' : '✗'}
                      </span>
                      <span className="text-neutral-400">Face size</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              {faceQuality && faceQuality.overall !== 'good' && (
                <button
                  type="button"
                  onClick={captureFace}
                  disabled={faceCaptureLoading || testSeedLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-500/50 bg-orange-600/10 py-3 text-sm font-semibold text-orange-400 transition-colors hover:border-orange-500 hover:bg-orange-600/20 disabled:opacity-50 max-sm:rounded-lg max-sm:py-2.5"
                >
                  {faceCaptureLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin max-sm:h-3 max-sm:w-3" />
                      Retaking...
                    </>
                  ) : (
                    "Retake Photo"
                  )}
                </button>
              )}
              
              <button
                type="button"
                onClick={submitWithFace}
                disabled={loading || testSeedLoading || !name.trim() || !gender || !skill || showDuplicateWarning || (faceQuality?.overall === 'poor' && !faceQuality?.canForce)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50 max-sm:rounded-lg max-sm:py-2.5 max-sm:text-base"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin max-sm:h-4 max-sm:w-4" />
                    {t("staff.checkIn.adding")}
                  </>
                ) : (
                  "Add Player with Face"
                )}
              </button>
              
              {faceQuality && faceQuality.canForce && faceQuality.overall !== 'good' && (
                <button
                  type="button"
                  onClick={forceAddWithFace}
                  disabled={loading || testSeedLoading || !name.trim() || !gender || !skill || showDuplicateWarning}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-orange-500/50 bg-orange-600/10 py-3 text-sm font-semibold text-orange-400 transition-colors hover:border-orange-500 hover:bg-orange-600/20 disabled:opacity-50 max-sm:rounded-lg max-sm:py-2.5"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin max-sm:h-3 max-sm:w-3" />
                      Force Adding...
                    </>
                  ) : (
                    "Force Add (Override Quality Check)"
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={loading || testSeedLoading || !name.trim() || !gender || !skill || showDuplicateWarning}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-50 max-sm:rounded-lg max-sm:py-2.5 max-sm:text-base"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin max-sm:h-4 max-sm:w-4" />
              {t("staff.checkIn.adding")}
            </>
          ) : (
            t("staff.checkIn.addToQueue")
          )}
        </button>
      </div>

      {recent.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 max-sm:rounded-lg max-sm:p-2.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 max-sm:mb-1 max-sm:text-[10px]">
            {t("staff.checkIn.recentlyAdded")}
          </p>
          <ul className="space-y-2 max-sm:space-y-1">
            {recent.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-neutral-800/50 px-3 py-2 text-sm max-sm:px-2 max-sm:py-1 max-sm:text-xs"
              >
                <span className="min-w-0 truncate font-medium text-white">
                  {p.name}
                  {p.queueNumber && (
                    <span className="ml-2 text-blue-400">#{p.queueNumber}</span>
                  )}
                </span>
                <span className="shrink-0 text-neutral-400">
                  {(p.gender === "male" || p.gender === "female" ? genderLabel(p.gender) : p.gender)} ·{" "}
                  {(["beginner", "intermediate", "advanced", "pro"] as const).includes(p.skillLevel as SkillLevelType)
                    ? skillLabel(p.skillLevel as SkillLevelType)
                    : p.skillLevel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center pt-1">
        <button
          type="button"
          onClick={() => setConfirmTestCreate5({ step: 1 })}
          disabled={loading || testSeedLoading}
          className="text-[11px] text-neutral-500 underline decoration-neutral-600 underline-offset-2 hover:text-neutral-400 disabled:opacity-40 max-sm:text-[10px]"
        >
          {testSeedLoading ? (
            <span className="inline-flex items-center justify-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("staff.checkIn.adding")}
            </span>
          ) : (
            t("staff.checkIn.testCreate5")
          )}
        </button>
      </p>

      {confirmTestCreate5 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !testSeedLoading && setConfirmTestCreate5(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmTestCreate5.step === 1 ? (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-amber-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-amber-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{t("staff.checkIn.testCreate5Step1Title")}</h3>
                  <p className="text-sm text-neutral-400">{t("staff.checkIn.testCreate5Step1Body")}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmTestCreate5({ step: 2 })}
                    className="flex-1 rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500"
                  >
                    {t("staff.dashboard.continue")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmTestCreate5(null)}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700"
                  >
                    {t("staff.dashboard.cancel")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 flex flex-col items-center gap-3 text-center">
                  <div className="rounded-full bg-red-600/20 p-3">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{t("staff.dashboard.areYouSure")}</h3>
                  <p className="text-sm text-neutral-400">{t("staff.checkIn.testCreate5Step2Body")}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => void addFiveTestPlayers()}
                    disabled={testSeedLoading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {testSeedLoading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        {t("staff.checkIn.adding")}
                      </>
                    ) : (
                      t("staff.checkIn.testCreate5ConfirmButton")
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmTestCreate5(null)}
                    disabled={testSeedLoading}
                    className="flex-1 rounded-xl bg-neutral-800 py-3 font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
                  >
                    {t("staff.dashboard.cancel")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
