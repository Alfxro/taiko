# Stub for the real `tjaf` TJA parser (the published package is no longer installable).
# app.py imports this at startup; it is only actually used by the /upload endpoint.
class Tja:
	def __init__(self, *args, **kwargs):
		raise NotImplementedError("tjaf stub: custom song upload (/upload) is not available")
