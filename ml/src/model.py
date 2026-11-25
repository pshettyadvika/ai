from __future__ import annotations

import segmentation_models_pytorch as smp
import torch
import torch.nn as nn


def build_flood_unet(encoder_weights: str | None = "imagenet") -> nn.Module:
    """Build U-Net with ResNet-34 encoder for 2-band Sentinel-1 (VV, VH) segmentation."""
    return smp.Unet(
        encoder_name="resnet34",
        encoder_weights=encoder_weights,
        in_channels=2,
        classes=1,
        activation=None,
    )


class MaskedBCEDiceLoss(nn.Module):
    """Combined Binary Cross-Entropy + Dice Loss ignoring -1 no-data pixels."""

    def __init__(self, bce_weight: float = 0.5, dice_weight: float = 0.5, eps: float = 1e-6) -> None:
        super().__init__()
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight
        self.eps = eps
        self.bce = nn.BCEWithLogitsLoss(reduction="none")

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        # logits: (B, 1, H, W), targets: (B, H, W) with {-1, 0, 1}
        valid_mask = targets != -1
        if valid_mask.sum() == 0:
            return logits.sum() * 0.0

        logits_sq = logits.squeeze(1)
        clean_targets = torch.clamp(targets, min=0).float()

        bce_map = self.bce(logits_sq, clean_targets)
        bce_loss = bce_map[valid_mask].mean()

        probs = torch.sigmoid(logits_sq)
        probs_valid = probs[valid_mask]
        targets_valid = clean_targets[valid_mask]

        intersection = (probs_valid * targets_valid).sum()
        denom = probs_valid.sum() + targets_valid.sum()
        dice_loss = 1.0 - (2.0 * intersection + self.eps) / (denom + self.eps)

        return self.bce_weight * bce_loss + self.dice_weight * dice_loss
