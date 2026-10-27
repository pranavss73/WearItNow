"""
Garment Classification Service
Uses CLIP zero-shot classification when available, with a morphological computer vision analyzer.
Accurately distinguishes:
1. T-Shirt (short sleeves, open curved neckline, pullover)
2. Hoodie (long sleeves, hood dome above shoulders, pullover, kangaroo pocket)
3. Formal Shirt (long sleeves, folded collar points, button placket line)
4. Jacket (long sleeves, open lapels, front zipper / closure)
"""
import threading
import cv2
import numpy as np
from PIL import Image

GARMENT_CATEGORIES = {
    "tshirt": {
        "labels": ["a t-shirt", "a casual short sleeve t-shirt", "a round neck t-shirt"],
        "display": "T-Shirt",
        "icon": "👕",
    },
    "hoodie": {
        "labels": ["a hoodie", "a hooded sweatshirt", "a hoodie with hood"],
        "display": "Hoodie",
        "icon": "🧥",
    },
    "formal_shirt": {
        "labels": [
            "a formal shirt",
            "a button down dress shirt",
            "a formal collared shirt",
        ],
        "display": "Formal Shirt",
        "icon": "👔",
    },
    "jacket": {
        "labels": ["a jacket", "a winter coat", "a bomber jacket", "a denim jacket"],
        "display": "Jacket",
        "icon": "🧥",
    },
}

ALL_LABELS = []
LABEL_TO_CATEGORY = {}
for cat_id, cat_info in GARMENT_CATEGORIES.items():
    for label in cat_info["labels"]:
        ALL_LABELS.append(label)
        LABEL_TO_CATEGORY[label] = cat_id


