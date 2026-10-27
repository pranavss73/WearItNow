/**
 * WearItNow - Pose Tracking Module
 * Uses MediaPipe BlazePose (PoseLandmarker) for real-time 3D landmark detection.
 * Provides smoothed tracking data, torso alignment metrics, and skeleton overlay.
 */

export class BodyTracker {
    constructor() {
        this.landmarker = null;
        this.isReady = false;
        this.lastVideoTime = -1;
        this.smoothedLandmarks = null;
        this.smoothingFactor = 0.75; // EMA alpha
        this.trackingActive = false;
        this.lastResult = null;

        // Silhouette edge tracker (real-time body contour bounds)
        this.segmenter = null;
        this.segmenterReady = false;
        this.segmenterCanvas = null;
        this.segmenterCtx = null;
        this.lastSegmenterTime = 0;
        this.silhouetteBounds = null;
    }

    /**
     * Initialize MediaPipe Vision & PoseLandmarker
     */
    async initialize(onProgress = null) {
        if (this.isReady) return;

        if (onProgress) onProgress(0.2, "Loading MediaPipe vision engine...");

        let PoseLandmarkerClass = window.PoseLandmarker;
        let FilesetResolverClass = window.FilesetResolver;

        if (!PoseLandmarkerClass && window.tasksVision) {
            PoseLandmarkerClass = window.tasksVision.PoseLandmarker;
            FilesetResolverClass = window.tasksVision.FilesetResolver;
        }

        if (!PoseLandmarkerClass) {
            const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18");
            PoseLandmarkerClass = vision.PoseLandmarker;
            FilesetResolverClass = vision.FilesetResolver;
        }

        if (onProgress) onProgress(0.4, "Fetching high-precision pose estimation model...");

        const wasmResolver = await FilesetResolverClass.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
        );

        const primaryModelUrl = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
        const fallbackModelUrl = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

        const loadModel = async (url, delegate = "GPU") => {
            return await PoseLandmarkerClass.createFromOptions(wasmResolver, {
                baseOptions: {
                    modelAssetPath: url,
                    delegate,
                },
                runningMode: "VIDEO",
                numPoses: 1,
                minPoseDetectionConfidence: 0.5,
                minPosePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });
        };

        try {
            this.landmarker = await loadModel(primaryModelUrl, "GPU");
        } catch (e) {
            console.warn("GPU full model failed, trying CPU full model:", e);
            try {
                this.landmarker = await loadModel(primaryModelUrl, "CPU");
            } catch (e2) {
                console.warn("Full model failed, falling back to lite model:", e2);
                this.landmarker = await loadModel(fallbackModelUrl, "CPU");
            }
        }

        this.isReady = true;
        if (onProgress) onProgress(0.6, "Body tracking engine ready");

