"""Minimal SMTP email sender for finance month-end reminders.

Configuration is entirely env-var driven so no provider SDK / dependency is
needed:

    SMTP_HOST        e.g. "smtp.gmail.com"           (required — unset ⇒ disabled)
    SMTP_PORT        default "587"
    SMTP_USER        SMTP login (often the from-address)
    SMTP_PASSWORD    SMTP password / app-password
    SMTP_FROM        From: header; defaults to SMTP_USER
    SMTP_STARTTLS    "true" (default) uses STARTTLS on SMTP_PORT;
                     "false" + port 465 uses implicit SSL

Contract (matches fx_fetcher / news_fetcher): never raises. Returns True only if
the message was handed to the SMTP server; logs and returns False otherwise.
"""

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(os.getenv("SMTP_HOST"))


def send_email(
    to: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
) -> bool:
    host = os.getenv("SMTP_HOST")
    if not host:
        logger.info("SMTP_HOST unset — email '%s' not sent", subject)
        return False
    if not to:
        logger.warning("send_email called with no recipient")
        return False

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM") or user or "no-reply@localhost"
    use_starttls = os.getenv("SMTP_STARTTLS", "true").lower() != "false"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    try:
        if use_starttls:
            with smtplib.SMTP(host, port, timeout=20) as server:
                server.starttls(context=ssl.create_default_context())
                if user and password:
                    server.login(user, password)
                server.send_message(msg)
        else:
            with smtplib.SMTP_SSL(host, port, timeout=20,
                                  context=ssl.create_default_context()) as server:
                if user and password:
                    server.login(user, password)
                server.send_message(msg)
        logger.info("Sent email '%s' to %s", subject, to)
        return True
    except Exception as exc:  # noqa: BLE001 - never break the caller
        logger.error("Email send failed ('%s' to %s): %s", subject, to, exc)
        return False