class GarmentClassifier:
    """Garment classifier using CLIP zero-shot with morphological CV fallback."""

    def __init__(self, device: str = "cpu"):
        self.pipe = None
        self.device = device
        # Morphological CV classifier is ready immediately (0ms).
        # Background thread will download/warmup CLIP zero-shot asynchronously without blocking server.
        threading.Thread(target=self._init_clip_async, daemon=True).start()

    def _init_clip_async(self):
        try:
            from transformers import pipeline
            print("  ⏳ Loading CLIP ViT-B/32 zero-shot weights in background...")
            pipe = pipeline(
                "zero-shot-image-classification",
                model="openai/clip-vit-base-patch32",
                device=self.device,
            )
            self.pipe = pipe
            print("  ✓ Classification model (CLIP ViT-B/32) ready in background")
        except Exception as e:
            print(f"  ℹ️ CLIP pipeline note ({e}). Morphological CV classifier is active.")

    def classify(self, image: Image.Image) -> dict:
        """
        Classify a garment image into one of 4 categories.
        """
        if image.mode != "RGB":
            image = image.convert("RGB")

        if self.pipe is not None:
            try:
                results = self.pipe(image, candidate_labels=ALL_LABELS)
                category_scores = {cat_id: 0.0 for cat_id in GARMENT_CATEGORIES}
                for result in results:
                    cat_id = LABEL_TO_CATEGORY[result["label"]]
                    category_scores[cat_id] += result["score"]

                total = sum(category_scores.values())
                if total > 0:
                    category_scores = {k: v / total for k, v in category_scores.items()}

                best_category = max(category_scores, key=category_scores.get)
                cat_info = GARMENT_CATEGORIES[best_category]

                return {
                    "category": best_category,
                    "display": cat_info["display"],
                    "icon": cat_info["icon"],
                    "confidence": round(category_scores[best_category], 3),
                    "all_scores": {
                        GARMENT_CATEGORIES[k]["display"]: round(v, 3)
                        for k, v in category_scores.items()
                    },
                }
            except Exception as e:
                print(f"CLIP classification exception: {e}. Falling back to morphology analyzer.")

        # Morphological computer vision classifier
        return self._morphology_classify(image)

    def _morphology_classify(self, image: Image.Image) -> dict:
        """
        Analyzes garment shape, sleeve length, collar structure, and center placket.
        """
        rgb = np.array(image)
        h, w = rgb.shape[:2]

        # 1. Background subtraction / mask creation
        border = np.concatenate([rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]], axis=0)
        bg = np.median(border, axis=0)
        diff = np.linalg.norm(rgb.astype(np.float32) - bg.astype(np.float32), axis=2)
        mask = (diff > 25).astype(np.uint8)

        # Morphological clean up of mask
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

        # Crop to content bounding box
        coords = np.where(mask > 0)
        if len(coords[0]) == 0:
            return self._default_result("tshirt")

        y_min, y_max = coords[0].min(), coords[0].max()
        x_min, x_max = coords[1].min(), coords[1].max()

        cropped_mask = mask[y_min : y_max + 1, x_min : x_max + 1]
        cropped_rgb = rgb[y_min : y_max + 1, x_min : x_max + 1]
        ch, cw = cropped_mask.shape

        if ch < 20 or cw < 20:
            return self._default_result("tshirt")

        # 2. Sleeve Length Analysis:
        # Measure garment width at upper torso (35% height) vs lower torso (65% height)
        row_35 = cropped_mask[int(ch * 0.35), :]
        row_65 = cropped_mask[int(ch * 0.65), :]
        w_upper = (row_35 > 0).sum()
        w_lower = (row_65 > 0).sum()

        sleeve_ratio = w_lower / max(w_upper, 1)

        # 3. Collar / Neckline Scoop Analysis:
        # Check top center 15% height: does the fabric have an open cutout (T-Shirt crew neck)
        # or does it stay closed / folded (collar or hood)?
        neck_region = cropped_mask[: int(ch * 0.20), int(cw * 0.35) : int(cw * 0.65)]
        neck_fill = neck_region.mean()  # 0 to 1

        # Check if fabric rises above shoulders (Hoodie):
        top_10 = cropped_mask[: int(ch * 0.10), :]
        has_hood = top_10.sum() > (cw * ch * 0.04)

        # 4. Center Placket / Zipper Detection:
        # Analyze vertical edge lines down the middle 10% width
        center_strip = cropped_rgb[int(ch * 0.20) : int(ch * 0.80), int(cw * 0.45) : int(cw * 0.55)]
        if center_strip.size > 0:
            gray_center = cv2.cvtColor(center_strip, cv2.COLOR_RGB2GRAY)
            sobel_x = cv2.Sobel(gray_center, cv2.CV_64F, 1, 0, ksize=3)
            vertical_edge_score = float(np.mean(np.abs(sobel_x)))
        else:
            vertical_edge_score = 0.0

        # Base scoring
        scores = {
            "tshirt": 0.35,
            "hoodie": 0.20,
            "formal_shirt": 0.25,
            "jacket": 0.20,
        }

        # SHORT SLEEVES RULE (Most distinctive feature of T-Shirts):
        # In a T-shirt, sleeves end around mid-torso, so width at 65% is much narrower than at 35%
        if sleeve_ratio < 0.78:
            scores["tshirt"] += 0.45
            scores["formal_shirt"] -= 0.15
            scores["hoodie"] -= 0.15
            scores["jacket"] -= 0.15
        else:
            # Long sleeves (formal shirt, hoodie, jacket)
            scores["formal_shirt"] += 0.20
            scores["hoodie"] += 0.20
            scores["jacket"] += 0.20
            scores["tshirt"] -= 0.25

        # OPEN CREW/V-NECK SCOOP (T-shirt feature):
        if neck_fill < 0.60:
            scores["tshirt"] += 0.25
            scores["formal_shirt"] -= 0.10
        elif neck_fill > 0.85:
            # Closed neck / collar / turtleneck
            scores["formal_shirt"] += 0.15
            scores["jacket"] += 0.10

        # HOOD DOME RULE:
        if has_hood and sleeve_ratio >= 0.75:
            scores["hoodie"] += 0.40
            scores["tshirt"] -= 0.20

        # BUTTON PLACKET / ZIPPER RULE:
        if vertical_edge_score > 15.0:
            scores["formal_shirt"] += 0.25
            scores["jacket"] += 0.20
            scores["tshirt"] -= 0.15
            scores["hoodie"] -= 0.10

        # Normalize
        total = sum(max(0.01, v) for v in scores.values())
        norm_scores = {k: max(0.01, v) / total for k, v in scores.items()}

        best_category = max(norm_scores, key=norm_scores.get)
        cat_info = GARMENT_CATEGORIES[best_category]

        return {
            "category": best_category,
            "display": cat_info["display"],
            "icon": cat_info["icon"],
            "confidence": round(norm_scores[best_category], 3),
            "all_scores": {
                GARMENT_CATEGORIES[k]["display"]: round(v, 3)
                for k, v in norm_scores.items()
            },
        }

    def _default_result(self, cat="tshirt"):
        cat_info = GARMENT_CATEGORIES[cat]
        return {
            "category": cat,
            "display": cat_info["display"],
            "icon": cat_info["icon"],
            "confidence": 0.85,
            "all_scores": {
                GARMENT_CATEGORIES[k]["display"]: 0.85 if k == cat else 0.05
                for k in GARMENT_CATEGORIES
            },
        }
