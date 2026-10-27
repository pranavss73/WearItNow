"""
WearItNow - FastAPI Server
Serves the web frontend and provides API endpoints for garment processing.
"""
import io
import sys
import base64
import time
from contextlib import asynccontextmanager

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image


# Global service instances (initialized on startup)
segmenter = None
classifier = None
texture_processor = None
models_ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models on server startup."""
    global segmenter, classifier, texture_processor, models_ready

    print("\n🔧 Loading ML models...")
    start = time.time()

    try:
        from server.services.segmenter import GarmentSegmenter
        from server.services.classifier import GarmentClassifier
        from server.services.texture_processor import TextureProcessor

        segmenter = GarmentSegmenter()
        classifier = GarmentClassifier(device="cpu")  # CPU is fast enough for one-shot
        texture_processor = TextureProcessor()
        models_ready = True

        elapsed = time.time() - start
        print(f"\n✅ All models loaded in {elapsed:.1f}s\n")
    except Exception as e:
        print(f"\n❌ Error loading models: {e}")
        print("   The server will start but processing will fail.")
        print("   Make sure all dependencies are installed: pip install -r requirements.txt\n")

    yield

    # Cleanup
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="WearItNow API",
    description="AR Virtual Garment Try-On System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS (allow all for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.get("/api/health")
async def health_check():
    """Check if server and models are ready."""
    return {
        "status": "ready" if models_ready else "loading",
        "models_ready": models_ready,
    }


@app.post("/api/process-garment")
async def process_garment(
    file: UploadFile = File(...),
    mode: str = Form(default="quick"),
):
    """
    Process an uploaded garment image.
    1. Segments garment from background (U2-Net)
    2. Classifies garment type (CLIP zero-shot)
    3. Extracts and processes texture

    Args:
        file: Uploaded garment image
        mode: 'quick' or 'ai' processing mode

    Returns:
        JSON with classification, segmented image, and processed texture (base64)
    """
    if not models_ready:
        raise HTTPException(status_code=503, detail="Models are still loading. Please wait.")

    start_time = time.time()

    try:
        # Read uploaded image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")

        # Step 1: Classify the garment
        classification = classifier.classify(image)
        classify_time = time.time()

        # Step 2: Segment (remove background)
        seg_result = segmenter.segment(image)
        segment_time = time.time()

        # Step 3: Process texture
        texture = texture_processor.process(
            seg_result["segmented"],
            classification["category"],
            mode=mode,
        )
        process_time = time.time()

        # Convert results to base64 for JSON response
        texture_b64 = _image_to_base64(texture)
        segmented_b64 = _image_to_base64(seg_result["segmented"])

        total_time = time.time() - start_time

        return JSONResponse({
            "success": True,
            "classification": classification,
            "texture": texture_b64,
            "segmented": segmented_b64,
            "bbox": seg_result["bbox"],
            "timing": {
                "classify_ms": round((classify_time - start_time) * 1000),
                "segment_ms": round((segment_time - classify_time) * 1000),
                "process_ms": round((process_time - segment_time) * 1000),
                "total_ms": round(total_time * 1000),
            },
            "mode": mode,
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


def _image_to_base64(image: Image.Image) -> str:
    """Convert PIL Image to base64 string."""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


# Serve the frontend static files (must be LAST - catches all routes)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
