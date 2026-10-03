Font caching

The Cloudflare cache rule for /assets/ should cache these files for one year. When replacing a font, save it under a new filename and update the matching @font-face URL in src/app.css. Do not overwrite a file at an existing URL, or visitors may keep using the cached version.
