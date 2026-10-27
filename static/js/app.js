/**
 * WearItNow - Main Application Controller
 * Coordinates camera, body tracker, 3D garment renderer, and API processing.
 */

import { api } from './api.js?v=10.0';
import { BodyTracker } from './tracker.js?v=10.0';
import { GarmentRenderer } from './garment_renderer.js?v=10.0';

class WearItNowApp {
    constructor() {
        // DOM Elements
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingBarFill = document.getElementById('loading-bar-fill');
        this.loadingStatus = document.getElementById('loading-status');
        this.appContainer = document.getElementById('app');

        this.video = document.getElementById('camera-feed');
        this.mannequinFeed = document.getElementById('mannequin-feed');

        // Source toggle buttons
        this.srcWebcam = document.getElementById('src-webcam');
        this.srcPersonMale = document.getElementById('src-person-male');
        this.srcPersonFemale = document.getElementById('src-person-female');
        this.srcPersonTurned = document.getElementById('src-person-turned');
        this.srcUploadPerson = document.getElementById('src-upload-person');
        this.personPhotoInput = document.getElementById('person-photo-input');

        this.currentSource = 'still'; // 'webcam' | 'still'
        this.currentSubjectKey = 'male'; // 'male' | 'female' | 'desk' | 'custom' | 'webcam'
        this.currentStillUrl = '/samples/test_person_male.jpg';
        this.activeSourceBtnId = 'src-person-male';
        this.stillPoseData = null;

        this.trackingCanvas = document.getElementById('tracking-canvas');
        this.garmentCanvas = document.getElementById('garment-canvas');
        this.viewportOverlay = document.getElementById('viewport-overlay');
        this.bodyGuide = document.getElementById('body-guide');

        // Header chips
        this.fpsChip = document.getElementById('fps-chip');
        this.fpsValue = document.getElementById('fps-value');
        this.trackingChip = document.getElementById('tracking-chip');
        this.trackingStatus = document.getElementById('tracking-status');

        // Step 1: Upload
        this.uploadCard = document.getElementById('upload-card');
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('garment-input');
        this.dropContent = document.getElementById('drop-content');
        this.previewContent = document.getElementById('preview-content');
        this.garmentPreview = document.getElementById('garment-preview');
        this.clearBtn = document.getElementById('clear-btn');

        // Step 2: Classification
        this.classifyCard = document.getElementById('classify-card');
        this.classifyPlaceholder = document.getElementById('classify-placeholder');
        this.classifyLoading = document.getElementById('classify-loading');
        this.classifyResult = document.getElementById('classification-result');
        this.garmentTypeIcon = document.getElementById('garment-type-icon');
        this.garmentTypeLabel = document.getElementById('garment-type-label');
        this.garmentConfidence = document.getElementById('garment-confidence');
        this.classifyScores = document.getElementById('classify-scores');

        // Step 3: Try-On
        this.tryonCard = document.getElementById('tryon-card');
        this.modeQuick = document.getElementById('mode-quick');
        this.modeAi = document.getElementById('mode-ai');
        this.tryonBtn = document.getElementById('tryon-btn');
        this.stopBtn = document.getElementById('stop-btn');

        // Timing info
        this.timingInfo = document.getElementById('timing-info');
        this.timeClassify = document.getElementById('time-classify');
        this.timeSegment = document.getElementById('time-segment');
        this.timeProcess = document.getElementById('time-process');
        this.timeTotal = document.getElementById('time-total');

        // State
        this.tracker = new BodyTracker();
        this.renderer = null;
        this.currentMode = 'quick'; // 'quick' | 'ai'
        this.uploadedFile = null;
        this.processedData = null;
        this.isTryOnActive = false;
        this.isCameraStarted = false;

        // FPS calculation
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.lastFrameTime = performance.now();

        this.init();
    }

