from app.models import SafetyLevel


SAFETY_PENALTY: dict[SafetyLevel, float] = {
    "green": 0.0,
    "yellow": 0.15,
    "red": 0.35,
    "unknown": 0.1,
}


def composite_score(
    binding_score: float,
    evidence_score: float,
    safety: SafetyLevel,
    confidence_score: float = 0.5,
) -> float:
    raw_score = (
        binding_score * 0.45
        + evidence_score * 0.35
        + confidence_score * 0.20
        - SAFETY_PENALTY[safety]
    )
    return round(max(0, min(raw_score, 1)), 2)

