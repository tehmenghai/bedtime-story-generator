import os
import time
import logging
from google import genai
from google.genai import types
from google.genai import errors as genai_errors
from fastapi import HTTPException

from app.system_prompt import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL = "gemini-2.5-flash-lite"

client = genai.Client(api_key=GEMINI_API_KEY)
generate_config = types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT)


def call_gemini(question: str, max_retries: int = 2) -> str:
    """
    Call the Gemini API with automatic retry on transient errors.

    Retries up to `max_retries` times with a 1-second back-off between
    attempts.  Raises HTTP 429 for quota exhaustion and HTTP 502 for any
    other unrecoverable API error.
    """
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 2):   # +2 → initial + retries
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=question,
                config=generate_config,
            )
            return response.text

        except genai_errors.APIError as e:
            last_error = e
            status = getattr(e, "code", None) or getattr(e, "status_code", None)

            # 429 = quota / rate-limit — no point retrying immediately
            if status == 429:
                logger.warning("Gemini rate limit hit (attempt %d/%d): %s",
                               attempt, max_retries + 1, e)
                raise HTTPException(
                    status_code=429,
                    detail="Story generation limit reached. Please wait a moment and try again.",
                )

            # Transient / network errors — log and retry
            logger.warning("Gemini API error (attempt %d/%d): %s",
                           attempt, max_retries + 1, e)

            if attempt <= max_retries:
                time.sleep(1)           # brief back-off before retry
            else:
                break                   # exhausted retries

        except Exception as e:
            # Unexpected errors — fail fast, no retry
            last_error = e
            logger.error("Unexpected error calling Gemini: %s", e)
            break

    # All attempts failed
    logger.error("Gemini unreachable after %d attempts: %s", max_retries + 1, last_error)
    raise HTTPException(
        status_code=502,
        detail="Gemini is currently unavailable. Please try again in a few seconds.",
    )