    /**
     * Bootstraps application components
     */
    async init() {
        try {
            this.updateLoading(0.15, "Connecting to WearItNow server...");
            const health = await api.checkHealth();
            console.log("Server health:", health);

            this.updateLoading(0.35, "Initializing MediaPipe body tracking...");
            await this.tracker.initialize((progress, msg) => {
                this.updateLoading(0.35 + progress * 0.35, msg);
            });

            this.updateLoading(0.75, "Setting up 3D AR viewport...");
            this.renderer = new GarmentRenderer(this.garmentCanvas);

            this.updateLoading(0.90, "Loading still reference test subject...");
            await this.loadStillImage(this.currentStillUrl, 'src-person-male');

            this.updateLoading(1.0, "Ready!");
            setTimeout(() => {
                this.hideLoading();
                this.bindEvents();
                this.startRenderLoop();
                // Autoload default t-shirt for instant interactive testing
                this.autoloadDefaultGarment();
            }, 300);

        } catch (err) {
            console.error("Initialization error:", err);
            this.loadingStatus.textContent = `Initialization note: ${err.message}`;
            setTimeout(() => {
                this.hideLoading();
                this.bindEvents();
                this.startRenderLoop();
            }, 600);
        }
    }

    updateLoading(progress, text) {
        if (this.loadingBarFill) this.loadingBarFill.style.width = `${Math.round(progress * 100)}%`;
        if (this.loadingStatus) this.loadingStatus.textContent = text;
    }

    hideLoading() {
        if (this.loadingScreen) {
            this.loadingScreen.classList.add('fade-out');
            setTimeout(() => this.loadingScreen.classList.add('hidden'), 600);
        }
        if (this.appContainer) {
            this.appContainer.classList.remove('hidden');
        }
    }

    /**
     * Load a still photo reference subject and calibrate pose
     */
    async loadStillImage(url, sourceBtnId = null) {
        this.currentSource = 'still';
        this.currentStillUrl = url;
        this.stillPoseData = null;

        if (sourceBtnId === 'src-person-male') this.currentSubjectKey = 'male';
        else if (sourceBtnId === 'src-person-female') this.currentSubjectKey = 'female';
        else if (sourceBtnId === 'src-person-turned') this.currentSubjectKey = 'desk';
        else if (sourceBtnId === 'src-upload-person') this.currentSubjectKey = 'custom';

        if (sourceBtnId) {
            this.setActiveSourceButton(sourceBtnId);
        }

        if (this.video) {
            this.video.classList.add('hidden');
            if (!this.video.paused) this.video.pause();
        }

        if (this.mannequinFeed) {
            this.mannequinFeed.classList.remove('hidden');
            this.mannequinFeed.src = url;

            await new Promise((resolve) => {
                if (this.mannequinFeed.complete && this.mannequinFeed.naturalWidth > 0) {
                    resolve();
                } else {
                    this.mannequinFeed.onload = () => resolve();
                    this.mannequinFeed.onerror = () => resolve();
                }
            });
        }

        if (this.viewportOverlay) this.viewportOverlay.classList.add('hidden');
        if (this.bodyGuide) this.bodyGuide.classList.add('hidden');

        // Dynamically match viewport aspect ratio to photograph
        const nw = this.mannequinFeed?.naturalWidth || 768;
        const nh = this.mannequinFeed?.naturalHeight || 1024;
        const vp = document.getElementById('viewport');
        if (vp) {
            vp.style.aspectRatio = `${nw} / ${nh}`;
        }
        this.onResize();

        // Detect landmarks on still image with MediaPipe
        let pose = null;
        if (this.tracker && this.tracker.isReady && this.mannequinFeed) {
            pose = this.tracker.detectImage(this.mannequinFeed);
        }

        // Fallback to calibrated demo pose if MediaPipe did not find human
        if (!pose) {
            pose = this.tracker.getDemoPose(nw, nh, 0);
        }

        if (pose) {
            const cat = this.processedData?.classification?.category || this.renderer?.currentType || 'tshirt';
            pose.subjectName = this.currentSubjectKey;
            pose.presetKey = `${this.currentSubjectKey}_${cat}`;
        }

        this.stillPoseData = pose;

        this.trackingChip.classList.add('active');
        this.trackingStatus.textContent = 'Still Pose Calibrated';

        if (this.trackingCanvas) {
            this.tracker.draw(this.trackingCanvas, this.stillPoseData);
        }

        if (this.isTryOnActive && this.renderer) {
            this.renderer.update(this.stillPoseData, 0.016);
        }
    }

