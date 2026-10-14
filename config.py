# The base URL for Taiko Web, with trailing slash.
BASEDIR = '/'

# The full URL base asset URL, with trailing slash.
ASSETS_BASEURL = '/assets/'

# The full URL base song URL, with trailing slash.
SONGS_BASEURL = '/songs/'

# Multiplayer websocket URL. Defaults to /p2 if blank.
# Local dev: the Flask app cannot serve websockets, so point at server.py directly.
MULTIPLAYER_URL = 'ws://localhost:34802'

# Send static files for custom error pages
ERROR_PAGES = {
    404: ''
}

# The email address to display in the "About Simulator" menu.
EMAIL = None

# Whether to use the user account system.
ACCOUNTS = True

# Custom JavaScript file to load with the simulator.
CUSTOM_JS = ''

# Default plugins to load with the simulator.
PLUGINS = [{
    'url': '',
    'start': False,
    'hide': False
}]

# Filetype to use for song previews. (mp3/ogg)
PREVIEW_TYPE = 'mp3'

# MongoDB server settings.
MONGO = {
    'host': 'mongodb+srv://alfaroeacr_db_user:t2VxnuXFGeQbnBrQ@taiko-cluster.wlgzxhc.mongodb.net/?appName=taiko-cluster',
    'database': 'taiko'
}

# Redis server settings, used for sessions + cache.
# Set to a dict (see config.example.py) to use Redis; None = filesystem sessions + in-memory cache.
REDIS = None

# Secret key used for sessions.
SECRET_KEY = 'change-me'

# Git repository base URL.
URL = 'https://github.com/bui/taiko-web/'

# Google Drive API.
GOOGLE_CREDENTIALS = {
    'gdrive_enabled': False,
    'api_key': '',
    'oauth_client_id': '',
    'project_number': '',
    'min_level': None
}
