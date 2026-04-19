# configX1.py — Configuration for PromotionSpamBot1 (plugins_promoter_1)
# Edit any value here. No need to touch debug.py.

# ── Channel to check membership after 24 hours ──
CHANNEL_USERNAME = "muvibots"            # without @

# ── Join link shown to users ──
JOIN_LINK = "https://t.me/muvibots"

# ── Join message text (use {JOIN_LINK} to auto-insert the link) ──
JOIN_MESSAGE = "Apko jo chahiye wo yha milega 👇\n{JOIN_LINK}"

# ── Log account (receive status updates) ──
LOG_ID = "@ganeshmrxx"

# ── Timing (all in seconds) ──
DELAY_BEFORE_HI   = 2 * 60     # wait before sending "hi"       (2 minutes)
DELAY_BEFORE_LINK = 2 * 60     # wait after "hi" before link    (2 minutes)
DELAY_NEXT_CHECK  = 24 * 3600  # wait before membership check   (24 hours)