    /**
     * Switch to live webcam
     */
    async switchToWebcam() {
        this.currentSource = 'webcam';
        this.currentSubjectKey = 'webcam';
        this.setActiveSourceButton('src-webcam');

        if (this.mannequinFeed) this.mannequinFeed.classList.add('hidden');
        if (this.video) this.video.classList.remove('hidden');

        const vp = document.getElementById('viewport');
        if (vp) vp.style.aspectRatio = '4 / 3';
        this.onResize();

        if (!this.isCameraStarted) {
            await this.initCamera();
        } else if (this.video.paused) {
            this.video.play().catch(e => console.warn("Video play error:", e));
        }
    }

    /**
     * Highlights active source toggle button
     */
    setActiveSourceButton(btnId) {
        this.activeSourceBtnId = btnId;
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === btnId);
        });
    }

    /**
     * Initializes webcam stream
     */
    async initCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("Camera API not supported in this environment");
            this._showCameraFallback("Webcam not supported - using still test subject");
            this.loadStillImage('/samples/test_person_male.jpg', 'src-person-male');
            return;
        }

        try {
            if (this.viewportOverlay) {
                this.viewportOverlay.classList.remove('hidden', 'fade-out');
                const msgText = this.viewportOverlay.querySelector('.msg-text');
                if (msgText) msgText.textContent = "Starting camera...";
            }

            const streamPromise = navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });

            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Camera request timed out")), 4000)
            );

            const stream = await Promise.race([streamPromise, timeoutPromise]);
            this.video.srcObject = stream;
            this.isCameraStarted = true;

            await new Promise((resolve) => {
                const timer = setTimeout(() => resolve(), 2500);
                this.video.onloadedmetadata = () => {
                    clearTimeout(timer);
                    this.video.play().catch(e => console.warn("Video play error:", e));
                    
                    const vw = this.video.videoWidth || 640;
                    const vh = this.video.videoHeight || 480;
                    const vp = document.getElementById('viewport');
                    if (vp) vp.style.aspectRatio = `${vw} / ${vh}`;
                    this.onResize();

                    if (this.viewportOverlay) {
                        this.viewportOverlay.classList.add('fade-out');
                        setTimeout(() => this.viewportOverlay.classList.add('hidden'), 400);
                    }
                    resolve();
                };
            });
        } catch (err) {
            console.warn("Camera initialization warning:", err.message);
            this._showCameraFallback("Allow camera access for live webcam try-on");
            this.loadStillImage('/samples/test_person_male.jpg', 'src-person-male');
        }
    }

    _showCameraFallback(message) {
        if (this.viewportOverlay) {
            const msgText = this.viewportOverlay.querySelector('.msg-text');
            if (msgText) msgText.textContent = message;
        }
        this.onResize();
    }

    /**
     * Sync canvas resolutions with viewport
     */
    onResize() {
        const activeFeed = this.currentSource === 'still' ? this.mannequinFeed : this.video;
        const rect = (activeFeed && activeFeed.getBoundingClientRect().width > 0) 
            ? activeFeed.getBoundingClientRect() 
            : { width: 640, height: 480 };

        const width = Math.round(rect.width) || 640;
        const height = Math.round(rect.height) || 480;

        if (this.trackingCanvas) {
            this.trackingCanvas.width = width;
            this.trackingCanvas.height = height;
        }

        if (this.garmentCanvas && this.renderer) {
            this.renderer.resize(width, height);
        }
    }

    /**
     * Bind UI event listeners
     */
    bindEvents() {
        window.addEventListener('resize', () => this.onResize());

        // Source switcher buttons with robust delegation
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (btn.id === 'src-webcam') {
                    this.switchToWebcam();
                } else if (btn.id === 'src-upload-person') {
                    if (this.personPhotoInput) this.personPhotoInput.click();
                } else if (btn.dataset.src) {
                    this.loadStillImage(btn.dataset.src, btn.id);
                }
            });
        });

        if (this.srcUploadPerson && this.personPhotoInput) {
            this.srcUploadPerson.addEventListener('click', () => {
                this.personPhotoInput.click();
            });

            this.personPhotoInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    const objectUrl = URL.createObjectURL(file);
                    this.loadStillImage(objectUrl, 'src-upload-person');
                }
            });
        }

        // Garment file drop & select
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('drag-over');
        });
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('drag-over');
        });
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.handleFileSelected(e.dataTransfer.files[0]);
            }
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.handleFileSelected(e.target.files[0]);
            }
        });

        this.clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearUploadedFile();
        });

        // Mode buttons
        this.modeQuick.addEventListener('click', () => this.setMode('quick'));
        this.modeAi.addEventListener('click', () => this.setMode('ai'));

        // Try-On buttons
        this.tryonBtn.addEventListener('click', () => this.startTryOn());
        this.stopBtn.addEventListener('click', () => this.stopTryOn());

        // Preset sample chips
        document.querySelectorAll('.preset-chip').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const sampleUrl = btn.dataset.sample;
                if (!sampleUrl) return;

                document.querySelectorAll('.preset-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                try {
                    const response = await fetch(sampleUrl);
                    const blob = await response.blob();
                    const filename = sampleUrl.split('/').pop();
                    const file = new File([blob], filename, { type: blob.type || 'image/png' });
                    this.handleFileSelected(file);
                } catch (err) {
                    console.error("Failed to load sample garment:", err);
                }
            });
        });

        // Category Override chips
        document.querySelectorAll('.override-chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const cat = btn.dataset.cat;
                if (!cat || !this.processedData) return;

                document.querySelectorAll('.override-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const catIcons = { tshirt: '👕', hoodie: '🧥', formal_shirt: '👔', jacket: '🧥' };
                const catLabels = { tshirt: 'T-Shirt', hoodie: 'Hoodie', formal_shirt: 'Formal Shirt', jacket: 'Jacket' };

                this.processedData.classification.category = cat;
                this.processedData.classification.display = catLabels[cat] || cat;
                this.processedData.classification.icon = catIcons[cat] || '👕';

                this.garmentTypeIcon.textContent = this.processedData.classification.icon;
                this.garmentTypeLabel.textContent = this.processedData.classification.display;

                // Reload 3D model immediately
                if (this.isTryOnActive) {
                    this.applyGarmentToScene();
                }
            });
        });
    }

    /**
     * Autoload default t-shirt sample so try-on can be tested immediately
     */
    async autoloadDefaultGarment() {
        try {
            const firstPreset = document.querySelector('.preset-chip[data-sample="/samples/tshirt.png"]');
            if (firstPreset) {
                firstPreset.click();
            }
        } catch (e) {
            console.warn("Autoload default garment note:", e);
        }
    }

    /**
     * Mode switch (Quick Mode vs AI Enhanced Mode)
     */
    setMode(mode) {
        if (this.currentMode === mode) return;
        this.currentMode = mode;

        this.modeQuick.classList.toggle('active', mode === 'quick');
        this.modeAi.classList.toggle('active', mode === 'ai');

        // Reprocess if garment already loaded
        if (this.uploadedFile) {
            this.processGarmentFile();
        }
    }

    /**
     * User selected a garment file
     */
    handleFileSelected(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file (PNG, JPG, WebP).');
            return;
        }

        this.uploadedFile = file;

        // Show preview in upload card
        const reader = new FileReader();
        reader.onload = (e) => {
            this.garmentPreview.src = e.target.result;
            this.dropContent.classList.add('hidden');
            this.previewContent.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // Process garment via backend API
        this.processGarmentFile();
    }

    clearUploadedFile() {
        this.uploadedFile = null;
        this.processedData = null;
        this.fileInput.value = '';
        this.previewContent.classList.add('hidden');
        this.dropContent.classList.remove('hidden');

        // Reset classification card
        this.classifyCard.classList.add('disabled');
        this.classifyCard.classList.remove('active-card');
        this.classifyPlaceholder.classList.remove('hidden');
        this.classifyPlaceholder.innerHTML = '<p>Upload a garment above to see AI classification</p>';
        this.classifyResult.classList.add('hidden');
        this.classifyLoading.classList.add('hidden');

        // Reset Try-On card
        this.tryonCard.classList.add('disabled');
        this.tryonCard.classList.remove('active-card');
        this.tryonBtn.disabled = true;
        this.stopTryOn();

        if (this.timingInfo) this.timingInfo.classList.add('hidden');
    }

    /**
     * Send garment to backend for segmentation, texture extraction, and classification
     */
    async processGarmentFile() {
        if (!this.uploadedFile) return;

        // Update UI to loading
        this.classifyCard.classList.remove('disabled');
        this.classifyCard.classList.add('active-card');
        this.classifyPlaceholder.classList.add('hidden');
        this.classifyLoading.classList.remove('hidden');
        this.classifyResult.classList.add('hidden');

        try {
            const data = await api.processGarment(this.uploadedFile, this.currentMode);
            this.processedData = data;

            // Update classification display
            this.classifyLoading.classList.add('hidden');
            this.classifyResult.classList.remove('hidden');

            const cat = data.classification.category;
            this.garmentTypeIcon.textContent = data.classification.icon;
            this.garmentTypeLabel.textContent = data.classification.display;
            this.garmentConfidence.textContent = `${Math.round(data.classification.confidence * 100)}% Match`;

            // Active category override chip
            document.querySelectorAll('.override-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.cat === cat);
            });

            // Score bars
            this.classifyScores.innerHTML = '';
            if (data.classification.scores) {
                const sorted = Object.entries(data.classification.scores)
                    .sort(([, a], [, b]) => b - a);

                const catLabels = {
                    tshirt: 'T-Shirt',
                    hoodie: 'Hoodie',
                    formal_shirt: 'Formal Shirt',
                    jacket: 'Jacket'
                };

                sorted.forEach(([k, score]) => {
                    const row = document.createElement('div');
                    row.className = 'score-row';
                    const pct = Math.round(score * 100);
                    row.innerHTML = `
                        <span class="score-label">${catLabels[k] || k}</span>
                        <div class="score-bar-bg">
                            <div class="score-bar-fill" style="width: ${pct}%"></div>
                        </div>
                        <span class="score-value">${pct}%</span>
                    `;
                    this.classifyScores.appendChild(row);
                });
            }

            // Timing stats
            if (data.timing) {
                this.timingInfo.classList.remove('hidden');
                this.timeClassify.textContent = `${data.timing.classify_ms || 0}ms`;
                this.timeSegment.textContent = `${data.timing.segment_ms || 0}ms`;
                this.timeProcess.textContent = `${data.timing.process_ms || 0}ms`;
                this.timeTotal.textContent = `${data.timing.total_ms || 0}ms`;
            }

            // Step 3 Enable
            this.tryonCard.classList.remove('disabled');
            this.tryonCard.classList.add('active-card');
            this.tryonBtn.disabled = false;

            // Automatically project 3D garment onto current subject!
            this.startTryOn();

        } catch (err) {
            console.error("Garment processing error:", err);
            this.classifyLoading.classList.add('hidden');
            this.classifyPlaceholder.classList.remove('hidden');
            this.classifyPlaceholder.innerHTML = `<p style="color: var(--accent-rose)">⚠️ ${err.message}</p>`;
        }
    }

    /**
     * Start live Try-On
     */
    startTryOn() {
        if (!this.processedData) return;
        this.isTryOnActive = true;
        this.tryonBtn.classList.add('hidden');
        this.stopBtn.classList.remove('hidden');

        this.applyGarmentToScene();
    }

    /**
     * Stop live Try-On
     */
    stopTryOn() {
        this.isTryOnActive = false;
        this.stopBtn.classList.add('hidden');
        this.tryonBtn.classList.remove('hidden');

        if (this.renderer) {
            this.renderer.setVisible(false);
        }
    }

    /**
     * Load processed 3D model and texture into Three.js scene
     */
    applyGarmentToScene() {
        if (!this.renderer || !this.processedData) return;

        try {
            const cat = this.processedData.classification.category || 'tshirt';
            const textureSrc = this.processedData.texture 
                ? `data:image/png;base64,${this.processedData.texture}` 
                : this.garmentPreview.src;

            this.renderer.setGarment(cat, textureSrc);
            this.renderer.setVisible(true);

            // Re-render immediately on current pose with calibrated preset key
            const activePose = (this.currentSource === 'still') ? this.stillPoseData : null;
            if (activePose) {
                activePose.subjectName = this.currentSubjectKey;
                activePose.presetKey = `${this.currentSubjectKey}_${cat}`;
                this.renderer.update(activePose, 0.016);
            }
        } catch (err) {
            console.error("Error applying garment to 3D scene:", err);
        }
    }

    /**
     * Main animation and tracking loop
     */
    startRenderLoop() {
        const loop = () => {
            const now = performance.now();
            const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1);
            this.lastFrameTime = now;

            // Update FPS counter
            this.frameCount++;
            if (now - this.lastFpsUpdate >= 500) {
                const fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
                this.fpsValue.textContent = fps;
                this.frameCount = 0;
                this.lastFpsUpdate = now;
            }

            let poseData = null;

            if (this.currentSource === 'still') {
                // Still Reference Subject Mode
                if (!this.stillPoseData && this.mannequinFeed && this.mannequinFeed.complete && this.tracker && this.tracker.isReady) {
                    this.stillPoseData = this.tracker.detectImage(this.mannequinFeed);
                }
                poseData = this.stillPoseData;

                if (poseData) {
                    const cat = this.processedData?.classification?.category || this.renderer?.currentType || 'tshirt';
                    poseData.subjectName = this.currentSubjectKey;
                    poseData.presetKey = `${this.currentSubjectKey}_${cat}`;
                    this.trackingChip.classList.add('active');
                    this.trackingStatus.textContent = 'Still Pose Calibrated';
                    if (this.bodyGuide) this.bodyGuide.classList.add('hidden');

                    if (this.trackingCanvas) {
                        this.tracker.draw(this.trackingCanvas, poseData);
                    }
                }
            } else {
                // Live Webcam Mode
                if (this.tracker && this.video && this.video.readyState >= 2) {
                    poseData = this.tracker.detect(this.video);
                }

                if (poseData) {
                    this.trackingChip.classList.add('active');
                    this.trackingStatus.textContent = 'Tracking Active';
                    if (this.bodyGuide) this.bodyGuide.classList.add('hidden');

                    if (this.trackingCanvas) {
                        this.tracker.draw(this.trackingCanvas, poseData);
                    }
                } else {
                    this.trackingChip.classList.remove('active');
                    this.trackingStatus.textContent = 'No Tracking';
                    if (this.bodyGuide && this.isTryOnActive) {
                        this.bodyGuide.classList.remove('hidden');
                    }
                    if (this.trackingCanvas) {
                        const ctx = this.trackingCanvas.getContext('2d');
                        ctx.clearRect(0, 0, this.trackingCanvas.width, this.trackingCanvas.height);
                    }
                }
            }

            // Update 3D Garment overlay
            if (this.renderer) {
                this.renderer.update(this.isTryOnActive ? poseData : null, delta);
            }

            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }
}

// Start application once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    new WearItNowApp();
});
