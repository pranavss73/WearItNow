"""
Garment Segmentation Service
Uses rembg (U2-Net Portable - 4.7MB) to isolate garments from their background.
Includes OpenCV GrabCut / border-color keying fallback for robust zero-dependency offline mode.
"""
import io
import cv2
import numpy as np
from PIL import Image

class GarmentSegmenter:
    """Segments garments from their background using U2-Net Portable or OpenCV."""

    def __init__(self):
        self.session = None
        try:
            from rembg import new_session
            # Use u2netp (lightweight, 4.7MB, near-instant load, 4x faster inference)
            self.session = new_session("u2netp")
            print("  ✓ Segmentation model (U2-Net Portable) loaded")
        except Exception as e:
            print(f"  ℹ️ rembg session initialization noted ({e}). Using OpenCV segmentation fallback.")

    def segment(self, image: Image.Image) -> dict:
        """
        Segment garment from background.

        Args:
            image: PIL Image (RGB or RGBA)

        Returns:
            dict with:
                - 'segmented': RGBA image with transparent background
                - 'mask': Grayscale mask image
                - 'bbox': Bounding box (x, y, w, h) of the garment
        """
        # If already RGBA with existing transparent background, use as is
        if image.mode == "RGBA":
            alpha = np.array(image.split()[-1])
            if (alpha < 200).sum() > (alpha.size * 0.05):
                return self._extract_result(image, Image.fromarray(alpha))

        if image.mode != "RGB":
            image = image.convert("RGB")

        if self.session is not None:
            try:
                from rembg import remove
                segmented = remove(
                    image,
                    session=self.session,
                    alpha_matting=True,
                    alpha_matting_foreground_threshold=240,
                    alpha_matting_background_threshold=15,
                    alpha_matting_erode_size=5,
                )
                mask = segmented.split()[-1]
                return self._extract_result(segmented, mask)
            except Exception as e:
                print(f"rembg removal fallback triggered: {e}")

        # OpenCV Fallback
        return self._opencv_segment(image)

    def _extract_result(self, segmented: Image.Image, mask: Image.Image) -> dict:
        mask_np = np.array(mask)
        coords = np.where(mask_np > 120)

        if len(coords[0]) == 0:
            return {
                "segmented": segmented,
                "mask": mask,
                "bbox": (0, 0, segmented.width, segmented.height),
            }

        y_min, y_max = int(coords[0].min()), int(coords[0].max())
        x_min, x_max = int(coords[1].min()), int(coords[1].max())
        bbox = (x_min, y_min, x_max - x_min, y_max - y_min)

        return {
            "segmented": segmented,
            "mask": mask,
            "bbox": bbox,
        }

    def _opencv_segment(self, image: Image.Image) -> dict:
        """Heuristic background segmentation using edge & color-difference thresholding."""
        rgb = np.array(image)
        h, w = rgb.shape[:2]

        # Sample border pixels to detect dominant background color
        border_pixels = np.concatenate([
            rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]
        ], axis=0)
        bg_color = np.median(border_pixels, axis=0)

        # Color difference from background
        diff = np.linalg.norm(rgb.astype(np.float32) - bg_color.astype(np.float32), axis=2)
        mask = (diff > 25).astype(np.uint8) * 255

        # Morphological clean up
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask_blurred = cv2.GaussianBlur(mask, (5, 5), 0)

        segmented_np = np.dstack([rgb, mask_blurred])
        segmented = Image.fromarray(segmented_np, "RGBA")
        mask_pil = Image.fromarray(mask_blurred, "L")

        return self._extract_result(segmented, mask_pil)
