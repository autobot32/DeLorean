# DeLorean

A virtual memory exhibit that lets you walk through your past in 3D.

DeLorean builds an interactive **Three.js tunnel** stitched together from your uploaded photos.  
As you move through the tunnel, an **AI voice** narrates the story behind each memory —  
and at the end, those moments are woven into one continuous story about you.

---

### 🚀 Features

- Upload personal images to build a 3D memory tunnel
- AI narration for each photo using text-to-speech
- Seamless camera walkthrough with smooth transitions
- Final “life story” audio automatically generated from all memories

### 🛠 Local Dev Setup

- **Server**: `cd server && npm install && npm run dev` (runs Express API on `http://localhost:4000`)
- **Client**: `cd client && npm install && npm run dev` (runs Vite React app on `http://localhost:5173`)
- Configure `CLIENT_ORIGIN` on the server if the frontend runs on a different URL
- API routes: `POST /api/uploads`, `GET /api/uploads`, `DELETE /api/uploads/:id`, `GET /api/message`, `POST /api/echo`, `GET /health`
- `POST /api/uploads` accepts `multipart/form-data` with `images` and optional `context`/`contexts` fields; responses include stored context + stub story metadata
- Uploaded files (including HEIC/HEIF) are normalized to `.webp` via Sharp, saved under `/uploads`, and mirrored in `server/data/uploads.json`