        // Asynchronously initialize lightweight body edge segmenter without blocking main thread
        this._initSegmenterAsync(FilesetResolverClass, wasmResolver);
    }

    /**
     * Asynchronously loads lightweight selfie segmentation for silhouette edge tracking
     */
    async _initSegmenterAsync(FilesetResolverClass, wasmResolver) {
        try {
            let ImageSegmenterClass = window.ImageSegmenter || (window.tasksVision && window.tasksVision.ImageSegmenter);
            if (!ImageSegmenterClass) {
                const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18");
                ImageSegmenterClass = vision.ImageSegmenter;
            }
            if (ImageSegmenterClass) {
                const segmenterModelUrl = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.task";
                this.segmenter = await ImageSegmenterClass.createFromOptions(wasmResolver, {
                    baseOptions: {
                        modelAssetPath: segmenterModelUrl,
                        delegate: "GPU",
                    },
                    runningMode: "IMAGE",
                    outputCategoryMask: false,
                    outputConfidenceMasks: true,
                });
                this.segmenterReady = true;
                console.log("✓ Body edge silhouette segmenter ready");
            }
        } catch (e) {
            console.warn("Selfie segmenter not active (using landmark cage bounds):", e);
        }
    }

    /**
     * Process current video frame and extract landmarks.
     */
    detect(video) {
        if (!this.isReady || !video || video.readyState < 2) {
            return null;
        }

        const currentTime = video.currentTime;
        if (currentTime === this.lastVideoTime) {
            return this.lastResult;
        }
        this.lastVideoTime = currentTime;

        const timestamp = performance.now();
        const results = this.landmarker.detectForVideo(video, timestamp);

        if (!results || !results.landmarks || results.landmarks.length === 0) {
            this.trackingActive = false;
            this.lastResult = null;
            return null;
        }

        const raw = results.landmarks[0];
        const world = results.worldLandmarks && results.worldLandmarks.length > 0 
            ? results.worldLandmarks[0] 
            : null;

        // Apply Exponential Moving Average filter
        this.smoothedLandmarks = this._smoothLandmarks(raw);
        this.trackingActive = true;

        // Run silhouette edge segmentation at ~12 FPS in background to avoid dropping video FPS
        this._processSegmentation(video, true);

        const metrics = this._computeMetrics(this.smoothedLandmarks, world, video.videoWidth || 640, video.videoHeight || 480, true);
        this.lastResult = metrics;
        return metrics;
    }

    /**
     * Run lightweight silhouette edge segmentation on offscreen canvas (sub-2.5ms execution)
     */
    _processSegmentation(videoSource, isMirrored = true) {
        if (!this.segmenterReady || !this.segmenter || !videoSource) return;
        const now = performance.now();
        if (now - this.lastSegmenterTime < 45) return; // ~22 FPS segmentation update rate
        this.lastSegmenterTime = now;

        try {
            if (!this.segmenterCanvas) {
                this.segmenterCanvas = document.createElement('canvas');
                this.segmenterCanvas.width = 256;
                this.segmenterCanvas.height = 144;
                this.segmenterCtx = this.segmenterCanvas.getContext('2d', { willReadFrequently: true });
            }
            this.segmenterCtx.drawImage(videoSource, 0, 0, 256, 144);

            this.segmenter.segment(this.segmenterCanvas, (result) => {
                if (result && result.confidenceMasks && result.confidenceMasks.length > 0) {
                    const mask = result.confidenceMasks[0];
                    this.silhouetteBounds = this._extractSilhouetteBounds(mask, isMirrored);
                }
            });
        } catch (e) {
            // Non-critical, ignore
        }
    }

    /**
     * Extract horizontal silhouette slice bounds {y, left, right} for high-precision garment edge fitting
     */
    _extractSilhouetteBounds(confidenceMask, isMirrored = true) {
        if (!confidenceMask) return null;
        const w = confidenceMask.width;
        const h = confidenceMask.height;
        let data = null;
        if (typeof confidenceMask.getAsFloat32Array === 'function') {
            data = confidenceMask.getAsFloat32Array();
        } else if (confidenceMask.data) {
            data = confidenceMask.data;
        }
        if (!data || data.length === 0) return null;

        const slices = [];
        const numSlices = 28; // Dense 28-slice scanning for accurate torso contours
        for (let s = 0; s < numSlices; s++) {
            const normY = 0.18 + (s / (numSlices - 1)) * 0.72;
            const rowY = Math.min(h - 1, Math.max(0, Math.floor(normY * h)));
            const rowOffset = rowY * w;

            let minX = -1;
            let maxX = -1;

            for (let colX = 0; colX < w; colX++) {
                const conf = data[rowOffset + colX];
                if (conf > 0.40) {
                    if (minX === -1) minX = colX;
                    maxX = colX;
                }
            }

            if (minX !== -1 && maxX > minX) {
                let leftNorm = minX / w;
                let rightNorm = maxX / w;
                if (isMirrored) {
                    const temp = 1.0 - rightNorm;
                    rightNorm = 1.0 - leftNorm;
                    leftNorm = temp;
                }
                slices.push({
                    y: normY,
                    left: leftNorm,
                    right: rightNorm,
                    width: rightNorm - leftNorm
                });
            }
        }

        return slices.length >= 6 ? slices : null;
    }

    /**
     * Process a still image element (photo / test subject) and extract landmarks.
     */
    detectImage(image) {
        if (!this.isReady || !image) {
            return null;
        }

        if (image instanceof HTMLImageElement && (!image.complete || image.naturalWidth === 0)) {
            return null;
        }

        // Run silhouette edge segmentation on still image if available
        this._processSegmentation(image, false);

        const width = image.naturalWidth || image.width || 640;
        const height = image.naturalHeight || image.height || 480;

        const timestamp = performance.now();
        let results = null;

        try {
            results = this.landmarker.detectForVideo(image, timestamp);
        } catch (e) {
            console.warn("detectForVideo failed on image directly, drawing to canvas fallback:", e);
            try {
                const offscreen = document.createElement('canvas');
                offscreen.width = width;
                offscreen.height = height;
                const ctx = offscreen.getContext('2d');
                ctx.drawImage(image, 0, 0);
                results = this.landmarker.detectForVideo(offscreen, performance.now());
            } catch (err) {
                console.error("Image pose detection failed:", err);
            }
        }

        if (!results || !results.landmarks || results.landmarks.length === 0) {
            this.trackingActive = false;
            this.lastResult = null;
            return null;
        }

        const raw = results.landmarks[0];
        const world = results.worldLandmarks && results.worldLandmarks.length > 0 
            ? results.worldLandmarks[0] 
            : null;

        this.smoothedLandmarks = raw.map(pt => ({ ...pt }));
        this.trackingActive = true;

        const metrics = this._computeMetrics(this.smoothedLandmarks, world, width, height, false);
        this.lastResult = metrics;
        return metrics;
    }

    /**
     * Generates a realistic standing pose for demo & testing when physical camera is unavailable.
     */
    getDemoPose(width = 640, height = 480, time = 0) {
        const sway = Math.sin(time * 1.5) * 0.008;
        const breath = Math.cos(time * 2.0) * 0.004;

        // In unmirrored image:
        // Anatomical left shoulder (viewer's right, x > 0.5)
        const ls = { x: 0.62 + sway, y: 0.35 + breath, z: -0.01, visibility: 0.99 };
        // Anatomical right shoulder (viewer's left, x < 0.5)
        const rs = { x: 0.38 + sway, y: 0.35 + breath, z: 0.01, visibility: 0.99 };
        const lh = { x: 0.58 + sway, y: 0.70, z: 0.0, visibility: 0.99 };
        const rh = { x: 0.42 + sway, y: 0.70, z: 0.0, visibility: 0.99 };
        const le = { x: 0.68, y: 0.54, z: 0.0, visibility: 0.99 };
        const re = { x: 0.32, y: 0.54, z: 0.0, visibility: 0.99 };
        const lw = { x: 0.70, y: 0.70, z: 0.0, visibility: 0.99 };
        const rw = { x: 0.30, y: 0.70, z: 0.0, visibility: 0.99 };
        const nose = { x: 0.50 + sway, y: 0.22, z: 0.0, visibility: 0.99 };

        const landmarks = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.5 }));
        landmarks[0] = nose;
        landmarks[11] = ls; landmarks[12] = rs;
        landmarks[13] = le; landmarks[14] = re;
        landmarks[15] = lw; landmarks[16] = rw;
        landmarks[23] = lh; landmarks[24] = rh;

        return this._computeMetrics(landmarks, null, width, height, false);
    }

    /**
     * Smooth landmark stream to eliminate jitter
     */
    _smoothLandmarks(current) {
        if (!this.smoothedLandmarks || this.smoothedLandmarks.length !== current.length) {
            return current.map(pt => ({ ...pt }));
        }

        const alpha = this.smoothingFactor;
        const oneMinusAlpha = 1.0 - alpha;

        return current.map((pt, i) => {
            const prev = this.smoothedLandmarks[i];
            return {
                x: pt.x * alpha + prev.x * oneMinusAlpha,
                y: pt.y * alpha + prev.y * oneMinusAlpha,
                z: (pt.z || 0) * alpha + (prev.z || 0) * oneMinusAlpha,
                visibility: pt.visibility !== undefined ? pt.visibility : 1.0,
            };
        });
    }

    /**
     * Build high-precision 18-point anatomical body cage for deformable 3D garment fitting.
     * All points are returned in normalized coordinates { x, y, z }.
     */
    _buildBodyCage(lm, isMirrored = false) {
        if (!lm || lm.length < 25) return null;

        const getPt = (idx) => {
            const p = lm[idx];
            if (!p) return { x: 0.5, y: 0.5, z: 0, visibility: 0 };
            return {
                x: isMirrored ? (1.0 - p.x) : p.x,
                y: p.y,
                z: p.z || 0,
                visibility: p.visibility !== undefined ? p.visibility : 1.0
            };
        };

        const nose = getPt(0);
        const ls = getPt(11); // left shoulder
        const rs = getPt(12); // right shoulder
        const le = getPt(13); // left elbow
        const re = getPt(14); // right elbow
        const lw = getPt(15); // left wrist
        const rw = getPt(16); // right wrist
        const lh = getPt(23); // left hip
        const rh = getPt(24); // right hip

        const shoulderCenter = {
            x: (ls.x + rs.x) / 2,
            y: (ls.y + rs.y) / 2,
            z: (ls.z + rs.z) / 2
        };

        const shoulderWidth = Math.hypot(ls.x - rs.x, ls.y - rs.y);

        // Anatomical suprasternal notch (collarbone hollow at base of throat):
        // Sits right between the medial clavicles, slightly below the shoulder midpoint line
        let neckY = shoulderCenter.y + shoulderWidth * 0.025;
        let neckX = shoulderCenter.x;
        if (nose && (nose.visibility ?? 1.0) > 0.35) {
            neckX = shoulderCenter.x * 0.88 + nose.x * 0.12;
        }

        const neck = {
            x: neckX,
            y: neckY,
            z: shoulderCenter.z
        };

        const suprasternalNotch = {
            x: neckX,
            y: shoulderCenter.y + shoulderWidth * 0.045,
            z: shoulderCenter.z - 0.015 * shoulderWidth
        };

        // Inner clavicles (collarbones)
        const clavicleLeft = {
            x: ls.x * 0.60 + neck.x * 0.40,
            y: ls.y * 0.60 + neck.y * 0.40,
            z: ls.z * 0.60 + neck.z * 0.40
        };
        const clavicleRight = {
            x: rs.x * 0.60 + neck.x * 0.40,
            y: rs.y * 0.60 + neck.y * 0.40,
            z: rs.z * 0.60 + neck.z * 0.40
        };

        // Hips: detect or extrapolate
        const hipsVisible = (lh.visibility > 0.35 && rh.visibility > 0.35);
        let hipLeft, hipRight, hipCenter;

        if (hipsVisible) {
            hipLeft = { ...lh };
            hipRight = { ...rh };
            hipCenter = {
                x: (lh.x + rh.x) / 2,
                y: (lh.y + rh.y) / 2,
                z: (lh.z + rh.z) / 2
            };
        } else {
            const torsoLen = Math.max(0.35, shoulderWidth * 1.30);
            hipCenter = {
                x: shoulderCenter.x,
                y: shoulderCenter.y + torsoLen,
                z: shoulderCenter.z
            };
            hipLeft = {
                x: hipCenter.x + (ls.x - shoulderCenter.x) * 0.88,
                y: hipCenter.y,
                z: ls.z
            };
            hipRight = {
                x: hipCenter.x + (rs.x - shoulderCenter.x) * 0.88,
                y: hipCenter.y,
                z: rs.z
            };
        }

        // Sternum (upper chest)
        const sternum = {
            x: shoulderCenter.x * 0.70 + hipCenter.x * 0.30,
            y: shoulderCenter.y * 0.70 + hipCenter.y * 0.30,
            z: shoulderCenter.z * 0.70 + hipCenter.z * 0.30 - 0.025 * shoulderWidth
        };

        // Solar Plexus (mid spine)
        const solarPlexus = {
            x: shoulderCenter.x * 0.45 + hipCenter.x * 0.55,
            y: shoulderCenter.y * 0.45 + hipCenter.y * 0.55,
            z: shoulderCenter.z * 0.45 + hipCenter.z * 0.55 - 0.015 * shoulderWidth
        };

        // Navel (waist center)
        const navel = {
            x: shoulderCenter.x * 0.20 + hipCenter.x * 0.80,
            y: shoulderCenter.y * 0.20 + hipCenter.y * 0.80,
            z: shoulderCenter.z * 0.20 + hipCenter.z * 0.80
        };

        // Dynamic arm elevation detection (positive when elbow raises towards/above shoulder level)
        const leftArmLift = Math.max(0, ls.y - le.y + shoulderWidth * 0.08);
        const rightArmLift = Math.max(0, rs.y - re.y + shoulderWidth * 0.08);

        // Dynamic armpits that elevate with arm lift
        const leftArmpit = {
            x: ls.x * 0.82 + hipLeft.x * 0.18,
            y: (ls.y * 0.82 + hipLeft.y * 0.18) - leftArmLift * 0.35,
            z: ls.z * 0.82 + hipLeft.z * 0.18
        };
        const rightArmpit = {
            x: rs.x * 0.82 + hipRight.x * 0.18,
            y: (rs.y * 0.82 + hipRight.y * 0.18) - rightArmLift * 0.35,
            z: rs.z * 0.82 + hipRight.z * 0.18
        };

        // Ribs
        const leftRib = {
            x: leftArmpit.x * 0.55 + hipLeft.x * 0.45,
            y: leftArmpit.y * 0.55 + hipLeft.y * 0.45,
            z: leftArmpit.z * 0.55 + hipLeft.z * 0.45
        };
        const rightRib = {
            x: rightArmpit.x * 0.55 + hipRight.x * 0.45,
            y: rightArmpit.y * 0.55 + hipRight.y * 0.45,
            z: rightArmpit.z * 0.55 + hipRight.z * 0.45
        };

        // Waist
        const leftWaist = {
            x: leftRib.x * 0.45 + hipLeft.x * 0.55,
            y: leftRib.y * 0.45 + hipLeft.y * 0.55,
            z: leftRib.z * 0.45 + hipLeft.z * 0.55
        };
        const rightWaist = {
            x: rightRib.x * 0.45 + hipRight.x * 0.55,
            y: rightRib.y * 0.45 + hipRight.y * 0.55,
            z: rightRib.z * 0.45 + hipRight.z * 0.55
        };

        return {
            neck,
            suprasternalNotch,
            clavicleLeft,
            clavicleRight,
            leftShoulder: ls,
            rightShoulder: rs,
            leftArmpit,
            rightArmpit,
            sternum,
            solarPlexus,
            navel,
            leftRib,
            rightRib,
            leftWaist,
            rightWaist,
            leftHip: hipLeft,
            rightHip: hipRight,
            hipCenter,
            leftElbow: le,
            rightElbow: re,
            leftWrist: lw,
            rightWrist: rw,
            leftArmLift,
            rightArmLift,
            shoulderWidth,
            shoulderCenter,
            torsoHeight: Math.hypot(hipCenter.x - shoulderCenter.x, hipCenter.y - shoulderCenter.y)
        };
    }

    /**
     * Compute body measurements and garment placement coordinates
     */
    _computeMetrics(lm, world, width, height, isMirrored = true) {
        const ls = lm[11];
        const rs = lm[12];
        const lh = lm[23];
        const rh = lm[24];
        const le = lm[13];
        const re = lm[14];
        const lw = lm[15];
        const rw = lm[16];

        const shoulderVis = ((ls.visibility ?? 1.0) + (rs.visibility ?? 1.0)) / 2;
        if (shoulderVis < 0.35) {
            this.trackingActive = false;
            return null;
        }

        const shoulderCenter = {
            x: (ls.x + rs.x) / 2,
            y: (ls.y + rs.y) / 2,
            z: (ls.z + rs.z) / 2,
        };

        const hipCenter = {
            x: (lh.x + rh.x) / 2,
            y: (lh.y + rh.y) / 2,
            z: (lh.z + rh.z) / 2,
        };

        const torsoCenter = {
            x: (shoulderCenter.x + hipCenter.x) / 2,
            y: (shoulderCenter.y + hipCenter.y) / 2,
            z: (shoulderCenter.z + hipCenter.z) / 2,
        };

        const dx = Math.abs(ls.x - rs.x);
        const dy = (ls.y - rs.y);
        const shoulderWidthNorm = Math.hypot(dx, dy);
        const shoulderWidthPx = shoulderWidthNorm * width;

        const hx = (hipCenter.x - shoulderCenter.x);
        const hy = (hipCenter.y - shoulderCenter.y);
        const torsoHeightNorm = Math.hypot(hx, hy);
        const torsoHeightPx = torsoHeightNorm * height;

        const roll = Math.atan2(rs.y - ls.y, Math.max(0.01, dx));
        const yaw = Math.atan2(rs.z - ls.z, Math.max(0.05, dx));
        const pitch = Math.atan2(shoulderCenter.z - hipCenter.z, Math.max(0.05, torsoHeightNorm));

        const leftArmAngle = Math.atan2(le.x - ls.x, Math.max(0.01, le.y - ls.y));
        const rightArmAngle = Math.atan2(re.x - rs.x, Math.max(0.01, re.y - rs.y));

        // Generate the 18-point anatomical cage
        const bodyCage = this._buildBodyCage(lm, isMirrored);

        return {
            landmarks: lm,
            rawLandmarks: lm,
            worldLandmarks: world,
            isMirrored: Boolean(isMirrored),
            bodyCage,
            silhouetteBounds: this.silhouetteBounds,
            shoulders: { left: ls, right: rs, center: shoulderCenter, width: shoulderWidthNorm, widthPx: shoulderWidthPx },
            hips: { left: lh, right: rh, center: hipCenter },
            torso: { center: torsoCenter, height: torsoHeightNorm, heightPx: torsoHeightPx },
            arms: {
                leftShoulderToElbow: { angle: leftArmAngle, elbow: le, wrist: lw },
                rightShoulderToElbow: { angle: rightArmAngle, elbow: re, wrist: rw },
            },
            orientation: { roll, yaw, pitch },
            confidence: shoulderVis,
        };
    }

    /**
     * Draw stylish AR landmark tracking visualization on display.
     */
    draw(canvas, metrics) {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!metrics || !metrics.landmarks) return;

        const w = canvas.width;
        const h = canvas.height;
        const lm = metrics.landmarks;
        const isMirrored = metrics.isMirrored !== false;

        const getScreenX = (normX) => (isMirrored ? (1.0 - normX) : normX) * w;
        const getScreenY = (normY) => normY * h;

        // Rich skeletal & cage connections
        const connections = [
            [11, 12], // shoulder line
            [11, 23], // left torso flank
            [12, 24], // right torso flank
            [23, 24], // hip line
            [11, 13], [13, 15], // left arm
            [12, 14], [14, 16], // right arm
        ];

        ctx.save();
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";

        connections.forEach(([i, j]) => {
            const p1 = lm[i];
            const p2 = lm[j];
            if (!p1 || !p2) return;

            const x1 = getScreenX(p1.x);
            const y1 = getScreenY(p1.y);
            const x2 = getScreenX(p2.x);
            const y2 = getScreenY(p2.y);

            const grad = ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, "rgba(0, 212, 255, 0.7)");
            grad.addColorStop(1, "rgba(139, 92, 246, 0.7)");

            ctx.strokeStyle = grad;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });

        // Draw anatomical cage lines if bodyCage available
        if (metrics.bodyCage) {
            const c = metrics.bodyCage;
            const toScreen = (pt) => ({ x: pt.x * w, y: pt.y * h });

            ctx.strokeStyle = "rgba(0, 212, 255, 0.35)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);

            const cageLines = [
                [c.neck, c.sternum],
                [c.sternum, c.solarPlexus],
                [c.solarPlexus, c.navel],
                [c.clavicleLeft, c.sternum],
                [c.clavicleRight, c.sternum],
                [c.leftArmpit, c.leftRib],
                [c.rightArmpit, c.rightRib],
                [c.leftRib, c.leftWaist],
                [c.rightRib, c.rightWaist]
            ];

            cageLines.forEach(([p1, p2]) => {
                if (!p1 || !p2) return;
                const s1 = toScreen(p1);
                const s2 = toScreen(p2);
                ctx.beginPath();
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
                ctx.stroke();
            });

            ctx.setLineDash([]);
        }

        // Draw glowing joint markers
        const keyJoints = [11, 12, 13, 14, 15, 16, 23, 24];
        keyJoints.forEach(idx => {
            const pt = lm[idx];
            if (!pt) return;
            const x = getScreenX(pt.x);
            const y = getScreenY(pt.y);

            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0, 212, 255, 0.35)";
            ctx.fill();

            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
        });

        ctx.restore();
    }
}
