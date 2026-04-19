# xdatamodifyteraconfig.py

# Keywords list
KEYWORDS = ["oyo", "latest", "viral", "hot", "new", "trending", "webseries", "mms", "hotel", "punjabi", "college", "telugu"]

# Target channels for auto-send
TARGET_CHANNELS = [-1003432400529, -1003858031435]

# API settings
SEARCH_API = "https://playterabox.com/api/search-videos"
G3_BASE = "https://playtera.in/?t="
LIMIT = 10
AUTO_LIMIT = 5

# MongoDB Setup
DATABASE_URI = "mongodb+srv://test:test05@cluster0.g05zxpa.mongodb.net/?retryWrites=true&w=majority"
DATABASE_NAME = "Cluster0"

# Offset storage file
OFFSET_FILE = "tera_offset.txt"

# Timings (in seconds)
# How long to wait before deleting search results in private chats
# How long to wait before deleting search results (30 minutes)
AUTO_DELETE_DELAY = 1800 

# How often to run the auto-send task (e.g., 1800s = 30 minutes)
AUTO_SEND_DELAY = 1800 

# Per-user search cooldown (30 minutes)
SEARCH_COOLDOWN = 1800 

# Welcome message sent when a new member joins a group
WELCOME_MSG = "hii baby lo kuch video dekho or hilao 😈🔥"
