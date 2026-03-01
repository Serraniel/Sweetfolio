# First Stable Release (1.0.0)

Follow these steps when the product is ready to leave beta.

## Steps

1. In `.releaserc.json`, replace the commit-analyzer plugin config:

   **Before:**
   ```json
   [
     "@semantic-release/commit-analyzer",
     {
       "releaseRules": [
         { "breaking": true, "release": "minor" }
       ]
     }
   ]
   ```

   **After:**
   ```json
   "@semantic-release/commit-analyzer"
   ```

2. Create a commit with a breaking change footer:

   ```
   feat: mark stable release

   BREAKING CHANGE: first stable release
   ```

3. Push to `main`. semantic-release will bump from `0.x.y` to `1.0.0`.

4. After the release is published, delete this guide file and commit:

   ```
   chore: remove first stable release guide
   ```

## After 1.0.0

Breaking changes will automatically trigger major version bumps (`1.x.y` -> `2.0.0`, etc.) via the standard semantic-release behavior.
