"""
Texture Processing Service
Extracts, cleans, and prepares garment textures for 3D mapping.
Handles both Quick Mode (OpenCV only) and AI Enhanced Mode.
"""
import cv2
import numpy as np
from PIL import Image


class TextureProcessor:
    """Processes garment images into clean textures for 3D model mapping."""

    def __init__(self):
        print("  ✓ Texture processor initialized")

    def process(
        self, segmented_image: Image.Image, garment_type: str, mode: str = "quick"
    ) -> Image.Image:
        """
        Process a segmented garment image into a clean texture.

        Args:
            segmented_image: RGBA PIL Image (background removed)
            garment_type: one of 'tshirt', 'hoodie', 'formal_shirt', 'jacket'
            mode: 'quick' for fast OpenCV processing, 'ai' for AI enhancement

        Returns:
            Processed texture as PIL Image (RGBA, 512x512)
        """
        img = np.array(segmented_image)

        # Separate RGB and Alpha
        if img.shape[2] == 4:
            rgb = img[:, :, :3]
            alpha = img[:, :, 3]
        else:
            rgb = img
            alpha = np.ones(rgb.shape[:2], dtype=np.uint8) * 255

        # Step 1: Crop to garment bounding box
        rgb, alpha = self._crop_to_content(rgb, alpha)
        if rgb is None:
            return segmented_image

        if mode == "quick":
            rgb = self._quick_process(rgb, alpha)
        else:
            rgb = self._ai_process(rgb, alpha)

        # Step: Combine and resize to texture dimensions (power of 2)
        texture_size = 512
        result = np.dstack([rgb, alpha])
        result_pil = Image.fromarray(result, "RGBA")

        # Resize maintaining aspect ratio, pad to square
        result_pil = self._pad_to_square(result_pil, texture_size)

        return result_pil

    def _crop_to_content(
        self, rgb: np.ndarray, alpha: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        """Crop to the bounding box of non-transparent content."""
        coords = np.where(alpha > 128)
        if len(coords[0]) == 0:
            return None, None

        y_min, y_max = coords[0].min(), coords[0].max()
        x_min, x_max = coords[1].min(), coords[1].max()

        # Add small padding
        pad = 5
        y_min = max(0, y_min - pad)
        y_max = min(rgb.shape[0], y_max + pad)
        x_min = max(0, x_min - pad)
        x_max = min(rgb.shape[1], x_max + pad)

        return rgb[y_min : y_max + 1, x_min : x_max + 1].copy(), alpha[
            y_min : y_max + 1, x_min : x_max + 1
        ].copy()

    def _quick_process(self, rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
        """
        Quick Mode: Fast processing using only OpenCV.
        - Color correction via CLAHE
        - Sharpening via unsharp mask
        - Noise reduction
        """
        # Convert to LAB for better color correction
        lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)

        # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        lab[:, :, 0] = clahe.apply(lab[:, :, 0])

        # Convert back to RGB
        corrected = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)

        # Light noise reduction (preserve texture details)
        denoised = cv2.fastNlMeansDenoisingColored(
            cv2.cvtColor(corrected, cv2.COLOR_RGB2BGR), None, 5, 5, 7, 21
        )
        denoised = cv2.cvtColor(denoised, cv2.COLOR_BGR2RGB)

        # Unsharp masking for sharpening
        gaussian = cv2.GaussianBlur(denoised, (0, 0), 2.0)
        sharpened = cv2.addWeighted(denoised, 1.5, gaussian, -0.5, 0)

        # Only apply to garment region (where alpha > 0)
        mask = (alpha > 128).astype(np.float32)[:, :, np.newaxis]
        result = (sharpened * mask + rgb * (1 - mask)).astype(np.uint8)

        return result

    def _ai_process(self, rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
        """
        AI Enhanced Mode: Additional processing for better quality.
        Uses OpenCV advanced features since we're running locally on RTX 4050.
        Falls back to enhanced quick processing for now.
        """
        # Start with quick processing
        result = self._quick_process(rgb, alpha)

        # Additional AI-inspired enhancements using OpenCV

        # 1. Edge-preserving smoothing (simulates wrinkle reduction)
        smooth = cv2.edgePreservingFilter(result, flags=1, sigma_s=50, sigma_r=0.4)

        # 2. Detail enhancement (simulates texture restoration)
        enhanced = cv2.detailEnhance(result, sigma_s=10, sigma_r=0.15)

        # 3. Blend: 60% enhanced + 40% smooth for balanced result
        blended = cv2.addWeighted(enhanced, 0.6, smooth, 0.4, 0)

        # 4. Final color boost
        hsv = cv2.cvtColor(blended, cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.15, 0, 255)  # Boost saturation
        hsv[:, :, 2] = np.clip(hsv[:, :, 2] * 1.05, 0, 255)  # Slight brightness
        blended = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)

        # Apply only to garment region
        mask = (alpha > 128).astype(np.float32)[:, :, np.newaxis]
        result = (blended * mask + rgb * (1 - mask)).astype(np.uint8)

        return result

    def _pad_to_square(self, image: Image.Image, size: int) -> Image.Image:
        """Resize and pad image to a square of given size, maintaining aspect ratio."""
        # Resize longest side to target size
        w, h = image.size
        if w == 0 or h == 0:
            return Image.new("RGBA", (size, size), (0, 0, 0, 0))

        scale = size / max(w, h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        resized = image.resize((new_w, new_h), Image.LANCZOS)

        # Center on square canvas
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        paste_x = (size - new_w) // 2
        paste_y = (size - new_h) // 2
        canvas.paste(resized, (paste_x, paste_y))

        return canvas
