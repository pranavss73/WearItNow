"""
WearItNow - One-click launcher
Run this file to start the application.
"""
import subprocess
import sys
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

BANNER = """
================================================
          WEARITNOW AR VIRTUAL TRY-ON
================================================
"""

def check_and_install_deps():
    """Check if required packages are installed, install if missing."""
    core_missing = []
    for pkg in ["fastapi", "uvicorn", "cv2", "rembg", "PIL"]:
        try:
            __import__(pkg)
        except ImportError:
            core_missing.append(pkg)

    if core_missing:
        print(f"⚠️  Missing core dependencies: {', '.join(core_missing)}")
        print("\nInstalling core dependencies...")
        print("─" * 50)
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-r",
            os.path.join(os.path.dirname(__file__), "requirements.txt")
        ])
        print("─" * 50)
        print("✅ Dependencies installed successfully.\n")
    else:
        print("✅ All core server & CV dependencies found.")

    try:
        import torch
        import transformers
        print("✅ Deep learning stack (PyTorch + Transformers CLIP) found.")
    except ImportError:
        print("ℹ️  Deep learning stack optional (using built-in feature classifier until torch/transformers installed).")

    return True


def main():
    print(BANNER)

    # Ensure we're in the project directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # Check dependencies
    check_and_install_deps()

    # Pre-download ML models on first run
    print("\n🔄 Checking ML models (first run downloads ~800MB)...")
    try:
        from server.services.classifier import GarmentClassifier
        _ = GarmentClassifier()
        print("✅ Classification model ready.")
    except Exception as e:
        print(f"⚠️  Classification model will download on first use: {e}")

    try:
        from rembg import new_session
        _ = new_session("u2netp")
        print("✅ Segmentation model (U2-Net Portable) ready.")
    except Exception as e:
        print(f"⚠️  Segmentation model note: {e}")

    # Start server
    print("\n" + "═" * 50)
    print("🚀 Starting WearItNow server...")
    print("   Open  →  http://localhost:8000")
    print("   Stop  →  Ctrl+C")
    print("═" * 50 + "\n")

    import uvicorn
    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info"
    )


if __name__ == "__main__":
    main()
